<script lang="ts">
  import { onMount, tick } from 'svelte';
  import { page } from '$app/stores';
  import {
    productApi,
    type Product,
    type Brand,
    type ProductFilters,
    type ProductSort,
  } from '$lib/api/product.api';
  import { categoryApi, type Category } from '$lib/api/category.api';
  import { cartStore } from '$lib/stores/cart.store';
  import { notificationStore } from '$lib/stores/notification.store';
  import { settingsStore } from '$lib/stores/settings.store';
  import { authStore } from '$lib/stores/auth.store';
  import { customerApi } from '$lib/api/customer.api';
  import { goto } from '$app/navigation';
  import FilterSidebar from '$lib/components/FilterSidebar.svelte';
  import Pagination from '$lib/components/Pagination.svelte';
  import { formatPrice, toPriceNumber } from '$lib/utils/price.utils';
  import { currencyStore } from '$lib/stores/currency.store';
  import {
    getCatalogPrimaryImageLoading,
    getProductImageAlt,
    getSecondaryMediaStatus,
    setSecondaryMediaStatus,
  } from '$lib/utils/image.utils';
  import { resolveStorefrontMediaSrc } from '$lib/utils/media-url';
  import { t, tLang } from '$lib/utils/i18n';
  import { getErrorMessage } from '$lib/utils/error-handler';
  import { i18nStore } from '$lib/stores/i18n.store';
  import BlurredImage from '$lib/components/BlurredImage.svelte';
  import {
    isInternationalClothingSize,
    normalizeInternationalSize,
    sortInternationalSizes,
  } from '$lib/constants/international-sizes';

  export let data: {
    allCategories: Category[];
    mainCategories: Category[];
    subCategories: Category[];
    brands: Brand[];
    products: Product[];
    pagination: {
      page: number;
      limit: number;
      total: number;
      totalPages: number;
    };
    availableFilters: {
      availableColors: string[];
      availableMaterials: string[];
      availableCountries: string[];
      availableSizes: string[];
    };
    initialState: {
      categoryParam: string;
      selectedCategory: string;
      selectedBrand: string;
      minPrice: string;
      maxPrice: string;
      searchQuery: string;
      selectedColor: string;
      selectedMaterial: string;
      selectedCountryOfOrigin: string;
      selectedSize: string;
      selectedInventoryStatus: '' | 'IN_SALE' | 'COMING_SOON' | 'OUT_OF_STOCK';
      selectedMainCategory: Category | null;
      selectedSubCategory: Category | null;
      sortField: 'price' | 'createdAt' | 'name';
      sortOrder: 'asc' | 'desc';
    };
    languageCode: string;
    error: string | null;
  };

  // Reactive to currency changes
  $: currentCurrency = $currencyStore;

  // Reactive subscription to language store
  $: currentLanguage = $i18nStore;
  let previousLanguage: string | undefined = undefined;
  let categoriesLanguage = data.languageCode;

  let products: Product[] = data.products ?? [];
  let allCategories: Category[] = data.allCategories ?? [];
  let mainCategories: Category[] = data.mainCategories ?? []; // Main categories (Men/Women)
  let subCategories: Category[] = data.subCategories ?? []; // Subcategories for filters
  let brands: Brand[] = data.brands ?? [];
  let loading =
    !data.error &&
    (data.products?.length ?? 0) === 0 &&
    (data.allCategories?.length ?? 0) === 0 &&
    (data.brands?.length ?? 0) === 0;
  let error = data.error ?? '';

  // Current category info
  let selectedMainCategory: Category | null = data.initialState.selectedMainCategory ?? null;
  let selectedSubCategory: Category | null = data.initialState.selectedSubCategory ?? null;

  // Filters
  let selectedCategory = data.initialState.selectedCategory ?? '';
  let selectedBrand = data.initialState.selectedBrand ?? '';
  let minPrice = data.initialState.minPrice ?? '';
  let maxPrice = data.initialState.maxPrice ?? '';
  let searchQuery = data.initialState.searchQuery ?? '';
  let selectedColor = data.initialState.selectedColor ?? '';
  let selectedMaterial = data.initialState.selectedMaterial ?? '';
  let selectedCountryOfOrigin = data.initialState.selectedCountryOfOrigin ?? '';
  let selectedSize = data.initialState.selectedSize ?? '';
  let selectedInventoryStatus: '' | 'IN_SALE' | 'COMING_SOON' | 'OUT_OF_STOCK' =
    data.initialState.selectedInventoryStatus ?? '';

  // Available filter values (extracted from products)
  let availableColors: string[] = data.availableFilters.availableColors ?? [];
  let availableMaterials: string[] = data.availableFilters.availableMaterials ?? [];
  let availableCountries: string[] = data.availableFilters.availableCountries ?? [];
  let availableSizes: string[] = data.availableFilters.availableSizes ?? [];

  // Mobile filter state
  let mobileFiltersOpen = false;

  // Wishlist state
  let wishlistItems: Set<string> = new Set();
  let wishlistLoading: Set<string> = new Set();

  // Pagination
  let currentPage = data.pagination.page ?? 1;
  let totalPages = data.pagination.totalPages ?? 1;
  let total = data.pagination.total ?? 0;
  const limit = 20;
  const maxApiLimit = 100;
  let viewAllMode = false;

  // Sort (order matters for price: asc = low→high, desc = high→low)
  let sortField: 'price' | 'createdAt' | 'name' = data.initialState.sortField ?? 'createdAt';
  let sortOrder: 'asc' | 'desc' = data.initialState.sortOrder ?? 'desc';
  let sortDropdownOpen = false;
  type SortOption = {
    field: 'price' | 'createdAt' | 'name';
    order: 'asc' | 'desc';
    labelKey: string;
    icon: 'newest' | 'priceUp' | 'priceDown' | 'name';
  };
  const sortOptions: SortOption[] = [
    { field: 'createdAt', order: 'desc', labelKey: 'shop.newest', icon: 'newest' },
    { field: 'price', order: 'asc', labelKey: 'shop.priceLowToHigh', icon: 'priceUp' },
    { field: 'price', order: 'desc', labelKey: 'shop.priceHighToLow', icon: 'priceDown' },
    { field: 'name', order: 'asc', labelKey: 'shop.name', icon: 'name' },
  ];
  $: currentSortOption =
    sortOptions.find((o) => o.field === sortField && o.order === sortOrder) ?? sortOptions[0];
  type InventoryStatusOption = {
    value: '' | 'IN_SALE' | 'COMING_SOON' | 'OUT_OF_STOCK';
    labelKey: string;
  };
  const inventoryStatusOptions: InventoryStatusOption[] = [
    { value: '', labelKey: 'warehouse.allStatuses' },
    { value: 'COMING_SOON', labelKey: 'warehouse.comingSoon' },
    { value: 'IN_SALE', labelKey: 'warehouse.inSale' },
    { value: 'OUT_OF_STOCK', labelKey: 'warehouse.outOfStock' },
  ];
  $: currentInventoryStatusOption =
    inventoryStatusOptions.find((o) => o.value === selectedInventoryStatus) ??
    inventoryStatusOptions[0];
  function setInventoryStatus(option: InventoryStatusOption) {
    selectedInventoryStatus = option.value;
    closeInventoryStatusDropdown();
    handleFilterChange();
  }
  let inventoryStatusDropdownOpen = false;
  let inventoryStatusDropdownNode: HTMLDivElement | undefined;
  let inventoryStatusDropdownRect: DOMRect | null = null;
  let inventoryStatusDropdownPanel: HTMLDivElement | undefined;
  let inventoryStatusOutsideHandler: ((e: MouseEvent) => void) | null = null;
  let shopHeaderCategories: Category[] = [];
  let shopHeaderMainCategory: Category | null = null;
  let shopHeaderSubCategory: Category | null = null;
  let shopHeaderCategoryParam = '';
  function closeInventoryStatusDropdown() {
    inventoryStatusDropdownOpen = false;
    inventoryStatusDropdownRect = null;
    if (inventoryStatusOutsideHandler) {
      document.removeEventListener('click', inventoryStatusOutsideHandler, true);
      inventoryStatusOutsideHandler = null;
    }
  }
  function toggleInventoryStatusDropdown() {
    inventoryStatusDropdownOpen = !inventoryStatusDropdownOpen;
    if (inventoryStatusDropdownOpen) {
      closeSortDropdown();
      tick().then(() => {
        if (inventoryStatusDropdownNode) {
          inventoryStatusDropdownRect = inventoryStatusDropdownNode.getBoundingClientRect();
        }
      });
      const handler = (e: MouseEvent) => {
        const target = e.target as Node;
        if (
          inventoryStatusDropdownNode &&
          !inventoryStatusDropdownNode.contains(target) &&
          inventoryStatusDropdownPanel &&
          !inventoryStatusDropdownPanel.contains(target)
        ) {
          closeInventoryStatusDropdown();
        }
      };
      inventoryStatusOutsideHandler = handler;
      setTimeout(() => document.addEventListener('click', inventoryStatusOutsideHandler!, true), 0);
    } else {
      closeInventoryStatusDropdown();
    }
  }
  function setSort(option: SortOption) {
    sortField = option.field;
    sortOrder = option.order;
    closeSortDropdown();
    loadProducts();
  }
  let sortDropdownNode: HTMLDivElement | undefined;
  let sortDropdownRect: DOMRect | null = null;
  let sortDropdownPanel: HTMLDivElement | undefined;
  let sortOutsideHandler: ((e: MouseEvent) => void) | null = null;
  function closeSortDropdown() {
    sortDropdownOpen = false;
    sortDropdownRect = null;
    if (sortOutsideHandler) {
      document.removeEventListener('click', sortOutsideHandler, true);
      sortOutsideHandler = null;
    }
  }
  function toggleSortDropdown() {
    sortDropdownOpen = !sortDropdownOpen;
    if (sortDropdownOpen) {
      closeInventoryStatusDropdown();
      tick().then(() => {
        if (sortDropdownNode) sortDropdownRect = sortDropdownNode.getBoundingClientRect();
      });
      const handler = (e: MouseEvent) => {
        const target = e.target as Node;
        if (
          sortDropdownNode &&
          !sortDropdownNode.contains(target) &&
          sortDropdownPanel &&
          !sortDropdownPanel.contains(target)
        )
          closeSortDropdown();
      };
      sortOutsideHandler = handler;
      setTimeout(() => document.addEventListener('click', sortOutsideHandler!, true), 0);
    } else {
      sortDropdownRect = null;
      if (sortOutsideHandler) {
        document.removeEventListener('click', sortOutsideHandler, true);
        sortOutsideHandler = null;
      }
    }
  }

  // Hover state for card image swap (reliable across browsers)
  let hoveredCardIndex: number | null = null;
  let secondaryMediaStatusByKey: Record<string, 'idle' | 'loading' | 'loaded' | 'error'> = {};
  let cardImageIndexByProductId: Record<string, number> = {};
  let cardTouchStartXByProductId: Record<string, number> = {};
  let suppressCardNavigationByProductId: Record<string, boolean> = {};
  // Quick View modal (controlled by admin Settings → Quick View)
  let quickViewProduct: Product | null = null;
  const hasServerRenderedData =
    (data.products?.length ?? 0) > 0 ||
    (data.allCategories?.length ?? 0) > 0 ||
    (data.brands?.length ?? 0) > 0 ||
    !!data.error;
  let urlSyncReady = false;
  let lastCategoryParam = data.initialState.categoryParam ?? '';
  let lastSearchParam = data.initialState.searchQuery ?? '';
  let lastInventoryStatusParam = data.initialState.selectedInventoryStatus ?? '';
  let lastResolvedSelectedCategoryId = data.initialState.selectedCategory ?? '';
  let lastHydratedDataKey = '';

  function getDataHydrationKey() {
    return JSON.stringify({
      languageCode: data.languageCode ?? '',
      categoryParam: data.initialState.categoryParam ?? '',
      selectedCategory: data.initialState.selectedCategory ?? '',
      selectedBrand: data.initialState.selectedBrand ?? '',
      minPrice: data.initialState.minPrice ?? '',
      maxPrice: data.initialState.maxPrice ?? '',
      searchQuery: data.initialState.searchQuery ?? '',
      selectedColor: data.initialState.selectedColor ?? '',
      selectedMaterial: data.initialState.selectedMaterial ?? '',
      selectedCountryOfOrigin: data.initialState.selectedCountryOfOrigin ?? '',
      selectedSize: data.initialState.selectedSize ?? '',
      selectedInventoryStatus: data.initialState.selectedInventoryStatus ?? '',
      sortField: data.initialState.sortField ?? 'createdAt',
      sortOrder: data.initialState.sortOrder ?? 'desc',
      page: data.pagination.page ?? 1,
      total: data.pagination.total ?? 0,
      totalPages: data.pagination.totalPages ?? 1,
      productIds: (data.products ?? []).map((product) => product.id),
    });
  }

  function hydrateFromServerData() {
    allCategories = data.allCategories ?? [];
    mainCategories = data.mainCategories ?? [];
    subCategories = data.subCategories ?? [];
    brands = data.brands ?? [];
    products = data.products ?? [];
    currentPage = data.pagination.page ?? 1;
    totalPages = data.pagination.totalPages ?? 1;
    total = data.pagination.total ?? 0;
    availableColors = data.availableFilters.availableColors ?? [];
    availableMaterials = data.availableFilters.availableMaterials ?? [];
    availableCountries = data.availableFilters.availableCountries ?? [];
    availableSizes = data.availableFilters.availableSizes ?? [];
    error = data.error ?? '';
    loading =
      !data.error &&
      (data.products?.length ?? 0) === 0 &&
      (data.allCategories?.length ?? 0) === 0 &&
      (data.brands?.length ?? 0) === 0;

    selectedMainCategory = data.initialState.selectedMainCategory ?? null;
    selectedSubCategory = data.initialState.selectedSubCategory ?? null;
    selectedCategory = data.initialState.selectedCategory ?? '';
    selectedBrand = data.initialState.selectedBrand ?? '';
    minPrice = data.initialState.minPrice ?? '';
    maxPrice = data.initialState.maxPrice ?? '';
    searchQuery = data.initialState.searchQuery ?? '';
    selectedColor = data.initialState.selectedColor ?? '';
    selectedMaterial = data.initialState.selectedMaterial ?? '';
    selectedCountryOfOrigin = data.initialState.selectedCountryOfOrigin ?? '';
    selectedSize = data.initialState.selectedSize ?? '';
    selectedInventoryStatus = data.initialState.selectedInventoryStatus ?? '';
    sortField = data.initialState.sortField ?? 'createdAt';
    sortOrder = data.initialState.sortOrder ?? 'desc';

    lastCategoryParam = data.initialState.categoryParam ?? '';
    lastSearchParam = data.initialState.searchQuery ?? '';
    lastInventoryStatusParam = data.initialState.selectedInventoryStatus ?? '';
    lastResolvedSelectedCategoryId = data.initialState.selectedCategory ?? '';
  }

  function parseInventoryStatusParam(
    value: string | null
  ): '' | 'IN_SALE' | 'COMING_SOON' | 'OUT_OF_STOCK' {
    if (value === 'IN_SALE' || value === 'COMING_SOON' || value === 'OUT_OF_STOCK') {
      return value;
    }

    return '';
  }

  function parseDefaultInventoryStatus(
    value: string | null | undefined
  ): '' | 'IN_SALE' | 'COMING_SOON' | 'OUT_OF_STOCK' {
    return parseInventoryStatusParam(value ?? null);
  }

  function parseDefaultSort(value: string | null | undefined): {
    field: 'price' | 'createdAt' | 'name';
    order: 'asc' | 'desc';
  } {
    switch (value) {
      case 'price_asc':
        return { field: 'price', order: 'asc' };
      case 'price_desc':
        return { field: 'price', order: 'desc' };
      case 'name_asc':
        return { field: 'name', order: 'asc' };
      case 'createdAt_desc':
      default:
        return { field: 'createdAt', order: 'desc' };
    }
  }

  function parseOptionalPrice(value: string): number | undefined {
    if (!value.trim()) return undefined;
    const parsed = Number.parseFloat(value);
    return Number.isFinite(parsed) ? parsed : undefined;
  }

  function handleSecondaryMediaStateChange(
    productId: string,
    url: string,
    event: CustomEvent<{ src: string; status: 'idle' | 'loading' | 'loaded' | 'error' }>
  ) {
    if (event.detail.src !== url) {
      return;
    }

    secondaryMediaStatusByKey = setSecondaryMediaStatus(
      secondaryMediaStatusByKey,
      productId,
      url,
      event.detail.status
    );
  }

  function getCardImageIndex(productId: string, imagesLength: number) {
    const currentIndex = cardImageIndexByProductId[productId] ?? 0;
    if (imagesLength <= 0) return 0;
    return Math.min(Math.max(currentIndex, 0), imagesLength - 1);
  }

  function setCardImageIndex(productId: string, index: number, imagesLength: number) {
    const nextIndex = imagesLength <= 0 ? 0 : Math.min(Math.max(index, 0), imagesLength - 1);
    cardImageIndexByProductId = {
      ...cardImageIndexByProductId,
      [productId]: nextIndex,
    };
  }

  function handleCardTouchStart(productId: string, event: TouchEvent) {
    suppressCardNavigationByProductId = {
      ...suppressCardNavigationByProductId,
      [productId]: false,
    };
    cardTouchStartXByProductId = {
      ...cardTouchStartXByProductId,
      [productId]: event.changedTouches[0]?.screenX ?? 0,
    };
  }

  function handleCardTouchEnd(productId: string, imagesLength: number, event: TouchEvent) {
    if (imagesLength <= 1) return;

    const touchStartX = cardTouchStartXByProductId[productId] ?? 0;
    const touchEndX = event.changedTouches[0]?.screenX ?? 0;
    const diff = touchStartX - touchEndX;
    const swipeThreshold = 40;

    if (Math.abs(diff) <= swipeThreshold) return;

    const currentIndex = getCardImageIndex(productId, imagesLength);
    const nextIndex =
      diff > 0
        ? (currentIndex + 1) % imagesLength
        : (currentIndex - 1 + imagesLength) % imagesLength;

    setCardImageIndex(productId, nextIndex, imagesLength);
    suppressCardNavigationByProductId = {
      ...suppressCardNavigationByProductId,
      [productId]: true,
    };

    window.setTimeout(() => {
      suppressCardNavigationByProductId = {
        ...suppressCardNavigationByProductId,
        [productId]: false,
      };
    }, 250);
  }

  function handleCardClick(productId: string, event: MouseEvent) {
    if (!suppressCardNavigationByProductId[productId]) return;

    event.preventDefault();
    event.stopPropagation();
  }

  $: {
    const nextHydrationKey = getDataHydrationKey();
    if (nextHydrationKey !== lastHydratedDataKey) {
      lastHydratedDataKey = nextHydrationKey;
      hydrateFromServerData();
    }
  }

  function findCategoryByParam(categoryParam: string): Category | null {
    if (!categoryParam || allCategories.length === 0) {
      return null;
    }

    // Try to find by slug first (most common case)
    let category = allCategories.find((c) => c.slug === categoryParam);

    // If not found, try by name (case-insensitive)
    if (!category) {
      category = allCategories.find((c) => c.name.toLowerCase() === categoryParam.toLowerCase());
    }

    // If still not found, try by id
    if (!category) {
      category = allCategories.find((c) => c.id === categoryParam);
    }

    // Also try slug with lowercase comparison
    if (!category) {
      category = allCategories.find((c) => c.slug?.toLowerCase() === categoryParam.toLowerCase());
    }

    return category || null;
  }

  function syncCategorySelectionState(categoryId: string) {
    if (!categoryId || allCategories.length === 0) {
      selectedMainCategory = null;
      selectedSubCategory = null;
      subCategories = [];
      return;
    }

    const category = allCategories.find((item) => item.id === categoryId) ?? null;
    if (!category) {
      selectedMainCategory = null;
      selectedSubCategory = null;
      subCategories = [];
      return;
    }

    if (category.isMain || !category.parentId) {
      selectedMainCategory = category;
      selectedSubCategory = null;
      updateSubCategories(category.id);
      return;
    }

    const parent = category.parent || allCategories.find((item) => item.id === category.parentId);
    if (!parent) {
      selectedMainCategory = null;
      selectedSubCategory = null;
      subCategories = [];
      return;
    }

    if (parent.isMain || !parent.parentId) {
      selectedMainCategory = parent;
      selectedSubCategory = category;
      updateSubCategories(parent.id);
      return;
    }

    selectedSubCategory = parent;
    selectedMainCategory =
      parent.parent || allCategories.find((item) => item.id === parent.parentId) || null;
    if (selectedMainCategory) {
      updateSubCategories(selectedMainCategory.id);
    } else {
      subCategories = [];
    }
  }

  function applyCategoryFromUrl() {
    const params = $page.url.searchParams;
    const categoryParam = params.get('category');

    console.log('Applying category from URL:', {
      categoryParam,
      allCategoriesCount: allCategories.length,
    });

    if (!categoryParam) {
      // Clear category selection if no category param
      selectedCategory = '';
      selectedMainCategory = null;
      selectedSubCategory = null;
      return;
    }

    const category = findCategoryByParam(categoryParam);

    if (!category) {
      console.warn('Category not found for param:', categoryParam);
      console.warn(
        'Available categories:',
        allCategories.slice(0, 10).map((c) => ({
          name: c.name,
          slug: c.slug,
          id: c.id,
        }))
      );
      selectedCategory = '';
      selectedMainCategory = null;
      selectedSubCategory = null;
      return;
    }

    console.log('Category found:', {
      id: category.id,
      name: category.name,
      slug: category.slug,
      isMain: category.isMain,
      parentId: category.parentId,
    });

    selectedCategory = category.id;

    // Determine category level: main, subcategory (2nd level), or sub-subcategory (3rd level)
    if (category.isMain || !category.parentId) {
      // It's a main category (1st level)
      selectedMainCategory = category;
      selectedSubCategory = null;
      updateSubCategories(category.id);
    } else {
      // It has a parent, check if parent also has a parent
      const parent = category.parent || allCategories.find((c) => c.id === category.parentId);
      if (parent) {
        if (parent.isMain || !parent.parentId) {
          // Category is a subcategory (2nd level), parent is main
          selectedSubCategory = category;
          selectedMainCategory = parent;
          updateSubCategories(parent.id);
        } else {
          // Category is a sub-subcategory (3rd level), parent is subcategory
          selectedSubCategory = parent;
          selectedMainCategory =
            parent.parent || allCategories.find((c) => c.id === parent.parentId) || null;
          if (selectedMainCategory) {
            updateSubCategories(selectedMainCategory.id);
          }
        }
      }
    }

    console.log('Category applied:', {
      selectedCategory,
      selectedMainCategory: selectedMainCategory?.name,
      selectedSubCategory: selectedSubCategory?.name,
    });
  }

  onMount(async () => {
    // Reload settings so shop design (hover image, grid, etc.) is always up to date (e.g. after admin change in another tab)
    await settingsStore.load();
    await loadWishlistStatus();
    if (!hasServerRenderedData) {
      await Promise.all([loadCategories(), loadBrands()]);

      const params = $page.url.searchParams;
      const searchParam = params.get('search');

      applyCategoryFromUrl();

      if (searchParam) {
        searchQuery = searchParam;
      }

      const inventoryStatusParam = params.get('inventoryStatus');
      if (
        inventoryStatusParam === 'IN_SALE' ||
        inventoryStatusParam === 'COMING_SOON' ||
        inventoryStatusParam === 'OUT_OF_STOCK'
      ) {
        selectedInventoryStatus = inventoryStatusParam;
      } else {
        selectedInventoryStatus = parseDefaultInventoryStatus(
          $settingsStore.shopDefaultInventoryStatus
        );
      }

      const defaultSort = parseDefaultSort($settingsStore.shopDefaultSort);
      sortField = defaultSort.field;
      sortOrder = defaultSort.order;

      await loadProducts();
    }
    urlSyncReady = true;
  });

  function updateSubCategories(mainCategoryId: string) {
    if (!mainCategoryId) {
      subCategories = [];
      return;
    }
    // Get ONLY first-level subcategories (direct children) of the main category
    // Like: Clothing, Shoes, Bags (not T-Shirts, Jackets, etc.)
    subCategories = allCategories.filter((c) => c.parentId === mainCategoryId && !c.isMain);
    subCategories.sort((a, b) => a.name.localeCompare(b.name));
  }

  function getThirdLevelCategories(parentCategoryId: string): Category[] {
    // Get third-level subcategories (children of selected second-level category)
    // Like: Jackets, T-Shirts, Pants when Clothing is selected
    return allCategories
      .filter((c) => c.parentId === parentCategoryId && !c.isMain)
      .sort((a, b) => a.name.localeCompare(b.name));
  }

  function resolveShopHeaderState(categoryParam: string) {
    const activeCategory = findCategoryByParam(categoryParam);

    if (!activeCategory) {
      return {
        mainCategory: selectedMainCategory,
        subCategory: selectedSubCategory,
        categories: selectedSubCategory ? getThirdLevelCategories(selectedSubCategory.id) : subCategories,
      };
    }

    if (activeCategory.isMain || !activeCategory.parentId) {
      return {
        mainCategory: activeCategory,
        subCategory: null,
        categories: allCategories
          .filter((category) => category.parentId === activeCategory.id && !category.isMain)
          .sort((left, right) => left.name.localeCompare(right.name)),
      };
    }

    const parent =
      activeCategory.parent ||
      allCategories.find((category) => category.id === activeCategory.parentId) ||
      null;

    if (!parent) {
      return {
        mainCategory: null,
        subCategory: null,
        categories: [],
      };
    }

    if (parent.isMain || !parent.parentId) {
      return {
        mainCategory: parent,
        subCategory: activeCategory,
        categories: getThirdLevelCategories(activeCategory.id),
      };
    }

    const mainCategory =
      parent.parent || allCategories.find((category) => category.id === parent.parentId) || null;

    return {
      mainCategory,
      subCategory: parent,
      categories: getThirdLevelCategories(parent.id),
    };
  }

  $: shopHeaderCategoryParam = $page.url.searchParams.get('category') ?? '';

  $: if (
    allCategories.length >= 0 &&
    shopHeaderCategoryParam !== undefined &&
    selectedCategory !== undefined
  ) {
    const nextHeaderState = resolveShopHeaderState(shopHeaderCategoryParam);
    shopHeaderMainCategory = nextHeaderState.mainCategory;
    shopHeaderSubCategory = nextHeaderState.subCategory;
    shopHeaderCategories = nextHeaderState.categories;
  }

  function getCategoryPath(category: Category): string {
    const path: string[] = [];
    let currentCategory: Category | undefined = category;
    while (currentCategory) {
      path.unshift(currentCategory.name);
      const parentCategoryId: string | undefined = currentCategory.parentId;
      if (parentCategoryId) {
        currentCategory = allCategories.find((c) => c.id === parentCategoryId);
      } else {
        break;
      }
    }
    return path.join(' > ');
  }

  async function extractFilterValues() {
    try {
      // Load a larger sample of products to extract filter values
      const sampleFilters: ProductFilters = {
        isActive: true,
      };

      if (selectedCategory) {
        sampleFilters.categoryId = selectedCategory;
      } else if (selectedMainCategory) {
        sampleFilters.categoryId = selectedMainCategory.id;
      }

      const sampleResponse = await productApi.getAll(1, 100, sampleFilters);
      const allProducts = sampleResponse.products;

      // Extract unique values, excluding hidden ones
      const colors = new Set<string>();
      const materials = new Set<string>();
      const countries = new Set<string>();
      const sizes = new Set<string>();

      allProducts.forEach((product) => {
        if (!product.hideColor && product.colors && product.colors.length > 0) {
          product.colors.forEach((c) => {
            if (c?.name) colors.add(c.name);
          });
        }
        if (product.material && !product.hideMaterial) {
          materials.add(product.material);
        }
        if (product.countryOfOrigin && !product.hideCountryOfOrigin) {
          countries.add(product.countryOfOrigin);
        }
        const productSizes = product.sizes;
        const simpleSizeGroups = [
          ...(productSizes?.CLOTHING ?? []),
          ...(productSizes?.SHOES ?? []),
          ...(productSizes?.VOLUME ?? []),
          ...(productSizes?.WEIGHT ?? []),
        ];

        for (const size of simpleSizeGroups) {
          const trimmedSize = String(size).trim();
          if (trimmedSize) {
            sizes.add(
              isInternationalClothingSize(trimmedSize)
                ? normalizeInternationalSize(trimmedSize)
                : trimmedSize
            );
          }
        }

        for (const size of productSizes?.CUSTOM ?? []) {
          const value = typeof size === 'object' && size?.value ? size.value : String(size);
          const trimmedSize = value.trim();
          if (trimmedSize) {
            sizes.add(trimmedSize);
          }
        }
      });

      availableColors = Array.from(colors).sort();
      availableMaterials = Array.from(materials).sort();
      availableCountries = Array.from(countries).sort();
      availableSizes = sortInternationalSizes(Array.from(sizes));
    } catch (e) {
      console.error('Failed to extract filter values:', e);
    }
  }

  async function loadProducts() {
    loading = true;
    try {
      const filters: ProductFilters = {
        isActive: true,
      };

      // Backend automatically includes all subcategories when filtering by categoryId
      if (selectedCategory) {
        filters.categoryId = selectedCategory;
      } else if (selectedMainCategory) {
        // If only main category is selected, use it (backend will include all subcategories)
        filters.categoryId = selectedMainCategory.id;
      }

      if (selectedBrand) filters.brandId = selectedBrand;
      const parsedMinPrice = parseOptionalPrice(minPrice);
      const parsedMaxPrice = parseOptionalPrice(maxPrice);
      if (parsedMinPrice !== undefined) filters.minPrice = parsedMinPrice;
      if (parsedMaxPrice !== undefined) filters.maxPrice = parsedMaxPrice;
      if (searchQuery) filters.search = searchQuery;
      if (selectedColor) filters.color = selectedColor;
      if (selectedMaterial) filters.material = selectedMaterial;
      if (selectedCountryOfOrigin) filters.countryOfOrigin = selectedCountryOfOrigin;
      if (selectedSize) filters.size = selectedSize;
      if (selectedInventoryStatus) filters.inventoryStatus = selectedInventoryStatus;

      const sort: ProductSort = {
        field: sortField,
        order: sortOrder,
      };

      async function loadAllProductsForViewAll() {
        const aggregatedProducts: Product[] = [];
        let pageToLoad = 1;
        let totalPagesToLoad = 1;
        let paginationTotal = 0;

        while (pageToLoad <= totalPagesToLoad) {
          const response = await productApi.getAll(pageToLoad, maxApiLimit, filters, sort, {
            imagesLimit: 2,
          });

          const normalizedBatch = (response.products ?? []).map((p) => ({
            ...p,
            images: Array.isArray(p.images) ? [...p.images] : [],
          }));

          aggregatedProducts.push(...normalizedBatch);
          paginationTotal = response.pagination.total;
          totalPagesToLoad = response.pagination.totalPages;

          if ((response.products?.length ?? 0) === 0) {
            break;
          }

          pageToLoad += 1;
        }

        return {
          products: aggregatedProducts,
          total: paginationTotal,
        };
      }

      console.log('Loading products with filters:', {
        categoryId: filters.categoryId,
        selectedCategory,
        selectedMainCategory: selectedMainCategory?.name,
        selectedSubCategory: selectedSubCategory?.name,
        filters,
        sort,
        viewAllMode,
      });

      let normalizedProducts: Product[] = [];
      let responseTotal = 0;
      let responseTotalPages = 1;

      if (viewAllMode) {
        const viewAllResponse = await loadAllProductsForViewAll();
        normalizedProducts = viewAllResponse.products;
        responseTotal = viewAllResponse.total;
      } else {
        const response = await productApi.getAll(currentPage, limit, filters, sort, {
          imagesLimit: 2,
        });
        normalizedProducts = (response.products ?? []).map((p) => ({
          ...p,
          images: Array.isArray(p.images) ? [...p.images] : [],
        }));
        responseTotal = response.pagination.total;
        responseTotalPages = response.pagination.totalPages;
      }

      products = normalizedProducts;
      total = responseTotal;
      totalPages = viewAllMode ? 1 : responseTotalPages;

      const withTwo = products.filter((p) => (p.images?.length ?? 0) >= 2);
      if (import.meta.env.DEV) {
        const firstName = withTwo.length > 0 ? withTwo[0].name : '';
        console.log(
          '[shop] Products with 2+ images:',
          withTwo.length,
          '/',
          products.length,
          firstName ? `first: ${firstName}` : ''
        );
      }

      // If the API returned only 1 image (old backend), load a larger slice via getById
      if (withTwo.length === 0 && products.length > 0) {
        const withImages = await Promise.all(
          products.map(async (p) => {
            try {
              const full = await productApi.getById(p.id);
              const imgs = Array.isArray(full?.product?.images)
                ? full.product.images.slice(0, 10)
                : (p.images ?? []);
              return { ...p, images: imgs };
            } catch {
              return p;
            }
          })
        );
        products = withImages;
      }

      // Reload wishlist status when products change
      await loadWishlistStatus();

      // Extract unique filter values from all products (load more products for accurate filters)
      await extractFilterValues();

      console.log('Products loaded:', {
        count: products.length,
        total,
        totalPages,
        viewAllMode,
      });
    } catch (e) {
      error = getErrorMessage(e);
      console.error('Failed to load products:', e);
    } finally {
      loading = false;
    }
  }

  function handlePageChange(event: CustomEvent<number>) {
    currentPage = event.detail;
    viewAllMode = false;
    loadProducts();
  }

  function handleViewAll() {
    viewAllMode = true;
    currentPage = 1;
    loadProducts();
  }

  // Watch for URL changes - only react when categories are loaded
  $: if (urlSyncReady && allCategories.length > 0) {
    const categoryParam = $page.url.searchParams.get('category') ?? '';
    if (categoryParam !== lastCategoryParam) {
      lastCategoryParam = categoryParam;
      applyCategoryFromUrl();
      loadProducts();
    }
  }

  $: if (allCategories.length > 0 && selectedCategory !== lastResolvedSelectedCategoryId) {
    lastResolvedSelectedCategoryId = selectedCategory;
    syncCategorySelectionState(selectedCategory);
  }

  // Also watch for search param changes
  $: if (urlSyncReady) {
    const searchParam = $page.url.searchParams.get('search') ?? '';
    if (searchParam !== lastSearchParam) {
      lastSearchParam = searchParam;
      searchQuery = searchParam;
      if (allCategories.length > 0) {
        loadProducts();
      }
    }
  }

  $: if (urlSyncReady) {
    const inventoryStatusParam = parseInventoryStatusParam(
      $page.url.searchParams.get('inventoryStatus')
    );
    if (inventoryStatusParam !== lastInventoryStatusParam) {
      lastInventoryStatusParam = inventoryStatusParam;
      selectedInventoryStatus = inventoryStatusParam;
      if (allCategories.length > 0) {
        loadProducts();
      }
    }
  }

  async function loadCategories() {
    const requestedLanguage = currentLanguage;
    try {
      // Load all categories (flat view) with current language
      const response = await categoryApi.getAll(false, true, false, requestedLanguage);
      allCategories = response.categories;
      categoriesLanguage = requestedLanguage;

      // Filter out Lookbook
      const shopCategories = allCategories.filter((c) => {
        const slugLower = c.slug?.toLowerCase() || '';
        const nameLower = c.name?.toLowerCase() || '';
        return slugLower !== 'lookbook' && nameLower !== 'lookbook';
      });

      // Main categories are those with isMain = true
      mainCategories = shopCategories.filter((c) => {
        if (c.isMain === true) return true;
        if (c.isMain === false) return false;
        // Fallback: if isMain doesn't exist, use parentId = null
        return !c.parentId;
      });

      mainCategories.sort((a, b) => a.name.localeCompare(b.name));

      console.log('Shop page - Loaded categories:', {
        total: allCategories.length,
        mainCategories: mainCategories.length,
        mainCategoryNames: mainCategories.map((c) => c.name),
      });
    } catch (e) {
      console.error('Failed to load categories:', e);
    }
  }

  async function loadBrands() {
    try {
      const response = await productApi.getBrands();
      brands = response.brands;
    } catch (e) {
      console.error('Failed to load brands:', e);
    }
  }

  function handleFilterChange() {
    currentPage = 1;
    viewAllMode = false;
    loadProducts();
  }

  function handleSortChange(event: CustomEvent<{ value: string | number }>) {
    if (event) {
      sortField = event.detail.value as 'price' | 'createdAt' | 'name';
    }
    loadProducts();
  }

  function handleFilterSidebarChange() {
    handleFilterChange();
  }

  function handleFilterSidebarSortChange(event: CustomEvent<{ value: string | number }>) {
    handleSortChange(event);
  }

  function closeMobileFilters() {
    mobileFiltersOpen = false;
  }

  function toggleMobileFilters() {
    mobileFiltersOpen = !mobileFiltersOpen;
  }

  async function addToCart(productId: string) {
    try {
      await cartStore.add(productId, 1);
      /* Cart drawer opens automatically via lastAddedToCartStore */
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : t('notification.failedToAddToBag');
      notificationStore.error(errorMessage);
    }
  }

  async function toggleWishlist(productId: string) {
    // Check if user is authenticated
    if (!$authStore.isAuthenticated) {
      notificationStore.error(t('wishlist.loginToAdd'));
      goto('/login');
      return;
    }

    // Check if wishlist is enabled
    if (!$settingsStore.wishlistEnabled) {
      notificationStore.error(t('wishlist.wishlistDisabled'));
      return;
    }

    wishlistLoading.add(productId);
    wishlistLoading = wishlistLoading; // Trigger reactivity

    try {
      const isInWishlist = wishlistItems.has(productId);

      if (isInWishlist) {
        await customerApi.removeFromWishlist(productId);
        wishlistItems.delete(productId);
        notificationStore.success(t('wishlist.removedFromWishlist'));
      } else {
        await customerApi.addToWishlist(productId);
        wishlistItems.add(productId);
        notificationStore.success(t('wishlist.addedToWishlist'));
      }

      wishlistItems = wishlistItems; // Trigger reactivity
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to update wishlist';
      notificationStore.error(errorMessage);
    } finally {
      wishlistLoading.delete(productId);
      wishlistLoading = wishlistLoading; // Trigger reactivity
    }
  }

  async function loadWishlistStatus() {
    if (!$authStore.isAuthenticated || !$settingsStore.wishlistEnabled) {
      return;
    }

    try {
      const response = await customerApi.getWishlist();
      wishlistItems = new Set(response.items.map((item) => item.productId));
    } catch (e) {
      console.error('Failed to load wishlist status:', e);
    }
  }

  // Reload categories when language changes (but not on initial mount)
  $: if (currentLanguage) {
    // SSR cannot read the language stored in localStorage, so +page.ts initially
    // renders the default language. Refresh that data after hydration as well as
    // on subsequent language changes.
    const categoriesUseAnotherLanguage =
      allCategories.length > 0 && categoriesLanguage !== currentLanguage;
    const languageChanged =
      !!previousLanguage && previousLanguage !== currentLanguage && allCategories.length > 0;

    if (categoriesUseAnotherLanguage || languageChanged) {
      loadCategories().then(() => {
        // Reapply category from URL after reload
        applyCategoryFromUrl();
        loadProducts();
      });
    }
    previousLanguage = currentLanguage;
  }

  // Shop page design from settings
  $: shopGridColumns = $settingsStore.shopGridColumns ?? '4';
  $: shopGridGap = $settingsStore.shopGridGap ?? '6';
  $: shopCardAspectRatio = $settingsStore.shopCardAspectRatio ?? '9/16';
  $: shopCardHoverImage = $settingsStore.shopCardHoverImage ?? true;
  $: shopCardHoverAnimation = $settingsStore.shopCardHoverAnimation ?? 'scale';
  $: shopCardVideoSupport = $settingsStore.shopCardVideoSupport ?? true;
  $: shopCardShowQuickAdd = $settingsStore.shopCardShowQuickAdd ?? false;
  $: shopHeaderStyle = $settingsStore.shopHeaderStyle ?? 'plain';
  $: shopHeaderSpacing = $settingsStore.shopHeaderSpacing ?? 'comfortable';
  $: shopHeaderTitleScale = $settingsStore.shopHeaderTitleScale ?? 'hero';
  $: shopHeaderAlignment = $settingsStore.shopHeaderAlignment ?? 'center';
  $: shopHeaderShowBreadcrumbs = $settingsStore.shopHeaderShowBreadcrumbs ?? true;
  $: shopHeaderShowTitle = $settingsStore.shopHeaderShowTitle ?? true;
  $: shopHeaderShowCategories = $settingsStore.shopHeaderShowCategories ?? true;
  $: shopHeaderShowCount = $settingsStore.shopHeaderShowCount ?? true;
  $: shopHeaderShowSideMenuTab = $settingsStore.shopHeaderShowSideMenuTab ?? false;
  $: shopHeaderCategoryLimit =
    Number.parseInt($settingsStore.shopHeaderCategoryLimit ?? '8', 10) || 8;
  // This is a system control, so its label follows the active UI locale.
  // The old single-language shopMenuLabel setting must not override i18n.
  $: shopMenuLabel = tLang('shop.menu', currentLanguage);
  $: shopToolbarStyle = $settingsStore.shopToolbarStyle ?? 'minimal';
  $: shopToolbarCorners = $settingsStore.shopToolbarCorners ?? 'square';
  $: shopToolbarDensity = $settingsStore.shopToolbarDensity ?? 'comfortable';
  $: quickViewEnabled = $settingsStore.quickViewEnabled ?? true;
  // Quick View modal: use global product image aspect ratio (admin → Product Page Design)
  $: quickViewAspectRatio = $settingsStore.productImageAspectRatio || '3/4';
  $: quickViewAspectStyle = quickViewAspectRatio.includes('/')
    ? `aspect-ratio: ${quickViewAspectRatio};`
    : 'aspect-ratio: 3 / 4;';

  const gridColsClassMap: Record<string, string> = {
    '2': 'grid-cols-1 sm:grid-cols-2',
    '3': 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3',
    '4': 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4',
    '5': 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-5',
    '6': 'grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 2xl:grid-cols-6',
  };
  const gridGapClassMap: Record<string, string> = {
    '2': 'gap-2',
    '4': 'gap-4',
    '6': 'gap-6',
    '8': 'gap-8',
  };
  const headerWrapperClassMap: Record<string, string> = {
    plain: '',
    card: 'border border-accent/15 bg-background shadow-sm',
    soft: 'bg-background-secondary',
  };
  const headerSpacingClassMap: Record<string, string> = {
    compact: 'py-5 space-y-5',
    comfortable: 'py-8 space-y-7',
    airy: 'py-10 space-y-9',
  };
  const headerTitleScaleClassMap: Record<string, string> = {
    medium: 'text-3xl md:text-4xl',
    large: 'text-4xl md:text-5xl',
    hero: 'text-5xl md:text-7xl',
  };
  const headerAlignmentClassMap: Record<string, string> = {
    left: 'text-left',
    center: 'text-center',
  };
  const headerCategoriesJustifyClassMap: Record<string, string> = {
    left: 'justify-start',
    center: 'justify-center',
  };
  const toolbarWrapperClassMap: Record<string, string> = {
    minimal: '',
    boxed: 'rounded-[28px] border border-accent/15 bg-background-secondary px-4 py-4 shadow-sm',
    soft: 'rounded-[32px] bg-background-secondary px-4 py-4',
  };
  const toolbarControlStyleClassMap: Record<string, string> = {
    minimal: 'border border-accent/20 bg-background text-accent',
    boxed: 'border border-accent/15 bg-background text-accent shadow-sm',
    soft: 'border border-transparent bg-background text-accent',
  };
  const toolbarChipStyleClassMap: Record<string, string> = {
    minimal: 'border-accent/20 bg-background text-accent',
    boxed: 'border-accent/15 bg-background text-accent shadow-sm',
    soft: 'border-transparent bg-background text-accent',
  };
  const toolbarCornerClassMap: Record<string, string> = {
    square: 'rounded-none',
    rounded: 'rounded-xl',
    pill: 'rounded-full',
  };
  const toolbarDensityClassMap: Record<string, string> = {
    compact: 'px-3 py-2 text-xs',
    comfortable: 'px-4 py-2.5 text-sm',
    airy: 'px-5 py-3 text-sm',
  };
  $: shopGridClass = `grid ${gridColsClassMap[shopGridColumns] || gridColsClassMap['4']} ${gridGapClassMap[shopGridGap] || 'gap-6'} mb-12`;
  $: shopHeaderWrapperClass = headerWrapperClassMap[shopHeaderStyle] || headerWrapperClassMap.plain;
  $: shopHeaderSpacingClass =
    headerSpacingClassMap[shopHeaderSpacing] || headerSpacingClassMap.comfortable;
  $: shopHeaderTitleScaleClass =
    headerTitleScaleClassMap[shopHeaderTitleScale] || headerTitleScaleClassMap.hero;
  $: shopHeaderAlignmentClass =
    headerAlignmentClassMap[shopHeaderAlignment] || headerAlignmentClassMap.center;
  $: shopHeaderCategoriesJustifyClass =
    headerCategoriesJustifyClassMap[shopHeaderAlignment] || headerCategoriesJustifyClassMap.center;
  $: shopToolbarWrapperClass =
    toolbarWrapperClassMap[shopToolbarStyle] || toolbarWrapperClassMap.minimal;
  $: shopToolbarControlClass =
    toolbarControlStyleClassMap[shopToolbarStyle] || toolbarControlStyleClassMap.minimal;
  $: shopToolbarChipClass =
    toolbarChipStyleClassMap[shopToolbarStyle] || toolbarChipStyleClassMap.minimal;
  $: shopToolbarCornerClass =
    toolbarCornerClassMap[shopToolbarCorners] || toolbarCornerClassMap.square;
  $: shopToolbarDensityClass =
    toolbarDensityClassMap[shopToolbarDensity] || toolbarDensityClassMap.comfortable;

  function isVideoUrl(url: string): boolean {
    if (!url) return false;
    const u = url.toLowerCase();
    return u.includes('.mp4') || u.includes('.webm') || u.includes('.mov') || u.includes('video/');
  }
