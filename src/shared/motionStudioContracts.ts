/**
 * Contratos tipados compartilhados entre Frontend e Backend do MALA.SOMBRE Motion Studio.
 * Compatível com execução direta em Node 22 (erasable TypeScript syntax) e Vite/React.
 */

export type CreationMode = "direct" | "storyboard";

export type RenderTechnology = "canvas2d" | "svg" | "html-css" | "hybrid";

export type StyleCategory =
  | "storytelling"
  | "data"
  | "social"
  | "branding"
  | "product"
  | "editing"
  | "experimental";

export type StyleId =
  // 1-5: Storytelling e Explicação
  | "explainer-videos"
  | "illustration-character"
  | "paper-cutout-parallax"
  | "character-rigging-puppet"
  | "whiteboard-animation"
  // 6-10: Dados e Informação
  | "3d-transforms-flowchart"
  | "animated-infographics"
  | "animated-maps"
  | "realtime-data-viz"
  | "animated-charts-comparisons"
  // 11-16: Social e Viral
  | "kinetic-text"
  | "google-search-simulation"
  | "social-engagement-mockups"
  | "advanced-kinetic-lyrics"
  | "liquid-gradient-blob"
  | "glitch-datamosh-vhs"
  // 17-20: Branding e Identidade
  | "animated-logos-branding"
  | "typography-3d-extruded"
  | "kinetic-logo-stings"
  | "morphing-shape-transitions"
  // 21-24: Produto, Interface e Tecnologia
  | "ui-lottie-animations"
  | "isometric-flat-design"
  | "product-device-mockups"
  | "hud-scifi-interface"
  // 25-28: Edição e Transições
  | "transitions-effects"
  | "lower-thirds-broadcast"
  | "particle-vfx-motion"
  | "looping-backgrounds-textures"
  // 29-30: Experimental e Editorial
  | "motion-collage-stopmotion"
  | "social-proof-testimonial";

export type StyleSelection = "auto" | StyleId;

export type ApprovalStatus = "draft" | "partially_approved" | "approved";

export interface MotionStyleSpec {
  id: StyleId;
  index: number;
  name: string;
  category: StyleCategory;
  categoryLabel: string;
  preferredTechnology: RenderTechnology;
  visualCharacteristics: string;
  compositionTypes: string;
  animationTechniques: string;
  typographyGuide: string;
  signatureMovements: string;
  recommendedTransitions: string;
  depthAndLayers: string;
  recommendedElements: string[];
  bestUseCases: string;
  technicalCautions: string;
  keywords: string[];
}

export interface ColorPaletteSpec {
  background: string;
  surface: string;
  primary: string;
  secondary: string;
  accent: string;
  text: string;
  paletteRationale: string;
}

export interface TypographySpec {
  displayFont: string;
  bodyFont: string;
  monoFont: string;
  hierarchyRules: string;
}

export interface ArtDirectionPlan {
  themeAndSubject: string;
  communicationObjective: string;
  emotionalTone: string;
  targetAudience: string;
  narrativePacing: string;
  primaryStyleId: StyleId;
  complementaryStyleIds: StyleId[];
  styleRationale: string;
  renderTechnology: RenderTechnology;
  colorPalette: ColorPaletteSpec;
  typography: TypographySpec;
  recurringElements: string[];
  characterSpecs: string;
  compositionRules: string;
}

export interface StoryboardScene {
  id: string;
  order: number;
  title: string;
  narrativeObjective: string;
  startTime: number;
  endTime: number;
  duration: number;
  styleId: StyleId;
  visualDescription: string;
  presentElements: string[];
  layoutAndHierarchy: string;
  onScreenText: string;
  motionAndAnimation: string;
  cameraMovement?: string;
  visualLayering?: string;
  entryTransition: string;
  exitTransition: string;
  continuityNotes: string;
  approved: boolean;
}

export interface TimelineSegment {
  sceneId: string;
  order: number;
  title: string;
  startTime: number;
  endTime: number;
  duration: number;
  styleId: StyleId;
  entryTransition: string;
  exitTransition: string;
}

export interface TimelineSummary {
  totalDuration: number;
  sceneCount: number;
  segments: TimelineSegment[];
  continuityWarnings: string[];
}

export interface ProjectContextMemory {
  projectId: string;
  originalScript: string;
  creativeNotes: string;
  preferredStyleOverride: StyleSelection;
  artDirection: ArtDirectionPlan;
  scenes: StoryboardScene[];
  timeline: TimelineSummary;
  approvalStatus: ApprovalStatus;
  approvedDecisions: string[];
  updatedAtIso: string;
}

