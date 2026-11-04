import { Type } from "@google/genai";
import type { Schema } from "@google/genai";
import {
  computeApprovalStatus,
  createStableId,
  recalculateStoryboardTimeline,
} from "../src/shared/motionStudioContracts.ts";
import type {
  ArtDirectionPlan,
  DirectGenerateRequest,
  ExecutionDiagnosticsSummary,
  MotionQualityAuditReport,
  PlanStoryboardRequest,
  ProjectContextMemory,
  RegenerateSceneRequest,
  RegenerateSceneResponse,
  RenderTechnology,
  StoryboardScene,
  StreamProgressEvent,
  StyleId,
} from "../src/shared/motionStudioContracts.ts";
import {
  formatDetailedStyleSpecs,
  formatStyleCatalogOverview,
  getStyleById,
  isValidStyleId,
  recommendStylesForScript,
} from "../src/shared/styleLibrary.ts";
import { analyzeAdaptiveScriptTiming } from "../src/utils/scriptDuration.ts";
import {
  PROFESSIONAL_ANIMATION_PRINCIPLES,
  SELF_EVALUATION_CHECKLIST,
  STUDIO_CREATIVE_COUNCIL_DOCTRINE,
  getTechnologyExecutionGuide,
} from "./animationKnowledge.ts";
import {
  executeProviderCascade,
  hasConfiguredApiKey,
  refreshEnvFromDotenvFile,
} from "./providerCascade.ts";
import type { CascadeSimulationMap } from "./providerCascade.ts";
import {
  analyzeScriptCreativeProfile,
  auditMotionHtmlQuality,
} from "./qualityEvaluator.ts";
import type { QualityAuditContext } from "./qualityEvaluator.ts";

export { hasConfiguredApiKey, refreshEnvFromDotenvFile };

export interface CascadeRunContext {
  clientSignal?: AbortSignal;
  simulationFaults?: CascadeSimulationMap;
  onProgressEvent?: (event: StreamProgressEvent) => void;
  initialStageMessage?: string;
}

