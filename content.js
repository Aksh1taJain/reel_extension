/* ========================================================
   Instagram Reels Enhancer — Content Script
   Manifest V3 | Vanilla JS | No frameworks
   ======================================================== */

(() => {
  'use strict';

  /* ── Constants ─────────────────────────────────────── */
  const SPEEDS = [1, 1.5, 2, 2.5, 3, 5];
  const CTRL_CLASS = 'ire-controls';
  const WRAPPER_CLASS = 'ire-video-wrapper';
  const STORAGE_KEY = 'ire_speed';

  /* ── State ──────────────────────────────────────────── */
  let currentSpeed = 1;
  let activeControllers = new WeakMap(); // video el → controller obj
  let mutationObserver = null;

  /* ── Restore saved speed from chrome.storage ────────── */
  chrome.storage.local.get(STORAGE_KEY, (result) => {
    if (result[STORAGE_KEY]) {
      currentSpeed = result[STORAGE_KEY];
    }
    init();
  });

  /* ── Main init ─────────────────────────────────────── */
  function init() {
    scanAndEnhance();
    observeDOM();
    observeNavigation();
  }

  /* ── Scan for reel videos and enhance them ─────────── */
  function scanAndEnhance() {
    // Instagram reels videos: typically inside <article> or a clips container
    const videos = document.querySelectorAll('video');
    videos.forEach(tryEnhance);
  }

  /* ── Enhance a single video element ────────────────── */
  function tryEnhance(video) {
    // Skip if already enhanced
    if (activeControllers.has(video)) return;

    // Skip tiny / non-reel videos (e.g. story thumbnails < 100px)
    if (video.offsetWidth < 100 && video.offsetHeight < 100) return;

    // Wrap and inject controls
    const wrapper = ensureWrapper(video);
    if (!wrapper) return;

    const controller = buildControls(video, wrapper);
    activeControllers.set(video, controller);

    // Apply remembered speed
    safeSetSpeed(video, currentSpeed);
  }

  /* ── Wrap video in a positioned container ───────────── */
  function ensureWrapper(video) {
    try {
      const parent = video.parentElement;
      if (!parent) return null;

      // Already wrapped
      if (parent.classList.contains(WRAPPER_CLASS)) return parent;

      const wrapper = document.createElement('div');
      wrapper.className = WRAPPER_CLASS;

      // Match parent's sizing constraints
      const cs = getComputedStyle(parent);
      wrapper.style.width = '100%';
      wrapper.style.height = cs.height !== 'auto' ? cs.height : '100%';
      wrapper.style.position = 'relative';

      parent.insertBefore(wrapper, video);
      wrapper.appendChild(video);
      return wrapper;
    } catch (e) {
      console.warn('[IRE] wrapper error', e);
      return null;
    }
  }

  /* ── Build and inject the controls overlay ──────────── */
  function buildControls(video, wrapper) {
    const controls = document.createElement('div');
    controls.className = CTRL_CLASS;

    /* — Scrub bar — */
    const scrubRow = document.createElement('div');
    scrubRow.className = 'ire-scrub-row';

    const track = document.createElement('div');
    track.className = 'ire-scrub-track';

    const fill = document.createElement('div');
    fill.className = 'ire-scrub-fill';

    const thumb = document.createElement('div');
    thumb.className = 'ire-scrub-thumb';

    track.appendChild(fill);
    track.appendChild(thumb);

    const timeLabel = document.createElement('span');
    timeLabel.className = 'ire-time';
    timeLabel.textContent = '0:00 / 0:00';

    scrubRow.appendChild(track);
    scrubRow.appendChild(timeLabel);

    /* — Speed buttons — */
    const speedRow = document.createElement('div');
    speedRow.className = 'ire-speed-row';

    const label = document.createElement('span');
    label.className = 'ire-speed-label';
    label.textContent = 'Speed';
    speedRow.appendChild(label);

    const speedBtns = SPEEDS.map(speed => {
      const btn = document.createElement('button');
      btn.className = 'ire-speed-btn';
      btn.textContent = speed + 'x';
      if (speed === currentSpeed) btn.classList.add('ire-active');

      btn.addEventListener('click', (e) => {
        e.stopPropagation();
        currentSpeed = speed;
        safeSetSpeed(video, speed);
        // Update all active videos
        document.querySelectorAll('video').forEach(v => {
          if (activeControllers.has(v)) safeSetSpeed(v, speed);
        });
        // Update all speed buttons across all controllers
        document.querySelectorAll('.ire-speed-btn').forEach(b => {
          b.classList.toggle('ire-active', b.textContent === speed + 'x');
        });
        // Persist to storage
        chrome.storage.local.set({ [STORAGE_KEY]: speed });
      });
      return btn;
    });

    speedBtns.forEach(btn => speedRow.appendChild(btn));

    controls.appendChild(scrubRow);
    controls.appendChild(speedRow);
    wrapper.appendChild(controls);

    /* — Live progress update — */
    function onTimeUpdate() {
      const dur = video.duration;
      const cur = video.currentTime;
      if (!isFinite(dur) || dur === 0) return;

      const pct = (cur / dur) * 100;
      fill.style.width = pct + '%';
      thumb.style.left = pct + '%';
      timeLabel.textContent = formatTime(cur) + ' / ' + formatTime(dur);
    }

    video.addEventListener('timeupdate', onTimeUpdate);

    /* — Scrub interaction — */
    let isScrubbing = false;

    function scrubTo(e) {
      const rect = track.getBoundingClientRect();
      const ratio = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
      if (isFinite(video.duration) && video.duration > 0) {
        video.currentTime = ratio * video.duration;
      }
    }

    track.addEventListener('mousedown', (e) => {
      e.stopPropagation();
      isScrubbing = true;
      scrubTo(e);
    });

    document.addEventListener('mousemove', (e) => {
      if (isScrubbing) scrubTo(e);
    });

    document.addEventListener('mouseup', () => {
      isScrubbing = false;
    });

    /* — Re-apply speed on video src change (new reel loaded) — */
    const srcObserver = new MutationObserver(() => {
      safeSetSpeed(video, currentSpeed);
    });
    srcObserver.observe(video, { attributes: true, attributeFilter: ['src'] });

    video.addEventListener('loadedmetadata', () => {
      safeSetSpeed(video, currentSpeed);
      onTimeUpdate();
    });

    /* — Cleanup helper stored on controller — */
    return {
      controls,
      srcObserver,
      destroy() {
        video.removeEventListener('timeupdate', onTimeUpdate);
        srcObserver.disconnect();
        controls.remove();
        // Unwrap if wrapper is empty
        try {
          const w = video.parentElement;
          if (w && w.classList.contains(WRAPPER_CLASS) && w.children.length === 1) {
            w.parentElement?.insertBefore(video, w);
            w.remove();
          }
        } catch (_) {}
      }
    };
  }

  /* ── Safely set playback rate ───────────────────────── */
  function safeSetSpeed(video, speed) {
    try {
      if (video && video.readyState >= 1) {
        video.playbackRate = speed;
      } else if (video) {
        // Wait for metadata then apply
        video.addEventListener('loadedmetadata', () => {
          video.playbackRate = speed;
        }, { once: true });
      }
    } catch (e) {
      console.warn('[IRE] setSpeed error', e);
    }
  }

  /* ── Format seconds to M:SS ─────────────────────────── */
  function formatTime(secs) {
    if (!isFinite(secs)) return '0:00';
    const m = Math.floor(secs / 60);
    const s = Math.floor(secs % 60).toString().padStart(2, '0');
    return `${m}:${s}`;
  }

  /* ── MutationObserver: watch for new video elements ─── */
  function observeDOM() {
    mutationObserver = new MutationObserver((mutations) => {
      let shouldScan = false;
      for (const mutation of mutations) {
        for (const node of mutation.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          // Quick check: does subtree contain a video?
          if (node.tagName === 'VIDEO' || node.querySelector?.('video')) {
            shouldScan = true;
            break;
          }
        }
        if (shouldScan) break;
      }
      if (shouldScan) {
        // Small debounce to let Instagram finish rendering
        clearTimeout(observeDOM._timer);
        observeDOM._timer = setTimeout(scanAndEnhance, 150);
      }
    });

    mutationObserver.observe(document.body, {
      childList: true,
      subtree: true
    });
  }

  /* ── SPA navigation detection (Instagram uses history API) */
  function observeNavigation() {
    // Intercept pushState / replaceState
    const wrap = (fn) => function (...args) {
      const result = fn.apply(this, args);
      setTimeout(scanAndEnhance, 400); // wait for new content
      return result;
    };

    history.pushState = wrap(history.pushState);
    history.replaceState = wrap(history.replaceState);

    window.addEventListener('popstate', () => setTimeout(scanAndEnhance, 400));
  }

  /* ── Cleanup on page unload (memory leak prevention) ── */
  window.addEventListener('unload', () => {
    mutationObserver?.disconnect();
    // Controllers are WeakMap-managed; GC handles the rest
  });

})();
