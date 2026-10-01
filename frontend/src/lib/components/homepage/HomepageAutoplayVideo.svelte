<script lang="ts">
  import { onDestroy, onMount, tick } from 'svelte';
  import { resolveStorefrontMediaSrc } from '$lib/utils/media-url';

  export let src = '';
  /** Still frame while the file buffers — kills the native play glyph in Safari/Chrome. */
  export let poster = '';
  export let className = '';
  export let style = '';
  export let autoplay = true;
  export let loop = true;
  export let muted = true;
  export let controls = false;
  export let playsinline = true;
  export let preload: 'none' | 'metadata' | 'auto' = 'metadata';
  export let ariaLabel = '';
  /** LCP poster hint for hero / above-the-fold videos. */
  export let posterPriority: 'high' | 'low' | 'auto' = 'auto';

  let videoElement: HTMLVideoElement | null = null;
  let wrapElement: HTMLDivElement | null = null;
  let lastPlaybackKey = '';
  let playGeneration = 0;
  let isPlaying = false;
  let hasNudgedLoad = false;
  let retryTimer: ReturnType<typeof setTimeout> | null = null;
  let intersectionObserver: IntersectionObserver | null = null;
  let cleanupPageShow: (() => void) | null = null;
  let cleanupVisibilityChange: (() => void) | null = null;
  let cleanupPointer: (() => void) | null = null;

  $: mediaSrc = resolveStorefrontMediaSrc(src);
  $: posterSrc = resolveStorefrontMediaSrc(poster);
  $: hideNativeChrome = autoplay && !controls;
  $: showPosterOverlay = Boolean(posterSrc) && hideNativeChrome && !isPlaying;

  function clearRetryTimer() {
    if (retryTimer) {
      clearTimeout(retryTimer);
      retryTimer = null;
    }
  }

  function scheduleRetry(delayMs: number, retryCount: number) {
    clearRetryTimer();
    const generation = playGeneration;
    retryTimer = setTimeout(() => {
      if (generation !== playGeneration) return;
      void attemptAutoplay(retryCount);
    }, delayMs);
  }

  function primeMutedInline(video: HTMLVideoElement) {
    video.defaultMuted = true;
    video.muted = true;
    video.setAttribute('muted', '');
    video.playsInline = true;
    video.setAttribute('playsinline', '');
    video.setAttribute('webkit-playsinline', 'true');
  }

  async function attemptAutoplay(retryCount = 0) {
    const video = videoElement;
    if (!video) return;
    if (!autoplay || !mediaSrc) return;
    if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;

    const generation = playGeneration;
    primeMutedInline(video);

    try {
      if (!video.paused && !video.ended) {
        isPlaying = true;
        clearRetryTimer();
        return;
      }

      // Do NOT call video.load() on every retry — it aborts buffering and is why
      // Safari often only starts after a scroll re-triggers play.
      if (video.readyState === 0 && !hasNudgedLoad) {
        hasNudgedLoad = true;
        try {
          video.load();
        } catch {
          // ignore
        }
      }

      if (video.readyState < 2) {
        if (retryCount < 12) {
          scheduleRetry(200 + retryCount * 150, retryCount + 1);
        }
        return;
      }

      const playPromise = video.play();
      if (playPromise !== undefined) {
        await playPromise;
      }

      if (generation !== playGeneration) return;
      isPlaying = !video.paused;
      if (isPlaying) {
        clearRetryTimer();
      } else if (retryCount < 12) {
        scheduleRetry(250 + retryCount * 150, retryCount + 1);
      }
    } catch (error) {
      if (generation !== playGeneration) return;
      isPlaying = false;
      console.debug('Homepage video autoplay prevented:', error);
      if (retryCount < 12) {
        scheduleRetry(300 + retryCount * 200, retryCount + 1);
      }
    }
  }

  function applyPlaybackAttributes(video: HTMLVideoElement) {
    primeMutedInline(video);
    video.loop = loop;
    video.autoplay = autoplay;
    video.preload = preload;
    video.controls = controls;
    video.disablePictureInPicture = true;
    video.setAttribute('autoplay', '');
    video.setAttribute('disablePictureInPicture', 'true');
    video.setAttribute('disableremoteplayback', 'true');
    video.setAttribute('controlsList', 'nodownload noplaybackrate nofullscreen noremoteplayback');
    if (!controls) {
      video.removeAttribute('controls');
    }
    // Respect non-autoplay mute preference when controls are shown.
    if (!autoplay) {
      video.defaultMuted = muted;
      video.muted = muted;
      video.playsInline = playsinline;
    }
  }

  function syncPlayback() {
    const video = videoElement;
    if (!video) return;

    applyPlaybackAttributes(video);

    if (!mediaSrc) {
      playGeneration += 1;
      isPlaying = false;
      hasNudgedLoad = false;
      clearRetryTimer();
      video.pause();
      return;
    }

    void attemptAutoplay(0);
  }

  function onPlaying() {
    isPlaying = true;
    clearRetryTimer();
  }

  function onPause() {
    const video = videoElement;
    if (!video || video.ended) return;
    requestAnimationFrame(() => {
      if (!videoElement || videoElement.ended) return;
      if (!videoElement.paused) {
        isPlaying = true;
        return;
      }
      isPlaying = false;
      if (autoplay && document.visibilityState === 'visible') {
        void attemptAutoplay(0);
      }
    });
  }

  $: {
    const nextPlaybackKey = JSON.stringify({
      mediaSrc,
      posterSrc,
      autoplay,
      loop,
      muted,
      controls,
      playsinline,
      preload,
    });

    if (nextPlaybackKey !== lastPlaybackKey) {
      lastPlaybackKey = nextPlaybackKey;
      playGeneration += 1;
      isPlaying = false;
      hasNudgedLoad = false;
      clearRetryTimer();
      tick().then(syncPlayback);
    }
  }

  onMount(() => {
    void tick().then(async () => {
      await syncPlayback();
      // Layout settle — first paint often has 0-size absolute wrappers.
      requestAnimationFrame(() => {
        void attemptAutoplay(0);
        requestAnimationFrame(() => void attemptAutoplay(0));
      });
    });

    // Kick play when entering viewport — never block play when IO says "not yet".
    if (typeof IntersectionObserver !== 'undefined' && wrapElement) {
      intersectionObserver = new IntersectionObserver(
        (entries) => {
          if (entries.some((entry) => entry.isIntersecting)) {
            void attemptAutoplay(0);
          }
        },
        { rootMargin: '200px 0px', threshold: 0 }
      );
      intersectionObserver.observe(wrapElement);
    }

    const handlePageShow = () => {
      void attemptAutoplay(0);
    };

    const handleVisibilityChange = () => {
      if (document.visibilityState === 'visible') {
        void attemptAutoplay(0);
      }
    };

    // First user scroll/touch unlocks Safari media in Low Power / strict autoplay modes.
    const handleUserActivate = () => {
      void attemptAutoplay(0);
    };

    window.addEventListener('pageshow', handlePageShow);
    document.addEventListener('visibilitychange', handleVisibilityChange);
    window.addEventListener('scroll', handleUserActivate, { passive: true, once: true });
    window.addEventListener('touchstart', handleUserActivate, { passive: true, once: true });
    window.addEventListener('pointerdown', handleUserActivate, { passive: true, once: true });

    cleanupPageShow = () => window.removeEventListener('pageshow', handlePageShow);
    cleanupVisibilityChange = () =>
      document.removeEventListener('visibilitychange', handleVisibilityChange);
    cleanupPointer = () => {
      window.removeEventListener('scroll', handleUserActivate);
      window.removeEventListener('touchstart', handleUserActivate);
      window.removeEventListener('pointerdown', handleUserActivate);
    };
  });

  onDestroy(() => {
    playGeneration += 1;
    clearRetryTimer();
    intersectionObserver?.disconnect();
    intersectionObserver = null;
    cleanupPageShow?.();
    cleanupVisibilityChange?.();
    cleanupPointer?.();
  });
