import type {
  MotionQualityAuditReport,
  MotionQualityCriterionCheck,
  RenderTechnology,
  StyleId,
} from "../src/shared/motionStudioContracts.ts";
import { countConceptualTopics } from "../src/utils/scriptDuration.ts";

export interface ScriptCreativeProfile {
  wordCount: number;
  conceptualTopicCount: number;
  recommendedMinScenes: number;
  recommendedMaxScenes: number;
  recommendedMinDuration: number;
  recommendedMaxDuration: number;
  requiresDataVisualization: boolean;
  requiresFlowchartOrSystemDiagram: boolean;
  hasExplicitUserNumbers: boolean;
  extractedKeyTopics: string[];
}

/**
 * Analisa semanticamente o roteiro antes da geração para orientar quantidade de cenas,
 * faixa de duração compatível, necessidade de gráficos/fluxogramas e integridade factual.
 */
export function analyzeScriptCreativeProfile(
  script: string,
  estimatedDuration: number,
  hasExplicitTimestamps: boolean
): ScriptCreativeProfile {
  const trimmed = script.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const conceptualTopicCount = countConceptualTopics(trimmed);

  const requiresDataVisualization =
    /\b(gr[áa]fico|indicador|indicadores|estat[íi]stica|dados|pib|infla[çc][ãa]o|juros|emprego|balan[çc]a|com[ée]rcio|taxa|porcentagem|%|crescimento|queda|compar|ranking|receita|or[çc]amento|consumo|investimento)\b/i.test(
      trimmed
    );

  const requiresFlowchartOrSystemDiagram =
    /\b(como funciona|circula[çc][ãa]o|fluxo|fluxograma|ciclo|cadeia|sistema|economia|processo|governo|mercado|exporta[çc][ãa]o|importa[çc][ãa]o)\b/i.test(
      trimmed
    );

  // Verifica se o usuário forneceu números concretos de domínio (excluindo durações como "45 e 60 segundos" ou "1920x1080")
  const strippedTechnicalNumbers = trimmed
    .replace(/\b1920\s*[x×]\s*1080\b/gi, "")
    .replace(/\b16\s*:\s*9\b/g, "")
    .replace(/\b60\s*fps\b/gi, "")
    .replace(
      /\b\d+(?:[.,]\d+)?\s*(?:s|seg|segs|segundo|segundos|min|minutos)\b/gi,
      ""
    );
  const hasExplicitUserNumbers =
    /\b\d+(?:[.,]\d+)?\s*(?:%|mil|milh[õo]es|bilh[õo]es|trilh[õo]es|gw|mw|km|r\$|us\$|\$|x)\b/i.test(
      strippedTechnicalNumbers
    );

  // Extrai tópicos enumerados por vírgula para garantir cobertura cena a cena
  const extractedKeyTopics: string[] = [];
  const clauses = trimmed.split(/[.!?;:\n]+/);
  for (const clause of clauses) {
    if (!clause.includes(",")) continue;
    const parts = clause
      .split(/\s*,\s*|\s+e\s+/i)
      .map((p) =>
        p
          .replace(
            /^(?:apresentem?|abordando|incluindo|como|sobre|o|a|os|as)\s+/i,
            ""
          )
          .trim()
      )
      .filter((p) => p.length >= 3 && p.split(/\s+/).length <= 5);
    if (parts.length >= 4) {
      for (const item of parts) {
        if (!extractedKeyTopics.includes(item) && extractedKeyTopics.length < 12) {
          extractedKeyTopics.push(item);
        }
      }
    }
  }

  const isShortSting = wordCount <= 16 && conceptualTopicCount <= 2 && estimatedDuration <= 7;

  let recommendedMinScenes = 3;
  let recommendedMaxScenes = 6;
  if (isShortSting) {
    recommendedMinScenes = 1;
    recommendedMaxScenes = 2;
  } else if (conceptualTopicCount >= 6 || estimatedDuration >= 42) {
    recommendedMinScenes = Math.max(7, Math.min(9, conceptualTopicCount));
    recommendedMaxScenes = Math.min(11, Math.max(9, conceptualTopicCount + 2));
  } else if (conceptualTopicCount >= 4 || estimatedDuration >= 24) {
    recommendedMinScenes = Math.max(5, conceptualTopicCount);
    recommendedMaxScenes = Math.min(9, conceptualTopicCount + 2);
  } else if (estimatedDuration <= 12) {
    recommendedMinScenes = 2;
    recommendedMaxScenes = 4;
  }

  const recommendedMinDuration = hasExplicitTimestamps
    ? Math.max(2.5, Number((estimatedDuration * 0.82).toFixed(1)))
    : conceptualTopicCount >= 6
      ? Math.max(44, Number((estimatedDuration * 0.85).toFixed(1)))
      : Math.max(4, Number((estimatedDuration * 0.72).toFixed(1)));

  const recommendedMaxDuration = hasExplicitTimestamps
    ? Number((estimatedDuration * 1.22 + 2).toFixed(1))
    : conceptualTopicCount >= 6
      ? Math.max(60, Number((estimatedDuration * 1.2).toFixed(1)))
      : Number((estimatedDuration * 1.45 + 4).toFixed(1));

  return {
    wordCount,
    conceptualTopicCount,
    recommendedMinScenes,
    recommendedMaxScenes,
    recommendedMinDuration,
    recommendedMaxDuration,
    requiresDataVisualization,
    requiresFlowchartOrSystemDiagram,
    hasExplicitUserNumbers,
    extractedKeyTopics,
  };
}

