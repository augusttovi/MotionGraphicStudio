export interface AdaptiveDurationAnalysis {
  durationSeconds: number;
  hasExplicitTimestamps: boolean;
  detectedSceneCount: number;
  detectedTopicCount: number;
  wordCount: number;
  hasDataOrUiComplexity: boolean;
  hasSystemicFlowComplexity: boolean;
  rationale: string;
}

/**
 * Extrai a quantidade de pilares conceituais / subtópicos enumerados no roteiro,
 * evitando que roteiros concisos porém densos (ex: 8 conceitos macroeconômicos em 2 frases)
 * recebam durações curtas incompatíveis com a densidade informativa.
 */
export function countConceptualTopics(script: string): number {
  const trimmed = script.trim();
  if (!trimmed) return 0;

  // Listas com marcadores ou numeração
  const bulletLines = trimmed
    .split(/\n+/)
    .map((l) => l.trim())
    .filter((l) => /^(?:[-•*▪▸]|\d+[.)])\s+\S+/.test(l));

  // Enumerações separadas por vírgula / "e" (ex: "PIB, consumo, investimentos, governo, inflação, juros, emprego e comércio exterior")
  const clauses = trimmed.split(/[.!?;:\n]+/);
  let maxCommaListItems = 0;
  for (const clause of clauses) {
    const commaParts = clause
      .split(/\s*,\s*|\s+e\s+|\s+ou\s+/i)
      .map((item) => item.trim())
      .filter((item) => item.length >= 3 && item.split(/\s+/).length <= 7);
    if (clause.includes(",") && commaParts.length >= 4) {
      maxCommaListItems = Math.max(maxCommaListItems, commaParts.length);
    }
  }

  return Math.min(12, Math.max(bulletLines.length, maxCommaListItems));
}

/**
 * Analisa o roteiro para determinar a duração de forma adaptativa:
 * - Respeita timestamps ou durações explícitas fornecidas pelo usuário.
 * - Quando ausentes, estima o tempo ideal com base na quantidade de conteúdo,
 *   pilares conceituais enumerados, cenas implícitas/explícitas, tempo de leitura,
 *   compreensão de gráficos/fluxogramas/interfaces, pausas narrativas e transições.
 */
