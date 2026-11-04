/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  AlertCircle,
  CheckCircle2,
  Clapperboard,
  Download,
  Images,
  LayoutList,
  Loader2,
  RotateCcw,
  SlidersHorizontal,
  Wand2,
  XCircle,
} from "lucide-react";
import { BrandHeader } from "./components/BrandHeader";
import { PreviewStage } from "./components/PreviewStage";
import { StoryboardWorkspace } from "./components/StoryboardWorkspace";
import type {
  ApiErrorPayload,
  CreationMode,
  DirectGenerateResponse,
  PlanStoryboardResponse,
  ProjectContextMemory,
  ProviderAttemptDiagnostic,
  RegenerateSceneResponse,
  RenderStoryboardResponse,
  StreamProgressEvent,
  StreamProgressEventType,
  StyleCategory,
  StyleId,
  StyleSelection,
} from "./shared/motionStudioContracts";
import {
  MOTION_STYLE_LIBRARY,
  STYLE_CATEGORIES,
  getStyleById,
} from "./shared/styleLibrary";
import { analyzeAdaptiveScriptTiming } from "./utils/scriptDuration";

interface FrameExportProgress {
  active: boolean;
  phase?: "capturing" | "zipping" | "done";
  current?: number;
  total?: number;
  percent?: number;
  error?: string;
}

type StudioOperation =
  | "idle"
  | "generating_direct"
  | "planning_storyboard"
  | "regenerating_scene"
  | "rendering_storyboard";

interface LiveProgressStep {
  id: string;
  type: StreamProgressEventType;
  message: string;
  timestamp: string;
}