export function extractCleanHtml(rawText: string): string {
  let cleaned = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();

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

export function isValidMotionHtml(html: string): boolean {
  if (!html || html.length < 180) return false;
  const hasStageSurface =
    /<html[\s>]/i.test(html) ||
    /<!doctype\s+html>/i.test(html) ||
    /<canvas[\s>]/i.test(html) ||
    /<svg[\s>]/i.test(html);
  const hasScript = /<script[\s>]/i.test(html);
  const hasSeek = /\bseek\s*[=(]/i.test(html);
  return hasStageSurface && hasScript && hasSeek;
}

function extractCleanJsonString(rawText: string): string {
  let cleaned = rawText.replace(/<think>[\s\S]*?<\/think>/gi, "").trim();
  const fencedJson = cleaned.match(/```(?:json|JSON)?\s*\n([\s\S]*?)```/);
  if (fencedJson && fencedJson[1]) {
    cleaned = fencedJson[1].trim();
  }
  const firstBrace = cleaned.indexOf("{");
  const lastBrace = cleaned.lastIndexOf("}");
  if (firstBrace !== -1 && lastBrace !== -1 && lastBrace > firstBrace) {
    return cleaned.slice(firstBrace, lastBrace + 1);
  }
  return cleaned;
}

function emitCustomStageProgress(
  context: CascadeRunContext | undefined,
  operation: string,
  generationId: string,
  message: string
): void {
  if (!context?.onProgressEvent || context.clientSignal?.aborted) return;
  context.onProgressEvent({
    type: "provider_progress",
    generationId,
    operation,
    timestamp: new Date().toISOString(),
    message,
  });
}

/**
 * Executa a cascata resiliente de provedores (1. Gemini -> 2. OpenRouter -> 3. NVIDIA NIM)
 * para gerar HTML determinístico validado com `window.seek(t)`.
 */
export async function executeHtmlCascade(
  systemInstruction: string,
  userPrompt: string,
  operation: string = "generate_html",
  context?: CascadeRunContext
): Promise<{ html: string; diagnostics: ExecutionDiagnosticsSummary }> {
  const outcome = await executeProviderCascade<string>({
    operation,
    mode: "html",
    initialStageMessage: context?.initialStageMessage,
    systemInstruction,
    userPrompt,
    maxOutputTokens: 12288,
    clientSignal: context?.clientSignal,
    onProgressEvent: context?.onProgressEvent,
    simulationFaults: context?.simulationFaults,
    validateAndTransform: (rawText, providerId) => {
      const html = extractCleanHtml(rawText);
      if (!isValidMotionHtml(html)) {
        throw new Error(
          `HTML retornado por ${providerId} está incompleto ou sem contrato determinístico window.seek(t).`
        );
      }
      return html;
    },
  });

  return {
    html: outcome.value,
    diagnostics: outcome.diagnostics,
  };
}

/**
 * Executa avaliação objetiva pré-entrega (10 critérios verificáveis) e, caso detecte
 * pobreza geométrica, ausência de hierarquia, câmera estática, não-determinismo ou duração incompatível,
 * aciona uma passagem automática de refinamento artístico/técnico antes de entregar ao navegador.
 */
async function evaluateAndRefineHtmlIfNeeded(options: {
  initialHtml: string;
  initialDiagnostics: ExecutionDiagnosticsSummary;
  auditContext: QualityAuditContext;
  originalScript: string;
  systemInstruction: string;
  operation: string;
  context?: CascadeRunContext;
}): Promise<{
  html: string;
  diagnostics: ExecutionDiagnosticsSummary;
  qualityAudit: MotionQualityAuditReport;
}> {
  const {
    initialHtml,
    initialDiagnostics,
    auditContext,
    originalScript,
    systemInstruction,
    operation,
    context,
  } = options;

  emitCustomStageProgress(
    context,
    operation,
    initialDiagnostics.generationId,
    "Avaliando qualidade da composição, hierarquia tipográfica, vetores e determinismo..."
  );

  const initialAuditFull = auditMotionHtmlQuality(initialHtml, auditContext);
  const { criticalDeficiencies, ...initialReport } = initialAuditFull;

  if (
    initialReport.passed ||
    criticalDeficiencies.length === 0 ||
    context?.clientSignal?.aborted ||
    Boolean(context?.simulationFaults)
  ) {
    return {
      html: initialHtml,
      diagnostics: initialDiagnostics,
      qualityAudit: initialReport,
    };
  }

  emitCustomStageProgress(
    context,
    operation,
    initialDiagnostics.generationId,
    "Refinando direção de arte, ilustrações vetoriais compostas, câmera virtual e determinismo..."
  );

  const refinementPrompt = `AUDITORIA DE QUALIDADE DE ESTÚDIO IDENTIFICOU DEFICIÊNCIAS NO RASCUNHO HTML ABAIXO.
Sua missão como Diretor de Arte Sênior e Engenheiro de Motion Design é REESCREVER e ELEVAR este HTML para padrão broadcast/documental, corrigindo integralmente todos os pontos abaixo sem perder nenhum conteúdo do roteiro:

DEFICIÊNCIAS OBRIGATÓRIAS A CORRIGIR AGORA:
${criticalDeficiencies.map((d, i) => `${i + 1}. ${d}`).join("\n")}

ROTEIRO ORIGINAL DO PROJETO:
"""
${originalScript}
"""

HTML INICIAL A SER ELEVADO E CORRIGIDO:
\`\`\`html
${initialHtml}
\`\`\`

Entregue APENAS o documento \`<!DOCTYPE html>\` completo, corrigido, visualmente sofisticado e 100% determinístico via \`window.seek(t)\`.`;

  try {
    const refined = await executeHtmlCascade(
      systemInstruction,
      refinementPrompt,
      `${operation}_refinement`,
      {
        ...context,
        initialStageMessage:
          "Elevando acabamento vetorial, composição editorial, câmera e transições...",
      }
    );

    const refinedAuditFull = auditMotionHtmlQuality(refined.html, auditContext);
    const { criticalDeficiencies: _unused, ...refinedReport } = refinedAuditFull;

    const initialPassedCount = initialReport.criteria.filter((c) => c.passed).length;
    const refinedPassedCount = refinedReport.criteria.filter((c) => c.passed).length;

    // Adota a versão refinada se ela resolveu mais critérios ou manteve/superou a estrutura
    if (refinedPassedCount >= initialPassedCount) {
      return {
        html: refined.html,
        diagnostics: {
          ...refined.diagnostics,
          durationMs: initialDiagnostics.durationMs + refined.diagnostics.durationMs,
          attemptsCount:
            initialDiagnostics.attemptsCount + refined.diagnostics.attemptsCount,
        },
        qualityAudit: {
          ...refinedReport,
          refinementApplied: true,
        },
      };
    }
  } catch {
    // Caso a passagem extra de refinamento sofra timeout ou erro transitório, entrega o HTML válido inicial auditado
  }

  return {
    html: initialHtml,
    diagnostics: initialDiagnostics,
    qualityAudit: initialReport,
  };
}

/**
 * Executa a cascata resiliente de provedores para planejamento estruturado JSON
 * (Direção de Arte, Storyboard e Regeneração de Cena).
 */
async function executeJsonCascade<T>(
  systemInstruction: string,
  userPrompt: string,
  geminiSchema: Schema,
  parseAndValidate: (parsed: unknown) => T,
  operation: string = "plan_json",
  context?: CascadeRunContext
): Promise<{ data: T; diagnostics: ExecutionDiagnosticsSummary }> {
  const outcome = await executeProviderCascade<T>({
    operation,
    mode: "json",
    initialStageMessage: context?.initialStageMessage,
    systemInstruction,
    userPrompt,
    jsonFallbackReminder:
      "IMPORTANTE: Retorne EXCLUSIVAMENTE um objeto JSON válido seguindo exatamente os campos pedidos (sem texto antes ou depois, sem blocos markdown).",
    geminiSchema,
    maxOutputTokens: 12288,
    clientSignal: context?.clientSignal,
    onProgressEvent: context?.onProgressEvent,
    simulationFaults: context?.simulationFaults,
    validateAndTransform: (rawText) => {
      const cleanJson = extractCleanJsonString(rawText);
      const parsed = JSON.parse(cleanJson) as unknown;
      return parseAndValidate(parsed);
    },
  });

  return {
    data: outcome.value,
    diagnostics: outcome.diagnostics,
  };
}

function normalizeRenderTechnology(
  val: unknown,
  fallback: RenderTechnology
): RenderTechnology {
  if (
    val === "canvas2d" ||
    val === "svg" ||
    val === "html-css" ||
    val === "hybrid"
  ) {
    return val;
  }
  return fallback;
}

function normalizeHexColor(val: unknown, fallback: string): string {
  if (typeof val === "string" && /^#[0-9a-fA-F]{3,8}$/.test(val.trim())) {
    return val.trim();
  }
  return fallback;
}

// Schema estruturado para Planejamento Completo (Diretor Criativo + Planejador de Storyboard Cinematográfico)
const STORYBOARD_PLAN_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    artDirection: {
      type: Type.OBJECT,
      properties: {
        themeAndSubject: { type: Type.STRING },
        communicationObjective: { type: Type.STRING },
        emotionalTone: { type: Type.STRING },
        targetAudience: { type: Type.STRING },
        narrativePacing: { type: Type.STRING },
        primaryStyleId: { type: Type.STRING },
        complementaryStyleIds: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        styleRationale: { type: Type.STRING },
        renderTechnology: { type: Type.STRING },
        colorPalette: {
          type: Type.OBJECT,
          properties: {
            background: { type: Type.STRING },
            surface: { type: Type.STRING },
            primary: { type: Type.STRING },
            secondary: { type: Type.STRING },
            accent: { type: Type.STRING },
            text: { type: Type.STRING },
            paletteRationale: { type: Type.STRING },
          },
          required: [
            "background",
            "surface",
            "primary",
            "secondary",
            "accent",
            "text",
            "paletteRationale",
          ],
        },
        typography: {
          type: Type.OBJECT,
          properties: {
            displayFont: { type: Type.STRING },
            bodyFont: { type: Type.STRING },
            monoFont: { type: Type.STRING },
            hierarchyRules: { type: Type.STRING },
          },
          required: ["displayFont", "bodyFont", "monoFont", "hierarchyRules"],
        },
        recurringElements: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        characterSpecs: { type: Type.STRING },
        compositionRules: { type: Type.STRING },
      },
      required: [
        "themeAndSubject",
        "communicationObjective",
        "emotionalTone",
        "targetAudience",
        "narrativePacing",
        "primaryStyleId",
        "complementaryStyleIds",
        "styleRationale",
        "renderTechnology",
        "colorPalette",
        "typography",
        "recurringElements",
        "characterSpecs",
        "compositionRules",
      ],
    },
    scenes: {
      type: Type.ARRAY,
      items: {
        type: Type.OBJECT,
        properties: {
          title: { type: Type.STRING },
          narrativeObjective: { type: Type.STRING },
          duration: { type: Type.NUMBER },
          styleId: { type: Type.STRING },
          visualDescription: { type: Type.STRING },
          presentElements: {
            type: Type.ARRAY,
            items: { type: Type.STRING },
          },
          layoutAndHierarchy: { type: Type.STRING },
          onScreenText: { type: Type.STRING },
          motionAndAnimation: { type: Type.STRING },
          cameraMovement: { type: Type.STRING },
          visualLayering: { type: Type.STRING },
          entryTransition: { type: Type.STRING },
          exitTransition: { type: Type.STRING },
          continuityNotes: { type: Type.STRING },
        },
        required: [
          "title",
          "narrativeObjective",
          "duration",
          "styleId",
          "visualDescription",
          "presentElements",
          "layoutAndHierarchy",
          "onScreenText",
          "motionAndAnimation",
          "cameraMovement",
          "visualLayering",
          "entryTransition",
          "exitTransition",
          "continuityNotes",
        ],
      },
    },
  },
  required: ["artDirection", "scenes"],
};

