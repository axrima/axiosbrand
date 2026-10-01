<script lang="ts">
  import { authStore } from '$lib/stores/auth.store';
  import { cartStore } from '$lib/stores/cart.store';
  import { cartDrawerStore } from '$lib/stores/cart-drawer.store';
  import { settingsStore } from '$lib/stores/settings.store';
  import { headerStore } from '$lib/stores/header.store';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { browser } from '$app/environment';
  import { onMount, onDestroy } from 'svelte';
  import { slide } from 'svelte/transition';
  import { cubicOut } from 'svelte/easing';
  import { categoryApi, type Category } from '$lib/api/category.api';
  import { brandApi, type Brand } from '$lib/api/brand.api';
  import { productApi, type Product } from '$lib/api/product.api';
  import { languageApi, type Language } from '$lib/api/language.api';
  import { countryApi, type Country } from '$lib/api/country.api';
  import { currencyStore } from '$lib/stores/currency.store';
  import { formatPrice } from '$lib/utils/price.utils';
  import { getProductImageAlt } from '$lib/utils/image.utils';
  import BlurredImage from '$lib/components/BlurredImage.svelte';
  import LoadingBar from '$lib/components/LoadingBar.svelte';
  import LanguageRegionSelector from '$lib/components/LanguageRegionSelector.svelte';
  import { t } from '$lib/utils/i18n';
  import { i18nBundleVersion, i18nStore } from '$lib/stores/i18n.store';
  import {
    applyCountrySelection,
    applyLanguageSelection,
    selectedCountryStore,
    setLocalePreferenceMode,
  } from '$lib/utils/locale-preferences';

  // Reactive subscriptions to auth store
  $: user = $authStore.user;
  $: isAuthenticated = $authStore.isAuthenticated;

  // Reactive subscription to language store
  $: currentLanguage = $i18nStore;
  $: i18nVersion = $i18nBundleVersion;
  let previousLanguage: string | undefined = undefined;

  // Lookbook page settings for translations
  let lookbookPageSettings: {
    title: string;
    titleTranslations: Record<string, string>;
  } | null = null;

  // Get translated lookbook title
  $: lookbookTitle = (() => {
    if (!lookbookPageSettings) return 'Lookbook';
    if (currentLanguage && lookbookPageSettings.titleTranslations?.[currentLanguage]) {
      return lookbookPageSettings.titleTranslations[currentLanguage];
    }
    return lookbookPageSettings.title || 'Lookbook';
  })();

  function loadLookbookPageSettings() {
    if (typeof window === 'undefined') return;
    try {
      const savedSettings = localStorage.getItem('lookbookPageSettings');
      if (savedSettings) {
        const parsed = JSON.parse(savedSettings);
        lookbookPageSettings = {
          title: parsed.title || 'Lookbook',
          titleTranslations: parsed.titleTranslations || {},
        };
      } else {
        lookbookPageSettings = {
          title: 'Lookbook',
          titleTranslations: {},
        };
      }
    } catch (e) {
      console.error('Failed to load lookbook page settings:', e);
      lookbookPageSettings = {
        title: 'Lookbook',
        titleTranslations: {},
      };
    }
  }

  let mobileMenuOpen = false;
  let sidebarOpen = false;
  /** Mobile sidebar: 'menu' = main nav, 'language' = language, 'region' = region/currency */
  let sidebarView: 'menu' | 'language' | 'region' = 'menu';
  let mobileLanguages: Language[] = [];
  let mobileLanguagesLoading = false;
  let mobileCountries: Country[] = [];
  let mobileCountriesLoading = false;
  let searchOpen = false;
  let searchQuery = '';
  let activeCategory = 'menswear'; // Default to menswear
  let categories: Category[] = [];
  let topLevelCategories: Category[] = []; // Main categories (isMain = true)
  let subCategories: Category[] = []; // Level 2: First-level subcategories of active main category
  let allSubCategories: Category[] = []; // ALL subcategories (all levels) of active main category
  let activeMainCategory: Category | null = null; // Currently active main category
  let hoveredCategoryId: string | null = null; // For Apple-style dropdown menu

  // Search suggestions
  let searchSuggestions: {
    categories: Category[];
    brands: Brand[];
    products: Product[];
  } = {
    categories: [],
    brands: [],
    products: [],
  };
  let showSuggestions = false;
  let searchInputElement: HTMLInputElement;
  let suggestionsElement: HTMLDivElement;
  let searchTimeout: ReturnType<typeof setTimeout> | null = null;
  let brands: Brand[] = [];
  let loadingSuggestions = false;
  let featuredProducts: Product[] = []; // Popular/featured products to show when search is empty

  // Search overlay: compact layout (smaller cards, more columns) so more products fit in dropdown
  const SEARCH_CARD_ASPECT = '3/4';
  $: searchCardAspectStyle = `aspect-ratio: ${SEARCH_CARD_ASPECT};`;
  // Denser grid for search: more columns on large screens, smaller gaps
  const searchGridColsClassMap: Record<string, string> = {
    '2': 'grid-cols-2 sm:grid-cols-3',
    '3': 'grid-cols-2 sm:grid-cols-3 lg:grid-cols-4',
    '4': 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
    '5': 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6',
    '6': 'grid-cols-3 sm:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6 2xl:grid-cols-6',
  };
  const searchGridGapClassMap: Record<string, string> = {
    '2': 'gap-2',
    '4': 'gap-3',
    '6': 'gap-4',
    '8': 'gap-4',
  };
  $: searchGridColumns = $settingsStore.shopGridColumns ?? '4';
  $: searchGridGap = $settingsStore.shopGridGap ?? '6';
  $: searchProductsGridClass = `grid ${searchGridColsClassMap[searchGridColumns] || searchGridColsClassMap['4']} ${searchGridGapClassMap[searchGridGap] || 'gap-4'}`;

  // Get default navigation blocks if not configured
  function getDefaultNavigationBlocks() {
    return [
      {
        id: 'language',
        type: 'language' as const,
        enabled: true,
        order: 1,
        icon: undefined,
        link: undefined,
        label: undefined,
      },
      {
        id: 'search',
        type: 'search' as const,
        enabled: true,
        order: 2,
        icon: undefined,
        link: undefined,
        label: undefined,
      },
      {
        id: 'profile',
        type: 'profile' as const,
        enabled: true,
        order: 3,
        icon: undefined,
        link: '/account/profile',
        label: undefined,
      },
      {
        id: 'wishlist',
        type: 'wishlist' as const,
        enabled: true,
        order: 4,
        icon: undefined,
        link: '/account/wishlist',
        label: undefined,
      },
      {
        id: 'cart',
        type: 'cart' as const,
        enabled: true,
        order: 5,
        icon: undefined,
        link: '/cart',
        label: undefined,
      },
    ];
  }

  // Helper functions to safely access block properties
  function getBlockLabel(block: any): string | undefined {
    return block?.label;
  }

  function getBlockIcon(block: any): string | undefined {
    return block?.icon;
  }

  function getBlockLink(block: any): string | undefined {
    return block?.link;
  }

  function hexToRgb(hex: string | undefined): [number, number, number] | null {
    if (!hex) return null;

    let normalized = hex.trim();
    if (normalized.startsWith('#')) {
      normalized = normalized.slice(1);
    }

    if (normalized.length === 3) {
      normalized = normalized
        .split('')
        .map((char) => char + char)
        .join('');
    }

    if (!/^[0-9a-fA-F]{6}$/.test(normalized)) {
      return null;
    }

    return [
      parseInt(normalized.slice(0, 2), 16),
      parseInt(normalized.slice(2, 4), 16),
      parseInt(normalized.slice(4, 6), 16),
    ];
  }

  function rgbaColor(hex: string | undefined, opacityPercent: number | undefined): string {
    const rgb = hexToRgb(hex);
    const alpha = Math.max(0, Math.min(100, opacityPercent ?? 100)) / 100;
    if (!rgb) return `rgba(255, 255, 255, ${alpha})`;
    return `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, ${alpha})`;
  }

  function blurStyle(blurPx: number | undefined): string {
    const blur = Math.max(0, blurPx ?? 0);
    if (blur === 0) return '';
    return `backdrop-filter: blur(${blur}px) saturate(180%); -webkit-backdrop-filter: blur(${blur}px) saturate(180%);`;
  }

  $: headerBgColor = rgbaColor(
    $headerStore.settings?.backgroundColor || '#ffffff',
    $headerStore.settings?.backgroundOpacity ?? 92
  );
  $: headerGlassStyle = `${blurStyle($headerStore.settings?.backdropBlur)} background-color: ${headerBgColor}; border-color: ${$headerStore.settings?.borderColor || '#e5e7eb'}; ${$headerStore.settings?.shadowEnabled !== false ? 'box-shadow: 0 1px 2px 0 rgba(0, 0, 0, 0.05);' : ''}`;
  $: dropdownGlassStyle = `${blurStyle($headerStore.settings?.dropdownBackdropBlur ?? $headerStore.settings?.backdropBlur)} background-color: ${rgbaColor($headerStore.settings?.backgroundColor || '#ffffff', $headerStore.settings?.dropdownBackgroundOpacity ?? 96)}; border-color: ${$headerStore.settings?.borderColor || '#e5e7eb'};`;

  onMount(async () => {
    loadLookbookPageSettings();
    await cartStore.load();
    await loadCategories();
    await loadBrands();
    await settingsStore.load();
    await headerStore.load();

    // Determine active category from current path or URL
    // This will be handled by the reactive block, but we set it here for initial load
    if ($page.url.pathname === '/shop') {
      const params = $page.url.searchParams;
      const categoryParam = params.get('category');

      if (categoryParam && categories.length > 0) {
        // More flexible search: check slug (case-insensitive), id, and name (case-insensitive)
        const categoryParamLower = categoryParam.toLowerCase();
        const category = categories.find((c) => {
          const slugMatch = c.slug?.toLowerCase() === categoryParamLower;
          const idMatch = c.id === categoryParam;
          const nameMatch = c.name.toLowerCase() === categoryParamLower;
          return slugMatch || idMatch || nameMatch;
        });

        if (category) {
          if (category.isMain || !category.parentId) {
            // It's a main category
            activeCategory = category.slug;
            activeMainCategory = category;
            updateSubCategories(category.id);
          } else {
            // It's a subcategory, find its main parent
            activeMainCategory = findMainCategory(category);
            if (activeMainCategory) {
              activeCategory = activeMainCategory.slug;
              updateSubCategories(activeMainCategory.id);
            }
          }
        }
      } else if (topLevelCategories.length > 0 && !activeMainCategory) {
        // If no category selected, set first main category as default
        activeMainCategory = topLevelCategories[0];
        updateSubCategories(activeMainCategory.id);
      }
    }
  });

  async function loadBrands() {
    try {
      const response = await brandApi.getAll();
      brands = response.brands;
    } catch (e) {
      console.error('Failed to load brands:', e);
    }
  }

  async function loadFeaturedProducts() {
    try {
      const response = await productApi.getAll(1, 12, { isActive: true, isFeatured: true });
      featuredProducts = response.products;
      console.log('Loaded featured products:', featuredProducts.length, featuredProducts);
    } catch (e) {
      console.error('Failed to load featured products:', e);
      featuredProducts = [];
    }
  }

  async function searchProducts(query: string): Promise<Product[]> {
    if (!query.trim()) {
      return [];
    }

    loadingSuggestions = true;
    try {
      const response = await productApi.getAll(1, 20, {
        isActive: true,
        search: query.trim(),
      });
      console.log('Search products response:', response.products.length, response.products);
      return response.products;
    } catch (e) {
      console.error('Failed to search products:', e);
      return [];
    } finally {
      loadingSuggestions = false;
    }
  }

  // Group products by category
  function getProductsByCategory(products: Product[]): Map<string, Product[]> {
    const grouped = new Map<string, Product[]>();

    products.forEach((product) => {
      // Use category object if available, otherwise use categoryId
      const categoryId = product.category?.id || product.categoryId;
      if (categoryId && !grouped.has(categoryId)) {
        grouped.set(categoryId, []);
      }
      if (categoryId) {
        grouped.get(categoryId)!.push(product);
      }
    });

    return grouped;
  }

  async function loadCategories() {
    try {
      // Load all categories (flat view) with current language
      const response = await categoryApi.getAll(false, true, false, currentLanguage);
      categories = response.categories;

      // Filter out Lookbook category (by slug or name)
      const shopCategories = categories.filter((c) => {
        const slugLower = c.slug?.toLowerCase() || '';
        const nameLower = c.name?.toLowerCase() || '';
        return slugLower !== 'lookbook' && nameLower !== 'lookbook';
      });

      // Main categories are those with isMain = true
      // If isMain field doesn't exist yet (migration not run), fallback to parentId = null
      topLevelCategories = shopCategories.filter((c) => {
        // Check if isMain field exists and is true
        if (c.isMain === true) {
          return true;
        }
        // If isMain is explicitly false, it's not a main category
        if (c.isMain === false) {
          return false;
        }
        // Fallback: if isMain doesn't exist (undefined), use parentId = null as indicator
        return !c.parentId;
      });

      // Subcategories are those with a parentId (and not main categories)
      subCategories = shopCategories.filter((c) => {
        // If isMain is true, it's not a subcategory
        if (c.isMain === true) {
          return false;
        }
        // Subcategory must have a parentId
        return !!c.parentId;
      });

      // Sort main categories by name
      topLevelCategories.sort((a, b) => {
        // Sort by isMain first (main categories first), then by name
        if (a.isMain === true && b.isMain !== true) return -1;
        if (a.isMain !== true && b.isMain === true) return 1;
        return a.name.localeCompare(b.name);
      });

      // Sort subcategories by name
      subCategories.sort((a, b) => a.name.localeCompare(b.name));

      // Update subcategories based on active main category
      if (activeMainCategory) {
        updateSubCategories(activeMainCategory.id);
      } else if (topLevelCategories.length > 0) {
        // Set default active main category (first one) so second navigation row is always visible
        activeMainCategory = topLevelCategories[0];
        updateSubCategories(activeMainCategory.id);
      }

      console.log('Loaded categories:', {
        total: categories.length,
        shopCategories: shopCategories.length,
        mainCategories: topLevelCategories.length,
        subCategories: subCategories.length,
        mainCategoryNames: topLevelCategories.map((c) => c.name),
        activeMainCategory: activeMainCategory?.name,
      });
    } catch (e) {
      console.error('Failed to load categories:', e);
    }
  }

  function handleLogout() {
    authStore.logout();
    goto('/');
    mobileMenuOpen = false;
    sidebarOpen = false;
  }

  function toggleMobileMenu() {
    mobileMenuOpen = !mobileMenuOpen;
    sidebarOpen = false;
  }

  function toggleSidebar() {
    sidebarOpen = !sidebarOpen;
    mobileMenuOpen = false;
    if (sidebarOpen) {
      // Load languages so the selected language name is shown in the menu
      loadMobileLanguages();
      // Ensure activeMainCategory is set when opening sidebar
      if (!activeMainCategory && topLevelCategories.length > 0) {
        activeMainCategory = topLevelCategories[0];
        updateSubCategories(activeMainCategory.id);
      }
    }
  }

  function toggleSearch() {
    searchOpen = !searchOpen;
    if (searchOpen) {
      // Load featured products when opening search
      loadFeaturedProducts();
      showSuggestions = true; // Show suggestions immediately
    } else {
      searchQuery = '';
      showSuggestions = false;
      searchSuggestions = { categories: [], brands: [], products: [] };
    }
  }

  function handleSearchInput() {
    const query = searchQuery.trim().toLowerCase();

    if (query.length === 0) {
      showSuggestions = true; // Show featured products when empty
      searchSuggestions = { categories: [], brands: [], products: [] };
      return;
    }

    // Debounce search
    if (searchTimeout) {
      clearTimeout(searchTimeout);
    }

    searchTimeout = setTimeout(async () => {
      // Search categories and brands
      const filteredCategories = categories
        .filter(
          (c) => c.name.toLowerCase().includes(query) || c.slug?.toLowerCase().includes(query)
        )
        .slice(0, 5);

      const filteredBrands = brands
        .filter(
          (b) => b.name.toLowerCase().includes(query) || b.slug?.toLowerCase().includes(query)
        )
        .slice(0, 5);

      // Sort: main categories first, then others
      filteredCategories.sort((a, b) => {
        const aIsMain = a.isMain === true;
        const bIsMain = b.isMain === true;
        if (aIsMain && !bIsMain) return -1;
        if (!aIsMain && bIsMain) return 1;
        return a.name.localeCompare(b.name);
      });

      // Search products
      const foundProducts = await searchProducts(query);

      // Update search suggestions with all results
      searchSuggestions = {
        categories: filteredCategories,
        brands: filteredBrands,
        products: foundProducts,
      };

      showSuggestions =
        searchSuggestions.categories.length > 0 ||
        searchSuggestions.brands.length > 0 ||
        searchSuggestions.products.length > 0 ||
        featuredProducts.length > 0;
    }, 200);
  }

  function handleSuggestionClick(
    type: 'category' | 'brand' | 'product',
    item: Category | Brand | Product
  ) {
    if (type === 'category') {
      goto(`/shop?category=${(item as Category).slug}`);
    } else if (type === 'brand') {
      goto(`/shop?brand=${(item as Brand).slug}`);
    } else if (type === 'product') {
      goto(`/shop/product/${(item as Product).slug}`);
    }
    searchOpen = false;
    searchQuery = '';
    showSuggestions = false;
    searchSuggestions = { categories: [], brands: [], products: [] };
  }

  function handleClickOutsideSearch(node: HTMLElement) {
    const handleClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (
        node &&
        !node.contains(target) &&
        (!suggestionsElement || !suggestionsElement.contains(target))
      ) {
        showSuggestions = false;
      }
    };

    document.addEventListener('click', handleClick, true);

    return {
      destroy() {
        document.removeEventListener('click', handleClick, true);
      },
    };
  }

  function closeMobileMenu() {
    mobileMenuOpen = false;
  }

  function closeSidebar() {
    sidebarOpen = false;
    sidebarView = 'menu';
  }

  async function loadMobileLanguages() {
    mobileLanguagesLoading = true;
    try {
      const res = await languageApi.getAll(true);
      const codes = (res.languages ?? []).map((l) => l.code.toLowerCase());
      i18nStore.setAllowedLanguages(codes);
      mobileLanguages = (res.languages || []).sort((a, b) => a.sortOrder - b.sortOrder);
    } catch (e) {
      console.error('Failed to load languages for mobile:', e);
    } finally {
      mobileLanguagesLoading = false;
    }
  }

  function openSidebarLanguageView() {
    sidebarView = 'language';
    loadMobileLanguages();
  }

  function backToSidebarMenu() {
    sidebarView = 'menu';
  }

  async function selectMobileLanguage(lang: Language) {
    const changed = await applyLanguageSelection(
      lang.code.toLowerCase(),
      mobileCountries,
      browser ? navigator.language : undefined
    );
    if (!changed) {
      closeSidebar();
      return;
    }
    closeSidebar();
    if (browser) {
      window.location.reload();
    }
  }

  async function loadMobileCountries() {
    mobileCountriesLoading = true;
    try {
      const res = await countryApi.getAll(true);
      mobileCountries = (res.countries || []).sort((a, b) => a.sortOrder - b.sortOrder);
    } catch (e) {
      console.error('Failed to load countries for mobile:', e);
    } finally {
      mobileCountriesLoading = false;
    }
  }

  function openSidebarRegionView() {
    sidebarView = 'region';
    loadMobileCountries();
  }

  async function selectMobileCountry(country: Country) {
    setLocalePreferenceMode('region');
    await applyCountrySelection(country);
    backToSidebarMenu();
  }

  $: _currencyTrigger = $currencyStore;
  $: selectedCountryCodeMobile =
    _currencyTrigger &&
    (() => {
      if (!browser) return '';
      const fromStore = $selectedCountryStore;
      if (fromStore) return fromStore;
      const storedCountry = localStorage.getItem('selectedCountryCode');
      if (storedCountry) return storedCountry;
      const currency = ($currencyStore || '').trim().toUpperCase();
      const matchedCountry = currency
        ? mobileCountries.find((c) => (c.currency || '').trim().toUpperCase() === currency)
        : null;
      return matchedCountry?.code || mobileCountries.find((c) => c.isDefault)?.code || '';
    })();

  $: currentRegionDisplayMobile = (() => {
    const country = mobileCountries.find((c) => c.code === selectedCountryCodeMobile);
    if (country) {
      return `${country.nameNative || country.name} • ${country.currency}`;
    }
    return $currencyStore || 'USD';
  })();

  $: currentLanguageNameMobile =
    mobileLanguages.find((l) => l.code.toLowerCase() === currentLanguage)?.nameNative ||
    mobileLanguages.find((l) => l.code.toLowerCase() === currentLanguage)?.name ||
    (currentLanguage ? currentLanguage.toUpperCase() : t('language.tab'));

  function handleLinkClick() {
    closeMobileMenu();
    closeSidebar();
  }

  function handleSearch(e: Event) {
    e.preventDefault();
    if (searchQuery.trim()) {
      goto(`/shop?search=${encodeURIComponent(searchQuery.trim())}`);
      searchOpen = false;
      searchQuery = '';
    }
  }

  function findMainCategory(category: Category): Category | null {
    // Find the main category (isMain = true) in the category's parent chain
    let current: Category | undefined = category;
    while (current) {
      if (current.isMain) {
        return current;
      }
      // Find parent in categories array
      const parentCategoryId: string | undefined = current.parentId;
      if (parentCategoryId) {
        current = categories.find((c) => c.id === parentCategoryId);
      } else {
        break;
      }
    }
    return null;
  }

  function updateSubCategories(mainCategoryId: string) {
    if (!mainCategoryId) {
      subCategories = [];
      allSubCategories = [];
      return;
    }
    // Get ONLY first-level subcategories (direct children) of the main category
    // Like: Clothing, Shoes, Bags, Accessories (not T-Shirts, Jackets, etc.)
    subCategories = categories.filter((c) => c.parentId === mainCategoryId && !c.isMain);
    subCategories.sort((a, b) => a.name.localeCompare(b.name));

    // Get ALL subcategories (all levels) recursively for additional navigation row
    const getAllSubcategories = (parentId: string): Category[] => {
      const directChildren = categories.filter((c) => c.parentId === parentId && !c.isMain);

      const allChildren: Category[] = [...directChildren];

      // Recursively get children of children
      directChildren.forEach((child) => {
        const grandchildren = getAllSubcategories(child.id);
        allChildren.push(...grandchildren);
      });

      return allChildren;
    };

    allSubCategories = getAllSubcategories(mainCategoryId);
    allSubCategories.sort((a, b) => {
      // Sort by level first (shorter paths first), then by name
      const pathA = getCategoryPath(a);
      const pathB = getCategoryPath(b);
      const levelA = pathA.split(' > ').length;
      const levelB = pathB.split(' > ').length;
      if (levelA !== levelB) return levelA - levelB;
      return a.name.localeCompare(b.name);
    });
  }

  function getCategoryPath(category: Category): string {
    const path: string[] = [];
    let current: Category | undefined = category;
    while (current) {
      path.unshift(current.name);
      const parentCategoryId: string | undefined = current.parentId;
      if (parentCategoryId) {
        current = categories.find((c) => c.id === parentCategoryId);
      } else {
        break;
      }
    }
    return path.join(' > ');
  }

  function isCategoryActive(category: Category, activeParam: string | null): boolean {
    if (!activeParam) return false;

    // Direct match
    if (category.slug === activeParam || category.id === activeParam) {
      return true;
    }

    // Check if this category is in the path to active category
    const activeCat = categories.find((c) => c.slug === activeParam || c.id === activeParam);

    if (!activeCat) return false;

    // Check if this category is a parent of active category
    let current: Category | undefined = activeCat;
    while (current) {
      if (current.id === category.id) return true;
      const parentCategoryId: string | undefined = current.parentId;
      if (parentCategoryId) {
        current = categories.find((c) => c.id === parentCategoryId);
      } else {
        break;
      }
    }

    return false;
  }

  // Watch for URL changes to update active category
  // Only update navigation on /shop page
  $: if ($page.url.pathname === '/shop' && categories.length > 0 && topLevelCategories.length > 0) {
    const categoryParam = $page.url.searchParams.get('category');
    console.log('Nav: URL changed', {
      pathname: $page.url.pathname,
      categoryParam,
      categoriesCount: categories.length,
    });

    if (categoryParam) {
      // More flexible search: check slug (case-insensitive), id, and name (case-insensitive)
      const categoryParamLower = categoryParam.toLowerCase();
      const category = categories.find((c) => {
        const slugMatch = c.slug?.toLowerCase() === categoryParamLower;
        const idMatch = c.id === categoryParam;
        const nameMatch = c.name.toLowerCase() === categoryParamLower;
        return slugMatch || idMatch || nameMatch;
      });

      console.log('Nav: Category search', {
        categoryParam,
        categoryParamLower,
        found: !!category,
        categoryName: category?.name,
        isMain: category?.isMain,
      });

      if (category) {
        if (category.isMain || !category.parentId) {
          // It's a main category
          console.log('Nav: Setting main category', category.name);
          activeMainCategory = category;
          updateSubCategories(category.id);
        } else {
          // It's a subcategory, find its main parent
          const main = findMainCategory(category);
          if (main) {
            console.log('Nav: Found main category for subcategory', {
              subcategory: category.name,
              main: main.name,
            });
            activeMainCategory = main;
            updateSubCategories(main.id);
          }
        }
      } else {
        // Category not found, but we're on /shop, so show default
        console.log('Nav: Category not found, using default');
        if (!activeMainCategory) {
          activeMainCategory = topLevelCategories[0];
          updateSubCategories(activeMainCategory.id);
        }
      }
    } else {
      // No category param, set default main category
      console.log('Nav: No category param, using default');
      if (!activeMainCategory) {
        activeMainCategory = topLevelCategories[0];
        updateSubCategories(activeMainCategory.id);
      }
    }
  } else if ($page.url.pathname !== '/shop') {
    // Clear navigation when not on shop page
    activeMainCategory = null;
    subCategories = [];
    allSubCategories = [];
  }

  // Reload categories and lookbook settings when language changes (but not on initial mount)
  $: if (currentLanguage) {
    if (previousLanguage && previousLanguage !== currentLanguage) {
      loadCategories();
      loadLookbookPageSettings();
    }
    previousLanguage = currentLanguage;
  }

  // Periodically check for lookbook settings changes (for same-tab updates)
  let lookbookSettingsCheckInterval: ReturnType<typeof setInterval> | null = null;

  onMount(() => {
    if (typeof window !== 'undefined') {
      // Check every 2 seconds for changes
      lookbookSettingsCheckInterval = setInterval(() => {
        loadLookbookPageSettings();
      }, 2000);
    }
  });

  onDestroy(() => {
    if (lookbookSettingsCheckInterval) {
      clearInterval(lookbookSettingsCheckInterval);
    }
  });

  function handleSidebarKeydown(e: KeyboardEvent) {
    if (e.key !== 'Escape') return;
    if (sidebarOpen) {
      if (sidebarView === 'language') {
        backToSidebarMenu();
      } else {
        closeSidebar();
      }
    }
  }