export default function App() {
  const [creationMode, setCreationMode] = useState<CreationMode>("direct");
  const [scriptText, setScriptText] = useState<string>("");
  const [preferredStyleId, setPreferredStyleId] = useState<StyleSelection>("auto");
  const [creativeNotes, setCreativeNotes] = useState<string>("");
  const [showAdvancedControls, setShowAdvancedControls] = useState<boolean>(false);

  // Storyboard & Project Memory State (Modo B)
  const [storyboardProject, setStoryboardProject] =
    useState<ProjectContextMemory | null>(null);
  const [regeneratingSceneId, setRegeneratingSceneId] = useState<string | null>(
    null
  );
  const [neighborImpactNotes, setNeighborImpactNotes] = useState<string[]>([]);

  // Rendered Output & Preview State
  const [generatedHtml, setGeneratedHtml] = useState<string>("");
  const [lastDirectMeta, setLastDirectMeta] = useState<
    DirectGenerateResponse["meta"] | null
  >(null);
  const [operation, setOperation] = useState<StudioOperation>("idle");
  const [errorMessage, setErrorMessage] = useState<string | null>(null);
  const [errorDetails, setErrorDetails] = useState<{
    failedProviders: ProviderAttemptDiagnostic[];
    retryable: boolean;
    generationId?: string;
    isCancelled?: boolean;
  } | null>(null);
  const [lastFailedAction, setLastFailedAction] = useState<
    | { type: "direct" }
    | { type: "plan" }
    | {
        type: "regenerate";
        sceneId: string;
        instruction: string;
        requestedStyleId?: StyleId;
      }
    | { type: "render" }
    | null
  >(null);
  const activeAbortRef = useRef<AbortController | null>(null);
  const [liveProgressSteps, setLiveProgressSteps] = useState<LiveProgressStep[]>(
    []
  );
  const [latestStreamStage, setLatestStreamStage] = useState<string | null>(
    null
  );

  const [elapsedSeconds, setElapsedSeconds] = useState<number>(0);
  const [activeGenerationTargetDuration, setActiveGenerationTargetDuration] =
    useState<number | null>(null);
  const [externalSeekRequest, setExternalSeekRequest] = useState<{
    time: number;
    nonce: number;
  } | null>(null);

  const [exportProgress, setExportProgress] = useState<FrameExportProgress>({
    active: false,
  });

  // Explorador das 7 categorias dos 30 estilos
  const [activeCatalogCategory, setActiveCatalogCategory] =
    useState<StyleCategory>("storytelling");

  const adaptiveTiming = useMemo(
    () => analyzeAdaptiveScriptTiming(scriptText),
    [scriptText]
  );

  const liveEstimatedDuration = adaptiveTiming?.durationSeconds ?? null;

  const isBusy = operation !== "idle";
  const isRenderingHtml =
    operation === "generating_direct" || operation === "rendering_storyboard";

  // Cronômetro em tempo real durante operações ativas da IA
  useEffect(() => {
    if (!isBusy) {
      setElapsedSeconds(0);
      return;
    }
    const startedAt = performance.now();
    const interval = window.setInterval(() => {
      setElapsedSeconds((performance.now() - startedAt) / 1000);
    }, 100);
    return () => window.clearInterval(interval);
  }, [isBusy]);

  // Escuta progresso do módulo JSZip "Baixar Frames" embutido no HTML
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
      } else if (
        data.type === "MALASOMBRE_ZIP_READY" &&
        data.blob instanceof Blob
      ) {
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

  // Cancela qualquer requisição em andamento sem perder roteiro nem storyboard
  const handleCancelActiveOperation = () => {
    if (activeAbortRef.current) {
      activeAbortRef.current.abort();
      activeAbortRef.current = null;
    }
    setRegeneratingSceneId(null);
    setOperation("idle");
    setLatestStreamStage("A geração foi cancelada pelo usuário.");
    setErrorMessage("A geração foi cancelada pelo usuário.");
    setErrorDetails({
      failedProviders: [],
      retryable: true,
      isCancelled: true,
    });
  };

  useEffect(() => {
    return () => {
      activeAbortRef.current?.abort();
    };
  }, []);

  class ClientApiError extends Error {
    readonly payload: ApiErrorPayload;
    constructor(payload: ApiErrorPayload) {
      super(payload.error);
      this.name = "ClientApiError";
      this.payload = payload;
    }
  }

  const pushLiveStreamEvent = (evt: StreamProgressEvent<unknown>) => {
    setLatestStreamStage(evt.message);
    setLiveProgressSteps((prev) => {
      // Se for atualização contínua de provider_progress do mesmo provedor, atualiza a última linha de progresso para manter o histórico enxuto
      if (
        evt.type === "provider_progress" &&
        prev.length > 0 &&
        prev[prev.length - 1].type === "provider_progress"
      ) {
        const updated = [...prev];
        updated[updated.length - 1] = {
          id: `${evt.timestamp}-${updated.length}`,
          type: evt.type,
          message: evt.message,
          timestamp: evt.timestamp,
        };
        return updated;
      }
      return [
        ...prev.slice(-7),
        {
          id: `${evt.timestamp}-${prev.length + 1}`,
          type: evt.type,
          message: evt.message,
          timestamp: evt.timestamp,
        },
      ];
    });
  };

  async function postStudioStream<TResponse>(
    url: string,
    body: unknown,
    signal: AbortSignal
  ): Promise<TResponse> {
    let response: Response;
    try {
      response = await fetch(url, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Accept: "text/event-stream, application/json",
        },
        body: JSON.stringify(body),
        signal,
      });
    } catch (err) {
      if (
        signal.aborted ||
        (err instanceof Error && err.name === "AbortError")
      ) {
        throw new ClientApiError({
          error: "A geração foi cancelada pelo usuário.",
          errorType: "cancelled",
          retryable: true,
        });
      }
      throw new ClientApiError({
        error:
          "Falha de conexão de rede ao comunicar com o servidor. Verifique sua conexão e tente novamente.",
        errorType: "network_error",
        retryable: true,
      });
    }

    const contentType = (
      response.headers.get("content-type") ?? ""
    ).toLowerCase();

    // Respostas de validação HTTP 400 ou fallback JSON síncrono
    if (contentType.includes("application/json")) {
      const parsed = (await response.json()) as TResponse &
        Partial<ApiErrorPayload>;
      if (!response.ok) {
        throw new ClientApiError({
          error:
            parsed.error ||
            "Não foi possível gerar a animação. Todos os provedores disponíveis falharam.",
          errorType: parsed.errorType || "all_providers_failed",
          generationId: parsed.generationId,
          retryable: parsed.retryable ?? true,
          failedProviders: parsed.failedProviders ?? [],
        });
      }
      return parsed;
    }

    if (!contentType.includes("text/event-stream") || !response.body) {
      const isGatewayTimeout =
        response.status === 504 ||
        response.status === 502 ||
        response.status === 408 ||
        response.status === 524;
      throw new ClientApiError({
        error: isGatewayTimeout
          ? "O provedor de IA demorou mais que o esperado para responder."
          : `O servidor está temporariamente indisponível (HTTP ${response.status}). Tente novamente.`,
        errorType: isGatewayTimeout ? "timeout" : "provider_unavailable",
        retryable: true,
      });
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder("utf-8");
    let buffer = "";
    let finalResult: TResponse | undefined;

    const processLine = (rawLine: string) => {
      const trimmed = rawLine.trim();
      if (!trimmed || trimmed.startsWith(":") || trimmed.startsWith("event:")) {
        return;
      }
      if (!trimmed.startsWith("data:")) {
        return;
      }
      const jsonStr = trimmed.slice(5).trim();
      if (!jsonStr) return;

      let evt: StreamProgressEvent<TResponse>;
      try {
        evt = JSON.parse(jsonStr) as StreamProgressEvent<TResponse>;
      } catch {
        return;
      }

      pushLiveStreamEvent(evt);

      if (evt.type === "generation_completed" && evt.result !== undefined) {
        finalResult = evt.result;
        return;
      }

      if (evt.type === "generation_cancelled") {
        throw new ClientApiError(
          evt.errorPayload ?? {
            error: evt.message || "A geração foi cancelada pelo usuário.",
            errorType: "cancelled",
            generationId: evt.generationId,
            retryable: true,
          }
        );
      }

      if (evt.type === "generation_failed") {
        throw new ClientApiError(
          evt.errorPayload ?? {
            error:
              evt.message ||
              "Não foi possível gerar a animação. Todos os provedores disponíveis falharam.",
            errorType: evt.errorType || "all_providers_failed",
            generationId: evt.generationId,
            retryable: true,
          }
        );
      }
    };

    try {
      while (true) {
        const { done, value } = await reader.read();
        if (done) {
          buffer += decoder.decode();
          break;
        }
        buffer += decoder.decode(value, { stream: true });

        let newlineIndex = buffer.indexOf("\n");
        while (newlineIndex !== -1) {
          const line = buffer.slice(0, newlineIndex);
          buffer = buffer.slice(newlineIndex + 1);
          newlineIndex = buffer.indexOf("\n");
          processLine(line);
        }
      }

      if (buffer.trim()) {
        for (const remainingLine of buffer.split("\n")) {
          processLine(remainingLine);
        }
      }
    } catch (streamErr) {
      if (streamErr instanceof ClientApiError) {
        throw streamErr;
      }
      if (
        signal.aborted ||
        (streamErr instanceof Error && streamErr.name === "AbortError")
      ) {
        throw new ClientApiError({
          error: "A geração foi cancelada pelo usuário.",
          errorType: "cancelled",
          retryable: true,
        });
      }
      throw new ClientApiError({
        error:
          "A conexão em tempo real com o servidor foi interrompida antes de finalizar. Tente novamente.",
        errorType: "network_error",
        retryable: true,
      });
    } finally {
      if (signal.aborted) {
        await reader.cancel().catch(() => {});
      }
      reader.releaseLock();
    }

    if (finalResult === undefined) {
      throw new ClientApiError({
        error:
          "A transmissão foi encerrada sem entregar o resultado final validado. Tente novamente.",
        errorType: "invalid_response",
        retryable: true,
      });
    }

    return finalResult;
  }

  function applyCaughtOperationError(error: unknown) {
    if (error instanceof ClientApiError) {
      setErrorMessage(error.payload.error);
      setErrorDetails({
        failedProviders: error.payload.failedProviders ?? [],
        retryable: error.payload.retryable,
        generationId: error.payload.generationId,
        isCancelled: error.payload.errorType === "cancelled",
      });
      return;
    }
    if (error instanceof Error && error.name === "AbortError") {
      setErrorMessage("A geração foi cancelada pelo usuário.");
      setErrorDetails({
        failedProviders: [],
        retryable: true,
        isCancelled: true,
      });
      return;
    }
    setErrorMessage(
      error instanceof Error
        ? error.message
        : "Não foi possível concluir a comunicação com os provedores de IA."
    );
    setErrorDetails({ failedProviders: [], retryable: true });
  }

  // MODO A — Geração Direta com Direção Criativa Autônoma
  const handleDirectGenerate = async () => {
    const trimmed = scriptText.trim();
    if (!trimmed) {
      setErrorMessage(
        "Cole ou digite seu roteiro na área de texto antes de gerar."
      );
      setErrorDetails(null);
      return;
    }

    activeAbortRef.current?.abort();
    const controller = new AbortController();
    activeAbortRef.current = controller;

    setLastFailedAction({ type: "direct" });
    setActiveGenerationTargetDuration(liveEstimatedDuration);
    setLiveProgressSteps([]);
    setLatestStreamStage("Analisando roteiro...");
    setOperation("generating_direct");
    setErrorMessage(null);
    setErrorDetails(null);
    setExportProgress({ active: false });

    try {
      const data = await postStudioStream<DirectGenerateResponse>(
        "/api/generate/stream",
        {
          script: trimmed,
          preferredStyleId,
          creativeNotes: creativeNotes.trim() || undefined,
        },
        controller.signal
      );

      if (!data.html) {
        throw new ClientApiError({
          error:
            "O provedor retornou uma resposta incompleta sem código de animação.",
          errorType: "invalid_response",
          retryable: true,
        });
      }

      setGeneratedHtml(data.html);
      setLastDirectMeta(data.meta ?? null);
      setLastFailedAction(null);

      requestAnimationFrame(() => {
        document
          .getElementById("preview")
          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
      });
    } catch (error: unknown) {
      applyCaughtOperationError(error);
    } finally {
      if (activeAbortRef.current === controller) {
        activeAbortRef.current = null;
        setOperation("idle");
      }
    }
  };

  // MODO B (Passo 1) — Planejar Direção de Arte e Storyboard
  const handlePlanStoryboard = async () => {
    const trimmed = scriptText.trim();
    if (!trimmed) {
      setErrorMessage(
        "Cole ou digite seu roteiro antes de solicitar o planejamento do storyboard."
      );
      setErrorDetails(null);
      return;
    }

    activeAbortRef.current?.abort();
    const controller = new AbortController();
    activeAbortRef.current = controller;

    setLastFailedAction({ type: "plan" });
    setLiveProgressSteps([]);
    setLatestStreamStage("Analisando roteiro e planejando direção de arte...");
    setOperation("planning_storyboard");
    setErrorMessage(null);
    setErrorDetails(null);
    setNeighborImpactNotes([]);

    try {
      const data = await postStudioStream<PlanStoryboardResponse>(
        "/api/storyboard/plan/stream",
        {
          script: trimmed,
          preferredStyleId,
          creativeNotes: creativeNotes.trim() || undefined,
        },
        controller.signal
      );

      if (!data.project) {
        throw new ClientApiError({
          error:
            "O provedor retornou um planejamento de storyboard incompleto.",
          errorType: "invalid_response",
          retryable: true,
        });
      }

      setStoryboardProject(data.project);
      setLastFailedAction(null);

      requestAnimationFrame(() => {
        document
          .getElementById("storyboard")
          ?.scrollIntoView({ behavior: "smooth", block: "start" });
      });
    } catch (error: unknown) {
      applyCaughtOperationError(error);
    } finally {
      if (activeAbortRef.current === controller) {
        activeAbortRef.current = null;
        setOperation("idle");
      }
    }
  };

  // MODO B (Passo 2 opcional) — Regenerar uma única cena com IA preservando memória
  const handleRegenerateScene = async (
    sceneId: string,
    instruction: string,
    requestedStyleId?: StyleId
  ) => {
    if (!storyboardProject) return;

    activeAbortRef.current?.abort();
    const controller = new AbortController();
    activeAbortRef.current = controller;

    setLastFailedAction({
      type: "regenerate",
      sceneId,
      instruction,
      requestedStyleId,
    });
    setLiveProgressSteps([]);
    setLatestStreamStage("Regenerando cena selecionada...");
    setOperation("regenerating_scene");
    setRegeneratingSceneId(sceneId);
    setErrorMessage(null);
    setErrorDetails(null);

    try {
      const data = await postStudioStream<RegenerateSceneResponse>(
        "/api/storyboard/regenerate-scene/stream",
        {
          project: storyboardProject,
          sceneId,
          instruction: instruction.trim() || undefined,
          requestedStyleId,
        },
        controller.signal
      );

      if (!data.project) {
        throw new ClientApiError({
          error: "Não foi possível regenerar a cena selecionada.",
          errorType: "invalid_response",
          retryable: true,
        });
      }

      setStoryboardProject(data.project);
      setNeighborImpactNotes(data.neighborImpactNotes ?? []);
      setLastFailedAction(null);
    } catch (error: unknown) {
      applyCaughtOperationError(error);
    } finally {
      if (activeAbortRef.current === controller) {
        activeAbortRef.current = null;
        setRegeneratingSceneId(null);
        setOperation("idle");
      }
    }
  };

  // MODO B (Passo 3) — Renderizar Animação Final a partir do Storyboard Aprovado
  const handleRenderApprovedStoryboard = async () => {
    if (!storyboardProject) return;

    activeAbortRef.current?.abort();
    const controller = new AbortController();
    activeAbortRef.current = controller;

    setLastFailedAction({ type: "render" });
    setActiveGenerationTargetDuration(storyboardProject.timeline.totalDuration);
    setLiveProgressSteps([]);
    setLatestStreamStage("Preparando storyboard aprovado para renderização...");
    setOperation("rendering_storyboard");
    setErrorMessage(null);
    setErrorDetails(null);
    setExportProgress({ active: false });

    requestAnimationFrame(() => {
      document
        .getElementById("preview")
        ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    try {
      const data = await postStudioStream<RenderStoryboardResponse>(
        "/api/storyboard/render/stream",
        {
          project: storyboardProject,
        },
        controller.signal
      );

      if (!data.html) {
        throw new ClientApiError({
          error:
            "Não foi possível renderizar a animação do storyboard aprovado.",
          errorType: "invalid_response",
          retryable: true,
        });
      }

      setGeneratedHtml(data.html);
      setLastDirectMeta(null);
      setLastFailedAction(null);
    } catch (error: unknown) {
      applyCaughtOperationError(error);
    } finally {
      if (activeAbortRef.current === controller) {
        activeAbortRef.current = null;
        setOperation("idle");
      }
    }
  };

  const handleRetryLastOperation = () => {
    if (isBusy) return;
    if (!lastFailedAction) {
      if (creationMode === "direct") handleDirectGenerate();
      else handlePlanStoryboard();
      return;
    }
    if (lastFailedAction.type === "direct") {
      handleDirectGenerate();
    } else if (lastFailedAction.type === "plan") {
      handlePlanStoryboard();
    } else if (lastFailedAction.type === "regenerate") {
      handleRegenerateScene(
        lastFailedAction.sceneId,
        lastFailedAction.instruction,
        lastFailedAction.requestedStyleId
      );
    } else if (lastFailedAction.type === "render") {
      handleRenderApprovedStoryboard();
    }
  };

  const handleKeyDown = (event: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
      event.preventDefault();
      if (!isBusy) {
        if (creationMode === "direct") {
          handleDirectGenerate();
        } else {
          handlePlanStoryboard();
        }
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

  const handleSeekPreviewToTime = (timeSeconds: number) => {
    setExternalSeekRequest({ time: timeSeconds, nonce: Date.now() });
  };

  const selectedStylePreview =
    preferredStyleId !== "auto" ? getStyleById(preferredStyleId) : null;

  // Descrição transparente do status atual do estúdio sincronizada com eventos reais do backend
  const statusBannerText = useMemo(() => {
    if (isBusy && latestStreamStage) {
      return latestStreamStage;
    }
    if (operation === "generating_direct") {
      return "Analisando roteiro e definindo direção de arte...";
    }
    if (operation === "planning_storyboard") {
      return "Analisando roteiro e planejando direção de arte...";
    }
    if (operation === "regenerating_scene") {
      return "Regenerando a cena selecionada com memória das cenas vizinhas...";
    }
    if (operation === "rendering_storyboard") {
      return "Renderizando a animação final fielmente a partir do Storyboard aprovado...";
    }
    if (creationMode === "storyboard" && storyboardProject) {
      if (storyboardProject.approvalStatus === "approved") {
        return generatedHtml
          ? "Animação concluída! Storyboard aprovado e renderizado no Preview."
          : "Storyboard aprovado. Clique em 'Gerar Animação Aprovada' para produzir o motion graphic.";
      }
      return "Storyboard pronto para revisão: edite textos, durações ou cenas e aprove quando desejar renderizar.";
    }
    if (generatedHtml) {
      return "Animação concluída! Pronta no Preview 16:9 com suporte determinístico seek(t) e exportação 60 FPS.";
    }
    return creationMode === "direct"
      ? "Modo Geração Direta selecionado: cole o roteiro e a IA assumirá a direção criativa completa até a animação final."
      : "Modo Storyboard com Aprovação selecionado: a IA apresentará direção de arte e cenas editáveis antes de renderizar.";
  }, [creationMode, generatedHtml, isBusy, latestStreamStage, operation, storyboardProject]);

  return (
    <div className="min-h-screen flex flex-col bg-[#050507] text-[#f3eff8]">
      <BrandHeader />

      <main className="flex-1 w-full max-w-6xl mx-auto px-6 py-10 sm:py-12 space-y-12">
        {/* Cabeçalho Editorial do Estúdio */}
        <section className="space-y-3 max-w-3xl">
          <p className="text-xs font-medium tracking-wider text-[#b589f7]">
            Direção Criativa Autônoma · 30 Estilos Especializados · Motor Determinístico 16:9
          </p>
          <h1
            className="font-display text-3xl sm:text-5xl font-bold tracking-tight text-white uppercase"
            style={{ textWrap: "balance" }}
          >
            Direção inteligente de motion graphics do roteiro à cena final
          </h1>
          <p className="text-sm sm:text-base text-[#b3a5c7] leading-relaxed max-w-2xl">
            Escolha entre <strong className="text-white font-semibold">Geração Direta</strong> ou{" "}
            <strong className="text-white font-semibold">Storyboard com Aprovação</strong>. O
            diretor criativo interpreta o seu roteiro, seleciona estilo, paleta e tecnologia ideal
            (Canvas 2D, SVG ou HTML/CSS) e entrega animações determinísticas via{" "}
            <code className="font-mono text-xs text-[#d6b8ff]">window.seek(t)</code>.
          </p>
        </section>

        {/* Seção de Entrada de Roteiro + Escolha de Modo + Diretrizes Opcionais */}
        <section id="roteiro" className="space-y-5 scroll-mt-24">
          {/* Seletor dos Dois Modos de Criação */}
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div
              role="tablist"
              aria-label="Modo de criação"
              className="inline-flex items-center p-1 rounded-xl bg-[#0d0914] border border-[#8a2be2]/30"
            >
              <button
                type="button"
                role="tab"
                aria-selected={creationMode === "direct"}
                onClick={() => setCreationMode("direct")}
                disabled={isBusy}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  creationMode === "direct"
                    ? "bg-[#8a2be2] text-white shadow-sm"
                    : "text-[#b9accb] hover:text-white"
                }`}
              >
                <Wand2 className="w-4 h-4" />
                <span>Geração Direta</span>
              </button>

              <button
                type="button"
                role="tab"
                aria-selected={creationMode === "storyboard"}
                onClick={() => setCreationMode("storyboard")}
                disabled={isBusy}
                className={`inline-flex items-center gap-2 px-4 py-2 rounded-lg text-xs sm:text-sm font-semibold transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  creationMode === "storyboard"
                    ? "bg-[#8a2be2] text-white shadow-sm"
                    : "text-[#b9accb] hover:text-white"
                }`}
              >
                <LayoutList className="w-4 h-4" />
                <span>Storyboard com Aprovação</span>
              </button>
            </div>

            <button
              type="button"
              onClick={() => setShowAdvancedControls((prev) => !prev)}
              className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#0d0914] hover:bg-[#191026] border border-[#8a2be2]/25 text-xs font-medium text-[#d7cae8] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
            >
              <SlidersHorizontal className="w-3.5 h-3.5 text-[#b589f7]" />
              <span>
                {showAdvancedControls
                  ? "Ocultar Diretrizes Criativas"
                  : preferredStyleId === "auto"
                    ? "Estilo: Autonomia IA (Personalizar)"
                    : `Estilo Fixado: ${selectedStylePreview?.name}`}
              </span>
            </button>
          </div>

          {/* Barra Transparente do Estado Atual */}
          <div className="flex flex-wrap items-center gap-2.5 text-xs text-[#b9accb] px-1">
            {isBusy ? (
              <Loader2 className="w-3.5 h-3.5 text-[#b589f7] animate-spin shrink-0" />
            ) : (
              <CheckCircle2 className="w-3.5 h-3.5 text-[#8a2be2] shrink-0" />
            )}
            <span className="flex-1 min-w-[200px]">{statusBannerText}</span>
            {isBusy && (
              <div className="flex items-center gap-3 ml-auto shrink-0">
                <span className="font-mono tabular-nums text-[#d6b8ff]">
                  {elapsedSeconds.toFixed(1)}s
                </span>
                <button
                  type="button"
                  onClick={handleCancelActiveOperation}
                  className="inline-flex items-center gap-1.5 px-2.5 py-1 rounded-lg bg-rose-950/60 hover:bg-rose-900/70 border border-rose-500/40 text-rose-200 font-medium transition-colors cursor-pointer"
                >
                  <XCircle className="w-3.5 h-3.5 text-rose-400" />
                  <span>Cancelar</span>
                </button>
              </div>
            )}
          </div>

          {/* Painel Opcional de Diretriz de Estilo (30 Estilos) e Restrições Criativas */}
          {showAdvancedControls && (
            <div className="rounded-xl bg-[#0d0914] border border-[#8a2be2]/25 p-4 sm:p-5 grid grid-cols-1 md:grid-cols-2 gap-4">
              <div className="space-y-1.5">
                <label
                  htmlFor="style-select"
                  className="block text-xs font-semibold text-white"
                >
                  Escolha de Estilo Especializado (Opcional)
                </label>
                <select
                  id="style-select"
                  value={preferredStyleId}
                  onChange={(e) =>
                    setPreferredStyleId(e.target.value as StyleSelection)
                  }
                  disabled={isBusy}
                  className="w-full rounded-lg bg-[#140d1f] border border-[#8a2be2]/35 px-3.5 py-2.5 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#8a2be2]"
                >
                  <option value="auto">
                    Autonomia Criativa Alta da IA (Recomendado — Escolha Automática)
                  </option>
                  {STYLE_CATEGORIES.map((cat) => (
                    <optgroup key={cat.id} label={cat.label}>
                      {MOTION_STYLE_LIBRARY.filter(
                        (s) => s.category === cat.id
                      ).map((s) => (
                        <option key={s.id} value={s.id}>
                          {s.index}. {s.name} ({s.preferredTechnology})
                        </option>
                      ))}
                    </optgroup>
                  ))}
                </select>
                {selectedStylePreview && (
                  <p className="text-xs text-[#a899bd] leading-relaxed pt-1">
                    {selectedStylePreview.visualCharacteristics}
                  </p>
                )}
              </div>

              <div className="space-y-1.5">
                <label
                  htmlFor="creative-notes-input"
                  className="block text-xs font-semibold text-white"
                >
                  Restrições, Paleta ou Notas de Direção (Opcional)
                </label>
                <input
                  id="creative-notes-input"
                  type="text"
                  value={creativeNotes}
                  onChange={(e) => setCreativeNotes(e.target.value)}
                  disabled={isBusy}
                  placeholder="Ex: Paleta clara editorial (#F8F7F2 e azul marinho), ritmo minimalista..."
                  className="w-full rounded-lg bg-[#140d1f] border border-[#8a2be2]/35 px-3.5 py-2.5 text-xs sm:text-sm text-white placeholder:text-[#66577d] focus:outline-none focus:ring-2 focus:ring-[#8a2be2]"
                />
                <p className="text-xs text-[#84749c]">
                  Se deixado em branco, a IA definirá paleta, ritmo e composição de acordo com o conteúdo do roteiro.
                </p>
              </div>
            </div>
          )}

          {/* Área Principal de Roteiro */}
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <label
              htmlFor="roteiro-textarea"
              className="block text-base sm:text-lg font-semibold text-white"
            >
              Cole seu roteiro aqui (ex: Cena 1: A porta range...)
            </label>
            <div className="hidden sm:flex items-center gap-2 font-mono text-xs tabular-nums text-[#84749c]">
              {adaptiveTiming && (
                <>
                  <span className="text-[#b589f7]">
                    {adaptiveTiming.hasExplicitTimestamps
                      ? `Duração no roteiro: ~${adaptiveTiming.durationSeconds.toFixed(1)}s`
                      : `Duração adaptativa: ~${adaptiveTiming.durationSeconds.toFixed(1)}s (${adaptiveTiming.detectedSceneCount} cena${adaptiveTiming.detectedSceneCount > 1 ? "s" : ""})`}
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
              if (errorMessage) {
                setErrorMessage(null);
                setErrorDetails(null);
              }
            }}
            onKeyDown={handleKeyDown}
            disabled={isBusy}
            placeholder="Ex: Em 2014, o voo partiu de Kuala Lumpur às 00:41 rumo a Pequim. Aos 38 minutos, o transponder desligou sobre o Golfo da Tailândia. Compare os dados de busca: 120.000 km² vasculhados na superfície contra 4,6 milhões de km² do oceano..."
            className="w-full min-h-[210px] rounded-xl bg-[#0d0914] border border-[#8a2be2]/30 focus:border-[#8a2be2] focus:outline-none focus:ring-2 focus:ring-[#8a2be2]/40 px-5 py-4 text-sm sm:text-base text-[#f5f0fc] placeholder:text-[#66577d] leading-relaxed resize-y transition-colors disabled:opacity-60"
          />

          {(isBusy ||
            (liveProgressSteps.length > 0 &&
              liveProgressSteps[liveProgressSteps.length - 1]?.type ===
                "generation_completed" &&
              !errorMessage)) && (
            <div
              aria-live="polite"
              className="rounded-xl border border-[#8a2be2]/35 bg-[#0f0a19] px-4 py-3.5 space-y-2.5"
            >
              <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
                <div className="flex items-center gap-2 font-medium text-[#ece3fa]">
                  {isBusy ? (
                    <Loader2 className="w-4 h-4 text-[#b589f7] animate-spin shrink-0" />
                  ) : (
                    <CheckCircle2 className="w-4 h-4 text-emerald-400 shrink-0" />
                  )}
                  <span>
                    {latestStreamStage || "Conectando ao provedor de IA..."}
                  </span>
                </div>
                {isBusy && (
                  <span className="font-mono text-[11px] tabular-nums text-[#a594bd]">
                    {elapsedSeconds.toFixed(1)}s decorridos
                  </span>
                )}
              </div>

              {liveProgressSteps.length > 1 && (
                <ul className="space-y-1 border-t border-[#8a2be2]/15 pt-2 text-xs text-[#a899bd]">
                  {liveProgressSteps.map((step, idx) => {
                    const isLast = idx === liveProgressSteps.length - 1;
                    return (
                      <li
                        key={step.id}
                        className={`flex items-baseline gap-2 ${
                          step.type === "provider_failed" ||
                          step.type === "fallback_started"
                            ? "text-amber-200/90"
                            : step.type === "generation_completed"
                              ? "text-emerald-300 font-medium"
                              : isLast
                                ? "text-[#e9dff8]"
                                : "text-[#8a7aa3]"
                        }`}
                      >
                        <span className="font-mono text-[10px] opacity-70 shrink-0">
                          {String(idx + 1).padStart(2, "0")}.
                        </span>
                        <span>{step.message}</span>
                      </li>
                    );
                  })}
                </ul>
              )}
            </div>
          )}

          {errorMessage && (
            <div
              role="alert"
              className={`rounded-xl border px-4 py-4 text-sm space-y-3 ${
                errorDetails?.isCancelled
                  ? "bg-[#140d1f] border-[#8a2be2]/35 text-[#e6dcf5]"
                  : "bg-[#240b18] border-rose-500/40 text-rose-100"
              }`}
            >
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div className="flex items-start gap-3 flex-1 min-w-[220px]">
                  <AlertCircle
                    className={`w-5 h-5 shrink-0 mt-0.5 ${
                      errorDetails?.isCancelled
                        ? "text-[#b589f7]"
                        : "text-rose-400"
                    }`}
                  />
                  <div className="space-y-1">
                    <p className="font-semibold leading-snug">{errorMessage}</p>
                    {errorDetails &&
                      errorDetails.failedProviders.length > 0 && (
                        <p className="text-xs text-rose-200/80">
                          Diagnóstico da cascata de provedores:
                        </p>
                      )}
                  </div>
                </div>

                {(errorDetails?.retryable ?? true) && !isBusy && (
                  <button
                    type="button"
                    onClick={handleRetryLastOperation}
                    className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-white/10 hover:bg-white/20 border border-white/20 text-xs font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <RotateCcw className="w-3.5 h-3.5" />
                    <span>Tentar Novamente</span>
                  </button>
                )}
              </div>

              {errorDetails && errorDetails.failedProviders.length > 0 && (
                <ul className="space-y-1.5 pt-1 border-t border-rose-400/20 text-xs">
                  {errorDetails.failedProviders.map((item, idx) => (
                    <li
                      key={`${item.provider}-${idx}`}
                      className="flex flex-wrap items-baseline justify-between gap-2 text-rose-100/90"
                    >
                      <span className="font-medium">
                        {idx + 1}. {item.providerLabel}{" "}
                        <span className="font-mono text-[11px] opacity-75">
                          ({item.model})
                        </span>
                      </span>
                      <span className="text-rose-200/85">
                        {item.outcome === "skipped"
                          ? "Chave de API não configurada"
                          : `${item.userMessage || "Falhou"} · ${(item.durationMs / 1000).toFixed(1)}s`}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </div>
          )}

          {/* Barra de Ação Principal conforme o Modo Selecionado */}
          <div className="flex flex-wrap items-center justify-between gap-4 pt-1">
            {creationMode === "direct" ? (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handleDirectGenerate}
                  disabled={isBusy}
                  className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-[#8a2be2] hover:bg-[#9b42ee] active:scale-[0.99] disabled:opacity-60 disabled:pointer-events-none text-white font-semibold text-sm sm:text-base shadow-[0_0_28px_rgba(138,43,226,0.38)] transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  {operation === "generating_direct" ? (
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
                {isBusy && (
                  <button
                    type="button"
                    onClick={handleCancelActiveOperation}
                    className="inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-[#191026] hover:bg-rose-950/70 border border-rose-500/35 text-rose-200 font-semibold text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <XCircle className="w-4 h-4 text-rose-400" />
                    <span>Cancelar Geração</span>
                  </button>
                )}
              </div>
            ) : (
              <div className="flex flex-wrap items-center gap-3">
                <button
                  type="button"
                  onClick={handlePlanStoryboard}
                  disabled={isBusy}
                  className="inline-flex items-center justify-center gap-2.5 px-6 py-3.5 rounded-xl bg-[#8a2be2] hover:bg-[#9b42ee] active:scale-[0.99] disabled:opacity-60 disabled:pointer-events-none text-white font-semibold text-sm sm:text-base shadow-[0_0_28px_rgba(138,43,226,0.38)] transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
                >
                  {operation === "planning_storyboard" ? (
                    <>
                      <Loader2 className="w-5 h-5 animate-spin" />
                      <span>Planejando Direção & Storyboard...</span>
                    </>
                  ) : (
                    <>
                      <LayoutList className="w-5 h-5" />
                      <span>
                        {storyboardProject
                          ? "Replanejar Storyboard do Roteiro"
                          : "Planejar Storyboard com IA"}
                      </span>
                    </>
                  )}
                </button>
                {isBusy && (
                  <button
                    type="button"
                    onClick={handleCancelActiveOperation}
                    className="inline-flex items-center justify-center gap-2 px-4 py-3.5 rounded-xl bg-[#191026] hover:bg-rose-950/70 border border-rose-500/35 text-rose-200 font-semibold text-sm transition-colors whitespace-nowrap shrink-0 cursor-pointer"
                  >
                    <XCircle className="w-4 h-4 text-rose-400" />
                    <span>Cancelar</span>
                  </button>
                )}
              </div>
            )}

            <span className="text-xs text-[#84749c]">
              Atalho rápido: pressione{" "}
              <kbd className="font-mono text-[#b9accb]">Ctrl</kbd> +{" "}
              <kbd className="font-mono text-[#b9accb]">Enter</kbd> para{" "}
              {creationMode === "direct"
                ? "gerar diretamente"
                : "planejar o storyboard"}
            </span>
          </div>
        </section>

        {/* Espaço Interativo de Storyboard (Exibido quando em Modo B com projeto planejado) */}
        {creationMode === "storyboard" && storyboardProject && (
          <StoryboardWorkspace
            project={storyboardProject}
            onChangeProject={setStoryboardProject}
            onRegenerateScene={handleRegenerateScene}
            regeneratingSceneId={regeneratingSceneId}
            neighborImpactNotes={neighborImpactNotes}
            onDismissNeighborNotes={() => setNeighborImpactNotes([])}
            onRenderApprovedStoryboard={handleRenderApprovedStoryboard}
            isRenderingFinal={operation === "rendering_storyboard"}
            hasRenderedAnimation={Boolean(generatedHtml) && !isRenderingHtml}
            onSeekPreviewToTime={handleSeekPreviewToTime}
          />
        )}

        {/* Palco de Preview em Tempo Real 16:9 + Exportação HTML e 60 FPS ZIP */}
        <section id="preview" className="space-y-5 scroll-mt-24">
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <h2 className="font-display text-2xl font-bold tracking-wide uppercase text-white">
              Preview em Tempo Real
            </h2>
            <p className="text-xs text-[#9c8cb3]">
              {lastDirectMeta
                ? `Estilo: ${lastDirectMeta.selectedStyleIds.map((id) => getStyleById(id).name).join(" + ")} · Tecnologia: ${lastDirectMeta.renderTechnology} · 60 FPS ZIP`
                : "1920×1080 Widescreen · Sincronia Determinística window.seek(t) · 60 FPS ZIP"}
            </p>
          </div>

          <PreviewStage
            generatedHtml={generatedHtml}
            isGenerating={isRenderingHtml}
            elapsedSeconds={elapsedSeconds}
            estimatedVideoDuration={
              isRenderingHtml
                ? activeGenerationTargetDuration
                : creationMode === "storyboard" && storyboardProject
                  ? storyboardProject.timeline.totalDuration
                  : liveEstimatedDuration
            }
            externalSeekRequest={externalSeekRequest}
            loadingLabel={
              operation === "rendering_storyboard"
                ? "Renderizando Storyboard Aprovado"
                : "Dirigindo e Compondo Motion Graphic"
            }
            loadingSubtitle={
              latestStreamStage ||
              (operation === "rendering_storyboard"
                ? `Executando as ${storyboardProject?.scenes.length ?? 0} cenas aprovadas em 1920×1080 com sincronia window.seek(t)...`
                : "Interpretando o roteiro, aplicando direção de arte especializada e compilando window.seek(t)...")
            }
          />

          {/* Barra de Exportação / Download */}
          <div
            id="exportacao"
            className="flex flex-wrap items-center justify-between gap-4 pt-2 scroll-mt-24"
          >
            <div className="text-xs sm:text-sm text-[#9c8cb3] max-w-xl">
              {generatedHtml
                ? "O arquivo HTML gerado é 100% autocontido e inclui captura determinística de quadros PNG de 0s até window.DURATION em passos de 1/60s."
                : "Os botões de download de HTML e sequência de frames (.zip) são habilitados assim que a animação é renderizada."}
            </div>

            <div className="flex flex-wrap items-center gap-3 shrink-0">
              <button
                type="button"
                onClick={handleTriggerFramesDownload}
                disabled={
                  !generatedHtml || isRenderingHtml || exportProgress.active
                }
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
                disabled={!generatedHtml || isRenderingHtml}
                className="inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl bg-[#8a2be2] hover:bg-[#9b42ee] disabled:opacity-40 disabled:pointer-events-none text-white font-semibold text-sm shadow-[0_0_20px_rgba(138,43,226,0.3)] transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
              >
                <Download className="w-4 h-4" />
                <span>Baixar HTML</span>
              </button>
            </div>
          </div>
        </section>

        {/* Catálogo Consultável da Biblioteca de 30 Estilos Especializados */}
        <section
          id="identidade"
          className="pt-8 border-t border-[#8a2be2]/15 space-y-6 scroll-mt-24"
        >
          <div className="flex flex-wrap items-baseline justify-between gap-4">
            <div className="space-y-1">
              <h2 className="font-display text-2xl font-bold uppercase tracking-wide text-white">
                Biblioteca de 30 Estilos Especializados
              </h2>
              <p className="text-xs sm:text-sm text-[#a899bd]">
                A IA seleciona e combina estilos automaticamente pelo conteúdo do roteiro, ou você pode fixar qualquer especialização abaixo.
              </p>
            </div>
            {preferredStyleId !== "auto" && (
              <button
                type="button"
                onClick={() => setPreferredStyleId("auto")}
                className="text-xs text-[#c59cff] hover:text-white underline cursor-pointer whitespace-nowrap"
              >
                Restaurar Autonomia Automática da IA
              </button>
            )}
          </div>

          {/* Abas das 7 Categorias */}
          <div className="flex flex-wrap items-center gap-1.5 p-1 rounded-xl bg-[#0d0914] border border-[#8a2be2]/20">
            {STYLE_CATEGORIES.map((cat) => (
              <button
                key={cat.id}
                type="button"
                onClick={() => setActiveCatalogCategory(cat.id)}
                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors whitespace-nowrap shrink-0 cursor-pointer ${
                  activeCatalogCategory === cat.id
                    ? "bg-[#2a0033] text-white border border-[#8a2be2]/45"
                    : "text-[#9c8cb3] hover:text-white"
                }`}
              >
                {cat.label}
              </button>
            ))}
          </div>

          {/* Lista de Estilos da Categoria Selecionada */}
          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            {MOTION_STYLE_LIBRARY.filter(
              (s) => s.category === activeCatalogCategory
            ).map((style) => {
              const isSelected = preferredStyleId === style.id;
              return (
                <div
                  key={style.id}
                  className={`rounded-xl p-5 bg-[#0d0914] border transition-colors flex flex-col justify-between gap-4 ${
                    isSelected
                      ? "border-[#8a2be2]"
                      : "border-[#8a2be2]/20 hover:border-[#8a2be2]/40"
                  }`}
                >
                  <div className="space-y-2">
                    <div className="flex items-baseline justify-between gap-3">
                      <h3 className="font-display text-lg font-semibold uppercase tracking-wide text-white">
                        {String(style.index).padStart(2, "0")}. {style.name}
                      </h3>
                      <span className="font-mono text-[11px] text-[#b589f7] shrink-0">
                        {style.preferredTechnology}
                      </span>
                    </div>
                    <p className="text-xs sm:text-sm text-[#b9accb] leading-relaxed">
                      {style.visualCharacteristics}
                    </p>
                    <p className="text-xs text-[#84749c] leading-relaxed">
                      Técnicas: {style.animationTechniques}
                    </p>
                  </div>

                  <div className="flex items-center justify-between gap-3 pt-2 border-t border-white/5 text-xs">
                    <span className="text-[#9c8cb3] truncate">
                      Ideal para: {style.bestUseCases}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        setPreferredStyleId(isSelected ? "auto" : style.id);
                        setShowAdvancedControls(true);
                        document
                          .getElementById("roteiro")
                          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                      }}
                      className={`px-3 py-1.5 rounded-lg font-semibold whitespace-nowrap shrink-0 cursor-pointer transition-colors ${
                        isSelected
                          ? "bg-[#8a2be2] text-white"
                          : "bg-[#191026] hover:bg-[#2a0033] text-[#e5dbf5] border border-[#8a2be2]/30"
                      }`}
                    >
                      {isSelected ? "Selecionado" : "Usar Estilo"}
                    </button>
                  </div>
                </div>
              );
            })}
          </div>
        </section>
      </main>

      <footer className="w-full border-t border-[#8a2be2]/15 py-6 mt-8">
        <div className="max-w-6xl mx-auto px-6 flex flex-wrap items-center justify-between gap-4 text-xs text-[#796891]">
          <span>Mala.Sombre Motion Studio</span>
          <span>
            Direção Criativa IA · Storyboard Interativo · Canvas 2D / SVG / HTML · 60 FPS JSZip
          </span>
        </div>
      </footer>
    </div>
  );
}