const REGENERATE_SCENE_SCHEMA: Schema = {
  type: Type.OBJECT,
  properties: {
    scene: {
      type: Type.OBJECT,
      properties: {
        title: { type: Type.STRING },
        narrativeObjective: { type: Type.STRING },
        duration: { type: Type.NUMBER },
        styleId: { type: Type.STRING },
        visualDescription: { type: Type.STRING },
        presentElements: {
          type: Type.ARRAY,
          items: { type: Type.STRING },
        },
        layoutAndHierarchy: { type: Type.STRING },
        onScreenText: { type: Type.STRING },
        motionAndAnimation: { type: Type.STRING },
        cameraMovement: { type: Type.STRING },
        visualLayering: { type: Type.STRING },
        entryTransition: { type: Type.STRING },
        exitTransition: { type: Type.STRING },
        continuityNotes: { type: Type.STRING },
      },
      required: [
        "title",
        "narrativeObjective",
        "duration",
        "styleId",
        "visualDescription",
        "presentElements",
        "layoutAndHierarchy",
        "onScreenText",
        "motionAndAnimation",
        "cameraMovement",
        "visualLayering",
        "entryTransition",
        "exitTransition",
        "continuityNotes",
      ],
    },
    neighborImpactNotes: {
      type: Type.ARRAY,
      items: { type: Type.STRING },
    },
  },
  required: ["scene", "neighborImpactNotes"],
};

/**
 * PAPEL A + B: Conselho Criativo de 7 Especialistas e Planejador de Storyboard (Modo B).
 */
