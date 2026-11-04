import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Maximize2, Minimize2, Pause, Play, RotateCcw, Film } from "lucide-react";
import { buildPreviewSrcDoc } from "../utils/iframeBridge";
import { getRenderTimeEstimateLabel } from "../utils/scriptDuration";

interface PreviewStageProps {
  generatedHtml: string;
  isGenerating: boolean;
  elapsedSeconds: number;
  estimatedVideoDuration: number | null;
  externalSeekRequest?: { time: number; nonce: number } | null;
  loadingLabel?: string;
  loadingSubtitle?: string;
}

function formatTimecode(seconds: number): string {
  const safe = Math.max(0, Number.isFinite(seconds) ? seconds : 0);
  const mins = Math.floor(safe / 60);
  const secs = safe % 60;
  const minsStr = String(mins).padStart(2, "0");
  const secsWhole = String(Math.floor(secs)).padStart(2, "0");
  const hundredths = String(Math.floor((secs % 1) * 100)).padStart(2, "0");
  return `${minsStr}:${secsWhole}.${hundredths}`;
}

function readWindowDuration(win: Window | null | undefined): number | null {
  if (!win) return null;
  try {
    const record = win as unknown as Record<string, unknown>;
    const raw =
      record.DURATION ??
      record.duration ??
      record.TOTAL_DURATION ??
      record.__msFallbackDuration;
    if (typeof raw === "number" && Number.isFinite(raw) && raw > 0) {
      return raw;
    }
    if (typeof raw === "string") {
      const parsed = parseFloat(raw.replace(",", "."));
      if (Number.isFinite(parsed) && parsed > 0) {
        return parsed;
      }
    }
  } catch {
    // Ignore cross-frame access errors if any
  }
  return null;
}

