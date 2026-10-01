<script lang="ts">
  import { onMount, onDestroy } from 'svelte';
  import { browser } from '$app/environment';
  import { i18nStore } from '$lib/stores/i18n.store';
  import { currencyStore } from '$lib/stores/currency.store';
  import { countryApi, type Country } from '$lib/api/country.api';
  import { languageApi, type Language } from '$lib/api/language.api';
  import { t } from '$lib/utils/i18n';
  import {
    applyCountrySelection,
    applyLanguageSelection,
    initLocaleFromBrowser,
    resolveCountryForLanguage,
    selectedCountryStore,
    setLocalePreferenceMode,
  } from '$lib/utils/locale-preferences';

  let isOpen = false;
  let activeTab: 'language' | 'region' = 'language';
  let languages: Language[] = [];
  let countries: Country[] = [];
  let loading = false;
  let currentLanguage = $i18nStore;
  let currentCurrency = $currencyStore;
  let selectedCountryCode = '';

  $: currentLanguage = $i18nStore;
  $: currentCurrency = $currencyStore;
  $: if ($selectedCountryStore) {
    selectedCountryCode = $selectedCountryStore;
  }

  // Wait for browser/admin locale init, then sync header label.
  onMount(async () => {
    await initLocaleFromBrowser();
    await loadData();
    await syncSelectedCountryFromStore();
  });

  // Cleanup: restore body scroll on destroy
  onDestroy(() => {
    if (browser) {
      document.body.style.overflow = '';
    }
  });

  async function loadData() {
    loading = true;
    try {
      const [langResponse, countryResponse] = await Promise.all([
        languageApi.getAll(true),
        countryApi.getAll(true),
      ]);
      const activeCodes = (langResponse.languages ?? []).map((l) => l.code.toLowerCase());
      i18nStore.setAllowedLanguages(activeCodes);
      languages = langResponse.languages.sort((a, b) => a.sortOrder - b.sortOrder);
      countries = countryResponse.countries.sort((a, b) => a.sortOrder - b.sortOrder);
    } catch (error) {
      console.error('Failed to load languages/countries:', error);
    } finally {
      loading = false;
    }
  }

  async function syncSelectedCountryFromStore() {
    try {
      if (!browser) return;

      const code = $selectedCountryStore || localStorage.getItem('selectedCountryCode') || '';
      const matched =
        code && countries.length > 0 ? countries.find((c) => c.code === code) || null : null;

      if (matched) {
        selectedCountryCode = matched.code;
        selectedCountryStore.set(matched.code);
        currentCurrency = matched.currency;
        return;
      }

      const resolved = resolveCountryForLanguage(
        currentLanguage,
        countries,
        navigator.language || navigator.languages?.[0]
      );
      if (resolved) {
        selectedCountryCode = resolved.code;
        selectedCountryStore.set(resolved.code);
        currentCurrency = resolved.currency;
      } else {
        selectedCountryCode = '';
      }
    } catch (error) {
      console.error('Failed to sync selected country:', error);
    }
  }

  async function openModal() {
    isOpen = true;
    // Reset to language tab when opening
    activeTab = 'language';
    // Reload data when opening modal to ensure fresh data
    await loadData();
    // Prevent body scroll when modal is open
    if (browser) {
      document.body.style.overflow = 'hidden';
    }
  }

  function closeModal() {
    isOpen = false;
    // Restore body scroll when modal is closed
    if (browser) {
      document.body.style.overflow = '';
    }
  }

  async function selectLanguage(language: Language) {
    const code = language.code.toLowerCase();
    const changed = await applyLanguageSelection(
      code,
      countries,
      browser ? navigator.language : undefined
    );
    if (!changed) {
      closeModal();
      return;
    }
    currentLanguage = code;
    const matchedCountry = resolveCountryForLanguage(
      code,
      countries,
      browser ? navigator.language : undefined
    );
    if (matchedCountry) {
      selectedCountryCode = matchedCountry.code;
      currentCurrency = matchedCountry.currency;
    }
    closeModal();
    if (browser) {
      window.location.reload();
    }
  }

  async function selectCountry(country: Country) {
    selectedCountryCode = country.code;
    setLocalePreferenceMode('region');
    await applyCountrySelection(country);
    currentCurrency = country.currency;
    closeModal();
  }

  function handleKeydown(event: KeyboardEvent) {
    if (event.key === 'Escape' && isOpen) {
      closeModal();
    }
  }

  // Get display text for button (no hardcoded US — empty until locale init resolves)
  $: displayText = selectedCountryCode || countries.find((c) => c.isDefault)?.code || '';

  // Get current language display name
  $: currentLanguageName =
    languages.find((l) => l.code === currentLanguage)?.nameNative ||
    languages.find((l) => l.code === currentLanguage)?.name ||
    'English';
</script>

<svelte:window on:keydown={handleKeydown} />

<!-- Button -->
<button
  class="hidden md:flex items-center gap-1 text-sm text-gray-600 hover:text-black transition-colors"
  aria-label="Select location"
  on:click={openModal}
>
  <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M17.657 16.657L13.414 20.9a1.998 1.998 0 01-2.827 0l-4.244-4.243a8 8 0 1111.314 0z"
    />
    <path
      stroke-linecap="round"
      stroke-linejoin="round"
      stroke-width="2"
      d="M15 11a3 3 0 11-6 0 3 3 0 016 0z"
    />
  </svg>
  <span class="hidden lg:inline">{displayText}</span>
