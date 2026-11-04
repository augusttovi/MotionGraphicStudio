/**
 * Injects a lightweight deterministic playback controller into the preview srcdoc HTML.
 * Dynamically reads window.DURATION from the generated scene and loops smoothly across any duration.
 */
export function buildPreviewSrcDoc(rawHtml: string): string {
  if (!rawHtml) return "";

  const headInterceptor = `<script>
(function() {
  var nativeRAF = window.requestAnimationFrame.bind(window);
  var nativeCAF = window.cancelAnimationFrame.bind(window);
  window.__msNativeRAF = nativeRAF;
  window.__msNativeCAF = nativeCAF;
  window.__msStudioControlled = false;
  window.__msParentHandlesDownload = true;
  window.requestAnimationFrame = function(cb) {
    if (window.__msStudioControlled) return 0;
    return nativeRAF(function(ts) {
      if (window.__msStudioControlled) return;
      cb(ts);
    });
  };
})();
</script>`;

  const bodyController = `<script>
(function() {
  function parsePositiveNumber(val) {
    if (typeof val === 'number' && isFinite(val) && val > 0) return val;
    if (typeof val === 'string') {
      var parsed = parseFloat(val.replace(',', '.'));
      if (isFinite(parsed) && parsed > 0) return parsed;
    }
    return null;
  }

  function initStudioBridge() {
    var getSeek = function() {
      if (typeof window.seek === 'function') return window.seek.bind(window);
      try {
        if (typeof seek === 'function') return seek;
      } catch (_e) {}
      return null;
    };

    var getDuration = function() {
      var fromWin =
        parsePositiveNumber(window.DURATION) ||
        parsePositiveNumber(window.duration) ||
        parsePositiveNumber(window.TOTAL_DURATION) ||
        parsePositiveNumber(window.__msFallbackDuration);
      if (fromWin) return fromWin;

      try {
        if (typeof DURATION !== 'undefined') {
          var fromLexical = parsePositiveNumber(DURATION);
          if (fromLexical) {
            window.DURATION = fromLexical;
            return fromLexical;
          }
        }
      } catch (_e) {}

      return 10;
    };

    var seekFn = getSeek();
    var duration = getDuration();
    window.DURATION = duration;

    var isPlaying = true;
    var currentTime = 0;
    var lastFrameTs = null;
    var lastPostTs = 0;

    function postStatus(force) {
      var now = performance.now();
      if (!force && now - lastPostTs < 40) return;
      lastPostTs = now;
      if (window.parent && window.parent !== window) {
        window.parent.postMessage({
          type: 'MALASOMBRE_TIME',
          currentTime: currentTime,
          duration: duration,
          isPlaying: isPlaying,
          deterministic: Boolean(seekFn)
        }, '*');
      }
    }

    if (seekFn) {
      window.__msStudioControlled = true;
      try {
        seekFn(0);
      } catch (err) {
        console.error('Erro em seek(0):', err);
      }
    }

    postStatus(true);

    function tick(ts) {
      var latestDuration = getDuration();
      if (latestDuration !== duration) {
        duration = latestDuration;
        window.DURATION = duration;
        postStatus(true);
      }

      if (!seekFn) {
        seekFn = getSeek();
        if (seekFn) {
          window.__msStudioControlled = true;
        }
      }

      if (lastFrameTs === null) {
        lastFrameTs = ts;
      }
      var dt = Math.min(0.1, Math.max(0, (ts - lastFrameTs) / 1000));
      lastFrameTs = ts;

      if (isPlaying && !window.__msCapturingFrames && duration > 0) {
        currentTime = currentTime + dt;
        // Automatically loop back to 0 when reaching the end of the dynamic duration
        if (currentTime >= duration) {
          currentTime = currentTime % duration;
        }
        if (seekFn) {
          try {
            seekFn(currentTime);
          } catch (err) {
            console.error('Erro em seek(t):', err);
          }
        }
        postStatus(false);
      }

      window.__msNativeRAF(tick);
    }

    window.__msNativeRAF(tick);

    window.addEventListener('message', function(event) {
      var data = event.data;
      if (!data || typeof data !== 'object') return;

      duration = getDuration();
      window.DURATION = duration;

      if (data.type === 'MALASOMBRE_CMD_PLAY') {
        if (currentTime >= duration - 0.02) {
          currentTime = 0;
        }
        isPlaying = true;
        lastFrameTs = performance.now();
        postStatus(true);
      } else if (data.type === 'MALASOMBRE_CMD_PAUSE') {
        isPlaying = false;
        postStatus(true);
      } else if (data.type === 'MALASOMBRE_CMD_SEEK') {
        var targetTime = Math.max(0, Math.min(duration, Number(data.time) || 0));
        currentTime = targetTime;
        lastFrameTs = performance.now();
        if (seekFn) {
          try {
            seekFn(currentTime);
          } catch (err) {
            console.error('Erro ao aplicar seek manual:', err);
          }
        }
        postStatus(true);
      }
    });
  }

  if (document.readyState === 'complete' || document.readyState === 'interactive') {
    setTimeout(initStudioBridge, 0);
  } else {
    window.addEventListener('DOMContentLoaded', initStudioBridge);
  }
})();
</script>`;

  let result = rawHtml;

  if (/<head[^>]*>/i.test(result)) {
    result = result.replace(/<head[^>]*>/i, (match) => `${match}\n${headInterceptor}`);
  } else {
    result = `${headInterceptor}\n${result}`;
  }

  if (/<\/body>/i.test(result)) {
    result = result.replace(/<\/body>/i, `${bodyController}\n</body>`);
  } else {
    result = `${result}\n${bodyController}`;
  }

  return result;
}
