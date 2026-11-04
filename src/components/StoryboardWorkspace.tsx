import React, { useState } from "react";
import {
  ArrowDown,
  ArrowUp,
  Check,
  CheckCheck,
  Clapperboard,
  Edit3,
  Loader2,
  Plus,
  RefreshCw,
  Trash2,
  AlertTriangle,
  Play,
} from "lucide-react";
import {
  computeApprovalStatus,
  createStableId,
  recalculateStoryboardTimeline,
} from "../shared/motionStudioContracts";
import type {
  ColorPaletteSpec,
  ProjectContextMemory,
  RenderTechnology,
  StoryboardScene,
  StyleId,
} from "../shared/motionStudioContracts";
import {
  MOTION_STYLE_LIBRARY,
  STYLE_CATEGORIES,
  getStyleById,
} from "../shared/styleLibrary";

interface StoryboardWorkspaceProps {
  project: ProjectContextMemory;
  onChangeProject: (updated: ProjectContextMemory) => void;
  onRegenerateScene: (
    sceneId: string,
    instruction: string,
    requestedStyleId?: StyleId
  ) => Promise<void>;
  regeneratingSceneId: string | null;
  neighborImpactNotes: string[];
  onDismissNeighborNotes: () => void;
  onRenderApprovedStoryboard: () => void;
  isRenderingFinal: boolean;
  hasRenderedAnimation: boolean;
  onSeekPreviewToTime?: (timeSeconds: number) => void;
}

const TECH_LABELS: Record<RenderTechnology, string> = {
  canvas2d: "Canvas 2D (Quadro a Quadro)",
  svg: "SVG Vetorial Escalável",
  "html-css": "HTML/CSS Sincronizado",
  hybrid: "Híbrido (Canvas 2D + SVG)",
};

const PALETTE_KEYS: Array<{ key: keyof Omit<ColorPaletteSpec, "paletteRationale">; label: string }> = [
  { key: "background", label: "Fundo" },
  { key: "surface", label: "Superfície" },
  { key: "primary", label: "Primária" },
  { key: "secondary", label: "Secundária" },
  { key: "accent", label: "Acento" },
  { key: "text", label: "Texto" },
];

