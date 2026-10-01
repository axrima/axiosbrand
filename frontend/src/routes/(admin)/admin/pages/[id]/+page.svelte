<script lang="ts">
  import { onMount } from 'svelte';
  import { page } from '$app/stores';
  import { pageApi, type Page } from '$lib/api/page.api';
  import { goto } from '$app/navigation';
  import { uploadHomepageMedia } from '$lib/api/homepage-upload';
  import { translationApi, type PageTranslation } from '$lib/api/translation.api';
  import { languageApi, type Language } from '$lib/api/language.api';
  import { t } from '$lib/utils/i18n';
  import { resolveApiError } from '$lib/utils/error-handler';
  import LoadingBar from '$lib/components/LoadingBar.svelte';
  import { dialogStore } from '$lib/stores/dialog.store';
  import { notificationStore } from '$lib/stores/notification.store';

  let loading = true;
  let saving = false;
  let error = '';
  let pageData: Page | null = null;
  let uploadingImage = false;
  let uploadingVideo = false;
  let imageFileInput: HTMLInputElement | null = null;
  let videoFileInput: HTMLInputElement | null = null;
  let isDraggingImage = false;
  let isDraggingVideo = false;

  // Translation management
  let languages: Language[] = [];
  let translations: PageTranslation[] = [];
  let showTranslations = false;
  let editingTranslation: PageTranslation | null = null;
  let selectedLanguageForTranslation = '';
  let gptTranslating = false;
  let translationFormData = {
    title: '',
    content: '',
    metaTitle: '',
    metaDescription: '',
    config: {} as Record<string, any>,
  };

  // Parse content as JSON config if it exists, otherwise use default structure
  let formData = {
    slug: '',
    title: '',
    content: '',
    metaTitle: '',
    metaDescription: '',
    isActive: true,
    config: {
      imageUrl: '',
      videoUrl: '',
      buttonText: '',
      buttonLink: '',
      description: '',
      badge: '',
      eyebrow: '',
      sideTitle: '',
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
      // Grid settings
      gridColumns: '1',
      gridGap: '4',
      gridLayout: 'default' as 'default' | 'masonry' | 'grid',
    },
  };

  $: pageId = $page.params.id;

  onMount(async () => {
    await Promise.all([loadPage(), loadLanguages()]);
  });

  async function loadLanguages() {
    try {
      const response = await languageApi.getAll();
      languages = response.languages;
    } catch (e) {
      console.error('Failed to load languages:', e);
    }
  }

  async function loadTranslations() {
    if (!pageData) return;
    try {
      const response = await translationApi.getPageTranslations(pageData.id);
      translations = response.translations;
    } catch (e) {
      console.error('Failed to load translations:', e);
      translations = [];
    }
  }

  function openTranslationEditor() {
    if (!pageData) return;
    showTranslations = true;
    editingTranslation = null;
    selectedLanguageForTranslation = '';
    translationFormData = {
      title: '',
      content: '',
      metaTitle: '',
      metaDescription: '',
      config: {},
    };
    loadTranslations();
  }

  function closeTranslationEditor() {
    showTranslations = false;
    editingTranslation = null;
    selectedLanguageForTranslation = '';
    translationFormData = {
      title: '',
      content: '',
      metaTitle: '',
      metaDescription: '',
      config: {},
    };
  }

  function editTranslation(translation: PageTranslation) {
    editingTranslation = translation;
    selectedLanguageForTranslation = translation.languageCode;
    translationFormData = {
      title: translation.title || '',
      content: translation.content || '',
      metaTitle: translation.metaTitle || '',
      metaDescription: translation.metaDescription || '',
      config: translation.config || {},
    };
  }

  async function saveTranslation() {
    if (!pageData) return;

    try {
      // Merge config with translated fields
      const config = {
        ...formData.config,
        ...translationFormData.config,
        buttonText: translationFormData.config.buttonText || formData.config.buttonText,
        description: translationFormData.config.description || formData.config.description,
      };

      await translationApi.upsertPageTranslation(pageData.id, {
        languageCode: selectedLanguageForTranslation,
        title: translationFormData.title || undefined,
        content: translationFormData.content || undefined,
        metaTitle: translationFormData.metaTitle || undefined,
        metaDescription: translationFormData.metaDescription || undefined,
        config: Object.keys(config).length > 0 ? config : undefined,
      });
      notificationStore.success(t('notification.translationSaved'));
      await loadTranslations();
      editingTranslation = null;
      selectedLanguageForTranslation = '';
      translationFormData = {
        title: '',
        content: '',
        metaTitle: '',
        metaDescription: '',
        config: {},
      };
    } catch (e: any) {
      notificationStore.error(e.response?.data?.error || t('error.failedToSave'));
    }
  }

  async function deleteTranslation(languageCode: string) {
    if (!pageData) return;

    const confirmed = await dialogStore.confirm(t('alert.deleteTranslation'), t('common.confirm'));
    if (!confirmed) return;

    try {
      await translationApi.deletePageTranslation(pageData.id, languageCode);
      notificationStore.success(t('notification.translationDeleted'));
      await loadTranslations();
    } catch (e: any) {
      notificationStore.error(e.response?.data?.error || t('error.failedToDelete'));
    }
  }

  async function translateWithGPT() {
    if (!pageData) return;

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
      if (pageData.title) {
        try {
          const titleTranslation = await translationApi.generateGPTTranslation({
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage,
            content: pageData.title,
          });
          translationFormData.title = titleTranslation.translation;
        } catch (e) {
          console.error('Failed to translate title:', e);
        }
      }

      // Translate content
      if (pageData.content) {
        try {
          const contentTranslation = await translationApi.generateGPTTranslation({
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage,
            content: pageData.content,
          });
          translationFormData.content = contentTranslation.translation;
        } catch (e) {
          console.error('Failed to translate content:', e);
        }
      }

      // Translate meta title
      if (pageData.metaTitle) {
        try {
          const metaTitleTranslation = await translationApi.generateGPTTranslation({
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage,
            content: pageData.metaTitle,
          });
          translationFormData.metaTitle = metaTitleTranslation.translation;
        } catch (e) {
          console.error('Failed to translate meta title:', e);
        }
      }

      // Translate meta description
      if (pageData.metaDescription) {
        try {
          const metaDescTranslation = await translationApi.generateGPTTranslation({
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage,
            content: pageData.metaDescription,
          });
          translationFormData.metaDescription = metaDescTranslation.translation;
        } catch (e) {
          console.error('Failed to translate meta description:', e);
        }
      }

      // Translate button text
      if (formData.config?.buttonText) {
        try {
          const buttonTranslation = await translationApi.generateGPTTranslation({
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage,
            content: formData.config.buttonText,
          });
          translationFormData.config.buttonText = buttonTranslation.translation;
        } catch (e) {
          console.error('Failed to translate button text:', e);
        }
      }

      // Translate description
      if (formData.config?.description) {
        try {
          const descTranslation = await translationApi.generateGPTTranslation({
            sourceLanguage: sourceLanguage,
            targetLanguage: targetLanguage,
            content: formData.config.description,
          });
          translationFormData.config.description = descTranslation.translation;
        } catch (e) {
          console.error('Failed to translate description:', e);
        }
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

  async function loadPage() {
    loading = true;
    error = '';
    try {
      const response = await pageApi.getById(pageId);
      pageData = response.page;

      if (pageData) {
        formData.slug = pageData.slug;
        formData.title = pageData.title;
        formData.metaTitle = pageData.metaTitle || '';
        formData.metaDescription = pageData.metaDescription || '';
        formData.isActive = pageData.isActive;

        // Try to parse content as JSON config
        if (pageData.content) {
          try {
            const parsed = JSON.parse(pageData.content);
            if (parsed.config) {
              formData.config = {
                imageUrl: parsed.config.imageUrl || '',
                videoUrl: parsed.config.videoUrl || '',
                buttonText: parsed.config.buttonText || '',
                buttonLink: parsed.config.buttonLink || '',
                description: parsed.config.description || '',
                badge: parsed.config.badge || '',
                eyebrow: parsed.config.eyebrow || '',
                sideTitle: parsed.config.sideTitle || '',
                backgroundColor: parsed.config.backgroundColor || '',
                textColor: parsed.config.textColor || '',
                buttonColor: parsed.config.buttonColor || '',
                buttonTextColor: parsed.config.buttonTextColor || '',
                titleSize: parsed.config.titleSize || '',
                subtitleSize: parsed.config.subtitleSize || '',
                paddingTop: parsed.config.paddingTop || '',
                paddingBottom: parsed.config.paddingBottom || '',
                textAlign: (parsed.config.textAlign as 'left' | 'center' | 'right') || 'center',
                imageOpacity: parsed.config.imageOpacity || '50',
                sectionHeight: parsed.config.sectionHeight || '',
                overlayColor: parsed.config.overlayColor || '',
                overlayOpacity: parsed.config.overlayOpacity || '0',
                mediaAspectRatio:
                  (parsed.config.mediaAspectRatio as
                    | 'auto'
                    | '1:1'
                    | '4:5'
                    | '3:4'
                    | '16:9'
                    | '9:16') || 'auto',
                gridColumns: parsed.config.gridColumns || '1',
                gridGap: parsed.config.gridGap || '4',
                gridLayout:
                  (parsed.config.gridLayout as 'default' | 'masonry' | 'grid') || 'default',
              };
              formData.content = parsed.content || '';
            } else {
              // Old format - just HTML content
              formData.content = pageData.content;
            }
          } catch {
            // Not JSON, treat as plain HTML content
            formData.content = pageData.content;
          }
        }
      }
    } catch (e: any) {
      error = e.response?.data?.error || e.message || t('error.failedToLoad');
    } finally {
      loading = false;
    }
  }

  async function uploadImageFile(file: File) {
    uploadingImage = true;
    try {
      const data = await uploadHomepageMedia(file);
      formData.config.imageUrl = data.url;
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : t('page.failedToUploadImage');
      notificationStore.error(errorMsg);
    } finally {
      uploadingImage = false;
    }
  }

  async function uploadVideoFile(file: File) {
    uploadingVideo = true;
    try {
      const data = await uploadHomepageMedia(file);
      formData.config.videoUrl = data.url;
      if (data.posterUrl) {
        formData.config.imageUrl = data.posterUrl;
      }
    } catch (e) {
      const errorMsg = e instanceof Error ? e.message : t('page.failedToUploadVideo');
      notificationStore.error(errorMsg);
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

    const files = event.dataTransfer?.files;
    if (files && files[0]) {
      if (files[0].type.startsWith('image/')) {
        uploadImageFile(files[0]);
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

    const files = event.dataTransfer?.files;
    if (files && files[0]) {
      if (files[0].type.startsWith('video/')) {
        uploadVideoFile(files[0]);
      }
    }
  }

  function openImageFileDialog() {
    imageFileInput?.click();
  }

  function openVideoFileDialog() {
    videoFileInput?.click();
  }

  async function savePage() {
    saving = true;
    error = '';
    try {
      // Store config and content as JSON in content field
      const contentData = {
        content: formData.content,
        config: formData.config,
      };

      const data = {
        title: formData.title,
        content: JSON.stringify(contentData),
        metaTitle: formData.metaTitle || undefined,
        metaDescription: formData.metaDescription || undefined,
        isActive: formData.isActive,
      };

      await pageApi.update(pageId, data);
      goto('/admin/pages');
    } catch (e: any) {
      error = e.response?.data?.error || e.message || t('error.failedToSave');
    } finally {
      saving = false;
    }
  }

  async function deletePage() {
    const confirmed = await dialogStore.confirm(t('alert.deletePage'), t('common.confirm'));
    if (!confirmed) return;

    try {
      await pageApi.delete(pageId);
      goto('/admin/pages');
    } catch (e: any) {
      notificationStore.error(e.response?.data?.error || e.message || t('error.failedToDelete'));
    }
  }
</script>

<div>
  <div class="flex justify-between items-center mb-6">
    <h2 class="text-3xl font-bold">{t('page.editPage')}</h2>
    <div class="flex gap-2">
      <button
        on:click={openTranslationEditor}
        class="px-4 py-2 bg-black text-white hover:bg-accent transition-colors"
      >
        {t('page.translations')}
      </button>
      <button
        on:click={() => goto('/admin/pages')}
        class="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-100 transition-colors text-black"
      >
        {t('common.back')}
      </button>
      <button
        on:click={deletePage}
        class="px-4 py-2 bg-white border border-red-500/20 hover:bg-red-50 transition-colors text-red-400"
      >
        {t('common.delete')}
      </button>
    </div>
  </div>

  {#if loading}
    <div class="w-full py-8"><LoadingBar /></div>
  {:else if error && !pageData}
    <div class="bg-red-500/10 border border-red-500/20 p-4">
      <p class="text-red-400">{error}</p>
    </div>
  {:else if pageData}
    {#if error}
      <div class="bg-red-500/10 border border-red-500/20 p-4 mb-6">
        <p class="text-red-400">{error}</p>
      </div>
    {/if}

    <div class="bg-dark-light p-6">
      <div class="space-y-6">
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label for="pageSlug" class="block text-sm font-medium mb-2">{t('common.slug')}</label>
            <input
              id="pageSlug"
              type="text"
              value={formData.slug}
              disabled
              class="w-full px-4 py-2 bg-gray-100 border border-gray-300 text-gray-600 cursor-not-allowed"
            />
            <p class="text-xs text-accent-muted mt-1">
              {t('page.slugCannotChange')}
            </p>
          </div>
          <div>
            <label for="pageTitle" class="block text-sm font-medium mb-2"
              >{t('page.pageTitle')} *</label
            >
            <input
              id="pageTitle"
              type="text"
              bind:value={formData.title}
              class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
              placeholder={t('page.pageTitle')}
            />
          </div>
        </div>

        <!-- Images & Videos Section -->
        <div class="pt-6 border-t border-accent/20">
          <h4 class="text-lg font-medium mb-4">{t('page.imagesAndVideos')}</h4>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <!-- Image Upload -->
            <div>
              <label for="pageImageUrl" class="block text-sm font-medium mb-2"
                >{t('page.imageUrl')}</label
              >
              <input
                id="pageImageUrl"
                type="url"
                bind:value={formData.config.imageUrl}
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black mb-2"
                placeholder="https://example.com/image.jpg"
              />

              <!-- Image Upload Zone -->
              <div
                class="relative border-2 border-dashed p-6 text-center transition-all {isDraggingImage
                  ? 'border-black bg-black/5'
                  : 'border-black/30 bg-white hover:border-black/50 hover:bg-black/5'}"
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
                  type="file"
                  accept="image/*"
                  on:change={handleImageFileSelect}
                  class="hidden"
                />
                <button
                  type="button"
                  on:click={openImageFileDialog}
                  disabled={uploadingImage}
                  class="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-100 transition-colors text-black disabled:opacity-50"
                >
                  {uploadingImage ? t('page.uploading') : t('page.uploadImage')}
                </button>
                <p class="text-xs text-accent-muted mt-2">
                  {t('page.dragAndDrop')}
                </p>
              </div>

              {#if formData.config.imageUrl}
                <div class="mt-2">
                  <img
                    src={formData.config.imageUrl}
                    alt={t('page.preview')}
                    class="max-w-md h-48 object-cover"
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

            <!-- Video Upload -->
            <div>
              <label for="pageVideoUrl" class="block text-sm font-medium mb-2"
                >{t('page.videoUrlOptional')}</label
              >
              <input
                id="pageVideoUrl"
                type="url"
                bind:value={formData.config.videoUrl}
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black mb-2"
                placeholder="https://example.com/video.mp4"
              />

              <!-- Video Upload Zone -->
              <div
                class="relative border-2 border-dashed p-6 text-center transition-all {isDraggingVideo
                  ? 'border-black bg-black/5'
                  : 'border-black/30 bg-white hover:border-black/50 hover:bg-black/5'}"
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
                  type="file"
                  accept="video/*"
                  on:change={handleVideoFileSelect}
                  class="hidden"
                />
                <button
                  type="button"
                  on:click={openVideoFileDialog}
                  disabled={uploadingVideo}
                  class="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-100 transition-colors text-black disabled:opacity-50"
                >
                  {uploadingVideo ? t('page.uploading') : t('page.uploadVideo')}
                </button>
                <p class="text-xs text-accent-muted mt-2">
                  {t('page.dragAndDrop')}
                </p>
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label for="pageMediaRatio" class="block text-sm font-medium mb-2">Media Ratio</label>
              <select
                id="pageMediaRatio"
                bind:value={formData.config.mediaAspectRatio}
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
              >
                <option value="auto">Auto</option>
                <option value="1:1">1:1</option>
                <option value="4:5">4:5</option>
                <option value="3:4">3:4</option>
                <option value="16:9">16:9</option>
                <option value="9:16">9:16</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Content Section -->
        <div>
          <label for="pageDescriptionContent" class="block text-sm font-medium mb-2"
            >{t('page.descriptionContent')}</label
          >
          <textarea
            id="pageDescriptionContent"
            bind:value={formData.config.description}
            rows="4"
            class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
            placeholder={t('page.pageDescription')}
          ></textarea>
        </div>

        {#if formData.slug === 'login'}
          <div class="pt-6 border-t border-accent/20">
            <h4 class="text-lg font-medium mb-4">Login Hero Content</h4>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
              <div>
                <label for="pageLoginBadge" class="block text-sm font-medium mb-2">Badge</label>
                <input
                  id="pageLoginBadge"
                  type="text"
                  bind:value={formData.config.badge}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                  placeholder="Content Management"
                />
              </div>
              <div>
                <label for="pageLoginEyebrow" class="block text-sm font-medium mb-2">Eyebrow</label>
                <input
                  id="pageLoginEyebrow"
                  type="text"
                  bind:value={formData.config.eyebrow}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                  placeholder="Admin access"
                />
              </div>
            </div>
            <div>
              <label for="pageLoginSideTitle" class="block text-sm font-medium mb-2"
                >Left Panel Title</label
              >
              <textarea
                id="pageLoginSideTitle"
                bind:value={formData.config.sideTitle}
                rows="3"
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                placeholder="Visual workspace for your shop operations."
              ></textarea>
            </div>
          </div>
        {/if}

        <div>
          <label for="pageHtmlContent" class="block text-sm font-medium mb-2"
            >{t('page.htmlContent')}</label
          >
          <textarea
            id="pageHtmlContent"
            bind:value={formData.content}
            rows="10"
            class="w-full px-4 py-2 bg-white border border-gray-300 text-black font-mono text-sm"
            placeholder={t('page.htmlContentPlaceholder')}
          ></textarea>
          <p class="text-xs text-accent-muted mt-1">
            {t('page.htmlHint')}
          </p>
        </div>

        <!-- Grid Settings -->
        <div class="pt-6 border-t border-accent/20">
          <h4 class="text-lg font-medium mb-4">{t('page.gridSettings')}</h4>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label for="pageGridColumns" class="block text-sm font-medium mb-2"
                >{t('page.gridColumns')}</label
              >
              <select
                id="pageGridColumns"
                bind:value={formData.config.gridColumns}
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
              >
                <option value="1">1 {t('page.column')}</option>
                <option value="2">2 {t('page.columns')}</option>
                <option value="3">3 {t('page.columns')}</option>
                <option value="4">4 {t('page.columns')}</option>
                <option value="5">5 {t('page.columns')}</option>
                <option value="6">6 {t('page.columns')}</option>
              </select>
            </div>
            <div>
              <label for="pageGridGap" class="block text-sm font-medium mb-2"
                >{t('page.gridGap')}</label
              >
              <select
                id="pageGridGap"
                bind:value={formData.config.gridGap}
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
              >
                <option value="0">{t('page.noGap')}</option>
                <option value="2">{t('page.small')} (gap-2)</option>
                <option value="4">{t('page.medium')} (gap-4)</option>
                <option value="6">{t('page.large')} (gap-6)</option>
                <option value="8">{t('page.extraLarge')} (gap-8)</option>
              </select>
            </div>
            <div>
              <label for="pageGridLayout" class="block text-sm font-medium mb-2"
                >{t('page.gridLayout')}</label
              >
              <select
                id="pageGridLayout"
                bind:value={formData.config.gridLayout}
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
              >
                <option value="default">{t('page.defaultGrid')}</option>
                <option value="masonry">{t('page.masonry')}</option>
                <option value="grid">{t('page.uniformGrid')}</option>
              </select>
            </div>
          </div>
        </div>

        <!-- Design Settings -->
        <div class="pt-6 border-t border-accent/20">
          <h4 class="text-lg font-medium mb-4">{t('page.designSettings')}</h4>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label for="pageBackgroundColor" class="block text-sm font-medium mb-2"
                >{t('page.backgroundColor')}</label
              >
              <div class="flex gap-2">
                <input
                  id="pageBackgroundColor"
                  type="color"
                  bind:value={formData.config.backgroundColor}
                  class="w-16 h-10 border border-gray-300 cursor-pointer"
                />
                <input
                  type="text"
                  bind:value={formData.config.backgroundColor}
                  class="flex-1 px-4 py-2 bg-white border border-gray-300 text-black"
                  placeholder="#ffffff or transparent"
                />
              </div>
            </div>
            <div>
              <label for="pageTextColor" class="block text-sm font-medium mb-2"
                >{t('page.textColor')}</label
              >
              <div class="flex gap-2">
                <input
                  id="pageTextColor"
                  type="color"
                  bind:value={formData.config.textColor}
                  class="w-16 h-10 border border-gray-300 cursor-pointer"
                />
                <input
                  type="text"
                  bind:value={formData.config.textColor}
                  class="flex-1 px-4 py-2 bg-white border border-gray-300 text-black"
                  placeholder="#000000"
                />
              </div>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label for="pageButtonText" class="block text-sm font-medium mb-2"
                >{t('page.buttonText')}</label
              >
              <input
                id="pageButtonText"
                type="text"
                bind:value={formData.config.buttonText}
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                placeholder="Shop Now"
              />
            </div>
            <div>
              <label for="pageButtonLink" class="block text-sm font-medium mb-2"
                >{t('page.buttonLink')}</label
              >
              <input
                id="pageButtonLink"
                type="text"
                bind:value={formData.config.buttonLink}
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                placeholder="/shop"
              />
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label for="pageButtonColor" class="block text-sm font-medium mb-2"
                >{t('page.buttonBackgroundColor')}</label
              >
              <div class="flex gap-2">
                <input
                  id="pageButtonColor"
                  type="color"
                  bind:value={formData.config.buttonColor}
                  class="w-16 h-10 border border-gray-300 cursor-pointer"
                />
                <input
                  type="text"
                  bind:value={formData.config.buttonColor}
                  class="flex-1 px-4 py-2 bg-white border border-gray-300 text-black"
                  placeholder="#000000"
                />
              </div>
            </div>
            <div>
              <label for="pageButtonTextColor" class="block text-sm font-medium mb-2"
                >{t('page.buttonTextColor')}</label
              >
              <div class="flex gap-2">
                <input
                  id="pageButtonTextColor"
                  type="color"
                  bind:value={formData.config.buttonTextColor}
                  class="w-16 h-10 border border-gray-300 cursor-pointer"
                />
                <input
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
              <label for="pageTitleSize" class="block text-sm font-medium mb-2"
                >{t('page.titleSize')}</label
              >
              <select
                id="pageTitleSize"
                bind:value={formData.config.titleSize}
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
              >
                <option value="">{t('common.default')}</option>
                <option value="text-4xl">{t('page.small')} (text-4xl)</option>
                <option value="text-5xl">{t('page.medium')} (text-5xl)</option>
                <option value="text-6xl">{t('page.large')} (text-6xl)</option>
                <option value="text-7xl">{t('page.extraLarge')} (text-7xl)</option>
                <option value="text-8xl">2XL (text-8xl)</option>
                <option value="text-9xl">3XL (text-9xl)</option>
              </select>
            </div>
            <div>
              <label for="pageSubtitleSize" class="block text-sm font-medium mb-2"
                >{t('page.subtitleSize')}</label
              >
              <select
                id="pageSubtitleSize"
                bind:value={formData.config.subtitleSize}
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
              >
                <option value="">{t('common.default')}</option>
                <option value="text-lg">{t('page.small')} (text-lg)</option>
                <option value="text-xl">{t('page.medium')} (text-xl)</option>
                <option value="text-2xl">{t('page.large')} (text-2xl)</option>
                <option value="text-3xl">{t('page.extraLarge')} (text-3xl)</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-3 gap-4 mb-4">
            <div>
              <label for="pageTextAlign" class="block text-sm font-medium mb-2"
                >{t('page.textAlignment')}</label
              >
              <select
                id="pageTextAlign"
                bind:value={formData.config.textAlign}
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
              >
                <option value="left">{t('page.left')}</option>
                <option value="center">{t('page.center')}</option>
                <option value="right">{t('page.right')}</option>
              </select>
            </div>
            <div>
              <label for="pageImageOpacity" class="block text-sm font-medium mb-2"
                >{t('page.imageOpacity')}</label
              >
              <input
                id="pageImageOpacity"
                type="number"
                bind:value={formData.config.imageOpacity}
                min="0"
                max="100"
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                placeholder="50"
              />
            </div>
            <div>
              <label for="pageSectionHeight" class="block text-sm font-medium mb-2"
                >{t('page.sectionHeight')}</label
              >
              <select
                id="pageSectionHeight"
                bind:value={formData.config.sectionHeight}
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
              >
                <option value="">{t('page.auto')}</option>
                <option value="h-screen">{t('page.fullScreen')}</option>
                <option value="h-[60vh]">60vh</option>
                <option value="h-[80vh]">80vh</option>
                <option value="min-h-screen">{t('page.minFullScreen')}</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4 mb-4">
            <div>
              <label for="pagePaddingTop" class="block text-sm font-medium mb-2"
                >{t('page.paddingTop')}</label
              >
              <select
                id="pagePaddingTop"
                bind:value={formData.config.paddingTop}
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
              >
                <option value="">{t('common.default')}</option>
                <option value="py-10">{t('page.small')} (py-10)</option>
                <option value="py-20">{t('page.medium')} (py-20)</option>
                <option value="py-32">{t('page.large')} (py-32)</option>
                <option value="pt-10">{t('page.topOnlySmall')}</option>
                <option value="pt-20">{t('page.topOnlyMedium')}</option>
              </select>
            </div>
            <div>
              <label for="pagePaddingBottom" class="block text-sm font-medium mb-2"
                >{t('page.paddingBottom')}</label
              >
              <select
                id="pagePaddingBottom"
                bind:value={formData.config.paddingBottom}
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
              >
                <option value="">{t('common.default')}</option>
                <option value="pb-10">{t('page.small')} (pb-10)</option>
                <option value="pb-20">{t('page.medium')} (pb-20)</option>
                <option value="pb-32">{t('page.large')} (pb-32)</option>
              </select>
            </div>
          </div>

          <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div>
              <label for="pageOverlayColor" class="block text-sm font-medium mb-2"
                >{t('page.overlayColor')}</label
              >
              <div class="flex gap-2">
                <input
                  id="pageOverlayColor"
                  type="color"
                  bind:value={formData.config.overlayColor}
                  class="w-16 h-10 border border-gray-300 cursor-pointer"
                />
                <input
                  type="text"
                  bind:value={formData.config.overlayColor}
                  class="flex-1 px-4 py-2 bg-white border border-gray-300 text-black"
                  placeholder="#000000"
                />
              </div>
            </div>
            <div>
              <label for="pageOverlayOpacity" class="block text-sm font-medium mb-2"
                >{t('page.overlayOpacity')}</label
              >
              <input
                id="pageOverlayOpacity"
                type="number"
                bind:value={formData.config.overlayOpacity}
                min="0"
                max="100"
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                placeholder="0"
              />
            </div>
          </div>
        </div>

        <!-- SEO Settings -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <label for="pageMetaTitle" class="block text-sm font-medium mb-2"
              >{t('page.metaTitle')} (SEO)</label
            >
            <input
              id="pageMetaTitle"
              type="text"
              bind:value={formData.metaTitle}
              class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
              placeholder={t('page.seoTitle')}
            />
          </div>
          <div>
            <label for="pageMetaDescription" class="block text-sm font-medium mb-2"
              >{t('page.metaDescription')} (SEO)</label
            >
            <textarea
              id="pageMetaDescription"
              bind:value={formData.metaDescription}
              rows="2"
              class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
              placeholder={t('page.seoDescription')}
            ></textarea>
          </div>
        </div>

        <div class="flex items-center gap-2 pt-4 border-t border-accent/20">
          <input type="checkbox" bind:checked={formData.isActive} id="isActive" class="" />
          <label for="isActive" class="text-sm font-medium">
            {t('page.activeVisibleOnSite')}
          </label>
        </div>

        <div class="flex gap-4 pt-4">
          <button
            on:click={savePage}
            disabled={saving}
            class="px-6 py-2 bg-accent text-dark hover:bg-accent-muted transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {saving ? t('common.saving') : t('common.saveChanges')}
          </button>
          <button
            on:click={() => goto('/admin/pages')}
            class="px-6 py-2 bg-white border border-gray-300 hover:bg-gray-100 transition-colors text-black"
          >
            {t('common.cancel')}
          </button>
        </div>
      </div>
    </div>

    {#if showTranslations && pageData}
      <div class="bg-dark-light p-6 mb-6 mt-6">
        <div class="flex justify-between items-center mb-4">
          <h3 class="text-xl font-medium">{t('page.translations')} - {pageData.title}</h3>
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
            {editingTranslation ? t('page.editTranslation') : t('page.addTranslation')}
          </h4>
          <div class="space-y-4">
            <div>
              <label for="translationLanguage" class="block text-sm font-medium mb-2"
                >{t('language.language')} *</label
              >
              <select
                id="translationLanguage"
                bind:value={selectedLanguageForTranslation}
                disabled={!!editingTranslation}
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black disabled:opacity-50"
              >
                <option value="">{t('common.select')} {t('language.language').toLowerCase()}</option
                >
                {#each languages as lang}
                  {#if !translations.find((t) => t.languageCode === lang.code) || editingTranslation?.languageCode === lang.code}
                    <option value={lang.code}>{lang.name} ({lang.code})</option>
                  {/if}
                {/each}
              </select>
            </div>
            <div>
              <label for="translationTitle" class="block text-sm font-medium mb-2"
                >{t('page.pageTitle')}</label
              >
              <input
                id="translationTitle"
                type="text"
                bind:value={translationFormData.title}
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                placeholder={pageData.title}
              />
            </div>
            <div>
              <label for="translationContent" class="block text-sm font-medium mb-2"
                >{t('page.pageContent')}</label
              >
              <textarea
                id="translationContent"
                bind:value={translationFormData.content}
                rows="6"
                class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                placeholder={formData.content || ''}
              ></textarea>
            </div>
            <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
              <div>
                <label for="translationMetaTitle" class="block text-sm font-medium mb-2"
                  >{t('page.metaTitle')}</label
                >
                <input
                  id="translationMetaTitle"
                  type="text"
                  bind:value={translationFormData.metaTitle}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                  placeholder={pageData.metaTitle || ''}
                />
              </div>
              <div>
                <label for="translationMetaDescription" class="block text-sm font-medium mb-2"
                  >{t('page.metaDescription')}</label
                >
                <textarea
                  id="translationMetaDescription"
                  bind:value={translationFormData.metaDescription}
                  rows="2"
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                  placeholder={pageData.metaDescription || ''}
                ></textarea>
              </div>
            </div>
            {#if formData.config.buttonText || formData.config.description || formData.config.badge || formData.config.eyebrow || formData.config.sideTitle}
              <div class="border-t pt-4">
                <h5 class="text-sm font-medium mb-3">{t('page.configFields')}</h5>
                <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                  {#if formData.config.buttonText !== undefined}
                    <div>
                      <label for="translationButtonText" class="block text-sm font-medium mb-2"
                        >{t('page.buttonText')}</label
                      >
                      <input
                        id="translationButtonText"
                        type="text"
                        bind:value={translationFormData.config.buttonText}
                        class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                        placeholder={formData.config.buttonText || ''}
                      />
                    </div>
                  {/if}
                  {#if formData.config.description !== undefined}
                    <div>
                      <label for="translationDescription" class="block text-sm font-medium mb-2"
                        >{t('common.description')}</label
                      >
                      <textarea
                        id="translationDescription"
                        bind:value={translationFormData.config.description}
                        rows="3"
                        class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                        placeholder={formData.config.description || ''}
                      ></textarea>
                    </div>
                  {/if}
                  {#if formData.config.badge !== undefined}
                    <div>
                      <label for="translationBadge" class="block text-sm font-medium mb-2"
                        >Badge</label
                      >
                      <input
                        id="translationBadge"
                        type="text"
                        bind:value={translationFormData.config.badge}
                        class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                        placeholder={formData.config.badge || ''}
                      />
                    </div>
                  {/if}
                  {#if formData.config.eyebrow !== undefined}
                    <div>
                      <label for="translationEyebrow" class="block text-sm font-medium mb-2"
                        >Eyebrow</label
                      >
                      <input
                        id="translationEyebrow"
                        type="text"
                        bind:value={translationFormData.config.eyebrow}
                        class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                        placeholder={formData.config.eyebrow || ''}
                      />
                    </div>
                  {/if}
                  {#if formData.config.sideTitle !== undefined}
                    <div class="md:col-span-2">
                      <label for="translationSideTitle" class="block text-sm font-medium mb-2"
                        >Left Panel Title</label
                      >
                      <textarea
                        id="translationSideTitle"
                        bind:value={translationFormData.config.sideTitle}
                        rows="3"
                        class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                        placeholder={formData.config.sideTitle || ''}
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
                      content: '',
                      metaTitle: '',
                      metaDescription: '',
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
          <h4 class="text-lg font-medium mb-4">{t('page.existingTranslations')}</h4>
          {#if translations.length === 0}
            <p class="text-accent-muted">{t('page.noTranslations')}</p>
          {:else}
            <div class="space-y-2">
              {#each translations as translation}
                <div class="flex items-center justify-between p-4 bg-white border border-gray-300">
                  <div>
                    <p class="font-medium">
                      {languages.find((l) => l.code === translation.languageCode)?.name ||
                        translation.languageCode}
                    </p>
                    {#if translation.title}
                      <p class="text-sm text-accent-muted">
                        {t('page.pageTitle')}: {translation.title}
                      </p>
                    {/if}
                    {#if translation.metaTitle}
                      <p class="text-sm text-accent-muted">
                        {t('page.metaTitle')}: {translation.metaTitle}
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
                      on:click={() => deleteTranslation(translation.languageCode)}
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
    {/if}
  {/if}
</div>
