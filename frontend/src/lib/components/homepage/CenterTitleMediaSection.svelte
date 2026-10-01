<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { HomepageSection } from '$lib/api/homepage.api';
  import BlurredImage from '$lib/components/BlurredImage.svelte';
  import HomepageAutoplayVideo from '$lib/components/homepage/HomepageAutoplayVideo.svelte';
  import HomepageInlineEditable from '$lib/components/homepage/HomepageInlineEditable.svelte';
  import HomepageInlineMediaDropzone from '$lib/components/homepage/HomepageInlineMediaDropzone.svelte';
  import RevealSection from '$lib/components/homepage/RevealSection.svelte';
  import { t } from '$lib/utils/i18n';

  const dispatch = createEventDispatcher<{
    inlineEdit: {
      sectionId: string;
      field: 'title' | 'config.buttonText';
      value: string;
    };
    assetReplace: {
      sectionId: string;
      field: 'config.imageUrl' | 'config.videoUrl';
      file: File;
    };
  }>();

  export let section: HomepageSection | null = null;
  export let inlineEditing = false;

  $: config = (section?.config || {}) as Record<string, unknown>;
  $: imageUrl = (config.imageUrl as string) || '';
  $: videoUrl = (config.videoUrl as string) || '';
  $: videoLoop = config.videoLoop !== undefined ? !!config.videoLoop : true;
  $: videoAutoplay = config.videoAutoplay !== undefined ? !!config.videoAutoplay : true;
  $: videoMuted = config.videoMuted !== undefined ? !!config.videoMuted : true;
  $: videoControls = config.videoControls !== undefined ? !!config.videoControls : false;
  $: videoPlaysinline = config.videoPlaysinline !== undefined ? !!config.videoPlaysinline : true;
  $: title = typeof section?.title === 'string' ? section.title.trim() : '';
  $: buttonText = (config.buttonText as string) || '';
  $: buttonLink = (config.buttonLink as string) || '';
  $: mediaAspectRatio = (config.mediaAspectRatio as string) || '16:9';
  $: mediaHoverEffect = (config.mediaHoverEffect as string) || 'zoom';
  $: mediaLinkMode = (config.mediaLinkMode as string) || 'hover';
  $: titleOverlayOnMedia = config.titleOverlayOnMedia === true;
  $: titleOverlayPosition = (config.titleOverlayPosition as string) || 'center';
  $: aspectClass =
    mediaAspectRatio === '1:1'
      ? 'aspect-square'
      : mediaAspectRatio === '4:5'
        ? 'aspect-[4/5]'
        : mediaAspectRatio === '3:4'
          ? 'aspect-[3/4]'
          : mediaAspectRatio === '9:16'
            ? 'aspect-[9/16]'
            : mediaAspectRatio === 'auto'
              ? ''
              : 'aspect-video';
  $: mediaHoverClass =
    mediaHoverEffect === 'none'
      ? ''
      : mediaHoverEffect === 'dim'
        ? 'motion-safe:transition-all motion-safe:duration-300 group-hover:brightness-75'
        : 'motion-safe:transition-transform motion-safe:duration-500 group-hover:scale-[1.03]';
  $: overlayPosClass =
    titleOverlayPosition === 'top'
      ? 'items-start pt-8'
      : titleOverlayPosition === 'bottom'
        ? 'items-end pb-8'
        : 'items-center';
  $: linkOverlayClass =
    mediaLinkMode === 'always'
      ? 'opacity-100'
      : mediaLinkMode === 'hover'
        ? 'opacity-0 group-hover:opacity-100 motion-safe:transition-opacity motion-safe:duration-300'
        : 'hidden';

  function emitInlineEdit(field: 'title' | 'config.buttonText', value: string) {
    if (!section) return;
    dispatch('inlineEdit', { sectionId: section.id, field, value });
  }

  function emitAssetReplace(field: 'config.imageUrl' | 'config.videoUrl', file: File) {
    if (!section) return;
    dispatch('assetReplace', { sectionId: section.id, field, file });
  }
</script>

