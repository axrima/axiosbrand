<script lang="ts">
  import { createEventDispatcher } from 'svelte';
  import { browser } from '$app/environment';
  import { goto } from '$app/navigation';
  import { authStore } from '$lib/stores/auth.store';
  import { adminApi } from '$lib/api/admin.api';
  import { uploadHomepageMedia } from '$lib/api/homepage-upload';
  import { productApi, type Product } from '$lib/api/product.api';
  import { lookbookApi, type Lookbook } from '$lib/api/lookbook.api';
  import { blogApi, type BlogPost } from '$lib/api/blog.api';
  import { notificationStore } from '$lib/stores/notification.store';
  import { dialogStore } from '$lib/stores/dialog.store';
  import { t } from '$lib/utils/i18n';
  import type { CardItem, HomepageSection } from '$lib/api/homepage.api';

  type SectionType = HomepageSection['type'];

  interface HomepageEditorConfig {
    imageUrl: string;
    videoUrl: string;
    audioUrl: string;
    description: string;
    buttonText: string;
    buttonLink: string;
    products: string[];
    lookbookId: string;
    cards: CardItem[];
    gridColumns: string;
    gap: string;
    displayMode: 'latest' | 'featured';
    limit: number;
    postIds: string[];
    backgroundColor: string;
    textColor: string;
    buttonColor: string;
    buttonTextColor: string;
    titleSize: string;
    subtitleSize: string;
    paddingTop: string;
    paddingBottom: string;
    textAlign: 'left' | 'center' | 'right';
    imageOpacity: string;
    sectionHeight: string;
    overlayColor: string;
    overlayOpacity: string;
    mediaAspectRatio: 'auto' | '1:1' | '4:5' | '3:4' | '16:9' | '9:16';
    mediaHoverEffect: 'none' | 'zoom' | 'dim';
    mediaLinkMode: 'none' | 'always' | 'hover';
    titleOverlayOnMedia: boolean;
    titleOverlayPosition: 'top' | 'center' | 'bottom';
    textBlockMaxWidth: 'narrow' | 'medium' | 'wide' | 'full';
    textBlockAnimation: 'fade_up' | 'fade' | 'scale' | 'none';
    playerVariant: 'minimal' | 'bar' | 'compact';
    playerAccentColor: string;
    playerBgColor: string;
    showPlayPause: boolean;
    showProgress: boolean;
    showTime: boolean;
    showVolume: boolean;
    autoplay: boolean;
    videoLoop: boolean;
    videoAutoplay: boolean;
    videoMuted: boolean;
    videoControls: boolean;
    videoPlaysinline: boolean;
  }

  interface HomepageEditorForm {
    type: SectionType;
    title: string;
    order: number;
    isActive: boolean;
    config: HomepageEditorConfig;
  }

  const dispatch = createEventDispatcher<{
    sectionsUpdated: HomepageSection[];
    previewChanged: HomepageSection | null;
  }>();

  export let sections: HomepageSection[] = [];
  export let isOpen = false;
  export let activeSectionId: string | null = null;
  export let externalDraftSection: HomepageSection | null = null;

  const sectionTypeOptions: Array<{ value: SectionType; label: string }> = [
    { value: 'hero', label: t('homepage.heroSection') },
    { value: 'collection', label: t('homepage.productCollection') },
    { value: 'editorial', label: t('homepage.editorial') },
    { value: 'lookbook_preview', label: t('homepage.lookbookPreview') },
    { value: 'card', label: t('homepage.cardBlocks') },
    { value: 'blog', label: t('homepage.blogSection') },
    { value: 'audio', label: t('homepage.audioSection') },
    { value: 'split_triple', label: t('homepage.splitTripleSection') },
    { value: 'bleed_left', label: t('homepage.bleedImageLeft') },
    { value: 'bleed_right', label: t('homepage.bleedImageRight') },
    { value: 'center_title_media', label: t('homepage.centerTitleMedia') },
    { value: 'text_block', label: t('homepage.textBlockSection') },
  ];

  let loading = false;
  let saving = false;
  let resourcesLoaded = false;
  let sectionsInternal: HomepageSection[] = [];
  let editingSection: HomepageSection | null = null;
  let formData = createEmptyForm();
  let products: Product[] = [];
  let lookbooks: Lookbook[] = [];
  let blogPosts: BlogPost[] = [];
  let productSearch = '';
  let blogSearch = '';
  let lookbookSearch = '';
  let imageUploading = false;
  let videoUploading = false;
  let audioUploading = false;
  let imageDragging = false;
  let videoDragging = false;
  let audioDragging = false;
  let sectionImageInput: HTMLInputElement | null = null;
  let sectionVideoInput: HTMLInputElement | null = null;
  let sectionAudioInput: HTMLInputElement | null = null;
  let cardFileInputs: Record<number, HTMLInputElement | null> = {};
  let cardUploading: Record<number, boolean> = {};
  let cardDragging: Record<number, boolean> = {};
  let suppressPreviewDispatch = false;

  $: sectionsInternal = [...sections].sort((a, b) => a.order - b.order);
  $: currentUser = $authStore.user;
  $: isEditorAllowed =
    $authStore.isAuthenticated &&
    (currentUser?.role === 'SUPER_ADMIN' ||
      ((currentUser?.role === 'ADMIN' || currentUser?.role === 'SUPER_ADMIN') &&
        currentUser?.permissions?.canManageContent === true));

  $: filteredProducts = (() => {
    const query = productSearch.trim().toLowerCase();
    if (!query) return products;
    return products.filter(
      (product) =>
        product.name.toLowerCase().includes(query) ||
        product.slug.toLowerCase().includes(query) ||
        product.id.toLowerCase().includes(query)
    );
  })();

  $: filteredBlogPosts = (() => {
    const query = blogSearch.trim().toLowerCase();
    if (!query) return blogPosts;
    return blogPosts.filter(
      (post) => post.title.toLowerCase().includes(query) || post.slug.toLowerCase().includes(query)
    );
  })();

  $: filteredLookbooks = (() => {
    const query = lookbookSearch.trim().toLowerCase();
    if (!query) return lookbooks;
    return lookbooks.filter(
      (lookbookItem) =>
        lookbookItem.title.toLowerCase().includes(query) ||
        lookbookItem.slug.toLowerCase().includes(query) ||
        (lookbookItem.season || '').toLowerCase().includes(query)
    );
  })();

  $: if (!isEditorAllowed && isOpen) {
    closeDrawer();
  }

  $: if (isOpen) {
    void ensureResourcesLoaded();
  }

  $: if (activeSectionId) {
    const selectedSection = sectionsInternal.find((section) => section.id === activeSectionId);
    if (selectedSection && editingSection?.id !== selectedSection.id) {
      openDrawer();
      openEditForm(selectedSection);
    }
  }

  $: if (
    externalDraftSection &&
    editingSection &&
    externalDraftSection.id === editingSection.id &&
    externalDraftSection.updatedAt !== editingSection.updatedAt
  ) {
    suppressPreviewDispatch = true;
    populateFormFromSection(externalDraftSection);
  }

  $: {
    if (suppressPreviewDispatch) {
      suppressPreviewDispatch = false;
    } else {
      dispatch('previewChanged', buildPreviewSection());
    }
  }

  function createEmptyForm(order: number = 0): HomepageEditorForm {
    return {
      type: 'hero',
      title: '',
      order,
      isActive: true,
      config: {
        imageUrl: '',
        videoUrl: '',
        audioUrl: '',
        description: '',
        buttonText: '',
        buttonLink: '',
        products: [],
        lookbookId: '',
        cards: [],
        gridColumns: 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
        gap: 'gap-4',
        displayMode: 'latest',
        limit: 6,
        postIds: [],
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
        textBlockMaxWidth: 'medium',
        textBlockAnimation: 'fade_up',
        playerVariant: 'minimal',
        playerAccentColor: '#000000',
        playerBgColor: '#fafafa',
        showPlayPause: true,
        showProgress: true,
        showTime: true,
        showVolume: true,
        autoplay: false,
        videoLoop: true,
        videoAutoplay: true,
        videoMuted: true,
        videoControls: false,
        videoPlaysinline: true,
      },
    };
  }

  function openDrawer() {
    isOpen = true;
    void ensureResourcesLoaded();
  }

  function closeDrawer() {
    isOpen = false;
  }

  async function ensureResourcesLoaded() {
    if (resourcesLoaded || loading) return;
    loading = true;
    try {
      const [productsResponse, lookbooksResponse, blogResponse] = await Promise.all([
        productApi.getAll(1, 100),
        lookbookApi.getAll(false),
        blogApi.getAllPosts(false),
      ]);
      products = productsResponse.products;
      lookbooks = lookbooksResponse.lookbooks;
      blogPosts = blogResponse.posts;
      resourcesLoaded = true;
    } catch (error) {
      console.error('Failed to load homepage editor resources:', error);
      notificationStore.error(error instanceof Error ? error.message : t('error.failedToLoad'));
    } finally {
      loading = false;
    }
  }

  function getSectionTypeLabel(type: SectionType): string {
    return sectionTypeOptions.find((option) => option.value === type)?.label || type;
  }

  function buildPreviewSection(): HomepageSection | null {
    if (!isOpen) return null;

    const hasMeaningfulDraft =
      editingSection !== null ||
      formData.title.trim() !== '' ||
      formData.config.description.trim() !== '' ||
      formData.config.imageUrl.trim() !== '' ||
      formData.config.videoUrl.trim() !== '' ||
      formData.config.audioUrl.trim() !== '' ||
      formData.config.buttonText.trim() !== '' ||
      formData.config.cards.length > 0 ||
      formData.config.products.length > 0 ||
      formData.config.lookbookId.trim() !== '';

    if (!hasMeaningfulDraft) return null;

    return {
      id: editingSection?.id || `preview-${formData.type}`,
      type: formData.type,
      title: formData.title || undefined,
      order: Number(formData.order) || 0,
      isActive: formData.isActive,
      config: { ...formData.config },
      createdAt: editingSection?.createdAt || new Date().toISOString(),
      updatedAt: new Date().toISOString(),
    };
  }

  function scrollSectionIntoView(sectionId: string) {
    if (!browser) return;
    requestAnimationFrame(() => {
      document
        .getElementById(`homepage-section-${sectionId}`)
        ?.scrollIntoView({ behavior: 'smooth', block: 'center' });
    });
  }

  function openCreateForm() {
    suppressPreviewDispatch = true;
    activeSectionId = null;
    editingSection = null;
    formData = createEmptyForm(
      sectionsInternal.length > 0
        ? Math.max(...sectionsInternal.map((section) => section.order)) + 1
        : 0
    );
  }

  function cloneCards(cards: unknown): CardItem[] {
    if (!Array.isArray(cards)) return [];
    return cards.map((card) => ({
      id:
        typeof card?.id === 'string'
          ? card.id
          : browser && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,
      imageUrl: typeof card?.imageUrl === 'string' ? card.imageUrl : '',
      videoUrl: typeof card?.videoUrl === 'string' ? card.videoUrl : '',
      title: typeof card?.title === 'string' ? card.title : '',
      link: typeof card?.link === 'string' ? card.link : '',
      borderRadius: typeof card?.borderRadius === 'string' ? card.borderRadius : 'rounded-lg',
      showTitleOnHover: card?.showTitleOnHover === true,
      titleColor: typeof card?.titleColor === 'string' ? card.titleColor : '#ffffff',
    }));
  }

  function populateFormFromSection(section: HomepageSection) {
    editingSection = section;
    formData = {
      type: section.type,
      title: section.title || '',
      order: section.order,
      isActive: section.isActive,
      config: {
        ...createEmptyForm().config,
        imageUrl: typeof section.config?.imageUrl === 'string' ? section.config.imageUrl : '',
        videoUrl: typeof section.config?.videoUrl === 'string' ? section.config.videoUrl : '',
        audioUrl: typeof section.config?.audioUrl === 'string' ? section.config.audioUrl : '',
        description:
          typeof section.config?.description === 'string' ? section.config.description : '',
        buttonText: typeof section.config?.buttonText === 'string' ? section.config.buttonText : '',
        buttonLink: typeof section.config?.buttonLink === 'string' ? section.config.buttonLink : '',
        products: Array.isArray(section.config?.products) ? [...section.config.products] : [],
        lookbookId: typeof section.config?.lookbookId === 'string' ? section.config.lookbookId : '',
        cards: cloneCards(section.config?.cards),
        gridColumns:
          typeof section.config?.gridColumns === 'string'
            ? section.config.gridColumns
            : 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3',
        gap: typeof section.config?.gap === 'string' ? section.config.gap : 'gap-4',
        displayMode: section.config?.displayMode === 'featured' ? 'featured' : 'latest',
        limit: typeof section.config?.limit === 'number' ? section.config.limit : 6,
        postIds: Array.isArray(section.config?.postIds) ? [...section.config.postIds] : [],
        backgroundColor:
          typeof section.config?.backgroundColor === 'string' ? section.config.backgroundColor : '',
        textColor: typeof section.config?.textColor === 'string' ? section.config.textColor : '',
        buttonColor:
          typeof section.config?.buttonColor === 'string' ? section.config.buttonColor : '',
        buttonTextColor:
          typeof section.config?.buttonTextColor === 'string' ? section.config.buttonTextColor : '',
        titleSize: typeof section.config?.titleSize === 'string' ? section.config.titleSize : '',
        subtitleSize:
          typeof section.config?.subtitleSize === 'string' ? section.config.subtitleSize : '',
        paddingTop: typeof section.config?.paddingTop === 'string' ? section.config.paddingTop : '',
        paddingBottom:
          typeof section.config?.paddingBottom === 'string' ? section.config.paddingBottom : '',
        textAlign:
          section.config?.textAlign === 'left' || section.config?.textAlign === 'right'
            ? section.config.textAlign
            : 'center',
        imageOpacity:
          typeof section.config?.imageOpacity === 'string' ? section.config.imageOpacity : '50',
        sectionHeight:
          typeof section.config?.sectionHeight === 'string' ? section.config.sectionHeight : '',
        overlayColor:
          typeof section.config?.overlayColor === 'string' ? section.config.overlayColor : '',
        overlayOpacity:
          typeof section.config?.overlayOpacity === 'string' ? section.config.overlayOpacity : '0',
        mediaAspectRatio:
          section.config?.mediaAspectRatio === '1:1' ||
          section.config?.mediaAspectRatio === '4:5' ||
          section.config?.mediaAspectRatio === '3:4' ||
          section.config?.mediaAspectRatio === '16:9' ||
          section.config?.mediaAspectRatio === '9:16'
            ? section.config.mediaAspectRatio
            : 'auto',
        mediaHoverEffect:
          section.config?.mediaHoverEffect === 'none' || section.config?.mediaHoverEffect === 'dim'
            ? section.config.mediaHoverEffect
            : 'zoom',
        mediaLinkMode:
          section.config?.mediaLinkMode === 'none' || section.config?.mediaLinkMode === 'always'
            ? section.config.mediaLinkMode
            : 'hover',
        titleOverlayOnMedia: section.config?.titleOverlayOnMedia === true,
        titleOverlayPosition:
          section.config?.titleOverlayPosition === 'top' ||
          section.config?.titleOverlayPosition === 'bottom'
            ? section.config.titleOverlayPosition
            : 'center',
        textBlockMaxWidth:
          section.config?.textBlockMaxWidth === 'narrow' ||
          section.config?.textBlockMaxWidth === 'wide' ||
          section.config?.textBlockMaxWidth === 'full'
            ? section.config.textBlockMaxWidth
            : 'medium',
        textBlockAnimation:
          section.config?.textBlockAnimation === 'fade' ||
          section.config?.textBlockAnimation === 'scale' ||
          section.config?.textBlockAnimation === 'none'
            ? section.config.textBlockAnimation
            : 'fade_up',
        playerVariant:
          section.config?.playerVariant === 'bar' || section.config?.playerVariant === 'compact'
            ? section.config.playerVariant
            : 'minimal',
        playerAccentColor:
          typeof section.config?.playerAccentColor === 'string'
            ? section.config.playerAccentColor
            : '#000000',
        playerBgColor:
          typeof section.config?.playerBgColor === 'string'
            ? section.config.playerBgColor
            : '#fafafa',
        showPlayPause: section.config?.showPlayPause !== false,
        showProgress: section.config?.showProgress !== false,
        showTime: section.config?.showTime !== false,
        showVolume: section.config?.showVolume !== false,
        autoplay: section.config?.autoplay === true,
        videoLoop: section.config?.videoLoop !== false,
        videoAutoplay: section.config?.videoAutoplay !== false,
        videoMuted: section.config?.videoMuted !== false,
        videoControls: section.config?.videoControls === true,
        videoPlaysinline: section.config?.videoPlaysinline !== false,
      },
    };
  }

  function openEditForm(section: HomepageSection) {
    suppressPreviewDispatch = true;
    activeSectionId = section.id;
    scrollSectionIntoView(section.id);
    populateFormFromSection(section);
  }

  function closeForm() {
    if (activeSectionId) {
      const selectedSection = sectionsInternal.find((section) => section.id === activeSectionId);
      if (selectedSection) {
        openEditForm(selectedSection);
        return;
      }
    }
    editingSection = null;
    formData = createEmptyForm(
      sectionsInternal.length > 0
        ? Math.max(...sectionsInternal.map((section) => section.order)) + 1
        : 0
    );
  }

  function isMediaSection(type: SectionType) {
    return (
      type === 'hero' ||
      type === 'editorial' ||
      type === 'split_triple' ||
      type === 'center_title_media' ||
      type === 'bleed_left' ||
      type === 'bleed_right' ||
      type === 'lookbook_preview'
    );
  }

  function supportsVideo(type: SectionType) {
    return (
      type === 'hero' ||
      type === 'editorial' ||
      type === 'split_triple' ||
      type === 'center_title_media'
    );
  }

  function supportsCards(type: SectionType) {
    return type === 'card' || type === 'split_triple';
  }

  function toggleProduct(productId: string) {
    formData.config.products = formData.config.products.includes(productId)
      ? formData.config.products.filter((id) => id !== productId)
      : [...formData.config.products, productId];
  }

  function toggleBlogPost(postId: string) {
    formData.config.postIds = formData.config.postIds.includes(postId)
      ? formData.config.postIds.filter((id) => id !== postId)
      : [...formData.config.postIds, postId];
  }

  function addCard() {
    formData.config.cards = [
      ...formData.config.cards,
      {
        id:
          browser && 'randomUUID' in crypto
            ? crypto.randomUUID()
            : `${Date.now()}-${Math.random()}`,
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
    formData.config.cards = formData.config.cards.filter((_, cardIndex) => cardIndex !== index);
  }

  function updateCard(index: number, field: keyof CardItem, value: string | boolean) {
    formData.config.cards = formData.config.cards.map((card, cardIndex) =>
      cardIndex === index ? { ...card, [field]: value } : card
    );
  }

  async function uploadAsset(file: File, target: 'imageUrl' | 'videoUrl' | 'audioUrl') {
    if (!file) return;
    if (target === 'imageUrl') imageUploading = true;
    if (target === 'videoUrl') videoUploading = true;
    if (target === 'audioUrl') audioUploading = true;

    try {
      const data = await uploadHomepageMedia(file);
      formData.config[target] = data.url;
      if (target === 'videoUrl' && data.posterUrl) {
        formData.config.imageUrl = data.posterUrl;
      }
    } catch (error) {
      notificationStore.error(error instanceof Error ? error.message : t('error.failedToSave'));
    } finally {
      if (target === 'imageUrl') imageUploading = false;
      if (target === 'videoUrl') videoUploading = false;
      if (target === 'audioUrl') audioUploading = false;
    }
  }

  async function uploadCardAsset(file: File, index: number) {
    if (!file) return;
    cardUploading[index] = true;
    try {
      const data = await uploadHomepageMedia(file);
      const isVideo = file.type.startsWith('video/');
      formData.config.cards = formData.config.cards.map((card, cardIndex) =>
        cardIndex === index
          ? {
              ...card,
              imageUrl: isVideo ? data.posterUrl || '' : data.url,
              videoUrl: isVideo ? data.url : '',
            }
          : card
      );
    } catch (error) {
      notificationStore.error(error instanceof Error ? error.message : t('error.failedToSave'));
    } finally {
      cardUploading[index] = false;
    }
  }

  function handleSectionFileChange(event: Event, target: 'imageUrl' | 'videoUrl' | 'audioUrl') {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
    void uploadAsset(input.files[0], target);
    input.value = '';
  }

  function handleCardFileChange(event: Event, index: number) {
    const input = event.currentTarget;
    if (!(input instanceof HTMLInputElement) || !input.files?.[0]) return;
    void uploadCardAsset(input.files[0], index);
    input.value = '';
  }

  function openSectionFileDialog(target: 'imageUrl' | 'videoUrl' | 'audioUrl') {
    if (target === 'imageUrl') {
      sectionImageInput?.click();
      return;
    }
    if (target === 'videoUrl') {
      sectionVideoInput?.click();
      return;
    }
    sectionAudioInput?.click();
  }

  function handleSectionDragOver(event: DragEvent, target: 'imageUrl' | 'videoUrl' | 'audioUrl') {
    event.preventDefault();
    event.stopPropagation();
    if (target === 'imageUrl') imageDragging = true;
    if (target === 'videoUrl') videoDragging = true;
    if (target === 'audioUrl') audioDragging = true;
  }

  function handleSectionDragLeave(event: DragEvent, target: 'imageUrl' | 'videoUrl' | 'audioUrl') {
    event.preventDefault();
    event.stopPropagation();
    if (target === 'imageUrl') imageDragging = false;
    if (target === 'videoUrl') videoDragging = false;
    if (target === 'audioUrl') audioDragging = false;
  }

  function handleSectionDrop(event: DragEvent, target: 'imageUrl' | 'videoUrl' | 'audioUrl') {
    event.preventDefault();
    event.stopPropagation();
    if (target === 'imageUrl') imageDragging = false;
    if (target === 'videoUrl') videoDragging = false;
    if (target === 'audioUrl') audioDragging = false;

    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    if (target === 'imageUrl' && !file.type.startsWith('image/')) return;
    if (target === 'videoUrl' && !file.type.startsWith('video/')) return;
    if (target === 'audioUrl' && !file.type.startsWith('audio/')) return;
    void uploadAsset(file, target);
  }

  function openCardFileDialog(index: number) {
    cardFileInputs[index]?.click();
  }

  function handleCardDragOver(event: DragEvent, index: number) {
    event.preventDefault();
    event.stopPropagation();
    cardDragging[index] = true;
  }

  function handleCardDragLeave(event: DragEvent, index: number) {
    event.preventDefault();
    event.stopPropagation();
    cardDragging[index] = false;
  }

  function handleCardDrop(event: DragEvent, index: number) {
    event.preventDefault();
    event.stopPropagation();
    cardDragging[index] = false;
    const file = event.dataTransfer?.files?.[0];
    if (!file) return;
    if (!file.type.startsWith('image/') && !file.type.startsWith('video/')) return;
    void uploadCardAsset(file, index);
  }

  async function refreshSectionsFromServer() {
    const response = await adminApi.getAllHomepageSections();
    const nextSections = [...response.sections].sort((a, b) => a.order - b.order);
    sectionsInternal = nextSections;
    if (activeSectionId) {
      const selectedSection = nextSections.find((section) => section.id === activeSectionId);
      if (selectedSection) {
        openEditForm(selectedSection);
      }
    }
    dispatch('sectionsUpdated', nextSections);
    return nextSections;
  }

  async function saveSection() {
    saving = true;
    try {
      const normalizedTitle = formData.title.trim();
      const payload = {
        type: formData.type,
        title: editingSection ? normalizedTitle : normalizedTitle || undefined,
        order: Number(formData.order) || 0,
        isActive: formData.isActive,
        config: {
          ...(formData.config.imageUrl && { imageUrl: formData.config.imageUrl }),
          ...(formData.config.videoUrl && { videoUrl: formData.config.videoUrl }),
          ...(formData.config.audioUrl && { audioUrl: formData.config.audioUrl }),
          ...(formData.config.description && { description: formData.config.description }),
          ...(formData.config.buttonText && { buttonText: formData.config.buttonText }),
          ...(formData.config.buttonLink && { buttonLink: formData.config.buttonLink }),
          ...(formData.config.products.length > 0 && { products: formData.config.products }),
          ...(formData.config.lookbookId && { lookbookId: formData.config.lookbookId }),
          ...(formData.config.cards.length > 0 && { cards: formData.config.cards }),
          ...(formData.config.gridColumns && { gridColumns: formData.config.gridColumns }),
          ...(formData.config.gap && { gap: formData.config.gap }),
          ...(formData.config.displayMode && { displayMode: formData.config.displayMode }),
          ...(formData.config.limit > 0 && { limit: Number(formData.config.limit) }),
          ...(formData.config.postIds.length > 0 && { postIds: formData.config.postIds }),
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
          titleOverlayOnMedia: formData.config.titleOverlayOnMedia,
          ...(formData.config.titleOverlayPosition && {
            titleOverlayPosition: formData.config.titleOverlayPosition,
          }),
          ...(formData.type === 'text_block' && {
            textBlockMaxWidth: formData.config.textBlockMaxWidth,
            textBlockAnimation: formData.config.textBlockAnimation,
          }),
          ...(formData.type === 'audio' && {
            playerVariant: formData.config.playerVariant,
            playerAccentColor: formData.config.playerAccentColor,
            playerBgColor: formData.config.playerBgColor,
            showPlayPause: formData.config.showPlayPause,
            showProgress: formData.config.showProgress,
            showTime: formData.config.showTime,
            showVolume: formData.config.showVolume,
            autoplay: formData.config.autoplay,
          }),
          videoLoop: formData.config.videoLoop,
          videoAutoplay: formData.config.videoAutoplay,
          videoMuted: formData.config.videoMuted,
          videoControls: formData.config.videoControls,
          videoPlaysinline: formData.config.videoPlaysinline,
        },
      };

      if (editingSection) {
        await adminApi.updateHomepageSection(editingSection.id, payload);
      } else {
        await adminApi.createHomepageSection(payload);
      }

      const nextSections = await refreshSectionsFromServer();
      if (!editingSection) {
        const createdSection = [...nextSections]
          .reverse()
          .find(
            (section) =>
              section.type === formData.type &&
              section.order === Number(formData.order) &&
              (section.title || '') === (formData.title || '')
          );
        if (createdSection) {
          activeSectionId = createdSection.id;
          openEditForm(createdSection);
        }
      }
      notificationStore.success(editingSection ? 'Section updated' : 'Section created');
      reloadHomepageAfterSave();
    } catch (error) {
      notificationStore.error(error instanceof Error ? error.message : t('error.failedToSave'));
    } finally {
      saving = false;
    }
  }

  async function toggleSection(section: HomepageSection) {
    try {
      await adminApi.updateHomepageSection(section.id, { isActive: !section.isActive });
      await refreshSectionsFromServer();
    } catch (error) {
      notificationStore.error(error instanceof Error ? error.message : t('error.failedToUpdate'));
    }
  }

  async function deleteSection(section: HomepageSection) {
    const confirmed = await dialogStore.confirm(
      t('homepage.deleteConfirm'),
      t('homepage.deleteSection'),
      t('common.delete'),
      t('common.cancel')
    );
    if (!confirmed) return;

    try {
      await adminApi.deleteHomepageSection(section.id);
      await refreshSectionsFromServer();
      if (editingSection?.id === section.id) {
        activeSectionId = null;
        closeForm();
      }
    } catch (error) {
      notificationStore.error(error instanceof Error ? error.message : t('error.failedToDelete'));
    }
  }

  async function moveSection(section: HomepageSection, direction: 'up' | 'down') {
    const index = sectionsInternal.findIndex((item) => item.id === section.id);
    if (index < 0) return;
    const targetIndex = direction === 'up' ? index - 1 : index + 1;
    if (targetIndex < 0 || targetIndex >= sectionsInternal.length) return;

    const sectionOrders = sectionsInternal.map((item, itemIndex) => ({
      id: item.id,
      order:
        itemIndex === index
          ? sectionsInternal[targetIndex].order
          : itemIndex === targetIndex
            ? sectionsInternal[index].order
            : item.order,
    }));

    try {
      await adminApi.reorderHomepageSections(sectionOrders);
      await refreshSectionsFromServer();
    } catch (error) {
      notificationStore.error(error instanceof Error ? error.message : t('error.failedToUpdate'));
    }
  }

  function openFullContentManager() {
    closeDrawer();
    goto('/admin/homepage');
  }

  function reloadHomepageAfterSave() {
    if (!browser) return;
    window.setTimeout(() => {
      window.location.reload();
    }, 150);
  }

  function handleWindowKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isOpen) {
      closeDrawer();
    }
  }
