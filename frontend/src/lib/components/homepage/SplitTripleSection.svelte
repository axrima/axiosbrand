<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { HomepageSection, CardItem } from '$lib/api/homepage.api';
  import BlurredImage from '$lib/components/BlurredImage.svelte';
  import HomepageAutoplayVideo from '$lib/components/homepage/HomepageAutoplayVideo.svelte';
  import HomepageInlineMediaDropzone from '$lib/components/homepage/HomepageInlineMediaDropzone.svelte';
  import RevealSection from '$lib/components/homepage/RevealSection.svelte';
  import { t } from '$lib/utils/i18n';

  const dispatch = createEventDispatcher<{
    assetReplace: {
      sectionId: string;
      field: string;
      file: File;
    };
  }>();

  export let section: HomepageSection | null = null;
  export let inlineEditing = false;

  $: config = (section?.config || {}) as Record<string, unknown>;
  $: imageUrl = (config.imageUrl as string) || '';
  $: videoUrl = (config.videoUrl as string) || '';
  $: cards = (config.cards as CardItem[]) || [];
  $: gridColumns = (config.gridColumns as string) || 'grid-cols-1 sm:grid-cols-2';
  $: gap = (config.gap as string) || 'gap-4';
  $: videoLoop = config.videoLoop !== undefined ? !!config.videoLoop : true;
  $: videoAutoplay = config.videoAutoplay !== undefined ? !!config.videoAutoplay : true;
  $: videoMuted = config.videoMuted !== undefined ? !!config.videoMuted : true;
  $: videoControls = config.videoControls !== undefined ? !!config.videoControls : false;
  $: videoPlaysinline = config.videoPlaysinline !== undefined ? !!config.videoPlaysinline : true;
  $: title = section?.title || '';
  $: buttonText = (config.buttonText as string) || '';
  $: buttonLink = (config.buttonLink as string) || '';
  $: mediaAspectRatio = (config.mediaAspectRatio as string) || 'auto';
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
          : mediaAspectRatio === '16:9'
            ? 'aspect-video'
            : mediaAspectRatio === '9:16'
              ? 'aspect-[9/16]'
              : '';
  $: mediaHoverClass =
    mediaHoverEffect === 'none'
      ? ''
      : mediaHoverEffect === 'dim'
        ? 'motion-safe:transition-all motion-safe:duration-300 group-hover:brightness-75'
        : 'motion-safe:transition-transform motion-safe:duration-500 group-hover:scale-[1.03]';
  $: overlayPosClass =
    titleOverlayPosition === 'top'
      ? 'items-start pt-6'
      : titleOverlayPosition === 'bottom'
        ? 'items-end pb-6'
        : 'items-center';
  $: linkOverlayClass =
    mediaLinkMode === 'always'
      ? 'opacity-100'
      : mediaLinkMode === 'hover'
        ? 'opacity-0 group-hover:opacity-100 motion-safe:transition-opacity motion-safe:duration-300'
        : 'hidden';

  /** Equal-width photo / video on desktop; center column only when cards exist */
  $: hasCards = cards.length > 0;
  $: desktopLayoutClass = hasCards
    ? 'lg:grid lg:grid-cols-[minmax(0,1fr)_minmax(18rem,28rem)_minmax(0,1fr)]'
    : 'lg:grid lg:grid-cols-2';
  $: mediaColClass =
    'relative w-screen max-w-[100vw] left-1/2 -translate-x-1/2 sm:w-full sm:max-w-none sm:left-0 sm:translate-x-0 shrink-0 min-h-[min(48vh,520px)] lg:min-h-0 lg:w-auto lg:max-w-none lg:left-0 lg:translate-x-0 lg:min-w-0';

  function emitAssetReplace(field: string, file: File) {
    if (!section) return;
    dispatch('assetReplace', { sectionId: section.id, field, file });
  }
</script>