{#if section?.isActive && (title || imageUrl || videoUrl)}
  <section class="bg-white">
    <div class="container-custom py-14 sm:py-20">
      <RevealSection>
        {#if (title || inlineEditing) && !titleOverlayOnMedia}
          <h2
            class="text-3xl sm:text-4xl md:text-5xl font-semibold text-center mb-10 md:mb-14 tracking-tight text-balance max-w-4xl mx-auto"
          >
            <HomepageInlineEditable
              tag="span"
              value={title}
              enabled={inlineEditing}
              placeholder={t('homepage.editor.sectionTitle')}
              on:change={(event) => emitInlineEdit('title', event.detail)}
            />
          </h2>
        {/if}

        {#if videoUrl}
          <div
            class="relative w-full max-w-6xl mx-auto overflow-hidden bg-neutral-100 group {aspectClass}"
          >
            <HomepageAutoplayVideo
              src={videoUrl}
              poster={imageUrl}
              autoplay={videoAutoplay}
              loop={videoLoop}
              muted={videoMuted}
              controls={videoControls}
              playsinline={videoPlaysinline}
              className={`w-full h-full object-cover ${mediaHoverClass}`}
              preload="auto"
              ariaLabel={title || 'Homepage video'}
            />
            <HomepageInlineMediaDropzone
              enabled={inlineEditing}
              accept="video/*"
              label={t('homepage.editor.sectionVideo')}
              hint={t('homepage.editor.replaceVideo')}
              on:select={(event) => emitAssetReplace('config.videoUrl', event.detail)}
            />
            {#if titleOverlayOnMedia && (title || inlineEditing)}
              <div class="absolute inset-0 pointer-events-none bg-black/20"></div>
              <div class="absolute inset-0 flex justify-center px-6 {overlayPosClass}">
                <h2 class="text-2xl sm:text-4xl font-semibold text-center text-white drop-shadow">
                  <HomepageInlineEditable
                    tag="span"
                    value={title}
                    enabled={inlineEditing}
                    placeholder={t('homepage.editor.sectionTitle')}
                    on:change={(event) => emitInlineEdit('title', event.detail)}
                  />
                </h2>
              </div>
            {/if}
            {#if (buttonLink && buttonText && mediaLinkMode !== 'none') || inlineEditing}
              {#if inlineEditing}
                <div
                  class="absolute left-1/2 -translate-x-1/2 bottom-6 bg-white/90 text-black text-xs sm:text-sm font-semibold px-4 py-2 hover:bg-white motion-safe:transition-colors {linkOverlayClass}"
                >
                  <HomepageInlineEditable
                    tag="span"
                    value={buttonText}
                    enabled={true}
                    placeholder={t('homepage.editor.buttonText')}
                    on:change={(event) => emitInlineEdit('config.buttonText', event.detail)}
                  />
                </div>
              {:else if buttonLink && buttonText && mediaLinkMode !== 'none'}
                <a
                  href={buttonLink}
                  class="absolute left-1/2 -translate-x-1/2 bottom-6 bg-white/90 text-black text-xs sm:text-sm font-semibold px-4 py-2 hover:bg-white motion-safe:transition-colors {linkOverlayClass}"
                >
                  {buttonText}
                </a>
              {/if}
            {/if}
          </div>
        {:else if imageUrl}
          <div class="relative w-full max-w-6xl mx-auto overflow-hidden group {aspectClass}">
            <BlurredImage
              src={imageUrl}
              alt=""
              className={`w-full h-full object-cover ${mediaHoverClass}`}
              eager={false}
              fetchPriority="low"
              sizes="(max-width: 768px) 100vw, min(1152px, 90vw)"
            />
            <HomepageInlineMediaDropzone
              enabled={inlineEditing}
              accept="image/*"
              label={t('homepage.editor.sectionImage')}
              hint={t('homepage.editor.replaceImage')}
              on:select={(event) => emitAssetReplace('config.imageUrl', event.detail)}
            />
            {#if titleOverlayOnMedia && (title || inlineEditing)}
              <div class="absolute inset-0 pointer-events-none bg-black/20"></div>
              <div class="absolute inset-0 flex justify-center px-6 {overlayPosClass}">
                <h2 class="text-2xl sm:text-4xl font-semibold text-center text-white drop-shadow">
                  <HomepageInlineEditable
                    tag="span"
                    value={title}
                    enabled={inlineEditing}
                    placeholder={t('homepage.editor.sectionTitle')}
                    on:change={(event) => emitInlineEdit('title', event.detail)}
                  />
                </h2>
              </div>
            {/if}
            {#if (buttonLink && buttonText && mediaLinkMode !== 'none') || inlineEditing}
              {#if inlineEditing}
                <div
                  class="absolute left-1/2 -translate-x-1/2 bottom-6 bg-white/90 text-black text-xs sm:text-sm font-semibold px-4 py-2 hover:bg-white motion-safe:transition-colors {linkOverlayClass}"
                >
                  <HomepageInlineEditable
                    tag="span"
                    value={buttonText}
                    enabled={true}
                    placeholder={t('homepage.editor.buttonText')}
                    on:change={(event) => emitInlineEdit('config.buttonText', event.detail)}
                  />
                </div>
              {:else if buttonLink && buttonText && mediaLinkMode !== 'none'}
                <a
                  href={buttonLink}
                  class="absolute left-1/2 -translate-x-1/2 bottom-6 bg-white/90 text-black text-xs sm:text-sm font-semibold px-4 py-2 hover:bg-white motion-safe:transition-colors {linkOverlayClass}"
                >
                  {buttonText}
                </a>
              {/if}
            {/if}
          </div>
        {/if}
      </RevealSection>
    </div>
  </section>
{/if}