</script>

<svelte:window on:keydown={handleWindowKeydown} />

{#if isEditorAllowed}
  <button
    type="button"
    class="fixed right-0 top-1/2 z-[44] -translate-y-1/2 rounded-l-2xl border border-black/10 bg-white/95 px-3 py-4 text-xs font-semibold uppercase tracking-[0.2em] text-black shadow-lg backdrop-blur transition hover:bg-black hover:text-white"
    on:click={openDrawer}
    aria-controls="homepage-admin-drawer"
    aria-expanded={isOpen}
  >
    Edit
  </button>

  <div
    class="fixed inset-0 z-[45] transition-opacity duration-300 ease-out lg:pointer-events-none {isOpen
      ? 'opacity-100 pointer-events-auto lg:opacity-0'
      : 'opacity-0 pointer-events-none'}"
    style="background: rgba(15, 23, 42, 0.22); backdrop-filter: blur(2px);"
    on:click={closeDrawer}
    aria-hidden={!isOpen}
  ></div>

  <!-- svelte-ignore a11y_no_noninteractive_element_to_interactive_role -->
  <aside
    id="homepage-admin-drawer"
    class="fixed top-0 right-0 z-[46] flex h-full w-full max-w-full flex-col overflow-hidden border-l border-black/10 bg-stone-50 shadow-2xl transition-transform duration-300 ease-out md:max-w-2xl {isOpen
      ? 'translate-x-0'
      : 'translate-x-full'}"
    role="dialog"
    aria-modal="true"
    aria-label="Homepage editor"
  >
    <div
      class="flex items-center justify-between border-b border-black/10 bg-black px-5 py-4 text-white"
    >
      <div>
        <h2 class="text-sm font-semibold uppercase tracking-[0.24em]">Homepage Editor</h2>
        <p class="mt-1 text-xs text-white/70">Admin-only quick editing on the live page</p>
      </div>
      <div class="flex items-center gap-2">
        <button
          type="button"
          class="rounded-full border border-white/20 px-3 py-2 text-xs font-medium text-white transition hover:bg-white/10"
          on:click={openFullContentManager}
        >
          Full CMS
        </button>
        <button
          type="button"
          class="rounded-full border border-white/20 p-2 text-white transition hover:bg-white/10"
          on:click={closeDrawer}
          aria-label={t('common.close')}
        >
          <svg class="h-5 w-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>
    </div>

    <div class="flex-1 overflow-y-auto px-4 py-4 sm:px-5">
      {#if loading}
        <div class="flex items-center justify-center py-20">
          <div
            class="h-10 w-10 animate-spin rounded-full border-2 border-black/20 border-t-black"
          ></div>
        </div>
      {:else}
        <div class="space-y-6">
          <section class="rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
            <div class="flex items-center justify-between gap-3">
              <div>
                <h3 class="text-sm font-semibold uppercase tracking-[0.18em] text-black/80">
                  Sections
                </h3>
                <p class="mt-1 text-sm text-black/55">
                  Reorder, toggle visibility, or open one for editing.
                </p>
              </div>
              <button
                type="button"
                class="rounded-full bg-black px-4 py-2 text-sm font-medium text-white transition hover:bg-black/80"
                on:click={openCreateForm}
              >
                Add Section
              </button>
            </div>

            <div class="mt-4 space-y-3">
              {#if sectionsInternal.length === 0}
                <div
                  class="rounded-2xl border border-dashed border-black/10 bg-stone-50 px-4 py-6 text-sm text-black/55"
                >
                  No homepage sections yet.
                </div>
              {:else}
                {#each sectionsInternal as section, index}
                  <div class="rounded-2xl border border-black/10 bg-stone-50 px-4 py-3">
                    <div class="flex items-start justify-between gap-3">
                      <div class="min-w-0">
                        <p class="text-xs uppercase tracking-[0.16em] text-black/45">
                          #{section.order} · {getSectionTypeLabel(section.type)}
                        </p>
                        <p class="mt-1 truncate text-sm font-medium text-black">
                          {section.title || 'Untitled section'}
                        </p>
                        <p
                          class="mt-1 text-xs {section.isActive
                            ? 'text-emerald-700'
                            : 'text-amber-700'}"
                        >
                          {section.isActive ? 'Visible on homepage' : 'Hidden from homepage'}
                        </p>
                      </div>

                      <div class="flex shrink-0 items-center gap-1">
                        <button
                          type="button"
                          class="rounded-full border border-black/10 px-2 py-1 text-xs text-black transition hover:bg-white"
                          on:click={() => moveSection(section, 'up')}
                          disabled={index === 0}
                        >
                          ↑
                        </button>
                        <button
                          type="button"
                          class="rounded-full border border-black/10 px-2 py-1 text-xs text-black transition hover:bg-white"
                          on:click={() => moveSection(section, 'down')}
                          disabled={index === sectionsInternal.length - 1}
                        >
                          ↓
                        </button>
                        <button
                          type="button"
                          class="rounded-full border border-black/10 px-3 py-1 text-xs text-black transition hover:bg-white"
                          on:click={() => toggleSection(section)}
                        >
                          {section.isActive ? 'Hide' : 'Show'}
                        </button>
                        <button
                          type="button"
                          class="rounded-full border border-black/10 px-3 py-1 text-xs text-black transition hover:bg-white"
                          on:click={() => openEditForm(section)}
                        >
                          Edit
                        </button>
                        <button
                          type="button"
                          class="rounded-full border border-rose-200 px-3 py-1 text-xs text-rose-700 transition hover:bg-rose-50"
                          on:click={() => deleteSection(section)}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  </div>
                {/each}
              {/if}
            </div>
          </section>

          <section class="rounded-3xl border border-black/10 bg-white p-4 shadow-sm">
            <div class="flex items-start justify-between gap-3">
              <div>
                <h3 class="text-sm font-semibold uppercase tracking-[0.18em] text-black/80">
                  {editingSection ? 'Edit Section' : 'New Section'}
                </h3>
                <p class="mt-1 text-sm text-black/55">
                  Changes save directly to the homepage and refresh the live view behind the drawer.
                </p>
              </div>

              {#if editingSection || formData.title || formData.config.imageUrl || formData.config.description}
                <button
                  type="button"
                  class="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-black transition hover:bg-stone-50"
                  on:click={closeForm}
                >
                  Reset
                </button>
              {/if}
            </div>

            <div class="mt-5 space-y-5">
              <div class="grid gap-4 sm:grid-cols-2">
                <label class="block">
                  <span class="mb-2 block text-sm font-medium text-black">Section type</span>
                  <select
                    bind:value={formData.type}
                    class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                  >
                    {#each sectionTypeOptions as option}
                      <option value={option.value}>{option.label}</option>
                    {/each}
                  </select>
                </label>

                <label class="block">
                  <span class="mb-2 block text-sm font-medium text-black">Order</span>
                  <input
                    type="number"
                    min="0"
                    bind:value={formData.order}
                    class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                  />
                </label>
              </div>

              <label class="block">
                <span class="mb-2 block text-sm font-medium text-black">Title</span>
                <input
                  type="text"
                  bind:value={formData.title}
                  class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                  placeholder="Section title"
                />
              </label>

              <label
                class="flex items-center gap-3 rounded-2xl border border-black/10 bg-stone-50 px-4 py-3"
              >
                <input
                  type="checkbox"
                  bind:checked={formData.isActive}
                  class="h-4 w-4 rounded border-black/20 text-black focus:ring-black"
                />
                <span class="text-sm text-black">Show this section on the homepage</span>
              </label>

              {#if isMediaSection(formData.type)}
                <div class="grid gap-4">
                  <div class="rounded-2xl border border-black/10 bg-stone-50 p-4">
                    <div class="flex items-center justify-between gap-3">
                      <div>
                        <p class="text-sm font-medium text-black">Image</p>
                        <p class="mt-1 text-xs text-black/50">
                          Drag an image here or choose a file. URL stays optional.
                        </p>
                      </div>
                      <button
                        type="button"
                        class="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-black transition hover:bg-white disabled:opacity-50"
                        on:click={() => openSectionFileDialog('imageUrl')}
                        disabled={imageUploading}
                      >
                        {imageUploading ? 'Uploading...' : 'Upload'}
                      </button>
                    </div>
                    <input
                      bind:this={sectionImageInput}
                      type="file"
                      accept="image/*"
                      class="hidden"
                      on:change={(event) => handleSectionFileChange(event, 'imageUrl')}
                    />
                    <div
                      class="mt-3 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition {imageDragging
                        ? 'border-black bg-black/[0.03]'
                        : 'border-black/10 bg-white'}"
                      role="button"
                      tabindex="0"
                      on:dragover={(event) => handleSectionDragOver(event, 'imageUrl')}
                      on:dragleave={(event) => handleSectionDragLeave(event, 'imageUrl')}
                      on:drop={(event) => handleSectionDrop(event, 'imageUrl')}
                      on:click={() => openSectionFileDialog('imageUrl')}
                      on:keydown={(event) => {
                        if (event.key === 'Enter' || event.key === ' ') {
                          event.preventDefault();
                          openSectionFileDialog('imageUrl');
                        }
                      }}
                    >
                      <p class="text-sm font-medium text-black">
                        {imageUploading ? 'Uploading image...' : 'Drop image here'}
                      </p>
                      <p class="mt-1 text-xs text-black/50">
                        PNG, JPG, WEBP and other image formats
                      </p>
                    </div>
                    <input
                      type="url"
                      bind:value={formData.config.imageUrl}
                      class="mt-3 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                      placeholder="Optional direct URL"
                    />
                  </div>

                  {#if supportsVideo(formData.type)}
                    <div class="rounded-2xl border border-black/10 bg-stone-50 p-4">
                      <div class="flex items-center justify-between gap-3">
                        <div>
                          <p class="text-sm font-medium text-black">Video</p>
                          <p class="mt-1 text-xs text-black/50">
                            Drag a video here or choose a file. URL stays optional.
                          </p>
                        </div>
                        <button
                          type="button"
                          class="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-black transition hover:bg-white disabled:opacity-50"
                          on:click={() => openSectionFileDialog('videoUrl')}
                          disabled={videoUploading}
                        >
                          {videoUploading ? 'Uploading...' : 'Upload'}
                        </button>
                      </div>
                      <input
                        bind:this={sectionVideoInput}
                        type="file"
                        accept="video/*"
                        class="hidden"
                        on:change={(event) => handleSectionFileChange(event, 'videoUrl')}
                      />
                      <div
                        class="mt-3 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition {videoDragging
                          ? 'border-black bg-black/[0.03]'
                          : 'border-black/10 bg-white'}"
                        role="button"
                        tabindex="0"
                        on:dragover={(event) => handleSectionDragOver(event, 'videoUrl')}
                        on:dragleave={(event) => handleSectionDragLeave(event, 'videoUrl')}
                        on:drop={(event) => handleSectionDrop(event, 'videoUrl')}
                        on:click={() => openSectionFileDialog('videoUrl')}
                        on:keydown={(event) => {
                          if (event.key === 'Enter' || event.key === ' ') {
                            event.preventDefault();
                            openSectionFileDialog('videoUrl');
                          }
                        }}
                      >
                        <p class="text-sm font-medium text-black">
                          {videoUploading ? 'Uploading video...' : 'Drop video here'}
                        </p>
                        <p class="mt-1 text-xs text-black/50">
                          MP4, MOV, WEBM and other video formats
                        </p>
                      </div>
                      <input
                        type="url"
                        bind:value={formData.config.videoUrl}
                        class="mt-3 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                        placeholder="Optional direct URL"
                      />
                      <div class="mt-3 grid gap-2 sm:grid-cols-2">
                        <label class="flex items-center gap-2 text-sm text-black">
                          <input
                            type="checkbox"
                            bind:checked={formData.config.videoAutoplay}
                            class="h-4 w-4 rounded border-black/20 text-black focus:ring-black"
                          />
                          Autoplay
                        </label>
                        <label class="flex items-center gap-2 text-sm text-black">
                          <input
                            type="checkbox"
                            bind:checked={formData.config.videoLoop}
                            class="h-4 w-4 rounded border-black/20 text-black focus:ring-black"
                          />
                          Loop
                        </label>
                        <label class="flex items-center gap-2 text-sm text-black">
                          <input
                            type="checkbox"
                            bind:checked={formData.config.videoMuted}
                            class="h-4 w-4 rounded border-black/20 text-black focus:ring-black"
                          />
                          Muted
                        </label>
                        <label class="flex items-center gap-2 text-sm text-black">
                          <input
                            type="checkbox"
                            bind:checked={formData.config.videoControls}
                            class="h-4 w-4 rounded border-black/20 text-black focus:ring-black"
                          />
                          Controls
                        </label>
                      </div>
                    </div>
                  {/if}
                </div>
              {/if}

              {#if formData.type === 'audio'}
                <div class="rounded-2xl border border-black/10 bg-stone-50 p-4">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <p class="text-sm font-medium text-black">Audio file</p>
                      <p class="mt-1 text-xs text-black/50">
                        Drag an audio file here or choose one. URL stays optional.
                      </p>
                    </div>
                    <button
                      type="button"
                      class="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-black transition hover:bg-white disabled:opacity-50"
                      on:click={() => openSectionFileDialog('audioUrl')}
                      disabled={audioUploading}
                    >
                      {audioUploading ? 'Uploading...' : 'Upload'}
                    </button>
                  </div>
                  <input
                    bind:this={sectionAudioInput}
                    type="file"
                    accept="audio/*"
                    class="hidden"
                    on:change={(event) => handleSectionFileChange(event, 'audioUrl')}
                  />
                  <div
                    class="mt-3 rounded-2xl border-2 border-dashed px-4 py-6 text-center transition {audioDragging
                      ? 'border-black bg-black/[0.03]'
                      : 'border-black/10 bg-white'}"
                    role="button"
                    tabindex="0"
                    on:dragover={(event) => handleSectionDragOver(event, 'audioUrl')}
                    on:dragleave={(event) => handleSectionDragLeave(event, 'audioUrl')}
                    on:drop={(event) => handleSectionDrop(event, 'audioUrl')}
                    on:click={() => openSectionFileDialog('audioUrl')}
                    on:keydown={(event) => {
                      if (event.key === 'Enter' || event.key === ' ') {
                        event.preventDefault();
                        openSectionFileDialog('audioUrl');
                      }
                    }}
                  >
                    <p class="text-sm font-medium text-black">
                      {audioUploading ? 'Uploading audio...' : 'Drop audio here'}
                    </p>
                    <p class="mt-1 text-xs text-black/50">MP3, WAV, M4A and other audio formats</p>
                  </div>
                  <input
                    type="url"
                    bind:value={formData.config.audioUrl}
                    class="mt-3 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                    placeholder="Optional direct URL"
                  />
                  <div class="mt-4 grid gap-3 sm:grid-cols-2">
                    <label class="block">
                      <span class="mb-2 block text-sm font-medium text-black">Player variant</span>
                      <select
                        bind:value={formData.config.playerVariant}
                        class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                      >
                        <option value="minimal">Minimal</option>
                        <option value="bar">Bar</option>
                        <option value="compact">Compact</option>
                      </select>
                    </label>
                    <label class="block">
                      <span class="mb-2 block text-sm font-medium text-black">Accent color</span>
                      <input
                        type="text"
                        bind:value={formData.config.playerAccentColor}
                        class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                      />
                    </label>
                    <label class="block">
                      <span class="mb-2 block text-sm font-medium text-black">Background color</span
                      >
                      <input
                        type="text"
                        bind:value={formData.config.playerBgColor}
                        class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                      />
                    </label>
                    <div class="rounded-2xl border border-black/10 bg-white px-4 py-3">
                      <p class="mb-2 text-sm font-medium text-black">Controls</p>
                      <div class="grid gap-2">
                        <label class="flex items-center gap-2 text-sm text-black"
                          ><input
                            type="checkbox"
                            bind:checked={formData.config.showPlayPause}
                            class="h-4 w-4 rounded border-black/20 text-black focus:ring-black"
                          /> Play / pause</label
                        >
                        <label class="flex items-center gap-2 text-sm text-black"
                          ><input
                            type="checkbox"
                            bind:checked={formData.config.showProgress}
                            class="h-4 w-4 rounded border-black/20 text-black focus:ring-black"
                          /> Progress</label
                        >
                        <label class="flex items-center gap-2 text-sm text-black"
                          ><input
                            type="checkbox"
                            bind:checked={formData.config.showTime}
                            class="h-4 w-4 rounded border-black/20 text-black focus:ring-black"
                          /> Time</label
                        >
                        <label class="flex items-center gap-2 text-sm text-black"
                          ><input
                            type="checkbox"
                            bind:checked={formData.config.showVolume}
                            class="h-4 w-4 rounded border-black/20 text-black focus:ring-black"
                          /> Volume</label
                        >
                        <label class="flex items-center gap-2 text-sm text-black"
                          ><input
                            type="checkbox"
                            bind:checked={formData.config.autoplay}
                            class="h-4 w-4 rounded border-black/20 text-black focus:ring-black"
                          /> Autoplay</label
                        >
                      </div>
                    </div>
                  </div>
                </div>
              {/if}

              {#if formData.type === 'collection'}
                <div class="rounded-2xl border border-black/10 bg-stone-50 p-4">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <p class="text-sm font-medium text-black">Collection products</p>
                      <p class="mt-1 text-xs text-black/50">
                        Pick the products shown inside this collection section.
                      </p>
                    </div>
                    <span class="rounded-full bg-black px-3 py-1 text-xs font-medium text-white">
                      {formData.config.products.length} selected
                    </span>
                  </div>
                  <input
                    type="search"
                    bind:value={productSearch}
                    class="mt-3 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                    placeholder="Search products"
                  />
                  <div class="mt-3 max-h-64 space-y-2 overflow-y-auto">
                    {#each filteredProducts as product}
                      <label
                        class="flex items-start gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                      >
                        <input
                          type="checkbox"
                          checked={formData.config.products.includes(product.id)}
                          class="mt-0.5 h-4 w-4 rounded border-black/20 text-black focus:ring-black"
                          on:change={() => toggleProduct(product.id)}
                        />
                        <span>
                          <span class="block font-medium">{product.name}</span>
                          <span class="block text-xs text-black/50">{product.slug}</span>
                        </span>
                      </label>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if formData.type === 'lookbook_preview'}
                <div class="rounded-2xl border border-black/10 bg-stone-50 p-4">
                  <p class="text-sm font-medium text-black">Lookbook target</p>
                  <input
                    type="search"
                    bind:value={lookbookSearch}
                    class="mt-3 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                    placeholder="Search lookbooks"
                  />
                  <div class="mt-3 max-h-60 space-y-2 overflow-y-auto">
                    {#each filteredLookbooks as lookbookItem}
                      <label
                        class="flex items-start gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                      >
                        <input
                          type="radio"
                          name="homepage-lookbook"
                          value={lookbookItem.id}
                          checked={formData.config.lookbookId === lookbookItem.id}
                          class="mt-0.5 h-4 w-4 border-black/20 text-black focus:ring-black"
                          on:change={() => (formData.config.lookbookId = lookbookItem.id)}
                        />
                        <span>
                          <span class="block font-medium">{lookbookItem.title}</span>
                          <span class="block text-xs text-black/50">{lookbookItem.slug}</span>
                        </span>
                      </label>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if supportsCards(formData.type)}
                <div class="rounded-2xl border border-black/10 bg-stone-50 p-4">
                  <div class="flex items-center justify-between gap-3">
                    <div>
                      <p class="text-sm font-medium text-black">Cards</p>
                      <p class="mt-1 text-xs text-black/50">
                        Use image or video per card, plus title and link.
                      </p>
                    </div>
                    <button
                      type="button"
                      class="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-black transition hover:bg-white"
                      on:click={addCard}
                    >
                      Add Card
                    </button>
                  </div>

                  <div class="mt-4 space-y-4">
                    {#each formData.config.cards as card, index}
                      <div class="rounded-2xl border border-black/10 bg-white p-4">
                        <div class="flex items-center justify-between gap-3">
                          <p class="text-sm font-medium text-black">Card {index + 1}</p>
                          <button
                            type="button"
                            class="rounded-full border border-rose-200 px-3 py-1 text-xs text-rose-700 transition hover:bg-rose-50"
                            on:click={() => removeCard(index)}
                          >
                            Remove
                          </button>
                        </div>

                        <div class="mt-4 grid gap-3">
                          <div
                            class="flex items-center justify-between gap-3 rounded-2xl border border-black/10 bg-stone-50 px-4 py-3"
                          >
                            <span class="text-sm text-black">Media upload</span>
                            <button
                              type="button"
                              class="rounded-full border border-black/10 px-3 py-1.5 text-xs font-medium text-black transition hover:bg-white disabled:opacity-50"
                              on:click={() => openCardFileDialog(index)}
                              disabled={cardUploading[index]}
                            >
                              {cardUploading[index] ? 'Uploading...' : 'Upload'}
                            </button>
                            <input
                              bind:this={cardFileInputs[index]}
                              type="file"
                              accept="image/*,video/*"
                              class="hidden"
                              on:change={(event) => handleCardFileChange(event, index)}
                            />
                          </div>
                          <div
                            class="rounded-2xl border-2 border-dashed px-4 py-5 text-center transition {cardDragging[
                              index
                            ]
                              ? 'border-black bg-black/[0.03]'
                              : 'border-black/10 bg-stone-50'}"
                            role="button"
                            tabindex="0"
                            on:dragover={(event) => handleCardDragOver(event, index)}
                            on:dragleave={(event) => handleCardDragLeave(event, index)}
                            on:drop={(event) => handleCardDrop(event, index)}
                            on:click={() => openCardFileDialog(index)}
                            on:keydown={(event) => {
                              if (event.key === 'Enter' || event.key === ' ') {
                                event.preventDefault();
                                openCardFileDialog(index);
                              }
                            }}
                          >
                            <p class="text-sm font-medium text-black">
                              {cardUploading[index]
                                ? 'Uploading media...'
                                : 'Drop image or video here'}
                            </p>
                            <p class="mt-1 text-xs text-black/50">
                              Or keep using direct URLs below if needed
                            </p>
                          </div>

                          <input
                            type="text"
                            bind:value={card.title}
                            on:input={(event) =>
                              updateCard(
                                index,
                                'title',
                                (event.currentTarget as HTMLInputElement).value
                              )}
                            class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                            placeholder="Card title"
                          />
                          <input
                            type="text"
                            bind:value={card.link}
                            on:input={(event) =>
                              updateCard(
                                index,
                                'link',
                                (event.currentTarget as HTMLInputElement).value
                              )}
                            class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                            placeholder="/shop/product/..."
                          />
                          <input
                            type="url"
                            bind:value={card.imageUrl}
                            on:input={(event) =>
                              updateCard(
                                index,
                                'imageUrl',
                                (event.currentTarget as HTMLInputElement).value
                              )}
                            class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                            placeholder="Optional image URL"
                          />
                          <input
                            type="url"
                            bind:value={card.videoUrl}
                            on:input={(event) =>
                              updateCard(
                                index,
                                'videoUrl',
                                (event.currentTarget as HTMLInputElement).value
                              )}
                            class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                            placeholder="Optional video URL"
                          />
                          <div class="grid gap-3 sm:grid-cols-2">
                            <input
                              type="text"
                              bind:value={card.borderRadius}
                              on:input={(event) =>
                                updateCard(
                                  index,
                                  'borderRadius',
                                  (event.currentTarget as HTMLInputElement).value
                                )}
                              class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                              placeholder="rounded-lg"
                            />
                            <input
                              type="text"
                              bind:value={card.titleColor}
                              on:input={(event) =>
                                updateCard(
                                  index,
                                  'titleColor',
                                  (event.currentTarget as HTMLInputElement).value
                                )}
                              class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                              placeholder="#ffffff"
                            />
                          </div>
                          <label
                            class="flex items-center gap-3 rounded-2xl border border-black/10 bg-stone-50 px-4 py-3 text-sm text-black"
                          >
                            <input
                              type="checkbox"
                              checked={card.showTitleOnHover === true}
                              class="h-4 w-4 rounded border-black/20 text-black focus:ring-black"
                              on:change={(event) =>
                                updateCard(
                                  index,
                                  'showTitleOnHover',
                                  (event.currentTarget as HTMLInputElement).checked
                                )}
                            />
                            Show title on hover only
                          </label>
                        </div>
                      </div>
                    {/each}
                  </div>
                </div>
              {/if}

              {#if formData.type === 'blog'}
                <div class="rounded-2xl border border-black/10 bg-stone-50 p-4">
                  <div class="grid gap-4 sm:grid-cols-2">
                    <label class="block">
                      <span class="mb-2 block text-sm font-medium text-black">Display mode</span>
                      <select
                        bind:value={formData.config.displayMode}
                        class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                      >
                        <option value="latest">Latest</option>
                        <option value="featured">Featured</option>
                      </select>
                    </label>
                    <label class="block">
                      <span class="mb-2 block text-sm font-medium text-black">Limit</span>
                      <input
                        type="number"
                        min="1"
                        max="12"
                        bind:value={formData.config.limit}
                        class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                      />
                    </label>
                  </div>

                  {#if formData.config.displayMode === 'featured'}
                    <input
                      type="search"
                      bind:value={blogSearch}
                      class="mt-4 w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                      placeholder="Search blog posts"
                    />
                    <div class="mt-3 max-h-64 space-y-2 overflow-y-auto">
                      {#each filteredBlogPosts as post}
                        <label
                          class="flex items-start gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                        >
                          <input
                            type="checkbox"
                            checked={formData.config.postIds.includes(post.id)}
                            class="mt-0.5 h-4 w-4 rounded border-black/20 text-black focus:ring-black"
                            on:change={() => toggleBlogPost(post.id)}
                          />
                          <span>
                            <span class="block font-medium">{post.title}</span>
                            <span class="block text-xs text-black/50">{post.slug}</span>
                          </span>
                        </label>
                      {/each}
                    </div>
                  {/if}
                </div>
              {/if}

              <div class="grid gap-4 sm:grid-cols-2">
                <label class="block">
                  <span class="mb-2 block text-sm font-medium text-black">Description / HTML</span>
                  <textarea
                    bind:value={formData.config.description}
                    rows="5"
                    class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                    placeholder="Section description"
                  ></textarea>
                </label>

                <div class="grid gap-4">
                  <label class="block">
                    <span class="mb-2 block text-sm font-medium text-black">Button text</span>
                    <input
                      type="text"
                      bind:value={formData.config.buttonText}
                      class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                      placeholder="Shop now"
                    />
                  </label>
                  <label class="block">
                    <span class="mb-2 block text-sm font-medium text-black">Button link</span>
                    <input
                      type="text"
                      bind:value={formData.config.buttonLink}
                      class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                      placeholder="/shop"
                    />
                  </label>
                </div>
              </div>

              <div class="rounded-2xl border border-black/10 bg-stone-50 p-4">
                <h4 class="text-sm font-medium text-black">Design</h4>
                <div class="mt-4 grid gap-4 sm:grid-cols-2">
                  <label class="block">
                    <span class="mb-2 block text-sm font-medium text-black">Background</span>
                    <input
                      type="text"
                      bind:value={formData.config.backgroundColor}
                      class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                      placeholder="#ffffff or bg-white"
                    />
                  </label>
                  <label class="block">
                    <span class="mb-2 block text-sm font-medium text-black">Text color</span>
                    <input
                      type="text"
                      bind:value={formData.config.textColor}
                      class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                      placeholder="#111111"
                    />
                  </label>
                  <label class="block">
                    <span class="mb-2 block text-sm font-medium text-black">Button color</span>
                    <input
                      type="text"
                      bind:value={formData.config.buttonColor}
                      class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                      placeholder="#000000"
                    />
                  </label>
                  <label class="block">
                    <span class="mb-2 block text-sm font-medium text-black">Button text color</span>
                    <input
                      type="text"
                      bind:value={formData.config.buttonTextColor}
                      class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                      placeholder="#ffffff"
                    />
                  </label>
                  <label class="block">
                    <span class="mb-2 block text-sm font-medium text-black">Text align</span>
                    <select
                      bind:value={formData.config.textAlign}
                      class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                    >
                      <option value="left">Left</option>
                      <option value="center">Center</option>
                      <option value="right">Right</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="mb-2 block text-sm font-medium text-black">Media ratio</span>
                    <select
                      bind:value={formData.config.mediaAspectRatio}
                      class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                    >
                      <option value="auto">Auto</option>
                      <option value="1:1">1:1</option>
                      <option value="4:5">4:5</option>
                      <option value="3:4">3:4</option>
                      <option value="16:9">16:9</option>
                      <option value="9:16">9:16</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="mb-2 block text-sm font-medium text-black">Media hover</span>
                    <select
                      bind:value={formData.config.mediaHoverEffect}
                      class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                    >
                      <option value="zoom">Zoom</option>
                      <option value="dim">Dim</option>
                      <option value="none">None</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="mb-2 block text-sm font-medium text-black">Media CTA</span>
                    <select
                      bind:value={formData.config.mediaLinkMode}
                      class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                    >
                      <option value="hover">On hover</option>
                      <option value="always">Always visible</option>
                      <option value="none">Off</option>
                    </select>
                  </label>
                  <label class="block">
                    <span class="mb-2 block text-sm font-medium text-black">Padding top</span>
                    <input
                      type="text"
                      bind:value={formData.config.paddingTop}
                      class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                      placeholder="pt-16"
                    />
                  </label>
                  <label class="block">
                    <span class="mb-2 block text-sm font-medium text-black">Padding bottom</span>
                    <input
                      type="text"
                      bind:value={formData.config.paddingBottom}
                      class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                      placeholder="pb-16"
                    />
                  </label>
                  <label class="block">
                    <span class="mb-2 block text-sm font-medium text-black">Overlay color</span>
                    <input
                      type="text"
                      bind:value={formData.config.overlayColor}
                      class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                      placeholder="rgba(0,0,0,0.5)"
                    />
                  </label>
                  <label class="block">
                    <span class="mb-2 block text-sm font-medium text-black">Overlay opacity</span>
                    <input
                      type="text"
                      bind:value={formData.config.overlayOpacity}
                      class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                      placeholder="0-100"
                    />
                  </label>
                </div>

                <div class="mt-4 grid gap-3">
                  <label
                    class="flex items-center gap-3 rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                  >
                    <input
                      type="checkbox"
                      bind:checked={formData.config.titleOverlayOnMedia}
                      class="h-4 w-4 rounded border-black/20 text-black focus:ring-black"
                    />
                    Overlay the title on top of the media
                  </label>
                  {#if formData.type === 'text_block'}
                    <div class="grid gap-4 sm:grid-cols-2">
                      <label class="block">
                        <span class="mb-2 block text-sm font-medium text-black">Text width</span>
                        <select
                          bind:value={formData.config.textBlockMaxWidth}
                          class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                        >
                          <option value="narrow">Narrow</option>
                          <option value="medium">Medium</option>
                          <option value="wide">Wide</option>
                          <option value="full">Full</option>
                        </select>
                      </label>
                      <label class="block">
                        <span class="mb-2 block text-sm font-medium text-black">Animation</span>
                        <select
                          bind:value={formData.config.textBlockAnimation}
                          class="w-full rounded-2xl border border-black/10 bg-white px-4 py-3 text-sm text-black"
                        >
                          <option value="fade_up">Fade up</option>
                          <option value="fade">Fade</option>
                          <option value="scale">Scale</option>
                          <option value="none">None</option>
                        </select>
                      </label>
                    </div>
                  {/if}
                </div>
              </div>

              <div class="flex flex-wrap items-center justify-end gap-3">
                <button
                  type="button"
                  class="rounded-full border border-black/10 px-4 py-2 text-sm font-medium text-black transition hover:bg-stone-50"
                  on:click={closeForm}
                >
                  Cancel
                </button>
                <button
                  type="button"
                  class="rounded-full bg-black px-5 py-2.5 text-sm font-medium text-white transition hover:bg-black/80 disabled:opacity-60"
                  on:click={saveSection}
                  disabled={saving}
                >
                  {saving ? 'Saving...' : editingSection ? 'Save Changes' : 'Create Section'}
                </button>
              </div>
            </div>
          </section>
        </div>
      {/if}
    </div>
  </aside>
{/if}
