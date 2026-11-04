import dotenv from "dotenv";
import express from "express";
import type { NextFunction, Request, Response } from "express";
import fs from "node:fs";
import path from "node:path";
import type {
  ApiErrorPayload,
  DirectGenerateRequest,
  DirectGenerateResponse,
  ExecutionDiagnosticsSummary,
  PlanStoryboardRequest,
  PlanStoryboardResponse,
  ProjectContextMemory,
  RegenerateSceneRequest,
  RegenerateSceneResponse,
  RenderStoryboardRequest,
  RenderStoryboardResponse,
  StreamProgressEvent,
} from "./src/shared/motionStudioContracts.ts";
import {
  MOTION_STYLE_LIBRARY,
  STYLE_CATEGORIES,
} from "./src/shared/styleLibrary.ts";
import {
  generateDirectMotionWithAI,
  planStoryboardWithAI,
  regenerateSceneWithAI,
  renderApprovedStoryboardWithAI,
} from "./server/creativePipeline.ts";
import type { CascadeRunContext } from "./server/creativePipeline.ts";
import {
  CascadeExecutionError,
  diagnoseProvidersHealth,
  getActiveCascadeTelemetry,
  getCascadeTotalBudgetMs,
  sanitizeDiagnosticText,
} from "./server/providerCascade.ts";
import type { CascadeSimulationMap } from "./server/providerCascade.ts";

dotenv.config();

const PORT = 3000;
const isProduction = process.env.NODE_ENV === "production";

/**
 * Inspeciona o HTML gerado para extrair constante DURATION declarada localmente ou em window.
 */
function inferDurationFromHtmlCode(html: string): number | null {
  const durationRegex =
    /(?:window\.DURATION|const\s+DURATION|let\s+DURATION|var\s+DURATION|TOTAL_DURATION)\s*=\s*(\d+(?:\.\d+)?)/i;
  const match = html.match(durationRegex);
  if (match && match[1]) {
    const parsed = parseFloat(match[1]);
    if (Number.isFinite(parsed) && parsed > 0) {
      return parsed;
    }
  }
  return null;
}

/**
 * Injeta JSZip via CDN, normalização dinâmica de window.DURATION, reprodução standalone
 * e o módulo autocontido "Baixar Frames" (60 FPS PNG .zip) compatível com Canvas 2D, SVG, HTML/CSS e Híbrido.
 */
