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
  const DESKTOP_LAYOUT_CLASS = 'ire-desktop-layout';
  const DESKTOP_ARTICLE_CLASS = 'ire-desktop-article';
  const DESKTOP_SPLIT_CLASS = 'ire-desktop-split-container';
  const DESKTOP_VIDEO_COLUMN_CLASS = 'ire-desktop-video-column';
  const DESKTOP_SIDE_PANEL_CLASS = 'ire-desktop-side-panel';
  const DESKTOP_OVERFLOW_CAPTION_CLASS = 'ire-desktop-overflow-caption';
  const NATIVE_CONTROL_CLASS = 'ire-native-reel-control';
  const NATIVE_PREV_CLASS = 'ire-native-reel-prev';
  const NATIVE_NEXT_CLASS = 'ire-native-reel-next';
  const NATIVE_CLOSE_CLASS = 'ire-native-reel-close';
  const NATIVE_AUDIO_CLASS = 'ire-native-reel-audio';
  const NATIVE_AUDIO_PARENT_CLASS = 'ire-native-reel-audio-parent';

  let currentSpeed   = 1;
  const enhancedSet  = new WeakSet();   // videos already wrapped
  const listenerSet  = new WeakSet();   // videos already have timeupdate/speed listeners
  let domObserver    = null;
  let scanTimer      = null;
  let layoutTimer    = null;
  const desktopLayoutElements = new Set();
  const nativeControlElements = new Set();
  const nativeAudioParentElements = new Set();

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

    // if (best) console.log('[IRE] Video found:', best, `visibility=${(bestRatio*100).toFixed(1)}%`);
    return best;
  }

  /* ─────────────────────────────────────────────────────
     init
  ───────────────────────────────────────────────────── */
  function init() {
    scanAndEnhance();
    applyDesktopLayout();
    observeDOM();
    observeNavigation();
    window.addEventListener('resize', scheduleDesktopLayout);
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
    scheduleDesktopLayout();
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

  function scheduleDesktopLayout() {
    clearTimeout(layoutTimer);
    layoutTimer = setTimeout(applyDesktopLayout, 100);
  }

  /* Apply desktop-only Reels layout classes.
     The CSS does the resizing; JS only identifies Instagram's current
     video/comment structure so normal pages and mobile layouts stay untouched. */
  function applyDesktopLayout() {
    clearDesktopLayout();

    // Full Desktop Mode only runs on direct Reels routes and desktop widths.
    if (!isReelViewerPath() || window.innerWidth < 1024) return;

    const video = getActiveVideo();
    if (!video || !video.closest('article')) return;

    const article = video.closest('article');
    const splitContainer = findSplitContainer(article, video);
    const videoColumn = splitContainer
      ? Array.from(splitContainer.children).find(child => child.contains(video))
      : null;

    // Avoid half-applying layout if Instagram renders a different structure.
    if (!splitContainer || !videoColumn) return;

    document.documentElement.classList.add(DESKTOP_LAYOUT_CLASS);
    desktopLayoutElements.add(document.documentElement);

    article.classList.add(DESKTOP_ARTICLE_CLASS);
    desktopLayoutElements.add(article);

    if (splitContainer) {
      splitContainer.classList.add(DESKTOP_SPLIT_CLASS);
      desktopLayoutElements.add(splitContainer);
    }

    if (videoColumn) {
      videoColumn.classList.add(DESKTOP_VIDEO_COLUMN_CLASS);
      desktopLayoutElements.add(videoColumn);
    }

    Array.from(splitContainer.children).forEach(child => {
      if (child !== videoColumn) {
        child.classList.add(DESKTOP_SIDE_PANEL_CLASS);
        desktopLayoutElements.add(child);
      }
    });

    const sidePanel = splitContainer.querySelector(`.${DESKTOP_SIDE_PANEL_CLASS}`);
    const sideRect = sidePanel?.getBoundingClientRect();
    if (sideRect) {
      document.documentElement.style.setProperty('--ire-side-width', `${Math.round(sideRect.width)}px`);
    }

    // Some long captions are positioned before layout settles, so re-check after paint.
    markOverflowingCaptions();
    requestAnimationFrame(markOverflowingCaptions);
    setTimeout(markOverflowingCaptions, 250);
    markNativeReelControls(videoColumn);
  }

  /* Remove all desktop-mode marker classes before re-detecting.
     Instagram is a SPA, so stale classes can otherwise leak between reels/routes. */
  function clearDesktopLayout() {
    desktopLayoutElements.forEach(element => {
      element.classList.remove(
        DESKTOP_LAYOUT_CLASS,
        DESKTOP_ARTICLE_CLASS,
        DESKTOP_SPLIT_CLASS,
        DESKTOP_VIDEO_COLUMN_CLASS,
        DESKTOP_SIDE_PANEL_CLASS,
        DESKTOP_OVERFLOW_CAPTION_CLASS
      );
    });
    desktopLayoutElements.clear();
    clearNativeReelControls();
  }

  /* Mark Instagram's own Reels controls so CSS can keep them visible.
     No custom navigation/audio buttons are created; native controls remain clickable. */
  function markNativeReelControls(videoColumn) {
    clearNativeReelControls();

    // Expose video geometry to CSS for positioning controls relative to the video area.
    const rect = videoColumn?.getBoundingClientRect();
    if (rect) {
      document.documentElement.style.setProperty('--ire-video-left', `${Math.round(rect.left)}px`);
      document.documentElement.style.setProperty('--ire-video-right', `${Math.round(window.innerWidth - rect.right)}px`);
      document.documentElement.style.setProperty('--ire-video-width', `${Math.round(rect.width)}px`);
    }

    document.querySelectorAll('button, [role="button"]').forEach(control => {
      const audioIcon = control.querySelector('svg[aria-label*="Audio"], svg title');
      const label = [
        control.getAttribute('aria-label'),
        audioIcon?.getAttribute?.('aria-label'),
        audioIcon?.textContent,
        control.textContent
      ].filter(Boolean).join(' ').trim().toLowerCase();
      const rect = control.getBoundingClientRect();

      if (label.includes('previous') || isLeftEdgeControl(rect)) {
        markNativeReelControl(control, NATIVE_PREV_CLASS);
      } else if (label.includes('next')) {
        markNativeReelControl(control, NATIVE_NEXT_CLASS);
      } else if (label.includes('close')) {
        markNativeReelControl(control, NATIVE_CLOSE_CLASS);
      } else if (label.includes('audio') || label.includes('mute') || isVideoAudioControl(rect)) {
        markNativeReelControl(control, NATIVE_AUDIO_CLASS);
      }
    });

    const nativeAudio = findNativeAudioControl();
    if (nativeAudio) {
      markNativeReelControl(nativeAudio, NATIVE_AUDIO_CLASS);
    }

    adjustNativeAudioControl();
    requestAnimationFrame(adjustNativeAudioControl);
    setTimeout(adjustNativeAudioControl, 250);
  }

  // Instagram's left arrow may not always expose a stable text label.
  function isLeftEdgeControl(rect) {
    return (
      rect.width >= 24 &&
      rect.width <= 56 &&
      rect.height >= 24 &&
      rect.height <= 56 &&
      rect.left >= 0 &&
      rect.left <= 80 &&
      rect.top > window.innerHeight * 0.25 &&
      rect.bottom < window.innerHeight * 0.85
    );
  }

  // Audio controls are usually near the lower-right edge of the video.
  function isVideoAudioControl(rect) {
    const videoLeft = parseFloat(document.documentElement.style.getPropertyValue('--ire-video-left')) || 0;
    const videoWidth = parseFloat(document.documentElement.style.getPropertyValue('--ire-video-width')) || 0;
    const videoRight = videoLeft + videoWidth;

    return (
      videoWidth > 0 &&
      rect.width >= 20 &&
      rect.width <= 44 &&
      rect.height >= 20 &&
      rect.height <= 44 &&
      rect.left > videoRight - 90 &&
      rect.right <= videoRight + 20 &&
      rect.top > window.innerHeight - 100
    );
  }

  // Prefer semantic audio labels/icons when Instagram exposes them.
  function findNativeAudioControl() {
    const video = getActiveVideo();
    const player = video?.closest('[role="group"][aria-label="Video player"]');
    const scope = player || document;
    const candidates = Array.from(scope.querySelectorAll('[role="button"], button'))
      .filter(control => {
        const audioIcon = control.querySelector('svg[aria-label*="Audio"], svg title');
        return /audio|mute|volume/i.test([
          control.getAttribute('aria-label'),
          audioIcon?.getAttribute?.('aria-label'),
          audioIcon?.textContent,
          control.textContent
        ].filter(Boolean).join(' '));
      });

    if (!candidates.length) return null;

    return candidates
      .map(control => ({ control, rect: control.getBoundingClientRect() }))
      .filter(({ rect }) => (
        rect.width >= 20 &&
        rect.width <= 48 &&
        rect.height >= 20 &&
        rect.height <= 48
      ))
      .sort((a, b) => {
        const aScore = a.rect.right + a.rect.bottom;
        const bScore = b.rect.right + b.rect.bottom;
        return bScore - aScore;
      })[0]?.control || null;
  }

  function markNativeReelControl(control, extraClass) {
    control.classList.add(NATIVE_CONTROL_CLASS, extraClass);
    nativeControlElements.add(control);

    if (extraClass === NATIVE_AUDIO_CLASS) {
      markNativeAudioParents(control);
    }
  }

  function clearNativeReelControls() {
    nativeControlElements.forEach(control => {
      control.classList.remove(
        NATIVE_CONTROL_CLASS,
        NATIVE_PREV_CLASS,
        NATIVE_NEXT_CLASS,
        NATIVE_CLOSE_CLASS,
        NATIVE_AUDIO_CLASS
      );
      control.style.removeProperty('--ire-audio-offset-x');
      control.style.removeProperty('--ire-audio-offset-y');
    });
    nativeControlElements.clear();

    nativeAudioParentElements.forEach(element => {
      element.classList.remove(NATIVE_AUDIO_PARENT_CLASS);
    });
    nativeAudioParentElements.clear();

    document.documentElement.style.removeProperty('--ire-video-left');
    document.documentElement.style.removeProperty('--ire-video-right');
    document.documentElement.style.removeProperty('--ire-video-width');
    document.documentElement.style.removeProperty('--ire-side-width');
  }

  // Raising parent stacking contexts keeps the native audio icon visible without reparenting it.
  function markNativeAudioParents(control) {
    const videoColumn = document.querySelector(`.${DESKTOP_VIDEO_COLUMN_CLASS}`);
    let element = control.parentElement;

    while (element && element !== document.body) {
      element.classList.add(NATIVE_AUDIO_PARENT_CLASS);
      nativeAudioParentElements.add(element);

      if (element === videoColumn) break;
      element = element.parentElement;
    }
  }

  // Move the native audio button into view with a measured transform, not DOM movement.
  function adjustNativeAudioControl() {
    const audioControl = document.querySelector(`.${NATIVE_AUDIO_CLASS}`);
    const videoColumn = document.querySelector(`.${DESKTOP_VIDEO_COLUMN_CLASS}`);
    if (!audioControl || !videoColumn) return;

    audioControl.style.setProperty('--ire-audio-offset-x', '0px');
    audioControl.style.setProperty('--ire-audio-offset-y', '0px');

    const controlRect = audioControl.getBoundingClientRect();
    const videoRect = videoColumn.getBoundingClientRect();

    if (!controlRect.width || !controlRect.height || !videoRect.width || !videoRect.height) return;

    const targetLeft = Math.min(
      videoRect.right - controlRect.width - 24,
      window.innerWidth - controlRect.width - 16
    );
    const targetTop = Math.min(
      videoRect.bottom - controlRect.height - 24,
      window.innerHeight - controlRect.height - 16
    );

    audioControl.style.setProperty('--ire-audio-offset-x', `${Math.round(targetLeft - controlRect.left)}px`);
    audioControl.style.setProperty('--ire-audio-offset-y', `${Math.round(targetTop - controlRect.top)}px`);
  }

  /* Detect long caption blocks that Instagram positions across the viewport.
     Marking only confirmed overflowers avoids breaking normal comments. */
  function markOverflowingCaptions() {
    const minOverflowWidth = Math.max(700, window.innerWidth * 0.45);
    const candidates = document.querySelectorAll('._a9zr, ._a9zs, h1, [class*="_a9z"], [class*="_aad"]');

    candidates.forEach(element => {
      const rect = element.getBoundingClientRect();
      const text = (element.textContent || '').trim();

      if (
        text.length > 80 &&
        rect.width > minOverflowWidth &&
        rect.left < window.innerWidth * 0.2 &&
        rect.right > window.innerWidth * 0.7
      ) {
        element.classList.add(DESKTOP_OVERFLOW_CAPTION_CLASS);
        desktopLayoutElements.add(element);

        const captionContainer = element.closest('._a9zr, ._a9zs, [class*="_a9z"]');
        if (captionContainer) {
          captionContainer.classList.add(DESKTOP_OVERFLOW_CAPTION_CLASS);
          desktopLayoutElements.add(captionContainer);
        }
      }
    });
  }

  // Scope desktop mode to Reels pages only.
  function isReelViewerPath() {
    const [firstSegment] = window.location.pathname.split('/').filter(Boolean);
    return firstSegment === 'reel' || firstSegment === 'reels';
  }

  /* Find the flex row that contains the video column and comment panel.
     Uses structure and dimensions instead of relying on Instagram's generated classes. */
  function findSplitContainer(article, video) {
    let node = video.parentElement;

    while (node && node !== article) {
      const parent = node.parentElement;

      if (parent && parent !== article && parent.children.length >= 2) {
        const children = Array.from(parent.children);
        const videoChild = children.find(child => child.contains(video));
        const sideChild = children.find(child => (
          child !== videoChild &&
          isLikelyCommentPanel(child)
        ));

        if (videoChild && sideChild) {
          const parentStyle = getComputedStyle(parent);
          const parentRect = parent.getBoundingClientRect();
          const videoRect = videoChild.getBoundingClientRect();
          const sideRect = sideChild.getBoundingClientRect();

          if (
            parentStyle.display.includes('flex') &&
            parentStyle.flexDirection === 'row' &&
            parentRect.width > video.offsetWidth + 200 &&
            videoRect.width >= 300 &&
            videoRect.height >= window.innerHeight * 0.6 &&
            sideRect.width >= 260
          ) {
            return parent;
          }
        }
      }

      node = parent;
    }

    return null;
  }

  // Comment panel detection keeps layout changes scoped to the active Reel viewer.
  function isLikelyCommentPanel(element) {
    const rect = element.getBoundingClientRect();
    if (rect.width < 260 || rect.height < window.innerHeight * 0.5) return false;
    if (element.querySelector('video')) return false;

    const text = element.textContent || '';
    return /reply|comment|liked by|likes|follow|translation|original audio/i.test(text);
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
          scheduleDesktopLayout();
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
      clearDesktopLayout();
      setTimeout(() => {
        scanAndEnhance();
        attachListeners(getActiveVideo());
        scheduleDesktopLayout();
      }, 500);
      return r;
    };

    history.pushState    = patch(history.pushState);
    history.replaceState = patch(history.replaceState);
    window.addEventListener('popstate', () => {
      clearDesktopLayout();
      setTimeout(() => {
        scanAndEnhance();
        attachListeners(getActiveVideo());
        scheduleDesktopLayout();
      }, 500);
    });
  }

  /* ─────────────────────────────────────────────────────
     Cleanup on unload
  ───────────────────────────────────────────────────── */
  window.addEventListener('unload', () => {
    domObserver?.disconnect();
    clearTimeout(scanTimer);
    clearTimeout(layoutTimer);
    clearDesktopLayout();
    window.removeEventListener('resize', scheduleDesktopLayout);
  });

})();