export function StoryboardWorkspace({
  project,
  onChangeProject,
  onRegenerateScene,
  regeneratingSceneId,
  neighborImpactNotes,
  onDismissNeighborNotes,
  onRenderApprovedStoryboard,
  isRenderingFinal,
  hasRenderedAnimation,
  onSeekPreviewToTime,
}: StoryboardWorkspaceProps) {
  const [editingSceneId, setEditingSceneId] = useState<string | null>(null);
  const [regenOpenSceneId, setRegenOpenSceneId] = useState<string | null>(null);
  const [regenInstruction, setRegenInstruction] = useState<string>("");
  const [regenStyleOverride, setRegenStyleOverride] = useState<StyleId | "keep">("keep");
  const [editingArtDirection, setEditingArtDirection] = useState<boolean>(false);

  const { artDirection, scenes, timeline, approvalStatus } = project;
  const approvedCount = scenes.filter((s) => s.approved).length;
  const isAllApproved = approvalStatus === "approved" && scenes.length > 0;

  const commitScenesUpdate = (
    nextScenesRaw: StoryboardScene[],
    nextArtDirection = artDirection,
    extraDecision?: string
  ) => {
    const recalculated = recalculateStoryboardTimeline(nextScenesRaw, nextArtDirection);
    const nextStatus = computeApprovalStatus(recalculated.scenes);
    onChangeProject({
      ...project,
      artDirection: nextArtDirection,
      scenes: recalculated.scenes,
      timeline: recalculated.timeline,
      approvalStatus: nextStatus,
      approvedDecisions: extraDecision
        ? Array.from(new Set([...project.approvedDecisions, extraDecision]))
        : project.approvedDecisions,
      updatedAtIso: new Date().toISOString(),
    });
  };

  const handleApproveAll = () => {
    const allApprovedScenes = scenes.map((s) => ({ ...s, approved: true }));
    commitScenesUpdate(
      allApprovedScenes,
      artDirection,
      `Storyboard aprovado integralmente (${scenes.length} cenas, ${timeline.totalDuration.toFixed(1)}s)`
    );
  };

  const handleToggleSceneApprove = (sceneId: string) => {
    const updated = scenes.map((s) =>
      s.id === sceneId ? { ...s, approved: !s.approved } : s
    );
    commitScenesUpdate(updated);
  };

  const handleUpdateSceneField = <K extends keyof StoryboardScene>(
    sceneId: string,
    field: K,
    value: StoryboardScene[K]
  ) => {
    const updated = scenes.map((s) =>
      s.id === sceneId
        ? {
            ...s,
            [field]: value,
          }
        : s
    );
    commitScenesUpdate(updated);
  };

  const handleMoveScene = (sceneId: string, direction: -1 | 1) => {
    const idx = scenes.findIndex((s) => s.id === sceneId);
    if (idx === -1) return;
    const targetIdx = idx + direction;
    if (targetIdx < 0 || targetIdx >= scenes.length) return;

    const copy = [...scenes];
    const [moved] = copy.splice(idx, 1);
    copy.splice(targetIdx, 0, {
      ...moved,
      continuityNotes: `${moved.continuityNotes} (Ordem ajustada manualmente — transições sincronizadas na timeline).`,
    });
    commitScenesUpdate(copy);
  };

  const handleDeleteScene = (sceneId: string) => {
    if (scenes.length <= 1) return;
    const filtered = scenes.filter((s) => s.id !== sceneId);
    if (editingSceneId === sceneId) setEditingSceneId(null);
    if (regenOpenSceneId === sceneId) setRegenOpenSceneId(null);
    commitScenesUpdate(filtered);
  };

  const handleAddScene = () => {
    const newId = createStableId("sc_custom");
    const lastScene = scenes[scenes.length - 1];
    const newScene: StoryboardScene = {
      id: newId,
      order: scenes.length + 1,
      title: `Nova Cena ${scenes.length + 1}`,
      narrativeObjective: "Complementar a progressão visual do roteiro.",
      startTime: 0,
      endTime: 0,
      duration: 4.0,
      styleId: artDirection.primaryStyleId,
      visualDescription:
        "Composição alinhada à Direção de Arte principal com foco claro na mensagem.",
      presentElements: ["Elemento focal", "Tipografia de apoio"],
      layoutAndHierarchy: "Elemento principal centralizado dentro da área segura 1920×1080.",
      onScreenText: "",
      motionAndAnimation: "Entrada suave com ease-out quintic seguida de pausa para leitura.",
      entryTransition: lastScene
        ? `Continuidade a partir de "${lastScene.title}"`
        : "Abertura suave",
      exitTransition: "Corte suave / fechamento",
      continuityNotes: "Cena adicionada pelo usuário no editor de storyboard.",
      approved: false,
    };

    commitScenesUpdate([...scenes, newScene]);
    setEditingSceneId(newId);
  };

  const handleUpdatePaletteColor = (
    key: keyof Omit<ColorPaletteSpec, "paletteRationale">,
    hex: string
  ) => {
    const nextArt = {
      ...artDirection,
      colorPalette: {
        ...artDirection.colorPalette,
        [key]: hex,
      },
    };
    commitScenesUpdate(scenes, nextArt);
  };

  const handlePrimaryStyleChange = (nextStyleId: StyleId) => {
    const spec = getStyleById(nextStyleId);
    const prevPrimary = artDirection.primaryStyleId;
    const nextArt = {
      ...artDirection,
      primaryStyleId: nextStyleId,
      renderTechnology: spec.preferredTechnology,
    };
    const nextScenes = scenes.map((sc) =>
      sc.styleId === prevPrimary ? { ...sc, styleId: nextStyleId } : sc
    );
    commitScenesUpdate(nextScenes, nextArt, `Estilo principal ajustado para ${spec.name}`);
  };

  const submitSceneRegeneration = async (scene: StoryboardScene) => {
    const chosenStyle =
      regenStyleOverride !== "keep" ? regenStyleOverride : undefined;
    await onRegenerateScene(scene.id, regenInstruction, chosenStyle);
    setRegenOpenSceneId(null);
    setRegenInstruction("");
    setRegenStyleOverride("keep");
  };

  return (
    <section
      id="storyboard"
      className="space-y-8 pt-4 scroll-mt-24"
      aria-label="Planejamento de Direção de Arte e Storyboard"
    >
      {/* Cabeçalho do Espaço de Storyboard e Barra de Status de Aprovação */}
      <div className="flex flex-wrap items-center justify-between gap-4 border-b border-[#8a2be2]/20 pb-5">
        <div className="space-y-1">
          <div className="flex flex-wrap items-center gap-2 text-xs text-[#b589f7]">
            <span>Direção Criativa & Storyboard</span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              {scenes.length} {scenes.length === 1 ? "cena" : "cenas"}
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums">
              Duração total: {timeline.totalDuration.toFixed(1)}s
            </span>
            <span aria-hidden="true">·</span>
            <span className="font-mono tabular-nums text-white">
              {approvedCount}/{scenes.length} aprovadas
            </span>
          </div>
          <h2 className="font-display text-2xl sm:text-3xl font-bold uppercase tracking-wide text-white">
            Revisão Visual e Aprovação de Cenas
          </h2>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={handleApproveAll}
            disabled={isRenderingFinal || Boolean(regeneratingSceneId) || isAllApproved}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#191026] hover:bg-[#2a0033] disabled:opacity-50 disabled:pointer-events-none border border-[#8a2be2]/40 text-xs sm:text-sm font-semibold text-white transition-colors whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[#8a2be2]"
          >
            <CheckCheck className="w-4 h-4 text-[#b589f7]" />
            <span>
              {isAllApproved ? "Storyboard Aprovado" : "Aprovar Todo o Storyboard"}
            </span>
          </button>

          <button
            type="button"
            onClick={onRenderApprovedStoryboard}
            disabled={!isAllApproved || isRenderingFinal || Boolean(regeneratingSceneId)}
            title={
              isAllApproved
                ? "Renderizar animação final a partir do storyboard aprovado"
                : "Aprove todas as cenas do storyboard para liberar a geração final"
            }
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#8a2be2] hover:bg-[#9b42ee] disabled:opacity-40 disabled:pointer-events-none text-white text-xs sm:text-sm font-semibold shadow-[0_0_24px_rgba(138,43,226,0.35)] transition-all whitespace-nowrap shrink-0 cursor-pointer focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-white"
          >
            {isRenderingFinal ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Renderizando Animação...</span>
              </>
            ) : (
              <>
                <Clapperboard className="w-4 h-4" />
                <span>Gerar Animação Aprovada</span>
              </>
            )}
          </button>
        </div>
      </div>

      {!isAllApproved && (
        <p className="text-xs sm:text-sm text-[#b9accb]">
          Revise, edite ou regenere cenas individuais abaixo. Quando estiver de acordo com o planejamento, clique em{" "}
          <strong className="text-white font-semibold">Aprovar Todo o Storyboard</strong> (ou aprove cena a cena) para liberar{" "}
          <strong className="text-white font-semibold">Gerar Animação Aprovada</strong>.
        </p>
      )}

      {/* Notas de Impacto em Cenas Vizinhas / Avisos de Continuidade */}
      {(neighborImpactNotes.length > 0 || timeline.continuityWarnings.length > 0) && (
        <div className="rounded-xl bg-[#160f24] border border-amber-400/35 px-4 py-3.5 space-y-2 text-xs sm:text-sm text-amber-100">
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 font-semibold text-amber-300">
              <AlertTriangle className="w-4 h-4 shrink-0" />
              <span>Verificação de Continuidade entre Cenas</span>
            </div>
            {neighborImpactNotes.length > 0 && (
              <button
                type="button"
                onClick={onDismissNeighborNotes}
                className="text-xs text-amber-300 hover:text-white underline cursor-pointer whitespace-nowrap"
              >
                Ocultar notas recentes
              </button>
            )}
          </div>
          <ul className="space-y-1 text-[#e6dcf5]">
            {neighborImpactNotes.map((note, idx) => (
              <li key={`n_${idx}`}>• {note}</li>
            ))}
            {timeline.continuityWarnings.map((warn, idx) => (
              <li key={`w_${idx}`}>• {warn}</li>
            ))}
          </ul>
        </div>
      )}

      {/* Bloco 1: Direção de Arte e Memória Visual do Projeto */}
      <div className="rounded-xl bg-[#0d0914] border border-[#8a2be2]/25 p-5 sm:p-6 space-y-5">
        <div className="flex flex-wrap items-start justify-between gap-4">
          <div className="space-y-1 max-w-3xl">
            <div className="flex flex-wrap items-center gap-2 text-xs text-[#9c8cb3]">
              <span>Direção de Arte Proposta</span>
              <span aria-hidden="true">·</span>
              <span className="text-[#d6b8ff]">
                {getStyleById(artDirection.primaryStyleId).name}
              </span>
              <span aria-hidden="true">·</span>
              <span>{TECH_LABELS[artDirection.renderTechnology]}</span>
            </div>
            <h3 className="text-lg sm:text-xl font-semibold text-white">
              {artDirection.themeAndSubject}
            </h3>
            <p className="text-sm text-[#b9accb] leading-relaxed">
              {artDirection.communicationObjective}
            </p>
          </div>

          <button
            type="button"
            onClick={() => setEditingArtDirection((prev) => !prev)}
            className="inline-flex items-center gap-2 px-3.5 py-2 rounded-lg bg-[#191026] hover:bg-[#2a0033] border border-[#8a2be2]/30 text-xs font-medium text-[#e5dbf5] transition-colors whitespace-nowrap shrink-0 cursor-pointer"
          >
            <Edit3 className="w-3.5 h-3.5 text-[#b589f7]" />
            <span>{editingArtDirection ? "Concluir Ajustes Globais" : "Ajustar Direção de Arte"}</span>
          </button>
        </div>

        {/* Grade Resumo da Direção Criativa */}
        <div className="grid grid-cols-1 md:grid-cols-3 gap-5 pt-2 border-t border-[#8a2be2]/15 text-xs sm:text-sm">
          <div className="space-y-1.5">
            <span className="text-xs text-[#84749c] block">Tom Emocional & Público</span>
            <p className="text-[#f3eff8] font-medium">{artDirection.emotionalTone}</p>
            <p className="text-xs text-[#a899bd]">
              Público: {artDirection.targetAudience} · Ritmo: {artDirection.narrativePacing}
            </p>
          </div>

          <div className="space-y-1.5">
            <span className="text-xs text-[#84749c] block">Tipografia & Elementos Recorrentes</span>
            <p className="text-[#f3eff8] font-medium">
              {artDirection.typography.displayFont} + {artDirection.typography.bodyFont}
            </p>
            <p className="text-xs text-[#a899bd]">
              {artDirection.recurringElements.length > 0
                ? artDirection.recurringElements.join(" · ")
                : artDirection.compositionRules}
            </p>
          </div>

          <div className="space-y-2">
            <span className="text-xs text-[#84749c] block">
              Paleta Escolhida para o Conteúdo
            </span>
            <div className="flex flex-wrap items-center gap-2">
              {PALETTE_KEYS.map(({ key, label }) => (
                <label
                  key={key}
                  title={`${label}: ${artDirection.colorPalette[key]} (clique para ajustar)`}
                  className="inline-flex items-center gap-1.5 px-2 py-1 rounded-md bg-[#140d1f] border border-white/10 cursor-pointer"
                >
                  <input
                    type="color"
                    value={
                      /^#[0-9a-fA-F]{6}$/.test(artDirection.colorPalette[key])
                        ? artDirection.colorPalette[key]
                        : "#8a2be2"
                    }
                    onChange={(e) => handleUpdatePaletteColor(key, e.target.value)}
                    className="w-4 h-4 rounded border-0 bg-transparent p-0 cursor-pointer"
                  />
                  <span className="text-[11px] text-[#d7cae8]">{label}</span>
                </label>
              ))}
            </div>
          </div>
        </div>

        {/* Painel Expansível para Ajuste Global de Estilo, Tecnologia e Fontes */}
        {editingArtDirection && (
          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 pt-4 border-t border-[#8a2be2]/15">
            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#c5b8d8]">
                Estilo Principal (Biblioteca de 30 Estilos)
              </label>
              <select
                value={artDirection.primaryStyleId}
                onChange={(e) => handlePrimaryStyleChange(e.target.value as StyleId)}
                className="w-full rounded-lg bg-[#140d1f] border border-[#8a2be2]/35 px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#8a2be2]"
              >
                {STYLE_CATEGORIES.map((cat) => (
                  <optgroup key={cat.id} label={cat.label}>
                    {MOTION_STYLE_LIBRARY.filter((s) => s.category === cat.id).map((s) => (
                      <option key={s.id} value={s.id}>
                        {s.index}. {s.name}
                      </option>
                    ))}
                  </optgroup>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#c5b8d8]">
                Tecnologia de Renderização
              </label>
              <select
                value={artDirection.renderTechnology}
                onChange={(e) =>
                  commitScenesUpdate(scenes, {
                    ...artDirection,
                    renderTechnology: e.target.value as RenderTechnology,
                  })
                }
                className="w-full rounded-lg bg-[#140d1f] border border-[#8a2be2]/35 px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#8a2be2]"
              >
                <option value="canvas2d">Canvas 2D (1920×1080)</option>
                <option value="svg">SVG Vetorial (1920×1080)</option>
                <option value="html-css">HTML/CSS Sincronizado</option>
                <option value="hybrid">Híbrido (Canvas 2D + SVG)</option>
              </select>
            </div>

            <div className="space-y-1.5">
              <label className="block text-xs font-medium text-[#c5b8d8]">
                Fonte Display Principal (Google Fonts)
              </label>
              <input
                type="text"
                value={artDirection.typography.displayFont}
                onChange={(e) =>
                  commitScenesUpdate(scenes, {
                    ...artDirection,
                    typography: {
                      ...artDirection.typography,
                      displayFont: e.target.value,
                    },
                  })
                }
                className="w-full rounded-lg bg-[#140d1f] border border-[#8a2be2]/35 px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#8a2be2]"
              />
            </div>
          </div>
        )}
      </div>

      {/* Bloco 2: Barra Visual Proporcional da Timeline (sincronizada a window.DURATION) */}
      <div className="space-y-2.5">
        <div className="flex flex-wrap items-center justify-between gap-2 text-xs text-[#9c8cb3]">
          <span className="font-medium text-[#d7cae8]">
            Linha do Tempo dos Segmentos (`window.DURATION = {timeline.totalDuration.toFixed(2)}s`)
          </span>
          <span>
            {hasRenderedAnimation
              ? "Clique em um segmento para inspecionar seu instante exato no Preview"
              : "Segmentos contínuos sem lacunas ou sobreposições"}
          </span>
        </div>

        <div className="w-full flex rounded-xl overflow-hidden border border-[#8a2be2]/30 bg-[#0d0914] min-h-[54px]">
          {timeline.segments.map((seg, idx) => {
            const widthPct = Math.max(
              6,
              (seg.duration / Math.max(0.1, timeline.totalDuration)) * 100
            );
            const sceneApproved = scenes.find((s) => s.id === seg.sceneId)?.approved;
            return (
              <button
                key={seg.sceneId}
                type="button"
                onClick={() => {
                  const cardEl = document.getElementById(`card-${seg.sceneId}`);
                  cardEl?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                  if (hasRenderedAnimation && onSeekPreviewToTime) {
                    onSeekPreviewToTime(seg.startTime);
                  }
                }}
                style={{ width: `${widthPct}%` }}
                title={`Cena ${seg.order}: ${seg.title} (${seg.startTime.toFixed(1)}s – ${seg.endTime.toFixed(1)}s)`}
                className={`group flex flex-col justify-between px-2.5 py-2 text-left transition-colors cursor-pointer ${
                  idx > 0 ? "border-l border-[#8a2be2]/25" : ""
                } ${
                  sceneApproved
                    ? "bg-[#221133] hover:bg-[#2d1744]"
                    : "bg-[#120c1c] hover:bg-[#1d132e]"
                }`}
              >
                <span className="text-[11px] font-semibold text-white truncate w-full">
                  {String(seg.order).padStart(2, "0")}. {seg.title}
                </span>
                <span className="font-mono text-[10px] tabular-nums text-[#b589f7] truncate w-full">
                  {seg.startTime.toFixed(1)}s–{seg.endTime.toFixed(1)}s
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Bloco 3: Lista de Cartões de Cenas do Storyboard */}
      <div className="space-y-4">
        {scenes.map((scene, index) => {
          const isEditing = editingSceneId === scene.id;
          const isRegenOpen = regenOpenSceneId === scene.id;
          const isRegeneratingThis = regeneratingSceneId === scene.id;
          const sceneStyleSpec = getStyleById(scene.styleId);

          return (
            <article
              key={scene.id}
              id={`card-${scene.id}`}
              className={`rounded-xl bg-[#0d0914] border transition-colors p-5 sm:p-6 space-y-4 ${
                scene.approved
                  ? "border-emerald-500/40"
                  : "border-[#8a2be2]/25"
              }`}
            >
              {/* Topo do Cartão: Número, Título, Tempo, Estilo e Ações Principais */}
              <div className="flex flex-wrap items-start justify-between gap-4">
                <div className="space-y-1">
                  <div className="flex flex-wrap items-center gap-2 text-xs text-[#9c8cb3]">
                    <span className="font-mono font-semibold text-[#c59cff] tabular-nums">
                      Cena {String(scene.order).padStart(2, "0")}
                    </span>
                    <span aria-hidden="true">·</span>
                    <span className="font-mono tabular-nums text-white">
                      {scene.startTime.toFixed(1)}s – {scene.endTime.toFixed(1)}s ({scene.duration.toFixed(1)}s)
                    </span>
                    <span aria-hidden="true">·</span>
                    <span>{sceneStyleSpec.name}</span>
                    <span aria-hidden="true">·</span>
                    <span className={scene.approved ? "text-emerald-300 font-medium" : "text-amber-300/90"}>
                      {scene.approved ? "Aprovada" : "Aguardando aprovação"}
                    </span>
                  </div>
                  <h4 className="font-display text-xl font-bold tracking-wide text-white uppercase">
                    {scene.title}
                  </h4>
                </div>

                {/* Controles do Cartão de Cena */}
                <div className="flex flex-wrap items-center gap-2">
                  {hasRenderedAnimation && onSeekPreviewToTime && (
                    <button
                      type="button"
                      onClick={() => {
                        onSeekPreviewToTime(scene.startTime);
                        document
                          .getElementById("preview")
                          ?.scrollIntoView({ behavior: "smooth", block: "nearest" });
                      }}
                      title="Ver este instante no Preview"
                      className="inline-flex items-center gap-1.5 px-2.5 py-1.5 rounded-lg bg-[#191026] hover:bg-[#2a0033] border border-[#8a2be2]/30 text-xs text-[#e5dbf5] cursor-pointer whitespace-nowrap"
                    >
                      <Play className="w-3.5 h-3.5 text-[#b589f7]" />
                      <span>Ver no Preview</span>
                    </button>
                  )}

                  <button
                    type="button"
                    onClick={() => handleToggleSceneApprove(scene.id)}
                    disabled={isRegeneratingThis || isRenderingFinal}
                    className={`inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg border text-xs font-semibold transition-colors cursor-pointer whitespace-nowrap ${
                      scene.approved
                        ? "bg-emerald-950/60 border-emerald-500/50 text-emerald-200 hover:bg-emerald-900/50"
                        : "bg-[#191026] border-[#8a2be2]/35 text-white hover:bg-[#2a0033]"
                    }`}
                  >
                    <Check className="w-3.5 h-3.5" />
                    <span>{scene.approved ? "Cena Aprovada" : "Aprovar Cena"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setEditingSceneId(isEditing ? null : scene.id);
                      setRegenOpenSceneId(null);
                    }}
                    disabled={isRegeneratingThis || isRenderingFinal}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#191026] hover:bg-[#2a0033] border border-[#8a2be2]/30 text-xs font-medium text-[#e5dbf5] cursor-pointer whitespace-nowrap"
                  >
                    <Edit3 className="w-3.5 h-3.5 text-[#b589f7]" />
                    <span>{isEditing ? "Fechar Edição" : "Editar"}</span>
                  </button>

                  <button
                    type="button"
                    onClick={() => {
                      setRegenOpenSceneId(isRegenOpen ? null : scene.id);
                      setEditingSceneId(null);
                    }}
                    disabled={isRegeneratingThis || isRenderingFinal}
                    className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-[#191026] hover:bg-[#2a0033] border border-[#8a2be2]/30 text-xs font-medium text-[#e5dbf5] cursor-pointer whitespace-nowrap"
                  >
                    {isRegeneratingThis ? (
                      <>
                        <Loader2 className="w-3.5 h-3.5 text-[#b589f7] animate-spin" />
                        <span>Regenerando...</span>
                      </>
                    ) : (
                      <>
                        <RefreshCw className="w-3.5 h-3.5 text-[#b589f7]" />
                        <span>Nova Ideia IA</span>
                      </>
                    )}
                  </button>

                  <button
                    type="button"
                    onClick={() => handleMoveScene(scene.id, -1)}
                    disabled={index === 0 || isRegeneratingThis || isRenderingFinal}
                    aria-label="Mover cena para cima"
                    title="Mover cena para cima"
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#191026] hover:bg-[#2a0033] disabled:opacity-35 disabled:pointer-events-none border border-[#8a2be2]/25 text-[#d7cae8] cursor-pointer"
                  >
                    <ArrowUp className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleMoveScene(scene.id, 1)}
                    disabled={
                      index === scenes.length - 1 || isRegeneratingThis || isRenderingFinal
                    }
                    aria-label="Mover cena para baixo"
                    title="Mover cena para baixo"
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#191026] hover:bg-[#2a0033] disabled:opacity-35 disabled:pointer-events-none border border-[#8a2be2]/25 text-[#d7cae8] cursor-pointer"
                  >
                    <ArrowDown className="w-3.5 h-3.5" />
                  </button>

                  <button
                    type="button"
                    onClick={() => handleDeleteScene(scene.id)}
                    disabled={scenes.length <= 1 || isRegeneratingThis || isRenderingFinal}
                    aria-label="Excluir cena"
                    title={
                      scenes.length <= 1
                        ? "O storyboard requer ao menos uma cena"
                        : "Excluir esta cena"
                    }
                    className="inline-flex items-center justify-center w-8 h-8 rounded-lg bg-[#191026] hover:bg-rose-950/70 disabled:opacity-35 disabled:pointer-events-none border border-rose-500/25 text-rose-300 cursor-pointer"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                  </button>
                </div>
              </div>

              {/* Corpo Visual do Cartão: Esquema Gráfico 16:9 + Especificações da Cena */}
              <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
                {/* Esquema Gráfico Simplificado 16:9 da Composição Planejada */}
                <div className="lg:col-span-4 flex flex-col justify-between rounded-lg overflow-hidden border border-white/10">
                  <div
                    className="aspect-video w-full relative p-3.5 flex flex-col justify-between overflow-hidden"
                    style={{
                      backgroundColor: artDirection.colorPalette.background,
                      color: artDirection.colorPalette.text,
                    }}
                  >
                    {/* Grade de Área Segura esquemática */}
                    <div
                      className="absolute inset-3 border border-dashed rounded pointer-events-none opacity-35"
                      style={{ borderColor: artDirection.colorPalette.primary }}
                    />
                    <div className="relative z-10 flex items-center justify-between text-[10px] font-mono opacity-80">
                      <span>ESQUEMA 16:9</span>
                      <span>{sceneStyleSpec.preferredTechnology.toUpperCase()}</span>
                    </div>

                    <div className="relative z-10 my-auto text-center px-2 space-y-1">
                      <div
                        className="mx-auto h-1.5 w-12 rounded-full"
                        style={{ backgroundColor: artDirection.colorPalette.accent }}
                      />
                      <p className="text-xs font-bold leading-snug line-clamp-2">
                        {scene.onScreenText || scene.title}
                      </p>
                      <p className="text-[10px] opacity-75 line-clamp-2">
                        {scene.presentElements.slice(0, 3).join(" · ")}
                      </p>
                    </div>

                    <div className="relative z-10 flex items-center justify-between text-[10px] opacity-80">
                      <span className="truncate max-w-[48%]">↳ {scene.entryTransition}</span>
                      <span className="truncate max-w-[48%] text-right">{scene.exitTransition} ↱</span>
                    </div>
                  </div>
                </div>

                {/* Detalhes Narrativos, Visuais e de Movimento */}
                <div className="lg:col-span-8 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
                  <div className="space-y-1">
                    <span className="text-xs text-[#84749c] block">Objetivo & Descrição Visual</span>
                    <p className="text-[#e5dbf5] font-medium">{scene.narrativeObjective}</p>
                    <p className="text-[#b3a5c7] leading-relaxed">{scene.visualDescription}</p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs text-[#84749c] block">Movimento, Animação & Hierarquia</span>
                    <p className="text-[#b3a5c7] leading-relaxed">{scene.motionAndAnimation}</p>
                    <p className="text-xs text-[#8f7fa8] pt-1">
                      Composição: {scene.layoutAndHierarchy}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs text-[#84749c] block">Texto Exibido em Tela</span>
                    <p className="font-mono text-xs text-white bg-[#140d1f] border border-[#8a2be2]/20 rounded-lg px-3 py-2">
                      {scene.onScreenText ? `"${scene.onScreenText}"` : "(Cena puramente visual — sem texto em tela)"}
                    </p>
                  </div>

                  <div className="space-y-1">
                    <span className="text-xs text-[#84749c] block">Elementos & Transições</span>
                    <p className="text-[#d7cae8] text-xs">
                      {scene.presentElements.join(" · ") || "Elementos vetoriais da cena"}
                    </p>
                    <p className="text-xs text-[#9c8cb3]">
                      Entrada: <span className="text-[#d7cae8]">{scene.entryTransition}</span> · Saída:{" "}
                      <span className="text-[#d7cae8]">{scene.exitTransition}</span>
                    </p>
                  </div>
                </div>
              </div>

              {/* Painel Inline: Regenerar Cena Individual com IA */}
              {isRegenOpen && (
                <div className="pt-4 border-t border-[#8a2be2]/20 space-y-3">
                  <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
                    <div className="sm:col-span-2 space-y-1">
                      <label className="block text-xs font-medium text-[#d7cae8]">
                        Solicitar nova ideia visual ou ajuste para esta cena (opcional)
                      </label>
                      <input
                        type="text"
                        value={regenInstruction}
                        onChange={(e) => setRegenInstruction(e.target.value)}
                        placeholder="Ex: Transforme em um gráfico comparativo de barras ou dê foco dramático na data..."
                        className="w-full rounded-lg bg-[#140d1f] border border-[#8a2be2]/35 px-3.5 py-2 text-xs sm:text-sm text-white placeholder:text-[#6e5f85] focus:outline-none focus:ring-2 focus:ring-[#8a2be2]"
                      />
                    </div>
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-[#d7cae8]">
                        Estilo desta cena
                      </label>
                      <select
                        value={regenStyleOverride}
                        onChange={(e) =>
                          setRegenStyleOverride(e.target.value as StyleId | "keep")
                        }
                        className="w-full rounded-lg bg-[#140d1f] border border-[#8a2be2]/35 px-3 py-2 text-xs sm:text-sm text-white focus:outline-none focus:ring-2 focus:ring-[#8a2be2]"
                      >
                        <option value="keep">Manter ({sceneStyleSpec.name})</option>
                        {STYLE_CATEGORIES.map((cat) => (
                          <optgroup key={cat.id} label={cat.label}>
                            {MOTION_STYLE_LIBRARY.filter(
                              (s) => s.category === cat.id
                            ).map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.index}. {s.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="flex items-center justify-end gap-2">
                    <button
                      type="button"
                      onClick={() => setRegenOpenSceneId(null)}
                      className="px-3.5 py-2 rounded-lg text-xs text-[#b9accb] hover:text-white cursor-pointer"
                    >
                      Cancelar
                    </button>
                    <button
                      type="button"
                      onClick={() => submitSceneRegeneration(scene)}
                      disabled={isRegeneratingThis}
                      className="inline-flex items-center gap-2 px-4 py-2 rounded-lg bg-[#8a2be2] hover:bg-[#9b42ee] text-white text-xs font-semibold cursor-pointer"
                    >
                      <RefreshCw className="w-3.5 h-3.5" />
                      <span>Regenerar Apenas a Cena {scene.order}</span>
                    </button>
                  </div>
                </div>
              )}

              {/* Painel Inline: Edição Manual Completa da Cena */}
              {isEditing && (
                <div className="pt-4 border-t border-[#8a2be2]/20 grid grid-cols-1 sm:grid-cols-2 gap-4 text-xs sm:text-sm">
                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[#c5b8d8]">
                      Título da Cena
                    </label>
                    <input
                      type="text"
                      value={scene.title}
                      onChange={(e) =>
                        handleUpdateSceneField(scene.id, "title", e.target.value)
                      }
                      className="w-full rounded-lg bg-[#140d1f] border border-[#8a2be2]/35 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#8a2be2]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-[#c5b8d8]">
                        Duração (segundos)
                      </label>
                      <input
                        type="number"
                        min={1.2}
                        max={60}
                        step={0.5}
                        value={scene.duration}
                        onChange={(e) =>
                          handleUpdateSceneField(
                            scene.id,
                            "duration",
                            parseFloat(e.target.value) || 3
                          )
                        }
                        className="w-full font-mono tabular-nums rounded-lg bg-[#140d1f] border border-[#8a2be2]/35 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#8a2be2]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-[#c5b8d8]">
                        Estilo da Cena
                      </label>
                      <select
                        value={scene.styleId}
                        onChange={(e) =>
                          handleUpdateSceneField(
                            scene.id,
                            "styleId",
                            e.target.value as StyleId
                          )
                        }
                        className="w-full rounded-lg bg-[#140d1f] border border-[#8a2be2]/35 px-2.5 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#8a2be2]"
                      >
                        {STYLE_CATEGORIES.map((cat) => (
                          <optgroup key={cat.id} label={cat.label}>
                            {MOTION_STYLE_LIBRARY.filter(
                              (s) => s.category === cat.id
                            ).map((s) => (
                              <option key={s.id} value={s.id}>
                                {s.index}. {s.name}
                              </option>
                            ))}
                          </optgroup>
                        ))}
                      </select>
                    </div>
                  </div>

                  <div className="space-y-1 sm:col-span-2">
                    <label className="block text-xs font-medium text-[#c5b8d8]">
                      Texto em Tela (deixe vazio para cena puramente visual)
                    </label>
                    <input
                      type="text"
                      value={scene.onScreenText}
                      onChange={(e) =>
                        handleUpdateSceneField(
                          scene.id,
                          "onScreenText",
                          e.target.value
                        )
                      }
                      className="w-full rounded-lg bg-[#140d1f] border border-[#8a2be2]/35 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#8a2be2]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[#c5b8d8]">
                      Descrição Visual
                    </label>
                    <textarea
                      rows={3}
                      value={scene.visualDescription}
                      onChange={(e) =>
                        handleUpdateSceneField(
                          scene.id,
                          "visualDescription",
                          e.target.value
                        )
                      }
                      className="w-full rounded-lg bg-[#140d1f] border border-[#8a2be2]/35 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#8a2be2]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[#c5b8d8]">
                      Movimento e Animação
                    </label>
                    <textarea
                      rows={3}
                      value={scene.motionAndAnimation}
                      onChange={(e) =>
                        handleUpdateSceneField(
                          scene.id,
                          "motionAndAnimation",
                          e.target.value
                        )
                      }
                      className="w-full rounded-lg bg-[#140d1f] border border-[#8a2be2]/35 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#8a2be2]"
                    />
                  </div>

                  <div className="space-y-1">
                    <label className="block text-xs font-medium text-[#c5b8d8]">
                      Elementos Gráficos (separados por vírgula)
                    </label>
                    <input
                      type="text"
                      value={scene.presentElements.join(", ")}
                      onChange={(e) =>
                        handleUpdateSceneField(
                          scene.id,
                          "presentElements",
                          e.target.value
                            .split(",")
                            .map((item) => item.trim())
                            .filter(Boolean)
                        )
                      }
                      className="w-full rounded-lg bg-[#140d1f] border border-[#8a2be2]/35 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#8a2be2]"
                    />
                  </div>

                  <div className="grid grid-cols-2 gap-3">
                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-[#c5b8d8]">
                        Transição de Entrada
                      </label>
                      <input
                        type="text"
                        value={scene.entryTransition}
                        onChange={(e) =>
                          handleUpdateSceneField(
                            scene.id,
                            "entryTransition",
                            e.target.value
                          )
                        }
                        className="w-full rounded-lg bg-[#140d1f] border border-[#8a2be2]/35 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#8a2be2]"
                      />
                    </div>

                    <div className="space-y-1">
                      <label className="block text-xs font-medium text-[#c5b8d8]">
                        Transição de Saída
                      </label>
                      <input
                        type="text"
                        value={scene.exitTransition}
                        onChange={(e) =>
                          handleUpdateSceneField(
                            scene.id,
                            "exitTransition",
                            e.target.value
                          )
                        }
                        className="w-full rounded-lg bg-[#140d1f] border border-[#8a2be2]/35 px-3 py-2 text-white focus:outline-none focus:ring-2 focus:ring-[#8a2be2]"
                      />
                    </div>
                  </div>
                </div>
              )}
            </article>
          );
        })}
      </div>

      {/* Rodapé de Ações do Storyboard: Adicionar Cena + Aprovar/Gerar */}
      <div className="flex flex-wrap items-center justify-between gap-4 pt-2">
        <button
          type="button"
          onClick={handleAddScene}
          disabled={isRenderingFinal || Boolean(regeneratingSceneId)}
          className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#140d1f] hover:bg-[#2a0033] border border-[#8a2be2]/35 text-xs sm:text-sm font-medium text-[#e5dbf5] transition-colors cursor-pointer whitespace-nowrap"
        >
          <Plus className="w-4 h-4 text-[#b589f7]" />
          <span>Adicionar Nova Cena</span>
        </button>

        <div className="flex flex-wrap items-center gap-3">
          {!isAllApproved && (
            <button
              type="button"
              onClick={handleApproveAll}
              disabled={isRenderingFinal || Boolean(regeneratingSceneId)}
              className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl bg-[#191026] hover:bg-[#2a0033] border border-[#8a2be2]/40 text-xs sm:text-sm font-semibold text-white transition-colors cursor-pointer whitespace-nowrap"
            >
              <CheckCheck className="w-4 h-4 text-[#b589f7]" />
              <span>Aprovar Todo o Storyboard</span>
            </button>
          )}

          <button
            type="button"
            onClick={onRenderApprovedStoryboard}
            disabled={!isAllApproved || isRenderingFinal || Boolean(regeneratingSceneId)}
            className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl bg-[#8a2be2] hover:bg-[#9b42ee] disabled:opacity-40 disabled:pointer-events-none text-white text-xs sm:text-sm font-semibold shadow-[0_0_24px_rgba(138,43,226,0.35)] transition-all cursor-pointer whitespace-nowrap"
          >
            {isRenderingFinal ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin" />
                <span>Renderizando Animação...</span>
              </>
            ) : (
              <>
                <Clapperboard className="w-4 h-4" />
                <span>Gerar Animação Aprovada</span>
              </>
            )}
          </button>
        </div>
      </div>
    </section>
  );
}