export function injectFrameExporter(
  cleanHtml: string,
  scriptEstimatedDuration: number | null
): string {
  const codeInferredDuration = inferDurationFromHtmlCode(cleanHtml);
  const fallbackDuration =
    codeInferredDuration ?? scriptEstimatedDuration ?? 10;

  const jszipCdnTag = `<script src="https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js"></script>`;

  const rafGuardScript = `<script id="malasombre-raf-guard">
(function() {
  var origGetContext = HTMLCanvasElement.prototype.getContext;
  HTMLCanvasElement.prototype.getContext = function(type, attrs) {
    if (type === 'webgl' || type === 'webgl2' || type === 'experimental-webgl') {
      attrs = Object.assign({}, attrs || {}, { preserveDrawingBuffer: true });
    }
    return origGetContext.call(this, type, attrs);
  };
  var origRAF = window.requestAnimationFrame.bind(window);
  window.__msRawRAF = origRAF;
  window.__msCapturingFrames = false;
  window.__msAiRegisteredRAF = false;
  window.__msFallbackDuration = ${fallbackDuration};
  window.requestAnimationFrame = function(cb) {
    window.__msAiRegisteredRAF = true;
    return origRAF(function(ts) {
      if (window.__msCapturingFrames) {
        window.requestAnimationFrame(cb);
        return;
      }
      cb(ts);
    });
  };
})();
</script>`;

  const exporterWidget = `
<style id="malasombre-frames-style">
  #ms-download-frames-btn {
    position: fixed;
    top: 16px;
    right: 16px;
    z-index: 99999;
    display: inline-flex;
    align-items: center;
    gap: 8px;
    padding: 9px 15px;
    border-radius: 10px;
    border: 1px solid rgba(138, 43, 226, 0.55);
    background: rgba(13, 9, 20, 0.86);
    backdrop-filter: blur(8px);
    -webkit-backdrop-filter: blur(8px);
    color: #f3eff8;
    font-family: 'Oswald', system-ui, -apple-system, sans-serif;
    font-size: 13px;
    font-weight: 600;
    letter-spacing: 0.06em;
    text-transform: uppercase;
    cursor: pointer;
    box-shadow: 0 4px 20px rgba(0, 0, 0, 0.65), 0 0 16px rgba(138, 43, 226, 0.25);
    transition: background 150ms ease, border-color 150ms ease, transform 150ms ease;
    user-select: none;
  }
  #ms-download-frames-btn:hover:not(:disabled) {
    background: #2a0033;
    border-color: #8a2be2;
  }
  #ms-download-frames-btn:disabled {
    cursor: wait;
    opacity: 0.92;
  }
  #ms-download-frames-btn svg {
    width: 15px;
    height: 15px;
    stroke: #a855f7;
    flex-shrink: 0;
  }
</style>
<button id="ms-download-frames-btn" type="button" title="Exportar sequência PNG a 60 FPS em .zip">
  <svg viewBox="0 0 24 24" fill="none" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">
    <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"></path>
    <polyline points="7 10 12 15 17 10"></polyline>
    <line x1="12" y1="15" x2="12" y2="3"></line>
  </svg>
  <span id="ms-download-frames-label">Baixar Frames</span>
</button>
<script id="malasombre-frames-exporter">
(function() {
  var btn = document.getElementById('ms-download-frames-btn');
  var labelEl = document.getElementById('ms-download-frames-label');
  var isExporting = false;

  function parsePositiveNumber(val) {
    if (typeof val === 'number' && isFinite(val) && val > 0) return val;
    if (typeof val === 'string') {
      var parsed = parseFloat(val.replace(',', '.'));
      if (isFinite(parsed) && parsed > 0) return parsed;
    }
    return null;
  }

  function resolveSeekFn() {
    if (typeof window.seek === 'function') return window.seek.bind(window);
    try {
      if (typeof seek === 'function') return seek;
    } catch (_e) {}
    return null;
  }

  function resolveDuration() {
    var fromWin =
      parsePositiveNumber(window.DURATION) ||
      parsePositiveNumber(window.duration) ||
      parsePositiveNumber(window.TOTAL_DURATION);
    if (fromWin) {
      window.DURATION = fromWin;
      return fromWin;
    }
    try {
      if (typeof DURATION !== 'undefined') {
        var fromLexical = parsePositiveNumber(DURATION);
        if (fromLexical) {
          window.DURATION = fromLexical;
          return fromLexical;
        }
      }
    } catch (_e) {}
    var fb = parsePositiveNumber(window.__msFallbackDuration) || 10;
    window.DURATION = fb;
    return fb;
  }

  function initStandaloneAndDuration() {
    var dur = resolveDuration();
    var seekFn = resolveSeekFn();
    if (!window.__msStudioControlled && !window.__msAiRegisteredRAF && seekFn) {
      var lastTs = null;
      var currentT = 0;
      function standaloneLoop(ts) {
        if (!window.__msCapturingFrames && !window.__msStudioControlled) {
          dur = resolveDuration();
          if (lastTs === null) lastTs = ts;
          var dt = Math.min(0.1, Math.max(0, (ts - lastTs) / 1000));
          lastTs = ts;
          currentT = (currentT + dt) % dur;
          try {
            seekFn(currentT);
          } catch (_err) {}
        } else {
          lastTs = ts;
        }
        window.__msRawRAF(standaloneLoop);
      }
      window.__msRawRAF(standaloneLoop);
    }
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initStandaloneAndDuration, 0);
  } else {
    window.addEventListener('DOMContentLoaded', initStandaloneAndDuration);
  }

  function notifyParent(payload) {
    if (window.parent && window.parent !== window) {
      window.parent.postMessage(payload, '*');
    }
  }

  function canvasToPngBlob(canvas) {
    return new Promise(function(resolve, reject) {
      canvas.toBlob(function(blob) {
        if (blob) resolve(blob);
        else reject(new Error('Falha ao capturar frame do Canvas.'));
      }, 'image/png');
    });
  }

  function drawSvgStringToCtx(svgMarkup, ctx, w, h) {
    return new Promise(function(resolve) {
      var svgBlob = new Blob([svgMarkup], { type: 'image/svg+xml;charset=utf-8' });
      var url = URL.createObjectURL(svgBlob);
      var img = new Image();
      img.onload = function() {
        try {
          ctx.drawImage(img, 0, 0, w, h);
        } catch (_err) {}
        URL.revokeObjectURL(url);
        resolve(true);
      };
      img.onerror = function() {
        URL.revokeObjectURL(url);
        resolve(false);
      };
      img.src = url;
    });
  }

  function serializeStageSvg(svgEl, w, h) {
    var clone = svgEl.cloneNode(true);
    clone.setAttribute('xmlns', 'http://www.w3.org/2000/svg');
    if (!clone.getAttribute('viewBox')) {
      clone.setAttribute('viewBox', '0 0 ' + w + ' ' + h);
    }
    clone.setAttribute('width', String(w));
    clone.setAttribute('height', String(h));
    return new XMLSerializer().serializeToString(clone);
  }

  function copyComputedStylesDeep(srcNode, dstNode) {
    if (srcNode.nodeType !== 1 || dstNode.nodeType !== 1) return;
    var cs = window.getComputedStyle(srcNode);
    var cssText = '';
    for (var i = 0; i < cs.length; i++) {
      var prop = cs[i];
      var val = cs.getPropertyValue(prop);
      if (val && val.indexOf('url("http') === -1 && val.indexOf("url('http") === -1) {
        cssText += prop + ':' + val + ';';
      }
    }
    dstNode.setAttribute('style', cssText);
    var srcChildren = srcNode.children;
    var dstChildren = dstNode.children;
    for (var j = 0; j < srcChildren.length && j < dstChildren.length; j++) {
      copyComputedStylesDeep(srcChildren[j], dstChildren[j]);
    }
  }

  function serializeDomStageToSvg(w, h) {
    var rootCandidate = document.getElementById('stage') || document.body;
    var clone = rootCandidate.cloneNode(true);
    copyComputedStylesDeep(rootCandidate, clone);
    var btnClone = clone.querySelector ? clone.querySelector('#ms-download-frames-btn') : null;
    if (btnClone && btnClone.parentNode) {
      btnClone.parentNode.removeChild(btnClone);
    }
    var scripts = clone.querySelectorAll ? clone.querySelectorAll('script, link') : [];
    for (var k = 0; k < scripts.length; k++) {
      if (scripts[k].parentNode) scripts[k].parentNode.removeChild(scripts[k]);
    }
    clone.style.transform = 'none';
    clone.style.width = w + 'px';
    clone.style.height = h + 'px';
    clone.style.margin = '0';
    var xhtml = new XMLSerializer().serializeToString(clone);
    var bg = window.getComputedStyle(document.body).backgroundColor || '#000000';
    return '<svg xmlns="http://www.w3.org/2000/svg" width="' + w + '" height="' + h + '" viewBox="0 0 ' + w + ' ' + h + '">' +
      '<rect width="100%" height="100%" fill="' + bg + '"/>' +
      '<foreignObject width="100%" height="100%">' + xhtml + '</foreignObject>' +
      '</svg>';
  }

  async function exportAllFrames() {
    if (isExporting) return;

    if (typeof window.JSZip !== 'function') {
      labelEl.textContent = 'Erro: JSZip indisponível';
      notifyParent({
        type: 'MALASOMBRE_EXPORT_STATUS',
        active: false,
        error: 'Biblioteca JSZip via CDN não pôde ser carregada.'
      });
      setTimeout(function() { labelEl.textContent = 'Baixar Frames'; }, 3000);
      return;
    }

    var seekFn = resolveSeekFn();
    if (!seekFn) {
      labelEl.textContent = 'seek(t) ausente';
      notifyParent({
        type: 'MALASOMBRE_EXPORT_STATUS',
        active: false,
        error: 'Função determinística window.seek(t) não encontrada na cena.'
      });
      setTimeout(function() { labelEl.textContent = 'Baixar Frames'; }, 3000);
      return;
    }

    var allCanvases = Array.prototype.slice.call(document.querySelectorAll('canvas'));
    var allSvgs = Array.prototype.slice.call(document.querySelectorAll('svg')).filter(function(el) {
      return !btn.contains(el);
    });

    allCanvases.sort(function(a, b) {
      var za = parseInt(window.getComputedStyle(a).zIndex, 10) || 0;
      var zb = parseInt(window.getComputedStyle(b).zIndex, 10) || 0;
      return za - zb;
    });

    var frameW = (allCanvases[0] && allCanvases[0].width) || 1920;
    var frameH = (allCanvases[0] && allCanvases[0].height) || 1080;
    var needsComposite = allCanvases.length !== 1 || allSvgs.length > 0;

    var compositeCanvas = null;
    var compositeCtx = null;
    if (needsComposite) {
      compositeCanvas = document.createElement('canvas');
      compositeCanvas.width = frameW;
      compositeCanvas.height = frameH;
      compositeCtx = compositeCanvas.getContext('2d');
    }

    isExporting = true;
    window.__msCapturingFrames = true;
    btn.disabled = true;

    try {
      if (document.fonts && document.fonts.ready) {
        await document.fonts.ready;
      }

      var duration = resolveDuration();
      var fps = 60;
      var step = 1 / fps;
      var totalSteps = Math.ceil(duration * fps - 1e-9);
      var totalFrames = totalSteps + 1;
      var zip = new window.JSZip();

      for (var i = 0; i <= totalSteps; i++) {
        var t = Math.min(duration, i * step);
        seekFn(t);

        var targetCanvas = allCanvases[0];
        if (compositeCanvas && compositeCtx) {
          var bodyBg = window.getComputedStyle(document.body).backgroundColor;
          compositeCtx.clearRect(0, 0, frameW, frameH);
          if (bodyBg && bodyBg !== 'rgba(0, 0, 0, 0)' && bodyBg !== 'transparent') {
            compositeCtx.fillStyle = bodyBg;
            compositeCtx.fillRect(0, 0, frameW, frameH);
          }

          if (allCanvases.length === 0 && allSvgs.length === 0) {
            var domSvg = serializeDomStageToSvg(frameW, frameH);
            await drawSvgStringToCtx(domSvg, compositeCtx, frameW, frameH);
          } else {
            for (var cIdx = 0; cIdx < allCanvases.length; cIdx++) {
              var layer = allCanvases[cIdx];
              if (layer.width > 0 && layer.height > 0 && window.getComputedStyle(layer).display !== 'none') {
                compositeCtx.drawImage(layer, 0, 0, frameW, frameH);
              }
            }
            for (var sIdx = 0; sIdx < allSvgs.length; sIdx++) {
              var svgLayer = allSvgs[sIdx];
              if (window.getComputedStyle(svgLayer).display !== 'none') {
                var svgStr = serializeStageSvg(svgLayer, frameW, frameH);
                await drawSvgStringToCtx(svgStr, compositeCtx, frameW, frameH);
              }
            }
          }
          targetCanvas = compositeCanvas;
        }

        var frameBlob = await canvasToPngBlob(targetCanvas);
        var frameName = 'frame_' + String(i).padStart(5, '0') + '.png';
        zip.file(frameName, frameBlob, { compression: 'STORE' });

        if (i % 5 === 0 || i === totalSteps) {
          var pct = Math.round(((i + 1) / totalFrames) * 100);
          labelEl.textContent = 'Capturando ' + (i + 1) + '/' + totalFrames + ' (' + pct + '%)';
          notifyParent({
            type: 'MALASOMBRE_EXPORT_STATUS',
            active: true,
            phase: 'capturing',
            current: i + 1,
            total: totalFrames,
            percent: pct
          });
          await new Promise(function(r) { setTimeout(r, 0); });
        }
      }

      labelEl.textContent = 'Compactando .zip...';
      notifyParent({
        type: 'MALASOMBRE_EXPORT_STATUS',
        active: true,
        phase: 'zipping',
        current: totalFrames,
        total: totalFrames,
        percent: 100
      });

      var zipBlob = await zip.generateAsync({
        type: 'blob',
        compression: 'STORE'
      });

      if (window.__msParentHandlesDownload && window.parent && window.parent !== window) {
        notifyParent({
          type: 'MALASOMBRE_ZIP_READY',
          blob: zipBlob,
          filename: 'mala-sombre-frames-60fps.zip'
        });
      } else {
        var downloadUrl = URL.createObjectURL(zipBlob);
        var anchor = document.createElement('a');
        anchor.href = downloadUrl;
        anchor.download = 'mala-sombre-frames-60fps.zip';
        document.body.appendChild(anchor);
        anchor.click();
        document.body.removeChild(anchor);
        setTimeout(function() { URL.revokeObjectURL(downloadUrl); }, 10000);
      }

      labelEl.textContent = 'Frames Baixados';
      notifyParent({
        type: 'MALASOMBRE_EXPORT_STATUS',
        active: false,
        phase: 'done',
        current: totalFrames,
        total: totalFrames,
        percent: 100
      });
      setTimeout(function() {
        if (!isExporting) labelEl.textContent = 'Baixar Frames';
      }, 2200);
    } catch (err) {
      console.error('Erro ao exportar frames:', err);
      labelEl.textContent = 'Erro na Captura';
      notifyParent({
        type: 'MALASOMBRE_EXPORT_STATUS',
        active: false,
        error: err && err.message ? err.message : 'Erro ao exportar frames.'
      });
      setTimeout(function() {
        if (!isExporting) labelEl.textContent = 'Baixar Frames';
      }, 3000);
    } finally {
      window.__msCapturingFrames = false;
      isExporting = false;
      btn.disabled = false;
    }
  }

  btn.addEventListener('click', exportAllFrames);

  window.addEventListener('message', function(event) {
    if (event.data && event.data.type === 'MALASOMBRE_CMD_EXPORT_FRAMES') {
      exportAllFrames();
    }
  });
})();
</script>`;

  let output = cleanHtml;

  const hasJsZipAlready = /jszip(?:\.min)?\.js/i.test(output);
  const headAdditions = `${hasJsZipAlready ? "" : `${jszipCdnTag}\n`}${rafGuardScript}`;

  if (/<head[^>]*>/i.test(output)) {
    output = output.replace(/<head[^>]*>/i, (match) => `${match}\n${headAdditions}`);
  } else {
    output = `${headAdditions}\n${output}`;
  }

  if (!output.includes('id="ms-download-frames-btn"')) {
    if (/<\/body>/i.test(output)) {
      output = output.replace(/<\/body>/i, `${exporterWidget}\n</body>`);
    } else {
      output = `${output}\n${exporterWidget}`;
    }
  }

  return output;
}

