import dotenv from "dotenv";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import { GoogleGenAI, ThinkingLevel } from "@google/genai";

dotenv.config();

const PORT = 3000;
const isProduction = process.env.NODE_ENV === "production";
const PROVIDER_TIMEOUT_MS = 90000;

const MALA_SOMBRE_SYSTEM_INSTRUCTION = `Você é um Engenheiro Sênior de Motion Graphics e Diretor de Arte. Gere APENAS um arquivo HTML autocontido (Canvas 2D 1920x1080) 100% determinístico via window.seek(t). Sem explicações em texto.

1. CONTRATO DE RENDERIZAÇÃO E ESTRUTURA (A BASE DE TUDO):

Determinismo Absoluto: É PROIBIDO usar setTimeout, setInterval, requestAnimationFrame (para lógica de estado), Date.now() ou Math.random(). Use apenas matemática baseada em t. Se precisar de variação (ex: poeira), use uma função hash determinística (ex: Math.sin(seed * 12.9898) * 43758.5453).

Estrutura: Toda a lógica deve estar dentro de window.seek(t). O código deve ser limpo, comentado e ter no máximo 250 linhas para evitar timeout nos modelos.

Duração: Leia a timeline do roteiro e defina window.DURATION como o último timestamp + 1.5s de respiro.

2. DIREÇÃO DE ARTE E LAYOUT (O PADRÃO VISUAL):

Paleta: Fundo #000000, Roxo Profundo #2a0033, Violeta Luminoso #8a2be2, Branco #ffffff. Fontes: 'Bebas Neue' (títulos) e 'Oswald' (UI/Subtítulos).

Centralização e Alinhamento: O centro da tela é X=960, Y=540. Se o roteiro pedir "no centro", use essas coordenadas ou ctx.translate(960, 540). NUNCA desenhe no (0,0) por acidente. Use ctx.textAlign = 'center' e ctx.textBaseline = 'middle'.

Anti-Vazamento (Layout Seguro): Calcule o tamanho dos textos com ctx.measureText. Nenhum texto ou elemento pode vazar de caixas, painéis ou das bordas da tela (0 a 1920). Nada pode se sobrepor de forma que prejudique a leitura.

3. FÍSICA DE MOVIMENTO E CONTINUIDADE (O FIM DO AMADORISMO):

Movimento Contínuo: É PROIBIDO usar blocos de if isolados para mover objetos (ex: if (t>2 && t<5) x=100; if (t>5) x=500). Calcule uma variável de progresso geral (prog = (t - start) / duration) e use-a matematicamente em todos os frames para mover o objeto de A a B suavemente.

Molas (Springs): Para entradas e transições de elementos, NUNCA use fades ou ease-in-out simples. Use a fórmula de mola amortecida: 1 - Math.exp(-damping * t) * Math.cos(freq * t).

Câmera Parallax: Se o roteiro pedir movimento de câmera (pan/zoom), use ctx.scale e ctx.translate. Crie profundidade movendo as camadas de fundo mais lentamente que as camadas da frente, usando tempos de deslocamento diferentes.

4. COMPONENTES VISUAIS E OTIMIZAÇÃO (ANTI-TIMEOUT):

Abstração Obrigatória: NUNCA tente desenhar pessoas, animais, carros ou cenários realistas. Use formas geométricas, ícones HUD, silhuetas chapadas ou linhas de radar para representar qualquer elemento.

Partículas e Atmosfera: Use um único loop for com no máximo 30 partículas determinísticas. Para névoa e luz (God Rays), use ctx.createLinearGradient e ctx.createRadialGradient com globalCompositeOperation = 'screen'.

Desenho Progressivo de Formas: Se o roteiro pedir uma "linha que se desenha" ou um "círculo que cresce", use a matemática de traçado (ctx.setLineDash com offset ou arcos parciais) para revelar a forma suavemente, em vez de ela aparecer pronta.

5. LEITURA CRONOMETRADA DO ROTEIRO:

Respeite os tempos exatos do [AÇÃO CRONOMETRADA]. Se o roteiro diz que um texto sai aos 5s, ele deve desaparecer aos 5s.

Se o roteiro pedir um "glitch", "shake" ou "impacto", use funções de ruído matemático (como Math.sin(t * 100)) para criar a vibração exata no momento pedido.

6. O LOOP DE CRÍTICA (AUTO-AVALIAÇÃO OBRIGATÓRIA):
Antes de gerar o código HTML final, faça uma checagem mental rigorosa:

O código tem menos de 250 linhas e sem Math.random?

Os textos e elementos estão centralizados e sem vazar das bordas?

O movimento é contínuo e usa física de molas?

O layout está limpo, legível e dentro do padrão de cores MALA.SOMBRE?
Se qualquer resposta for "NÃO", reescreva o código mentalmente antes de enviar.

7. [REGRA DE ÁREA SEGURA E ALINHAMENTO UNIVERSAL (ANTI-CORTE)]

Definição da Área Segura: O Canvas tem dimensões fixas de 1920x1080. É PROIBIDO desenhar elementos principais (textos, formas, trajetórias, ícones) nas extremidades. Considere uma margem de segurança obrigatória de 200 pixels em todos os lados:
- Limite de X permitido para elementos principais: 200 a 1720.
- Limite de Y permitido para elementos principais: 200 a 880.

Movimento e Trajetórias: Se um objeto se mover de um ponto A para um ponto B, as coordenadas de A e B DEVEM estar dentro da área segura (ex: X: 300 a X: 1600). NUNCA use as bordas extremas (0 ou 1920) como ponto de partida ou chegada, a menos que o roteiro exija explicitamente que o elemento saia da tela.

Centralização de Textos: Use ctx.textAlign = 'center' e ctx.textBaseline = 'middle' para centralizar. Se o roteiro pedir um texto no canto, calcule a posição baseada no tamanho do texto (ctx.measureText) para garantir que ele não vaze para fora dos limites da tela (0 a 1920).

Verificação de Contexto: Sempre que usar ctx.translate(x, y), certifique-se de que x e y estão dentro da área segura. Se estiver usando ctx.scale, o centro da escala deve ser o centro da tela (960, 540) para evitar que os elementos sejam empurrados para fora.

Regra do "Loop de Crítica": Antes de enviar o código, faça uma checagem mental: "Se eu desenhar uma caixa delimitadora ao redor dos elementos principais deste frame, ela está totalmente contida dentro dos limites de 200 a 1720 (X) e 200 a 880 (Y)?" Se a resposta for 'não', ajuste as coordenadas.`;