</script>

<main class="min-h-screen bg-white relative">
  <div class="container-custom py-1 relative flex">
    <!-- Filter Sidebar (Mobile & Desktop) - Only render when filters are enabled -->
    {#if $settingsStore.filtersEnabled || $settingsStore.searchEnabled}
      <FilterSidebar
        categories={allCategories}
        {brands}
        bind:selectedCategory
        bind:selectedBrand
        bind:minPrice
        bind:maxPrice
        bind:searchQuery
        bind:selectedColor
        bind:selectedMaterial
        bind:selectedCountryOfOrigin
        bind:selectedSize
        bind:selectedInventoryStatus
        {availableColors}
        {availableMaterials}
        {availableCountries}
        {availableSizes}
        bind:sortField
        open={mobileFiltersOpen}
        mobile={true}
        on:filterChange={handleFilterSidebarChange}
        on:sortChange={handleFilterSidebarSortChange}
        on:close={closeMobileFilters}
      />
    {/if}

    <!-- Main Content Area -->
    <div
      class="flex-1 transition-all duration-[400ms] ease-in-out {mobileFiltersOpen
        ? 'md:ml-40'
        : ''}"
    >
      <div
        class="{shopHeaderWrapperClass} {shopToolbarCornerClass} {shopHeaderSpacingClass} {shopHeaderAlignmentClass} mb-8"
      >
        <!-- Breadcrumbs -->
        {#if shopHeaderShowBreadcrumbs}
          <nav class="text-sm text-accent-muted">
            <a href="/" class="hover:text-accent transition-colors">{t('common.home')}</a>
            {#if shopHeaderMainCategory}
              <span class="mx-2">></span>
              <a
                href="/shop?category={shopHeaderMainCategory.slug}"
                class="hover:text-accent transition-colors"
              >
                {shopHeaderMainCategory.name}
              </a>
              {#if shopHeaderSubCategory}
                <span class="mx-2">></span>
                <span class="text-accent">{shopHeaderSubCategory.name}</span>
              {/if}
            {:else}
              <span class="mx-2">></span>
              <span class="text-accent">{t('shop.title')}</span>
            {/if}
          </nav>
        {/if}

        <!-- Page Title -->
        {#if shopHeaderShowTitle}
          <h1
            class="font-bold text-accent leading-none tracking-[-0.04em] {shopHeaderTitleScaleClass}"
          >
            {#if shopHeaderSubCategory}
              {shopHeaderSubCategory.name}
            {:else if shopHeaderMainCategory}
              {shopHeaderMainCategory.name}
            {/if}
          </h1>
        {/if}

        <!-- Filters Row -->
        {#if (shopHeaderShowCategories && shopHeaderCategories.length > 0) || (shopHeaderShowSideMenuTab && ($settingsStore.filtersEnabled || $settingsStore.searchEnabled))}
          <div class="pb-2">
            <div class="flex items-start gap-3">
              {#if shopHeaderShowSideMenuTab && ($settingsStore.filtersEnabled || $settingsStore.searchEnabled)}
                <button
                  type="button"
                  on:click={toggleMobileFilters}
                  class="shrink-0 inline-flex items-center justify-center whitespace-nowrap border border-black bg-white px-4 py-2 text-sm font-medium text-black transition-colors hover:bg-gray-50 {shopToolbarCornerClass}"
                  aria-label={shopMenuLabel}
                >
                  {shopMenuLabel}
                </button>
              {/if}

              {#if shopHeaderShowCategories && shopHeaderCategories.length > 0}
                <div class="min-w-0 flex-1">
                  <div
                    class="flex flex-wrap items-center gap-2 md:gap-3 {shopToolbarWrapperClass} {shopHeaderCategoriesJustifyClass}"
                  >
                    {#key `${$page.url.searchParams.get('category') ?? ''}:${shopHeaderCategories.map((category) => category.id).join(',')}`}
                      {#each shopHeaderCategories.slice(0, shopHeaderCategoryLimit) as category}
                      <a
                        href="/shop?category={category.slug}"
                        class="border hover:border-accent transition-colors whitespace-nowrap {shopToolbarCornerClass} {shopToolbarDensityClass} {selectedCategory ===
                        category.id
                          ? 'border-accent bg-accent text-dark'
                          : shopToolbarChipClass}"
                      >
                        {category.name}
                      </a>
                      {/each}
                    {/key}
                  </div>
                </div>
              {/if}

              {#if shopHeaderShowSideMenuTab && shopHeaderAlignment === 'center'}
                <div
                  class="shrink-0 invisible inline-flex items-center justify-center whitespace-nowrap border border-black px-4 py-2 text-sm font-medium {shopToolbarCornerClass}"
                  aria-hidden="true"
                >
                  {shopMenuLabel}
                </div>
              {/if}
            </div>
          </div>
        {/if}

        {#if shopHeaderShowCount && !loading && !error}
          <div>
            <p class="text-sm text-accent-muted">
              {total === 1
                ? t('shop.foundProductsSingular', { total })
                : t('shop.foundProducts', { total })}
            </p>
          </div>
        {/if}
      </div>

      <!-- Products Content -->
      <div>
        <!-- Products Grid -->
        {#if loading}
          <div class="flex items-center justify-center py-20">
            <div class="w-full">
              <!-- Skeleton loader for the shop page -->
              <div class="animate-pulse">
                <div class="h-6 bg-gray-200 rounded w-48 mb-6"></div>
                <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-6">
                  {#each Array(8) as _}
                    <div class="space-y-3">
                      <div class="aspect-[9/16] bg-gray-200 rounded"></div>
                      <div class="h-4 bg-gray-200 rounded w-3/4"></div>
                      <div class="h-4 bg-gray-200 rounded w-1/2"></div>
                    </div>
                  {/each}
                </div>
              </div>
            </div>
          </div>
        {:else if error}
          <div class="flex items-center justify-center py-20">
            <p class="text-red-600">{t('common.error')}: {error}</p>
          </div>
        {:else if products.length === 0}
          <div class="flex items-center justify-center py-20">
            <p class="text-gray-600">{t('shop.noProductsFound')}</p>
          </div>
        {:else}
          <div class={shopGridClass}>
            {#each products as product, index}
              {@const isCardHovered = hoveredCardIndex === index}
              {@const images = Array.isArray(product.images) ? product.images : []}
              {@const hasSecondImage = images.length > 1 && shopCardHoverImage}
              {@const secondImageUrl = hasSecondImage && images[1] ? images[1].url : ''}
              {@const secondImageLoaded = secondImageUrl
                ? getSecondaryMediaStatus(secondaryMediaStatusByKey, product.id, secondImageUrl) ===
                  'loaded'
                : false}
              {@const showSecondImage = hasSecondImage && isCardHovered && secondImageLoaded}
              {@const selectedImageIndex = getCardImageIndex(product.id, images.length)}
              {@const selectedImage = images[selectedImageIndex]}
              {@const primaryImageLoading = getCatalogPrimaryImageLoading(index)}
              <a
                href="/shop/product/{product.slug}"
                class="group block"
                on:mouseenter={() => (hoveredCardIndex = index)}
                on:mouseleave={() => (hoveredCardIndex = null)}
                on:click={(event) => handleCardClick(product.id, event)}
              >
                <div
                  class="bg-gray-100 overflow-hidden mb-3 relative shop-card-image-wrap"
                  style="aspect-ratio: {shopCardAspectRatio};"
                  role="presentation"
                  on:touchstart={(event) => handleCardTouchStart(product.id, event)}
                  on:touchend={(event) => handleCardTouchEnd(product.id, images.length, event)}
                >
                  {#if images.length > 0}
                    {#if shopCardVideoSupport && selectedImage && isVideoUrl(selectedImage.url)}
                      <video
                        src={resolveStorefrontMediaSrc(selectedImage.url)}
                        class="w-full h-full object-cover {shopCardHoverAnimation === 'scale' &&
                        selectedImageIndex === 0
                          ? 'group-hover:scale-105 transition-transform duration-300'
                          : ''}"
                        muted
                        loop
                        playsinline
                        autoplay
                      ></video>
                    {:else}
                      <!-- First image: hide on hover when second exists -->
                      <div
                        class="shop-card-first-img absolute inset-0 z-0 transition-opacity duration-300 ease-in-out {hasSecondImage
                          ? 'has-second-img'
                          : ''} {!hasSecondImage && shopCardHoverAnimation === 'scale'
                          ? 'transition-transform duration-300 group-hover:scale-105'
                          : ''}"
                        style={hasSecondImage && showSecondImage ? 'opacity: 0;' : ''}
                      >
                        <BlurredImage
                          src={selectedImage?.url ?? images[0].url}
                          alt={getProductImageAlt(selectedImage?.alt, product.name)}
                          className="w-full h-full object-cover {!hasSecondImage &&
                          shopCardHoverAnimation === 'scale' &&
                          selectedImageIndex === 0
                            ? 'group-hover:scale-105'
                            : ''}"
                          eager={primaryImageLoading.eager}
                          loading={primaryImageLoading.loading}
                          fetchPriority={primaryImageLoading.fetchPriority}
                          catalogQueue={true}
                          catalogQueuePriority={primaryImageLoading.eager ? 'high' : 'normal'}
                        />
                      </div>
                      {#if hasSecondImage && images[1] && isCardHovered}
                        <div
                          class="shop-card-second-img absolute inset-0 pointer-events-none"
                          style={showSecondImage ? 'opacity: 1 !important;' : ''}
                        >
                          <BlurredImage
                            src={images[1].url}
                            alt={getProductImageAlt(images[1].alt, product.name)}
                            className="w-full h-full object-cover"
                            loading="eager"
                            fetchPriority="low"
                            on:loadstatechange={(event) =>
                              handleSecondaryMediaStateChange(product.id, images[1].url, event)}
                          />
                        </div>
                      {/if}
                    {/if}
                  {:else}
                    <div class="w-full h-full flex items-center justify-center">
                      <p class="text-gray-400">{t('order.noImage')}</p>
                    </div>
                  {/if}
                  {#if images.length > 1}
                    <div class="absolute inset-x-0 bottom-2 z-[5] flex justify-center gap-1.5 px-3 sm:hidden pointer-events-none">
                      {#each images as _, imageIndex}
                        <span
                          class="h-1.5 rounded-full bg-white/60 transition-all duration-200 {imageIndex === selectedImageIndex
                            ? 'w-4 bg-white'
                            : 'w-1.5'}"
                        ></span>
                      {/each}
                    </div>
                  {/if}
                  {#if quickViewEnabled}
                    <button
                      type="button"
                      class="absolute bottom-2 left-2 right-2 py-2 bg-white/90 text-black text-sm font-medium opacity-0 group-hover:opacity-100 transition-opacity z-10"
                      on:click|preventDefault|stopPropagation={() => (quickViewProduct = product)}
                    >
                      {t('shop.quickView')}
                    </button>
                  {/if}
                </div>
                <h3 class="text-sm font-medium mb-1 text-black group-hover:underline">
                  {product.name}
                </h3>
                <div class="flex items-center gap-2 mb-3">
                  {#if product.priceOnRequest || product.price == null}
                    <p class="text-sm font-medium text-black">
                      {t('product.priceOnRequest') || 'Price on request'}
                    </p>
                  {:else}
                    <p class="text-sm font-medium text-black">{formatPrice(product.price)}</p>
                    {#if product.compareAtPrice && toPriceNumber(product.compareAtPrice) > toPriceNumber(product.price)}
                      <p class="text-sm text-gray-500 line-through">
                        {formatPrice(product.compareAtPrice)}
                      </p>
                    {/if}
                  {/if}
                </div>
                <div class="flex flex-col gap-2">
                  <button
                    on:click|stopPropagation={(e) => {
                      e.preventDefault();
                      addToCart(product.id);
                    }}
                    class="w-full py-2 bg-black text-white font-medium hover:bg-gray-800 transition-colors text-sm {shopCardShowQuickAdd
                      ? 'opacity-0 group-hover:opacity-100 transition-opacity'
                      : 'hidden'}"
                  >
                    Add to bag
                  </button>
                </div>
              </a>
            {/each}
          </div>

          <!-- Pagination -->
          {#if !viewAllMode && totalPages > 1}
            <div class="flex items-center justify-center mt-12">
              <Pagination
                {currentPage}
                {totalPages}
                showViewAll={true}
                on:pageChange={handlePageChange}
                on:viewAll={handleViewAll}
              />
            </div>
          {:else if viewAllMode}
            <div class="flex items-center justify-center mt-12">
              <button
                on:click={() => {
                  viewAllMode = false;
                  currentPage = 1;
                  loadProducts();
                }}
                class="px-4 py-1 text-sm text-black hover:underline transition-all"
              >
                Show Pagination
              </button>
            </div>
          {/if}
        {/if}
      </div>
    </div>
  </div>

  <!-- Quick View modal (when Settings → Quick View is enabled) -->
  {#if quickViewProduct}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-view-title"
    >
      <button
        type="button"
        class="absolute inset-0 h-full w-full cursor-default bg-transparent"
        aria-hidden="true"
        tabindex="-1"
        on:click={() => (quickViewProduct = null)}
      ></button>
      <div
        class="relative z-10 bg-white max-w-md w-full max-h-[90vh] overflow-auto rounded shadow-xl flex flex-col"
        role="document"
      >
        <div class="shrink-0 p-4 flex justify-end">
          <button
            type="button"
            class="p-2 text-gray-500 hover:text-black"
            aria-label="Close"
            on:click={() => (quickViewProduct = null)}
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
        </div>
        <div class="px-4 pb-6 flex-1 min-h-0 overflow-auto">
          {#if quickViewProduct.images && quickViewProduct.images.length > 0}
            <div class="mb-4 bg-gray-100 rounded overflow-hidden" style={quickViewAspectStyle}>
              <BlurredImage
                src={quickViewProduct.images[0].url}
                alt={getProductImageAlt(quickViewProduct.images[0].alt, quickViewProduct.name)}
                className="w-full h-full object-cover"
                eager={true}
              />
            </div>
          {/if}
          <h2 id="quick-view-title" class="text-lg font-medium text-black mb-2">
            {quickViewProduct.name}
          </h2>
          <div class="flex items-center gap-2 mb-4">
            <p class="text-base font-medium text-black">
              {formatPrice(quickViewProduct.price ?? 0)}
            </p>
            {#if quickViewProduct.compareAtPrice != null && quickViewProduct.price != null && Number(quickViewProduct.compareAtPrice) > Number(quickViewProduct.price)}
              <p class="text-sm text-gray-500 line-through">
                {formatPrice(quickViewProduct.compareAtPrice)}
              </p>
            {/if}
          </div>
          <div class="flex flex-col gap-2">
            <button
              type="button"
              class="w-full py-3 bg-black text-white font-medium hover:bg-gray-800 transition-colors"
              on:click={() => {
                const p = quickViewProduct;
                if (p) {
                  addToCart(p.id);
                  quickViewProduct = null;
                }
              }}
            >
              Add to bag
            </button>
            <a
              href="/shop/product/{quickViewProduct?.slug ?? ''}"
              class="block text-center py-2 text-black underline hover:no-underline text-sm"
            >
              {t('shop.viewFullDetails')}
            </a>
          </div>
        </div>
      </div>
    </div>
  {/if}
</main>

<style>
  .scrollbar-hide {
    -ms-overflow-style: none;
    scrollbar-width: none;
  }
  .scrollbar-hide::-webkit-scrollbar {
    display: none;
  }
  /* Second image on hover: only through this block, without Tailwind */
  :global(.shop-card-image-wrap) {
    isolation: isolate;
  }
  :global(.shop-card-second-img) {
    opacity: 0 !important;
    z-index: 2;
    transition: opacity 0.3s ease-in-out;
  }
  :global(.shop-card-first-img.has-second-img) {
    transition: opacity 0.3s ease-in-out;
  }
</style>