export function PreviewStage({
  generatedHtml,
  isGenerating,
  elapsedSeconds,
  estimatedVideoDuration,
  externalSeekRequest,
  loadingLabel,
  loadingSubtitle,
}: PreviewStageProps) {
  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const stageWrapperRef = useRef<HTMLDivElement | null>(null);

  const [isPlaying, setIsPlaying] = useState<boolean>(true);
  const [currentTime, setCurrentTime] = useState<number>(0);
  const [duration, setDuration] = useState<number>(0);
  const [isPseudoFullscreen, setIsPseudoFullscreen] = useState<boolean>(false);
  const [isNativeFullscreen, setIsNativeFullscreen] = useState<boolean>(false);

  const previewSrcDoc = useMemo(
    () => buildPreviewSrcDoc(generatedHtml),
    [generatedHtml]
  );

  const renderEstimate = useMemo(
    () => getRenderTimeEstimateLabel(estimatedVideoDuration),
    [estimatedVideoDuration]
  );

  // Reset playback state when a new generation starts or arrives
  useEffect(() => {
    if (isGenerating) {
      setCurrentTime(0);
      setDuration(0);
    } else if (generatedHtml) {
      setIsPlaying(true);
      setCurrentTime(0);
    }
  }, [generatedHtml, isGenerating]);

  // Read iframe.contentWindow.DURATION directly as soon as the iframe finishes loading
  const handleIframeLoad = useCallback(() => {
    const detected = readWindowDuration(iframeRef.current?.contentWindow);
    if (detected !== null && detected > 0) {
      setDuration(detected);
    }
  }, []);

  // Listen to live time & dynamic duration synchronization messages from inside the iframe
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "MALASOMBRE_TIME") {
        if (typeof data.duration === "number" && Number.isFinite(data.duration) && data.duration > 0) {
          setDuration(data.duration);
        } else {
          const direct = readWindowDuration(iframeRef.current?.contentWindow);
          if (direct !== null && direct > 0) {
            setDuration(direct);
          }
        }
        if (typeof data.currentTime === "number" && Number.isFinite(data.currentTime)) {
          setCurrentTime(data.currentTime);
        }
        if (typeof data.isPlaying === "boolean") {
          setIsPlaying(data.isPlaying);
        }
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  // Track native Fullscreen API changes and Escape key for pseudo-fullscreen fallback
  useEffect(() => {
    const onFullscreenChange = () => {
      setIsNativeFullscreen(Boolean(document.fullscreenElement));
    };
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key === "Escape" && isPseudoFullscreen) {
        setIsPseudoFullscreen(false);
      }
    };

    document.addEventListener("fullscreenchange", onFullscreenChange);
    window.addEventListener("keydown", onKeyDown);
    return () => {
      document.removeEventListener("fullscreenchange", onFullscreenChange);
      window.removeEventListener("keydown", onKeyDown);
    };
  }, [isPseudoFullscreen]);

  const postToIframe = useCallback((payload: Record<string, unknown>) => {
    const win = iframeRef.current?.contentWindow;
    if (win) {
      win.postMessage(payload, "*");
    }
  }, []);

  useEffect(() => {
    if (!externalSeekRequest || !generatedHtml || isGenerating) return;
    const target = Math.max(0, externalSeekRequest.time);
    setCurrentTime(target);
    setIsPlaying(false);
    postToIframe({ type: "MALASOMBRE_CMD_PAUSE" });
    postToIframe({ type: "MALASOMBRE_CMD_SEEK", time: target });
  }, [externalSeekRequest, generatedHtml, isGenerating, postToIframe]);

  const handleTogglePlay = () => {
    if (!generatedHtml) return;
    const directDuration = readWindowDuration(iframeRef.current?.contentWindow);
    if (directDuration !== null && directDuration > 0 && directDuration !== duration) {
      setDuration(directDuration);
    }

    if (isPlaying) {
      setIsPlaying(false);
      postToIframe({ type: "MALASOMBRE_CMD_PAUSE" });
    } else {
      setIsPlaying(true);
      postToIframe({ type: "MALASOMBRE_CMD_PLAY" });
    }
  };

  const handleRestart = () => {
    if (!generatedHtml) return;
    setCurrentTime(0);
    postToIframe({ type: "MALASOMBRE_CMD_SEEK", time: 0 });
    setIsPlaying(true);
    postToIframe({ type: "MALASOMBRE_CMD_PLAY" });
  };

  const handleScrub = (event: React.ChangeEvent<HTMLInputElement>) => {
    if (!generatedHtml) return;
    const nextTime = parseFloat(event.target.value);
    setCurrentTime(nextTime);
    if (isPlaying) {
      setIsPlaying(false);
      postToIframe({ type: "MALASOMBRE_CMD_PAUSE" });
    }
    postToIframe({ type: "MALASOMBRE_CMD_SEEK", time: nextTime });
  };

  const handleToggleFullscreen = async () => {
    const wrapper = stageWrapperRef.current;
    if (!wrapper) return;

    if (document.fullscreenElement) {
      try {
        await document.exitFullscreen();
        return;
      } catch {
        // Fallback below
      }
    }

    if (isPseudoFullscreen) {
      setIsPseudoFullscreen(false);
      return;
    }

    if (wrapper.requestFullscreen) {
      try {
        await wrapper.requestFullscreen();
        return;
      } catch {
        setIsPseudoFullscreen(true);
      }
    } else {
      setIsPseudoFullscreen(true);
    }
  };

  const isFullscreenActive = isNativeFullscreen || isPseudoFullscreen;
  const hasAnimation = Boolean(generatedHtml) && !isGenerating;
  const effectiveMaxDuration = duration > 0 ? duration : 1;

  return (
    <div
      ref={stageWrapperRef}
      className={
        isPseudoFullscreen
          ? "fixed inset-0 z-50 bg-[#000000] flex flex-col justify-between p-4 sm:p-6"
          : "w-full rounded-xl border border-[#8a2be2]/25 bg-[#0d0914] overflow-hidden"
      }
    >
      {/* 16:9 Pure Black Preview Monitor */}
      <div
        className={
          isPseudoFullscreen
            ? "relative flex-1 w-full flex items-center justify-center bg-[#000000] overflow-hidden rounded-lg"
            : "relative w-full aspect-video bg-[#000000] overflow-hidden"
        }
      >
        {isGenerating ? (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(circle_at_center,#2a0033_0%,#000000_72%)] px-6 text-center">
            <div className="w-12 h-12 rounded-full border-2 border-[#8a2be2]/30 border-t-[#8a2be2] animate-spin mb-5" />
            <p className="font-display text-xl sm:text-2xl tracking-wide uppercase text-white">
              {loadingLabel || "Renderizando Motion Graphic Determinístico"}
            </p>
            <p className="mt-2 text-sm text-[#c5b8d8] max-w-lg leading-relaxed">
              {loadingSubtitle ||
                "Sincronizando direção criativa, cenas e função window.seek(t) em 1920×1080..."}
            </p>

            <div className="mt-5 space-y-1.5 text-xs font-mono tabular-nums">
              {estimatedVideoDuration !== null && (
                <p className="text-[#d7c6ef]">
                  Duração alvo detectada no roteiro: ~{estimatedVideoDuration.toFixed(1)}s
                </p>
              )}
              <p className={renderEstimate.isLongVideo ? "text-[#d29eff]" : "text-[#a899bd]"}>
                Tempo estimado de renderização: {renderEstimate.estimateText}
              </p>
              <p className="text-[#8a2be2] pt-1">
                Tempo decorrido: {elapsedSeconds.toFixed(1)}s
              </p>
            </div>
          </div>
        ) : generatedHtml ? (
          <iframe
            id="malasombre-preview-iframe"
            ref={iframeRef}
            srcDoc={previewSrcDoc}
            onLoad={handleIframeLoad}
            title="Preview em tempo real Mala.Sombre Motion Graphic"
            sandbox="allow-scripts allow-same-origin allow-downloads"
            className="w-full h-full border-0 bg-[#000000] block"
          />
        ) : (
          <div className="absolute inset-0 flex flex-col items-center justify-center bg-[radial-gradient(ellipse_at_center,rgba(42,0,51,0.55)_0%,#000000_75%)] px-6 text-center">
            <div className="w-12 h-12 rounded-xl bg-[#2a0033]/70 border border-[#8a2be2]/30 flex items-center justify-center mb-4">
              <Film className="w-6 h-6 text-[#8a2be2]" />
            </div>
            <p className="font-display text-xl tracking-wide uppercase text-white">
              Monitor de Preview 16:9
            </p>
            <p className="mt-2 text-sm text-[#a899bd] max-w-md leading-relaxed">
              Cole seu roteiro acima e clique em{" "}
              <strong className="text-white font-semibold">Gerar Motion Graphic</strong>{" "}
              para visualizar a animação em tempo real com duração 100% dinâmica.
            </p>
          </div>
        )}
      </div>

      {/* Deterministic Playback & Dynamic seek(t) Scrubber Control Bar */}
      <div className="flex flex-wrap sm:flex-nowrap items-center gap-3 sm:gap-4 px-4 sm:px-5 py-3.5 bg-[#0d0914] border-t border-[#8a2be2]/20">
        <div className="flex items-center gap-2 shrink-0">
          <button
            type="button"
            onClick={handleTogglePlay}
            disabled={!hasAnimation}
            aria-label={isPlaying ? "Pausar animação" : "Reproduzir animação"}
            className="inline-flex items-center justify-center gap-1.5 h-9 px-3.5 rounded-lg bg-[#191026] hover:bg-[#2a0033] disabled:opacity-40 disabled:pointer-events-none text-white border border-[#8a2be2]/30 text-xs font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a2be2]"
          >
            {isPlaying ? (
              <>
                <Pause className="w-3.5 h-3.5 text-[#8a2be2]" />
                <span>Pausar</span>
              </>
            ) : (
              <>
                <Play className="w-3.5 h-3.5 text-[#8a2be2]" />
                <span>Play</span>
              </>
            )}
          </button>

          <button
            type="button"
            onClick={handleRestart}
            disabled={!hasAnimation}
            aria-label="Reiniciar no tempo zero"
            title="Voltar para t = 0.00s"
            className="inline-flex items-center justify-center h-9 w-9 rounded-lg bg-[#191026] hover:bg-[#2a0033] disabled:opacity-40 disabled:pointer-events-none text-[#d7cae8] hover:text-white border border-[#8a2be2]/25 transition-colors shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a2be2]"
          >
            <RotateCcw className="w-3.5 h-3.5" />
          </button>
        </div>

        {/* Dynamic Timeline Scrubber directly wired to iframe.contentWindow.DURATION & seek(t) */}
        <div className="flex-1 min-w-[160px] flex items-center gap-3">
          <input
            type="range"
            min={0}
            max={effectiveMaxDuration}
            step={0.01}
            value={hasAnimation ? Math.min(currentTime, effectiveMaxDuration) : 0}
            onChange={handleScrub}
            disabled={!hasAnimation || duration <= 0}
            aria-label="Linha do tempo determinística seek(t)"
            className="sombre-scrubber w-full disabled:opacity-35 disabled:pointer-events-none"
          />
        </div>

        {/* Dynamic Tabular Timecode & Fullscreen Button */}
        <div className="flex items-center gap-3 ml-auto shrink-0">
          <span className="font-mono text-xs tabular-nums text-[#c5b8d8] whitespace-nowrap">
            {formatTimecode(hasAnimation ? currentTime : 0)}{" "}
            <span className="text-[#796891]">/</span>{" "}
            {formatTimecode(hasAnimation ? duration : 0)}
          </span>

          <button
            type="button"
            onClick={handleToggleFullscreen}
            disabled={!hasAnimation}
            aria-label={isFullscreenActive ? "Sair da tela cheia" : "Tela cheia"}
            className="inline-flex items-center gap-1.5 h-9 px-3 rounded-lg bg-[#191026] hover:bg-[#2a0033] disabled:opacity-40 disabled:pointer-events-none text-[#e5dbf5] border border-[#8a2be2]/25 text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a2be2]"
          >
            {isFullscreenActive ? (
              <>
                <Minimize2 className="w-3.5 h-3.5 text-[#8a2be2]" />
                <span>Sair</span>
              </>
            ) : (
              <>
                <Maximize2 className="w-3.5 h-3.5 text-[#8a2be2]" />
                <span>Tela Cheia</span>
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