// Diagnóstico de Provedores, Timeouts e Cascata de Fallback
export type AIProviderId = "gemini" | "openrouter" | "nvidia";

export type ProviderErrorType =
  | "timeout"
  | "auth_error"
  | "rate_limit"
  | "provider_unavailable"
  | "http_error"
  | "network_error"
  | "invalid_response"
  | "not_configured"
  | "cancelled";

export interface ProviderAttemptDiagnostic {
  provider: AIProviderId;
  providerLabel: string;
  model: string;
  startedAt: string;
  endedAt: string;
  durationMs: number;
  httpStatus: number | null;
  outcome: "success" | "failed" | "skipped";
  errorType?: ProviderErrorType;
  failureReason?: string;
  userMessage?: string;
}

export interface ExecutionDiagnosticsSummary {
  generationId: string;
  providerUsed: AIProviderId;
  providerLabel: string;
  modelUsed: string;
  durationMs: number;
  attemptsCount: number;
}

export interface ApiErrorPayload {
  error: string;
  errorType: ProviderErrorType | "all_providers_failed" | "validation_error";
  generationId?: string;
  retryable: boolean;
  failedProviders?: ProviderAttemptDiagnostic[];
}

// Eventos SSE de Streaming Real Servidor -> Navegador
export type StreamProgressEventType =
  | "generation_started"
  | "provider_started"
  | "provider_progress"
  | "provider_failed"
  | "fallback_started"
  | "generation_completed"
  | "generation_failed"
  | "generation_cancelled";

export interface StreamProgressEvent<TResult = unknown> {
  type: StreamProgressEventType;
  generationId: string;
  operation: string;
  timestamp: string;
  message: string;
  provider?: AIProviderId;
  providerLabel?: string;
  model?: string;
  attemptNumber?: number;
  receivedChars?: number;
  errorType?: ProviderErrorType | "all_providers_failed" | "validation_error";
  durationMs?: number;
  result?: TResult;
  errorPayload?: ApiErrorPayload;
}

// Auditoria Objetiva e Verificável de Qualidade Visual e Técnica (sem pontuações subjetivas inventadas)
export interface MotionQualityCriterionCheck {
  id:
    | "determinism_and_clamping"
    | "duration_and_scene_progression"
    | "illustration_and_vector_craft"
    | "composition_and_depth_layers"
    | "typographic_hierarchy"
    | "data_and_diagram_rigor"
    | "camera_choreography"
    | "transition_sophistication"
    | "motion_variety_and_easing"
    | "creative_blueprint_coherence";
  label: string;
  passed: boolean;
  evidence: string;
}

export interface MotionQualityAuditReport {
  passed: boolean;
  refinementApplied: boolean;
  criteria: MotionQualityCriterionCheck[];
  deficienciesFixedOrRemaining: string[];
  metrics: {
    declaredDurationSeconds: number | null;
    detectedScenesOrChapters: number;
    vectorPathsCount: number;
    curvedVectorCommandsCount: number;
    distinctFontSizesCount: number;
    hasDirectorBlueprint: boolean;
    hasCameraRig: boolean;
    hasMaskOrPathTransitions: boolean;
    hasTabularNumerals: boolean;
    isDeterministicSeek: boolean;
  };
}

// Contratos de Requisição e Resposta HTTP
export interface DirectGenerateRequest {
  script: string;
  preferredStyleId?: StyleSelection;
  creativeNotes?: string;
}

export interface DirectGenerateResponse {
  html: string;
  meta?: {
    estimatedDuration: number;
    selectedStyleIds: StyleId[];
    renderTechnology: RenderTechnology;
    diagnostics?: ExecutionDiagnosticsSummary;
    qualityAudit?: MotionQualityAuditReport;
  };
}

export interface PlanStoryboardRequest {
  script: string;
  preferredStyleId?: StyleSelection;
  creativeNotes?: string;
}

export interface PlanStoryboardResponse {
  project: ProjectContextMemory;
  diagnostics?: ExecutionDiagnosticsSummary;
}

export interface RegenerateSceneRequest {
  project: ProjectContextMemory;
  sceneId: string;
  instruction?: string;
  requestedStyleId?: StyleId;
}

export interface RegenerateSceneResponse {
  project: ProjectContextMemory;
  regeneratedSceneId: string;
  neighborImpactNotes: string[];
  diagnostics?: ExecutionDiagnosticsSummary;
}