export async function planStoryboardWithAI(
  req: PlanStoryboardRequest,
  context?: CascadeRunContext
): Promise<{
  project: ProjectContextMemory;
  diagnostics: ExecutionDiagnosticsSummary;
}> {
  const trimmedScript = req.script.trim();
  const timingAnalysis = analyzeAdaptiveScriptTiming(trimmedScript);
  const estimatedDuration = timingAnalysis?.durationSeconds ?? 18;
  const profile = analyzeScriptCreativeProfile(
    trimmedScript,
    estimatedDuration,
    Boolean(timingAnalysis?.hasExplicitTimestamps)
  );
  const candidateStyles = recommendStylesForScript(trimmedScript, 5);
  const preferredOverride =
    req.preferredStyleId &&
    req.preferredStyleId !== "auto" &&
    isValidStyleId(req.preferredStyleId)
      ? req.preferredStyleId
      : null;

  const fallbackPrimaryStyle: StyleId =
    preferredOverride ?? candidateStyles[0]?.id ?? "explainer-videos";

  const systemInstruction = `Você atua como uma Equipe Sênior de Estúdio de Motion Design (Diretor de Arte, Diretor de Motion Design, Designer Gráfico Editorial, Especialista em Visualização de Dados, Ilustrador Vetorial 2D/2.5D/3D, Diretor de Fotografia/Câmera e Designer de Tipografia Cinética).

Sua missão é interpretar semanticamente o roteiro, exercer AUTONOMIA CRIATIVA ALTA e projetar uma Direção de Arte editorial/cinematográfica + um Storyboard profissional cena a cena em português.

REGRAS INEGOCIÁVEIS:
1. FIDELIDADE AO CONTEÚDO E TRANSPARÊNCIA DE DADOS:
   - Preserve 100% da intenção original, todos os tópicos conceituais listados, textos obrigatórios, números, fatos e sequência lógica.
   - Se a cena pedir gráficos ou indicadores e o roteiro não fornecer estatísticas numéricas específicas com fonte, planeje valores didáticos coerentes e inclua explicitamente a observação "Valores ilustrativos" — jamais invente estatísticas reais falsas.
2. PROIBIÇÃO DE SIMPLISMO GEOMÉTRICO:
   - Em \`visualDescription\` e \`presentElements\`, especifique ilustrações vetoriais ricas e compostas (arquitetura detalhada, silhuetas articuladas, diagramas Sankey/circulares, gráficos com eixos, escalas, unidades e callouts), proibindo retângulos/círculos genéricos como substitutos de objetos reais.
3. ESCOLHA ESPECIALIZADA DE ESTILOS (30 ESTILOS DISPONÍVEIS):
${formatStyleCatalogOverview()}
   - Escolha \`primaryStyleId\` usando exatamente um dos IDs entre colchetes acima${
     preferredOverride
       ? ` (O usuário solicitou explicitamente o estilo principal "${preferredOverride}" — respeite essa escolha!)`
       : ""
   }.
   - Combine até 2 \`complementaryStyleIds\` quando enriquecer cenas de dados, fluxogramas ou aberturas cinematográficas.
4. PALETA E TIPOGRAFIA GUIADAS PELO CONTEÚDO:
   - Escolha cores hexadecimais (#RRGGBB) apropriadas ao tema, público e estilo escolhido (NÃO obrigue todas as animações a serem pretas e roxas; adapte entre estética editorial clara, marinho/ouro institucional, sépia documental, técnico-científica ou cinematográfica escura conforme o assunto). Se o usuário especificar cores, elas prevalecem.
   - Escolha fontes reais do Google Fonts na regra 2+1 (Display expressiva + Corpo legível + Mono tabular para dados).
5. CÂMERA, PROFUNDIDADE EM 3 CAMADAS E CONTINUIDADE:
   - Defina em cada cena \`cameraMovement\` (dolly-in, camera pan, camera tracking acompanhando fluxos, pull-back panorâmico) e \`visualLayering\` (Fundo atmosférico/grid 0.25x + Plano médio de gráficos/ilustrações 0.65x + Primeiro plano tipográfico/callouts 1.0x).
   - Conecte cada cena à seguinte com match-cuts, wipes por máscara ou transformação contínua de elementos.
6. DURAÇÃO ADAPTATIVA REALISTA:
   - Planeje entre ${profile.recommendedMinScenes} e ${profile.recommendedMaxScenes} cenas bem desenvolvidas, totalizando aproximadamente ${profile.recommendedMinDuration}s a ${profile.recommendedMaxDuration}s (referência central: ~${estimatedDuration}s), dando tempo real para leitura, construção de gráficos e respiro dramático.`;

  const keyTopicsLine =
    profile.extractedKeyTopics.length > 0
      ? `- Tópicos/pilares obrigatórios identificados no roteiro (garanta cobertura dedicada e clara na progressão das cenas): ${profile.extractedKeyTopics.join(" | ")}\n`
      : "";

  const userPrompt = `ROTEIRO DO PROJETO:
"""
${trimmedScript}
"""
${req.creativeNotes?.trim() ? `\nDIRETRIZES / RESTRIÇÕES EXTRAS DO USUÁRIO:\n"${req.creativeNotes.trim()}"\n` : ""}
DIAGNÓSTICO SEMÂNTICO E DE COMPLEXIDADE:
- Duração estimada recomendada: ~${estimatedDuration}s (faixa ideal: ${profile.recommendedMinDuration}s–${profile.recommendedMaxDuration}s; ${timingAnalysis?.rationale ?? "duração adaptativa"})
- Quantidade recomendada de cenas: ${profile.recommendedMinScenes} a ${profile.recommendedMaxScenes} cenas progressivas
${keyTopicsLine}- Exige visualização de dados/indicadores: ${profile.requiresDataVisualization ? "SIM (planeje gráficos autênticos com eixos, unidades e callouts)" : "Conforme necessário"}
- Exige fluxograma/sistema conectado: ${profile.requiresFlowchartOrSystemDiagram ? "SIM (planeje fluxo circular/Sankey de conexões vivas)" : "Conforme necessário"}
- Estilos candidatos de maior afinidade: ${candidateStyles
    .map((s) => `${s.id} (${s.name})`)
    .join(", ")}

Elabore a Direção de Arte completa e divida o roteiro em cenas ricas, cinematográficas e contínuas.`;

  const result = await executeJsonCascade(
    systemInstruction,
    userPrompt,
    STORYBOARD_PLAN_SCHEMA,
    (raw) => {
      if (!raw || typeof raw !== "object") {
        throw new Error("Planejamento JSON inválido.");
      }
      const obj = raw as Record<string, unknown>;
      const rawAd = (obj.artDirection ?? {}) as Record<string, unknown>;
      const rawScenes = Array.isArray(obj.scenes) ? obj.scenes : [];
      if (rawScenes.length === 0) {
        throw new Error("Storyboard retornado sem cenas.");
      }

      const primaryStyleId: StyleId = preferredOverride
        ? preferredOverride
        : isValidStyleId(rawAd.primaryStyleId)
          ? rawAd.primaryStyleId
          : fallbackPrimaryStyle;

      const primarySpec = getStyleById(primaryStyleId);

      const complementaryStyleIds: StyleId[] = Array.isArray(
        rawAd.complementaryStyleIds
      )
        ? rawAd.complementaryStyleIds
            .filter(
              (id): id is StyleId => isValidStyleId(id) && id !== primaryStyleId
            )
            .slice(0, 3)
        : [];

      const rawPal = (rawAd.colorPalette ?? {}) as Record<string, unknown>;
      const rawTypo = (rawAd.typography ?? {}) as Record<string, unknown>;

      const artDirection: ArtDirectionPlan = {
        themeAndSubject: String(
          rawAd.themeAndSubject || "Animação Editorial e Cinematográfica"
        ).trim(),
        communicationObjective: String(
          rawAd.communicationObjective ||
            "Comunicar a mensagem central com clareza visual, rigor gráfico e impacto narrativo."
        ).trim(),
        emotionalTone: String(
          rawAd.emotionalTone || "Editorial, claro e cinematográfico"
        ).trim(),
        targetAudience: String(
          rawAd.targetAudience || "Público geral interessado no tema"
        ).trim(),
        narrativePacing: String(
          rawAd.narrativePacing ||
            "Progressivo em capítulos com entradas dinâmicas e respiro para leitura"
        ).trim(),
        primaryStyleId,
        complementaryStyleIds,
        styleRationale: String(
          rawAd.styleRationale ||
            `Selecionado ${primarySpec.name} pela aderência narrativa e analítica.`
        ).trim(),
        renderTechnology: normalizeRenderTechnology(
          rawAd.renderTechnology,
          primarySpec.preferredTechnology
        ),
        colorPalette: {
          background: normalizeHexColor(rawPal.background, "#0B1220"),
          surface: normalizeHexColor(rawPal.surface, "#131F35"),
          primary: normalizeHexColor(rawPal.primary, "#38BDF8"),
          secondary: normalizeHexColor(rawPal.secondary, "#F59E0B"),
          accent: normalizeHexColor(rawPal.accent, "#10B981"),
          text: normalizeHexColor(rawPal.text, "#F8FAFC"),
          paletteRationale: String(
            rawPal.paletteRationale ||
              "Alto contraste editorial alinhado à atmosfera temática do roteiro."
          ).trim(),
        },
        typography: {
          displayFont: String(rawTypo.displayFont || "Fraunces").trim(),
          bodyFont: String(rawTypo.bodyFont || "Plus Jakarta Sans").trim(),
          monoFont: String(rawTypo.monoFont || "JetBrains Mono").trim(),
          hierarchyRules: String(
            rawTypo.hierarchyRules ||
              "3 níveis: Kicker/Capítulo em caixa alta 14px, Título Hero 56–72px e Dados Tabulares em fonte monoespaçada."
          ).trim(),
        },
        recurringElements: Array.isArray(rawAd.recurringElements)
          ? rawAd.recurringElements.map((e) => String(e).trim()).filter(Boolean)
          : [],
        characterSpecs: String(
          rawAd.characterSpecs ||
            "Ativos vetoriais compostos em múltiplas camadas, ícones arquitetônicos e fluxos luminosos."
        ).trim(),
        compositionRules: String(
          rawAd.compositionRules ||
            "Grid editorial de 12 colunas (1920×1080), 3 planos de profundidade com parallax e continuidade por match-cut."
        ).trim(),
      };

      const initialScenes: StoryboardScene[] = rawScenes.map((item, idx) => {
        const sc = (item ?? {}) as Record<string, unknown>;
        const sceneStyle: StyleId = isValidStyleId(sc.styleId)
          ? sc.styleId
          : primaryStyleId;
        const rawDur =
          typeof sc.duration === "number"
            ? sc.duration
            : Number(sc.duration) || 5.5;
        return {
          id: createStableId(`sc${idx + 1}`),
          order: idx + 1,
          title: String(sc.title || `Cena ${idx + 1}`).trim(),
          narrativeObjective: String(
            sc.narrativeObjective || "Avançar a narrativa visual"
          ).trim(),
          startTime: 0,
          endTime: 0,
          duration: Math.max(1.8, Math.min(45, rawDur)),
          styleId: sceneStyle,
          visualDescription: String(sc.visualDescription || "").trim(),
          presentElements: Array.isArray(sc.presentElements)
            ? sc.presentElements.map((el) => String(el).trim()).filter(Boolean)
            : [],
          layoutAndHierarchy: String(
            sc.layoutAndHierarchy ||
              "Grid editorial de 12 colunas dentro da área segura com ponto focal claro."
          ).trim(),
          onScreenText: String(sc.onScreenText ?? "").trim(),
          motionAndAnimation: String(
            sc.motionAndAnimation ||
              "Revelação por máscara tipográfica, construção progressiva por trim-path e stagger de indicadores."
          ).trim(),
          cameraMovement: String(
            sc.cameraMovement ||
              "Dolly-in suave com leve parallax multi-plano em direção ao ponto focal."
          ).trim(),
          visualLayering: String(
            sc.visualLayering ||
              "Fundo atmosférico com malha editorial (0.25x), diagrama/ilustração vetorial principal (0.65x) e tipografia/KPIs em primeiro plano (1.0x)."
          ).trim(),
          entryTransition: String(
            sc.entryTransition || "Match-cut geométrico / wipe por máscara"
          ).trim(),
          exitTransition: String(
            sc.exitTransition || "Continuidade de câmera e transformação de forma"
          ).trim(),
          continuityNotes: String(
            sc.continuityNotes || "Conecta-se organicamente à próxima cena."
          ).trim(),
          approved: false,
        };
      });

      const { scenes, timeline } = recalculateStoryboardTimeline(
        initialScenes,
        artDirection
      );

      const project: ProjectContextMemory = {
        projectId: createStableId("proj"),
        originalScript: trimmedScript,
        creativeNotes: req.creativeNotes?.trim() ?? "",
        preferredStyleOverride: preferredOverride ?? "auto",
        artDirection,
        scenes,
        timeline,
        approvalStatus: computeApprovalStatus(scenes),
        approvedDecisions: [
          `Estilo principal definido: ${getStyleById(primaryStyleId).name}`,
          `Tecnologia de renderização: ${artDirection.renderTechnology}`,
          `Arquitetura narrativa: ${scenes.length} cenas (${timeline.totalDuration.toFixed(1)}s)`,
        ],
        updatedAtIso: new Date().toISOString(),
      };

      return project;
    },
    "storyboard_plan",
    {
      ...context,
      initialStageMessage:
        context?.initialStageMessage ??
        "Analisando roteiro e planejando direção de arte e storyboard...",
    }
  );

  return {
    project: result.data,
    diagnostics: result.diagnostics,
  };
}