async function startServer() {
  const app = express();
  app.use(express.json({ limit: "10mb" }));

  const publicDir = path.join(process.cwd(), "public");
  if (!fs.existsSync(publicDir)) {
    fs.mkdirSync(publicDir, { recursive: true });
  }
  app.use(express.static(publicDir));

  // Gerenciamento de logotipo existente preservado integralmente
  app.post("/api/logo", (req: Request, res: Response) => {
    try {
      const { dataUrl } = req.body as { dataUrl?: string };
      if (!dataUrl || typeof dataUrl !== "string") {
        res.status(400).json({ error: "Imagem inválida." });
        return;
      }

      const matches = dataUrl.match(/^data:image\/([a-zA-Z0-9+.-]+);base64,(.+)$/);
      if (!matches) {
        res.status(400).json({ error: "Formato de imagem não suportado." });
        return;
      }

      const buffer = Buffer.from(matches[2], "base64");
      const targetPath = path.join(publicDir, "logotipo.png");
      fs.writeFileSync(targetPath, buffer);

      if (isProduction) {
        const distPath = path.join(process.cwd(), "dist", "logotipo.png");
        if (fs.existsSync(path.dirname(distPath))) {
          fs.writeFileSync(distPath, buffer);
        }
      }

      res.json({ ok: true, path: "/logotipo.png" });
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Erro ao salvar logotipo.";
      res.status(500).json({ error: message });
    }
  });

  // Catálogo dos 30 Estilos Especializados
  app.get("/api/styles", (_req: Request, res: Response) => {
    res.json({
      categories: STYLE_CATEGORIES,
      styles: MOTION_STYLE_LIBRARY,
    });
  });

  let activeSseStreams = 0;

  // Diagnóstico seguro de conectividade, orçamento de cascata e telemetria de recursos (sem expor segredos)
  app.get("/api/providers/health", async (req: Request, res: Response) => {
    try {
      const probe = req.query.probe === "true" || req.query.probe === "1";
      const providers = await diagnoseProvidersHealth(probe);
      res.json({
        ok: true,
        probed: probe,
        checkedAt: new Date().toISOString(),
        cascadeTotalBudgetMs: getCascadeTotalBudgetMs(),
        telemetry: {
          ...getActiveCascadeTelemetry(),
          activeSseStreams,
        },
        providers,
      });
    } catch (error) {
      const msg =
        error instanceof Error
          ? sanitizeDiagnosticText(error.message)
          : "Falha ao diagnosticar provedores.";
      res.status(500).json({ ok: false, error: msg });
    }
  });

  function isLoopbackRequest(req: Request): boolean {
    const ip = req.ip || req.socket.remoteAddress || "";
    return (
      ip === "127.0.0.1" ||
      ip === "::1" ||
      ip === "::ffff:127.0.0.1" ||
      req.hostname === "localhost"
    );
  }

  function createRequestCascadeContext(
    req: Request,
    res: Response
  ): { context: CascadeRunContext; cleanup: () => void } {
    const clientAbortController = new AbortController();
    const socket = req.socket;

    const onDisconnect = () => {
      if (!res.writableEnded && !clientAbortController.signal.aborted) {
        clientAbortController.abort(new Error("CLIENT_DISCONNECTED"));
      }
    };

    req.on("aborted", onDisconnect);
    res.on("close", onDisconnect);
    socket?.on("close", onDisconnect);

    let simulationFaults: CascadeSimulationMap | undefined;
    if (!isProduction && isLoopbackRequest(req)) {
      const rawSimHeader = req.header("x-ms-test-faults");
      if (rawSimHeader) {
        try {
          simulationFaults = JSON.parse(rawSimHeader) as CascadeSimulationMap;
        } catch {
          simulationFaults = undefined;
        }
      }
    }

    const cleanup = () => {
      req.off("aborted", onDisconnect);
      res.off("close", onDisconnect);
      socket?.off("close", onDisconnect);
    };

    return {
      context: {
        clientSignal: clientAbortController.signal,
        simulationFaults,
      },
      cleanup,
    };
  }

  function buildStructuredApiError(error: unknown): {
    statusCode: number;
    payload: ApiErrorPayload;
  } {
    if (error instanceof CascadeExecutionError) {
      return {
        statusCode: error.statusCode,
        payload: error.toApiErrorPayload(),
      };
    }

    const safeReason =
      error instanceof Error
        ? sanitizeDiagnosticText(error.message)
        : "Erro interno ao processar a solicitação.";

    return {
      statusCode: 500,
      payload: {
        error: safeReason || "Não foi possível concluir a operação solicitada.",
        errorType: "provider_unavailable",
        retryable: true,
      },
    };
  }

  function sendStructuredApiError(res: Response, error: unknown): void {
    if (res.headersSent || res.writableEnded) {
      return;
    }
    const { statusCode, payload } = buildStructuredApiError(error);
    res.status(statusCode).json(payload);
  }

  function wantsSseStream(req: Request): boolean {
    if (req.path.endsWith("/stream")) return true;
    if (req.query.stream === "true" || req.query.stream === "1") return true;
    const accept = (req.header("accept") || "").toLowerCase();
    return accept.includes("text/event-stream");
  }

  function writeSseEvent<TResult>(
    res: Response,
    event: StreamProgressEvent<TResult>
  ): void {
    if (res.writableEnded || res.destroyed) return;
    try {
      res.write(`event: ${event.type}\ndata: ${JSON.stringify(event)}\n\n`);
      const flushable = res as Response & { flush?: () => void };
      if (typeof flushable.flush === "function") {
        flushable.flush();
      }
    } catch {
      // Socket do cliente já foi encerrado
    }
  }

  async function executeStudioEndpoint<TResponse>(
    req: Request,
    res: Response,
    options: {
      operation: string;
      completionMessage: string;
      validate: () => ApiErrorPayload | null;
      run: (
        context: CascadeRunContext,
        emitStageNote: (message: string) => void
      ) => Promise<{
        payload: TResponse;
        diagnostics: ExecutionDiagnosticsSummary;
      }>;
    }
  ): Promise<void> {
    const validationErr = options.validate();
    if (validationErr) {
      res.status(400).json(validationErr);
      return;
    }

    req.setTimeout(240_000);
    res.setTimeout(240_000);

    const isSse = wantsSseStream(req);
    const { context, cleanup } = createRequestCascadeContext(req, res);

    if (!isSse) {
      try {
        const { payload } = await options.run(context, () => {});
        if (!res.writableEnded) {
          res.json(payload);
        }
      } catch (error: unknown) {
        sendStructuredApiError(res, error);
      } finally {
        cleanup();
      }
      return;
    }

    // Modo Streaming Real Servidor -> Navegador via Server-Sent Events (SSE)
    activeSseStreams += 1;
    let activeGenerationId = "gen_stream";
    let terminalEventSent = false;

    res.status(200);
    res.setHeader("Content-Type", "text/event-stream; charset=utf-8");
    res.setHeader("Cache-Control", "no-cache, no-transform");
    res.setHeader("Connection", "keep-alive");
    res.setHeader("X-Accel-Buffering", "no");
    req.socket?.setNoDelay(true);
    res.flushHeaders();
    res.write(`: stream-open ${new Date().toISOString()}\n\n`);

    const keepAliveTimer = setInterval(() => {
      if (
        !res.writableEnded &&
        !res.destroyed &&
        !context.clientSignal?.aborted
      ) {
        try {
          res.write(`: keepalive ${Date.now()}\n\n`);
          const flushable = res as Response & { flush?: () => void };
          if (typeof flushable.flush === "function") {
            flushable.flush();
          }
        } catch {
          // Conexão encerrada
        }
      }
    }, 3_500);

    context.onProgressEvent = (evt) => {
      if (evt.generationId) {
        activeGenerationId = evt.generationId;
      }
      if (
        evt.type === "generation_completed" ||
        evt.type === "generation_failed" ||
        evt.type === "generation_cancelled"
      ) {
        terminalEventSent = true;
      }
      writeSseEvent(res, evt);
    };

    const emitStageNote = (message: string) => {
      if (terminalEventSent || context.clientSignal?.aborted) return;
      writeSseEvent(res, {
        type: "provider_progress",
        generationId: activeGenerationId,
        operation: options.operation,
        timestamp: new Date().toISOString(),
        message,
      });
    };

    try {
      const { payload, diagnostics } = await options.run(
        context,
        emitStageNote
      );

      if (!terminalEventSent && !context.clientSignal?.aborted) {
        terminalEventSent = true;
        writeSseEvent<TResponse>(res, {
          type: "generation_completed",
          generationId: diagnostics.generationId || activeGenerationId,
          operation: options.operation,
          timestamp: new Date().toISOString(),
          provider: diagnostics.providerUsed,
          providerLabel: diagnostics.providerLabel,
          model: diagnostics.modelUsed,
          durationMs: diagnostics.durationMs,
          message: options.completionMessage,
          result: payload,
        });
      }
    } catch (error: unknown) {
      if (!terminalEventSent && !res.writableEnded && !res.destroyed) {
        terminalEventSent = true;
        const { payload: errPayload } = buildStructuredApiError(error);
        const isCancelled =
          errPayload.errorType === "cancelled" ||
          Boolean(context.clientSignal?.aborted);
        writeSseEvent(res, {
          type: isCancelled ? "generation_cancelled" : "generation_failed",
          generationId: errPayload.generationId || activeGenerationId,
          operation: options.operation,
          timestamp: new Date().toISOString(),
          errorType: errPayload.errorType,
          message: errPayload.error,
          errorPayload: errPayload,
        });
      }
    } finally {
      clearInterval(keepAliveTimer);
      activeSseStreams = Math.max(0, activeSseStreams - 1);
      cleanup();
      if (!res.writableEnded && !res.destroyed) {
        res.end();
      }
    }
  }

  // MODO A — Endpoint principal compatível de Geração Direta (JSON legado + SSE em tempo real)
  app.post(
    ["/api/generate", "/api/generate/stream"],
    async (req: Request, res: Response) => {
      const body = req.body as Partial<DirectGenerateRequest>;
      const script = body?.script;

      await executeStudioEndpoint<DirectGenerateResponse>(req, res, {
        operation: "direct_generate",
        completionMessage: "Animação concluída!",
        validate: () => {
          if (!script || typeof script !== "string" || !script.trim()) {
            return {
              error: "Por favor, insira um roteiro antes de gerar a animação.",
              errorType: "validation_error",
              retryable: false,
            };
          }
          return null;
        },
        run: async (context, emitStageNote) => {
          const result = await generateDirectMotionWithAI(
            {
              script: script!.trim(),
              preferredStyleId: body.preferredStyleId,
              creativeNotes: body.creativeNotes,
            },
            context
          );

          // Injeção do exportador de frames SOMENTE após a validação integral do HTML
          emitStageNote(
            "Preparando exportador determinístico de frames 60 FPS..."
          );
          const htmlWithFrameExporter = injectFrameExporter(
            result.html,
            result.estimatedDuration
          );

          return {
            payload: {
              html: htmlWithFrameExporter,
              meta: {
                estimatedDuration: result.estimatedDuration,
                selectedStyleIds: result.selectedStyleIds,
                renderTechnology: result.renderTechnology,
                diagnostics: result.diagnostics,
              },
            },
            diagnostics: result.diagnostics,
          };
        },
      });
    }
  );

  // MODO B (Etapa 1) — Planejamento de Direção de Arte e Storyboard estruturado (JSON + SSE)
  app.post(
    ["/api/storyboard/plan", "/api/storyboard/plan/stream"],
    async (req: Request, res: Response) => {
      const body = req.body as Partial<PlanStoryboardRequest>;

      await executeStudioEndpoint<PlanStoryboardResponse>(req, res, {
        operation: "storyboard_plan",
        completionMessage: "Planejamento de storyboard concluído!",
        validate: () => {
          if (
            !body.script ||
            typeof body.script !== "string" ||
            !body.script.trim()
          ) {
            return {
              error: "Insira um roteiro válido para planejar o storyboard.",
              errorType: "validation_error",
              retryable: false,
            };
          }
          return null;
        },
        run: async (context) => {
          const result = await planStoryboardWithAI(
            {
              script: body.script!.trim(),
              preferredStyleId: body.preferredStyleId,
              creativeNotes: body.creativeNotes,
            },
            context
          );
          return {
            payload: {
              project: result.project,
              diagnostics: result.diagnostics,
            },
            diagnostics: result.diagnostics,
          };
        },
      });
    }
  );

  // MODO B (Etapa 2 opcional) — Regeneração individual de uma cena (JSON + SSE)
  app.post(
    [
      "/api/storyboard/regenerate-scene",
      "/api/storyboard/regenerate-scene/stream",
    ],
    async (req: Request, res: Response) => {
      const body = req.body as Partial<RegenerateSceneRequest>;

      await executeStudioEndpoint<RegenerateSceneResponse>(req, res, {
        operation: "storyboard_regenerate_scene",
        completionMessage: "Cena regenerada com sucesso!",
        validate: () => {
          if (
            !body.project ||
            !Array.isArray(body.project.scenes) ||
            !body.sceneId ||
            typeof body.sceneId !== "string"
          ) {
            return {
              error:
                "Projeto ou identificador estável da cena ausente para regeneração.",
              errorType: "validation_error",
              retryable: false,
            };
          }
          return null;
        },
        run: async (context) => {
          const outcome = await regenerateSceneWithAI(
            {
              project: body.project as ProjectContextMemory,
              sceneId: body.sceneId!,
              instruction: body.instruction,
              requestedStyleId: body.requestedStyleId,
            },
            context
          );
          return {
            payload: outcome,
            diagnostics:
              outcome.diagnostics ?? {
                generationId: "gen_regen",
                providerUsed: "gemini",
                providerLabel: "Google Gemini",
                modelUsed: "gemini",
                durationMs: 0,
                attemptsCount: 1,
              },
          };
        },
      });
    }
  );

  // MODO B (Etapa 3) — Renderização Final a partir do Storyboard aprovado (JSON + SSE)
  app.post(
    ["/api/storyboard/render", "/api/storyboard/render/stream"],
    async (req: Request, res: Response) => {
      const body = req.body as Partial<RenderStoryboardRequest>;
      const project = body.project;

      await executeStudioEndpoint<RenderStoryboardResponse>(req, res, {
        operation: "storyboard_render",
        completionMessage: "Animação concluída!",
        validate: () => {
          if (
            !project ||
            !Array.isArray(project.scenes) ||
            project.scenes.length === 0
          ) {
            return {
              error:
                "Envie o storyboard válido com ao menos uma cena para gerar a animação.",
              errorType: "validation_error",
              retryable: false,
            };
          }
          return null;
        },
        run: async (context, emitStageNote) => {
          const rendered = await renderApprovedStoryboardWithAI(
            project!,
            context
          );

          // Injeção do exportador de frames SOMENTE após validação integral do HTML
          emitStageNote(
            "Preparando exportador determinístico de frames 60 FPS..."
          );
          const htmlWithFrameExporter = injectFrameExporter(
            rendered.html,
            rendered.totalDuration
          );

          return {
            payload: {
              html: htmlWithFrameExporter,
              totalDuration: rendered.totalDuration,
              diagnostics: rendered.diagnostics,
            },
            diagnostics: rendered.diagnostics,
          };
        },
      });
    }
  );

  // Catch-all para rotas /api/* não encontradas (sempre retorna JSON)
  app.all("/api/*", (_req: Request, res: Response) => {
    res.status(404).json({ error: "Rota da API não encontrada." });
  });

  app.use(
    (err: unknown, req: Request, res: Response, next: NextFunction) => {
      if (req.path.startsWith("/api")) {
        console.error("Erro de middleware na API:", err);
        res
          .status(500)
          .json({ error: "Erro interno no servidor. Tente novamente." });
        return;
      }
      next(err);
    }
  );

  if (!isProduction) {
    const { createServer: createViteServer } = await import("vite");
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: "spa",
    });
    app.use(vite.middlewares);
  } else {
    const distDir = path.join(process.cwd(), "dist");
    app.use(express.static(distDir));
    app.get("*", (_req: Request, res: Response) => {
      res.sendFile(path.join(distDir, "index.html"));
    });
  }

  const httpServer = app.listen(PORT, "0.0.0.0", () => {
    console.log(`Mala.Sombre Motion Studio rodando em http://0.0.0.0:${PORT}`);
  });
  httpServer.requestTimeout = 360_000;
  httpServer.headersTimeout = 365_000;
}

startServer();