export function analyzeAdaptiveScriptTiming(
  script: string
): AdaptiveDurationAnalysis | null {
  if (!script || !script.trim()) return null;

  const trimmed = script.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordCount = words.length;
  const detectedTopicCount = countConceptualTopics(trimmed);
  const hasDataOrUiComplexity = detectDataOrUiComplexity(trimmed);
  const hasSystemicFlowComplexity = detectSystemicFlowComplexity(trimmed);

  let maxExplicitSeconds = 0;

  // 1. Intervalo explícito de duração alvo (ex: "entre 45 e 60 segundos", "de 40 a 55s")
  const explicitSpanRegex =
    /\b(?:entre|de)\s+(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:e|a|até)\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:s|seg|segs|segundo|segundos)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = explicitSpanRegex.exec(trimmed)) !== null) {
    const minVal = parseFloat(match[1].replace(",", "."));
    const maxVal = parseFloat(match[2].replace(",", "."));
    if (
      Number.isFinite(minVal) &&
      Number.isFinite(maxVal) &&
      maxVal > minVal &&
      minVal >= 10 &&
      maxVal <= 600
    ) {
      const targetMid = Number(((minVal + maxVal) / 2).toFixed(1));
      const baseScenes = countImplicitScenes(trimmed, detectedTopicCount);
      return {
        durationSeconds: targetMid,
        hasExplicitTimestamps: true,
        detectedSceneCount: Math.max(baseScenes, Math.round(targetMid / 6.5)),
        detectedTopicCount,
        wordCount,
        hasDataOrUiComplexity,
        hasSystemicFlowComplexity,
        rationale: `Faixa de duração explícita solicitada (${minVal}s–${maxVal}s; alvo ${targetMid}s).`,
      };
    }
  }

  // 2. Duração total explícita pedida (ex: "duração de 6s", "vinheta de 4 segundos", "vídeo de 52s")
  const explicitTotalRegex =
    /\b(?:dura[çc][ãa]o|total|vinheta|bumper|anima[çc][ãa]o|v[íi]deo)\s+(?:de\s+|com\s+|aproximadamente\s+)?(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:s|seg|segs|segundo|segundos)\b/gi;
  while ((match = explicitTotalRegex.exec(trimmed)) !== null) {
    const val = parseFloat(match[1].replace(",", "."));
    if (Number.isFinite(val) && val > 0 && val <= 600) {
      return {
        durationSeconds: Number(Math.max(2.5, val).toFixed(2)),
        hasExplicitTimestamps: true,
        detectedSceneCount: Math.max(
          1,
          countImplicitScenes(trimmed, detectedTopicCount)
        ),
        detectedTopicCount,
        wordCount,
        hasDataOrUiComplexity,
        hasSystemicFlowComplexity,
        rationale: `Duração explícita solicitada no roteiro (${val}s).`,
      };
    }
  }

  // 3. Padrões mm:ss ou mm:ss.d (ex: 00:24, 01:12.5)
  const colonRegex = /\b(\d{1,2}):(\d{2})(?:[.,](\d{1,2}))?\b/g;
  while ((match = colonRegex.exec(trimmed)) !== null) {
    const mins = parseInt(match[1], 10);
    const secs = parseInt(match[2], 10);
    const frac = match[3] ? parseFloat(`0.${match[3]}`) : 0;
    if (secs < 60) {
      const total = mins * 60 + secs + frac;
      if (total > maxExplicitSeconds && total <= 600) {
        maxExplicitSeconds = total;
      }
    }
  }

  // 4. Marcadores explícitos em segundos (ex: "15,5s", "aos 19 segundos", "14s a 22,5s")
  const secondsRegex =
    /(?:^|[^\d:])(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:s|seg|segs|segundo|segundos)\b/gi;
  while ((match = secondsRegex.exec(trimmed)) !== null) {
    const val = parseFloat(match[1].replace(",", "."));
    if (Number.isFinite(val) && val > maxExplicitSeconds && val <= 600) {
      maxExplicitSeconds = val;
    }
  }

  // 5. Intervalos de tempo (ex: "12.0 - 26.0s" ou "[04 - 16s]")
  const rangeRegex =
    /\b(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:-|–|—|até|a)\s*(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:s|seg|segundos)\b/gi;
  while ((match = rangeRegex.exec(trimmed)) !== null) {
    const endVal = parseFloat(match[2].replace(",", "."));
    const startVal = parseFloat(match[1].replace(",", "."));
    if (
      Number.isFinite(startVal) &&
      Number.isFinite(endVal) &&
      endVal >= startVal &&
      endVal <= 600 &&
      endVal > maxExplicitSeconds
    ) {
      maxExplicitSeconds = endVal;
    }
  }

  const detectedSceneCount = countImplicitScenes(trimmed, detectedTopicCount);

  if (maxExplicitSeconds > 0) {
    const withBreathingRoom = Number((maxExplicitSeconds + 1.5).toFixed(2));
    return {
      durationSeconds: withBreathingRoom,
      hasExplicitTimestamps: true,
      detectedSceneCount,
      detectedTopicCount,
      wordCount,
      hasDataOrUiComplexity,
      hasSystemicFlowComplexity,
      rationale: `Calculada a partir do último timestamp explícito (${maxExplicitSeconds}s) + 1.5s de respiro final.`,
    };
  }

  // 6. Estimativa Adaptativa Inteligente (considerando palavras + densidade conceitual + visualização de dados)
  const isLogoStingOrBumper =
    wordCount <= 16 &&
    detectedTopicCount <= 2 &&
    /\b(logo|logotipo|vinheta|bumper|sting|abertura curta|assinatura)\b/i.test(
      trimmed
    );

  if (isLogoStingOrBumper) {
    return {
      durationSeconds: 5.0,
      hasExplicitTimestamps: false,
      detectedSceneCount: 1,
      detectedTopicCount: 1,
      wordCount,
      hasDataOrUiComplexity: false,
      hasSystemicFlowComplexity: false,
      rationale:
        "Vinheta/assinatura concisa detectada (~5.0s para impacto + estabilização da marca).",
    };
  }

  // Tempo pela prosa falada/lida (~2.5 palavras/segundo)
  const readingTime = wordCount / 2.5;
  // Tempo mínimo necessário para desenvolver visualmente cada cena/conceito com abertura, leitura de gráficos e transição
  const perSceneVisualAllowance = hasDataOrUiComplexity || hasSystemicFlowComplexity ? 5.8 : 4.4;
  const conceptualFloorSeconds =
    detectedTopicCount >= 4
      ? detectedSceneCount * perSceneVisualAllowance + 4.0
      : 0;

  const sceneTransitionAllowance = detectedSceneCount * 2.1;
  const complexityAllowance =
    (hasDataOrUiComplexity ? 3.5 : 0.8) + (hasSystemicFlowComplexity ? 3.0 : 0);

  const proseBasedDuration =
    readingTime + sceneTransitionAllowance + complexityAllowance;
  const rawAdaptive = Math.max(proseBasedDuration, conceptualFloorSeconds);
  const clampedAdaptive = Number(
    Math.max(5.0, Math.min(95, rawAdaptive)).toFixed(1)
  );

  return {
    durationSeconds: clampedAdaptive,
    hasExplicitTimestamps: false,
    detectedSceneCount,
    detectedTopicCount,
    wordCount,
    hasDataOrUiComplexity,
    hasSystemicFlowComplexity,
    rationale: `Duração adaptativa baseada em ${wordCount} palavras, ~${detectedSceneCount} cena(s)${
      detectedTopicCount >= 4 ? ` (${detectedTopicCount} pilares conceituais)` : ""
    }${hasDataOrUiComplexity ? ", absorção de gráficos/indicadores" : ""}${
      hasSystemicFlowComplexity ? ", leitura de fluxos sistêmicos" : ""
    } e transições cinematográficas.`,
  };
}

