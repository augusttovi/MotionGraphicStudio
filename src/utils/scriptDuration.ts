/**
 * Parses timestamps in user scripts (e.g., "15,5s", "15.5s", "00:24", "12s - 28,5s", "t = 32s")
 * to estimate the target animation duration (last timestamp + 1.5s breathing room).
 */
export function estimateScriptVideoDuration(script: string): number | null {
  if (!script || !script.trim()) return null;

  let maxSeconds = 0;

  // Match mm:ss or mm:ss.d patterns (e.g. 00:24, 01:12.5, 1:05,5)
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

  // Match explicit second markers (e.g. "15,5s", "28.4 seg", "aos 19 segundos", "14s a 22,5s")
  const secondsRegex =
    /(?:^|[^\d:])(\d{1,3}(?:[.,]\d{1,2})?)\s*(?:s|seg|segs|segundo|segundos)\b/gi;
  while ((match = secondsRegex.exec(script)) !== null) {
    const val = parseFloat(match[1].replace(",", "."));
    if (Number.isFinite(val) && val > maxSeconds && val <= 600) {
      maxSeconds = val;
    }
  }

  // Match range patterns without unit on first number (e.g. "18,0 - 24,5" or "[12.0 - 26.0]")
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

  // Fallback heuristic based on script length when no explicit timestamps are written
  const wordCount = script.trim().split(/\s+/).length;
  if (wordCount > 180) {
    return Math.min(60, Math.round(wordCount / 7));
  }

  return null;
}

/**
 * Computes human-readable AI generation time estimate based on target animation duration.
 * Longer animations (> 20s) display a higher expected render/synthesis window.
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
      estimateText: "30 a 60 segundos (animação longa acima de 20s)",
      isLongVideo: true,
    };
  }

  return {
    estimateText: "12 a 25 segundos",
    isLongVideo: false,
  };
}
