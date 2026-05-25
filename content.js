/* ========================================================
   Instagram Reels Enhancer — Content Script v2
   Manifest V3 | Vanilla JS | Fixed pointer events & seeking
   ======================================================== */

(() => {
  'use strict';

  /* ─────────────────────────────────────────────────────
     Constants & State
  ───────────────────────────────────────────────────── */
  const SPEEDS      = [1, 1.5, 2, 2.5, 3, 5];
  const CTRL_CLASS  = 'ire-controls';
  const WRAP_CLASS  = 'ire-video-wrapper';
  const STORAGE_KEY = 'ire_speed';

  let currentSpeed   = 1;
  const enhancedSet  = new WeakSet();   // videos already wrapped
  const listenerSet  = new WeakSet();   // videos already have timeupdate/speed listeners
  let domObserver    = null;
  let scanTimer      = null;

  /* ─────────────────────────────────────────────────────
     Boot: restore saved speed then initialise
  ───────────────────────────────────────────────────── */
  chrome.storage.local.get(STORAGE_KEY, (res) => {
    if (res[STORAGE_KEY]) currentSpeed = res[STORAGE_KEY];
    init();
  });

  /* ─────────────────────────────────────────────────────
     getActiveVideo()
     Returns the video element most visible in the viewport.
     Never caches the result — always queries live DOM.
  ───────────────────────────────────────────────────── */
  function getActiveVideo() {
    const videos = Array.from(document.querySelectorAll('video'));
    if (!videos.length) return null;

    let best = null;
    let bestRatio = 0;

    for (const v of videos) {
      // Skip invisible or tiny videos (story thumbnails, ads, etc.)
      if (v.offsetWidth < 80 || v.offsetHeight < 80) continue;
      if (getComputedStyle(v).display === 'none') continue;

      const rect  = v.getBoundingClientRect();
      const vpW   = window.innerWidth;
      const vpH   = window.innerHeight;

      // Intersection area with viewport
      const ix = Math.max(0, Math.min(rect.right, vpW)  - Math.max(rect.left, 0));
      const iy = Math.max(0, Math.min(rect.bottom, vpH) - Math.max(rect.top, 0));
      const intersect = ix * iy;
      const area      = rect.width * rect.height;
      const ratio     = area > 0 ? intersect / area : 0;

      if (ratio > bestRatio) {
        bestRatio = ratio;
        best = v;
      }
    }

    if (best) console.log('[IRE] Video found:', best, `visibility=${(bestRatio*100).toFixed(1)}%`);
    return best;
  }

  /* ─────────────────────────────────────────────────────
     init
  ───────────────────────────────────────────────────── */
  function init() {
    scanAndEnhance();
    observeDOM();
    observeNavigation();
    // PiP state sync (user may close PiP window externally)
    document.addEventListener('leavepictureinpicture', syncPipButtons);
  }

  /* ─────────────────────────────────────────────────────
     scanAndEnhance — wrap every qualifying video
  ───────────────────────────────────────────────────── */
  function scanAndEnhance() {
    document.querySelectorAll('video').forEach(tryEnhance);
    // After wrapping, attach playback listeners to the active video
    attachListeners(getActiveVideo());
  }

  /* ─────────────────────────────────────────────────────
     tryEnhance — wrap one video with controls overlay
  ───────────────────────────────────────────────────── */
  function tryEnhance(video) {
    if (enhancedSet.has(video)) return;
    if (video.offsetWidth < 80 || video.offsetHeight < 80) return;

    const wrapper = ensureWrapper(video);
    if (!wrapper) return;

    buildControls(video, wrapper);
    enhancedSet.add(video);
  }

  /* ─────────────────────────────────────────────────────
     ensureWrapper — surround video in a positioned div
  ───────────────────────────────────────────────────── */
  function ensureWrapper(video) {
    try {
      const parent = video.parentElement;
      if (!parent) return null;
      if (parent.classList.contains(WRAP_CLASS)) return parent;

      const wrapper      = document.createElement('div');
      wrapper.className  = WRAP_CLASS;
      // Match computed size of parent so layout doesn't break
      wrapper.style.cssText = `
        width:100%; height:100%;
        position:relative; display:block;
        pointer-events:none;
      `;

      parent.insertBefore(wrapper, video);
      wrapper.appendChild(video);
      return wrapper;
    } catch (e) {
      console.warn('[IRE] ensureWrapper error', e);
      return null;
    }
  }

  /* ─────────────────────────────────────────────────────
     buildControls — inject scrub bar + speed + PiP
  ───────────────────────────────────────────────────── */
  function buildControls(video, wrapper) {

    // Only create one floating panel
    if(document.querySelector("." + CTRL_CLASS))
        return;

    const controls=document.createElement("div");
    controls.className=CTRL_CLASS;

    /* ----- SCRUB ----- */

    const scrubRow=document.createElement("div");
    scrubRow.className="ire-scrub-row";

    const track=document.createElement("div");
    track.className="ire-scrub-track";

    const visual=document.createElement("div");
    visual.className="ire-scrub-visual";

    const fill=document.createElement("div");
    fill.className="ire-scrub-fill";

    const thumb=document.createElement("div");
    thumb.className="ire-scrub-thumb";

    visual.appendChild(fill);
    visual.appendChild(thumb);

    track.appendChild(visual);

    const timeLabel=document.createElement("span");
    timeLabel.className="ire-time";
    timeLabel.textContent="0:00 / 0:00";

    scrubRow.appendChild(track);
    scrubRow.appendChild(timeLabel);

    /* ----- SPEED ----- */

    const speedRow=document.createElement("div");
    speedRow.className="ire-speed-row";

    SPEEDS.forEach(speed=>{

        const btn=document.createElement("button");

        btn.className="ire-speed-btn";
        btn.textContent=speed+"x";

        btn.addEventListener(
            "click",
            (e)=>{

                e.preventDefault();
                e.stopPropagation();

                const activeVideo=
                    getActiveVideo();

                if(!activeVideo)
                    return;

                currentSpeed=speed;

                safeSetSpeed(
                    activeVideo,
                    speed
                );

                updateSpeedButtons(speed);

            }
        );

        speedRow.appendChild(btn);

    });

    /* ----- PIP ----- */

    const pipBtn=document.createElement("button");

    pipBtn.className="ire-pip-btn";

    pipBtn.textContent="PiP";

    pipBtn.addEventListener(
        "click",
        async(e)=>{

            e.preventDefault();
            e.stopPropagation();

            try{

                const activeVideo=
                    getActiveVideo();

                if(!activeVideo)
                    return;

                if(
                    document.pictureInPictureElement
                ){

                    await document
                    .exitPictureInPicture();

                }else{

                    await activeVideo
                    .requestPictureInPicture();

                }

            }catch(err){

                console.warn(err);

            }

        }
    );

    speedRow.appendChild(pipBtn);

    controls.appendChild(scrubRow);
    controls.appendChild(speedRow);

    /* IMPORTANT:
       Add to BODY instead of wrapper
    */

    document.body.appendChild(
        controls
    );

    wireScrub(
        track,
        fill,
        thumb,
        timeLabel
    );
}

  /* ─────────────────────────────────────────────────────
     wireScrub — pointer-based drag & click for seek
     Uses pointer capture for reliable drag outside element
  ───────────────────────────────────────────────────── */
  function wireScrub(track, fill, thumb, timeLabel) {

    let isDragging = false;

    function getCurrentVideo(){
        return getActiveVideo();
    }

    function onTimeUpdate(){

        if(isDragging) return;

        const video=getCurrentVideo();

        if(
            !video ||
            !isFinite(video.duration) ||
            video.duration===0
        ) return;

        const pct=
            (video.currentTime/video.duration)*100;

        fill.style.width=pct+'%';
        thumb.style.left=pct+'%';

        timeLabel.textContent=
            fmt(video.currentTime)
            +' / '+
            fmt(video.duration);
    }

    setInterval(onTimeUpdate,200);

    function getRatio(e){

        const rect=
            track.getBoundingClientRect();

        return Math.max(
            0,
            Math.min(
                1,
                (e.clientX-rect.left)/rect.width
            )
        );
    }

    function doSeek(ratio){

        const video=getCurrentVideo();

        if(
            !video ||
            !isFinite(video.duration) ||
            video.duration===0
        ) return;

        video.currentTime=
            ratio*video.duration;

        fill.style.width=
            (ratio*100)+'%';

        thumb.style.left=
            (ratio*100)+'%';
    }

    track.addEventListener(
        "pointerdown",
        (e)=>{

            e.preventDefault();

            isDragging=true;

            doSeek(
                getRatio(e)
            );

        }
    );

    track.addEventListener(
        "pointermove",
        (e)=>{

            if(!isDragging)
                return;

            doSeek(
                getRatio(e)
            );

        }
    );

    window.addEventListener(
        "pointerup",
        ()=>{

            isDragging=false;

        }
    );
}

  /* ─────────────────────────────────────────────────────
     attachListeners — bind timeupdate to the active video
     Called whenever the active reel may have changed.
     Uses WeakSet to avoid duplicate listeners.
  ───────────────────────────────────────────────────── */
  function attachListeners(video) {
    if (!video) return;

    // Apply speed immediately
    safeSetSpeed(video, currentSpeed);

    if (listenerSet.has(video)) return; // already wired
    listenerSet.add(video);

    // Find the wrapper that owns this video (if any)
    const wrapper = video.closest('.' + WRAP_CLASS);
    if (!wrapper || !wrapper._ireUpdateFn) return;

    video.addEventListener('timeupdate', wrapper._ireUpdateFn);
    video.addEventListener('loadedmetadata', () => {
      safeSetSpeed(video, currentSpeed);
      wrapper._ireUpdateFn();
    });

    console.log('[IRE] Listeners attached to video', video);
  }

  /* ─────────────────────────────────────────────────────
     safeSetSpeed
  ───────────────────────────────────────────────────── */
  function safeSetSpeed(video, speed) {
    if (!video) return;
    try {
      if (video.readyState >= 1) {
        video.playbackRate = speed;
      } else {
        video.addEventListener('loadedmetadata',
          () => { video.playbackRate = speed; }, { once: true });
      }
    } catch (e) {
      console.warn('[IRE] safeSetSpeed error', e);
    }
  }

  /* ─────────────────────────────────────────────────────
     updateSpeedButtons — sync active class across ALL buttons
  ───────────────────────────────────────────────────── */
  function updateSpeedButtons(speed) {
    document.querySelectorAll('.ire-speed-btn').forEach(btn => {
      btn.classList.toggle('ire-active', parseFloat(btn.dataset.speed) === speed);
    });
  }

  /* ─────────────────────────────────────────────────────
     syncPipButtons — update PiP button style
  ───────────────────────────────────────────────────── */
  function syncPipButtons() {
    const isActive = !!document.pictureInPictureElement;
    document.querySelectorAll('.ire-pip-btn').forEach(btn => {
      btn.classList.toggle('ire-pip-active', isActive);
      btn.title = isActive ? 'Exit Picture-in-Picture' : 'Picture-in-Picture';
    });
  }

  /* ─────────────────────────────────────────────────────
     fmt — seconds → M:SS
  ───────────────────────────────────────────────────── */
  function fmt(s) {
    if (!isFinite(s)) return '0:00';
    const m = Math.floor(s / 60);
    const sec = Math.floor(s % 60).toString().padStart(2, '0');
    return `${m}:${sec}`;
  }

  /* ─────────────────────────────────────────────────────
     observeDOM — watch for new video elements (SPA / infinite scroll)
  ───────────────────────────────────────────────────── */
  function observeDOM() {
    domObserver = new MutationObserver((mutations) => {
      let needsScan = false;
      for (const m of mutations) {
        for (const node of m.addedNodes) {
          if (node.nodeType !== Node.ELEMENT_NODE) continue;
          if (node.tagName === 'VIDEO' || node.querySelector?.('video')) {
            needsScan = true;
            break;
          }
        }
        if (needsScan) break;
      }

      if (needsScan) {
        clearTimeout(scanTimer);
        scanTimer = setTimeout(() => {
          scanAndEnhance();
          attachListeners(getActiveVideo());
        }, 200);
      }
    });

    domObserver.observe(document.body, { childList: true, subtree: true });
  }

  /* ─────────────────────────────────────────────────────
     observeNavigation — Instagram SPA route changes
  ───────────────────────────────────────────────────── */
  function observeNavigation() {
    const patch = (fn) => function (...args) {
      const r = fn.apply(this, args);
      setTimeout(() => {
        scanAndEnhance();
        attachListeners(getActiveVideo());
      }, 500);
      return r;
    };

    history.pushState    = patch(history.pushState);
    history.replaceState = patch(history.replaceState);
    window.addEventListener('popstate', () => {
      setTimeout(() => {
        scanAndEnhance();
        attachListeners(getActiveVideo());
      }, 500);
    });
  }

  /* ─────────────────────────────────────────────────────
     Cleanup on unload
  ───────────────────────────────────────────────────── */
  window.addEventListener('unload', () => {
    domObserver?.disconnect();
    clearTimeout(scanTimer);
  });

})();