function hasConfiguredApiKey(value: string | undefined): value is string {
  if (!value) return false;
  const trimmed = value.trim();
  if (!trimmed) return false;
  if (trimmed.startsWith("MY_") || trimmed === "YOUR_API_KEY") return false;
  return true;
}

/**
 * Parses timestamps in the script on the backend so we can provide an accurate fallback
 * duration (last timestamp + 1.5s) if a model declares DURATION inside a closed scope.
 */
function inferDurationFromScript(script: string): number | null {
  let maxSeconds = 0;

  const colonRegex = /\b(\d{1,2}):(\d{2})(?:[.,](\d{1,2}))?\b/g;
  let match: RegExpExecArray | null;
  while ((match = colonRegex.exec(script)) !== null) {
    const mins = parseInt(match[1], 10);
    const secs = parseInt(match[2], 10);
    const frac = match[3] ? parseFloat(`0.${match[3]}`) : 0;
    if (secs < 60) {
      const total = mins * 60 + secs + frac;
      if (total > maxSeconds && total <= 600) {
        maxSeconds = total;
      }
    }
  }

  const secondsRegex =
    /(?:^|[^\d:])(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:s|seg|segs|segundo|segundos)\b/gi;
  while ((match = secondsRegex.exec(script)) !== null) {
    const val = parseFloat(match[1].replace(",", "."));
    if (Number.isFinite(val) && val > maxSeconds && val <= 600) {
      maxSeconds = val;
    }
  }

  const rangeRegex =
    /\b(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:-|–|—|até|a)\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:s|seg|segundos)?\b/gi;
  while ((match = rangeRegex.exec(script)) !== null) {
    const endVal = parseFloat(match[2].replace(",", "."));
    const startVal = parseFloat(match[1].replace(",", "."));
    if (
      Number.isFinite(startVal) &&
      Number.isFinite(endVal) &&
      endVal >= startVal &&
      endVal <= 600 &&
      endVal > maxSeconds
    ) {
      maxSeconds = endVal;
    }
  }

  if (maxSeconds > 0) {
    return Number((maxSeconds + 1.5).toFixed(2));
  }

  return null;
}