/**
 * Regenera individualmente uma cena preservando a Memória do Projeto e a continuidade com cenas vizinhas.
 */
export async function regenerateSceneWithAI(
  req: RegenerateSceneRequest,
  context?: CascadeRunContext
): Promise<RegenerateSceneResponse> {
  const { project, sceneId, instruction, requestedStyleId } = req;
  const targetIndex = project.scenes.findIndex((s) => s.id === sceneId);
  if (targetIndex === -1) {
    throw new Error(
      "Cena solicitada para regeneração não foi encontrada pelo identificador estável."
    );
  }

  const currentScene = project.scenes[targetIndex];
  const prevScene = targetIndex > 0 ? project.scenes[targetIndex - 1] : null;
  const nextScene =
    targetIndex < project.scenes.length - 1
      ? project.scenes[targetIndex + 1]
      : null;

  const targetStyleId: StyleId =
    requestedStyleId && isValidStyleId(requestedStyleId)
      ? requestedStyleId
      : currentScene.styleId;

  const styleSpecDetails = formatDetailedStyleSpecs([
    project.artDirection.primaryStyleId,
    targetStyleId,
  ]);

  const systemInstruction = `Você é o Diretor de Arte, Diretor de Fotografia e Especialista em Motion Design responsável por REGENERAR UMA ÚNICA CENA de um Storyboard existente sem quebrar a consistência do filme.

REGRAS DE MEMÓRIA, RIQUEZA VISUAL E CONSISTÊNCIA:
1. Preserve o significado do roteiro original, textos/dados obrigatórios e a Direção de Arte global (paleta ${project.artDirection.colorPalette.background} / ${project.artDirection.colorPalette.primary} / ${project.artDirection.colorPalette.accent}, tipografia ${project.artDirection.typography.displayFont} + ${project.artDirection.typography.bodyFont} + ${project.artDirection.typography.monoFont}, elementos recorrentes e características de entidades).
2. Mantenha conexão fluida com a cena anterior (${prevScene ? `"${prevScene.title}" — saída: ${prevScene.exitTransition}` : "Início do vídeo"}) e com a cena posterior (${nextScene ? `"${nextScene.title}" — entrada: ${nextScene.entryTransition}` : "Encerramento do vídeo"}).
3. Proponha ilustrações vetoriais compostas detalhadas, hierarquia tipográfica clara, movimento de câmera intencional (\`cameraMovement\`) e 3 camadas de profundidade (\`visualLayering\`), proibindo formas primitivas cruas.
4. Informe em \`neighborImpactNotes\` observações curtas caso a nova duração ou transição sugira atenção às cenas vizinhas.

ESPECIFICAÇÃO DO ESTILO DA CENA:
${styleSpecDetails}`;

  const userPrompt = `ROTEIRO ORIGINAL DO PROJETO:
"""
${project.originalScript}
"""

MEMÓRIA DA DIREÇÃO DE ARTE GLOBAL:
- Tema: ${project.artDirection.themeAndSubject}
- Objetivo: ${project.artDirection.communicationObjective}
- Tom: ${project.artDirection.emotionalTone}
- Elementos Recorrentes: ${project.artDirection.recurringElements.join(", ") || "Nenhum específico"}
- Especificação de Personagens/Entidades: ${project.artDirection.characterSpecs}

CONTEXTO VIZINHO:
- Cena Anterior: ${
    prevScene
      ? `[Cena ${prevScene.order}: ${prevScene.title}] Visual: ${prevScene.visualDescription} | Saída: ${prevScene.exitTransition}`
      : "Nenhuma (esta é a Cena 1 de abertura)"
  }
- CENA ALVO ATUAL (ID: ${currentScene.id}, Ordem ${currentScene.order}):
  Título atual: ${currentScene.title}
  Objetivo: ${currentScene.narrativeObjective}
  Duração atual: ${currentScene.duration}s
  Texto em tela atual: ${currentScene.onScreenText || "(sem texto)"}
  Visual atual: ${currentScene.visualDescription}
  Câmera atual: ${currentScene.cameraMovement || "Dolly suave"}
- Cena Seguinte: ${
    nextScene
      ? `[Cena ${nextScene.order}: ${nextScene.title}] Visual: ${nextScene.visualDescription} | Entrada: ${nextScene.entryTransition}`
      : "Nenhuma (esta é a última cena de fechamento)"
  }

ESTILO SOLICITADO PARA ESTA CENA: ${targetStyleId} (${getStyleById(targetStyleId).name})
SOLICITAÇÃO DO USUÁRIO PARA A REGENERAÇÃO:
"${instruction?.trim() || "Crie uma concepção visual editorial, vetorialmente rica e cinematográfica superior para esta cena, mantendo continuidade perfeita com o projeto."}"`;

  const regenData = await executeJsonCascade(
    systemInstruction,
    userPrompt,
    REGENERATE_SCENE_SCHEMA,
    (raw) => {
      if (!raw || typeof raw !== "object") {
        throw new Error("Resposta inválida ao regenerar cena.");
      }
      const obj = raw as Record<string, unknown>;
      const sc = (obj.scene ?? {}) as Record<string, unknown>;
      const notes = Array.isArray(obj.neighborImpactNotes)
        ? obj.neighborImpactNotes.map((n) => String(n).trim()).filter(Boolean)
        : [];

      const rawDur =
        typeof sc.duration === "number"
          ? sc.duration
          : Number(sc.duration) || currentScene.duration;

      const updatedScene: StoryboardScene = {
        id: currentScene.id,
        order: currentScene.order,
        title: String(sc.title || currentScene.title).trim(),
        narrativeObjective: String(
          sc.narrativeObjective || currentScene.narrativeObjective
        ).trim(),
        startTime: currentScene.startTime,
        endTime: currentScene.endTime,
        duration: Math.max(1.8, Math.min(45, rawDur)),
        styleId: isValidStyleId(sc.styleId) ? sc.styleId : targetStyleId,
        visualDescription: String(
          sc.visualDescription || currentScene.visualDescription
        ).trim(),
        presentElements: Array.isArray(sc.presentElements)
          ? sc.presentElements.map((e) => String(e).trim()).filter(Boolean)
          : currentScene.presentElements,
        layoutAndHierarchy: String(
          sc.layoutAndHierarchy || currentScene.layoutAndHierarchy
        ).trim(),
        onScreenText: String(
          sc.onScreenText ?? currentScene.onScreenText
        ).trim(),
        motionAndAnimation: String(
          sc.motionAndAnimation || currentScene.motionAndAnimation
        ).trim(),
        cameraMovement: String(
          sc.cameraMovement ||
            currentScene.cameraMovement ||
            "Dolly-in suave com parallax multi-plano."
        ).trim(),
        visualLayering: String(
          sc.visualLayering ||
            currentScene.visualLayering ||
            "Fundo atmosférico (0.25x), diagrama vetorial composto (0.65x) e tipografia cinética (1.0x)."
        ).trim(),
        entryTransition: String(
          sc.entryTransition || currentScene.entryTransition
        ).trim(),
        exitTransition: String(
          sc.exitTransition || currentScene.exitTransition
        ).trim(),
        continuityNotes: String(
          sc.continuityNotes || currentScene.continuityNotes
        ).trim(),
        approved: false,
      };

      return { updatedScene, notes };
    },
    "storyboard_regenerate_scene",
    {
      ...context,
      initialStageMessage:
        context?.initialStageMessage ??
        "Analisando cenas vizinhas e regenerando cena selecionada...",
    }
  );

  const nextScenesInput = project.scenes.map((s) =>
    s.id === sceneId ? regenData.data.updatedScene : s
  );

  const { scenes, timeline } = recalculateStoryboardTimeline(
    nextScenesInput,
    project.artDirection
  );

  const updatedProject: ProjectContextMemory = {
    ...project,
    scenes,
    timeline,
    approvalStatus: computeApprovalStatus(scenes),
    updatedAtIso: new Date().toISOString(),
  };

  return {
    project: updatedProject,
    regeneratedSceneId: sceneId,
    neighborImpactNotes: regenData.data.notes,
    diagnostics: regenData.diagnostics,
  };
}

