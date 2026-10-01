<script lang="ts">
  import { createEventDispatcher, onDestroy, onMount } from 'svelte';
  import { authStore } from '$lib/stores/auth.store';
  import { settingsStore } from '$lib/stores/settings.store';
  import {
    acquireCatalogImageSlot,
    releaseCatalogImageSlot,
  } from '$lib/utils/catalog-image-queue';
  import type { MediaLoadStatus } from '$lib/utils/image.utils';
  import {
    buildStorefrontImageSrcSet,
    isProxiedStorefrontMedia,
    resolveStorefrontMediaSrc,
  } from '$lib/utils/media-url';

  export let src: string;
  export let alt: string = '';
  export let className: string = '';
  export let style: string = '';
  export let loading: 'lazy' | 'eager' = 'lazy';
  export let eager: boolean = false;
  export let fetchPriority: 'high' | 'low' | 'auto' = 'auto';
  export let decoding: 'sync' | 'async' | 'auto' = 'async';
  /** Hint for responsive optimized WebP (`uuid.webp` + `uuid-800.webp`). */
  export let sizes: string = '(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 800px';
  /** Throttle direct S3 fetches when same-origin /api/media proxy is unavailable. */
  export let catalogQueue: boolean = false;
  export let catalogQueuePriority: 'high' | 'normal' = 'normal';

  const dispatch = createEventDispatcher<{
    loadstatechange: {
      src: string;
      status: 'idle' | 'loading' | 'loaded' | 'error';
    };
  }>();

  const VIDEO_EXT = /\.(mp4|webm|mov|ogg)(\?|#|$)/i;
  const LOAD_TIMEOUT_MS = 25_000;

  $: mediaSrc = resolveStorefrontMediaSrc(src);
  $: mediaSrcSet = buildStorefrontImageSrcSet(src);
  $: useCatalogQueue = catalogQueue && !isProxiedStorefrontMedia(mediaSrc);
  $: isVideoUrl = typeof mediaSrc === 'string' && VIDEO_EXT.test(mediaSrc);
  $: isAuthenticated = $authStore.isAuthenticated;
  $: blurEnabled = $settingsStore.imageBlurEnabled ?? false;
  $: shouldBlur = blurEnabled && !isAuthenticated;
  $: isBlurred = shouldBlur;
  $: effectiveLoading = eager ? 'eager' : loading;
  $: imageFetchPriority = eager && fetchPriority === 'auto' ? 'high' : fetchPriority;

  let root: HTMLDivElement | null = null;
  let isVisible = false;
  let hasQueueSlot = false;
  let hasLoaded = false;
  let hasErrored = false;
  let displaySrc = '';
  let observer: IntersectionObserver | null = null;
  let lastSrc = '';
  let loadTimeoutId: ReturnType<typeof setTimeout> | null = null;

  $: if (src !== lastSrc) {
    lastSrc = src;
    hasLoaded = false;
    hasErrored = false;
    displaySrc = '';
    clearLoadTimeout();
    releaseSlot();
  }

  $: if (!useCatalogQueue) {
    displaySrc = mediaSrc;
  } else if ((hasLoaded || hasErrored) && mediaSrc) {
    displaySrc = mediaSrc;
  } else if (isVisible && hasQueueSlot && mediaSrc) {
    displaySrc = mediaSrc;
  } else if (!mediaSrc) {
    displaySrc = '';
  }

  function getLoadStatus(): MediaLoadStatus {
    if (!src) return 'idle';
    if (hasLoaded) return 'loaded';
    if (hasErrored) return 'error';
    if (displaySrc) return 'loading';
    return 'idle';
  }

  $: dispatch('loadstatechange', { src, status: getLoadStatus() });

  function clearLoadTimeout() {
    if (loadTimeoutId !== null) {
      clearTimeout(loadTimeoutId);
      loadTimeoutId = null;
    }
  }

  function startLoadTimeout() {
    clearLoadTimeout();
    if (!useCatalogQueue || !displaySrc) return;

    loadTimeoutId = setTimeout(() => {
      if (!hasLoaded && !hasErrored) {
        hasErrored = true;
        releaseSlot();
        dispatch('loadstatechange', { src, status: 'error' });
      }
    }, LOAD_TIMEOUT_MS);
  }

  function releaseSlot() {
    if (!hasQueueSlot) return;
    hasQueueSlot = false;
    releaseCatalogImageSlot();
  }

  async function requestSlot() {
    if (hasQueueSlot || hasLoaded || hasErrored || !useCatalogQueue || !isVisible || !mediaSrc) {
      return;
    }

    await acquireCatalogImageSlot(catalogQueuePriority);
    if (!useCatalogQueue || !isVisible || !mediaSrc || hasLoaded || hasErrored) {
      releaseCatalogImageSlot();
      return;
    }

    hasQueueSlot = true;
  }

  $: if (useCatalogQueue && isVisible && mediaSrc && !hasQueueSlot && !hasLoaded && !hasErrored) {
    void requestSlot();
  }

  $: if (!isVisible && useCatalogQueue && hasQueueSlot && !hasLoaded && !hasErrored) {
    releaseSlot();
    displaySrc = '';
  }

  $: if (displaySrc && useCatalogQueue && !hasLoaded && !hasErrored) {
    startLoadTimeout();
  }

  function handleImageClick() {
    if (shouldBlur && !$authStore.isAuthenticated) {
      const currentPath = window.location.pathname + window.location.search;
      window.location.href = `/login?returnUrl=${encodeURIComponent(currentPath)}`;
    }
  }

  function handleLoad() {
    clearLoadTimeout();
    hasLoaded = true;
    releaseSlot();
    dispatch('loadstatechange', {
      src,
      status: 'loaded',
    });
  }

  function handleError() {
    clearLoadTimeout();
    hasErrored = true;
    releaseSlot();
    dispatch('loadstatechange', {
      src,
      status: 'error',
    });
    console.error('Failed to load image:', mediaSrc);
  }

  onMount(() => {
    if (!useCatalogQueue || !root) return;

    observer = new IntersectionObserver(
      (entries) => {
        isVisible = entries.some((entry) => entry.isIntersecting);
      },
      { rootMargin: '250px 0px', threshold: 0.01 }
    );
    observer.observe(root);
  });

  onDestroy(() => {
    observer?.disconnect();
    observer = null;
    clearLoadTimeout();
    releaseSlot();
  });
</script>

<div
  bind:this={root}
  class="relative w-full h-full overflow-hidden {className}"
  class:blur-container={shouldBlur}
  {style}
  on:click={handleImageClick}
  role={shouldBlur ? 'button' : 'presentation'}
  {...shouldBlur && { tabindex: 0 }}
  on:keydown={(e) => {
    if (shouldBlur && (e.key === 'Enter' || e.key === ' ')) {
      e.preventDefault();
      handleImageClick();
    }
  }}
>
  {#if isVideoUrl}
    <video
      src={displaySrc}
      class="blurred-media w-full h-full object-cover object-center"
      class:blurred={isBlurred}
      muted
      loop
      playsinline
      autoplay
      draggable="false"
      on:loadeddata={handleLoad}
      on:error={handleError}
      aria-label={alt}
    ></video>
  {:else if displaySrc}
    <img
      src={displaySrc}
      srcset={mediaSrcSet || undefined}
      sizes={mediaSrcSet ? sizes : undefined}
      {alt}
      loading={effectiveLoading}
      fetchpriority={imageFetchPriority}
      {decoding}
      class="blurred-media w-full h-full object-cover object-center"
      class:blurred={isBlurred}
      draggable="false"
      on:load={handleLoad}
      on:error={handleError}
    />
  {/if}

  {#if shouldBlur && !$authStore.isAuthenticated}
    <div
      class="absolute inset-0 flex items-center justify-center bg-black/20 backdrop-blur-sm z-10"
    >
      <div class="text-center px-6 py-4 bg-white/90 backdrop-blur-md rounded-lg shadow-lg">
        <svg
          class="w-12 h-12 mx-auto mb-3 text-black/70"
          fill="none"
          stroke="currentColor"
          viewBox="0 0 24 24"
          stroke-width="1.5"
        >
          <path
            stroke-linecap="round"
            stroke-linejoin="round"
            d="M16.5 10.5V6.75a4.5 4.5 0 10-9 0v3.75m-.75 11.25h10.5a2.25 2.25 0 002.25-2.25v-6.75a2.25 2.25 0 00-2.25-2.25H6.75a2.25 2.25 0 00-2.25 2.25v6.75a2.25 2.25 0 002.25 2.25z"
          />
        </svg>
        <p class="text-sm font-medium text-black/80 mb-1">Sign in to view</p>
        <p class="text-xs text-black/60">Click to login or register</p>
      </div>
    </div>
  {/if}
</div>

<style>
  .blurred {
    filter: blur(20px) brightness(0.7);
    transform: scale(1.1);
  }

  .blur-container {
    cursor: pointer;
  }

  .blur-container:hover .blurred {
    filter: blur(15px) brightness(0.75);
  }

  .blur-container:active .blurred {
    filter: blur(10px) brightness(0.8);
  }
</style>