</script>

<svelte:window on:keydown={handleSidebarKeydown} />

<nav
  class="sticky top-0 z-40 border-b"
  class:sticky={$headerStore.settings?.stickyEnabled !== false}
  style={headerGlassStyle}
>
  {#if $headerStore.settings?.isActive !== false}
    {@const headerSettings = $headerStore.settings}
    {@const logoPositionClass =
      headerSettings?.logoPosition === 'LEFT'
        ? 'left-0'
        : headerSettings?.logoPosition === 'RIGHT'
          ? 'right-0'
          : 'left-1/2 transform -translate-x-1/2'}
    {@const categoryPositionClass =
      headerSettings?.categoryLinksPosition === 'LEFT'
        ? 'justify-start'
        : headerSettings?.categoryLinksPosition === 'CENTER'
          ? 'justify-center'
          : 'justify-end'}
    {@const iconsPositionClass =
      headerSettings?.iconsPosition === 'LEFT'
        ? 'justify-start'
        : headerSettings?.iconsPosition === 'CENTER'
          ? 'justify-center'
          : 'justify-end'}
    {@const navigationBlocks =
      headerSettings?.navigationBlocks && headerSettings.navigationBlocks.length > 0
        ? headerSettings.navigationBlocks
        : getDefaultNavigationBlocks()}

    <!-- Top Navigation Bar - Categories, Logo, Icons -->
    <div style="border-color: {headerSettings?.borderColor || '#e5e7eb'}">
      <div class="container-custom relative" style="height: {headerSettings?.height || 'h-12'}">
        <!-- Desktop Navigation -->
        <div
          class="hidden lg:flex items-center justify-between"
          style="height: {headerSettings?.height || 'h-12'}"
        >
          <!-- Category Links -->
          {#if headerSettings?.categoryLinksEnabled !== false}
            <div
              class="flex items-center space-x-6 {categoryPositionClass} relative"
              role="presentation"
              on:mouseleave={() => {
                // Close menu only when leaving the entire categories area (including dropdown)
                setTimeout(() => {
                  hoveredCategoryId = null;
                }, 200);
              }}
            >
              {#if headerSettings?.headerMenuDropdown}
                <!-- Apple-style dropdown menu -->
                {#each topLevelCategories as category}
                  {@const categoryCondition = headerSettings?.categoryConditions?.find(
                    (c) => c.categoryId === category.id
                  )}
                  {#if !categoryCondition || categoryCondition.visible !== false}
                    {@const categorySubCategories = categories.filter(
                      (c) => c.parentId === category.id && !c.isMain
                    )}
                    {@const isHovered = hoveredCategoryId === category.id}
                    <div
                      class="relative"
                      role="presentation"
                      on:mouseenter={() => (hoveredCategoryId = category.id)}
                    >
                      <a
                        href="/shop?category={category.slug}"
                        class="{headerSettings?.categoryLinksFontSize ||
                          'text-sm'} {headerSettings?.categoryLinksFontWeight ||
                          'font-medium'} transition-all duration-200 px-3 py-1.5 rounded"
                        class:bg-white={hoveredCategoryId === category.id}
                        class:text-black={hoveredCategoryId === category.id}
                        style="color: {hoveredCategoryId === category.id
                          ? '#000000'
                          : $page.url.pathname.includes('/shop') &&
                              ($page.url.searchParams.get('category') === category.slug ||
                                $page.url.searchParams.get('category') === category.id)
                            ? headerSettings?.categoryLinksActiveColor || '#000000'
                            : headerSettings?.categoryLinksColor || '#4b5563'};"
                      >
                        {category.name}
                      </a>

                      <!-- Full-width dropdown menu -->
                      {#if isHovered}
                        {@const displayedCategory =
                          topLevelCategories.find((c) => c.id === hoveredCategoryId) || category}
                        {@const displayedSubCategories = categories.filter(
                          (c) => c.parentId === displayedCategory.id && !c.isMain
                        )}
                        <div
                          class="fixed left-0 right-0 text-black z-50 shadow-2xl apple-dropdown border-t"
                          style={`${dropdownGlassStyle} top: calc(${headerSettings?.height || '3rem'} + 1px);`}
                          role="presentation"
                          on:mouseenter={() => (hoveredCategoryId = category.id)}
                        >
                          <div class="container-custom py-12">
                            <div class="grid grid-cols-3 gap-12">
                              <!-- Column 1: Main Category Links -->
                              <div>
                                <h3
                                  class="text-xs font-normal text-gray-500 uppercase tracking-wide mb-6"
                                >
                                  {t('header.dropdown.shop')}
                                </h3>
                                <div class="space-y-4">
                                  <a
                                    href="/shop?category={displayedCategory.slug}"
                                    class="block text-xl font-medium text-black hover:text-gray-600 transition-colors"
                                  >
                                    {t('header.dropdown.shopTheLatest')}
                                  </a>
                                  {#if displayedSubCategories.length > 0}
                                    {#each displayedSubCategories.slice(0, 7) as subCat}
                                      <a
                                        href="/shop?category={subCat.slug}"
                                        class="block text-base text-gray-700 hover:text-black transition-all duration-200 hover:translate-x-1"
                                      >
                                        {subCat.name}
                                      </a>
                                    {/each}
                                  {:else}
                                    <a
                                      href="/shop?category={displayedCategory.slug}"
                                      class="block text-base text-gray-700 hover:text-black transition-colors"
                                    >
                                      {displayedCategory.name}
                                    </a>
                                  {/if}
                                </div>
                              </div>

                              <!-- Column 2: Quick Links -->
                              {#if headerSettings?.quickLinks && headerSettings.quickLinks.length > 0}
                                <div>
                                  <h3
                                    class="text-xs font-normal text-gray-500 uppercase tracking-wide mb-6"
                                  >
                                    {t('header.dropdown.quickLinks')}
                                  </h3>
                                  <div class="space-y-3">
                                    {#each headerSettings.quickLinks.filter((link) => link.visible !== false) as quickLink}
                                      <a
                                        href={quickLink.link}
                                        class="block text-sm text-gray-700 hover:text-black transition-all duration-200 hover:translate-x-1"
                                      >
                                        {quickLink.label}
                                      </a>
                                    {/each}
                                  </div>
                                </div>
                              {:else}
                                <!-- Default Quick Links if not configured -->
                                <div>
                                  <h3
                                    class="text-xs font-normal text-gray-500 uppercase tracking-wide mb-6"
                                  >
                                    {t('header.dropdown.quickLinks')}
                                  </h3>
                                  <div class="space-y-3">
                                    <a
                                      href="/account/profile"
                                      class="block text-sm text-gray-700 hover:text-black transition-all duration-200 hover:translate-x-1"
                                    >
                                      My Account
                                    </a>
                                    <a
                                      href="/account/orders"
                                      class="block text-sm text-gray-700 hover:text-black transition-all duration-200 hover:translate-x-1"
                                    >
                                      Orders
                                    </a>
                                    <a
                                      href="/account/orders"
                                      class="block text-sm text-gray-700 hover:text-black transition-all duration-200 hover:translate-x-1"
                                    >
                                      Shipping
                                    </a>
                                    <a
                                      href="/account/returns"
                                      class="block text-sm text-gray-700 hover:text-black transition-all duration-200 hover:translate-x-1"
                                    >
                                      Returns
                                    </a>
                                  </div>
                                </div>
                              {/if}

                              <!-- Column 3: All Categories -->
                              <div>
                                <h3
                                  class="text-xs font-normal text-gray-500 uppercase tracking-wide mb-6"
                                >
                                  {t('header.dropdown.categories')}
                                </h3>
                                <div class="space-y-3">
                                  {#each topLevelCategories as mainCat}
                                    {@const isActiveInDropdown = mainCat.id === category.id}
                                    {@const isHoveredInDropdown = hoveredCategoryId === mainCat.id}
                                    <a
                                      href="/shop?category={mainCat.slug}"
                                      class="block text-sm transition-all duration-200 {isActiveInDropdown ||
                                      isHoveredInDropdown
                                        ? 'text-black font-medium'
                                        : 'text-gray-700 hover:text-black'}"
                                      on:mouseenter={() => (hoveredCategoryId = mainCat.id)}
                                    >
                                      {mainCat.name}
                                    </a>
                                  {/each}
                                </div>
                              </div>
                            </div>
                          </div>
                        </div>
                      {/if}
                    </div>
                  {/if}
                {/each}
              {:else}
                <!-- Standard category links -->
                {#each topLevelCategories as category}
                  {@const categoryCondition = headerSettings?.categoryConditions?.find(
                    (c) => c.categoryId === category.id
                  )}
                  {#if !categoryCondition || categoryCondition.visible !== false}
                    <a
                      href="/shop?category={category.slug}"
                      class="{headerSettings?.categoryLinksFontSize ||
                        'text-sm'} {headerSettings?.categoryLinksFontWeight ||
                        'font-medium'} transition-colors"
                      style="color: {$page.url.pathname.includes('/shop') &&
                      ($page.url.searchParams.get('category') === category.slug ||
                        $page.url.searchParams.get('category') === category.id)
                        ? headerSettings?.categoryLinksActiveColor || '#000000'
                        : headerSettings?.categoryLinksColor || '#4b5563'};"
                      on:mouseenter={(e) =>
                        (e.currentTarget.style.color =
                          headerSettings?.categoryLinksHoverColor || '#000000')}
                      on:mouseleave={(e) =>
                        (e.currentTarget.style.color =
                          $page.url.pathname.includes('/shop') &&
                          ($page.url.searchParams.get('category') === category.slug ||
                            $page.url.searchParams.get('category') === category.id)
                            ? headerSettings?.categoryLinksActiveColor || '#000000'
                            : headerSettings?.categoryLinksColor || '#4b5563')}
                    >
                      {category.name}
                    </a>
                  {/if}
                {/each}
              {/if}

              {#if $settingsStore.lookbookEnabled}
                <a
                  href="/lookbook"
                  class="{headerSettings?.categoryLinksFontSize ||
                    'text-sm'} {headerSettings?.categoryLinksFontWeight ||
                    'font-medium'} transition-colors"
                  style="color: {$page.url.pathname === '/lookbook'
                    ? headerSettings?.categoryLinksActiveColor || '#000000'
                    : headerSettings?.categoryLinksColor || '#4b5563'};"
                  on:mouseenter={(e) =>
                    (e.currentTarget.style.color =
                      headerSettings?.categoryLinksHoverColor || '#000000')}
                  on:mouseleave={(e) =>
                    (e.currentTarget.style.color =
                      $page.url.pathname === '/lookbook'
                        ? headerSettings?.categoryLinksActiveColor || '#000000'
                        : headerSettings?.categoryLinksColor || '#4b5563')}
                >
                  {lookbookTitle}
                </a>
              {/if}
            </div>
          {/if}

          <!-- Logo -->
          <div class="absolute {logoPositionClass} mt-2">
            <a
              href={headerSettings?.logoLink || '/'}
              class="{headerSettings?.logoSize || 'text-2xl'} font-bold tracking-tight"
              style="color: {headerSettings?.logoColor || '#000000'}"
            >
              {#if headerSettings?.logoType === 'IMAGE' && headerSettings?.logoImageUrl}
                <img src={headerSettings.logoImageUrl} alt="Logo" class="h-8" />
              {:else if headerSettings?.logoType === 'SVG' && headerSettings?.logoSvg}
                <span
                  class="inline-flex items-center h-8 [&>svg]:h-8 [&>svg]:w-auto [&>svg]:max-w-[200px] [&>svg]:shrink-0"
                >
                  {@html headerSettings.logoSvg}
                </span>
              {:else}
                {headerSettings?.logoText || ''}
              {/if}
            </a>
          </div>

          <!-- Icons -->
          {#if headerSettings?.iconsEnabled !== false}
            <div class="flex items-center {iconsPositionClass} ml-auto">
              {#each navigationBlocks.sort((a, b) => (a.order || 0) - (b.order || 0)) as block}
                {#if block.enabled}
                  <!-- Language Selector -->
                  {#if block.type === 'language'}
                    <LanguageRegionSelector />
                  {/if}

                  <!-- Search Button -->
                  {#if block.type === 'search'}
                    <button
                      on:click={toggleSearch}
                      class="p-2 transition-colors flex items-center gap-1"
                      style="color: {headerSettings?.iconsColor || '#4b5563'};"
                      on:mouseenter={(e) =>
                        (e.currentTarget.style.color =
                          headerSettings?.iconsHoverColor || '#000000')}
                      on:mouseleave={(e) =>
                        (e.currentTarget.style.color = headerSettings?.iconsColor || '#4b5563')}
                      aria-label={getBlockLabel(block) || 'Search'}
                    >
                      {#if getBlockIcon(block)}
                        <span class={headerSettings?.iconsSize || 'w-5 h-5'}
                          >{@html getBlockIcon(block)}</span
                        >
                      {:else}
                        <svg
                          class={headerSettings?.iconsSize || 'w-5 h-5'}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                          />
                        </svg>
                      {/if}
                      {#if getBlockLabel(block)}
                        <span class="hidden lg:inline text-sm">{getBlockLabel(block)}</span>
                      {/if}
                    </button>
                  {/if}

                  <!-- Profile -->
                  {#if block.type === 'profile'}
                    {#if isAuthenticated}
                      <a
                        href={getBlockLink(block) || '/account/profile'}
                        class="p-2 transition-colors flex items-center gap-1"
                        style="color: {headerSettings?.iconsColor || '#4b5563'};"
                        on:mouseenter={(e) =>
                          (e.currentTarget.style.color =
                            headerSettings?.iconsHoverColor || '#000000')}
                        on:mouseleave={(e) =>
                          (e.currentTarget.style.color = headerSettings?.iconsColor || '#4b5563')}
                        aria-label={getBlockLabel(block) || 'Account'}
                      >
                        {#if getBlockIcon(block)}
                          <span class={headerSettings?.iconsSize || 'w-5 h-5'}
                            >{@html getBlockIcon(block)}</span
                          >
                        {:else}
                          <svg
                            class={headerSettings?.iconsSize || 'w-5 h-5'}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                            />
                          </svg>
                        {/if}
                        {#if getBlockLabel(block)}
                          <span class="hidden lg:inline text-sm">{getBlockLabel(block)}</span>
                        {/if}
                      </a>
                    {:else}
                      <a
                        href={getBlockLink(block) || '/login'}
                        class="p-2 transition-colors flex items-center gap-1"
                        style="color: {headerSettings?.iconsColor || '#4b5563'};"
                        on:mouseenter={(e) =>
                          (e.currentTarget.style.color =
                            headerSettings?.iconsHoverColor || '#000000')}
                        on:mouseleave={(e) =>
                          (e.currentTarget.style.color = headerSettings?.iconsColor || '#4b5563')}
                        aria-label={getBlockLabel(block) || 'Login'}
                      >
                        {#if getBlockIcon(block)}
                          <span class={headerSettings?.iconsSize || 'w-5 h-5'}
                            >{@html getBlockIcon(block)}</span
                          >
                        {:else}
                          <svg
                            class={headerSettings?.iconsSize || 'w-5 h-5'}
                            fill="none"
                            stroke="currentColor"
                            viewBox="0 0 24 24"
                          >
                            <path
                              stroke-linecap="round"
                              stroke-linejoin="round"
                              stroke-width="2"
                              d="M16 7a4 4 0 11-8 0 4 4 0 018 0zM12 14a7 7 0 00-7 7h14a7 7 0 00-7-7z"
                            />
                          </svg>
                        {/if}
                        {#if getBlockLabel(block)}
                          <span class="hidden lg:inline text-sm">{getBlockLabel(block)}</span>
                        {/if}
                      </a>
                    {/if}
                  {/if}

                  <!-- Wishlist -->
                  {#if block.type === 'wishlist' && $settingsStore.wishlistEnabled}
                    <a
                      href={getBlockLink(block) || '/account/wishlist'}
                      class="p-2 transition-colors relative flex items-center gap-1"
                      style="color: {headerSettings?.iconsColor || '#4b5563'};"
                      on:mouseenter={(e) =>
                        (e.currentTarget.style.color =
                          headerSettings?.iconsHoverColor || '#000000')}
                      on:mouseleave={(e) =>
                        (e.currentTarget.style.color = headerSettings?.iconsColor || '#4b5563')}
                      aria-label={getBlockLabel(block) || 'Wishlist'}
                    >
                      {#if getBlockIcon(block)}
                        <span class={headerSettings?.iconsSize || 'w-5 h-5'}
                          >{@html getBlockIcon(block)}</span
                        >
                      {:else}
                        <svg
                          class={headerSettings?.iconsSize || 'w-5 h-5'}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                          />
                        </svg>
                      {/if}
                      {#if getBlockLabel(block)}
                        <span class="hidden lg:inline text-sm">{getBlockLabel(block)}</span>
                      {/if}
                    </a>
                  {/if}

                  <!-- Cart -->
                  {#if block.type === 'cart'}
                    <a
                      href={getBlockLink(block) || '/cart'}
                      on:click|preventDefault={() => cartDrawerStore.open()}
                      class="p-2 transition-colors relative flex items-center gap-1 cursor-pointer"
                      style="color: {headerSettings?.iconsColor || '#4b5563'};"
                      on:mouseenter={(e) =>
                        (e.currentTarget.style.color =
                          headerSettings?.iconsHoverColor || '#000000')}
                      on:mouseleave={(e) =>
                        (e.currentTarget.style.color = headerSettings?.iconsColor || '#4b5563')}
                      aria-label={getBlockLabel(block) || 'Shopping bag'}
                    >
                      {#if getBlockIcon(block)}
                        <span class={headerSettings?.iconsSize || 'w-5 h-5'}
                          >{@html getBlockIcon(block)}</span
                        >
                      {:else}
                        <svg
                          class={headerSettings?.iconsSize || 'w-5 h-5'}
                          fill="none"
                          stroke="currentColor"
                          viewBox="0 0 24 24"
                        >
                          <path
                            stroke-linecap="round"
                            stroke-linejoin="round"
                            stroke-width="2"
                            d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                          />
                        </svg>
                      {/if}
                      {#if getBlockLabel(block)}
                        <span class="hidden lg:inline text-sm">{getBlockLabel(block)}</span>
                      {/if}
                      {#if $cartStore.items.length > 0}
                        <span
                          class="absolute top-0 right-0 bg-black text-white text-xs rounded-full w-5 h-5 flex items-center justify-center"
                        >
                          {$cartStore.items.reduce((sum, item) => sum + item.quantity, 0)}
                        </span>
                      {/if}
                    </a>
                  {/if}

                  <!-- Custom Block -->
                  {#if block.type === 'custom'}
                    <a
                      href={getBlockLink(block) || '#'}
                      class="p-2 transition-colors flex items-center gap-1"
                      style="color: {headerSettings?.iconsColor || '#4b5563'};"
                      on:mouseenter={(e) =>
                        (e.currentTarget.style.color =
                          headerSettings?.iconsHoverColor || '#000000')}
                      on:mouseleave={(e) =>
                        (e.currentTarget.style.color = headerSettings?.iconsColor || '#4b5563')}
                      aria-label={getBlockLabel(block) || 'Custom'}
                    >
                      {#if getBlockIcon(block)}
                        <span class={headerSettings?.iconsSize || 'w-5 h-5'}
                          >{@html getBlockIcon(block)}</span
                        >
                      {/if}
                      {#if getBlockLabel(block)}
                        <span class="hidden lg:inline text-sm">{getBlockLabel(block)}</span>
                      {/if}
                    </a>
                  {/if}
                {/if}
              {/each}

              <!-- Custom Icons (legacy support) -->
              {#if headerSettings?.customIcons}
                {#each headerSettings.customIcons as icon}
                  {#if icon.visible}
                    <a
                      href={icon.link}
                      class="p-2 transition-colors"
                      style="color: {headerSettings?.iconsColor || '#4b5563'};"
                      on:mouseenter={(e) =>
                        (e.currentTarget.style.color =
                          headerSettings?.iconsHoverColor || '#000000')}
                      on:mouseleave={(e) =>
                        (e.currentTarget.style.color = headerSettings?.iconsColor || '#4b5563')}
                      aria-label={icon.name}
                    >
                      {@html icon.svg}
                    </a>
                  {/if}
                {/each}
              {/if}
            </div>
          {/if}
        </div>

        <!-- Mobile Navigation - Farfetch Style -->
        <div class="lg:hidden relative flex items-center justify-between h-12 px-4">
          <!-- Left: Hamburger Menu and Search -->
          <div class="flex items-center gap-1 flex-1 min-w-0">
            <button
              on:click={toggleSidebar}
              class="p-2 text-gray-600 hover:text-black transition-colors"
              aria-label={t('menu.title')}
              aria-expanded={sidebarOpen}
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M4 6h16M4 12h16M4 18h16"
                />
              </svg>
            </button>

            <button
              on:click={toggleSearch}
              class="p-2 text-gray-600 hover:text-black transition-colors"
              aria-label="Search"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
                />
              </svg>
            </button>
          </div>

          <!-- Logo -->
          <div class="absolute {logoPositionClass} top-1/2 -translate-y-1/2 z-10">
            <a
              href={headerSettings?.logoLink || '/'}
              class="{headerSettings?.logoSize ||
                'text-xl'} font-bold tracking-tight whitespace-nowrap"
              style="color: {headerSettings?.logoColor || '#000000'}"
            >
              {#if headerSettings?.logoType === 'IMAGE' && headerSettings?.logoImageUrl}
                <img src={headerSettings.logoImageUrl} alt="Logo" class="h-6" />
              {:else if headerSettings?.logoType === 'SVG' && headerSettings?.logoSvg}
                <span
                  class="inline-flex items-center h-6 [&>svg]:h-6 [&>svg]:w-auto [&>svg]:max-w-[140px] [&>svg]:shrink-0"
                >
                  {@html headerSettings.logoSvg}
                </span>
              {:else}
                {headerSettings?.logoText || ''}
              {/if}
            </a>
          </div>

          <!-- Right: Wishlist and Cart -->
          <div class="flex items-center gap-1 flex-1 justify-end min-w-0">
            <!-- Wishlist -->
            {#if $settingsStore.wishlistEnabled}
              <a
                href="/account/wishlist"
                class="p-2 text-gray-600 hover:text-black transition-colors relative"
                aria-label="Wishlist"
              >
                <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                  <path
                    stroke-linecap="round"
                    stroke-linejoin="round"
                    stroke-width="2"
                    d="M4.318 6.318a4.5 4.5 0 000 6.364L12 20.364l7.682-7.682a4.5 4.5 0 00-6.364-6.364L12 7.636l-1.318-1.318a4.5 4.5 0 00-6.364 0z"
                  />
                </svg>
              </a>
            {/if}

            <!-- Cart -->
            <a
              href="/cart"
              on:click|preventDefault={() => cartDrawerStore.open()}
              class="p-2 text-gray-600 hover:text-black transition-colors relative cursor-pointer"
              aria-label="Shopping bag"
            >
              <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path
                  stroke-linecap="round"
                  stroke-linejoin="round"
                  stroke-width="2"
                  d="M16 11V7a4 4 0 00-8 0v4M5 9h14l1 12H4L5 9z"
                />
              </svg>
              {#if $cartStore.items.length > 0}
                <span
                  class="absolute top-0 right-0 bg-black text-white text-xs -full w-5 h-5 flex items-center justify-center"
                >
                  {$cartStore.items.reduce((sum, item) => sum + item.quantity, 0)}
                </span>
              {/if}
            </a>
          </div>
        </div>
      </div>
    </div>
  {/if}

  <!-- Search Bar -->
  {#if searchOpen}
    <div
      class="border-gray-200 bg-white relative"
      use:handleClickOutsideSearch
      transition:slide={{ duration: 300, axis: 'y', easing: cubicOut }}
    >
      <div class="container-custom py-3">
        <form on:submit={handleSearch} class="flex items-center gap-3 relative">
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z"
            />
          </svg>
          <input
            bind:this={searchInputElement}
            type="text"
            bind:value={searchQuery}
            on:input={handleSearchInput}
            placeholder={t('shop.whatAreYouLookingFor')}
            class="flex-1 outline-none text-sm text-black placeholder-gray-400"
            autocomplete="off"
          />
          <button
            type="button"
            on:click={() => {
              if (searchQuery) {
                // Clear search but keep suggestions open to show featured products
                searchQuery = '';
                searchSuggestions = { categories: [], brands: [], products: [] };
                showSuggestions = true;
                searchInputElement?.focus();
              } else {
                // Close search
                toggleSearch();
              }
            }}
            class="text-gray-400 hover:text-black"
            aria-label={searchQuery ? 'Clear search' : 'Close search'}
          >
            <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
              <path
                stroke-linecap="round"
                stroke-linejoin="round"
                stroke-width="2"
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </form>
      </div>

      <!-- Search Suggestions Dropdown -->
      {#if showSuggestions && (loadingSuggestions || searchSuggestions.categories.length > 0 || searchSuggestions.brands.length > 0 || searchSuggestions.products.length > 0 || (featuredProducts.length > 0 && !searchQuery.trim()))}
        <div
          bind:this={suggestionsElement}
          class="absolute left-0 right-0 top-full bg-white border-b border-gray-200 shadow-lg z-50 max-h-[600px] overflow-y-auto"
          transition:slide={{ duration: 300, axis: 'y', easing: cubicOut }}
        >
          <div class="container-custom py-4">
            <!-- Main Categories First -->
            {#if searchSuggestions.categories.filter((c) => c.isMain === true).length > 0}
              <div class="mb-4">
                <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-4">
                  {t('category.categories')}
                </h3>
                {#each searchSuggestions.categories.filter((c) => c.isMain === true) as category}
                  <button
                    type="button"
                    on:click={() => handleSuggestionClick('category', category)}
                    class="w-full text-left px-4 py-2 text-sm text-black hover:bg-gray-100 transition-colors flex items-center justify-between"
                  >
                    <span>{category.name}</span>
                    <span class="text-xs text-gray-500">{t('filter.category')}</span>
                  </button>
                {/each}
              </div>
            {/if}

            <!-- Other Categories -->
            {#if searchSuggestions.categories.filter((c) => c.isMain !== true).length > 0}
              <div class="mb-4">
                {#if searchSuggestions.categories.filter((c) => c.isMain === true).length === 0}
                  <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-4">
                    {t('category.categories')}
                  </h3>
                {/if}
                {#each searchSuggestions.categories.filter((c) => c.isMain !== true) as category}
                  <button
                    type="button"
                    on:click={() => handleSuggestionClick('category', category)}
                    class="w-full text-left px-4 py-2 text-sm text-black hover:bg-gray-100 transition-colors"
                  >
                    {category.name}
                  </button>
                {/each}
              </div>
            {/if}

            <!-- Brands -->
            {#if searchSuggestions.brands.length > 0}
              <div class="border-t border-gray-200 pt-4 mb-4">
                <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-2 px-4">
                  {t('filter.brands')}
                </h3>
                {#each searchSuggestions.brands as brand}
                  <button
                    type="button"
                    on:click={() => handleSuggestionClick('brand', brand)}
                    class="w-full text-left px-4 py-2 text-sm text-black hover:bg-gray-100 transition-colors flex items-center justify-between"
                  >
                    <span>{brand.name}</span>
                    <span class="text-xs text-gray-500">{t('filter.brand')}</span>
                  </button>
                {/each}
              </div>
            {/if}

            <!-- Products: grid (grouped by category for search; single grid for featured) -->
            {#if (searchQuery.trim() ? searchSuggestions.products : featuredProducts).length > 0}
              {@const productsToShow = searchQuery.trim()
                ? searchSuggestions.products
                : featuredProducts}
              {@const productsByCategory = getProductsByCategory(productsToShow)}
              {@const useCategoryGroups = searchQuery.trim() && productsByCategory.size > 0}
              <div class="border-t border-gray-200 pt-4">
                <h3 class="text-xs font-semibold text-gray-500 uppercase tracking-wide mb-4 px-4">
                  {searchQuery.trim() ? t('filter.products') : t('filter.featuredProducts')}
                </h3>
                {#if useCategoryGroups}
                  {#each Array.from(productsByCategory.entries()) as [categoryId, categoryProducts]}
                    {@const category =
                      categoryProducts[0]?.category || categories.find((c) => c.id === categoryId)}
                    {#if category}
                      <div class="mb-6">
                        <h4 class="text-sm font-medium text-black mb-3 px-4">{category.name}</h4>
                        <div class="{searchProductsGridClass} px-4">
                          {#each categoryProducts.slice(0, 8) as product}
                            <button
                              type="button"
                              on:click={() => handleSuggestionClick('product', product)}
                              class="text-left group"
                            >
                              <div
                                class="relative mb-2 bg-gray-100 overflow-hidden"
                                style={searchCardAspectStyle}
                              >
                                {#if product.images && product.images.length > 0}
                                  <BlurredImage
                                    src={product.images[0].url}
                                    alt={getProductImageAlt(product.images[0].alt, product.name)}
                                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                                    loading="lazy"
                                    fetchPriority="low"
                                  />
                                {:else}
                                  <div
                                    class="w-full h-full flex items-center justify-center text-gray-400 text-xs"
                                  >
                                    No Image
                                  </div>
                                {/if}
                              </div>
                              <div class="text-xs text-black font-medium mb-1 line-clamp-2">
                                {product.name}
                              </div>
                              {#if product.brand}
                                <div class="text-xs text-gray-500 mb-1">{product.brand.name}</div>
                              {/if}
                              <div class="text-xs text-black font-semibold">
                                {#if product.price != null}
                                  {formatPrice(product.price)}
                                  {#if product.compareAtPrice != null}
                                    {@const priceNum =
                                      typeof product.price === 'number'
                                        ? product.price
                                        : parseFloat(String(product.price))}
                                    {@const comparePriceNum =
                                      typeof product.compareAtPrice === 'number'
                                        ? product.compareAtPrice
                                        : parseFloat(String(product.compareAtPrice))}
                                    {#if comparePriceNum > priceNum}
                                      <span class="text-gray-400 line-through ml-1"
                                        >{formatPrice(product.compareAtPrice)}</span
                                      >
                                    {/if}
                                  {/if}
                                {:else}
                                  <span class="text-gray-500">Price on request</span>
                                {/if}
                              </div>
                            </button>
                          {/each}
                        </div>
                      </div>
                    {/if}
                  {/each}
                {:else}
                  <!-- Single grid when no categories (e.g. recommended products) -->
                  <div
                    class="grid w-full px-4 {searchGridColsClassMap[searchGridColumns] ||
                      searchGridColsClassMap['4']} {searchGridGapClassMap[searchGridGap] ||
                      'gap-4'}"
                  >
                    {#each productsToShow.slice(0, 12) as product}
                      <button
                        type="button"
                        on:click={() => handleSuggestionClick('product', product)}
                        class="text-left group"
                      >
                        <div
                          class="relative mb-2 bg-gray-100 overflow-hidden"
                          style={searchCardAspectStyle}
                        >
                          {#if product.images && product.images.length > 0}
                            <BlurredImage
                              src={product.images[0].url}
                              alt={getProductImageAlt(product.images[0].alt, product.name)}
                              className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                              loading="lazy"
                              fetchPriority="low"
                            />
                          {:else}
                            <div
                              class="w-full h-full flex items-center justify-center text-gray-400 text-xs"
                            >
                              No Image
                            </div>
                          {/if}
                        </div>
                        <div class="text-xs text-black font-medium mb-1 line-clamp-2">
                          {product.name}
                        </div>
                        {#if product.brand}
                          <div class="text-xs text-gray-500 mb-1">{product.brand.name}</div>
                        {/if}
                        <div class="text-xs text-black font-semibold">
                          {#if product.price != null}
                            {formatPrice(product.price)}
                            {#if product.compareAtPrice != null}
                              {@const priceNum =
                                typeof product.price === 'number'
                                  ? product.price
                                  : parseFloat(String(product.price))}
                              {@const comparePriceNum =
                                typeof product.compareAtPrice === 'number'
                                  ? product.compareAtPrice
                                  : parseFloat(String(product.compareAtPrice))}
                              {#if comparePriceNum > priceNum}
                                <span class="text-gray-400 line-through ml-1"
                                  >{formatPrice(product.compareAtPrice)}</span
                                >
                              {/if}
                            {/if}
                          {:else}
                            <span class="text-gray-500">Price on request</span>
                          {/if}
                        </div>
                      </button>
                    {/each}
                  </div>
                {/if}
              </div>
            {/if}

            {#if loadingSuggestions}
              <div class="px-4 py-6">
                <div class="mx-auto w-full max-w-[10rem]">
                  <LoadingBar />
                </div>
              </div>
            {/if}
          </div>
        </div>
      {/if}
    </div>
  {/if}
</nav>

<!-- Sidebar Menu (Mobile) -->
<button
  type="button"
  class="fixed inset-0 bg-black/50 z-40 lg:hidden transition-opacity duration-300 ease-in-out {sidebarOpen
    ? 'opacity-100'
    : 'opacity-0 pointer-events-none'}"
  on:click={closeSidebar}
  aria-hidden="true"
  tabindex="-1"
></button>

<!-- Sidebar -->
<aside
  class="fixed top-0 right-0 h-full w-full max-w-full bg-white z-50 transform transition-transform duration-300 ease-in-out shadow-xl overflow-y-auto lg:hidden flex flex-col {sidebarOpen
    ? 'translate-x-0'
    : 'translate-x-full'}"
  aria-hidden={!sidebarOpen}
>
  {#if sidebarView === 'menu'}
    <div
      class="p-6 flex flex-col min-h-full"
      style="padding-bottom: calc(6rem + env(safe-area-inset-bottom, 0px));"
    >
      <!-- Header -->
      <div class="flex items-center justify-between mb-8">
        <h2 class="text-xl font-bold text-black">{t('menu.title')}</h2>
        <button
          on:click={closeSidebar}
          class="p-2 text-gray-600 hover:text-black transition-colors"
          aria-label="Close menu"
        >
          <svg class="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M6 18L18 6M6 6l12 12"
            />
          </svg>
        </button>
      </div>

      <!-- Categories -->
      <div class="space-y-6 mb-8 flex-1">
        <div>
          <h3 class="text-sm font-bold text-black mb-3 uppercase tracking-wide">
            {t('menu.shop')}
          </h3>
          <div class="space-y-2">
            {#each topLevelCategories as category}
              <a
                href="/shop?category={category.slug}"
                on:click={handleLinkClick}
                class="block py-2 text-gray-600 hover:text-black transition-colors"
              >
                {category.name}
              </a>
            {/each}
            {#if topLevelCategories.length === 0}
              <p class="text-sm text-gray-500 py-2">{t('menu.noCategoriesAvailable')}</p>
            {/if}
          </div>
        </div>

        {#if topLevelCategories.length > 0 && activeMainCategory}
          <div>
            <h3 class="text-sm font-bold text-black mb-3 uppercase tracking-wide">
              {t('category.categories')}
            </h3>
            <div class="space-y-2">
              {#each subCategories as category}
                <a
                  href="/shop?category={category.slug}"
                  on:click={handleLinkClick}
                  class="block py-2 text-gray-600 hover:text-black transition-colors"
                >
                  {category.name}
                </a>
              {/each}
              {#if subCategories.length === 0}
                <p class="text-sm text-gray-500 py-2">{t('menu.noSubcategoriesAvailable')}</p>
              {/if}
            </div>
          </div>
        {/if}

        <div>
          <h3 class="text-sm font-bold text-black mb-3 uppercase tracking-wide">
            {t('menu.other')}
          </h3>
          <div class="space-y-2">
            {#if $settingsStore.lookbookEnabled}
              <a
                href="/lookbook"
                on:click={handleLinkClick}
                class="block py-2 text-gray-600 hover:text-black transition-colors"
              >
                {lookbookTitle}
              </a>
            {/if}
            <a
              href="/"
              on:click={handleLinkClick}
              class="block py-2 text-gray-600 hover:text-black transition-colors"
            >
              {t('menu.home')}
            </a>
          </div>
        </div>
      </div>

      <!-- User Section -->
      <div class="border-t border-gray-200 pt-6">
        {#if isAuthenticated}
          {#if user?.role === 'ADMIN' || user?.role === 'SUPER_ADMIN'}
            <a
              href="/admin"
              on:click={handleLinkClick}
              class="block py-2 text-gray-600 hover:text-black transition-colors"
            >
              {t('admin.admin')}
            </a>
          {/if}
          <a
            href="/account/profile"
            on:click={handleLinkClick}
            class="block py-2 text-gray-600 hover:text-black transition-colors"
          >
            {t('account.myAccount')}
          </a>
          <button
            on:click={handleLogout}
            class="w-full text-left py-2 text-gray-600 hover:text-black transition-colors"
          >
            {t('auth.logout')}
          </button>
        {:else}
          <a
            href="/login"
            on:click={handleLinkClick}
            class="block py-2 text-gray-600 hover:text-black transition-colors"
          >
            {t('auth.login')}
          </a>
          <a
            href="/register"
            on:click={handleLinkClick}
            class="block py-2 text-center bg-black text-white hover:bg-gray-800 transition-colors mt-2"
          >
            {t('auth.signUp')}
          </a>
        {/if}
      </div>

      <!-- Language & Region (currency) switchers at bottom (same design as desktop modal) -->
      <div class="border-t border-gray-200 pt-4 mt-4 space-y-0">
        <button
          type="button"
          on:click={openSidebarLanguageView}
          class="w-full text-left py-3 flex items-center justify-between text-gray-600 hover:text-black transition-colors"
          aria-label={t('language.choose')}
        >
          <span class="text-sm font-medium uppercase tracking-wide">{t('language.tab')}</span>
          <span class="text-sm text-black font-medium">{currentLanguageNameMobile}</span>
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
        <button
          type="button"
          on:click={openSidebarRegionView}
          class="w-full text-left py-3 flex items-center justify-between text-gray-600 hover:text-black transition-colors border-t border-gray-200"
          aria-label={t('region.choose')}
        >
          <span class="text-sm font-medium uppercase tracking-wide">{t('region.tab')}</span>
          <span class="text-sm text-black font-medium">{currentRegionDisplayMobile}</span>
          <svg class="w-5 h-5 text-gray-400" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M9 5l7 7-7 7"
            />
          </svg>
        </button>
      </div>
    </div>
  {:else if sidebarView === 'language'}
    <!-- Language selection screen (same design as desktop modal) -->
    <div class="flex flex-col h-full">
      <div class="relative border-b border-gray-200 flex items-center px-4 py-4">
        <button
          on:click={backToSidebarMenu}
          class="p-2 -ml-2 text-gray-600 hover:text-black transition-colors flex items-center gap-2"
          aria-label={t('common.back')}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          <span class="text-sm font-medium">{t('common.back')}</span>
        </button>
      </div>
      <div class="flex-1 overflow-y-auto">
        <div class="p-6">
          <p class="text-sm text-gray-600 mb-6" id="mobile-language-title">
            {t('language.choose')}
          </p>
          {#if mobileLanguagesLoading}
            <div class="py-8 px-6">
              <div class="mx-auto w-full max-w-[10rem]">
                <LoadingBar />
              </div>
            </div>
          {:else if mobileLanguages.length === 0}
            <div class="text-center py-8 text-gray-500">{t('language.noAvailable')}</div>
          {:else}
            <div class="space-y-0">
              {#each mobileLanguages as language, index (language.id)}
                <button
                  type="button"
                  class="w-full text-left px-0 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors {index <
                  mobileLanguages.length - 1
                    ? 'border-b border-gray-200'
                    : ''}"
                  on:click={() => selectMobileLanguage(language)}
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
                  {#if language.code.toLowerCase() === currentLanguage}
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
      </div>
    </div>
  {:else if sidebarView === 'region'}
    <!-- Region (country + currency) selection screen -->
    <div class="flex flex-col h-full">
      <div class="relative border-b border-gray-200 flex items-center px-4 py-4">
        <button
          on:click={backToSidebarMenu}
          class="p-2 -ml-2 text-gray-600 hover:text-black transition-colors flex items-center gap-2"
          aria-label={t('common.back')}
        >
          <svg class="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path
              stroke-linecap="round"
              stroke-linejoin="round"
              stroke-width="2"
              d="M15 19l-7-7 7-7"
            />
          </svg>
          <span class="text-sm font-medium">{t('common.back')}</span>
        </button>
      </div>
      <div class="flex-1 overflow-y-auto">
        <div class="p-6">
          <p class="text-sm text-gray-600 mb-6" id="mobile-region-title">
            {t('region.choose')}
          </p>
          {#if mobileCountriesLoading}
            <div class="py-8 px-6">
              <div class="mx-auto w-full max-w-[10rem]">
                <LoadingBar />
              </div>
            </div>
          {:else if mobileCountries.length === 0}
            <div class="text-center py-8 text-gray-500">{t('region.noAvailable')}</div>
          {:else}
            <div class="space-y-0">
              {#each mobileCountries as country, index (country.id)}
                <button
                  type="button"
                  class="w-full text-left px-0 py-3 flex items-center justify-between hover:bg-gray-50 transition-colors {index <
                  mobileCountries.length - 1
                    ? 'border-b border-gray-200'
                    : ''}"
                  on:click={() => selectMobileCountry(country)}
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
                  {#if country.code === selectedCountryCodeMobile}
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
      </div>
    </div>
  {/if}
</aside>

<style>
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }

  .line-clamp-2 {
    display: -webkit-box;
    -webkit-line-clamp: 2;
    line-clamp: 2;
    -webkit-box-orient: vertical;
    overflow: hidden;
  }

  /* Fix for browser autocomplete - remove the black bar */
  input:-webkit-autofill,
  input:-webkit-autofill:hover,
  input:-webkit-autofill:focus,
  input:-webkit-autofill:active {
    -webkit-box-shadow: 0 0 0 30px white inset !important;
    -webkit-text-fill-color: #000000 !important;
    box-shadow: 0 0 0 30px white inset !important;
    background-color: white !important;
  }

  input[type='text'] {
    background-color: white !important;
  }

  /* Apple-style dropdown animation */
  @keyframes fadeInDown {
    from {
      opacity: 0;
      transform: translateY(-10px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }

  .apple-dropdown {
    animation: fadeInDown 0.3s ease-out;
  }
</style>