/**
 * Inspects generated HTML code to extract any declared DURATION constant if present in local scope.
 */
function inferDurationFromHtmlCode(html: string): number | null {
  const durationRegex =
    /(?:window\.DURATION|const\s+DURATION|let\s+DURATION|var\s+DURATION|TOTAL_DURATION)\s*=\s*(\d+(?:\.\d+)?)/i;
  const match = html.match(durationRegex);
  if (match && match[1]) {
    const parsed = parseFloat(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

function extractCleanHtml(rawText: string): string {
  // Strip reasoning blocks (<think>...</think>) emitted by reasoning models such as DeepSeek-R1
  let cleaned = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

  // If a fenced ```html ... ``` block exists, prefer its inner content
  const fencedMatch = cleaned.match(/```(?:html|HTML)\s*\n([\s\S]*?)```/);
  if (fencedMatch && fencedMatch[1]) {
    cleaned = fencedMatch[1].trim();
  } else {
    cleaned = cleaned.replace(/^```(?:html|HTML)?\s*\n?/i, "");
    cleaned = cleaned.replace(/\n?```\s*$/i, "");
  }

  const doctypeIndex = cleaned.search(/<!doctype\s+html>/i);
  const htmlTagIndex = cleaned.search(/<html[\s>]/i);
  const startIndex =
    doctypeIndex !== -1 ? doctypeIndex : htmlTagIndex !== -1 ? htmlTagIndex : 0;

  const lowerCleaned = cleaned.toLowerCase();
  const lastCloseHtml = lowerCleaned.lastIndexOf("</html>");
  if (lastCloseHtml !== -1 && lastCloseHtml >= startIndex) {
    cleaned = cleaned.slice(startIndex, lastCloseHtml + "</html>".length);
  } else if (startIndex > 0) {
    cleaned = cleaned.slice(startIndex);
  }

  return cleaned.trim();
}

function isValidMotionHtml(html: string): boolean {
  if (!html || html.length < 80) return false;
  const hasDocumentOrCanvas =
    /<html[\s>]/i.test(html) ||
    /<!doctype\s+html>/i.test(html) ||
    /<canvas[\s>]/i.test(html);
  const hasScript = /<script[\s>]/i.test(html);
  return hasDocumentOrCanvas && hasScript;
}

function createGeminiClient(apiKey: string): GoogleGenAI {
  return new GoogleGenAI({
    apiKey: apiKey.trim(),
    httpOptions: {
      headers: {
        "User-Agent": "aistudio-build",
      },
    },
  });
}

function refreshEnvFromDotenvFile(): void {
  try {
    const envPath = path.join(process.cwd(), ".env");
    if (!fs.existsSync(envPath)) return;
    const parsed = dotenv.parse(fs.readFileSync(envPath, "utf8"));
    for (const [key, val] of Object.entries(parsed)) {
      if (hasConfiguredApiKey(val)) {
        process.env[key] = val.trim();
      }
    }
  } catch {
    // Ignora falhas de leitura do .env e mantém process.env atual
  }
}

async function generateWithGeminiModel(
  apiKey: string,
  model: string,
  systemInstruction: string,
  userPrompt: string
): Promise<string> {
  const ai = createGeminiClient(apiKey);
  const response = await ai.models.generateContent({
    model,
    contents: userPrompt,
    config: {
      systemInstruction,
      thinkingConfig: { thinkingLevel: ThinkingLevel.LOW },
      abortSignal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
    },
  });
  return response.text ?? "";
}

interface SingleModelChatOptions {
  endpoint: string;
  apiKey: string;
  model: string;
  providerLabel: string;
  systemInstruction: string;
  userPrompt: string;
  extraHeaders?: Record<string, string>;
}

interface OpenAIChatCompletionResponse {
  model?: string;
  choices?: Array<{
    message?: {
      content?: string | null;
    };
  }>;
  error?: {
    message?: string;
  };
}

const OPENROUTER_FREE_ROUTER_MODEL = "openrouter/free";
const NVIDIA_NIM_REINFORCEMENT_MODEL = "nvidia/nemotron-3-ultra-550b-a55b";

async function generateWithSingleOpenAICompatibleModel(
  options: SingleModelChatOptions
): Promise<string> {
  const {
    endpoint,
    apiKey,
    model,
    providerLabel,
    systemInstruction,
    userPrompt,
    extraHeaders,
  } = options;

  const payload = {
    model,
    stream: false,
    messages: [
      { role: "system", content: systemInstruction },
      { role: "user", content: userPrompt },
    ],
  };

  const response = await fetch(endpoint, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${apiKey.trim()}`,
      "Content-Type": "application/json",
      Accept: "application/json",
      ...(extraHeaders ?? {}),
    },
    body: JSON.stringify(payload),
    signal: AbortSignal.timeout(PROVIDER_TIMEOUT_MS),
  });

  if (!response.ok) {
    const errText = await response.text().catch(() => "");
    throw new Error(
      `${providerLabel} HTTP ${response.status}: ${errText.slice(0, 240)}`
    );
  }

  const data = (await response.json()) as OpenAIChatCompletionResponse;
  if (data.error?.message) {
    throw new Error(`${providerLabel} API Error: ${data.error.message}`);
  }

  const content = data.choices?.[0]?.message?.content;
  if (!content || typeof content !== "string") {
    throw new Error(`${providerLabel} retornou resposta vazia.`);
  }

  return content;
}

/**
 * Executa a cascata com timeout de 90s por etapa:
 * 1º (Prioridade Principal - Google Gemini): "gemini-3.8-flash" usando GEMINI_API_KEY2 (fallback GEMINI_API_KEY)
 * 2º (1ª Reserva - OpenRouter Free Router): "openrouter/free" via OPENROUTER_API_KEY
 * 3º (2ª Reserva - NVIDIA NIM): "nvidia/nemotron-3-ultra-550b-a55b" via NVIDIA_API_KEY
 */
async function generateMotionHtmlWithCascade(userPrompt: string): Promise<string> {
  refreshEnvFromDotenvFile();
  const failureLogs: string[] = [];

  // 1. Prioridade Principal (Tentativa 1): Gemini 3.8 Flash usando GEMINI_API_KEY2 (90s timeout)
  const geminiKey =
    (hasConfiguredApiKey(process.env.GEMINI_API_KEY2)
      ? process.env.GEMINI_API_KEY2
      : undefined) || process.env.GEMINI_API_KEY;

  if (hasConfiguredApiKey(geminiKey)) {
    try {
      const raw = await generateWithGeminiModel(
        geminiKey,
        "gemini-3.8-flash",
        MALA_SOMBRE_SYSTEM_INSTRUCTION,
        userPrompt
      );
      const html = extractCleanHtml(raw);
      if (!isValidMotionHtml(html)) {
        throw new Error("HTML retornado pelo Gemini 3.8 Flash é incompleto ou inválido.");
      }
      return html;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        "[Prioridade 1 - Gemini] Gemini 3.8 Flash falhou/timeout (pulando para OpenRouter Free):",
        msg
      );
      failureLogs.push(`Gemini 3.8 Flash: ${msg}`);
    }
  } else {
    console.warn(
      "[Prioridade 1 - Gemini] Pulando Gemini 3.8 Flash: GEMINI_API_KEY2 / GEMINI_API_KEY não configurada."
    );
  }

  // 2. 1ª Reserva (Tentativa 2): Roteador Automático Gratuito do OpenRouter ("openrouter/free", 90s timeout)
  if (hasConfiguredApiKey(process.env.OPENROUTER_API_KEY)) {
    try {
      const raw = await generateWithSingleOpenAICompatibleModel({
        endpoint: "https://openrouter.ai/api/v1/chat/completions",
        apiKey: process.env.OPENROUTER_API_KEY,
        model: OPENROUTER_FREE_ROUTER_MODEL,
        providerLabel: "OpenRouter Free Router",
        systemInstruction: MALA_SOMBRE_SYSTEM_INSTRUCTION,
        userPrompt,
        extraHeaders: {
          "HTTP-Referer": process.env.APP_URL || "http://localhost:3000",
          "X-Title": "Mala.Sombre Motion Studio",
        },
      });
      const html = extractCleanHtml(raw);
      if (!isValidMotionHtml(html)) {
        throw new Error("HTML retornado pelo OpenRouter Free Router é incompleto ou inválido.");
      }
      return html;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[Reserva 2 - OpenRouter] ${OPENROUTER_FREE_ROUTER_MODEL} falhou/timeout (pulando para NVIDIA):`,
        msg
      );
      failureLogs.push(`OpenRouter (${OPENROUTER_FREE_ROUTER_MODEL}): ${msg}`);
    }
  } else {
    console.warn(
      "[Reserva 2 - OpenRouter] Pulando OpenRouter: OPENROUTER_API_KEY não configurada."
    );
  }

  // 3. 2ª Reserva (Tentativa 3): NVIDIA NIM direto (nvidia/nemotron-3-ultra-550b-a55b, 90s timeout)
  if (hasConfiguredApiKey(process.env.NVIDIA_API_KEY)) {
    try {
      const raw = await generateWithSingleOpenAICompatibleModel({
        endpoint: "https://integrate.api.nvidia.com/v1/chat/completions",
        apiKey: process.env.NVIDIA_API_KEY,
        model: NVIDIA_NIM_REINFORCEMENT_MODEL,
        providerLabel: "NVIDIA NIM",
        systemInstruction: MALA_SOMBRE_SYSTEM_INSTRUCTION,
        userPrompt,
      });
      const html = extractCleanHtml(raw);
      if (!isValidMotionHtml(html)) {
        throw new Error("HTML retornado pela NVIDIA NIM é incompleto ou inválido.");
      }
      return html;
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      console.warn(
        `[Reserva 3 - NVIDIA] ${NVIDIA_NIM_REINFORCEMENT_MODEL} falhou/timeout:`,
        msg
      );
      failureLogs.push(`NVIDIA NIM (${NVIDIA_NIM_REINFORCEMENT_MODEL}): ${msg}`);
    }
  } else {
    console.warn(
      "[Reserva 3 - NVIDIA] Pulando NVIDIA NIM direto: NVIDIA_API_KEY não configurada."
    );
  }

  console.error(
    "[Cascade Fallback] Todos os provedores falharam ou estavam indisponíveis:",
    failureLogs
  );
  throw new Error("ALL_PROVIDERS_FAILED");
}

/**
 * Embeds JSZip via CDN, dynamic window.DURATION normalization, standalone playback runner,
 * and a self-contained "Baixar Frames" button into the generated HTML.
 */
function injectFrameExporter(
  cleanHtml: string,
  scriptEstimatedDuration: number | null
): string {
  const codeInferredDuration = inferDurationFromHtmlCode(cleanHtml);
  const fallbackDuration =
    codeInferredDuration ?? scriptEstimatedDuration ?? 10;

  const jszipCdnTag = `<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>`;

  const rafGuardScript = `<script id="malasombre-raf-guard">
(function() {
  var origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attrs) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
      attrs = Object.assign({}, attrs || {}, { preserveDrawingBuffer: true });
    }
    return origGetContext.call(this, type, attrs);
  };
  var origRAF = window.requestAnimationFrame.bind(window);
  window.__msRawRAF = origRAF;
  window.__msCapturingFrames = false;
  window.__msAiRegisteredRAF = false;
  window.__msFallbackDuration = ${fallbackDuration};
  window.requestAnimationFrame = function(cb) {
    window.__msAiRegisteredRAF = true;
    return origRAF(function(ts) {
      if (window.__msCapturingFrames) {
        window.requestAnimationFrame(cb);
        return;
      }
      cb(ts);
    });
  };
})();
</script>`;

  const exporterWidget = `
<style id="malasombre-frames-style">
  #ms-download-frames-btn {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 99999;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 15px;
    border-radius: 10px;
    border: 1px solid rgba(138, 43, 226, 0.55);
    background: rgba(13, 9, 20, 0.86);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    color: #f3eff8;
    font-family: 'Oswald', system-ui, -apple-system, sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.65), 0 0 16px rgba(138, 43, 226, 0.25);
    transition: background 150ms ease, border-color 150ms ease, transform 150ms ease;
    user-select: none;
  }
  #ms-download-frames-btn:hover:not(:disabled) {
    background: #2a0033;
    border-color: #8a2be2;
  }
  #ms-download-frames-btn:disabled {
    cursor: wait;
    opacity: 0.92;
  }
  #ms-download-frames-btn svg {
    width: 15px;
    height: 15px;
    stroke: #a855f7;
    flex-shrink: 0;
  }
</style>
<button id="ms-download-frames-btn" type="button" title="Exportar sequência PNG a 60 FPS em .zip">
  <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
  <span id="ms-download-frames-label">Baixar Frames</span>
</button>
<script id="malasombre-frames-exporter">
(function() {
  var btn = document.getElementById('ms-download-frames-btn');
  var labelEl = document.getElementById('ms-download-frames-label');
  var isExporting = false;

  function parsePositiveNumber(val) {
    if (typeof val === 'number' && isFinite(val) && val > 0) return val;
    if (typeof val === 'string') {
      var parsed = parseFloat(val.replace(',', '.'));
      if (isFinite(parsed) && parsed > 0) return parsed;
    }
    return null;
  }

  function resolveSeekFn() {
    if (typeof window.seek === 'function') return window.seek.bind(window);
    try {
      if (typeof seek === 'function') return seek;
    } catch (_e) {}
    return null;
  }

  function resolveDuration() {
    var fromWin =
      parsePositiveNumber(window.DURATION) ||
      parsePositiveNumber(window.duration) ||
      parsePositiveNumber(window.TOTAL_DURATION);
    if (fromWin) {
      window.DURATION = fromWin;
      return fromWin;
    }
    try {
      if (typeof DURATION !== 'undefined') {
        var fromLexical = parsePositiveNumber(DURATION);
        if (fromLexical) {
          window.DURATION = fromLexical;
          return fromLexical;
        }
      }
    } catch (_e) {}
    var fb = parsePositiveNumber(window.__msFallbackDuration) || 10;
    window.DURATION = fb;
    return fb;
  }

  // Ensure window.DURATION is exposed immediately and drive standalone playback if opened outside Studio
  function initStandaloneAndDuration() {
    var dur = resolveDuration();
    var seekFn = resolveSeekFn();
    if (!window.__msStudioControlled && !window.__msAiRegisteredRAF && seekFn) {
      var lastTs = null;
      var currentT = 0;
      function standaloneLoop(ts) {
        if (!window.__msCapturingFrames && !window.__msStudioControlled) {
          dur = resolveDuration();
          if (lastTs === null) lastTs = ts;
          var dt = Math.min(0.1, Math.max(0, (ts - lastTs) / 1000));
          lastTs = ts;
          currentT = (currentT + dt) % dur;
          try {
            seekFn(currentT);
          } catch (_err) {}
        } else {
          lastTs = ts;
        }
        window.__msRawRAF(standaloneLoop);
      }
      window.__msRawRAF(standaloneLoop);
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initStandaloneAndDuration, 0);
  } else {
    window.addEventListener('DOMContentLoaded', initStandaloneAndDuration);
  }

  function notifyParent(payload) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(payload, '*');
    }
  }

  function canvasToPngBlob(canvas) {
    return new Promise(function(resolve, reject) {
      canvas.toBlob(function(blob) {
        if (blob) resolve(blob);
        else reject(new Error('Falha ao capturar frame do Canvas.'));
      }, 'image/png');
    });
  }

  async function exportAllFrames() {
    if (isExporting) return;

    if (typeof window.JSZip !== 'function') {
      labelEl.textContent = 'Erro: JSZip indisponível';
      notifyParent({
        type: 'MALASOMBRE_EXPORT_STATUS',
        active: false,
        error: 'Biblioteca JSZip via CDN não pôde ser carregada.'
      });
      setTimeout(function() { labelEl.textContent = 'Baixar Frames'; }, 3000);
      return;
    }

    var allCanvases = Array.prototype.slice.call(document.querySelectorAll('canvas'));
    var seekFn = resolveSeekFn();

    if (allCanvases.length === 0 || !seekFn) {
      labelEl.textContent = 'Canvas/seek(t) ausente';
      notifyParent({
        type: 'MALASOMBRE_EXPORT_STATUS',
        active: false,
        error: 'Elemento Canvas ou função window.seek(t) não encontrados na cena.'
      });
      setTimeout(function() { labelEl.textContent = 'Baixar Frames'; }, 3000);
      return;
    }

    allCanvases.sort(function(a, b) {
      var za = parseInt(window.getComputedStyle(a).zIndex, 10);
      var zb = parseInt(window.getComputedStyle(b).zIndex, 10);
      if (isNaN(za)) za = 0;
      if (isNaN(zb)) zb = 0;
      return za - zb;
    });

    var compositeCanvas = null;
    var compositeCtx = null;
    if (allCanvases.length > 1) {
      compositeCanvas = document.createElement('canvas');
      compositeCanvas.width = allCanvases[0].width || 1920;
      compositeCanvas.height = allCanvases[0].height || 1080;
      compositeCtx = compositeCanvas.getContext('2d');
    }

    isExporting = true;
    window.__msCapturingFrames = true;
    btn.disabled = true;

    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      var duration = resolveDuration();
      var fps = 60;
      var step = 1 / fps;
      var totalSteps = Math.ceil(duration * fps - 1e-9);
      var totalFrames = totalSteps + 1;
      var zip = new window.JSZip();

      for (var i = 0; i <= totalSteps; i++) {
        var t = Math.min(duration, i * step);
        seekFn(t);

        var targetCanvas = allCanvases[0];
        if (compositeCanvas && compositeCtx) {
          compositeCtx.clearRect(0, 0, compositeCanvas.width, compositeCanvas.height);
          for (var cIdx = 0; cIdx < allCanvases.length; cIdx++) {
            var layer = allCanvases[cIdx];
            if (layer.width > 0 && layer.height > 0 && window.getComputedStyle(layer).display !== 'none') {
              compositeCtx.drawImage(layer, 0, 0, compositeCanvas.width, compositeCanvas.height);
            }
          }
          targetCanvas = compositeCanvas;
        }

        var frameBlob = await canvasToPngBlob(targetCanvas);
        var frameName = 'frame_' + String(i).padStart(5, '0') + '.png';
        zip.file(frameName, frameBlob, { compression: 'STORE' });

        if (i % 5 === 0 || i === totalSteps) {
          var pct = Math.round(((i + 1) / totalFrames) * 100);
          labelEl.textContent = 'Capturando ' + (i + 1) + '/' + totalFrames + ' (' + pct + '%)';
          notifyParent({
            type: 'MALASOMBRE_EXPORT_STATUS',
            active: true,
            phase: 'capturing',
            current: i + 1,
            total: totalFrames,
            percent: pct
          });
          await new Promise(function(r) { setTimeout(r, 0); });
        }
      }

      labelEl.textContent = 'Compactando .zip...';
      notifyParent({
        type: 'MALASOMBRE_EXPORT_STATUS',
        active: true,
        phase: 'zipping',
        current: totalFrames,
        total: totalFrames,
        percent: 100
      });

      var zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'STORE'
      });

      if (window.__msParentHandlesDownload && window.parent && window.parent !== window) {
        notifyParent({
          type: 'MALASOMBRE_ZIP_READY',
          blob: zipBlob,
          filename: 'mala-sombre-frames-60fps.zip'
        });
      } else {
        var downloadUrl = URL.createObjectURL(zipBlob);
        var anchor = document.createElement('a');
        anchor.href = downloadUrl;
        anchor.download = 'mala-sombre-frames-60fps.zip';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        setTimeout(function() { URL.revokeObjectURL(downloadUrl); }, 10000);
      }

      labelEl.textContent = 'Frames Baixados';
      notifyParent({
        type: 'MALASOMBRE_EXPORT_STATUS',
        active: false,
        phase: 'done',
        current: totalFrames,
        total: totalFrames,
        percent: 100
      });
      setTimeout(function() {
        if (!isExporting) labelEl.textContent = 'Baixar Frames';
      }, 2200);
    } catch (err) {
      console.error('Erro ao exportar frames:', err);
      labelEl.textContent = 'Erro na Captura';
      notifyParent({
        type: 'MALASOMBRE_EXPORT_STATUS',
        active: false,
        error: err && err.message ? err.message : 'Erro ao exportar frames.'
      });
      setTimeout(function() {
        if (!isExporting) labelEl.textContent = 'Baixar Frames';
      }, 3000);
    } finally {
      window.__msCapturingFrames = false;
      isExporting = false;
      btn.disabled = false;
    }
  }

  btn.addEventListener('click', exportAllFrames);

  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'MALASOMBRE_CMD_EXPORT_FRAMES') {
      exportAllFrames();
    }
  });
})();
</script>`;

  let output = cleanHtml;

  const hasJsZipAlready = /jszip(?:\.min)?\.js/i.test(output);
  const headAdditions = `${hasJsZipAlready ? "" : `${jszipCdnTag}\n`}${rafGuardScript}`;

  if (/<head[^>]*>/i.test(output)) {
    output = output.replace(/<head[^>]*>/i, (match) => `${match}\n${headAdditions}`);
  } else {
    output = `${headAdditions}\n${output}`;
  }

  if (!output.includes('id="ms-download-frames-btn"')) {
    if (/<\/body>/i.test(output)) {
      output = output.replace(/<\/body>/i, `${exporterWidget}\n</body>`);
    } else {
      output = `${output}\n${exporterWidget}`;
    }
  }

  return output;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  const publicDir = path.join(process.cwd(), "public");
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  app.use(express.static(publicDir));

  app.post("/api/logo", (req: Request, res: Response) => {
    try {
      const { dataUrl } = req.body as { dataUrl?: string };
      if (!dataUrl || typeof dataUrl !== "string") {
        res.status(400).json({ error: "Imagem inválida." });
        return;
      }

      const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (!matches) {
        res.status(400).json({ error: "Formato de imagem não suportado." });
        return;
      }

      const buffer = Buffer.from(matches[2], "base64");
      const targetPath = path.join(publicDir, "logotipo.png");
      fs.writeFileSync(targetPath, buffer);

      if (isProduction) {
        const distPath = path.join(process.cwd(), "dist", "logotipo.png");
        if (fs.existsSync(path.dirname(distPath))) {
          fs.writeFileSync(distPath, buffer);
        }
      }

      res.json({ ok: true, path: "/logotipo.png" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao salvar logotipo.";
      res.status(500).json({ error: message });
    }
  });

  // Main motion graphic generation endpoint with 5-tier Cascade Fallback and Dynamic Duration
  app.post("/api/generate", async (req: Request, res: Response) => {
    req.setTimeout(360_000);
    res.setTimeout(360_000);
    try {
      const { script } = req.body as { script?: string };

      if (!script || typeof script !== "string" || !script.trim()) {
        res.status(400).json({
          error: "Por favor, insira um roteiro antes de gerar a animação.",
        });
        return;
      }

      const trimmedScript = script.trim();
      const scriptDurationHint = inferDurationFromScript(trimmedScript);

      const durationHintLine =
        scriptDurationHint !== null
          ? `\nOBSERVAÇÃO DE DURAÇÃO DETECTADA: O último timestamp identificado no roteiro aponta para uma duração total recomendada de aproximadamente ${scriptDurationHint}s (último timestamp + 1.5s de respiro). Defina window.DURATION dinamicamente de acordo com o fim real do roteiro + 1.5s.`
          : `\nOBSERVAÇÃO DE DURAÇÃO DINÂMICA: Calcule e defina window.DURATION dinamicamente com base no último timestamp do roteiro + 1.5s de respiro (nunca fixe em 12s).`;

      const userPrompt = `ROTEIRO PARA ANIMAR (Design System Universal MALA.SOMBRE — Canvas 2D 1920x1080 100% determinístico via window.seek(t), no máximo 250 linhas totais):
"""
${trimmedScript}
"""
${durationHintLine}

Gere o arquivo HTML autocontido, limpo e comentado agora (no máximo 250 linhas totais). Retorne APENAS o código HTML.`;

      const cleanHtml = await generateMotionHtmlWithCascade(userPrompt);
      const htmlWithFrameExporter = injectFrameExporter(
        cleanHtml,
        scriptDurationHint
      );

      res.json({ html: htmlWithFrameExporter });
    } catch (_error: unknown) {
      res.status(503).json({
        error:
          "Não foi possível gerar o motion graphic no momento pois todos os provedores de IA estão temporariamente indisponíveis. Aguarde alguns instantes e tente novamente.",
      });
    }
  });

  // Catch-all for unmatched /api/* routes and middleware errors so /api never returns HTML
  app.all("/api/*", (_req: Request, res: Response) => {
    res.status(404).json({ error: "Rota da API não encontrada." });
  });

  app.use(
    (err: unknown, req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) {
        console.error("Erro de middleware na API:", err);
        res
          .status(500)
          .json({ error: "Erro interno no servidor. Tente novamente." });
        return;
      }
      next(err);
    }
  );

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Mala.Sombre Motion Studio rodando em http://0.0.0.0:${PORT}`);
  });
  httpServer.requestTimeout = 360_000;
  httpServer.headersTimeout = 365_000;
}

startServer();
