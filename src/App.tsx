/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useState } from "react";
import { AlertCircle, Clapperboard, Download, Images, Loader2 } from "lucide-react";
import { BrandHeader } from "./components/BrandHeader";
import { PreviewStage } from "./components/PreviewStage";
import { estimateScriptVideoDuration } from "./utils/scriptDuration";

interface FrameExportProgress {
  active: boolean;
  phase?: "capturing" | "zipping" | "done";
  current?: number;
  total?: number;
  percent?: number;
  error?: string;
}

export default function App() {
  const [scriptText, setScriptText] = useState<string>("");
  const [generatedHtml, setGeneratedHtml] = useState<string>("");
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [activeGenerationTargetDuration, setActiveGenerationTargetDuration] =
    useState<number | null>(null);
  const [exportProgress, setExportProgress] = useState<FrameExportProgress>({
    active: false,
  });

  const liveEstimatedDuration = useMemo(
    () => estimateScriptVideoDuration(scriptText),
    [scriptText]
  );

  // Elapsed timer while AI composes the HTML5 motion graphic
  useEffect(() => {
    if (!isGenerating) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = performance.now();
    const interval = window.setInterval(() => {
      setElapsedSeconds((performance.now() - startedAt) / 1000);
    }, 100);
    return () => window.clearInterval(interval);
  }, [isGenerating]);

  // Listen for progress messages from the embedded JSZip 'Baixar Frames' module inside the HTML
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      const data = event.data;
      if (!data || typeof data !== "object") return;
      if (data.type === "MALASOMBRE_EXPORT_STATUS") {
        setExportProgress({
          active: Boolean(data.active),
          phase: data.phase,
          current: data.current,
          total: data.total,
          percent: data.percent,
          error: data.error,
        });
        if (data.error) {
          setErrorMessage(String(data.error));
        }
      } else if (data.type === "MALASOMBRE_ZIP_READY" && data.blob instanceof Blob) {
        const url = URL.createObjectURL(data.blob);
        const link = document.createElement("a");
        link.href = url;
        link.download =
          typeof data.filename === "string"
            ? data.filename
            : "mala-sombre-frames-60fps.zip";
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        window.setTimeout(() => URL.revokeObjectURL(url), 10000);
      }
    };

    window.addEventListener("message", handleMessage);
    return () => window.removeEventListener("message", handleMessage);
  }, []);

  const handleGenerate = async () => {
    const trimmed = scriptText.trim();
    if (!trimmed) {
      setErrorMessage("Cole ou digite seu roteiro na área de texto antes de gerar.");
      return;
    }

    const detectedTarget = estimateScriptVideoDuration(trimmed);
    setActiveGenerationTargetDuration(detectedTarget);
    setIsGenerating(true);
    setErrorMessage(null);
    setExportProgress({ active: false });

    try {
      const response = await fetch("/api/generate", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
        },
        body: JSON.stringify({ script: trimmed }),
      });

      const contentType = response.headers.get("content-type") ?? "";
      if (!contentType.toLowerCase().includes("application/json")) {
        const rawResponseText = await response.text();
        console.error(
          `Resposta inesperada não-JSON (HTTP ${response.status}):`,
          rawResponseText.slice(0, 400)
        );
        throw new Error(
          response.status === 504 || response.status === 502
            ? "O servidor demorou muito para responder (tempo limite). Tente novamente."
            : "Erro no servidor. Tente novamente."
        );
      }

      let data: { html?: string; error?: string };
      try {
        data = (await response.json()) as { html?: string; error?: string };
      } catch {
        throw new Error("Erro no servidor. Tente novamente.");
      }

      if (!response.ok || !data.html) {
        throw new Error(
          data.error || "Não foi possível gerar a animação. Tente novamente."
        );
      }

      setGeneratedHtml(data.html);

      // Smooth scroll to preview monitor once ready on smaller viewports
      requestAnimationFrame(() => {
        const previewEl = document.getElementById("preview");
        previewEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    } catch (error: unknown) {
      const message =
        error instanceof Error
          ? error.message
          : "Erro inesperado ao comunicar com o servidor.";
      setErrorMessage(message);
    } finally {
      setIsGenerating(false);
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (!isGenerating) {
        handleGenerate();
      }
    }
  };

  const handleDownloadHtml = () => {
    if (!generatedHtml) return;
    const blob = new Blob([generatedHtml], { type: "text/html;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const link = document.createElement("a");
    link.href = url;
    link.download = "mala-sombre-motion.html";
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleTriggerFramesDownload = () => {
    if (!generatedHtml || exportProgress.active) return;
    const iframe = document.getElementById(
      "malasombre-preview-iframe"
    ) as HTMLIFrameElement | null;
    iframe?.contentWindow?.postMessage(
      { type: "MALASOMBRE_CMD_EXPORT_FRAMES" },
      "*"
    );
  };

  return (
    <div className="min-h-screen flex flex-col bg-[#050507] text-[#f3eff8]">
      <BrandHeader />

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-10 sm:py-12 space-y-12">
        {/* Intro Heading */}
        <section className="space-y-3 max-w-3xl">
          <p className="text-xs font-medium tracking-wider text-[#b589f7]">
            Direção de Arte Gótica · Duração 100% Dinâmica · Formato 16:9
          </p>
          <h1
            className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white uppercase"
            style={{ textWrap: "balance" }}
          >
            Transforme seu roteiro em motion graphics sombrios e cinematográficos
          </h1>
          <p className="text-sm sm:text-base text-[#b3a5c7] leading-relaxed max-w-2xl">
            Gere cenas autocontidas de qualquer duração em Canvas e CSS com névoa
            atmosférica, câmera lenta, física de molas e função determinística{" "}
            <code className="font-mono text-xs text-[#d6b8ff]">seek(t)</code> pronta para
            visualização imediata, exportação HTML e captura integral de frames a 60 FPS.
          </p>
        </section>

        {/* Script Input & Primary Action */}
        <section id="roteiro" className="space-y-4 scroll-mt-24">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <label
              htmlFor="roteiro-textarea"
              className="block text-base sm:text-lg font-semibold text-white"
            >
              Cole seu roteiro aqui (ex: Cena 1: A porta range...)
            </label>
            <div className="hidden sm:flex items-center gap-2 font-mono text-xs tabular-nums text-[#84749c]">
              {liveEstimatedDuration !== null && (
                <>
                  <span className="text-[#b589f7]">
                    Duração estimada: ~{liveEstimatedDuration.toFixed(1)}s
                  </span>
                  <span aria-hidden="true">·</span>
                </>
              )}
              <span>{scriptText.length} caracteres</span>
            </div>
          </div>

          <textarea
            id="roteiro-textarea"
            rows={8}
            value={scriptText}
            onChange={(e) => {
              setScriptText(e.target.value);
              if (errorMessage) setErrorMessage(null);
            }}
            onKeyDown={handleKeyDown}
            disabled={isGenerating}
            placeholder="Cena 1: Névoa densa avança sobre o portão de ferro de um cemitério antigo. Ao fundo, árvores secas se contorcem sob uma luz violeta pálida. Surge o título: O SUSSURRO ATRÁS DA PORTA..."
            className="w-full min-h-[210px] rounded-xl bg-[#0d0914] border border-[#8a2be2]/30 focus:border-[#8a2be2] focus:outline-none focus:ring-2 focus:ring-[#8a2be2]/40 px-5 py-4 text-sm sm:text-base text-[#f5f0fc] placeholder:text-[#66577d] leading-relaxed resize-y transition-colors disabled:opacity-60"
          />

          {errorMessage && (
            <div
              role="alert"
              className="flex items-start gap-3 rounded-xl bg-[#240b18] border border-rose-500/40 px-4 py-3.5 text-sm text-rose-200"
            >
              <AlertCircle className="w-5 h-5 text-rose-400 shrink-0 mt-0.5" />
              <div className="flex-1">{errorMessage}</div>
            </div>
          )}

          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            <button
              type="button"
              onClick={handleGenerate}
              disabled={isGenerating}
              className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-[#8a2be2] hover:bg-[#9b42ee] active:scale-[0.99] disabled:opacity-60 disabled:pointer-events-none text-white font-semibold text-sm sm:text-base shadow-[0_0_28px_rgba(138,43,226,0.38)] transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
            >
              {isGenerating ? (
                <>
                  <Loader2 className="w-5 h-5 animate-spin" />
                  <span>Gerando Motion Graphic...</span>
                </>
              ) : (
                <>
                  <Clapperboard className="w-5 h-5" />
                  <span>Gerar Motion Graphic</span>
                </>
              )}
            </button>

            <span className="text-xs text-[#84749c]">
              Atalho rápido: pressione <kbd className="font-mono text-[#b9accb]">Ctrl</kbd> +{" "}
              <kbd className="font-mono text-[#b9accb]">Enter</kbd> para gerar
            </span>
          </div>
        </section>

        {/* Real-Time Preview Stage + Export Action */}
        <section id="preview" className="space-y-5 scroll-mt-24">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl font-bold tracking-wide uppercase text-white">
              Preview em Tempo Real
            </h2>
            <p className="text-xs text-[#9c8cb3]">
              1920×1080 Widescreen · Leitura Dinâmica de window.DURATION · 60 FPS ZIP
            </p>
          </div>

          <PreviewStage
            generatedHtml={generatedHtml}
            isGenerating={isGenerating}
            elapsedSeconds={elapsedSeconds}
            estimatedVideoDuration={
              isGenerating ? activeGenerationTargetDuration : liveEstimatedDuration
            }
          />

          {/* Export / Download Bar */}
          <div
            id="exportacao"
            className="flex flex-wrap items-center justify-between gap-4 pt-2 scroll-mt-24"
          >
            <div className="text-xs sm:text-sm text-[#9c8cb3] max-w-xl">
              {generatedHtml
                ? "O arquivo HTML gerado inclui 'Baixar Frames' via JSZip percorrendo de 0s até o final dinâmico de window.DURATION em passos de 1/60s."
                : "Os botões de download de HTML e sequência de frames (.zip) serão habilitados assim que o motion graphic for gerado."}
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={handleTriggerFramesDownload}
                disabled={!generatedHtml || isGenerating || exportProgress.active}
                className="inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-[#140d1f] hover:bg-[#2a0033] disabled:opacity-40 disabled:pointer-events-none text-white border border-[#8a2be2]/45 font-semibold text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a2be2]"
              >
                {exportProgress.active ? (
                  <>
                    <Loader2 className="w-4 h-4 text-[#8a2be2] animate-spin" />
                    <span className="font-mono text-xs tabular-nums">
                      {exportProgress.phase === "zipping"
                        ? "Compactando .zip..."
                        : `Frames ${exportProgress.current ?? 0}/${exportProgress.total ?? 0} (${exportProgress.percent ?? 0}%)`}
                    </span>
                  </>
                ) : (
                  <>
                    <Images className="w-4 h-4 text-[#8a2be2]" />
                    <span>Baixar Frames</span>
                  </>
                )}
              </button>

              <button
                type="button"
                onClick={handleDownloadHtml}
                disabled={!generatedHtml || isGenerating}
                className="inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-[#8a2be2] hover:bg-[#9b42ee] disabled:opacity-40 disabled:pointer-events-none text-white font-semibold text-sm shadow-[0_0_20px_rgba(138,43,226,0.3)] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <Download className="w-4 h-4" />
                <span>Baixar HTML</span>
              </button>
            </div>
          </div>
        </section>

        {/* Visual Identity Reference Strip */}
        <section
          id="identidade"
          className="pt-8 border-t border-[#8a2be2]/15 grid grid-cols-1 md:grid-cols-3 gap-8 scroll-mt-24"
        >
          <div className="space-y-2">
            <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-white">
              01. Paleta Mala.Sombre
            </h3>
            <p className="text-sm text-[#a899bd] leading-relaxed">
              Contraste dramático entre preto absoluto (<span className="font-mono text-xs text-white">#000000</span>),
              sombras atmosféricas em roxo profundo (<span className="font-mono text-xs text-[#c59cff]">#2a0033</span>)
              e recortes em violeta luminoso (<span className="font-mono text-xs text-[#b589f7]">#8a2be2</span>).
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-white">
              02. Duração Dinâmica e 60 FPS
            </h3>
            <p className="text-sm text-[#a899bd] leading-relaxed">
              A duração (<code className="font-mono text-xs text-white">window.DURATION</code>) adapta-se
              automaticamente ao último timestamp do roteiro + 1,5s de respiro, sincronizando
              scrubber e exportação JSZip até o último quadro.
            </p>
          </div>

          <div className="space-y-2">
            <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-white">
              03. Precisão de Layout
            </h3>
            <p className="text-sm text-[#a899bd] leading-relaxed">
              Medição prévia de textos no Canvas, silhuetas orgânicas em camadas, física de
              molas amortecidas e proteção contra cortes nas bordas em 1920×1080.
            </p>
          </div>
        </section>
      </main>

      <footer className="w-full border-t border-[#8a2be2]/15 py-6 mt-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4 text-xs text-[#796891]">
          <span>Mala.Sombre Motion Studio</span>
          <span>HTML5 Canvas · Duração Dinâmica · Captura 60 FPS com JSZip</span>
        </div>
      </footer>
    </div>
  );
}
