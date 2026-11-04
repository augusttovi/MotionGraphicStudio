export interface AdaptiveDurationAnalysis {
  durationSeconds: number;
  hasExplicitTimestamps: boolean;
  detectedSceneCount: number;
  wordCount: number;
  hasDataOrUiComplexity: boolean;
  rationale: string;
}

/**
 * Analisa o roteiro para determinar a duração de forma adaptativa:
 * - Respeita timestamps ou durações explícitas fornecidas pelo usuário.
 * - Quando ausentes, estima o tempo ideal com base na quantidade de conteúdo,
 *   cenas implícitas/explícitas, tempo de leitura, compreensão de dados/interfaces,
 *   pausas narrativas e transições (sem fixar tudo em 10s ou 12s).
 */
export function analyzeAdaptiveScriptTiming(script: string): AdaptiveDurationAnalysis | null {
  if (!script || !script.trim()) return null;

  const trimmed = script.trim();
  const words = trimmed.split(/\s+/).filter(Boolean);
  const wordCount = words.length;

  let maxExplicitSeconds = 0;

  // 1. Duração total explícita pedida (ex: "duração de 6s", "vinheta de 4 segundos", "vídeo de 25s")
  const explicitTotalRegex =
    /\b(?:dura[çc][ãa]o|total|vinheta|bumper|anima[çc][ãa]o|v[íi]deo)\s+(?:de\s+|com\s+)?(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:s|seg|segs|segundo|segundos)\b/gi;
  let match: RegExpExecArray | null;
  while ((match = explicitTotalRegex.exec(trimmed)) !== null) {
    const val = parseFloat(match[1].replace(",", "."));
    if (Number.isFinite(val) && val > 0 && val <= 600) {
      return {
        durationSeconds: Number(Math.max(2.5, val).toFixed(2)),
        hasExplicitTimestamps: true,
        detectedSceneCount: Math.max(1, countImplicitScenes(trimmed)),
        wordCount,
        hasDataOrUiComplexity: detectDataOrUiComplexity(trimmed),
        rationale: `Duração explícita solicitada no roteiro (${val}s).`,
      };
    }
  }

  // 2. Padrões mm:ss ou mm:ss.d (ex: 00:24, 01:12.5)
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

  // 3. Marcadores explícitos em segundos (ex: "15,5s", "aos 19 segundos", "14s a 22,5s")
  const secondsRegex =
    /(?:^|[^\d:])(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:s|seg|segs|segundo|segundos)\b/gi;
  while ((match = secondsRegex.exec(trimmed)) !== null) {
    const val = parseFloat(match[1].replace(",", "."));
    if (Number.isFinite(val) && val > maxExplicitSeconds && val <= 600) {
      maxExplicitSeconds = val;
    }
  }

  // 4. Intervalos de tempo (ex: "12.0 - 26.0s" ou "[04 - 16s]")
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

  const detectedSceneCount = countImplicitScenes(trimmed);
  const hasDataOrUiComplexity = detectDataOrUiComplexity(trimmed);

  if (maxExplicitSeconds > 0) {
    const withBreathingRoom = Number((maxExplicitSeconds + 1.5).toFixed(2));
    return {
      durationSeconds: withBreathingRoom,
      hasExplicitTimestamps: true,
      detectedSceneCount,
      wordCount,
      hasDataOrUiComplexity,
      rationale: `Calculada a partir do último timestamp explícito (${maxExplicitSeconds}s) + 1.5s de respiro final.`,
    };
  }

  // 5. Estimativa Adaptativa quando o usuário não especifica duração nem timestamps
  const isLogoStingOrBumper =
    wordCount <= 16 &&
    /\b(logo|logotipo|vinheta|bumper|sting|abertura curta|assinatura)\b/i.test(trimmed);

  if (isLogoStingOrBumper) {
    return {
      durationSeconds: 5.0,
      hasExplicitTimestamps: false,
      detectedSceneCount: 1,
      wordCount,
      hasDataOrUiComplexity: false,
      rationale: "Vinheta/assinatura concisa detectada (~5.0s para impacto + estabilização da marca).",
    };
  }

  // Tempo base de leitura e narração (~2.6 palavras/segundo)
  const readingTime = wordCount / 2.6;
  // Tempo estrutural para entrada, absorção visual e transições entre cenas
  const sceneTransitionAllowance = detectedSceneCount * 1.65;
  // Tempo adicional para compreensão de gráficos, mapas, pesquisas ou interfaces
  const complexityAllowance = hasDataOrUiComplexity ? 2.8 : 0.8;

  const rawAdaptive = readingTime + sceneTransitionAllowance + complexityAllowance;
  const clampedAdaptive = Number(Math.max(4.5, Math.min(90, rawAdaptive)).toFixed(1));

  return {
    durationSeconds: clampedAdaptive,
    hasExplicitTimestamps: false,
    detectedSceneCount,
    wordCount,
    hasDataOrUiComplexity,
    rationale: `Duração adaptativa baseada em ${wordCount} palavras, ~${detectedSceneCount} cena(s)${
      hasDataOrUiComplexity ? ", tempo de leitura de dados/UI" : ""
    } e pausas de transição.`,
  };
}

function countImplicitScenes(script: string): number {
  const explicitSceneMatches = script.match(/\b(?:cena|ato|parte|etapa|bloco|quadro)\s*\d+/gi);
  if (explicitSceneMatches && explicitSceneMatches.length > 0) {
    return Math.min(12, explicitSceneMatches.length);
  }

  const paragraphs = script
    .split(/\n\s*\n+/)
    .map((p) => p.trim())
    .filter((p) => p.length > 0);
  if (paragraphs.length >= 2) {
    return Math.min(10, paragraphs.length);
  }

  const sentences = script
    .split(/[.!?]+\s+/)
    .map((s) => s.trim())
    .filter((s) => s.length > 8);
  return Math.max(1, Math.min(8, Math.ceil(sentences.length / 2)));
}

function detectDataOrUiComplexity(script: string): boolean {
  return /\b(gráfico|mapa|rota|comparação|versus|%|pesquisa|google|interface|dashboard|fluxograma|dados|ranking|estatística)\b/i.test(
    script
  );
}

/**
 * Mantém a assinatura original usada pelo estúdio, agora retornando a duração adaptativa inteligente.
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
        estimateText: "45 a 90 segundos (roteiro extenso acima de 40s)",
        isLongVideo: true,
      };
    }
    return {
      estimateText: "25 a 55 segundos (múltiplas cenas acima de 20s)",
      isLongVideo: true,
    };
  }

  return {
    estimateText: "12 a 28 segundos",
    isLongVideo: false,
  };
}