</button>

<!-- Modal Overlay - full screen coverage -->
{#if isOpen}
  <div
    class="fixed inset-0 bg-black/50 z-[9999] flex items-center justify-center p-4 backdrop-blur-sm"
    style="position: fixed; top: 0; left: 0; right: 0; bottom: 0; width: 100vw; height: 100vh;"
  >
    <button
      type="button"
      class="absolute inset-0 h-full w-full cursor-default bg-transparent"
      aria-hidden="true"
      tabindex="-1"
      on:click={closeModal}
    ></button>
    <!-- Modal Content -->
    <div
      class="relative z-10 bg-white shadow-xl w-full max-w-md max-h-[80vh] flex flex-col"
      role="dialog"
      aria-modal="true"
      aria-labelledby="modal-title"
    >
      <!-- Header with Tabs -->
      <div class="relative border-b border-gray-200">
        <div class="flex items-center">
          <button
            class="px-6 py-4 text-sm font-medium transition-colors relative {activeTab ===
            'language'
              ? 'text-black'
              : 'text-gray-600 hover:text-black'}"
            on:click={() => (activeTab = 'language')}
          >
            {t('language.tab')}
            {#if activeTab === 'language'}
              <span class="absolute bottom-0 left-0 right-0 h-0.5 bg-black"></span>
            {/if}
          </button>
          <button
            class="px-6 py-4 text-sm font-medium transition-colors relative {activeTab === 'region'
              ? 'text-black'
              : 'text-gray-600 hover:text-black'}"
            on:click={() => (activeTab = 'region')}
          >
            {t('region.tab')}
            {#if activeTab === 'region'}
              <span class="absolute bottom-0 left-0 right-0 h-0.5 bg-black"></span>
            {/if}
          </button>
        </div>
        <!-- Close Button -->
        <button
          on:click={closeModal}
          class="absolute top-4 right-4 w-8 h-8 flex items-center justify-center text-black hover:transition-colors"
          aria-label="Close"
        >
          <svg class="w-4 h-4" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Content -->
      <div class="flex-1 overflow-y-auto">
        {#if loading}
          <div class="text-center py-8 text-gray-500">{t('common.loading')}</div>
        {:else if activeTab === 'language'}
          <div class="p-6">
            <p class="text-sm text-gray-600 mb-6">
              {t('language.choose')}
            </p>
            {#if languages.length === 0}
              <div class="text-center py-8 text-gray-500">
                {t('language.noAvailable')}
              </div>
            {:else}
              <div class="space-y-0">
                {#each languages as language, index (language.id)}
                  <button
                    type="button"
                    class="w-full text-left px-0 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors {index <
                    languages.length - 1
                      ? 'border-b border-gray-200'
                      : ''}"
                    on:click={() => selectLanguage(language)}
                  >
                    <div class="flex flex-col">
                      <span class="font-semibold text-black text-base">
                        {language.nameNative || language.name}
                      </span>
                      {#if language.nameNative && language.nameNative !== language.name}
                        <span class="text-sm text-gray-500 mt-0.5">
                          ({language.name})
                        </span>
                      {/if}
                    </div>
                    {#if language.code === currentLanguage}
                      <svg
                        class="w-5 h-5 text-black flex-shrink-0 ml-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {:else if activeTab === 'region'}
          <div class="p-6">
            <p class="text-sm text-gray-600 mb-6">
              {t('region.choose')}
            </p>
            {#if countries.length === 0}
              <div class="text-center py-8 text-gray-500">
                {t('region.noAvailable')}
              </div>
            {:else}
              <div class="space-y-0">
                {#each countries as country, index (country.id)}
                  <button
                    type="button"
                    class="w-full text-left px-0 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors {index <
                    countries.length - 1
                      ? 'border-b border-gray-200'
                      : ''}"
                    on:click={() => selectCountry(country)}
                  >
                    <div class="flex flex-col">
                      <span class="font-semibold text-black text-base">
                        {country.nameNative || country.name}
                      </span>
                      <div class="flex items-center gap-2 mt-0.5">
                        {#if country.nameNative && country.nameNative !== country.name}
                          <span class="text-sm text-gray-500">
                            ({country.name})
                          </span>
                        {/if}
                        {#if country.currency}
                          <span class="text-sm text-gray-600 font-medium">
                            • {country.currency}
                          </span>
                        {/if}
                      </div>
                    </div>
                    {#if country.code === selectedCountryCode}
                      <svg
                        class="w-5 h-5 text-black flex-shrink-0 ml-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          stroke-linecap="round"
                          stroke-linejoin="round"
                          stroke-width="2"
                          d="M5 13l4 4L19 7"
                        />
                      </svg>
                    {/if}
                  </button>
                {/each}
              </div>
            {/if}
          </div>
        {/if}
      </div>
    </div>
  </div>
{/if}

<style>
  /* Custom scrollbar for modal content */
  :global(.overflow-y-auto) {
    scrollbar-width: thin;
    scrollbar-color: rgba(0, 0, 0, 0.2) transparent;
  }

  :global(.overflow-y-auto::-webkit-scrollbar) {
    width: 6px;
  }

  :global(.overflow-y-auto::-webkit-scrollbar-track) {
    background: transparent;
  }

  :global(.overflow-y-auto::-webkit-scrollbar-thumb) {
    background-color: rgba(0, 0, 0, 0.2);
    border-radius: 3px;
  }
</style>