export interface RenderStoryboardRequest {
  project: ProjectContextMemory;
}

export interface RenderStoryboardResponse {
  html: string;
  totalDuration: number;
  diagnostics?: ExecutionDiagnosticsSummary;
  qualityAudit?: MotionQualityAuditReport;
}

/**
 * Gera um identificador estável para cena ou projeto (independente de posição no array).
 */
export function createStableId(prefix: string = "scene"): string {
  const tsPart = Date.now().toString(36);
  const randPart = Math.random().toString(36).slice(2, 8);
  return `${prefix}_${tsPart}_${randPart}`;
}

/**
 * Recalcula tempos de início e término de forma contígua, eliminando lacunas ou sobreposições
 * e preservando identificadores estáveis de cada cena.
 */
export function recalculateStoryboardTimeline(
  scenes: StoryboardScene[],
  artDirection?: ArtDirectionPlan
): {
  scenes: StoryboardScene[];
  timeline: TimelineSummary;
} {
  let cursor = 0;
  const normalizedScenes: StoryboardScene[] = scenes.map((scene, idx) => {
    const safeDuration = Number(
      Math.max(1.2, Math.min(120, Number.isFinite(scene.duration) ? scene.duration : 4)).toFixed(2)
    );
    const startTime = Number(cursor.toFixed(2));
    const endTime = Number((startTime + safeDuration).toFixed(2));
    cursor = endTime;

    return {
      ...scene,
      id: scene.id && scene.id.trim() ? scene.id.trim() : createStableId(`sc${idx + 1}`),
      order: idx + 1,
      startTime,
      endTime,
      duration: safeDuration,
    };
  });

  const totalDuration = Number(Math.max(2, cursor).toFixed(2));
  const continuityWarnings = validateStoryboardContinuity(normalizedScenes, artDirection);

  const segments: TimelineSegment[] = normalizedScenes.map((sc) => ({
    sceneId: sc.id,
    order: sc.order,
    title: sc.title,
    startTime: sc.startTime,
    endTime: sc.endTime,
    duration: sc.duration,
    styleId: sc.styleId,
    entryTransition: sc.entryTransition,
    exitTransition: sc.exitTransition,
  }));

  return {
    scenes: normalizedScenes,
    timeline: {
      totalDuration,
      sceneCount: normalizedScenes.length,
      segments,
      continuityWarnings,
    },
  };
}

/**
 * Avalia continuidade visual, ritmo e transições entre cenas adjacentes.
 */
export function validateStoryboardContinuity(
  scenes: StoryboardScene[],
  artDirection?: ArtDirectionPlan
): string[] {
  const warnings: string[] = [];
  if (scenes.length === 0) {
    warnings.push("O storyboard precisa conter ao menos uma cena.");
    return warnings;
  }

  const allowedStyles = new Set<string>();
  if (artDirection) {
    allowedStyles.add(artDirection.primaryStyleId);
    for (const comp of artDirection.complementaryStyleIds) {
      allowedStyles.add(comp);
    }
  }

  for (let i = 0; i < scenes.length; i++) {
    const curr = scenes[i];
    if (curr.duration < 1.5 && curr.onScreenText && curr.onScreenText.trim().length > 28) {
      warnings.push(
        `Cena ${curr.order} ("${curr.title}") possui texto extenso para ${curr.duration.toFixed(1)}s — considere ampliar a duração para leitura confortável.`
      );
    }

    if (artDirection && allowedStyles.size > 0 && !allowedStyles.has(curr.styleId)) {
      warnings.push(
        `Cena ${curr.order} utiliza o estilo "${curr.styleId}" fora da combinação principal da Direção de Arte — verifique se a mudança estética é intencional.`
      );
    }

    if (i > 0) {
      const prev = scenes[i - 1];
      const gap = Math.abs(curr.startTime - prev.endTime);
      if (gap > 0.05) {
        warnings.push(
          `Desalinhamento temporal detectado entre Cena ${prev.order} e Cena ${curr.order}.`
        );
      }
    }
  }

  return warnings;
}

/**
 * Calcula o status global de aprovação a partir das cenas do storyboard.
 */
export function computeApprovalStatus(scenes: StoryboardScene[]): ApprovalStatus {
  if (scenes.length === 0) return "draft";
  const approvedCount = scenes.filter((s) => s.approved).length;
  if (approvedCount === 0) return "draft";
  if (approvedCount === scenes.length) return "approved";
  return "partially_approved";
}