function extractExecutableJsBlocks(html: string): string {
  const blocks: string[] = [];
  const scriptRegex = /<script(?![^>]*type=["']application\/json["'])[^>]*>([\s\S]*?)<\/script>/gi;
  let m: RegExpExecArray | null;
  while ((m = scriptRegex.exec(html)) !== null) {
    if (
      m[0].includes("malasombre-raf-guard") ||
      m[0].includes("malasombre-frames-exporter")
    ) {
      continue;
    }
    blocks.push(m[1] || "");
  }
  return blocks.join("\n");
}

function extractDeclaredDuration(html: string): number | null {
  const m = html.match(
    /(?:window\.DURATION|const\s+DURATION|let\s+DURATION|var\s+DURATION|TOTAL_DURATION)\s*=\s*(\d+(?:\.\d+)?)/i
  );
  if (!m || !m[1]) return null;
  const val = parseFloat(m[1]);
  return Number.isFinite(val) && val > 0 ? val : null;
}

export interface QualityAuditContext {
  profile: ScriptCreativeProfile;
  expectedDurationSeconds?: number;
  expectedSceneCount?: number;
  styleId: StyleId;
  renderTechnology: RenderTechnology;
  isStoryboardRender?: boolean;
}

/**
 * Avalia objetivamente a animação gerada através de 10 critérios técnicos e visuais verificáveis.
 * Não inventa notas subjetivas: verifica estrutura real de código, determinismo, vetores,
 * tipografia, dados, câmera, transições e coerência narrativa.
 */
export function auditMotionHtmlQuality(
  html: string,
  ctx: QualityAuditContext
): MotionQualityAuditReport & { criticalDeficiencies: string[] } {
  const jsCode = extractExecutableJsBlocks(html);
  const jsWithoutComments = jsCode
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\/\/.*$/gm, "");

  // 1. Determinismo e Interpolação Limitada (Clamping)
  const usesMathRandom = /\bMath\.random\s*\(/.test(jsWithoutComments);
  const usesDateNow = /\b(?:Date\.now|new\s+Date|performance\.now)\s*\(/.test(
    jsWithoutComments
  );
  const usesSetInterval = /\bsetInterval\s*\(/.test(jsWithoutComments);
  const htmlWithoutExporterStyle = html.replace(
    /<style[^>]*id=["']malasombre-frames-style["'][^>]*>[\s\S]*?<\/style>/gi,
    ""
  );
  const hasAutonomousKeyframes =
    /@keyframes\s+[a-zA-Z0-9_-]+/i.test(htmlWithoutExporterStyle) ||
    /\btransition\s*:\s*(?!none\b)[^;}"']+/i.test(htmlWithoutExporterStyle);
  const hasClampLogic =
    /\bMath\.min\s*\([\s\S]{1,80}Math\.max\s*\(|\bMath\.max\s*\([\s\S]{1,80}Math\.min\s*\(|\bclamp(?:01)?\s*\(/.test(
      jsWithoutComments
    );
  const isDeterministicSeek =
    !usesMathRandom && !usesDateNow && !usesSetInterval && !hasAutonomousKeyframes;
  const determinismPassed = isDeterministicSeek && hasClampLogic;

  // 2. Duração e Progressão de Cenas
  const declaredDuration = extractDeclaredDuration(html);
  const blueprintMatch = html.match(
    /<script[^>]*id=["']ms-director-blueprint["'][^>]*>([\s\S]*?)<\/script>/i
  );
  let blueprintScenesCount = 0;
  let hasDirectorBlueprint = Boolean(ctx.isStoryboardRender);
  if (blueprintMatch && blueprintMatch[1]) {
    try {
      const parsedBp = JSON.parse(blueprintMatch[1].trim()) as {
        scenes?: unknown[];
        scenesAndElements?: unknown[];
      };
      const arr = parsedBp.scenes ?? parsedBp.scenesAndElements;
      if (Array.isArray(arr)) {
        blueprintScenesCount = arr.length;
      }
      hasDirectorBlueprint = true;
    } catch {
      hasDirectorBlueprint = false;
    }
  }

  // Conta definições estruturadas de cenas no JS/DOM (arrays de cenas, objetos { start, end }, grupos data-scene / scene-N)
  const sceneObjectMatches =
    jsWithoutComments.match(/\b(?:start|t0|startTime|from)\s*:\s*\d+/g)?.length ??
    0;
  const domSceneMatches =
    html.match(/\bid=["']scene[-_]\d+|\bclass=["'][^"']*scene[-_]/gi)?.length ?? 0;
  const timeBranchMatches =
    jsWithoutComments.match(/\bt\s*(?:>=|<|<=|>)\s*\d+/g)?.length ?? 0;
  const detectedScenesOrChapters = Math.max(
    blueprintScenesCount,
    sceneObjectMatches,
    domSceneMatches,
    Math.floor(timeBranchMatches / 2)
  );

  const minAllowedDur = ctx.expectedDurationSeconds
    ? ctx.expectedDurationSeconds * 0.75
    : ctx.profile.recommendedMinDuration;
  const durationAligned =
    declaredDuration !== null && declaredDuration >= minAllowedDur * 0.85;
  const sceneCountAligned =
    detectedScenesOrChapters >=
    Math.max(1, (ctx.expectedSceneCount ?? ctx.profile.recommendedMinScenes) - 1);
  const durationAndScenesPassed = durationAligned && sceneCountAligned;

  // 3. Riqueza de Ilustração Vetorial (Anti-Formas Primitivas Cruas)
  const svgPaths = html.match(/<path\b[^>]*\bd=["'][^"']+["']/gi) ?? [];
  const jsPathStrings =
    jsWithoutComments.match(/["'`]M\s*-?\d+[\s\S]{12,}?[CQSAZz]["'`]/g) ?? [];
  const canvasCurveCalls =
    jsWithoutComments.match(
      /\b(?:bezierCurveTo|quadraticCurveTo|arcTo|ellipse|roundRect|Path2D)\s*\(/g
    ) ?? [];
  const vectorPathsCount =
    svgPaths.length + jsPathStrings.length + Math.ceil(canvasCurveCalls.length / 2);

  let curvedCommands = canvasCurveCalls.length;
  for (const p of [...svgPaths, ...jsPathStrings]) {
    const curves = p.match(/[CcQqSsAa]/g);
    if (curves) curvedCommands += curves.length;
  }

  const isPureKineticTypeStyle =
    ctx.styleId === "kinetic-text" ||
    ctx.styleId === "advanced-kinetic-lyrics" ||
    ctx.styleId === "social-proof-testimonial";

  const minVectorPathsRequired = isPureKineticTypeStyle
    ? 2
    : ctx.profile.conceptualTopicCount >= 5
      ? 10
      : 5;
  const minCurvedCommandsRequired = isPureKineticTypeStyle
    ? 0
    : ctx.profile.conceptualTopicCount >= 5
      ? 8
      : 4;
  const illustrationPassed =
    vectorPathsCount >= minVectorPathsRequired &&
    curvedCommands >= minCurvedCommandsRequired;

  // 4. Composição Editorial e Camadas de Profundidade
  const hasGradientsOrShadows =
    /<(?:linearGradient|radialGradient|feDropShadow|filter)\b|createLinearGradient|createRadialGradient|shadowBlur|drop-shadow/i.test(
      html
    );
  const hasGridOrEditorialChrome =
    /\b(?:grid|chapter|cap[íi]tulo|progress|header|rail|safe|1920)\b/i.test(html);
  const hasMultiLayerGroups =
    (html.match(/<(?:g|section|div|canvas|svg|symbol)\b/gi)?.length ?? 0) >= 8 ||
    (jsWithoutComments.match(/\bctx\.save\s*\(/g)?.length ?? 0) >= 5;
  const compositionPassed =
    hasGradientsOrShadows && hasGridOrEditorialChrome && hasMultiLayerGroups;

  // 5. Hierarquia Tipográfica (Fontes + Escalas + Números Tabulares)
  const hasGoogleFonts = /fonts\.googleapis\.com/i.test(html);
  const cssFontSizes = html.match(/font-size\s*:\s*(\d+(?:\.\d+)?)px/gi) ?? [];
  const svgFontSizes = html.match(/font-size=["'](\d+(?:\.\d+)?)["']/gi) ?? [];
  const jsAttrFontSizes =
    jsWithoutComments.match(
      /font[-_]?[sS]ize["']?\s*[,:=]\s*["']?(\d{2,3})\b/g
    ) ?? [];
  const jsDrawTextSizes = Array.from(
    jsWithoutComments.matchAll(
      /\bdrawText\s*\([^,\n]+,[^,\n]+,[^,\n]+,\s*(\d{2,3})\b/g
    ),
    (m) => m[1]
  );
  const canvasFonts =
    jsWithoutComments.match(/ctx\.font\s*=\s*[`"''][^`"']*?(\d{2,3})px/gi) ?? [];
  const uniqueSizes = new Set<string>(
    [
      ...cssFontSizes,
      ...svgFontSizes,
      ...jsAttrFontSizes,
      ...jsDrawTextSizes,
      ...canvasFonts,
    ]
      .map((s) => {
        const num = s.match(/\d{2,3}/);
        return num ? num[0] : "";
      })
      .filter(Boolean)
  );
  const distinctFontSizesCount = uniqueSizes.size;
  const hasTabularNumerals =
    /tabular-nums|JetBrains\s*Mono|IBM\s*Plex\s*Mono|Space\s*Mono|monospace/i.test(
      html
    );
  const typographyPassed =
    distinctFontSizesCount >= 3 &&
    (hasGoogleFonts || hasTabularNumerals) &&
    (!ctx.profile.requiresDataVisualization || hasTabularNumerals);

  // 6. Visualização de Dados, Indicadores e Honestidade Factual (verificando palco visível fora do JSON blueprint)
  const htmlWithoutBlueprintJson = html.replace(
    /<script[^>]*id=["']ms-director-blueprint["'][^>]*>[\s\S]*?<\/script>/gi,
    ""
  );
  const hasChartOrFlowAnatomy =
    /\b(?:axis|eixo|grid|tick|legend|legenda|series|bar|chart|flow|node|pib|consumo|infla|juros|stroke-dashoffset|setLineDash)\b/i.test(
      htmlWithoutBlueprintJson
    );
  const hasIllustrativeDisclaimerWhenNeeded =
    ctx.profile.hasExplicitUserNumbers ||
    !ctx.profile.requiresDataVisualization ||
    /\b(?:ilustrativ\w*|did[áa]tic\w*|hipot[ée]tic\w*|[íi]ndice\s+base)/i.test(
      htmlWithoutBlueprintJson
    );
  const dataRigorPassed =
    (!ctx.profile.requiresDataVisualization &&
      !ctx.profile.requiresFlowchartOrSystemDiagram) ||
    (hasChartOrFlowAnatomy && hasIllustrativeDisclaimerWhenNeeded);

  // 7. Direção de Fotografia e Câmera Virtual / Parallax
  const hasCameraRig =
    /\b(?:cam(?:era)?[A-Z_a-z0-9]*|camZoom|camX|camY|dolly|parallax|perspective|rotateX|rotateY|viewBox)\b/.test(
      jsWithoutComments
    ) ||
    (/ctx\.translate\s*\(\s*960\s*,\s*540\s*\)/.test(jsWithoutComments) &&
      /ctx\.scale\s*\(/.test(jsWithoutComments));

  // 8. Transições Sofisticadas (Máscaras, Clip-Paths, Trim-Paths, Morphing)
  const hasMaskOrPathTransitions =
    /<clipPath\b|<mask\b|clip-path\s*:|ctx\.clip\s*\(|stroke-dashoffset|strokeDashoffset|morph/i.test(
      html
    );

  // 9. Variedade de Movimento e Curvas de Easing Não-Lineares
  const hasNonlinearEasing =
    /Math\.pow\s*\(|Math\.cos\s*\(|Math\.exp\s*\(|\bease(?:Out|In|InOut)/i.test(
      jsWithoutComments
    );
  const hasStaggerOrWave =
    /\bstagger|\bdelay|\bidx\s*\*\s*0\.|\bi\s*\*\s*0\.|\bbezier/i.test(
      jsWithoutComments
    );
  const motionVarietyPassed = hasNonlinearEasing && hasStaggerOrWave;

  // 10. Coerência de Planejamento Criativo Pré-HTML
  const blueprintPassed = hasDirectorBlueprint;

  const criteria: MotionQualityCriterionCheck[] = [
    {
      id: "determinism_and_clamping",
      label: "Determinismo Estrito & Interpolação Limitada",
      passed: determinismPassed,
      evidence: determinismPassed
        ? "Zero Math.random()/Date.now() em seek(t) e funções clamp ativas."
        : `Violação detectada (Math.random=${usesMathRandom}, Date.now=${usesDateNow}, keyframesCSS=${hasAutonomousKeyframes}, clamp=${hasClampLogic}).`,
    },
    {
      id: "duration_and_scene_progression",
      label: "Duração Adaptativa & Progressão Multicena",
      passed: durationAndScenesPassed,
      evidence: `DURATION=${declaredDuration ?? "ausente"}s (mín esperado ~${minAllowedDur.toFixed(1)}s), ~${detectedScenesOrChapters} blocos/cenas detectados.`,
    },
    {
      id: "illustration_and_vector_craft",
      label: "Acabamento Vetorial & Ilustrações Compostas",
      passed: illustrationPassed,
      evidence: `${vectorPathsCount} construções vetoriais complexas e ${curvedCommands} segmentos curvos Bezier/arcos.`,
    },
    {
      id: "composition_and_depth_layers",
      label: "Composição Editorial & Profundidade em Camadas",
      passed: compositionPassed,
      evidence: `Camadas estruturais=${hasMultiLayerGroups}, iluminação/sombras=${hasGradientsOrShadows}, moldura/grid editorial=${hasGridOrEditorialChrome}.`,
    },
    {
      id: "typographic_hierarchy",
      label: "Hierarquia Tipográfica & Números Tabulares",
      passed: typographyPassed,
      evidence: `${distinctFontSizesCount} escalas tipográficas distintas, Google Fonts=${hasGoogleFonts}, tabular/mono=${hasTabularNumerals}.`,
    },
    {
      id: "data_and_diagram_rigor",
      label: "Visualização de Dados, Fluxos & Transparência Factual",
      passed: dataRigorPassed,
      evidence: `Anatomia de gráficos/fluxos=${hasChartOrFlowAnatomy}, rotulagem honesta de dados=${hasIllustrativeDisclaimerWhenNeeded}.`,
    },
    {
      id: "camera_choreography",
      label: "Direção de Câmera & Parallax Espacial",
      passed: hasCameraRig,
      evidence: hasCameraRig
        ? "Rig de câmera virtual / parallax multi-plano identificado."
        : "Ausência de movimentação de câmera ou parallax entre planos.",
    },
    {
      id: "transition_sophistication",
      label: "Transições por Máscara, Recorte ou Caminho",
      passed: hasMaskOrPathTransitions,
      evidence: hasMaskOrPathTransitions
        ? "Uso verificado de clipPath/mask/ctx.clip/stroke-dashoffset."
        : "Apenas transições básicas sem máscaras ou traçados progressivos.",
    },
    {
      id: "motion_variety_and_easing",
      label: "Física de Easing & Escalonamento (Stagger)",
      passed: motionVarietyPassed,
      evidence: `Curvas não-lineares=${hasNonlinearEasing}, escalonamento/ondas=${hasStaggerOrWave}.`,
    },
    {
      id: "creative_blueprint_coherence",
      label: "Plano Diretor Criativo & Coerência de Estilo",
      passed: blueprintPassed,
      evidence: blueprintPassed
        ? "Blueprint de direção criativa presente e alinhado ao estilo."
        : "Blueprint prévio (#ms-director-blueprint) ausente.",
    },
  ];

  // Deficiências críticas que exigem aprimoramento antes da entrega
  const criticalDeficiencies: string[] = [];
  if (!determinismPassed) {
    criticalDeficiencies.push(
      "Substitua imediatamente qualquer Math.random(), Date.now(), setInterval ou @keyframes CSS por funções matemáticas puras de `t` (hash determinístico) e aplique `clamp01` em todas as interpolações."
    );
  }
  if (!durationAndScenesPassed) {
    criticalDeficiencies.push(
      `Ajuste window.DURATION para cobrir confortavelmente o conteúdo (~${
        ctx.expectedDurationSeconds ?? ctx.profile.recommendedMinDuration
      }s) e estruture ao menos ${
        ctx.expectedSceneCount ?? ctx.profile.recommendedMinScenes
      } cenas distintas e progressivas.`
    );
  }
  if (!illustrationPassed) {
    criticalDeficiencies.push(
      "A animação está usando formas geométricas primitivas demais. Construa ilustrações vetoriais profissionais compostas por múltiplos `<path>` curvos (Bezier), símbolos detalhados em camadas, gráficos com eixos/legendas e diagramas ricos."
    );
  }
  if (!typographyPassed) {
    criticalDeficiencies.push(
      "Estabeleça hierarquia tipográfica editorial real com Google Fonts, ao menos 3 escalas de texto distintas (índice/kicker, título heroico, subtítulo/corpo) e `tabular-nums`/monospace nos indicadores numéricos."
    );
  }
  if (!hasCameraRig || !hasMaskOrPathTransitions) {
    criticalDeficiencies.push(
      "Adicione movimentação intencional de câmera virtual (`camX, camY, camZoom` + parallax entre planos) e transições sofisticadas usando máscaras (`clipPath`/`ctx.clip`) e desenho progressivo de caminhos (`stroke-dashoffset`)."
    );
  }
  if (!dataRigorPassed) {
    criticalDeficiencies.push(
      "Inclua gráficos/fluxogramas completos com escalas, rótulos e, caso utilize valores exemplificativos não citados literalmente no roteiro, identifique-os explicitamente na tela como 'Valores ilustrativos'."
    );
  }

  const failedCount = criteria.filter((c) => !c.passed).length;
  // Requer refinamento se falhar determinismo, ilustração rica, duração/cenas ou acumular >= 3 falhas
  const passed =
    determinismPassed &&
    illustrationPassed &&
    durationAndScenesPassed &&
    failedCount <= 2;

  return {
    passed,
    refinementApplied: false,
    criteria,
    deficienciesFixedOrRemaining: criticalDeficiencies,
    criticalDeficiencies,
    metrics: {
      declaredDurationSeconds: declaredDuration,
      detectedScenesOrChapters,
      vectorPathsCount,
      curvedVectorCommandsCount: curvedCommands,
      distinctFontSizesCount,
      hasDirectorBlueprint,
      hasCameraRig,
      hasMaskOrPathTransitions,
      hasTabularNumerals,
      isDeterministicSeek,
    },
  };
}
