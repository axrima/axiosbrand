<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { HomepageSection } from '$lib/api/homepage.api';
  import BlurredImage from '$lib/components/BlurredImage.svelte';
  import HomepageInlineEditable from '$lib/components/homepage/HomepageInlineEditable.svelte';
  import HomepageInlineMediaDropzone from '$lib/components/homepage/HomepageInlineMediaDropzone.svelte';
  import RevealSection from '$lib/components/homepage/RevealSection.svelte';
  import { t } from '$lib/utils/i18n';

  const dispatch = createEventDispatcher<{
    inlineEdit: {
      sectionId: string;
      field: 'title' | 'config.description' | 'config.buttonText';
      value: string;
    };
    assetReplace: {
      sectionId: string;
      field: 'config.imageUrl';
      file: File;
    };
  }>();

  export let section: HomepageSection | null = null;
  /** Image flush to the left or right edge of the viewport on large screens */
  export let imageSide: 'left' | 'right';
  export let inlineEditing = false;

  $: config = (section?.config || {}) as Record<string, unknown>;
  $: imageUrl = (config.imageUrl as string) || '';
  $: description = (config.description as string) || '';
  $: buttonText = (config.buttonText as string) || '';
  $: buttonLink = (config.buttonLink as string) || '';
  $: title = typeof section?.title === 'string' ? section.title.trim() : '';
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

  function emitInlineEdit(
    field: 'title' | 'config.description' | 'config.buttonText',
    value: string
  ) {
    if (!section) return;
    dispatch('inlineEdit', { sectionId: section.id, field, value });
  }

  function emitAssetReplace(file: File) {
    if (!section) return;
    dispatch('assetReplace', { sectionId: section.id, field: 'config.imageUrl', file });
  }
</script>

{#if section?.isActive && imageUrl}
  <section class="bg-white overflow-x-hidden">
    <RevealSection wrapperClass="w-full">
      <div class="flex flex-col lg:flex-row lg:min-h-[min(88vh,920px)] lg:items-stretch">
        <!-- Image: full viewport width on small screens; half viewport on lg (edge bleed). Mobile order: left=image→text, right=text→image -->
        <div
          class="relative min-h-[min(48vh,520px)] lg:min-h-0 lg:w-[50vw] lg:max-w-[50vw] lg:shrink-0
            w-screen max-w-[100vw] left-1/2 -translate-x-1/2 lg:left-0 lg:translate-x-0
            {aspectClass}
            {imageSide === 'right' ? 'order-2 lg:order-2 lg:ml-auto' : 'order-1 lg:order-1'}"
        >
          <div class="absolute inset-0 group overflow-hidden">
            <BlurredImage
              src={imageUrl}
              alt=""
              className={`absolute inset-0 w-full h-full object-cover ${mediaHoverClass}`}
              eager={false}
              fetchPriority="low"
              sizes="(max-width: 1024px) 100vw, 50vw"
            />
            <HomepageInlineMediaDropzone
              enabled={inlineEditing}
              accept="image/*"
              label={t('homepage.editor.sectionImage')}
              hint={t('homepage.editor.replaceImage')}
              on:select={(event) => emitAssetReplace(event.detail)}
            />
            {#if titleOverlayOnMedia && (title || inlineEditing)}
              <div class="absolute inset-0 pointer-events-none bg-black/20"></div>
              <div class="absolute inset-0 flex justify-center px-6 {overlayPosClass}">
                <h3
                  class="text-white text-xl sm:text-2xl lg:text-3xl font-semibold text-center drop-shadow"
                >
                  <HomepageInlineEditable
                    tag="span"
                    value={title}
                    enabled={inlineEditing}
                    placeholder={t('homepage.editor.sectionTitle')}
                    on:change={(event) => emitInlineEdit('title', event.detail)}
                  />
                </h3>
              </div>
            {/if}
            {#if (buttonLink && buttonText && mediaLinkMode !== 'none') || inlineEditing}
              {#if inlineEditing}
                <div
                  class="absolute left-1/2 -translate-x-1/2 bottom-5 bg-white/90 text-black text-xs sm:text-sm font-semibold px-4 py-2 hover:bg-white motion-safe:transition-colors {linkOverlayClass}"
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
                  class="absolute left-1/2 -translate-x-1/2 bottom-5 bg-white/90 text-black text-xs sm:text-sm font-semibold px-4 py-2 hover:bg-white motion-safe:transition-colors {linkOverlayClass}"
                >
                  {buttonText}
                </a>
              {/if}
            {/if}
          </div>
        </div>

        <div
          class="flex flex-col justify-center px-6 sm:px-10 py-14 lg:py-20 max-w-xl lg:max-w-none mx-auto lg:mx-0 w-full min-w-0 {imageSide ===
          'right'
            ? 'order-1 lg:order-1 lg:pl-[max(1.5rem,calc((100vw-80rem)/2))] lg:pr-12'
            : 'order-2 lg:order-2 lg:pr-[max(1.5rem,calc((100vw-80rem)/2))] lg:pl-12'}"
        >
          {#if title || inlineEditing}
            <h2
              class="text-3xl sm:text-4xl lg:text-5xl font-semibold tracking-tight mb-6 text-balance"
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
          {#if description || inlineEditing}
            <HomepageInlineEditable
              tag="div"
              html={true}
              value={description}
              enabled={inlineEditing}
              placeholder={t('homepage.editor.sectionDescription')}
              className="prose prose-neutral max-w-none text-base sm:text-lg leading-relaxed text-gray-800 [&_p]:mb-4"
              on:change={(event) => emitInlineEdit('config.description', event.detail)}
            />
          {/if}
          {#if (buttonText && buttonLink) || inlineEditing}
            {#if inlineEditing}
              <div
                class="inline-flex mt-8 px-8 py-3 bg-black text-white text-sm font-medium tracking-wide hover:bg-gray-800 motion-safe:transition-colors"
              >
                <HomepageInlineEditable
                  tag="span"
                  value={buttonText}
                  enabled={true}
                  placeholder={t('homepage.editor.buttonText')}
                  on:change={(event) => emitInlineEdit('config.buttonText', event.detail)}
                />
              </div>
            {:else if buttonText && buttonLink}
              <a
                href={buttonLink}
                class="inline-flex mt-8 px-8 py-3 bg-black text-white text-sm font-medium tracking-wide hover:bg-gray-800 motion-safe:transition-colors"
              >
                {buttonText}
              </a>
            {/if}
          {/if}
        </div>
      </div>
    </RevealSection>
  </section>
{/if}
