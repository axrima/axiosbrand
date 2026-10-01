<script lang="ts">
  import { onMount } from 'svelte';
  import { adminApi } from '$lib/api/admin.api';
  import { apiClient } from '$lib/api/client';
  import { uploadHomepageMedia } from '$lib/api/homepage-upload';
  import { productApi } from '$lib/api/product.api';
  import { lookbookApi } from '$lib/api/lookbook.api';
  import { blogApi } from '$lib/api/blog.api';
  import type { BlogPost } from '$lib/api/blog.api';
  import { goto } from '$app/navigation';
  import { dialogStore } from '$lib/stores/dialog.store';
  import { notificationStore } from '$lib/stores/notification.store';
  import { normalizeUploadFile } from '$lib/utils/file-upload';
  import { t } from '$lib/utils/i18n';
  import { getErrorMessage, resolveApiError } from '$lib/utils/error-handler';
  import LoadingBar from '$lib/components/LoadingBar.svelte';
  import { translationApi, type HomepageSectionTranslation } from '$lib/api/translation.api';
  import { languageApi, type Language } from '$lib/api/language.api';
  import type { HomepageSection, CardItem } from '$lib/api/homepage.api';
  import type { Product } from '$lib/api/product.api';
  import type { Lookbook } from '$lib/api/lookbook.api';
  import { hexForColorInput } from '$lib/utils/color-input';

  let sections: HomepageSection[] = [];
  let loading = true;
  let error = '';
  let showForm = false;
  let editingSection: HomepageSection | null = null;
  let uploadingImage = false;
  let uploadingVideo = false;
  let uploadingAudio = false;
  let imageFileInput: HTMLInputElement | null = null;
  let videoFileInput: HTMLInputElement | null = null;
  let audioFileInput: HTMLInputElement | null = null;
  let isDraggingImage = false;
  let isDraggingVideo = false;
  let isDraggingAudio = false;
  let cardDraggingStates: Record<number, boolean> = {};
  let cardUploadingStates: Record<number, boolean> = {};
  let cardFileInputs: Record<number, HTMLInputElement | null> = {};
  let products: Product[] = [];
  let productSearchQuery = '';
  let selectedProducts: string[] = [];
  let lookbooks: Lookbook[] = [];
  let lookbookSearchQuery = '';
  let selectedLookbook: string = '';
  let blogPosts: BlogPost[] = [];

  // Translation management
  let languages: Language[] = [];
  let translations: Record<string, HomepageSectionTranslation[]> = {};
  let showTranslations = false;
  let selectedSectionForTranslation: HomepageSection | null = null;
  let editingTranslation: HomepageSectionTranslation | null = null;
  let selectedLanguageForTranslation = '';
  let translationFormData = {
    title: '',
    config: {} as Record<string, any>,
  };
  let gptTranslating = false;

  let formData = {
    type: 'hero' as
      | 'hero'
      | 'collection'
      | 'editorial'
      | 'lookbook_preview'
      | 'card'
      | 'blog'
      | 'audio'
      | 'split_triple'
      | 'bleed_left'
      | 'bleed_right'
      | 'center_title_media'
      | 'text_block',
    title: '',
    order: 0,
    isActive: true,
    config: {
      imageUrl: '',
      videoUrl: '',
      // Video settings
      videoLoop: true,
      videoAutoplay: true,
      videoMuted: true,
      videoControls: false,
      videoPlaysinline: true,
      buttonText: '',
      buttonLink: '',
      description: '',
      products: [] as string[],
      lookbookId: '',
      // Card section config
      cards: [] as CardItem[],
      gridColumns: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
      gap: 'gap-4',
      // Blog section config
      displayMode: 'latest' as 'latest' | 'featured',
      limit: 6,
      postIds: [] as string[],
      // Audio section config
      audioUrl: '',
      playerVariant: 'minimal' as 'minimal' | 'bar' | 'compact',
      playerAccentColor: '#000000',
      playerBgColor: '#fafafa',
      showPlayPause: true,
      showProgress: true,
      showTime: true,
      showVolume: true,
      autoplay: false,
      // Design settings
      backgroundColor: '',
      textColor: '',
      buttonColor: '',
      buttonTextColor: '',
      titleSize: '',
      subtitleSize: '',
      paddingTop: '',
      paddingBottom: '',
      textAlign: 'center' as 'left' | 'center' | 'right',
      imageOpacity: '50',
      sectionHeight: '',
      overlayColor: '',
      overlayOpacity: '0',
      mediaAspectRatio: 'auto' as 'auto' | '1:1' | '4:5' | '3:4' | '16:9' | '9:16',
      mediaHoverEffect: 'zoom' as 'none' | 'zoom' | 'dim',
      mediaLinkMode: 'hover' as 'none' | 'always' | 'hover',
      titleOverlayOnMedia: false,
      titleOverlayPosition: 'center' as 'top' | 'center' | 'bottom',
      textBlockMaxWidth: 'medium' as 'narrow' | 'medium' | 'wide' | 'full',
      textBlockAnimation: 'fade_up' as 'fade_up' | 'fade' | 'scale' | 'none',
    },
  };

  async function loadBlogPosts() {
    try {
      const response = await blogApi.getAllPosts(false);
      blogPosts = response.posts;
    } catch (e) {
      console.error('Failed to load blog posts:', e);
      blogPosts = [];
    }
  }

  onMount(async () => {
    await Promise.all([
      loadSections(),
      loadProducts(),
      loadLookbooks(),
      loadLanguages(),
      loadBlogPosts(),
    ]);
  });

  async function loadLanguages() {
    try {
      const response = await languageApi.getAll();
      languages = response.languages;
    } catch (e) {
      console.error('Failed to load languages:', e);
    }
  }

  async function loadTranslations(sectionId: string) {
    try {
      const response = await translationApi.getHomepageSectionTranslations(sectionId);
      translations[sectionId] = response.translations;
    } catch (e) {
      console.error('Failed to load translations:', e);
      translations[sectionId] = [];
    }
  }

  function openTranslationEditor(section: HomepageSection) {
    selectedSectionForTranslation = section;
    showTranslations = true;
    editingTranslation = null;
    selectedLanguageForTranslation = '';
    const baseCards = (section.config?.cards as CardItem[] | undefined) ?? [];
    translationFormData = {
      title: '',
      config:
        section.type === 'card' || section.type === 'split_triple'
          ? { cards: baseCards.map((c) => ({ id: c.id, title: '' })) }
          : {},
    };
    loadTranslations(section.id);
  }

  function closeTranslationEditor() {
    showTranslations = false;
    selectedSectionForTranslation = null;
    editingTranslation = null;
    selectedLanguageForTranslation = '';
    translationFormData = {
      title: '',
      config: {},
    };
  }

  function editTranslation(translation: HomepageSectionTranslation) {
    editingTranslation = translation;
    selectedLanguageForTranslation = translation.languageCode;
    const section = selectedSectionForTranslation;
    const baseCards = (section?.config?.cards as CardItem[] | undefined) ?? [];
    const transCards = Array.isArray(translation.config?.cards) ? translation.config.cards : [];
    const cards =
      section?.type === 'card' || section?.type === 'split_triple'
        ? baseCards.map((c) => ({
            id: c.id,
            title:
              transCards.find((tc: { id?: string; title?: string }) => tc.id === c.id)?.title ?? '',
          }))
        : translation.config?.cards;
    translationFormData = {
      title: translation.title || '',
      config:
        section?.type === 'card' || section?.type === 'split_triple'
          ? { ...translation.config, cards }
          : translation.config || {},
    };
  }

  async function saveTranslation() {
    if (!selectedSectionForTranslation) return;

    try {
      const base = selectedSectionForTranslation;
      const config: Record<string, any> = {
        ...translationFormData.config,
        buttonText: translationFormData.config.buttonText ?? base.config?.buttonText,
        description: translationFormData.config.description ?? base.config?.description,
      };
      if (
        (base.type === 'card' || base.type === 'split_triple') &&
        Array.isArray(translationFormData.config.cards)
      ) {
        config.cards = translationFormData.config.cards;
      }

      await translationApi.upsertHomepageSectionTranslation(selectedSectionForTranslation.id, {
        languageCode: selectedLanguageForTranslation,
        title: translationFormData.title || undefined,
        config: Object.keys(config).length > 0 ? config : undefined,
      });
      notificationStore.success(t('notification.translationSaved') || 'Translation saved');
      await loadTranslations(selectedSectionForTranslation.id);
      editingTranslation = null;
      selectedLanguageForTranslation = '';
      translationFormData = {
        title: '',
        config: {},
      };
    } catch (e: any) {
      notificationStore.error(e.response?.data?.error || t('error.failedToSave'));
    }
  }

  async function deleteTranslation(sectionId: string, languageCode: string) {
    const confirmed = await dialogStore.confirm(t('alert.deleteTranslation'), t('common.confirm'));
    if (!confirmed) return;

    try {
      await translationApi.deleteHomepageSectionTranslation(sectionId, languageCode);
      notificationStore.success(t('notification.translationDeleted') || 'Translation deleted');
      await loadTranslations(sectionId);
    } catch (e: any) {
      notificationStore.error(e.response?.data?.error || t('error.failedToDelete'));
    }
  }

  async function translateWithGPT() {
    if (!selectedSectionForTranslation) return;

    gptTranslating = true;
    try {
      const sourceLanguage = 'en';
      const targetLanguage = selectedLanguageForTranslation;

      const targetLang = languages.find((l) => l.code === targetLanguage);
      if (!targetLang) {
        notificationStore.error(t('notification.targetLanguageNotFound'));
        return;
      }

      // Translate title
      if (selectedSectionForTranslation.title) {
        try {
          const titleTranslation = await translationApi.generateGPTTranslation({
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage,
            content: selectedSectionForTranslation.title,
          });
          translationFormData.title = titleTranslation.translation;
        } catch (e) {
          console.error('Failed to translate title:', e);
        }
      }

      // Translate button text
      if (selectedSectionForTranslation.config?.buttonText) {
        try {
          const buttonTranslation = await translationApi.generateGPTTranslation({
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage,
            content: selectedSectionForTranslation.config.buttonText,
          });
          translationFormData.config.buttonText = buttonTranslation.translation;
        } catch (e) {
          console.error('Failed to translate button text:', e);
        }
      }

      // Translate description
      if (selectedSectionForTranslation.config?.description) {
        try {
          const descTranslation = await translationApi.generateGPTTranslation({
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage,
            content: selectedSectionForTranslation.config.description,
          });
          translationFormData.config.description = descTranslation.translation;
        } catch (e) {
          console.error('Failed to translate description:', e);
        }
      }

      // Translate card section: each card title
      if (
        (selectedSectionForTranslation.type === 'card' ||
          selectedSectionForTranslation.type === 'split_triple') &&
        Array.isArray(selectedSectionForTranslation.config?.cards)
      ) {
        const baseCards = selectedSectionForTranslation.config.cards;
        const translatedCards = [];
        for (let i = 0; i < baseCards.length; i++) {
          const card = baseCards[i];
          const title = card?.title;
          if (title) {
            try {
              const res = await translationApi.generateGPTTranslation({
                sourceLanguage: sourceLanguage,
                targetLanguage: targetLanguage,
                content: title,
              });
              translatedCards.push({ id: card.id, title: res.translation });
            } catch (e) {
              console.error(`Failed to translate card ${i + 1} title:`, e);
              translatedCards.push({ id: card.id, title: title });
            }
          } else {
            translatedCards.push({ id: card.id, title: '' });
          }
        }
        translationFormData.config.cards = translatedCards;
      }

      notificationStore.success(
        `Translation generated for ${targetLang.nameNative || targetLang.name}`
      );
    } catch (e) {
      notificationStore.error(resolveApiError(e, 'error.failedToGenerateTranslation'));
    } finally {
      gptTranslating = false;
    }
  }

  async function loadSections() {
    loading = true;
    try {
      const response = await adminApi.getAllHomepageSections();
      sections = response.sections.sort((a, b) => a.order - b.order);
      // Set default order for new section
      if (sections.length > 0) {
        formData.order = Math.max(...sections.map((s) => s.order)) + 1;
      }
    } catch (e) {
      error = getErrorMessage(e, 'homepage.failedToLoadSections');
    } finally {
      loading = false;
    }
  }

  async function loadProducts(search?: string) {
    try {
      const response = await productApi.getAll(1, 50, { search });
      products = response.products;
    } catch (e) {
      console.error('Failed to load products:', e);
    }
  }

  function toggleProduct(productId: string) {
    if (selectedProducts.includes(productId)) {
      selectedProducts = selectedProducts.filter((id) => id !== productId);
    } else {
      selectedProducts = [...selectedProducts, productId];
    }
    formData.config.products = selectedProducts;
  }

  function handleProductSearch() {
    if (productSearchQuery.trim()) {
      loadProducts(productSearchQuery);
    } else {
      loadProducts();
    }
  }

  async function loadLookbooks() {
    try {
      const response = await lookbookApi.getAll(false);
      lookbooks = response.lookbooks;
    } catch (e) {
      console.error('Failed to load lookbooks:', e);
    }
  }

  function toggleLookbook(lookbookId: string) {
    // For lookbook preview, only one can be selected
    if (selectedLookbook === lookbookId) {
      selectedLookbook = '';
      formData.config.lookbookId = '';
    } else {
      selectedLookbook = lookbookId;
      formData.config.lookbookId = lookbookId;
    }
  }

  $: filteredLookbooks = lookbookSearchQuery.trim()
    ? lookbooks.filter(
        (l) =>
          l.title.toLowerCase().includes(lookbookSearchQuery.toLowerCase()) ||
          l.season?.toLowerCase().includes(lookbookSearchQuery.toLowerCase()) ||
          l.year?.toString().includes(lookbookSearchQuery)
      )
    : lookbooks;

  function addCard() {
    formData.config.cards = [
      ...formData.config.cards,
      {
        id: crypto.randomUUID(),
        imageUrl: '',
        videoUrl: '',
        title: '',
        link: '',
        borderRadius: 'rounded-lg',
        showTitleOnHover: false,
        titleColor: '#ffffff',
      },
    ];
  }

  function removeCard(index: number) {
    formData.config.cards = formData.config.cards.filter((_, i) => i !== index);
  }

  function updateCard(index: number, field: string, value: string | boolean) {
    formData.config = {
      ...formData.config,
      cards: formData.config.cards.map((card, i) =>
        i === index ? { ...card, [field]: value } : card
      ),
    };
  }

  function openForm(section?: HomepageSection) {
    if (section) {
      editingSection = section;
      formData = {
        type: section.type,
        title: section.title || '',
        order: section.order,
        isActive: section.isActive,
        config: {
          imageUrl: section.config?.imageUrl || '',
          videoUrl: section.config?.videoUrl || '',
          // Video settings
          videoLoop:
            typeof section.config?.videoLoop === 'boolean' ? section.config.videoLoop : true,
          videoAutoplay:
            typeof section.config?.videoAutoplay === 'boolean'
              ? section.config.videoAutoplay
              : true,
          videoMuted:
            typeof section.config?.videoMuted === 'boolean' ? section.config.videoMuted : true,
          videoControls:
            typeof section.config?.videoControls === 'boolean'
              ? section.config.videoControls
              : false,
          videoPlaysinline:
            typeof section.config?.videoPlaysinline === 'boolean'
              ? section.config.videoPlaysinline
              : true,
          buttonText: section.config?.buttonText || '',
          buttonLink: section.config?.buttonLink || '',
          description: section.config?.description || '',
          products: section.config?.products || [],
          lookbookId: section.config?.lookbookId || '',
          // Blog section config
          displayMode: (section.config?.displayMode as 'latest' | 'featured') || 'latest',
          limit: typeof section.config?.limit === 'number' ? section.config.limit : 6,
          postIds: (section.config?.postIds as string[]) || [],
          cards:
            (section.config?.cards as Array<{
              id?: string;
              imageUrl?: string;
              videoUrl?: string;
              title?: string;
              link?: string;
              borderRadius?: string;
            }>) || [],
          gridColumns:
            (section.config?.gridColumns as string) || 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
          gap: (section.config?.gap as string) || 'gap-4',
          backgroundColor: (section.config?.backgroundColor as string) || '',
          textColor: (section.config?.textColor as string) || '',
          buttonColor: (section.config?.buttonColor as string) || '',
          buttonTextColor: (section.config?.buttonTextColor as string) || '',
          titleSize: (section.config?.titleSize as string) || '',
          subtitleSize: (section.config?.subtitleSize as string) || '',
          paddingTop: (section.config?.paddingTop as string) || '',
          paddingBottom: (section.config?.paddingBottom as string) || '',
          textAlign: (section.config?.textAlign as 'left' | 'center' | 'right') || 'center',
          imageOpacity: (section.config?.imageOpacity as string) || '50',
          sectionHeight: (section.config?.sectionHeight as string) || '',
          overlayColor: (section.config?.overlayColor as string) || '',
          overlayOpacity: (section.config?.overlayOpacity as string) || '0',
          mediaAspectRatio:
            (section.config?.mediaAspectRatio as
              | 'auto'
              | '1:1'
              | '4:5'
              | '3:4'
              | '16:9'
              | '9:16') || 'auto',
          mediaHoverEffect: (section.config?.mediaHoverEffect as 'none' | 'zoom' | 'dim') || 'zoom',
          mediaLinkMode: (section.config?.mediaLinkMode as 'none' | 'always' | 'hover') || 'hover',
          titleOverlayOnMedia: (section.config?.titleOverlayOnMedia as boolean) === true,
          titleOverlayPosition:
            (section.config?.titleOverlayPosition as 'top' | 'center' | 'bottom') || 'center',
          textBlockMaxWidth:
            (section.config?.textBlockMaxWidth as 'narrow' | 'medium' | 'wide' | 'full') ||
            'medium',
          textBlockAnimation:
            (section.config?.textBlockAnimation as 'fade_up' | 'fade' | 'scale' | 'none') ||
            'fade_up',
          audioUrl: section.config?.audioUrl || '',
          playerVariant:
            (section.config?.playerVariant as 'minimal' | 'bar' | 'compact') || 'minimal',
          playerAccentColor: (section.config?.playerAccentColor as string) || '#000000',
          playerBgColor: (section.config?.playerBgColor as string) || '#fafafa',
          showPlayPause: (section.config?.showPlayPause as boolean) !== false,
          showProgress: (section.config?.showProgress as boolean) !== false,
          showTime: (section.config?.showTime as boolean) !== false,
          showVolume: (section.config?.showVolume as boolean) !== false,
          autoplay: (section.config?.autoplay as boolean) === true,
        },
      };
      selectedProducts = formData.config.products;
      selectedLookbook = formData.config.lookbookId || '';
    } else {
      editingSection = null;
      formData = {
        type: 'hero',
        title: '',
        order: sections.length > 0 ? Math.max(...sections.map((s) => s.order)) + 1 : 0,
        isActive: true,
        config: {
          imageUrl: '',
          videoUrl: '',
          // Video settings
          videoLoop: true,
          videoAutoplay: true,
          videoMuted: true,
          videoControls: false,
          videoPlaysinline: true,
          buttonText: '',
          buttonLink: '',
          description: '',
          products: [],
          lookbookId: '',
          cards: [],
          gridColumns: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
          gap: 'gap-4',
          backgroundColor: '',
          textColor: '',
          buttonColor: '',
          buttonTextColor: '',
          titleSize: '',
          subtitleSize: '',
          paddingTop: '',
          paddingBottom: '',
          textAlign: 'center',
          imageOpacity: '50',
          sectionHeight: '',
          overlayColor: '',
          overlayOpacity: '0',
          mediaAspectRatio: 'auto',
          mediaHoverEffect: 'zoom',
          mediaLinkMode: 'hover',
          titleOverlayOnMedia: false,
          titleOverlayPosition: 'center',
          displayMode: 'latest',
          limit: 6,
          postIds: [],
          audioUrl: '',
          playerVariant: 'minimal',
          playerAccentColor: '#000000',
          playerBgColor: '#fafafa',
          showPlayPause: true,
          showProgress: true,
          showTime: true,
          showVolume: true,
          autoplay: false,
          textBlockMaxWidth: 'medium',
          textBlockAnimation: 'fade_up',
        },
      };
      selectedProducts = [];
      selectedLookbook = '';
    }
    productSearchQuery = '';
    lookbookSearchQuery = '';
    showForm = true;
  }

  async function saveSection() {
    try {
      const data = {
        type: formData.type,
        title: formData.title || undefined,
        order: formData.order,
        isActive: formData.isActive,
        config: {
          ...(formData.config.imageUrl && { imageUrl: formData.config.imageUrl }),
          ...(formData.config.videoUrl && { videoUrl: formData.config.videoUrl }),
          // Video settings
          videoLoop: formData.config.videoLoop,
          videoAutoplay: formData.config.videoAutoplay,
          videoMuted: formData.config.videoMuted,
          videoControls: formData.config.videoControls,
          videoPlaysinline: formData.config.videoPlaysinline,
          ...(formData.config.buttonText && { buttonText: formData.config.buttonText }),
          ...(formData.config.buttonLink && { buttonLink: formData.config.buttonLink }),
          ...(formData.config.description && { description: formData.config.description }),
          ...(formData.config.products.length > 0 && { products: formData.config.products }),
          ...(formData.config.lookbookId && { lookbookId: formData.config.lookbookId }),
          // Card section config
          ...(formData.config.cards &&
            formData.config.cards.length > 0 && { cards: formData.config.cards }),
          ...(formData.config.gridColumns && { gridColumns: formData.config.gridColumns }),
          ...(formData.config.gap && { gap: formData.config.gap }),
          // Design settings
          ...(formData.config.backgroundColor && {
            backgroundColor: formData.config.backgroundColor,
          }),
          ...(formData.config.textColor && { textColor: formData.config.textColor }),
          ...(formData.config.buttonColor && { buttonColor: formData.config.buttonColor }),
          ...(formData.config.buttonTextColor && {
            buttonTextColor: formData.config.buttonTextColor,
          }),
          ...(formData.config.titleSize && { titleSize: formData.config.titleSize }),
          ...(formData.config.subtitleSize && { subtitleSize: formData.config.subtitleSize }),
          ...(formData.config.paddingTop && { paddingTop: formData.config.paddingTop }),
          ...(formData.config.paddingBottom && { paddingBottom: formData.config.paddingBottom }),
          ...(formData.config.textAlign && { textAlign: formData.config.textAlign }),
          ...(formData.config.imageOpacity && { imageOpacity: formData.config.imageOpacity }),
          ...(formData.config.sectionHeight && { sectionHeight: formData.config.sectionHeight }),
          ...(formData.config.overlayColor && { overlayColor: formData.config.overlayColor }),
          ...(formData.config.overlayOpacity && { overlayOpacity: formData.config.overlayOpacity }),
          ...(formData.config.mediaAspectRatio && {
            mediaAspectRatio: formData.config.mediaAspectRatio,
          }),
          ...(formData.config.mediaHoverEffect && {
            mediaHoverEffect: formData.config.mediaHoverEffect,
          }),
          ...(formData.config.mediaLinkMode && { mediaLinkMode: formData.config.mediaLinkMode }),
          ...(formData.config.titleOverlayOnMedia && {
            titleOverlayOnMedia: formData.config.titleOverlayOnMedia,
          }),
          ...(formData.config.titleOverlayPosition && {
            titleOverlayPosition: formData.config.titleOverlayPosition,
          }),
          // Audio section config
          ...(formData.type === 'audio' && {
            audioUrl: formData.config.audioUrl,
            playerVariant: formData.config.playerVariant,
            playerAccentColor: formData.config.playerAccentColor,
            playerBgColor: formData.config.playerBgColor,
            showPlayPause: formData.config.showPlayPause,
            showProgress: formData.config.showProgress,
            showTime: formData.config.showTime,
            showVolume: formData.config.showVolume,
            autoplay: formData.config.autoplay,
          }),
          ...(formData.type === 'text_block' && {
            textBlockMaxWidth: formData.config.textBlockMaxWidth || 'medium',
            textBlockAnimation: formData.config.textBlockAnimation || 'fade_up',
          }),
        },
      };

      if (editingSection) {
        await adminApi.updateHomepageSection(editingSection.id, data);
      } else {
        await adminApi.createHomepageSection(data);
      }
      showForm = false;
      await loadSections();
    } catch (e: any) {
      notificationStore.error(e.response?.data?.error || t('error.failedToSave'));
    }
  }

  async function toggleSection(id: string, isActive: boolean) {
    try {
      await adminApi.updateHomepageSection(id, { isActive: !isActive });
      await loadSections();
    } catch (e) {
      notificationStore.error(t('error.failedToUpdate'));
    }
  }

  async function deleteSection(id: string, event?: Event) {
    if (event) {
      event.preventDefault();
      event.stopPropagation();
    }

    const confirmed = await dialogStore.confirm(
      t('homepage.deleteConfirm'),
      t('homepage.deleteSection'),
      t('common.delete'),
      t('common.cancel')
    );

    if (!confirmed) {
      return;
    }

    try {
      await adminApi.deleteHomepageSection(id);
      await loadSections();
    } catch (e) {
      notificationStore.error(t('error.failedToDelete'));
    }
  }

  async function moveSection(id: string, direction: 'up' | 'down') {
    const index = sections.findIndex((s) => s.id === id);
    if (index === -1) return;

    const newIndex = direction === 'up' ? index - 1 : index + 1;
    if (newIndex < 0 || newIndex >= sections.length) return;

    const sectionOrders = sections.map((s, i) => ({
      id: s.id,
      order:
        i === index ? sections[newIndex].order : i === newIndex ? sections[index].order : s.order,
    }));

    try {
      await adminApi.reorderHomepageSections(sectionOrders);
      await loadSections();
    } catch (e) {
      notificationStore.error(t('error.failedToUpdate'));
    }
  }

  function getSectionTypeLabel(type: string): string {
    const labels: Record<string, string> = {
      hero: t('homepage.heroSection'),
      collection: t('homepage.productCollection'),
      editorial: t('homepage.editorial'),
      lookbook_preview: t('homepage.lookbookPreview'),
      card: t('homepage.cardBlocks'),
      blog: t('homepage.blogSection'),
      audio: t('homepage.audioSection'),
      split_triple: t('homepage.splitTripleSection'),
      bleed_left: t('homepage.bleedImageLeft'),
      bleed_right: t('homepage.bleedImageRight'),
      center_title_media: t('homepage.centerTitleMedia'),
      text_block: t('homepage.textBlockSection'),
    };
    return labels[type] || type;
  }

  function toggleBlogPost(postId: string) {
    const ids = formData.config.postIds ?? [];
    if (ids.includes(postId)) {
      formData.config.postIds = ids.filter((id) => id !== postId);
    } else {
      formData.config.postIds = [...ids, postId];
    }
  }

  async function uploadImageFile(file: File) {
    uploadingImage = true;
    try {
      const data = await uploadHomepageMedia(file);
      formData.config.imageUrl = data.url;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : t('homepage.failedToUploadImage');
      alert(errorMsg);
    } finally {
      uploadingImage = false;
    }
  }

  async function uploadVideoFile(file: File) {
    uploadingVideo = true;
    try {
      const data = await uploadHomepageMedia(file);
      formData.config.videoUrl = data.url;
      // First-frame still → poster for cold loads / incognito (same moment playback starts from).
      if (data.posterUrl) {
        formData.config.imageUrl = data.posterUrl;
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : t('homepage.failedToUploadVideo');
      alert(errorMsg);
    } finally {
      uploadingVideo = false;
    }
  }

  function handleImageFileSelect(event: Event) {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.files && target.files[0]) {
      uploadImageFile(target.files[0]);
    }
  }

  function handleVideoFileSelect(event: Event) {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.files && target.files[0]) {
      uploadVideoFile(target.files[0]);
    }
  }

  function handleImageDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    isDraggingImage = true;
  }

  function handleImageDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    isDraggingImage = false;
  }

  function handleImageDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    isDraggingImage = false;

    if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
      const file = event.dataTransfer.files[0];
      if (file.type.startsWith('image/')) {
        uploadImageFile(file);
      }
    }
  }

  function handleVideoDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    isDraggingVideo = true;
  }

  function handleVideoDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    isDraggingVideo = false;
  }

  function handleVideoDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    isDraggingVideo = false;

    if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
      const file = event.dataTransfer.files[0];
      if (file.type.startsWith('video/')) {
        uploadVideoFile(file);
      }
    }
  }

  function openImageFileDialog() {
    if (imageFileInput) {
      imageFileInput.click();
    }
  }

  function openVideoFileDialog() {
    if (videoFileInput) {
      videoFileInput.click();
    }
  }

  async function uploadAudioFile(file: File) {
    uploadingAudio = true;
    try {
      const uploadFormData = new FormData();
      uploadFormData.append('file', normalizeUploadFile(file));

      const data = await apiClient.post<{ url: string }>('/homepage/upload', uploadFormData);
      formData.config.audioUrl = data.url;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : t('homepage.failedToUploadAudio');
      notificationStore.error(errorMsg);
    } finally {
      uploadingAudio = false;
    }
  }

  function handleAudioFileSelect(event: Event) {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.files?.[0]) {
      uploadAudioFile(target.files[0]);
    }
  }

  function handleAudioDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    isDraggingAudio = true;
  }

  function handleAudioDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    isDraggingAudio = false;
  }

  function handleAudioDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    isDraggingAudio = false;
    if (event.dataTransfer?.files?.[0]) {
      const file = event.dataTransfer.files[0];
      if (file.type.startsWith('audio/')) {
        uploadAudioFile(file);
      }
    }
  }

  function openAudioFileDialog() {
    audioFileInput?.click();
  }

  // Card file upload functions
  async function uploadCardFile(file: File, cardIndex: number, isVideo: boolean = false) {
    cardUploadingStates[cardIndex] = true;
    try {
      const data = await uploadHomepageMedia(file);

      // Update card with new media URL
      formData.config = {
        ...formData.config,
        cards: formData.config.cards.map((card, i) =>
          i === cardIndex
            ? {
                ...card,
                imageUrl: isVideo ? data.posterUrl || '' : data.url,
                videoUrl: isVideo ? data.url : '',
              }
            : card
        ),
      };

      // Reset file input
      if (cardFileInputs[cardIndex]) {
        cardFileInputs[cardIndex].value = '';
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : t('homepage.failedToUploadImage');
      notificationStore.error(errorMsg);
    } finally {
      cardUploadingStates[cardIndex] = false;
    }
  }

  function handleCardFileSelect(event: Event, cardIndex: number) {
    const target = event.target;
    if (target instanceof HTMLInputElement && target.files && target.files[0]) {
      const file = target.files[0];
      const isVideo = file.type.startsWith('video/');
      uploadCardFile(file, cardIndex, isVideo);
    }
  }

  function handleCardDragOver(event: DragEvent, cardIndex: number) {
    event.preventDefault();
    event.stopPropagation();
    cardDraggingStates[cardIndex] = true;
  }

  function handleCardDragLeave(event: DragEvent, cardIndex: number) {
    event.preventDefault();
    event.stopPropagation();
    cardDraggingStates[cardIndex] = false;
  }

  function handleCardDrop(event: DragEvent, cardIndex: number) {
    event.preventDefault();
    event.stopPropagation();
    cardDraggingStates[cardIndex] = false;

    if (event.dataTransfer?.files && event.dataTransfer.files[0]) {
      const file = event.dataTransfer.files[0];
      const isImage = file.type.startsWith('image/');
      const isVideo = file.type.startsWith('video/');

      if (isImage) {
        uploadCardFile(file, cardIndex, false);
      } else if (isVideo) {
        uploadCardFile(file, cardIndex, true);
      }
    }
  }

  function openCardFileDialog(cardIndex: number) {
    if (cardFileInputs[cardIndex]) {
      cardFileInputs[cardIndex]?.click();
    }
  }
</script>

<div>
  <div class="flex justify-between items-center mb-6">
    <div>
      <h2 class="text-3xl font-bold">{t('homepage.sections')}</h2>
      <p class="text-sm text-accent-muted mt-1">
        {t('homepage.manageSections')}
      </p>
    </div>
    <button
      on:click={() => openForm()}
      class="px-6 py-2 bg-accent text-dark hover:bg-accent-muted transition-colors"
    >
      {t('homepage.addSection')}
    </button>
  </div>

  {#if showForm}
    <div class="bg-dark-light p-6 mb-6">
      <h3 class="text-xl font-medium mb-4">
        {editingSection ? t('homepage.editSection') : t('homepage.addNewSection')}
      </h3>
      <div class="space-y-4">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label for="homepage-section-type" class="block text-sm font-medium mb-2"
              >{t('homepage.sectionType')} *</label
            >
            <select
              id="homepage-section-type"
              bind:value={formData.type}
              class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
            >
              <option value="hero">{t('homepage.heroSection')}</option>
              <option value="collection">{t('homepage.productCollection')}</option>
              <option value="editorial">{t('homepage.editorial')}</option>
              <option value="lookbook_preview">{t('homepage.lookbookPreview')}</option>
              <option value="card">{t('homepage.cardBlocks')}</option>
              <option value="blog">{t('homepage.blogSection')}</option>
              <option value="audio">{t('homepage.audioSection')}</option>
              <option value="split_triple">{t('homepage.splitTripleSection')}</option>
              <option value="bleed_left">{t('homepage.bleedImageLeft')}</option>
              <option value="bleed_right">{t('homepage.bleedImageRight')}</option>
              <option value="center_title_media">{t('homepage.centerTitleMedia')}</option>
              <option value="text_block">{t('homepage.textBlockSection')}</option>
            </select>
          </div>
          <div>
            <label for="homepage-section-order" class="block text-sm font-medium mb-2"
              >{t('homepage.sectionOrder')} *</label
            >
            <input
              id="homepage-section-order"
              type="number"
              bind:value={formData.order}
              min="0"
              class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
            />
          </div>
        </div>

        <div>
          <label for="homepage-section-title" class="block text-sm font-medium mb-2"
            >{t('homepage.sectionTitle')}</label
          >
          <input
            id="homepage-section-title"
            type="text"
            bind:value={formData.title}
            class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
            placeholder={t('homepage.sectionTitle')}
          />
        </div>

        {#if formData.type === 'hero' || formData.type === 'editorial' || formData.type === 'split_triple' || formData.type === 'center_title_media' || formData.type === 'bleed_left' || formData.type === 'bleed_right'}
          <!-- Image Upload -->
          <div>
            <label for="homepage-image-url" class="block text-sm font-medium mb-2"
              >{t('homepage.image')}</label
            >
            <div class="space-y-2">
              <!-- Drag & Drop Zone for Image -->
              <div
                class="relative border-2 border-dashed p-4 text-center transition-all {isDraggingImage
                  ? 'border-accent bg-accent/5'
                  : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100'}"
                on:dragover={handleImageDragOver}
                on:dragleave={handleImageDragLeave}
                on:drop={handleImageDrop}
                role="button"
                tabindex="0"
                on:keydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openImageFileDialog();
                  }
                }}
              >
                <input
                  bind:this={imageFileInput}
                  id="homepage-image-file"
                  type="file"
                  accept="image/*"
                  aria-label={t('homepage.image') || 'Image upload'}
                  on:change={handleImageFileSelect}
                  class="hidden"
                />
                <div class="flex flex-col items-center justify-center">
                  <svg
                    class="w-8 h-8 text-gray-400 mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                    />
                  </svg>
                  <p class="text-sm text-gray-700 mb-1">
                    {uploadingImage ? t('homepage.uploading') : t('homepage.dragImageHere')}
                    <button
                      type="button"
                      on:click={openImageFileDialog}
                      disabled={uploadingImage}
                      class="text-accent hover:text-accent-muted underline font-semibold ml-1 disabled:opacity-50"
                    >
                      {t('homepage.selectFile')}
                    </button>
                  </p>
                  <p class="text-xs text-gray-500">{t('homepage.supportsImages')}</p>
                </div>
              </div>
              <!-- Image URL Input -->
              <div class="flex items-center gap-2">
                <input
                  id="homepage-image-url"
                  type="url"
                  bind:value={formData.config.imageUrl}
                  class="flex-1 px-4 py-2 bg-white border border-gray-300 text-black"
                  placeholder={t('homepage.orEnterImageUrl')}
                />
                {#if formData.config.imageUrl}
                  <div class="w-16 h-16 bg-gray-100 overflow-hidden flex-shrink-0">
                    <img
                      src={formData.config.imageUrl}
                      alt="Preview"
                      class="w-full h-full object-cover"
                      on:error={(e) => {
                        const target = e.currentTarget;
                        if (target instanceof HTMLImageElement) {
                          target.style.display = 'none';
                        }
                      }}
                    />
                  </div>
                {/if}
              </div>
            </div>
          </div>

          {#if formData.type !== 'bleed_left' && formData.type !== 'bleed_right'}
            <!-- Video Upload -->
            <div>
              <label for="homepage-video-url" class="block text-sm font-medium mb-2"
                >{t('homepage.videoOptional')}</label
              >
              <div class="space-y-2">
                <!-- Drag & Drop Zone for Video -->
                <div
                  class="relative border-2 border-dashed p-4 text-center transition-all {isDraggingVideo
                    ? 'border-accent bg-accent/5'
                    : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100'}"
                  on:dragover={handleVideoDragOver}
                  on:dragleave={handleVideoDragLeave}
                  on:drop={handleVideoDrop}
                  role="button"
                  tabindex="0"
                  on:keydown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault();
                      openVideoFileDialog();
                    }
                  }}
                >
                  <input
                    bind:this={videoFileInput}
                    id="homepage-video-file"
                    type="file"
                    accept="video/*"
                    aria-label={t('homepage.videoOptional') || 'Video upload'}
                    on:change={handleVideoFileSelect}
                    class="hidden"
                  />
                  <div class="flex flex-col items-center justify-center">
                    <svg
                      class="w-8 h-8 text-gray-400 mb-2"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M15 10l4.553-2.276A1 1 0 0121 8.618v6.764a1 1 0 01-1.447.894L15 14M5 18h8a2 2 0 002-2V8a2 2 0 00-2-2H5a2 2 0 00-2 2v8a2 2 0 002 2z"
                      />
                    </svg>
                    <p class="text-sm text-gray-700 mb-1">
                      {uploadingVideo ? t('homepage.uploading') : t('homepage.dragVideoHere')}
                      <button
                        type="button"
                        on:click={openVideoFileDialog}
                        disabled={uploadingVideo}
                        class="text-accent hover:text-accent-muted underline font-semibold ml-1 disabled:opacity-50"
                      >
                        {t('homepage.selectFile')}
                      </button>
                    </p>
                    <p class="text-xs text-gray-500">{t('homepage.supportsVideos')}</p>
                  </div>
                </div>
                <!-- Video URL Input -->
                <input
                  id="homepage-video-url"
                  type="url"
                  bind:value={formData.config.videoUrl}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                  placeholder={t('homepage.orEnterVideoUrl')}
                />
                <!-- Video Settings -->
                {#if formData.config.videoUrl}
                  <div class="bg-gray-50 border border-gray-200 rounded p-4 space-y-3">
                    <h4 class="text-sm font-medium text-gray-700 mb-3">
                      {t('homepage.videoSettings')}
                    </h4>
                    <div class="grid grid-cols-1 md:grid-cols-2 gap-3">
                      <label class="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          bind:checked={formData.config.videoLoop}
                          class="w-4 h-4 text-accent border-gray-300 rounded focus:ring-accent"
                        />
                        <span class="text-sm text-gray-700">{t('homepage.loop')}</span>
                      </label>
                      <label class="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          bind:checked={formData.config.videoAutoplay}
                          class="w-4 h-4 text-accent border-gray-300 rounded focus:ring-accent"
                        />
                        <span class="text-sm text-gray-700">{t('homepage.autoplay')}</span>
                      </label>
                      <label class="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          bind:checked={formData.config.videoMuted}
                          class="w-4 h-4 text-accent border-gray-300 rounded focus:ring-accent"
                        />
                        <span class="text-sm text-gray-700">{t('homepage.muted')}</span>
                      </label>
                      <label class="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          bind:checked={formData.config.videoControls}
                          class="w-4 h-4 text-accent border-gray-300 rounded focus:ring-accent"
                        />
                        <span class="text-sm text-gray-700">{t('homepage.showControls')}</span>
                      </label>
                      <label class="flex items-center gap-2 cursor-pointer">
                        <input
                          type="checkbox"
                          bind:checked={formData.config.videoPlaysinline}
                          class="w-4 h-4 text-accent border-gray-300 rounded focus:ring-accent"
                        />
                        <span class="text-sm text-gray-700">{t('homepage.playsInline')}</span>
                      </label>
                    </div>
                  </div>
                {/if}
              </div>
            </div>
          {/if}
          {#if formData.type === 'hero' || formData.type === 'editorial' || formData.type === 'bleed_left' || formData.type === 'bleed_right' || formData.type === 'split_triple' || formData.type === 'center_title_media'}
            <div>
              <label for="homepage-description" class="block text-sm font-medium mb-2"
                >{t('homepage.description')}</label
              >
              <textarea
                id="homepage-description"
                bind:value={formData.config.description}
                rows="3"
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                placeholder={t('homepage.sectionDescription')}
              ></textarea>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label for="homepage-button-text" class="block text-sm font-medium mb-2"
                  >{t('homepage.buttonText')}</label
                >
                <input
                  id="homepage-button-text"
                  type="text"
                  bind:value={formData.config.buttonText}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                  placeholder={t('homepage.shopNow')}
                />
              </div>
              <div>
                <label for="homepage-button-link" class="block text-sm font-medium mb-2"
                  >{t('homepage.buttonLink')}</label
                >
                <input
                  id="homepage-button-link"
                  type="text"
                  bind:value={formData.config.buttonLink}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                  placeholder="/shop"
                />
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4 mt-2">
              <div>
                <label for="homepage-media-ratio" class="block text-sm font-medium mb-2"
                  >{t('homepage.mediaRatio')}</label
                >
                <select
                  id="homepage-media-ratio"
                  bind:value={formData.config.mediaAspectRatio}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                >
                  <option value="auto">{t('homepage.mediaRatioAuto')}</option>
                  <option value="1:1">{t('homepage.mediaRatioSquare')}</option>
                  <option value="4:5">{t('homepage.mediaRatioPortrait45')}</option>
                  <option value="3:4">{t('homepage.mediaRatioPortrait34')}</option>
                  <option value="16:9">{t('homepage.mediaRatioLandscape169')}</option>
                  <option value="9:16">{t('homepage.mediaRatioVertical916')}</option>
                </select>
              </div>
              <div>
                <label for="homepage-media-hover-effect" class="block text-sm font-medium mb-2"
                  >{t('homepage.hoverEffect')}</label
                >
                <select
                  id="homepage-media-hover-effect"
                  bind:value={formData.config.mediaHoverEffect}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                >
                  <option value="zoom">{t('homepage.hoverEffectZoom')}</option>
                  <option value="dim">{t('homepage.hoverEffectDim')}</option>
                  <option value="none">{t('homepage.hoverEffectNone')}</option>
                </select>
              </div>
              <div>
                <label for="homepage-media-link-mode" class="block text-sm font-medium mb-2"
                  >{t('homepage.linkOnMedia')}</label
                >
                <select
                  id="homepage-media-link-mode"
                  bind:value={formData.config.mediaLinkMode}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                >
                  <option value="hover">{t('homepage.linkOnMediaHover')}</option>
                  <option value="always">{t('homepage.linkOnMediaAlways')}</option>
                  <option value="none">{t('homepage.linkOnMediaHide')}</option>
                </select>
              </div>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mt-2">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  id="homepage-title-overlay"
                  type="checkbox"
                  bind:checked={formData.config.titleOverlayOnMedia}
                  class="w-4 h-4 text-accent border-gray-300 rounded focus:ring-accent"
                />
                <span class="text-sm text-gray-700">{t('homepage.titleOverlayOnMedia')}</span>
              </label>
              {#if formData.config.titleOverlayOnMedia}
                <div>
                  <label
                    for="homepage-title-overlay-position"
                    class="block text-sm font-medium mb-2">{t('homepage.titlePosition')}</label
                  >
                  <select
                    id="homepage-title-overlay-position"
                    bind:value={formData.config.titleOverlayPosition}
                    class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                  >
                    <option value="top">{t('homepage.positionTop')}</option>
                    <option value="center">{t('homepage.center')}</option>
                    <option value="bottom">{t('homepage.positionBottom')}</option>
                  </select>
                </div>
              {/if}
            </div>
          {/if}
        {/if}

        {#if formData.type === 'text_block'}
          <div>
            <label for="homepage-text-block-body" class="block text-sm font-medium mb-2"
              >{t('homepage.textBlockBody')}</label
            >
            <textarea
              id="homepage-text-block-body"
              bind:value={formData.config.description}
              rows="16"
              class="w-full px-4 py-2 bg-white border border-gray-300 text-black font-mono text-sm"
              placeholder={t('homepage.textBlockPlaceholder')}
            ></textarea>
          </div>
          <div class="pt-2 border-t border-accent/20">
            <h4 class="text-sm font-medium mb-3 text-accent-muted">
              {t('homepage.textBlockLayout')}
            </h4>
            <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
              <div>
                <label for="homepage-text-align" class="block text-sm font-medium mb-2"
                  >{t('homepage.textAlignment')}</label
                >
                <select
                  id="homepage-text-align"
                  bind:value={formData.config.textAlign}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                >
                  <option value="left">{t('homepage.left')}</option>
                  <option value="center">{t('homepage.center')}</option>
                  <option value="right">{t('homepage.right')}</option>
                </select>
              </div>
              <div>
                <label for="homepage-text-max-width" class="block text-sm font-medium mb-2"
                  >{t('homepage.textBlockMaxWidth')}</label
                >
                <select
                  id="homepage-text-max-width"
                  bind:value={formData.config.textBlockMaxWidth}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                >
                  <option value="narrow">{t('homepage.textBlockMaxWidthNarrow')}</option>
                  <option value="medium">{t('homepage.textBlockMaxWidthMedium')}</option>
                  <option value="wide">{t('homepage.textBlockMaxWidthWide')}</option>
                  <option value="full">{t('homepage.textBlockMaxWidthFull')}</option>
                </select>
              </div>
              <div>
                <label for="homepage-text-animation" class="block text-sm font-medium mb-2"
                  >{t('homepage.textBlockAnimation')}</label
                >
                <select
                  id="homepage-text-animation"
                  bind:value={formData.config.textBlockAnimation}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                >
                  <option value="fade_up">{t('homepage.textBlockAnimFadeUp')}</option>
                  <option value="fade">{t('homepage.textBlockAnimFade')}</option>
                  <option value="scale">{t('homepage.textBlockAnimScale')}</option>
                  <option value="none">{t('homepage.textBlockAnimNone')}</option>
                </select>
              </div>
              <div>
                <label for="homepage-padding-top" class="block text-sm font-medium mb-2"
                  >{t('homepage.paddingTop')}</label
                >
                <select
                  id="homepage-padding-top"
                  bind:value={formData.config.paddingTop}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                >
                  <option value="">{t('homepage.textBlockPaddingDefault')}</option>
                  <option value="py-10">py-10</option>
                  <option value="py-20">py-20</option>
                  <option value="py-32">py-32</option>
                  <option value="pt-10">pt-10</option>
                  <option value="pt-20">pt-20</option>
                </select>
              </div>
              <div>
                <label for="homepage-padding-bottom" class="block text-sm font-medium mb-2"
                  >{t('homepage.paddingBottom')}</label
                >
                <select
                  id="homepage-padding-bottom"
                  bind:value={formData.config.paddingBottom}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                >
                  <option value="">{t('homepage.textBlockPaddingDefault')}</option>
                  <option value="pb-10">pb-10</option>
                  <option value="pb-20">pb-20</option>
                  <option value="pb-32">pb-32</option>
                </select>
              </div>
            </div>
            <p class="text-xs text-accent-muted mt-3">{t('homepage.textBlockLayoutHint')}</p>
          </div>
        {/if}

        {#if formData.type === 'collection'}
          <div>
            <label for="homepage-product-search" class="block text-sm font-medium mb-2"
              >{t('homepage.selectProducts')}</label
            >
            <div class="mb-4">
              <div class="flex gap-2 mb-2">
                <input
                  id="homepage-product-search"
                  type="text"
                  bind:value={productSearchQuery}
                  on:input={() => handleProductSearch()}
                  class="flex-1 px-4 py-2 bg-white border border-gray-300 text-black"
                  placeholder={t('filter.searchProductsPlaceholder')}
                />
                <button
                  type="button"
                  on:click={handleProductSearch}
                  class="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-100 transition-colors text-black"
                >
                  {t('common.search')}
                </button>
              </div>
              <div class="max-h-64 overflow-y-auto bg-white border border-gray-300 p-2">
                {#if products.length === 0}
                  <p class="text-sm text-accent-muted p-2">{t('product.noProductsFound')}</p>
                {:else}
                  {#each products as product}
                    <label class="flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer">
                      <input
                        id={`homepage-product-${product.id}`}
                        type="checkbox"
                        checked={selectedProducts.includes(product.id)}
                        on:change={() => toggleProduct(product.id)}
                        class="w-4 h-4"
                      />
                      <span class="text-sm text-black">{product.name}</span>
                      {#if product.images?.[0]}
                        <img
                          src={product.images[0].url}
                          alt={product.name}
                          class="w-8 h-8 object-cover ml-auto"
                        />
                      {/if}
                    </label>
                  {/each}
                {/if}
              </div>
              {#if selectedProducts.length > 0}
                <p class="text-xs text-accent-muted mt-2">
                  {t('homepage.productsSelected', { count: selectedProducts.length })}
                </p>
              {/if}
            </div>
          </div>
        {/if}

        {#if formData.type === 'lookbook_preview'}
          <div>
            <label for="homepage-lookbook-search" class="block text-sm font-medium mb-2"
              >{t('homepage.selectLookbook')}</label
            >
            <div class="mb-4">
              <div class="flex gap-2 mb-2">
                <input
                  id="homepage-lookbook-search"
                  type="text"
                  bind:value={lookbookSearchQuery}
                  class="flex-1 px-4 py-2 bg-white border border-gray-300 text-black"
                  placeholder={t('homepage.searchLookbooks')}
                />
              </div>
              <div class="max-h-64 overflow-y-auto bg-white border border-gray-300 p-2">
                {#if filteredLookbooks.length === 0}
                  <p class="text-sm text-accent-muted p-2">{t('homepage.noLookbooksFound')}</p>
                {:else}
                  {#each filteredLookbooks as lookbook}
                    <label class="flex items-center gap-2 p-2 hover:bg-gray-100 cursor-pointer">
                      <input
                        id={`homepage-lookbook-${lookbook.id}`}
                        type="checkbox"
                        checked={selectedLookbook === lookbook.id}
                        on:change={() => toggleLookbook(lookbook.id)}
                        class="w-4 h-4"
                      />
                      <div class="flex-1">
                        <span class="text-sm text-black font-medium">{lookbook.title}</span>
                        {#if lookbook.season || lookbook.year}
                          <span class="text-xs text-gray-500 ml-2">
                            ({lookbook.season || ''}
                            {lookbook.year || ''})
                          </span>
                        {/if}
                      </div>
                      {#if lookbook.images?.[0]}
                        <img
                          src={lookbook.images[0].url}
                          alt={lookbook.title}
                          class="w-12 h-12 object-cover"
                        />
                      {/if}
                    </label>
                  {/each}
                {/if}
              </div>
              {#if selectedLookbook}
                <p class="text-xs text-accent-muted mt-2">1 lookbook selected</p>
              {/if}
            </div>
          </div>
        {/if}

        {#if formData.type === 'blog'}
          <div class="space-y-4">
            <div>
              <label for="homepage-blog-display-mode" class="block text-sm font-medium mb-2"
                >{t('homepage.blogDisplayMode') || 'Display mode'}</label
              >
              <select
                id="homepage-blog-display-mode"
                bind:value={formData.config.displayMode}
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
              >
                <option value="latest">{t('homepage.blogLatest') || 'Latest articles'}</option>
                <option value="featured">{t('homepage.blogFeatured') || 'Featured articles'}</option
                >
              </select>
            </div>
            {#if formData.config.displayMode === 'latest'}
              <div>
                <label for="homepage-blog-limit" class="block text-sm font-medium mb-2"
                  >{t('homepage.blogLimit') || 'Number of articles'}</label
                >
                <input
                  id="homepage-blog-limit"
                  type="number"
                  bind:value={formData.config.limit}
                  min="1"
                  max="12"
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                />
              </div>
            {:else}
              <div>
                <label for="homepage-blog-featured-posts" class="block text-sm font-medium mb-2"
                  >{t('homepage.blogFeaturedPosts') || 'Select articles'}</label
                >
                <div class="border border-gray-300 bg-white max-h-60 overflow-y-auto p-2 space-y-2">
                  {#each blogPosts as post}
                    <label
                      class="flex items-center gap-2 cursor-pointer hover:bg-gray-50 p-2 rounded"
                    >
                      <input
                        id={`homepage-blog-post-${post.id}`}
                        type="checkbox"
                        checked={formData.config.postIds?.includes(post.id)}
                        on:change={() => toggleBlogPost(post.id)}
                        class="w-4 h-4"
                      />
                      <span class="text-sm truncate flex-1">{post.title || post.slug}</span>
                    </label>
                  {/each}
                  {#if blogPosts.length === 0}
                    <p class="text-sm text-accent-muted p-2">
                      {t('homepage.noBlogPostsAdmin') || 'No articles in blog yet'}
                    </p>
                  {/if}
                </div>
              </div>
            {/if}
          </div>
        {/if}

        {#if formData.type === 'audio'}
          <div>
            <label for="homepage-audio-url" class="block text-sm font-medium mb-2"
              >{t('homepage.audioTrack')}</label
            >
            <div class="space-y-2">
              <div
                class="relative border-2 border-dashed p-4 text-center transition-all {isDraggingAudio
                  ? 'border-accent bg-accent/5'
                  : 'border-gray-300 bg-gray-50 hover:border-gray-400 hover:bg-gray-100'}"
                on:dragover={handleAudioDragOver}
                on:dragleave={handleAudioDragLeave}
                on:drop={handleAudioDrop}
                role="button"
                tabindex="0"
                on:keydown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault();
                    openAudioFileDialog();
                  }
                }}
              >
                <input
                  bind:this={audioFileInput}
                  id="homepage-audio-file"
                  type="file"
                  accept="audio/*"
                  aria-label={t('homepage.audioTrack') || 'Audio upload'}
                  on:change={handleAudioFileSelect}
                  class="hidden"
                />
                <div class="flex flex-col items-center justify-center">
                  <svg
                    class="w-8 h-8 text-gray-400 mb-2"
                    fill="none"
                    stroke="currentColor"
                    viewBox="0 0 24 24"
                  >
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M15.536 8.464a5 5 0 010 7.072m2.828-9.9a9 9 0 010 12.728M5.586 15H4a1 1 0 01-1-1v-4a1 1 0 011-1h1.586l4.707-4.707C10.923 8.076 11 7.551 11 7c0-.552-.077-1.076-.293-1.5L5.586 15z"
                    />
                  </svg>
                  <p class="text-sm text-gray-700 mb-1">
                    {uploadingAudio ? t('homepage.uploading') : t('homepage.dragAudioHere')}
                    <button
                      type="button"
                      on:click={openAudioFileDialog}
                      disabled={uploadingAudio}
                      class="text-accent hover:text-accent-muted underline font-semibold ml-1 disabled:opacity-50"
                    >
                      {t('homepage.selectFile')}
                    </button>
                  </p>
                  <p class="text-xs text-gray-500">{t('homepage.supportsAudio')}</p>
                </div>
              </div>
              <input
                id="homepage-audio-url"
                type="url"
                bind:value={formData.config.audioUrl}
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                placeholder={t('homepage.orEnterAudioUrl')}
              />
            </div>
          </div>

          <div class="bg-gray-50 border border-gray-200 rounded p-4 space-y-3">
            <h4 class="text-sm font-medium text-gray-700 mb-3">
              {t('homepage.playerCustomization')}
            </h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label
                  for="homepage-player-accent-color"
                  class="block text-xs font-medium mb-1 text-gray-600"
                  >{t('homepage.playerAccentColor')}</label
                >
                <div class="flex gap-2">
                  <input
                    id="homepage-player-accent-color-picker"
                    type="color"
                    value={hexForColorInput(formData.config.playerAccentColor, '#000000')}
                    aria-label={t('homepage.playerAccentColor') || 'Player accent color picker'}
                    on:input={(e) => {
                      const el = e.currentTarget;
                      if (el instanceof HTMLInputElement)
                        formData.config.playerAccentColor = el.value;
                    }}
                    class="w-12 h-10 border cursor-pointer"
                  />
                  <input
                    id="homepage-player-accent-color"
                    type="text"
                    bind:value={formData.config.playerAccentColor}
                    class="flex-1 px-3 py-2 text-sm bg-white border border-gray-300 text-black"
                  />
                </div>
              </div>
              <div>
                <label
                  for="homepage-player-bg-color"
                  class="block text-xs font-medium mb-1 text-gray-600"
                  >{t('homepage.playerBgColor')}</label
                >
                <div class="flex gap-2">
                  <input
                    id="homepage-player-bg-color-picker"
                    type="color"
                    value={hexForColorInput(formData.config.playerBgColor, '#fafafa')}
                    aria-label={t('homepage.playerBgColor') || 'Player background color picker'}
                    on:input={(e) => {
                      const el = e.currentTarget;
                      if (el instanceof HTMLInputElement) formData.config.playerBgColor = el.value;
                    }}
                    class="w-12 h-10 border cursor-pointer"
                  />
                  <input
                    id="homepage-player-bg-color"
                    type="text"
                    bind:value={formData.config.playerBgColor}
                    class="flex-1 px-3 py-2 text-sm bg-white border border-gray-300 text-black"
                  />
                </div>
              </div>
            </div>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-3 pt-2">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  bind:checked={formData.config.showPlayPause}
                  class="w-4 h-4"
                />
                <span class="text-sm text-gray-700">{t('homepage.showPlayPause')}</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  bind:checked={formData.config.showProgress}
                  class="w-4 h-4"
                />
                <span class="text-sm text-gray-700">{t('homepage.showProgress')}</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" bind:checked={formData.config.showTime} class="w-4 h-4" />
                <span class="text-sm text-gray-700">{t('homepage.showTime')}</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" bind:checked={formData.config.showVolume} class="w-4 h-4" />
                <span class="text-sm text-gray-700">{t('homepage.showVolume')}</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input type="checkbox" bind:checked={formData.config.autoplay} class="w-4 h-4" />
                <span class="text-sm text-gray-700">{t('homepage.autoplay')}</span>
              </label>
            </div>
          </div>
        {/if}

        {#if formData.type === 'card' || formData.type === 'split_triple'}
          <div>
            <div class="flex justify-between items-center mb-4">
              <label class="block text-sm font-medium" for="homepage-cards"
                >{t('homepage.cards')}</label
              >
              <button
                type="button"
                on:click={addCard}
                class="px-4 py-2 bg-accent text-dark text-sm hover:bg-accent-muted transition-colors"
              >
                {t('homepage.addCard')}
              </button>
            </div>

            <!-- Grid Settings -->
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label for="homepage-card-grid-columns" class="block text-sm font-medium mb-2"
                  >{t('homepage.gridColumns')}</label
                >
                <select
                  id="homepage-card-grid-columns"
                  bind:value={formData.config.gridColumns}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                >
                  <option value="grid-cols-1">{t('homepage.gridColumns1')}</option>
                  <option value="grid-cols-1 md:grid-cols-2">{t('homepage.gridColumns2')}</option>
                  <option value="grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
                    >{t('homepage.gridColumns3')}</option
                  >
                  <option value="grid-cols-1 md:grid-cols-2 lg:grid-cols-4"
                    >{t('homepage.gridColumns4')}</option
                  >
                  <option value="grid-cols-2 md:grid-cols-3 lg:grid-cols-4"
                    >{t('homepage.gridColumns4Always')}</option
                  >
                </select>
              </div>
              <div>
                <label for="homepage-card-gap" class="block text-sm font-medium mb-2"
                  >{t('homepage.gap')}</label
                >
                <select
                  id="homepage-card-gap"
                  bind:value={formData.config.gap}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                >
                  <option value="gap-2">{t('homepage.gapSmall')}</option>
                  <option value="gap-4">{t('homepage.gapMedium')}</option>
                  <option value="gap-6">{t('homepage.gapLarge')}</option>
                  <option value="gap-8">{t('homepage.gapExtraLarge')}</option>
                </select>
              </div>
            </div>

            <!-- Cards List -->
            <div class="space-y-4">
              {#each formData.config.cards as card, index}
                <div class="bg-white border border-gray-300 p-4">
                  <div class="flex justify-between items-center mb-4">
                    <h4 class="font-medium">{t('homepage.card')} {index + 1}</h4>
                    <button
                      type="button"
                      on:click={() => removeCard(index)}
                      class="text-red-500 hover:text-red-700 text-sm"
                    >
                      {t('common.remove')}
                    </button>
                  </div>

                  <div class="space-y-4">
                    <!-- Media Type Selection -->
                    <div>
                      <div class="block text-sm font-medium mb-2">{t('homepage.mediaType')}</div>
                      <div class="flex gap-4">
                        <label class="flex items-center gap-2">
                          <input
                            type="radio"
                            name="card-{index}-media"
                            checked={!card.videoUrl && !!card.imageUrl}
                            on:change={() => {
                              updateCard(index, 'videoUrl', '');
                              if (!card.imageUrl) updateCard(index, 'imageUrl', '');
                              cardDraggingStates[index] = false;
                            }}
                            class="w-4 h-4"
                          />
                          <span class="text-sm">{t('homepage.image')}</span>
                        </label>
                        <label class="flex items-center gap-2">
                          <input
                            type="radio"
                            name="card-{index}-media"
                            checked={!!card.videoUrl}
                            on:change={() => {
                              updateCard(index, 'imageUrl', '');
                              if (!card.videoUrl) updateCard(index, 'videoUrl', '');
                              cardDraggingStates[index] = false;
                            }}
                            class="w-4 h-4"
                          />
                          <span class="text-sm">{t('homepage.video')}</span>
                        </label>
                      </div>
                    </div>

                    <!-- Image Upload with Drag & Drop -->
                    {#if !card.videoUrl}
                      <div>
                        <label
                          for={`homepage-card-image-url-${index}`}
                          class="block text-sm font-medium mb-2">{t('homepage.imageUrl')}</label
                        >

                        <!-- Drag & Drop Zone -->
                        <div
                          class="relative border-2 border-dashed p-6 text-center transition-all {cardDraggingStates[
                            index
                          ]
                            ? 'border-black bg-black/5'
                            : 'border-black/30 bg-white hover:border-black/50 hover:bg-black/5'}"
                          on:dragover={(e) => handleCardDragOver(e, index)}
                          on:dragleave={(e) => handleCardDragLeave(e, index)}
                          on:drop={(e) => handleCardDrop(e, index)}
                          role="button"
                          tabindex="0"
                          on:keydown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openCardFileDialog(index);
                            }
                          }}
                        >
                          <input
                            id={`homepage-card-file-${index}`}
                            bind:this={cardFileInputs[index]}
                            type="file"
                            accept="image/*,video/*"
                            aria-label={t('homepage.imageUrl') || 'Card media upload'}
                            on:change={(e) => handleCardFileSelect(e, index)}
                            class="hidden"
                          />

                          {#if cardUploadingStates[index]}
                            <div class="flex flex-col items-center justify-center">
                              <div
                                class="animate-spin rounded-full h-8 w-8 border-b-2 border-black mb-2"
                              ></div>
                              <p class="text-sm text-black/60">{t('common.uploading')}</p>
                            </div>
                          {:else if card.imageUrl}
                            <div class="flex flex-col items-center justify-center">
                              <img
                                src={card.imageUrl}
                                alt="Preview"
                                class="max-w-full h-32 object-cover rounded mb-2"
                                on:error={(e) => {
                                  const target = e.currentTarget;
                                  if (target instanceof HTMLImageElement) {
                                    target.style.display = 'none';
                                  }
                                }}
                              />
                              <p class="text-xs text-black/60 mb-2">
                                {t('homepage.dragNewImageHere')}
                                <button
                                  type="button"
                                  on:click={() => openCardFileDialog(index)}
                                  class="text-black underline font-semibold ml-1 hover:no-underline"
                                >
                                  {t('homepage.selectFile')}
                                </button>
                              </p>
                              <button
                                type="button"
                                on:click={() => updateCard(index, 'imageUrl', '')}
                                class="text-xs text-red-500 hover:text-red-700"
                              >
                                {t('homepage.removeImage')}
                              </button>
                            </div>
                          {:else}
                            <div class="flex flex-col items-center justify-center">
                              <svg
                                class="w-12 h-12 text-black/40 mb-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="1.5"
                                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                                />
                              </svg>
                              <p class="text-sm font-medium text-black mb-2">
                                {t('homepage.dragImageHere')}
                                <button
                                  type="button"
                                  on:click={() => openCardFileDialog(index)}
                                  class="text-black underline font-semibold ml-1 hover:no-underline"
                                >
                                  {t('homepage.selectFile')}
                                </button>
                              </p>
                              <p class="text-xs text-black/60">
                                {t('homepage.supportsImagesShort')}
                              </p>
                            </div>
                          {/if}
                        </div>

                        <!-- Manual URL input (optional) -->
                        {#if card.imageUrl}
                          <div class="mt-3">
                            <label
                              for={`homepage-card-image-url-manual-${index}`}
                              class="block text-xs font-medium mb-1 text-black/60"
                              >{t('homepage.orEnterUrlManually')}</label
                            >
                            <input
                              id={`homepage-card-image-url-manual-${index}`}
                              type="url"
                              value={card.imageUrl || ''}
                              on:input={(e) => {
                                const target = e.target;
                                if (target && 'value' in target) {
                                  updateCard(index, 'imageUrl', String(target.value));
                                }
                              }}
                              class="w-full px-3 py-2 text-sm bg-white border border-gray-300 text-black"
                              placeholder="https://example.com/image.jpg"
                            />
                          </div>
                        {/if}
                      </div>
                    {/if}

                    <!-- Video Upload with Drag & Drop -->
                    {#if card.videoUrl}
                      <div>
                        <label
                          for={`homepage-card-video-url-${index}`}
                          class="block text-sm font-medium mb-2">{t('homepage.videoUrl')}</label
                        >

                        <!-- Drag & Drop Zone -->
                        <div
                          class="relative border-2 border-dashed p-6 text-center transition-all {cardDraggingStates[
                            index
                          ]
                            ? 'border-black bg-black/5'
                            : 'border-black/30 bg-white hover:border-black/50 hover:bg-black/5'}"
                          on:dragover={(e) => handleCardDragOver(e, index)}
                          on:dragleave={(e) => handleCardDragLeave(e, index)}
                          on:drop={(e) => handleCardDrop(e, index)}
                          role="button"
                          tabindex="0"
                          on:keydown={(e) => {
                            if (e.key === 'Enter' || e.key === ' ') {
                              e.preventDefault();
                              openCardFileDialog(index);
                            }
                          }}
                        >
                          <input
                            id={`homepage-card-video-file-${index}`}
                            bind:this={cardFileInputs[index]}
                            type="file"
                            accept="image/*,video/*"
                            aria-label={t('homepage.videoUrl') || 'Card video upload'}
                            on:change={(e) => handleCardFileSelect(e, index)}
                            class="hidden"
                          />

                          {#if cardUploadingStates[index]}
                            <div class="flex flex-col items-center justify-center">
                              <div
                                class="animate-spin rounded-full h-8 w-8 border-b-2 border-black mb-2"
                              ></div>
                              <p class="text-sm text-black/60">{t('common.uploading')}</p>
                            </div>
                          {:else if card.videoUrl}
                            <div class="flex flex-col items-center justify-center">
                              <video
                                src={card.videoUrl}
                                class="max-w-full h-32 object-cover rounded mb-2"
                                controls
                                muted
                              ></video>
                              <p class="text-xs text-black/60 mb-2">
                                {t('homepage.dragNewVideoHere')}
                                <button
                                  type="button"
                                  on:click={() => openCardFileDialog(index)}
                                  class="text-black underline font-semibold ml-1 hover:no-underline"
                                >
                                  {t('homepage.selectFile')}
                                </button>
                              </p>
                              <button
                                type="button"
                                on:click={() => updateCard(index, 'videoUrl', '')}
                                class="text-xs text-red-500 hover:text-red-700"
                              >
                                {t('homepage.removeVideo')}
                              </button>
                            </div>
                          {:else}
                            <div class="flex flex-col items-center justify-center">
                              <svg
                                class="w-12 h-12 text-black/40 mb-4"
                                fill="none"
                                stroke="currentColor"
                                viewBox="0 0 24 24"
                              >
                                <path
                                  stroke-linecap="round"
                                  stroke-linejoin="round"
                                  stroke-width="1.5"
                                  d="M7 16a4 4 0 01-.88-7.903A5 5 0 1115.9 6L16 6a5 5 0 011 9.9M15 13l-3-3m0 0l-3 3m3-3v12"
                                />
                              </svg>
                              <p class="text-sm font-medium text-black mb-2">
                                Drag video here or
                                <button
                                  type="button"
                                  on:click={() => openCardFileDialog(index)}
                                  class="text-black underline font-semibold ml-1 hover:no-underline"
                                >
                                  {t('homepage.selectFile')}
                                </button>
                              </p>
                              <p class="text-xs text-black/60">
                                {t('homepage.supportsVideosShort')}
                              </p>
                            </div>
                          {/if}
                        </div>

                        <!-- Manual URL input (optional) -->
                        {#if card.videoUrl}
                          <div class="mt-3">
                            <label
                              for={`homepage-card-video-url-manual-${index}`}
                              class="block text-xs font-medium mb-1 text-black/60"
                              >{t('homepage.orEnterUrlManually')}</label
                            >
                            <input
                              id={`homepage-card-video-url-manual-${index}`}
                              type="url"
                              value={card.videoUrl || ''}
                              on:input={(e) => {
                                const target = e.target;
                                if (target && 'value' in target) {
                                  updateCard(index, 'videoUrl', String(target.value));
                                }
                              }}
                              class="w-full px-3 py-2 text-sm bg-white border border-gray-300 text-black"
                              placeholder="https://example.com/video.mp4"
                            />
                          </div>
                        {/if}
                      </div>
                    {/if}

                    <!-- Title -->
                    <div>
                      <label
                        for={`homepage-card-title-${index}`}
                        class="block text-sm font-medium mb-2"
                        >{t('homepage.titleTextOverlay')}</label
                      >
                      <input
                        id={`homepage-card-title-${index}`}
                        type="text"
                        value={card.title || ''}
                        on:input={(e) => {
                          const target = e.target;
                          if (target && 'value' in target) {
                            updateCard(index, 'title', String(target.value));
                          }
                        }}
                        class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                        placeholder={t('homepage.cardTitle')}
                      />
                    </div>

                    <!-- Link -->
                    <div>
                      <label
                        for={`homepage-card-link-${index}`}
                        class="block text-sm font-medium mb-2">{t('homepage.linkUrl')}</label
                      >
                      <input
                        id={`homepage-card-link-${index}`}
                        type="url"
                        value={card.link || ''}
                        on:input={(e) => {
                          const target = e.target;
                          if (target && 'value' in target) {
                            updateCard(index, 'link', String(target.value));
                          }
                        }}
                        class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                        placeholder="/shop or https://example.com"
                      />
                      <p class="text-xs text-accent-muted mt-1">
                        {t('homepage.entireCardClickable')}
                      </p>
                    </div>

                    <!-- Border Radius: use ?? so empty/rounded-none is shown correctly -->
                    <div>
                      <label
                        for={`homepage-card-border-radius-${index}`}
                        class="block text-sm font-medium mb-2">{t('homepage.borderRadius')}</label
                      >
                      <select
                        id={`homepage-card-border-radius-${index}`}
                        value={card.borderRadius === ''
                          ? 'rounded-none'
                          : (card.borderRadius ?? 'rounded-lg')}
                        on:change={(e) => {
                          const target = e.target;
                          if (target && 'value' in target) {
                            updateCard(index, 'borderRadius', String(target.value));
                          }
                        }}
                        class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                      >
                        <option value="rounded-none"
                          >{t('homepage.borderRadiusNone') || 'None (0)'}</option
                        >
                        <option value="rounded-sm">{t('homepage.borderRadiusSmall')}</option>
                        <option value="rounded">{t('homepage.borderRadiusMedium')}</option>
                        <option value="rounded-lg">{t('homepage.borderRadiusLarge')}</option>
                        <option value="rounded-xl">{t('homepage.borderRadiusXl')}</option>
                        <option value="rounded-2xl">{t('homepage.borderRadius2xl')}</option>
                        <option value="rounded-full">{t('homepage.borderRadiusFull')}</option>
                      </select>
                    </div>

                    <!-- Title Color -->
                    <div>
                      <label
                        for={`homepage-card-title-color-${index}`}
                        class="block text-sm font-medium mb-2">{t('homepage.titleColor')}</label
                      >
                      <div class="flex gap-3 items-center">
                        <input
                          id={`homepage-card-title-color-picker-${index}`}
                          type="color"
                          value={hexForColorInput(card.titleColor, '#ffffff')}
                          aria-label="Card title color picker"
                          on:input={(e) => {
                            const target = e.target;
                            if (target && 'value' in target) {
                              updateCard(index, 'titleColor', String(target.value));
                            }
                          }}
                          class="w-16 h-10 border border-gray-300 cursor-pointer"
                        />
                        <input
                          id={`homepage-card-title-color-${index}`}
                          type="text"
                          value={card.titleColor || '#ffffff'}
                          on:input={(e) => {
                            const target = e.target;
                            if (target && 'value' in target) {
                              updateCard(index, 'titleColor', String(target.value));
                            }
                          }}
                          class="flex-1 px-4 py-2 bg-white border border-gray-300 text-black"
                          placeholder="#ffffff"
                        />
                      </div>
                      <p class="text-xs text-accent-muted mt-1">
                        Choose the color for the title text
                      </p>
                    </div>

                    <!-- Show Title on Hover -->
                    <div>
                      <label
                        class="flex items-center gap-2"
                        for={`homepage-card-show-title-${index}`}
                      >
                        <input
                          id={`homepage-card-show-title-${index}`}
                          type="checkbox"
                          checked={card.showTitleOnHover || false}
                          on:change={(e) => {
                            const target = e.target;
                            if (target && 'checked' in target) {
                              updateCard(index, 'showTitleOnHover', Boolean(target.checked));
                            }
                          }}
                          class="w-4 h-4"
                        />
                        <span class="text-sm font-medium">{t('homepage.showTitleOnHover')}</span>
                      </label>
                      <p class="text-xs text-accent-muted mt-1 ml-6">
                        Title will only appear when hovering over the card
                      </p>
                    </div>
                  </div>
                </div>
              {/each}

              {#if formData.config.cards.length === 0}
                <p class="text-sm text-accent-muted text-center py-8">
                  No cards added. Click "Add Card" to create one.
                </p>
              {/if}
            </div>
          </div>
        {/if}

        <!-- Design Settings -->
        <div class="pt-6 border-t border-accent/20">
          <h4 class="text-lg font-medium mb-4">{t('homepage.designSettings')}</h4>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label for="homepage-background-color" class="block text-sm font-medium mb-2"
                >{t('homepage.backgroundColor')}</label
              >
              <div class="flex gap-2">
                <input
                  id="homepage-background-color-picker"
                  type="color"
                  value={hexForColorInput(formData.config.backgroundColor, '#ffffff')}
                  aria-label={t('homepage.backgroundColor') || 'Background color picker'}
                  on:input={(e) => {
                    const el = e.currentTarget;
                    if (el instanceof HTMLInputElement) formData.config.backgroundColor = el.value;
                  }}
                  class="w-16 h-10 border border-gray-300 cursor-pointer"
                />
                <input
                  id="homepage-background-color"
                  type="text"
                  bind:value={formData.config.backgroundColor}
                  class="flex-1 px-4 py-2 bg-white border border-gray-300 text-black"
                  placeholder="#ffffff or transparent"
                />
              </div>
            </div>
            <div>
              <label for="homepage-text-color" class="block text-sm font-medium mb-2"
                >{t('homepage.textColor')}</label
              >
              <div class="flex gap-2">
                <input
                  id="homepage-text-color-picker"
                  type="color"
                  value={hexForColorInput(formData.config.textColor, '#000000')}
                  aria-label={t('homepage.textColor') || 'Text color picker'}
                  on:input={(e) => {
                    const el = e.currentTarget;
                    if (el instanceof HTMLInputElement) formData.config.textColor = el.value;
                  }}
                  class="w-16 h-10 border border-gray-300 cursor-pointer"
                />
                <input
                  id="homepage-text-color"
                  type="text"
                  bind:value={formData.config.textColor}
                  class="flex-1 px-4 py-2 bg-white border border-gray-300 text-black"
                  placeholder="#000000"
                />
              </div>
            </div>
          </div>

          {#if formData.type === 'hero' || formData.type === 'editorial'}
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label for="homepage-button-bg-color" class="block text-sm font-medium mb-2"
                  >{t('homepage.buttonBackgroundColor')}</label
                >
                <div class="flex gap-2">
                  <input
                    id="homepage-button-bg-color-picker"
                    type="color"
                    value={hexForColorInput(formData.config.buttonColor, '#000000')}
                    aria-label={t('homepage.buttonBackgroundColor') ||
                      'Button background color picker'}
                    on:input={(e) => {
                      const el = e.currentTarget;
                      if (el instanceof HTMLInputElement) formData.config.buttonColor = el.value;
                    }}
                    class="w-16 h-10 border border-gray-300 cursor-pointer"
                  />
                  <input
                    id="homepage-button-bg-color"
                    type="text"
                    bind:value={formData.config.buttonColor}
                    class="flex-1 px-4 py-2 bg-white border border-gray-300 text-black"
                    placeholder="#000000"
                  />
                </div>
              </div>
              <div>
                <label for="homepage-button-text-color" class="block text-sm font-medium mb-2"
                  >{t('homepage.buttonTextColor')}</label
                >
                <div class="flex gap-2">
                  <input
                    id="homepage-button-text-color-picker"
                    type="color"
                    value={hexForColorInput(formData.config.buttonTextColor, '#ffffff')}
                    aria-label={t('homepage.buttonTextColor') || 'Button text color picker'}
                    on:input={(e) => {
                      const el = e.currentTarget;
                      if (el instanceof HTMLInputElement)
                        formData.config.buttonTextColor = el.value;
                    }}
                    class="w-16 h-10 border border-gray-300 cursor-pointer"
                  />
                  <input
                    id="homepage-button-text-color"
                    type="text"
                    bind:value={formData.config.buttonTextColor}
                    class="flex-1 px-4 py-2 bg-white border border-gray-300 text-black"
                    placeholder="#ffffff"
                  />
                </div>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label for="homepage-title-size" class="block text-sm font-medium mb-2"
                  >{t('homepage.titleSize')}</label
                >
                <select
                  id="homepage-title-size"
                  bind:value={formData.config.titleSize}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                >
                  <option value="">{t('homepage.sizeDefault')}</option>
                  <option value="text-4xl">{t('homepage.sizeSmallText4xl')}</option>
                  <option value="text-5xl">{t('homepage.sizeMediumText5xl')}</option>
                  <option value="text-6xl">{t('homepage.sizeLargeText6xl')}</option>
                  <option value="text-7xl">{t('homepage.sizeExtraLargeText7xl')}</option>
                  <option value="text-8xl">{t('homepage.size2xlText8xl')}</option>
                  <option value="text-9xl">{t('homepage.size3xlText9xl')}</option>
                </select>
              </div>
              <div>
                <label for="homepage-subtitle-size" class="block text-sm font-medium mb-2"
                  >{t('homepage.subtitleSize')}</label
                >
                <select
                  id="homepage-subtitle-size"
                  bind:value={formData.config.subtitleSize}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                >
                  <option value="">{t('homepage.sizeDefault')}</option>
                  <option value="text-lg">{t('homepage.sizeSmallTextLg')}</option>
                  <option value="text-xl">{t('homepage.sizeMediumTextXl')}</option>
                  <option value="text-2xl">{t('homepage.sizeLargeText2xl')}</option>
                  <option value="text-3xl">{t('homepage.sizeExtraLargeText3xl')}</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
              <div>
                <label for="homepage-text-alignment" class="block text-sm font-medium mb-2"
                  >{t('homepage.textAlignment')}</label
                >
                <select
                  id="homepage-text-alignment"
                  bind:value={formData.config.textAlign}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                >
                  <option value="left">{t('homepage.left')}</option>
                  <option value="center">{t('homepage.center')}</option>
                  <option value="right">{t('homepage.right')}</option>
                </select>
              </div>
              <div>
                <label for="homepage-image-opacity" class="block text-sm font-medium mb-2"
                  >{t('homepage.imageOpacity')}</label
                >
                <input
                  id="homepage-image-opacity"
                  type="number"
                  bind:value={formData.config.imageOpacity}
                  min="0"
                  max="100"
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                  placeholder="50"
                />
              </div>
              <div>
                <label for="homepage-section-height" class="block text-sm font-medium mb-2"
                  >{t('homepage.sectionHeight')}</label
                >
                <select
                  id="homepage-section-height"
                  bind:value={formData.config.sectionHeight}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                >
                  <option value="">{t('homepage.heightAuto')}</option>
                  <option value="h-screen">{t('homepage.heightFullScreen')}</option>
                  <option value="h-[60vh]">60vh</option>
                  <option value="h-[80vh]">80vh</option>
                  <option value="min-h-screen">{t('homepage.heightMinFullScreen')}</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label for="homepage-padding-top-design" class="block text-sm font-medium mb-2"
                  >{t('homepage.paddingTop')}</label
                >
                <select
                  id="homepage-padding-top-design"
                  bind:value={formData.config.paddingTop}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                >
                  <option value="">{t('homepage.sizeDefault')}</option>
                  <option value="py-10">{t('homepage.paddingSmall')}</option>
                  <option value="py-20">{t('homepage.paddingMedium')}</option>
                  <option value="py-32">{t('homepage.paddingLarge')}</option>
                  <option value="pt-10">{t('homepage.paddingTopOnlySmall')}</option>
                  <option value="pt-20">{t('homepage.paddingTopOnlyMedium')}</option>
                </select>
              </div>
              <div>
                <label for="homepage-padding-bottom-design" class="block text-sm font-medium mb-2"
                  >{t('homepage.paddingBottom')}</label
                >
                <select
                  id="homepage-padding-bottom-design"
                  bind:value={formData.config.paddingBottom}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                >
                  <option value="">{t('homepage.sizeDefault')}</option>
                  <option value="pb-10">{t('homepage.paddingSmall')}</option>
                  <option value="pb-20">{t('homepage.paddingMedium')}</option>
                  <option value="pb-32">{t('homepage.paddingLarge')}</option>
                </select>
              </div>
            </div>

            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label for="homepage-overlay-color" class="block text-sm font-medium mb-2"
                  >{t('homepage.overlayColor')}</label
                >
                <div class="flex gap-2">
                  <input
                    id="homepage-overlay-color-picker"
                    type="color"
                    value={hexForColorInput(formData.config.overlayColor, '#000000')}
                    aria-label={t('homepage.overlayColor') || 'Overlay color picker'}
                    on:input={(e) => {
                      const el = e.currentTarget;
                      if (el instanceof HTMLInputElement) formData.config.overlayColor = el.value;
                    }}
                    class="w-16 h-10 border border-gray-300 cursor-pointer"
                  />
                  <input
                    id="homepage-overlay-color"
                    type="text"
                    bind:value={formData.config.overlayColor}
                    class="flex-1 px-4 py-2 bg-white border border-gray-300 text-black"
                    placeholder="#000000"
                  />
                </div>
              </div>
              <div>
                <label for="homepage-overlay-opacity" class="block text-sm font-medium mb-2"
                  >{t('homepage.overlayOpacity')}</label
                >
                <input
                  id="homepage-overlay-opacity"
                  type="number"
                  bind:value={formData.config.overlayOpacity}
                  min="0"
                  max="100"
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                  placeholder="0"
                />
              </div>
            </div>
          {/if}
        </div>

        <div class="flex items-center gap-2 pt-4 border-t border-accent/20">
          <input type="checkbox" bind:checked={formData.isActive} id="isActive" class="" />
          <label for="isActive" class="text-sm font-medium">
            {t('homepage.activeVisible')}
          </label>
        </div>

        <div class="flex gap-4 pt-4">
          <button
            on:click={saveSection}
            class="px-6 py-2 bg-accent text-dark hover:bg-accent-muted transition-colors"
          >
            {editingSection ? t('homepage.update') : t('homepage.create')}
            {t('homepage.section')}
          </button>
          <button
            on:click={() => (showForm = false)}
            class="px-6 py-2 bg-white border border-gray-300 hover:bg-gray-100 transition-colors text-black"
          >
            {t('homepage.cancel')}
          </button>
        </div>
      </div>
    </div>
  {/if}

  {#if loading}
    <div class="w-full py-8"><LoadingBar /></div>
  {:else if error}
    <p class="text-red-400">Error: {error}</p>
  {:else if sections.length === 0}
    <div class="bg-dark-light p-8 text-center">
      <p class="text-accent-muted mb-4">{t('homepage.noSectionsFound')}</p>
      <button
        on:click={() => openForm()}
        class="px-6 py-2 bg-accent text-dark hover:bg-accent-muted transition-colors"
      >
        {t('homepage.createFirstSection')}
      </button>
    </div>
  {:else}
    <div class="space-y-4">
      {#each sections as section, index}
        <div class="bg-dark-light p-6 {!section.isActive ? 'opacity-60' : ''}">
          <div class="flex justify-between items-start mb-4">
            <div class="flex-1">
              <div class="flex items-center gap-3 mb-2">
                <span class="px-2 py-1 bg-accent/20 text-accent text-xs font-medium">
                  #{section.order}
                </span>
                <h3 class="text-xl font-medium">
                  {section.title || getSectionTypeLabel(section.type)}
                </h3>
                <span class="px-2 py-1 bg-white/20 text-white text-xs">
                  {getSectionTypeLabel(section.type)}
                </span>
                {#if !section.isActive}
                  <span class="px-2 py-1 bg-gray-500/20 text-gray-400 text-xs">
                    {t('homepage.inactive')}
                  </span>
                {/if}
              </div>
              <p class="text-sm text-accent-muted mb-2">
                {#if section.type === 'audio'}
                  {section.config?.audioUrl
                    ? t('homepage.audioSection')
                    : t('homepage.noDescription')}
                {:else}
                  {section.config?.description || t('homepage.noDescription')}
                {/if}
              </p>
              {#if section.config?.imageUrl}
                <div class="mt-2">
                  <img
                    src={section.config.imageUrl}
                    alt={section.title || section.type}
                    class="max-w-xs h-24 object-cover"
                    on:error={(e) => {
                      try {
                        const target = e.currentTarget;
                        if (target && target instanceof HTMLImageElement) {
                          target.style.display = 'none';
                        }
                      } catch {
                        // Ignore errors
                      }
                    }}
                  />
                </div>
              {/if}
            </div>
            <div class="flex items-center gap-2 ml-4">
              <div class="flex flex-col gap-1">
                <button
                  on:click={() => moveSection(section.id, 'up')}
                  disabled={index === 0}
                  class="px-2 py-1 bg-white border border-gray-300 text-sm hover:bg-gray-100 transition-colors text-black disabled:opacity-50 disabled:cursor-not-allowed"
                  title={t('homepage.moveUp')}
                >
                  ↑
                </button>
                <button
                  on:click={() => moveSection(section.id, 'down')}
                  disabled={index === sections.length - 1}
                  class="px-2 py-1 bg-white border border-gray-300 text-sm hover:bg-gray-100 transition-colors text-black disabled:opacity-50 disabled:cursor-not-allowed"
                  title={t('homepage.moveDown')}
                >
                  ↓
                </button>
              </div>
              <label class="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300">
                <input
                  type="checkbox"
                  checked={section.isActive}
                  on:change={() => toggleSection(section.id, section.isActive)}
                  class="w-4 h-4"
                />
                <span class="text-sm text-black">{t('homepage.active')}</span>
              </label>
              <button
                on:click={() => openTranslationEditor(section)}
                class="px-4 py-2 bg-white border border-blue-500/20 hover:bg-blue-50 transition-colors text-blue-400"
                title={t('homepage.translations')}
              >
                {t('homepage.translations')}
              </button>
              <button
                on:click={() => openForm(section)}
                class="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-100 transition-colors text-black"
              >
                {t('homepage.edit')}
              </button>
              <button
                on:click={(e) => deleteSection(section.id, e)}
                class="px-4 py-2 bg-white border border-red-500/20 hover:bg-red-50 transition-colors text-red-400"
              >
                {t('homepage.delete')}
              </button>
            </div>
          </div>
        </div>
      {/each}
    </div>
  {/if}

  {#if showTranslations && selectedSectionForTranslation}
    <div class="fixed inset-0 bg-black/50 z-50 flex items-center justify-center p-4">
      <div class="bg-dark-light max-w-4xl w-full max-h-[90vh] overflow-y-auto p-6">
        <div class="flex justify-between items-center mb-6">
          <h3 class="text-2xl font-bold">
            {t('homepage.translations')} - {selectedSectionForTranslation.title ||
              getSectionTypeLabel(selectedSectionForTranslation.type)}
          </h3>
          <button
            on:click={closeTranslationEditor}
            class="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-100 transition-colors text-black"
          >
            {t('common.close')}
          </button>
        </div>

        <!-- Translation Form -->
        <div class="mb-6 p-4 bg-white border border-gray-300">
          <h4 class="text-lg font-medium mb-4">
            {editingTranslation ? t('homepage.editTranslation') : t('homepage.addTranslation')}
          </h4>
          <div class="space-y-4">
            <div>
              <label for="homepage-translation-language" class="block text-sm font-medium mb-2"
                >{t('language.language')} *</label
              >
              <select
                id="homepage-translation-language"
                bind:value={selectedLanguageForTranslation}
                disabled={!!editingTranslation}
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black disabled:opacity-50"
              >
                <option value="">{t('common.select')} {t('language.language').toLowerCase()}</option
                >
                {#each languages as lang}
                  {#if selectedSectionForTranslation && (!translations[selectedSectionForTranslation.id]?.find((t) => t.languageCode === lang.code) || editingTranslation?.languageCode === lang.code)}
                    <option value={lang.code}>{lang.name} ({lang.code})</option>
                  {/if}
                {/each}
              </select>
            </div>
            <div>
              <label for="homepage-translation-title" class="block text-sm font-medium mb-2"
                >{t('homepage.sectionTitle')}</label
              >
              <input
                id="homepage-translation-title"
                type="text"
                bind:value={translationFormData.title}
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                placeholder={selectedSectionForTranslation.title || ''}
              />
            </div>
            {#if (selectedSectionForTranslation.type === 'card' || selectedSectionForTranslation.type === 'split_triple') && Array.isArray(selectedSectionForTranslation.config?.cards) && selectedSectionForTranslation.config.cards.length > 0}
              <div class="border-t pt-4">
                <h5 class="text-sm font-medium mb-3">
                  {t('homepage.cardTitles') || 'Card titles'}
                </h5>
                <div class="space-y-3">
                  {#each selectedSectionForTranslation.config.cards as card, index}
                    {@const transCards = translationFormData.config.cards ?? []}
                    {@const transCard = transCards[index] ?? { id: card.id, title: '' }}
                    <div>
                      <label
                        class="block text-sm font-medium mb-1"
                        for={`homepage-translation-card-title-${index}`}
                      >
                        {t('homepage.card') || 'Card'}
                        {index + 1}{#if card.title}
                          <span class="text-accent-muted font-normal">({card.title})</span>
                        {/if}
                      </label>
                      <input
                        id={`homepage-translation-card-title-${index}`}
                        type="text"
                        value={transCard.title}
                        on:input={(e) => {
                          const target = e.target;
                          const v = target && 'value' in target ? String(target.value) : '';
                          const cards = [...(translationFormData.config.cards ?? [])];
                          while (cards.length <= index) cards.push({ id: card.id, title: '' });
                          cards[index] = { id: card.id, title: v };
                          translationFormData = {
                            ...translationFormData,
                            config: { ...translationFormData.config, cards },
                          };
                        }}
                        class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                        placeholder={card.title || ''}
                      />
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
            {#if selectedSectionForTranslation.config?.buttonText !== undefined || selectedSectionForTranslation.config?.description !== undefined}
              <div class="border-t pt-4">
                <h5 class="text-sm font-medium mb-3">{t('homepage.configFields')}</h5>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {#if selectedSectionForTranslation.config?.buttonText !== undefined}
                    <div>
                      <label
                        for="homepage-translation-button-text"
                        class="block text-sm font-medium mb-2">{t('homepage.buttonText')}</label
                      >
                      <input
                        id="homepage-translation-button-text"
                        type="text"
                        bind:value={translationFormData.config.buttonText}
                        class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                        placeholder={selectedSectionForTranslation.config.buttonText || ''}
                      />
                    </div>
                  {/if}
                  {#if selectedSectionForTranslation.config?.description !== undefined}
                    <div>
                      <label
                        for="homepage-translation-description"
                        class="block text-sm font-medium mb-2">{t('homepage.description')}</label
                      >
                      <textarea
                        id="homepage-translation-description"
                        bind:value={translationFormData.config.description}
                        rows="3"
                        class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                        placeholder={selectedSectionForTranslation.config.description || ''}
                      ></textarea>
                    </div>
                  {/if}
                </div>
              </div>
            {/if}
            <div class="flex gap-4 flex-wrap">
              <button
                on:click={translateWithGPT}
                disabled={gptTranslating || !selectedLanguageForTranslation}
                class="px-6 py-2 bg-white border border-gray-300 hover:bg-gray-100 transition-colors text-black disabled:opacity-50 disabled:cursor-not-allowed flex items-center gap-2"
              >
                {#if gptTranslating}
                  <svg
                    class="animate-spin h-4 w-4"
                    xmlns="http://www.w3.org/2000/svg"
                    fill="none"
                    viewBox="0 0 24 24"
                  >
                    <circle
                      class="opacity-25"
                      cx="12"
                      cy="12"
                      r="10"
                      stroke="currentColor"
                      stroke-width="4"
                    ></circle>
                    <path
                      class="opacity-75"
                      fill="currentColor"
                      d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"
                    ></path>
                  </svg>
                  Translating...
                {:else}
                  <svg class="h-4 w-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path
                      stroke-linecap="round"
                      stroke-linejoin="round"
                      stroke-width="2"
                      d="M13 10V3L4 14h7v7l9-11h-7z"
                    ></path>
                  </svg>
                  GPT Assistant
                {/if}
              </button>
              <button
                on:click={saveTranslation}
                disabled={!selectedLanguageForTranslation}
                class="px-6 py-2 bg-black text-white hover:bg-gray-800 transition-colors disabled:opacity-50"
              >
                {t('common.save')}
              </button>
              {#if editingTranslation}
                <button
                  on:click={() => {
                    editingTranslation = null;
                    selectedLanguageForTranslation = '';
                    translationFormData = {
                      title: '',
                      config: {},
                    };
                  }}
                  class="px-6 py-2 bg-white border border-gray-300 hover:bg-gray-100 transition-colors text-black"
                >
                  {t('common.cancel')}
                </button>
              {/if}
            </div>
          </div>
        </div>

        <!-- Existing Translations -->
        <div>
          <h4 class="text-lg font-medium mb-4">{t('homepage.existingTranslations')}</h4>
          {#if selectedSectionForTranslation && (!translations[selectedSectionForTranslation.id] || translations[selectedSectionForTranslation.id].length === 0)}
            <p class="text-accent-muted">{t('homepage.noTranslations')}</p>
          {:else if selectedSectionForTranslation}
            <div class="space-y-2">
              {#each translations[selectedSectionForTranslation.id] as translation}
                <div class="flex items-center justify-between p-4 bg-white border border-gray-300">
                  <div>
                    <p class="font-medium">
                      {languages.find((l) => l.code === translation.languageCode)?.name ||
                        translation.languageCode}
                    </p>
                    {#if translation.title}
                      <p class="text-sm text-accent-muted">
                        {t('homepage.sectionTitle')}: {translation.title}
                      </p>
                    {/if}
                  </div>
                  <div class="flex gap-2">
                    <button
                      on:click={() => editTranslation(translation)}
                      class="px-3 py-1 bg-white border border-gray-300 text-sm hover:bg-gray-100 transition-colors text-black"
                    >
                      {t('common.edit')}
                    </button>
                    <button
                      on:click={() =>
                        selectedSectionForTranslation &&
                        deleteTranslation(
                          selectedSectionForTranslation.id,
                          translation.languageCode
                        )}
                      class="px-3 py-1 bg-red-500 text-white text-sm hover:bg-red-600 transition-colors"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          {/if}
        </div>
      </div>
    </div>
  {/if}
</div>