function countImplicitScenes(script: string, conceptualTopics: number): number {
  const explicitSceneMatches = script.match(
    /\b(?:cena|ato|parte|etapa|bloco|quadro|cap[íi]tulo)\s*\d+/gi
  );
  if (explicitSceneMatches && explicitSceneMatches.length > 0) {
    return Math.min(12, Math.max(explicitSceneMatches.length, conceptualTopics));
  }

  const paragraphs = script
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);

  const sentences = script
    .split(/[.!?]+\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);

  const fromStructure =
    paragraphs.length >= 2
      ? Math.min(10, paragraphs.length)
      : Math.max(1, Math.min(9, Math.ceil(sentences.length / 1.8)));

  if (conceptualTopics >= 4) {
    // Inclui abertura/síntese além dos pilares conceituais enumerados
    return Math.min(11, Math.max(fromStructure, conceptualTopics + 1));
  }

  return fromStructure;
}

function detectDataOrUiComplexity(script: string): boolean {
  return /\b(gr[áa]fico|mapa|rota|compara[çc][ãa]o|versus|%|pesquisa|google|interface|dashboard|fluxograma|dados|ranking|estat[íi]stica|indicador|indicadores|pib|infla[çc][ãa]o|juros|emprego|balan[çc]a|com[ée]rcio|taxa|receita|or[çc]amento)\b/i.test(
    script
  );
}

function detectSystemicFlowComplexity(script: string): boolean {
  return /\b(como funciona|sistema|ciclo|circula[çc][ãa]o|cadeia|economia|ecossistema|processo|arquitetura|fluxo|conex[õo]es|mercado|investimento|consumo|governo|exporta[çc][ãa]o|importa[çc][ãa]o)\b/i.test(
    script
  );
}

/**
 * Mantém a assinatura original usada pelo estúdio, retornando a duração adaptativa inteligente.
 */
export function estimateScriptVideoDuration(script: string): number | null {
  const analysis = analyzeAdaptiveScriptTiming(script);
  return analysis ? analysis.durationSeconds : null;
}

/**
 * Calcula a estimativa legível do tempo de síntese da IA.
 */
export function getRenderTimeEstimateLabel(
  estimatedVideoDuration: number | null
): {
  estimateText: string;
  isLongVideo: boolean;
} {
  if (estimatedVideoDuration !== null && estimatedVideoDuration > 20) {
    if (estimatedVideoDuration > 40) {
      return {
        estimateText: "35 a 85 segundos (produção multicena de 45–60s+)",
        isLongVideo: true,
      };
    }
    return {
      estimateText: "20 a 50 segundos (múltiplas cenas acima de 20s)",
      isLongVideo: true,
    };
  }

  return {
    estimateText: "12 a 28 segundos",
    isLongVideo: false,
  };
}