/**
 * MODO A — Geração Direta com Conselho Criativo de 7 Especialistas, Blueprint Cinematográfico e Auditoria Pré-Entrega.
 */
export async function generateDirectMotionWithAI(
  req: DirectGenerateRequest,
  context?: CascadeRunContext
): Promise<{
  html: string;
  estimatedDuration: number;
  selectedStyleIds: StyleId[];
  renderTechnology: RenderTechnology;
  diagnostics: ExecutionDiagnosticsSummary;
  qualityAudit: MotionQualityAuditReport;
}> {
  const trimmedScript = req.script.trim();
  const timing = analyzeAdaptiveScriptTiming(trimmedScript);
  const estimatedDuration = timing?.durationSeconds ?? 18;
  const profile = analyzeScriptCreativeProfile(
    trimmedScript,
    estimatedDuration,
    Boolean(timing?.hasExplicitTimestamps)
  );

  const explicitStyle =
    req.preferredStyleId &&
    req.preferredStyleId !== "auto" &&
    isValidStyleId(req.preferredStyleId)
      ? req.preferredStyleId
      : null;

  const recommended = recommendStylesForScript(trimmedScript, 4);
  const activeStyleIds: StyleId[] = explicitStyle
    ? [
        explicitStyle,
        ...recommended
          .map((s) => s.id)
          .filter((id) => id !== explicitStyle)
          .slice(0, 2),
      ]
    : recommended.slice(0, 3).map((s) => s.id);

  const primarySpec = getStyleById(activeStyleIds[0]);
  const preferredTech = primarySpec.preferredTechnology;

  const systemInstruction = `Você é o Motor Criativo e Cinematográfico Principal do MALA.SOMBRE Motion Studio.
Entregue APENAS um único arquivo \`<!DOCTYPE html>\` autocontido (1920×1080, proporção 16:9) 100% determinístico controlado por \`window.seek(t)\` e \`window.DURATION\`, sem qualquer texto fora do HTML.

${STUDIO_CREATIVE_COUNCIL_DOCTRINE}

FICHAS TÉCNICAS DOS ESTILOS DE MAIOR AFINIDADE PARA ESTE ROTEIRO:
${formatDetailedStyleSpecs(activeStyleIds)}

${PROFESSIONAL_ANIMATION_PRINCIPLES}

${getTechnologyExecutionGuide(preferredTech)}

${SELF_EVALUATION_CHECKLIST}

## ENGENHARIA PROCEDURAL E ORIENTADA A DADOS DE ALTA RIQUEZA VISUAL
- Gere código modular, denso em riqueza visual e sem repetição inchada (~340 a 560 linhas limpas):
  1. No \`<head>\`, inclua Google Fonts reais (regra 2+1) + \`<script type="application/json" id="ms-director-blueprint">\` compacto com as 10 decisões criativas.
  2. Construa uma biblioteca reutilizável de ativos vetoriais compostos (\`<defs><g id="asset-...">\` com curvas Bezier \`<path d="M... C... Q...">\`, gradientes, telhados, janelas, colunas, navios, engrenagens, balanças, silhuetas ou funções vetoriais procedurais equivalentes no Canvas 2D) + helpers matemáticos puros (\`clamp01\`, \`segProg\`, \`easeOutCubic\`, \`easeOutQuint\`, \`easeInOutCubic\`, \`lerp\`, \`hash01\`, \`bezierPoint\`).
  3. Modele as cenas em um array estruturado \`SCENES\` e use renderizadores procedurais reutilizáveis para grid editorial de 12 colunas, gráficos completos (eixos, ticks, unidades, curvas/barras animadas, callouts), fluxogramas circulares Bezier com partículas luminosas, câmera virtual (\`camX, camY, camZoom, camRot\`), parallax em 3 planos e transições por máscara/match-cut.`;

  const durationGuidance = timing?.hasExplicitTimestamps
    ? `DURAÇÃO BASEADA NOS TIMESTAMPS DO ROTEIRO: O roteiro traz marcações temporais apontando para aproximadamente ${estimatedDuration}s (${timing.rationale}). Respeite fielmente os tempos pedidos e defina \`window.DURATION\` com precisão.`
    : `DURAÇÃO E ARQUITETURA DE CENAS COMPATÍVEL COM O TEMA: Estruture entre ${profile.recommendedMinScenes} e ${profile.recommendedMaxScenes} cenas progressivas e defina \`window.DURATION\` na faixa de ${profile.recommendedMinDuration}s a ${profile.recommendedMaxDuration}s (alvo recomendado: ~${estimatedDuration}s — ${timing?.rationale ?? "ritmo documental claro"}), garantindo tempo real para abertura impactante, construção dos gráficos/fluxos e leitura confortável.`;

  const styleDirective = explicitStyle
    ? `ESTILO SOLICITADO PELO USUÁRIO (OBRIGATÓRIO): Utilize como estilo principal [${explicitStyle}] "${primarySpec.name}".`
    : `AUTONOMIA CRIATIVA ALTA: Escolha o estilo (ou combinação coerente de estilos complementares) mais expressivo para este tema e crie uma paleta de cores editorial/cinematográfica sob medida para o assunto (não use preto/roxo do estúdio salvo se o tema pedir).`;

  const topicsRequirement =
    profile.extractedKeyTopics.length > 0
      ? `COBERTURA OBRIGATÓRIA DE TODOS OS PILARES DO ROTEIRO:
Dedique cenas/capítulos visuais distintos, claros e interconectados cobrindo explicitamente CADA UM destes tópicos: ${profile.extractedKeyTopics
          .map((t, i) => `(${i + 1}) ${t}`)
          .join(", ")}.`
      : "";

  const dataHonestyRequirement =
    profile.requiresDataVisualization && !profile.hasExplicitUserNumbers
      ? `INTEGRIDADE E TRANSPARÊNCIA DE DADOS:
Construa gráficos animados completos (curvas de tendência, barras comparativas, medidores de taxa/inflação/juros, indicadores tabulares e fluxograma de circulação) com eixos, unidades e legendas claras. Como o roteiro não fixou estatísticas de um país/ano específico, rotule visivelmente no rodapé editorial ou legenda dos gráficos: "Valores ilustrativos · Modelo macroeconômico didático" — nunca apresente números exemplificativos como estatística oficial sem fonte.`
      : "";

  const userPrompt = `ROTEIRO PARA INTERPRETAR, PLANEJAR E ANIMAR EM NÍVEL PROFISSIONAL:
"""
${trimmedScript}
"""
${req.creativeNotes?.trim() ? `\nRESTRIÇÕES / NOTAS CRIATIVAS DO USUÁRIO (PRIORIDADE MÁXIMA):\n"${req.creativeNotes.trim()}"\n` : ""}
${styleDirective}
${durationGuidance}
${topicsRequirement}
${dataHonestyRequirement}

REQUISITOS VISUAIS E TÉCNICOS INEGOCIÁVEIS:
- Formato 16:9 (1920×1080) ocupando o palco com equilíbrio editorial, hierarquia tipográfica em 3 níveis e área segura respeitada.
- Inclua \`<script type="application/json" id="ms-director-blueprint">\` no \`<head>\` com o plano das cenas, paleta, câmera e transições.
- PROIBIDO desenhar retângulos/círculos/linhas primitivos como substitutos de fábricas, comércios, bancos, navios, pessoas ou balanças: crie ilustrações vetoriais multi-camadas detalhadas (\`<path>\` com curvas Bezier, silhuetas arquitetônicas, isometria/profundidade e iluminação).
- PROIBIDO usar \`Math.random()\`, \`Date.now()\` ou interpolações sem clamping dentro de \`window.seek(t)\`. Qualquer chamada \`window.seek(t)\` em ordem arbitrária deve renderizar exatamente o mesmo frame limpo.

Gere agora APENAS o documento \`<!DOCTYPE html>\` completo.`;

  const initial = await executeHtmlCascade(
    systemInstruction,
    userPrompt,
    "direct_generate",
    {
      ...context,
      initialStageMessage:
        context?.initialStageMessage ??
        "Analisando roteiro, definindo direção de arte e arquitetura de cenas...",
    }
  );

  const audited = await evaluateAndRefineHtmlIfNeeded({
    initialHtml: initial.html,
    initialDiagnostics: initial.diagnostics,
    auditContext: {
      profile,
      expectedDurationSeconds: estimatedDuration,
      expectedSceneCount: profile.recommendedMinScenes,
      styleId: activeStyleIds[0],
      renderTechnology: preferredTech,
      isStoryboardRender: false,
    },
    originalScript: trimmedScript,
    systemInstruction,
    operation: "direct_generate",
    context,
  });

  return {
    html: audited.html,
    estimatedDuration:
      audited.qualityAudit.metrics.declaredDurationSeconds ?? estimatedDuration,
    selectedStyleIds: activeStyleIds,
    renderTechnology: preferredTech,
    diagnostics: audited.diagnostics,
    qualityAudit: audited.qualityAudit,
  };
}

