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
  getTechnologyExecutionGuide,
} from "./animationKnowledge.ts";
import {
  executeProviderCascade,
  hasConfiguredApiKey,
  refreshEnvFromDotenvFile,
} from "./providerCascade.ts";
import type { CascadeSimulationMap } from "./providerCascade.ts";

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
  if (!html || html.length < 100) return false;
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
    maxOutputTokens: 16384,
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
    maxOutputTokens: 8192,
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

function normalizeRenderTechnology(val: unknown, fallback: RenderTechnology): RenderTechnology {
  if (val === "canvas2d" || val === "svg" || val === "html-css" || val === "hybrid") {
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

// Schema estruturado para Planejamento Completo (Diretor Criativo + Planejador de Storyboard)
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
 * PAPEL A + B: Diretor Criativo de IA e Planejador de Storyboard (Modo B).
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
  const candidateStyles = recommendStylesForScript(trimmedScript, 5);
  const preferredOverride =
    req.preferredStyleId && req.preferredStyleId !== "auto" && isValidStyleId(req.preferredStyleId)
      ? req.preferredStyleId
      : null;

  const fallbackPrimaryStyle: StyleId =
    preferredOverride ?? candidateStyles[0]?.id ?? "explainer-videos";

  const systemInstruction = `Você atua simultaneamente como:
(A) DIRETOR CRIATIVO DE IA SÊNIOR DE MOTION GRAPHICS
(B) PLANEJADOR DE STORYBOARD CINEMATOGRÁFICO

Sua missão é interpretar semanticamente o roteiro, exercer AUTONOMIA CRIATIVA ALTA e projetar uma Direção de Arte autêntica + um Storyboard profissional cena a cena em português.

REGRAS INEGOCIÁVEIS:
1. FIDELIDADE AO CONTEÚDO: Preserve 100% da intenção original, textos obrigatórios, números, fatos, citações, restrições explícitas e sequência lógica. NUNCA invente estatísticas, datas ou citações ausentes no roteiro.
2. ESCOLHA ESPECIALIZADA DE ESTILOS (30 ESTILOS DISPONÍVEIS):
${formatStyleCatalogOverview()}
- Escolha \`primaryStyleId\` usando exatamente um dos IDs entre colchetes acima${
    preferredOverride
      ? ` (O usuário solicitou explicitamente o estilo principal "${preferredOverride}" — respeite essa escolha!)`
      : ""
  }.
- Você pode combinar até 2 \`complementaryStyleIds\` apenas quando isso enriquecer genuinamente cenas específicas com coerência visual.
3. PALETA GUIADA PELO CONTEÚDO:
- Escolha cores hexadecimais (#RRGGBB) apropriadas ao tema, público e estilo escolhido (NÃO obrigue todas as animações a serem pretas e roxas; use fundos claros/editoriais para Whiteboard/Google Search/Infográficos claros, paletas ricas para Storytelling, ou escuras dramáticas quando o roteiro pedir mistério/tensão). Se o usuário especificar cores, elas prevalecem.
4. TECNOLOGIA DE RENDERIZAÇÃO ADAPTATIVA (\`renderTechnology\`):
- Escolha entre \`"canvas2d"\`, \`"svg"\`, \`"html-css"\` ou \`"hybrid"\` de acordo com o estilo e os elementos visuais.
5. DURAÇÃO ADAPTATIVA E QUALIDADE DE STORYBOARD:
- Não fixe durações genéricas de 10s ou 12s. Calcule a duração real de cada cena considerando leitura confortável, compreensão de gráficos/mapas/UI, pausas dramáticas e transições.
- Se o roteiro trouxer timestamps explícitos, respeite os intervalos indicados.
- Evite cenas redundantes, visualmente repetitivas ou textos excessivos num único quadro.`;

  const userPrompt = `ROTEIRO DO PROJETO:
"""
${trimmedScript}
"""
${req.creativeNotes?.trim() ? `\nDIRETRIZES / RESTRIÇÕES EXTRAS DO USUÁRIO:\n"${req.creativeNotes.trim()}"\n` : ""}
ANÁLISE PRELIMINAR DE TEMPO E CONTEXTO:
- Estimativa de referência: ~${timingAnalysis?.durationSeconds ?? 12}s (${timingAnalysis?.rationale ?? "duração adaptativa livre"})
- Estilos candidatos sugeridos por afinidade temática (você tem autonomia total para confirmar ou escolher outro melhor entre os 30): ${candidateStyles
    .map((s) => `${s.id} (${s.name})`)
    .join(", ")}

Elabore a Direção de Arte completa e divida o roteiro em cenas organizadas e contínuas.`;

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

      const complementaryStyleIds: StyleId[] = Array.isArray(rawAd.complementaryStyleIds)
        ? rawAd.complementaryStyleIds
            .filter((id): id is StyleId => isValidStyleId(id) && id !== primaryStyleId)
            .slice(0, 3)
        : [];

      const rawPal = (rawAd.colorPalette ?? {}) as Record<string, unknown>;
      const rawTypo = (rawAd.typography ?? {}) as Record<string, unknown>;

      const artDirection: ArtDirectionPlan = {
        themeAndSubject: String(rawAd.themeAndSubject || "Animação Narrativa").trim(),
        communicationObjective: String(
          rawAd.communicationObjective || "Comunicar a mensagem central com clareza visual."
        ).trim(),
        emotionalTone: String(rawAd.emotionalTone || "Envolvente e intencional").trim(),
        targetAudience: String(rawAd.targetAudience || "Público geral interessado no tema").trim(),
        narrativePacing: String(rawAd.narrativePacing || "Progressivo com pausas de leitura").trim(),
        primaryStyleId,
        complementaryStyleIds,
        styleRationale: String(
          rawAd.styleRationale || `Selecionado ${primarySpec.name} pela aderência narrativa.`
        ).trim(),
        renderTechnology: normalizeRenderTechnology(
          rawAd.renderTechnology,
          primarySpec.preferredTechnology
        ),
        colorPalette: {
          background: normalizeHexColor(rawPal.background, "#0B0F19"),
          surface: normalizeHexColor(rawPal.surface, "#161E2E"),
          primary: normalizeHexColor(rawPal.primary, "#38BDF8"),
          secondary: normalizeHexColor(rawPal.secondary, "#818CF8"),
          accent: normalizeHexColor(rawPal.accent, "#F59E0B"),
          text: normalizeHexColor(rawPal.text, "#F8FAFC"),
          paletteRationale: String(
            rawPal.paletteRationale || "Alto contraste cromático alinhado ao tom do roteiro."
          ).trim(),
        },
        typography: {
          displayFont: String(rawTypo.displayFont || "Outfit").trim(),
          bodyFont: String(rawTypo.bodyFont || "Plus Jakarta Sans").trim(),
          monoFont: String(rawTypo.monoFont || "JetBrains Mono").trim(),
          hierarchyRules: String(
            rawTypo.hierarchyRules ||
              "Títulos de forte presença com subtítulos concisos e números tabulares."
          ).trim(),
        },
        recurringElements: Array.isArray(rawAd.recurringElements)
          ? rawAd.recurringElements.map((e) => String(e).trim()).filter(Boolean)
          : [],
        characterSpecs: String(rawAd.characterSpecs || "Não aplicável / elementos gráficos abstratos").trim(),
        compositionRules: String(
          rawAd.compositionRules ||
            "Ponto focal único por cena, área segura 1920x1080 respeitada e continuidade entre transições."
        ).trim(),
      };

      const initialScenes: StoryboardScene[] = rawScenes.map((item, idx) => {
        const sc = (item ?? {}) as Record<string, unknown>;
        const sceneStyle: StyleId = isValidStyleId(sc.styleId)
          ? sc.styleId
          : primaryStyleId;
        const rawDur = typeof sc.duration === "number" ? sc.duration : Number(sc.duration) || 4;
        return {
          id: createStableId(`sc${idx + 1}`),
          order: idx + 1,
          title: String(sc.title || `Cena ${idx + 1}`).trim(),
          narrativeObjective: String(sc.narrativeObjective || "Avançar a narrativa").trim(),
          startTime: 0,
          endTime: 0,
          duration: Math.max(1.5, Math.min(45, rawDur)),
          styleId: sceneStyle,
          visualDescription: String(sc.visualDescription || "").trim(),
          presentElements: Array.isArray(sc.presentElements)
            ? sc.presentElements.map((el) => String(el).trim()).filter(Boolean)
            : [],
          layoutAndHierarchy: String(
            sc.layoutAndHierarchy || "Composição equilibrada dentro da área segura."
          ).trim(),
          onScreenText: String(sc.onScreenText ?? "").trim(),
          motionAndAnimation: String(
            sc.motionAndAnimation || "Entrada com ease-out suave e estabilização para leitura."
          ).trim(),
          entryTransition: String(sc.entryTransition || "Corte suave / Revelação").trim(),
          exitTransition: String(sc.exitTransition || "Continuidade de movimento").trim(),
          continuityNotes: String(sc.continuityNotes || "Conecta-se organicamente à sequência.").trim(),
          approved: false,
        };
      });

      const { scenes, timeline } = recalculateStoryboardTimeline(initialScenes, artDirection);

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
        "Analisando roteiro e planejando direção de arte...",
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
    throw new Error("Cena solicitada para regeneração não foi encontrada pelo identificador estável.");
  }

  const currentScene = project.scenes[targetIndex];
  const prevScene = targetIndex > 0 ? project.scenes[targetIndex - 1] : null;
  const nextScene =
    targetIndex < project.scenes.length - 1 ? project.scenes[targetIndex + 1] : null;

  const targetStyleId: StyleId =
    requestedStyleId && isValidStyleId(requestedStyleId)
      ? requestedStyleId
      : currentScene.styleId;

  const styleSpecDetails = formatDetailedStyleSpecs([
    project.artDirection.primaryStyleId,
    targetStyleId,
  ]);

  const systemInstruction = `Você é o Diretor Criativo e Especialista em Motion Design responsável por REGENERAR UMA ÚNICA CENA de um Storyboard existente sem quebrar a consistência do filme.

REGRAS DE MEMÓRIA E CONSISTÊNCIA:
1. Preserve o significado do roteiro original, textos/dados obrigatórios e a Direção de Arte global (paleta ${project.artDirection.colorPalette.background} / ${project.artDirection.colorPalette.primary} / ${project.artDirection.colorPalette.accent}, tipografia ${project.artDirection.typography.displayFont} + ${project.artDirection.typography.bodyFont}, elementos recorrentes e características de personagens).
2. Mantenha conexão fluida com a cena anterior (${prevScene ? `"${prevScene.title}" — saída: ${prevScene.exitTransition}` : "Início do vídeo"}) e com a cena posterior (${nextScene ? `"${nextScene.title}" — entrada: ${nextScene.entryTransition}` : "Encerramento do vídeo"}).
3. Proponha uma concepção visual renovada, criativa e superior para esta cena, obedecendo a eventual instrução específica do usuário.
4. Informe em \`neighborImpactNotes\` observações curtas caso a nova duração ou transição sugira atenção às cenas vizinhas (sem alterar cenas já aprovadas desnecessariamente).

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
- Cena Seguinte: ${
    nextScene
      ? `[Cena ${nextScene.order}: ${nextScene.title}] Visual: ${nextScene.visualDescription} | Entrada: ${nextScene.entryTransition}`
      : "Nenhuma (esta é a última cena de fechamento)"
  }

ESTILO SOLICITADO PARA ESTA CENA: ${targetStyleId} (${getStyleById(targetStyleId).name})
SOLICITAÇÃO DO USUÁRIO PARA A REGENERAÇÃO:
"${instruction?.trim() || "Crie uma nova abordagem visual e de movimento mais expressiva e clara para esta cena, mantendo continuidade perfeita com o projeto."}"`;

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
        id: currentScene.id, // Preserva estritamente o ID estável!
        order: currentScene.order,
        title: String(sc.title || currentScene.title).trim(),
        narrativeObjective: String(
          sc.narrativeObjective || currentScene.narrativeObjective
        ).trim(),
        startTime: currentScene.startTime,
        endTime: currentScene.endTime,
        duration: Math.max(1.5, Math.min(45, rawDur)),
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
        onScreenText: String(sc.onScreenText ?? currentScene.onScreenText).trim(),
        motionAndAnimation: String(
          sc.motionAndAnimation || currentScene.motionAndAnimation
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
        approved: false, // Requer revisão do usuário para a cena recém-regenerada
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

  // Atualiza apenas a cena alvo, mantendo intactas todas as outras cenas aprovadas
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
 * MODO A — Geração Direta com Autonomia Criativa Alta (Diretor Criativo + Storyboard Interno + Execução).
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
}> {
  const trimmedScript = req.script.trim();
  const timing = analyzeAdaptiveScriptTiming(trimmedScript);
  const estimatedDuration = timing?.durationSeconds ?? 12;

  const explicitStyle =
    req.preferredStyleId && req.preferredStyleId !== "auto" && isValidStyleId(req.preferredStyleId)
      ? req.preferredStyleId
      : null;

  const recommended = recommendStylesForScript(trimmedScript, 3);
  const activeStyleIds: StyleId[] = explicitStyle
    ? [
        explicitStyle,
        ...recommended.map((s) => s.id).filter((id) => id !== explicitStyle).slice(0, 2),
      ]
    : recommended.map((s) => s.id);

  const primarySpec = getStyleById(activeStyleIds[0]);
  const preferredTech = primarySpec.preferredTechnology;

  const systemInstruction = `Você é o Motor Inteligente do MALA.SOMBRE Motion Studio, reunindo 4 competências:
1. Diretor Criativo de IA (interpreta semanticamente o roteiro, objetivo, público, tom emocional e paleta ideal).
2. Planejador de Storyboard (estrutura internamente a progressão de cenas, duração adaptativa e transições contínuas).
3. Especialista em Motion Design (executa técnicas autênticas do estilo escolhido, sem usar a mesma receita genérica).
4. Engenheiro de Renderização Determinística (entrega APENAS um arquivo HTML autocontido 1920×1080 controlado por \`window.seek(t)\` e \`window.DURATION\`, sem explicações em texto).

CATÁLOGO DE 30 ESTILOS ESPECIALIZADOS DISPONÍVEIS:
${formatStyleCatalogOverview()}

FICHAS TÉCNICAS DOS ESTILOS DE MAIOR AFINIDADE PARA ESTE ROTEIRO:
${formatDetailedStyleSpecs(activeStyleIds)}

${PROFESSIONAL_ANIMATION_PRINCIPLES}

${getTechnologyExecutionGuide(preferredTech)}

${SELF_EVALUATION_CHECKLIST}

## DISCIPLINA DE ENGENHARIA E EFICIÊNCIA (ANTI-TIMEOUT)
- Estruture o código de forma limpa, modular e orientada a dados (use funções utilitárias reutilizáveis como \`clamp\`, \`easeOut\`, \`lerp\` e descritores compactos de cena em vez de código repetitivo inchado).
- Mantenha o arquivo enxuto e elegante (~160 a 340 linhas totais), garantindo alta riqueza visual com zero repetição desnecessária.`;

  const durationGuidance = timing?.hasExplicitTimestamps
    ? `DURAÇÃO BASEADA NOS TIMESTAMPS DO ROTEIRO: O roteiro contém marcações temporais apontando para aproximadamente ${estimatedDuration}s (${timing.rationale}). Respeite fielmente os tempos pedidos e defina \`window.DURATION\` de forma exata.`
    : `DURAÇÃO ADAPTATIVA INTELIGENTE: O usuário não fixou timestamps rígidos. Nossa análise de leitura e complexidade sugere cerca de ~${estimatedDuration}s (${timing?.rationale ?? "adapte ao ritmo natural"}), mas você tem autonomia para definir \`window.DURATION\` com o valor exato ideal para que todas as cenas respirem com clareza (nunca force 10s ou 12s arbitrariamente).`;

  const styleDirective = explicitStyle
    ? `ESTILO SOLICITADO PELO USUÁRIO (OBRIGATÓRIO): Utilize como estilo principal [${explicitStyle}] "${primarySpec.name}".`
    : `AUTONOMIA CRIATIVA ALTA: Escolha o estilo (ou combinação coerente de até 2 estilos) que melhor comunica este roteiro — as fichas acima são recomendações de alta afinidade — e defina uma paleta de cores e tipografia sob medida para o conteúdo.`;

  const userPrompt = `ROTEIRO PARA INTERPRETAR, DIRIGIR E ANIMAR:
"""
${trimmedScript}
"""
${req.creativeNotes?.trim() ? `\nRESTRIÇÕES / NOTAS CRIATIVAS DO USUÁRIO (PRIORIDADE MÁXIMA):\n"${req.creativeNotes.trim()}"\n` : ""}
${styleDirective}
${durationGuidance}

Preservando todos os textos obrigatórios, dados e intenção narrativa do roteiro (sem inventar fatos ou números), gere agora APENAS o documento \`<!DOCTYPE html>\` completo, autocontido e 100% determinístico via \`window.seek(t)\`.`;

  const { html, diagnostics } = await executeHtmlCascade(
    systemInstruction,
    userPrompt,
    "direct_generate",
    {
      ...context,
      initialStageMessage:
        context?.initialStageMessage ??
        "Analisando roteiro e definindo direção de arte...",
    }
  );

  return {
    html,
    estimatedDuration,
    selectedStyleIds: activeStyleIds,
    renderTechnology: preferredTech,
    diagnostics,
  };
}

/**
 * MODO B — Renderização Final Fiel ao Storyboard Aprovado e à Memória do Projeto.
 */
export async function renderApprovedStoryboardWithAI(
  project: ProjectContextMemory,
  context?: CascadeRunContext
): Promise<{
  html: string;
  totalDuration: number;
  diagnostics: ExecutionDiagnosticsSummary;
}> {
  const { scenes, timeline } = recalculateStoryboardTimeline(
    project.scenes,
    project.artDirection
  );
  const ad = project.artDirection;

  const usedStyleIds: StyleId[] = Array.from(
    new Set<StyleId>([
      ad.primaryStyleId,
      ...ad.complementaryStyleIds,
      ...scenes.map((s) => s.styleId),
    ])
  );

  const systemInstruction = `Você é o Especialista em Motion Design e Engenheiro de Renderização do MALA.SOMBRE Motion Studio.
Você receberá um STORYBOARD APROVADO PELO DIRETOR/USUÁRIO junto à MEMÓRIA COMPLETA DO PROJETO.
Sua tarefa é transformar este planejamento aprovado em um único arquivo HTML autocontido (1920×1080) 100% determinístico via \`window.seek(t)\` e \`window.DURATION = ${timeline.totalDuration}\`. Sem texto explicativo fora do HTML.

REGRAS DE FIDELIDADE AO STORYBOARD APROVADO:
1. Defina obrigatoriamente \`window.DURATION = ${timeline.totalDuration};\`.
2. Renderize EXATAMENTE as ${scenes.length} cenas aprovadas nos seus respectivos intervalos \`[startTime, endTime]\`, sem lacunas pretas acidentais nem cortes abruptos desconectados.
3. Aplique fielmente a Paleta Aprovada:
   - Background: ${ad.colorPalette.background}
   - Surface: ${ad.colorPalette.surface}
   - Primary: ${ad.colorPalette.primary}
   - Secondary: ${ad.colorPalette.secondary}
   - Accent: ${ad.colorPalette.accent}
   - Text: ${ad.colorPalette.text}
4. Importe via Google Fonts e utilize a Tipografia Aprovada: Display '${ad.typography.displayFont}', Body '${ad.typography.bodyFont}', Mono '${ad.typography.monoFont}'.
5. Mantenha consistência rigorosa dos Elementos Recorrentes e Características de Personagens/Entidades em todas as cenas.
6. Exiba literalmente o \`onScreenText\` definido em cada cena, garantindo leitura perfeita e contenção na área segura.

ESPECIFICAÇÕES DOS ESTILOS APROVADOS NESTE PROJETO:
${formatDetailedStyleSpecs(usedStyleIds)}

${PROFESSIONAL_ANIMATION_PRINCIPLES}

${getTechnologyExecutionGuide(ad.renderTechnology)}

${SELF_EVALUATION_CHECKLIST}

## DISCIPLINA DE ENGENHARIA E EFICIÊNCIA (ANTI-TIMEOUT)
- Implemente um dispatcher limpo por intervalo temporal das ${scenes.length} cenas com helpers reutilizáveis (~180 a 380 linhas totais), evitando código repetitivo excessivo.`;

  const scenesBlueprint = scenes
    .map(
      (sc) => `CENA ${sc.order} [ID: ${sc.id}] — "${sc.title}"
  • Janela Temporal Exata: t = ${sc.startTime.toFixed(2)}s até t = ${sc.endTime.toFixed(2)}s (Duração: ${sc.duration.toFixed(2)}s)
  • Estilo da Cena: ${getStyleById(sc.styleId).name} (${sc.styleId})
  • Objetivo Narrativo: ${sc.narrativeObjective}
  • Descrição Visual: ${sc.visualDescription}
  • Elementos Gráficos Presentes: ${sc.presentElements.join(", ") || "Geometria/tipografia da cena"}
  • Posição e Hierarquia: ${sc.layoutAndHierarchy}
  • Texto Exato em Tela: ${sc.onScreenText ? `"${sc.onScreenText}"` : "(Nenhum texto em tela nesta cena)"}
  • Movimento e Animação: ${sc.motionAndAnimation}
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
- Elementos Recorrentes: ${ad.recurringElements.join(", ") || "Padrão visual coeso"}
- Personagens / Entidades: ${ad.characterSpecs}
- Regras de Composição: ${ad.compositionRules}

STORYBOARD APROVADO (${scenes.length} CENAS | DURAÇÃO GLOBAL EXATA: ${timeline.totalDuration.toFixed(2)}s):

${scenesBlueprint}

Gere agora APENAS o código \`<!DOCTYPE html>\` completo e determinístico (\`window.DURATION = ${timeline.totalDuration}\`, \`window.seek(t)\`).`;

  const { html, diagnostics } = await executeHtmlCascade(
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

  return {
    html,
    totalDuration: timeline.totalDuration,
    diagnostics,
  };
}