</script>

<div
  bind:this={wrapElement}
  class="homepage-autoplay-video-wrap {className}"
  class:is-pending={hideNativeChrome && !isPlaying}
  class:has-poster={Boolean(posterSrc)}
  style={style}
>
  {#if showPosterOverlay}
    <img
      src={posterSrc}
      alt=""
      class="homepage-autoplay-video-poster"
      draggable="false"
      aria-hidden="true"
      loading={posterPriority === 'high' ? 'eager' : 'lazy'}
      fetchpriority={posterPriority}
      decoding="async"
    />
  {/if}

  {#if mediaSrc}
    <!--
      Keep the <video> painted (opacity 1) under the poster.
      Safari refuses muted autoplay for elements treated as not visible.
    -->
    <video
      bind:this={videoElement}
      src={mediaSrc}
      poster={posterSrc || undefined}
      {controls}
      {loop}
      muted={autoplay ? true : muted}
      {autoplay}
      playsinline={autoplay ? true : playsinline}
      {preload}
      class="homepage-autoplay-video"
      class:hide-chrome={hideNativeChrome}
      aria-label={ariaLabel}
      disablepictureinpicture={true}
      disableremoteplayback={true}
      controlslist="nodownload noplaybackrate nofullscreen noremoteplayback"
      tabindex="-1"
      on:canplay={() => void attemptAutoplay(0)}
      on:loadeddata={() => void attemptAutoplay(0)}
      on:canplaythrough={() => void attemptAutoplay(0)}
      on:playing={onPlaying}
      on:pause={onPause}
    ></video>
  {/if}
</div>

<style>
  .homepage-autoplay-video-wrap {
    position: relative;
    overflow: hidden;
    background: #f5f5f5;
  }

  .homepage-autoplay-video-wrap.has-poster.is-pending {
    background: #111;
  }

  .homepage-autoplay-video-poster {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    object-fit: cover;
    z-index: 1;
    pointer-events: none;
    user-select: none;
  }

  .homepage-autoplay-video {
    display: block;
    width: 100%;
    height: 100%;
    object-fit: cover;
    opacity: 1;
  }

  .homepage-autoplay-video.hide-chrome {
    pointer-events: none;
  }

  .homepage-autoplay-video.hide-chrome::-webkit-media-controls {
    display: none !important;
  }

  .homepage-autoplay-video.hide-chrome::-webkit-media-controls-enclosure {
    display: none !important;
  }

  .homepage-autoplay-video.hide-chrome::-webkit-media-controls-start-playback-button {
    display: none !important;
    -webkit-appearance: none;
  }
</style>
