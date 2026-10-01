<script lang="ts">
  import { onMount } from 'svelte';
  import { homepageApi, type HomepageSection } from '$lib/api/homepage.api';
  import { productApi, type Product } from '$lib/api/product.api';
  import HeroSection from '$lib/components/homepage/HeroSection.svelte';
  import CollectionSection from '$lib/components/homepage/CollectionSection.svelte';
  import LookbookPreviewSection from '$lib/components/homepage/LookbookPreviewSection.svelte';
  import CardSection from '$lib/components/homepage/CardSection.svelte';
  import BlogSection from '$lib/components/homepage/BlogSection.svelte';
  import AudioSection from '$lib/components/homepage/AudioSection.svelte';
  import SplitTripleSection from '$lib/components/homepage/SplitTripleSection.svelte';
  import BleedSplitSection from '$lib/components/homepage/BleedSplitSection.svelte';
  import CenterTitleMediaSection from '$lib/components/homepage/CenterTitleMediaSection.svelte';
  import TextBlockSection from '$lib/components/homepage/TextBlockSection.svelte';
  import HomepageSetupPlaceholder from '$lib/components/homepage/HomepageSetupPlaceholder.svelte';
  import HomepageAdminDrawer from '$lib/components/homepage/HomepageAdminDrawer.svelte';
  import HomepageEditableSectionFrame from '$lib/components/homepage/HomepageEditableSectionFrame.svelte';
  import LazyComponent from '$lib/components/LazyComponent.svelte';
  import { uploadHomepageMedia } from '$lib/api/homepage-upload';
  import {
    isAuthenticationError,
    isRateLimitError,
    getErrorMessage,
  } from '$lib/utils/error-handler';
  import AuthError from '$lib/components/AuthError.svelte';
  import { notificationStore } from '$lib/stores/notification.store';
  import { i18nStore } from '$lib/stores/i18n.store';
  import { t } from '$lib/utils/i18n';

  export let initialSections: HomepageSection[] = [];
  export let initialCollectionProductsBySection: Record<string, Product[]> = {};
  export let initialLanguageCode: string | null = null;
  export let initialError: string | null = null;
  const hasInitialData =
    initialLanguageCode !== null ||
    initialSections.length > 0 ||
    Object.keys(initialCollectionProductsBySection).length > 0 ||
    initialError !== null;

  let sections: HomepageSection[] = initialSections;
  let loading = !hasInitialData && !initialError;
  let error: Error | null = initialError ? new Error(initialError) : null;
  let collectionProductsBySection: Record<string, Product[]> = initialCollectionProductsBySection;
  let editorOpen = false;
  let activeEditorSectionId: string | null = null;
  let previewSection: HomepageSection | null = null;

  type InlineEditDetail = {
    sectionId: string;
    field: 'title' | 'config.description' | 'config.buttonText';
    value: string;
  };

  type InlineAssetDetail = {
    sectionId: string;
    field: string;
    file: File;
  };

  $: currentLanguage = $i18nStore;

  $: sortedSections = [...sections].sort((a, b) => a.order - b.order);
  $: renderedSections = (() => {
    const preview = previewSection;
    if (!preview) return sortedSections;
    const existingIndex = sortedSections.findIndex((section) => section.id === preview.id);
    if (existingIndex >= 0) {
      const next = [...sortedSections];
      next[existingIndex] = preview;
      return next.sort((a, b) => a.order - b.order);
    }
    return [...sortedSections, preview].sort((a, b) => a.order - b.order);
  })();
  $: activeSections = renderedSections.filter((s) => s.isActive);
  $: showSetupPlaceholder = !loading && !error && activeSections.length === 0;

  async function loadCollectionProductsForAll(nextSections: HomepageSection[] = sections) {
    const cols = nextSections.filter((s) => s.type === 'collection' && s.isActive);
    const next: Record<string, Product[]> = {};
    await Promise.all(
      cols.map(async (c) => {
        const ids = c.config?.products;
        if (!ids || ids.length === 0) {
          next[c.id] = [];
          return;
        }
        try {
          const productResponses = await Promise.all(
            ids.map((id) =>
              productApi.getById(id).catch((e) => {
                console.error(`Failed to load product ${id}:`, e);
                return null;
              })
            )
          );
          next[c.id] = productResponses
            .filter((response): response is { product: Product } => response !== null)
            .map((response) => response.product);
        } catch (e) {
          console.error('Failed to load collection products:', e);
          next[c.id] = [];
        }
      })
    );
    collectionProductsBySection = next;
  }

  async function handleSectionsUpdated(event: CustomEvent<HomepageSection[]>) {
    sections = event.detail;
    await loadCollectionProductsForAll(event.detail);
  }

  async function handlePreviewChanged(event: CustomEvent<HomepageSection | null>) {
    previewSection = event.detail;
    if (previewSection?.type === 'collection' && previewSection.isActive) {
      await loadCollectionProductsForAll(renderedSections);
      return;
    }
    if (!previewSection) {
      await loadCollectionProductsForAll(sections);
    }
  }

  function handleSectionSelect(event: CustomEvent<{ sectionId: string }>) {
    editorOpen = true;
    activeEditorSectionId = event.detail.sectionId;
  }

  function sectionSupportsVideo(sectionType: HomepageSection['type']) {
    return (
      sectionType === 'hero' ||
      sectionType === 'editorial' ||
      sectionType === 'center_title_media' ||
      sectionType === 'split_triple'
    );
  }

  function sectionSupportsImage(sectionType: HomepageSection['type']) {
    return (
      sectionType === 'hero' ||
      sectionType === 'editorial' ||
      sectionType === 'lookbook_preview' ||
      sectionType === 'bleed_left' ||
      sectionType === 'bleed_right' ||
      sectionType === 'center_title_media' ||
      sectionType === 'split_triple'
    );
  }

  function sectionSupportsAudio(sectionType: HomepageSection['type']) {
    return sectionType === 'audio';
  }

  function sectionHasInlineMediaZones(sectionType: HomepageSection['type']) {
    return (
      sectionType === 'hero' ||
      sectionType === 'editorial' ||
      sectionType === 'lookbook_preview' ||
      sectionType === 'split_triple' ||
      sectionType === 'bleed_left' ||
      sectionType === 'bleed_right' ||
      sectionType === 'center_title_media'
    );
  }

  function getMediaUploadLabel(section: HomepageSection) {
    const supportsImage = sectionSupportsImage(section.type);
    const supportsVideo = sectionSupportsVideo(section.type);
    const supportsAudio = sectionSupportsAudio(section.type);

    if (supportsImage && supportsVideo) return t('homepage.editor.dropImageOrVideo');
    if (supportsImage) return t('homepage.editor.dropImage');
    if (supportsVideo) return t('homepage.editor.dropVideo');
    if (supportsAudio) return t('homepage.editor.dropAudio');
    return t('homepage.editor.dropFile');
  }

  async function handleAssetSelected(event: CustomEvent<{ sectionId: string; file: File }>) {
    const { sectionId, file } = event.detail;
    const sourceSection =
      renderedSections.find((section) => section.id === sectionId) ||
      sections.find((section) => section.id === sectionId);

    if (!sourceSection) return;

    let target: 'imageUrl' | 'videoUrl' | 'audioUrl' | null = null;

    if (file.type.startsWith('image/') && sectionSupportsImage(sourceSection.type)) {
      target = 'imageUrl';
    } else if (file.type.startsWith('video/') && sectionSupportsVideo(sourceSection.type)) {
      target = 'videoUrl';
    } else if (file.type.startsWith('audio/') && sectionSupportsAudio(sourceSection.type)) {
      target = 'audioUrl';
    }

    if (!target) {
      notificationStore.error(t('homepage.editor.unsupportedFileType'));
      return;
    }

    try {
      const data = await uploadHomepageMedia(file);
      const nextConfig = {
        ...(sourceSection.config || {}),
        [target]: data.url,
      } as Record<string, unknown>;
      if (target === 'videoUrl' && data.posterUrl) {
        nextConfig.imageUrl = data.posterUrl;
      }

      const nextSection: HomepageSection = {
        ...sourceSection,
        config: nextConfig,
        updatedAt: new Date().toISOString(),
      };

      previewSection = nextSection;
    } catch (e) {
      notificationStore.error(e instanceof Error ? e.message : t('error.failedToSave'));
    }
  }

  async function handleInlineAssetReplace(event: CustomEvent<InlineAssetDetail>) {
    const { sectionId, field, file } = event.detail;
    const sourceSection =
      renderedSections.find((section) => section.id === sectionId) ||
      sections.find((section) => section.id === sectionId);

    if (!sourceSection) return;

    try {
      const data = await uploadHomepageMedia(file);
      const nextConfig = { ...(sourceSection.config || {}) } as Record<string, unknown>;

      if (field.startsWith('config.cards.')) {
        const match = field.match(/^config\.cards\.(\d+)\.(imageUrl|videoUrl)$/);
        if (!match) {
          notificationStore.error(t('homepage.editor.unsupportedCardMediaField'));
          return;
        }
        const [, indexString, cardKey] = match;
        const cardIndex = Number(indexString);
        const cards = Array.isArray(nextConfig.cards)
          ? [...(nextConfig.cards as Record<string, unknown>[])]
          : [];
        const card = { ...(cards[cardIndex] || {}) };
        card[cardKey] = data.url;
        if (cardKey === 'imageUrl') {
          card.videoUrl = '';
        }
        if (cardKey === 'videoUrl') {
          card.imageUrl = data.posterUrl || '';
        }
        cards[cardIndex] = card;
        nextConfig.cards = cards;
      } else {
        const configKey = field.replace('config.', '');
        nextConfig[configKey] = data.url;
        if (configKey === 'videoUrl' && data.posterUrl) {
          nextConfig.imageUrl = data.posterUrl;
        }
      }

      const nextSection: HomepageSection = {
        ...sourceSection,
        config: nextConfig,
        updatedAt: new Date().toISOString(),
      };

      previewSection = nextSection;
    } catch (e) {
      notificationStore.error(e instanceof Error ? e.message : t('error.failedToSave'));
    }
  }

  function handleInlineEdit(event: CustomEvent<InlineEditDetail>) {
    const { sectionId, field, value } = event.detail;
    const sourceSection =
      renderedSections.find((section) => section.id === sectionId) ||
      sections.find((section) => section.id === sectionId);

    if (!sourceSection) return;

    const nextSection: HomepageSection = {
      ...sourceSection,
      config: { ...(sourceSection.config || {}) },
      updatedAt: new Date().toISOString(),
    };

    if (field === 'title') {
      nextSection.title = value;
    } else if (field === 'config.description') {
      nextSection.config = { ...(nextSection.config || {}), description: value };
    } else if (field === 'config.buttonText') {
      nextSection.config = { ...(nextSection.config || {}), buttonText: value };
    }

    previewSection = nextSection;
  }

  async function loadSections() {
    if (!currentLanguage) return;
    loading = true;
    try {
      const response = await homepageApi.getAll(true, currentLanguage);
      sections = response.sections;
      await loadCollectionProductsForAll();
      error = null;
    } catch (e) {
      error = e instanceof Error ? e : new Error(getErrorMessage(e, 'homepage.failedToLoad'));
      console.error('Failed to load homepage sections:', e);
    } finally {
      loading = false;
    }
  }

  let previousLanguage: string | undefined = undefined;
  let isInitialLoad = true;

  $: if (currentLanguage && currentLanguage !== previousLanguage && !isInitialLoad) {
    previousLanguage = currentLanguage;
    loadSections();
  }

  onMount(async () => {
    previousLanguage = currentLanguage;
    // The universal page load cannot read the browser's saved language and therefore
    // supplies the default-language payload during SSR. Refresh it after hydration
    // when the actual selected language is different.
    if (!hasInitialData || (initialLanguageCode && initialLanguageCode !== currentLanguage)) {
      await new Promise((resolve) => setTimeout(resolve, 0));
      await loadSections();
    }
    if (initialLanguageCode && !currentLanguage) {
      previousLanguage = initialLanguageCode;
    }
    isInitialLoad = false;
  });
