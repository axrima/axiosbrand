<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import type { HomepageSection } from '$lib/api/homepage.api';
  import BlurredImage from '$lib/components/BlurredImage.svelte';
  import HomepageAutoplayVideo from '$lib/components/homepage/HomepageAutoplayVideo.svelte';
  import HomepageInlineEditable from '$lib/components/homepage/HomepageInlineEditable.svelte';
  import HomepageInlineMediaDropzone from '$lib/components/homepage/HomepageInlineMediaDropzone.svelte';
  import { t } from '$lib/utils/i18n';

  const dispatch = createEventDispatcher<{
    inlineEdit: {
      sectionId: string;
      field: 'title' | 'config.description' | 'config.buttonText';
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

  const defaultConfig = {
    title: '',
    subtitle: '',
    buttonText: 'Shop Now',
    buttonLink: '/shop',
    imageUrl: '',
  };

  $: config = section?.config || defaultConfig;
  $: configAny = config as Record<string, any>;

  // Design settings with defaults
  $: backgroundColor = configAny.backgroundColor || 'bg-white';
  $: textColor = configAny.textColor || '';
  $: buttonColor = configAny.buttonColor || '';
  $: buttonTextColor = configAny.buttonTextColor || '';
  $: titleSize = configAny.titleSize || 'text-7xl md:text-9xl';
  $: subtitleSize = configAny.subtitleSize || 'text-2xl md:text-3xl';
  $: paddingTop = configAny.paddingTop || '';
  $: paddingBottom = configAny.paddingBottom || '';
  $: textAlign = configAny.textAlign || 'center';
  $: imageOpacity = configAny.imageOpacity || '50';
  $: sectionHeight = configAny.sectionHeight || 'h-screen';
  $: overlayColor = configAny.overlayColor || '';
  $: overlayOpacity = configAny.overlayOpacity || '0';
  $: videoUrl = configAny.videoUrl;
  // Video settings
  $: videoLoop = configAny.videoLoop !== undefined ? configAny.videoLoop : true;
  $: videoAutoplay = configAny.videoAutoplay !== undefined ? configAny.videoAutoplay : true;
  $: videoMuted = configAny.videoMuted !== undefined ? configAny.videoMuted : true;
  $: videoControls = configAny.videoControls !== undefined ? configAny.videoControls : false;
  $: videoPlaysinline =
    configAny.videoPlaysinline !== undefined ? configAny.videoPlaysinline : true;
  $: description = typeof configAny.description === 'string' ? configAny.description : '';
  $: buttonText = typeof configAny.buttonText === 'string' ? configAny.buttonText : '';
  $: buttonLink = typeof configAny.buttonLink === 'string' ? configAny.buttonLink : '';
  $: secondaryButtonText = configAny.secondaryButtonText;
  $: secondaryButtonLink = configAny.secondaryButtonLink;
  $: heroTitle = typeof section?.title === 'string' ? section.title.trim() : '';
  $: heroDescription = String(description || configAny.subtitle || '');

  function emitInlineEdit(
    field: 'title' | 'config.description' | 'config.buttonText',
    value: string
  ) {
    if (!section) return;
    dispatch('inlineEdit', { sectionId: section.id, field, value });
  }

  function emitAssetReplace(field: 'config.imageUrl' | 'config.videoUrl', file: File) {
    if (!section) return;
    dispatch('assetReplace', { sectionId: section.id, field, file });
  }

  // Style objects
  $: sectionStyle = {
    backgroundColor:
      backgroundColor && backgroundColor !== 'bg-white' && !backgroundColor.startsWith('bg-')
        ? backgroundColor
        : undefined,
    minHeight: sectionHeight === 'h-screen' ? '100vh' : undefined,
    height:
      sectionHeight && sectionHeight !== 'h-screen' && sectionHeight !== 'min-h-screen'
        ? sectionHeight.replace('h-', '').replace('[', '').replace(']', '')
        : undefined,
  };

  $: textStyle = {
    color: textColor || undefined,
  };

  $: buttonStyle = {
    backgroundColor: buttonColor || undefined,
    color: buttonTextColor || undefined,
  };

  $: overlayStyle = overlayColor
    ? {
        backgroundColor: overlayColor,
        opacity: `${parseInt(overlayOpacity) / 100}`,
      }
    : {};

  $: bgClass = backgroundColor.startsWith('bg-') ? backgroundColor : '';
  $: sectionStyleStr = Object.entries(sectionStyle)
    .filter(([_, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
  $: textStyleStr = Object.entries(textStyle)
    .filter(([_, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
  $: buttonStyleStr = Object.entries(buttonStyle)
    .filter(([_, v]) => v)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
  $: overlayStyleStr = Object.entries(overlayStyle)
    .map(([k, v]) => `${k}: ${v}`)
    .join('; ');
</script>

{#if section?.isActive}
  <section
    class="relative {sectionHeight} flex items-center justify-center {bgClass} overflow-hidden {paddingTop} {paddingBottom}"
    style={sectionStyleStr}
  >
    {#if config.imageUrl && !(videoUrl && videoUrl.length > 0)}
      <!-- Image-only hero: skip BlurredImage when video uses the same still as poster. -->
      <div
        class="absolute inset-0 w-full h-full overflow-hidden"
        style="opacity: {parseInt(imageOpacity) / 100}"
      >
        <BlurredImage
          src={config.imageUrl}
          alt={heroTitle || 'Hero'}
          className="w-full h-full object-cover"
          style="position: absolute; inset: 0;"
          eager={true}
          sizes="100vw"
        />
        <HomepageInlineMediaDropzone
          enabled={inlineEditing}
          accept="image/*"
          label={t('homepage.editor.backgroundImage')}
          hint={t('homepage.editor.replaceImage')}
          on:select={(event) => emitAssetReplace('config.imageUrl', event.detail)}
        />
      </div>
    {/if}

    {#if videoUrl && videoUrl.length > 0}
      <div class="absolute inset-0">
        <HomepageAutoplayVideo
          src={videoUrl}
          poster={config.imageUrl || ''}
          autoplay={videoAutoplay}
          loop={videoLoop}
          muted={videoMuted}
          controls={videoControls}
          playsinline={videoPlaysinline}
          className="absolute inset-0 w-full h-full object-cover"
          style="opacity: {parseInt(imageOpacity) / 100}"
          preload="auto"
          ariaLabel={heroTitle || 'Hero video'}
          posterPriority="high"
        />
        <HomepageInlineMediaDropzone
          enabled={inlineEditing}
          accept="video/*"
          label={t('homepage.editor.backgroundVideo')}
          hint={t('homepage.editor.replaceVideo')}
          on:select={(event) => emitAssetReplace('config.videoUrl', event.detail)}
        />
        {#if inlineEditing}
          <HomepageInlineMediaDropzone
            enabled={inlineEditing}
            accept="image/*"
            label={t('homepage.editor.backgroundImage')}
            hint={t('homepage.editor.replaceImage')}
            on:select={(event) => emitAssetReplace('config.imageUrl', event.detail)}
          />
        {/if}
      </div>
    {/if}

    {#if overlayColor && parseInt(overlayOpacity) > 0}
      <div class="absolute inset-0 z-5" style={overlayStyleStr}></div>
    {/if}

    <div class="relative z-10 text-{textAlign}" style={textStyleStr}>
      {#if heroTitle || inlineEditing}
        <h1 class="{titleSize} font-bold mb-6" style={textStyleStr}>
          <HomepageInlineEditable
            tag="span"
            value={heroTitle}
            enabled={inlineEditing}
            placeholder={t('homepage.editor.heroTitle')}
            on:change={(event) => emitInlineEdit('title', event.detail)}
          />
        </h1>
      {/if}
      {#if heroDescription || inlineEditing}
        <p class="{subtitleSize} text-accent-muted mb-8" style={textStyleStr}>
          <HomepageInlineEditable
            tag="span"
            value={heroDescription}
            enabled={inlineEditing}
            placeholder={t('homepage.editor.heroDescription')}
            on:change={(event) => emitInlineEdit('config.description', event.detail)}
          />
        </p>
      {/if}
      {#if buttonText || inlineEditing}
        <div
          class="flex items-center {textAlign === 'center'
            ? 'justify-center'
            : textAlign === 'right'
              ? 'justify-end'
              : 'justify-start'} space-x-4"
        >
          {#if inlineEditing}
            <div
              class="px-8 py-4 {!buttonColor
                ? 'bg-accent text-white'
                : ''} font-medium hover:opacity-90 transition-opacity"
              style={buttonStyleStr}
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
              class="inline-flex px-8 py-4 {!buttonColor
                ? 'bg-accent text-white'
                : ''} font-medium hover:opacity-90 transition-opacity"
              style={buttonStyleStr}
            >
              {buttonText}
            </a>
          {/if}
          {#if secondaryButtonText}
            <a
              href={secondaryButtonLink || '/lookbook'}
              class="px-8 py-4 border border-accent/20 hover:border-accent/50 transition-colors"
            >
              {secondaryButtonText}
            </a>
          {/if}
        </div>
      {/if}
    </div>
  </section>
{:else}
  <!-- Default hero if no section -->
  <section class="relative h-screen flex items-center justify-center bg-white">
    <div class="container-custom text-center">
      <h1 class="text-7xl md:text-9xl font-bold mb-6">LOGO</h1>
      <p class="text-2xl md:text-3xl text-accent-muted mb-8">Shop the latest collection</p>
      <div class="flex items-center justify-center space-x-4">
        <a
          href="/shop"
          class="px-8 py-4 bg-accent text-white font-medium hover:bg-accent-muted transition-colors"
        >
          Shop Now
        </a>
        <a
          href="/lookbook"
          class="px-8 py-4 border border-accent/20 hover:border-accent/50 transition-colors"
        >
          View Lookbook
        </a>
      </div>
    </div>
  </section>
{/if}