/**
 * MODO B — Renderização Final Fiel ao Storyboard Aprovado com Auditoria de Qualidade Pré-Entrega.
 */
export async function renderApprovedStoryboardWithAI(
  project: ProjectContextMemory,
  context?: CascadeRunContext
): Promise<{
  html: string;
  totalDuration: number;
  diagnostics: ExecutionDiagnosticsSummary;
  qualityAudit: MotionQualityAuditReport;
}> {
  const { scenes, timeline } = recalculateStoryboardTimeline(
    project.scenes,
    project.artDirection
  );
  const ad = project.artDirection;
  const profile = analyzeScriptCreativeProfile(
    project.originalScript,
    timeline.totalDuration,
    true
  );

  const usedStyleIds: StyleId[] = Array.from(
    new Set<StyleId>([
      ad.primaryStyleId,
      ...ad.complementaryStyleIds,
      ...scenes.map((s) => s.styleId),
    ])
  );

  const systemInstruction = `Você é a Equipe Sênior de Motion Design, Ilustração Vetorial, Fotografia Virtual e Engenharia Determinística do MALA.SOMBRE Motion Studio.
Você receberá um STORYBOARD APROVADO PELO DIRETOR/USUÁRIO junto à MEMÓRIA COMPLETA DO PROJETO.
Sua tarefa é transformar este planejamento aprovado em um único arquivo HTML autocontido (1920×1080, 16:9) 100% determinístico via \`window.seek(t)\` e \`window.DURATION = ${timeline.totalDuration}\`. Sem texto explicativo fora do HTML.

${STUDIO_CREATIVE_COUNCIL_DOCTRINE}

REGRAS DE FIDELIDADE AO STORYBOARD APROVADO:
1. Defina obrigatoriamente \`window.DURATION = ${timeline.totalDuration};\` e inclua \`<script type="application/json" id="ms-director-blueprint">\` no \`<head>\` refletindo as ${scenes.length} cenas aprovadas.
2. Renderize EXATAMENTE as ${scenes.length} cenas aprovadas nos seus respectivos intervalos \`[startTime, endTime]\`, conectadas pelas transições especificadas e câmera virtual contínua (\`camX, camY, camZoom, camRot\`), sem lacunas vazias.
3. Aplique fielmente a Paleta Aprovada:
   - Background: ${ad.colorPalette.background}
   - Surface: ${ad.colorPalette.surface}
   - Primary: ${ad.colorPalette.primary}
   - Secondary: ${ad.colorPalette.secondary}
   - Accent: ${ad.colorPalette.accent}
   - Text: ${ad.colorPalette.text}
4. Importe via Google Fonts e utilize a Tipografia Aprovada: Display '${ad.typography.displayFont}', Body '${ad.typography.bodyFont}', Mono '${ad.typography.monoFont}' (com \`tabular-nums\`).
5. Mantenha consistência rigorosa dos Elementos Recorrentes e Características de Entidades/Ativos Vetoriais em todas as cenas, construindo ilustrações multi-path ricas e gráficos completos com eixos/legendas.
6. Exiba literalmente o \`onScreenText\` definido em cada cena com hierarquia tipográfica editorial impecável.

ESPECIFICAÇÕES DOS ESTILOS APROVADOS NESTE PROJETO:
${formatDetailedStyleSpecs(usedStyleIds)}

${PROFESSIONAL_ANIMATION_PRINCIPLES}

${getTechnologyExecutionGuide(ad.renderTechnology)}

${SELF_EVALUATION_CHECKLIST}`;

  const scenesBlueprint = scenes
    .map(
      (sc) => `CENA ${sc.order} [ID: ${sc.id}] — "${sc.title}"
  • Janela Temporal Exata: t = ${sc.startTime.toFixed(2)}s até t = ${sc.endTime.toFixed(2)}s (Duração: ${sc.duration.toFixed(2)}s)
  • Estilo da Cena: ${getStyleById(sc.styleId).name} (${sc.styleId})
  • Objetivo Narrativo: ${sc.narrativeObjective}
  • Descrição Visual: ${sc.visualDescription}
  • Elementos Gráficos Vetoriais Presentes: ${sc.presentElements.join(", ") || "Composição vetorial e tipográfica da cena"}
  • Camadas de Profundidade: ${sc.visualLayering || "3 planos com parallax sutil"}
  • Posição e Hierarquia Editorial: ${sc.layoutAndHierarchy}
  • Texto Exato em Tela: ${sc.onScreenText ? `"${sc.onScreenText}"` : "(Nenhum texto principal — foco visual)"}
  • Movimento e Animação: ${sc.motionAndAnimation}
  • Coreografia de Câmera: ${sc.cameraMovement || "Dolly-in / tracking suave"}
  • Transição de Entrada: ${sc.entryTransition}
  • Transição de Saída: ${sc.exitTransition}
  • Continuidade: ${sc.continuityNotes}`
    )
    .join("\n\n");

  const userPrompt = `ROTEIRO ORIGINAL DE REFERÊNCIA:
"""
${project.originalScript}
"""
${project.creativeNotes ? `\nNOTAS DO USUÁRIO: "${project.creativeNotes}"\n` : ""}
MEMÓRIA COMPARTILHADA DA DIREÇÃO DE ARTE APROVADA:
- Tema: ${ad.themeAndSubject}
- Objetivo: ${ad.communicationObjective}
- Tom Emocional & Ritmo: ${ad.emotionalTone} | ${ad.narrativePacing}
- Tecnologia de Renderização: ${ad.renderTechnology}
- Elementos Recorrentes: ${ad.recurringElements.join(", ") || "Padrão visual editorial coeso"}
- Ativos Vetoriais / Entidades: ${ad.characterSpecs}
- Regras de Composição: ${ad.compositionRules}

STORYBOARD APROVADO (${scenes.length} CENAS | DURAÇÃO GLOBAL EXATA: ${timeline.totalDuration.toFixed(2)}s):

${scenesBlueprint}

Gere agora APENAS o código \`<!DOCTYPE html>\` completo, visualmente rico, com ilustrações vetoriais compostas detalhadas, zero \`Math.random()\` e 100% determinístico (\`window.DURATION = ${timeline.totalDuration}\`, \`window.seek(t)\`).`;

  const initial = await executeHtmlCascade(
    systemInstruction,
    userPrompt,
    "storyboard_render",
    {
      ...context,
      initialStageMessage:
        context?.initialStageMessage ??
        "Preparando storyboard aprovado para renderização determinística...",
    }
  );

  const audited = await evaluateAndRefineHtmlIfNeeded({
    initialHtml: initial.html,
    initialDiagnostics: initial.diagnostics,
    auditContext: {
      profile,
      expectedDurationSeconds: timeline.totalDuration,
      expectedSceneCount: scenes.length,
      styleId: ad.primaryStyleId,
      renderTechnology: ad.renderTechnology,
      isStoryboardRender: true,
    },
    originalScript: project.originalScript,
    systemInstruction,
    operation: "storyboard_render",
    context,
  });

  return {
    html: audited.html,
    totalDuration: timeline.totalDuration,
    diagnostics: audited.diagnostics,
    qualityAudit: audited.qualityAudit,
  };
}