{#if section?.isActive && (imageUrl || videoUrl || cards.length > 0)}
  <section class="bg-white overflow-hidden">
    <RevealSection wrapperClass="w-full">
      <div class="flex flex-col {desktopLayoutClass} lg:min-h-[min(85vh,960px)] lg:items-stretch">
        <!-- Desktop: photo | cards | video. Mobile: cards → photo → video -->
        {#if imageUrl}
          <div class="{mediaColClass} h-full order-2 lg:order-1 {aspectClass} lg:aspect-auto">
            <div class="absolute inset-0 group overflow-hidden">
              <BlurredImage
                src={imageUrl}
                alt=""
                className={`w-full h-full object-cover ${mediaHoverClass}`}
                eager={false}
                fetchPriority="low"
                sizes="(max-width: 1024px) 100vw, 33vw"
              />
              <HomepageInlineMediaDropzone
                enabled={inlineEditing}
                accept="image/*"
                label={t('homepage.editor.leftImage')}
                hint={t('homepage.editor.replaceImage')}
                on:select={(event) => emitAssetReplace('config.imageUrl', event.detail)}
              />
              {#if titleOverlayOnMedia && title}
                <div class="absolute inset-0 pointer-events-none bg-black/20"></div>
                <div class="absolute inset-0 flex justify-center px-6 {overlayPosClass}">
                  <h3
                    class="text-white text-xl sm:text-2xl lg:text-3xl font-semibold text-center drop-shadow"
                  >
                    {title}
                  </h3>
                </div>
              {/if}
              {#if buttonLink && buttonText && mediaLinkMode !== 'none'}
                <a
                  href={buttonLink}
                  class="absolute left-1/2 -translate-x-1/2 bottom-5 bg-white/90 text-black text-xs sm:text-sm font-semibold px-4 py-2 hover:bg-white motion-safe:transition-colors {linkOverlayClass}"
                >
                  {buttonText}
                </a>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Center: cards (column omitted when empty so photo/video stay equal 50/50) -->
        {#if hasCards}
          <div
            class="w-full flex flex-col justify-center px-4 sm:px-6 py-10 lg:py-14 order-1 lg:order-2 shrink-0 min-w-0 z-[1]"
          >
            <div class="grid {gridColumns} {gap}">
              {#each cards as card, index}
                {#if card.link && !inlineEditing}
                  <a href={card.link} class="group block">
                    <div
                      class="relative overflow-hidden {card.borderRadius === '' ||
                      card.borderRadius === 'rounded-none'
                        ? 'rounded-none'
                        : card.borderRadius || 'rounded-lg'} aspect-[4/5]"
                    >
                      {#if card.videoUrl}
                        <HomepageAutoplayVideo
                          src={card.videoUrl}
                          poster={card.imageUrl || ''}
                          autoplay
                          loop
                          muted
                          playsinline
                          className="w-full h-full object-cover motion-safe:transition-transform motion-safe:duration-500 group-hover:scale-[1.03]"
                          preload="metadata"
                          ariaLabel={card.title || `Card ${index + 1}`}
                        />
                      {:else if card.imageUrl}
                        <BlurredImage
                          src={card.imageUrl}
                          alt={card.title || `Card ${index + 1}`}
                          className="w-full h-full object-cover motion-safe:transition-transform motion-safe:duration-500 group-hover:scale-[1.03]"
                          eager={false}
                          fetchPriority="low"
                          sizes="(max-width: 640px) 50vw, 25vw"
                        />
                      {/if}
                      {#if card.title}
                        <div
                          class="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 motion-safe:transition-opacity motion-safe:duration-300"
                        ></div>
                        <div
                          class="absolute inset-0 flex items-center justify-center p-4 pointer-events-none {card.showTitleOnHover
                            ? 'opacity-0 group-hover:opacity-100 motion-safe:transition-opacity motion-safe:duration-300'
                            : 'opacity-100'}"
                        >
                          <h3
                            class="text-base sm:text-lg font-medium text-center px-2"
                            style="color: {card.titleColor || '#ffffff'}"
                          >
                            {card.title}
                          </h3>
                        </div>
                      {/if}
                    </div>
                  </a>
                {:else}
                  <div class="group block">
                    <div
                      class="relative overflow-hidden {card.borderRadius === '' ||
                      card.borderRadius === 'rounded-none'
                        ? 'rounded-none'
                        : card.borderRadius || 'rounded-lg'} aspect-[4/5]"
                    >
                      {#if card.videoUrl}
                        <HomepageAutoplayVideo
                          src={card.videoUrl}
                          poster={card.imageUrl || ''}
                          autoplay
                          loop
                          muted
                          playsinline
                          className="w-full h-full object-cover motion-safe:transition-transform motion-safe:duration-500 group-hover:scale-[1.03]"
                          preload="metadata"
                          ariaLabel={card.title || `Card ${index + 1}`}
                        />
                        <HomepageInlineMediaDropzone
                          enabled={inlineEditing}
                          accept="video/*"
                          label={t('homepage.editor.cardVideoLabel', { number: index + 1 })}
                          hint={t('homepage.editor.replaceVideo')}
                          on:select={(event) =>
                            emitAssetReplace(`config.cards.${index}.videoUrl`, event.detail)}
                        />
                      {:else if card.imageUrl}
                        <BlurredImage
                          src={card.imageUrl}
                          alt={card.title || `Card ${index + 1}`}
                          className="w-full h-full object-cover motion-safe:transition-transform motion-safe:duration-500 group-hover:scale-[1.03]"
                          eager={false}
                          fetchPriority="low"
                          sizes="(max-width: 640px) 50vw, 25vw"
                        />
                        <HomepageInlineMediaDropzone
                          enabled={inlineEditing}
                          accept="image/*,video/*"
                          label={t('homepage.editor.cardMediaLabel', { number: index + 1 })}
                          hint={t('homepage.editor.replaceMedia')}
                          on:select={(event) =>
                            emitAssetReplace(
                              `config.cards.${index}.${event.detail.type.startsWith('video/') ? 'videoUrl' : 'imageUrl'}`,
                              event.detail
                            )}
                        />
                      {:else if inlineEditing}
                        <div
                          class="flex h-full min-h-[12rem] items-center justify-center bg-neutral-100 text-sm text-neutral-500"
                        >
                          {t('homepage.editor.dropImageOrVideo')}
                        </div>
                        <HomepageInlineMediaDropzone
                          enabled={inlineEditing}
                          accept="image/*,video/*"
                          label={t('homepage.editor.cardMediaLabel', { number: index + 1 })}
                          hint={t('homepage.editor.addMedia')}
                          on:select={(event) =>
                            emitAssetReplace(
                              `config.cards.${index}.${event.detail.type.startsWith('video/') ? 'videoUrl' : 'imageUrl'}`,
                              event.detail
                            )}
                        />
                      {/if}
                      {#if card.title}
                        <div
                          class="absolute inset-0 bg-black/35 opacity-0 group-hover:opacity-100 motion-safe:transition-opacity motion-safe:duration-300"
                        ></div>
                        <div
                          class="absolute inset-0 flex items-center justify-center p-4 pointer-events-none {card.showTitleOnHover
                            ? 'opacity-0 group-hover:opacity-100 motion-safe:transition-opacity motion-safe:duration-300'
                            : 'opacity-100'}"
                        >
                          <h3
                            class="text-base sm:text-lg font-medium text-center px-2"
                            style="color: {card.titleColor || '#ffffff'}"
                          >
                            {card.title}
                          </h3>
                        </div>
                      {/if}
                    </div>
                  </div>
                {/if}
              {/each}
            </div>
          </div>
        {/if}

        <!-- Right: video (same flex basis as photo — no 50vw bleed so the pair stays centered) -->
        {#if videoUrl}
          <div class="{mediaColClass} h-full order-3 lg:order-3 {aspectClass} lg:aspect-auto">
            <div class="absolute inset-0 group overflow-hidden">
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
                label={t('homepage.editor.rightVideo')}
                hint={t('homepage.editor.replaceVideo')}
                on:select={(event) => emitAssetReplace('config.videoUrl', event.detail)}
              />
              {#if titleOverlayOnMedia && title}
                <div class="absolute inset-0 pointer-events-none bg-black/20"></div>
                <div class="absolute inset-0 flex justify-center px-6 {overlayPosClass}">
                  <h3
                    class="text-white text-xl sm:text-2xl lg:text-3xl font-semibold text-center drop-shadow"
                  >
                    {title}
                  </h3>
                </div>
              {/if}
              {#if buttonLink && buttonText && mediaLinkMode !== 'none'}
                <a
                  href={buttonLink}
                  class="absolute left-1/2 -translate-x-1/2 bottom-5 bg-white/90 text-black text-xs sm:text-sm font-semibold px-4 py-2 hover:bg-white motion-safe:transition-colors {linkOverlayClass}"
                >
                  {buttonText}
                </a>
              {/if}
            </div>
          </div>
        {/if}
      </div>
    </RevealSection>
  </section>
{/if}