</script>

<div
  class="bg-white transition-[padding-right] duration-300 ease-out"
  class:editor-open={editorOpen}
>
  {#if loading}
    <div class="min-h-[calc(100dvh-8rem)] bg-white" aria-hidden="true"></div>
  {:else if showSetupPlaceholder}
    <HomepageSetupPlaceholder />
  {:else if error}
    {#if isAuthenticationError(error)}
      <AuthError message={getErrorMessage(error)} />
    {:else if isRateLimitError(error)}
      <div class="min-h-[40vh] flex items-center justify-center bg-white py-16 px-4">
        <div class="text-center max-w-md">
          <p class="text-gray-700 mb-4">{getErrorMessage(error)}</p>
          <p class="text-gray-600 text-sm mb-6">{t('error.rateLimitPageHint')}</p>
          <button
            type="button"
            on:click={() => window.location.reload()}
            class="px-6 py-2 bg-black text-white hover:bg-gray-800 transition-colors"
          >
            {t('error.rateLimitRefreshPage')}
          </button>
        </div>
      </div>
    {:else}
      <div class="min-h-[60vh] flex items-center justify-center bg-white py-20">
        <div class="text-center">
          <p class="text-red-600 text-lg mb-4">Error: {getErrorMessage(error)}</p>
          <p class="text-gray-600 text-sm">{t('error.apiUnavailable')}</p>
        </div>
      </div>
    {/if}
  {:else}
    {#each activeSections as section (section.id)}
      <HomepageEditableSectionFrame
        {section}
        {editorOpen}
        selected={activeEditorSectionId === section.id}
        label={section.title || section.type}
        supportsMediaUpload={sectionSupportsImage(section.type) ||
          sectionSupportsVideo(section.type) ||
          sectionSupportsAudio(section.type)}
        showSectionMediaButton={!sectionHasInlineMediaZones(section.type)}
        mediaUploadLabel={getMediaUploadLabel(section)}
        on:select={handleSectionSelect}
        on:assetSelected={handleAssetSelected}
      >
        {#if section.type === 'hero' || section.type === 'editorial'}
          <HeroSection
            {section}
            inlineEditing={editorOpen && activeEditorSectionId === section.id}
            on:inlineEdit={handleInlineEdit}
            on:assetReplace={handleInlineAssetReplace}
          />
        {:else if section.type === 'collection'}
          <LazyComponent rootMargin="400px" placeholderHeight="600px">
            <CollectionSection {section} products={collectionProductsBySection[section.id] ?? []} />
          </LazyComponent>
        {:else if section.type === 'lookbook_preview'}
          <LazyComponent rootMargin="400px" placeholderHeight="500px">
            <LookbookPreviewSection
              {section}
              inlineEditing={editorOpen && activeEditorSectionId === section.id}
              on:inlineEdit={handleInlineEdit}
              on:assetReplace={handleInlineAssetReplace}
            />
          </LazyComponent>
        {:else if section.type === 'card'}
          <LazyComponent rootMargin="400px" placeholderHeight="400px">
            <CardSection {section} />
          </LazyComponent>
        {:else if section.type === 'blog'}
          <LazyComponent rootMargin="400px" placeholderHeight="400px">
            <BlogSection {section} />
          </LazyComponent>
        {:else if section.type === 'audio'}
          <LazyComponent rootMargin="400px" placeholderHeight="200px">
            <AudioSection {section} />
          </LazyComponent>
        {:else if section.type === 'split_triple'}
          <LazyComponent rootMargin="400px" placeholderHeight="560px">
            <SplitTripleSection
              {section}
              inlineEditing={editorOpen && activeEditorSectionId === section.id}
              on:assetReplace={handleInlineAssetReplace}
            />
          </LazyComponent>
        {:else if section.type === 'bleed_left'}
          <LazyComponent rootMargin="400px" placeholderHeight="520px">
            <BleedSplitSection
              {section}
              imageSide="left"
              inlineEditing={editorOpen && activeEditorSectionId === section.id}
              on:inlineEdit={handleInlineEdit}
              on:assetReplace={handleInlineAssetReplace}
            />
          </LazyComponent>
        {:else if section.type === 'bleed_right'}
          <LazyComponent rootMargin="400px" placeholderHeight="520px">
            <BleedSplitSection
              {section}
              imageSide="right"
              inlineEditing={editorOpen && activeEditorSectionId === section.id}
              on:inlineEdit={handleInlineEdit}
              on:assetReplace={handleInlineAssetReplace}
            />
          </LazyComponent>
        {:else if section.type === 'center_title_media'}
          <LazyComponent rootMargin="400px" placeholderHeight="480px">
            <CenterTitleMediaSection
              {section}
              inlineEditing={editorOpen && activeEditorSectionId === section.id}
              on:inlineEdit={handleInlineEdit}
              on:assetReplace={handleInlineAssetReplace}
            />
          </LazyComponent>
        {:else if section.type === 'text_block'}
          <LazyComponent rootMargin="400px" placeholderHeight="320px">
            <TextBlockSection
              {section}
              inlineEditing={editorOpen && activeEditorSectionId === section.id}
              on:inlineEdit={handleInlineEdit}
            />
          </LazyComponent>
        {/if}
      </HomepageEditableSectionFrame>
    {/each}
  {/if}
</div>

<HomepageAdminDrawer
  {sections}
  bind:isOpen={editorOpen}
  bind:activeSectionId={activeEditorSectionId}
  externalDraftSection={previewSection}
  on:sectionsUpdated={handleSectionsUpdated}
  on:previewChanged={handlePreviewChanged}
/>

<style>
  @media (min-width: 1024px) {
    .editor-open {
      padding-right: min(48rem, 52vw);
    }
  }
</style>
