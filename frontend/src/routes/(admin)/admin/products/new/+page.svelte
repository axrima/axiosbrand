<script lang="ts">
  import { onMount } from 'svelte';
  import { adminApi, type Warehouse, type InventoryStatus } from '$lib/api/admin.api';
  import {
    productApi,
    type Category,
    type Brand,
    type ProductType,
    type ProductColor,
    type ProductSizes,
    type Product,
    type ProductVariant,
  } from '$lib/api/product.api';
  import { categoryApi } from '$lib/api/category.api';
  import { goto } from '$app/navigation';
  import { t } from '$lib/utils/i18n';
  import {
    createCustomSizeEntry,
    getCustomSizeDisplayLabel,
    type CustomSizeEntry,
  } from '$lib/utils/size.utils';
  import {
    applyCatalogColorHex,
    findCatalogColorByName,
    findCatalogCountry,
  } from '$lib/utils/product-catalog-hints';
  import { getErrorMessage } from '$lib/utils/error-handler';
  import { normalizeUploadFiles } from '$lib/utils/file-upload';
  import { notificationStore } from '$lib/stores/notification.store';
  import { settingsStore } from '$lib/stores/settings.store';

  let loading = false;
  let error = '';
  let mainCategories: Category[] = [];
  let allCategories: Category[] = [];
  let brands: Brand[] = [];
  let warehouses: Warehouse[] = [];
  let selectedWarehouseId = '';
  let warehouseQuantity = 0;
  let warehouseStatus: InventoryStatus = 'AWAITING_RECEIPT';

  // Stock by size management
  let stockBySize: Record<string, number> = {}; // size -> quantity
  let stockBySizeStatus: Record<string, InventoryStatus> = {}; // size -> status

  // Status labels will be translated in the select options
  const statusLabels: Record<InventoryStatus, string> = {
    AWAITING_RECEIPT: 'Awaiting Receipt',
    RECEIVED: 'Received',
    IN_SALE: 'In Sale',
    COMING_SOON: 'Coming Soon',
    RESERVED: 'Reserved',
    IN_DELIVERY: 'In Delivery',
    DELIVERED: 'Delivered',
    RETURNED: 'Returned',
    OUT_OF_STOCK: 'Out of Stock',
  };

  const statusOptions = Object.entries(statusLabels).map(([value, label]) => ({
    value: value as InventoryStatus,
    label,
  }));

  let product = {
    name: '',
    slug: '',
    description: '',
    sku: '',
    price: undefined as number | undefined,
    compareAtPrice: undefined as number | undefined,
    priceOnRequest: false,
    categoryId: '',
    brandId: undefined as string | undefined,
    isActive: true,
    isFeatured: false,
    productTypes: [] as ProductType[],
    sizes: {} as ProductSizes,
    colors: [] as ProductColor[],
    material: '',
    lining: '',
    application: '',
    countryOfOrigin: '',
    hideColor: true,
    hideMaterial: true,
    hideLining: true,
    hideCountryOfOrigin: true,
    relatedProducts: [] as string[],
    showCompleteTheLook: true,
    // SEO fields - not visible on product page but used for search engines
    metaTitle: '',
    metaDescription: '',
    metaKeywords: '',
    // Shipping (weight & dimensions per unit)
    weightNet: undefined as number | undefined,
    weightGross: undefined as number | undefined,
    lengthCm: undefined as number | undefined,
    widthCm: undefined as number | undefined,
    heightCm: undefined as number | undefined,
  };

  // Size management - separate for each type
  let clothingSizes = ['XS', 'S', 'M', 'L', 'XL', 'XXL', 'XXXL'];
  let shoeSizes = ['35', '36', '37', '38', '39', '40', '41', '42', '43', '44', '45', '46', '47'];
  let volumeSizes = ['30', '50', '100', '200', '500'];
  let weightSizes = ['50', '100', '200', '500'];
  let customSizeLine = '';
  let customSizeWidthCm = '';
  let customSizeHeightCm = '';
  let selectedClothingSizes: string[] = [];
  let selectedShoeSizes: string[] = [];
  let selectedVolumeSizes: string[] = [];
  let selectedWeightSizes: string[] = [];
  let customVolumeSizes: string[] = []; // user-entered ml values
  let customWeightSizes: string[] = []; // user-entered g values
  let customVolumeValue = '';
  let customWeightValue = '';
  let customSizes: CustomSizeEntry[] = [];

  // Color management
  let newColorName = '';
  let newColorHex = '#000000';
  let catalogColors: ProductColor[] = [];
  let catalogCountries: string[] = [];

  $: colorCatalogMatch = findCatalogColorByName(newColorName, catalogColors);
  $: countryCatalogMatch = findCatalogCountry(product.countryOfOrigin, catalogCountries);
  $: colorAlreadyOnProduct =
    !!colorCatalogMatch &&
    product.colors.some(
      (c) => c.name.trim().toLowerCase() === colorCatalogMatch!.name.trim().toLowerCase()
    );

  // Complete the look - related products
  let relatedProductsSearchQuery = '';
  let relatedProductsSearchResults: Product[] = [];
  let relatedProductsSearchLoading = false;
  let relatedProductsSearchTimeout: ReturnType<typeof setTimeout> | null = null;
  let selectedRelatedProducts: Product[] = []; // Full product info for selected items

  let selectedMainCategoryId = '';
  let selectedSubcategoryId = '';
  let images: File[] = [];

  // Form sub-tabs
  type FormTabId = 'basic' | 'images' | 'warehouse' | 'seo' | 'shipping';
  let formTab: FormTabId = 'basic';
  let imagePreviews: string[] = [];
  let isDragging = false;
  let fileInputRef: HTMLInputElement | null = null;

  $: subcategories = selectedMainCategoryId
    ? allCategories.filter((cat) => cat.parentId === selectedMainCategoryId)
    : [];

  $: subSubcategories = selectedSubcategoryId
    ? allCategories.filter((cat) => cat.parentId === selectedSubcategoryId)
    : [];

  // Check if brands feature is enabled
  let brandsEnabled = true;
  settingsStore.subscribe((settings) => {
    brandsEnabled = settings.brandsEnabled;
  });

  // Update sizes object based on selected product types
  $: {
    const sizesObj: ProductSizes = {};
    if (product.productTypes.includes('CLOTHING') && selectedClothingSizes.length > 0) {
      sizesObj.CLOTHING = selectedClothingSizes;
    }
    if (product.productTypes.includes('SHOES') && selectedShoeSizes.length > 0) {
      sizesObj.SHOES = selectedShoeSizes;
    }
    if (product.productTypes.includes('CUSTOM') && customSizes.length > 0) {
      sizesObj.CUSTOM = customSizes.map((s) => ({
        value: s.value.trim(),
        label: getCustomSizeDisplayLabel(s).trim(),
      }));
    }
    if (
      product.productTypes.includes('VOLUME') &&
      (selectedVolumeSizes.length > 0 || customVolumeSizes.length > 0)
    ) {
      sizesObj.VOLUME = [...new Set([...selectedVolumeSizes, ...customVolumeSizes])];
    }
    if (
      product.productTypes.includes('WEIGHT') &&
      (selectedWeightSizes.length > 0 || customWeightSizes.length > 0)
    ) {
      sizesObj.WEIGHT = [...new Set([...selectedWeightSizes, ...customWeightSizes])];
    }
    product.sizes = sizesObj;

    // Initialize stock by size when sizes change
    if (selectedWarehouseId) {
      const allSizes: string[] = [];
      if (sizesObj.CLOTHING) allSizes.push(...sizesObj.CLOTHING);
      if (sizesObj.SHOES) allSizes.push(...sizesObj.SHOES);
      if (sizesObj.CUSTOM) allSizes.push(...sizesObj.CUSTOM.map((s) => s.value));
      if (sizesObj.VOLUME) allSizes.push(...sizesObj.VOLUME);
      if (sizesObj.WEIGHT) allSizes.push(...sizesObj.WEIGHT);

      allSizes.forEach((size) => {
        if (!(size in stockBySize)) {
          stockBySize[size] = 0;
          stockBySizeStatus[size] = 'AWAITING_RECEIPT';
        }
      });
    }
  }

  onMount(async () => {
    await Promise.all([loadCategories(), loadBrands(), loadWarehouses(), loadCatalogAttributes()]);
  });

  async function loadCatalogAttributes() {
    try {
      const data = await productApi.getCatalogAttributes();
      catalogColors = data.colors ?? [];
      catalogCountries = data.countries ?? [];
    } catch (e) {
      console.warn('Failed to load catalog attributes', e);
    }
  }

  function syncColorHexFromCatalog() {
    const hex = applyCatalogColorHex(newColorName, catalogColors);
    if (hex) newColorHex = hex;
  }

  async function loadCategories() {
    try {
      // Load all categories in flat format first
      const allResponse = await categoryApi.getAll(false, true, false);
      allCategories = allResponse.categories || [];
      console.log('All categories loaded:', allCategories.length);

      // Load main categories (Men/Women) - categories with isMain=true
      try {
        const mainResponse = await categoryApi.getAll(false, false, true);
        mainCategories = mainResponse.categories || [];
        console.log('Main categories loaded:', mainCategories.length);
      } catch (mainError) {
        console.warn('Failed to load main categories, using fallback:', mainError);
        mainCategories = [];
      }

      // If no main categories found, use top-level categories (without parentId) as main categories
      if (mainCategories.length === 0 && allCategories.length > 0) {
        mainCategories = allCategories.filter((cat) => !cat.parentId);
        console.log('Using top-level categories as main:', mainCategories.length);
      }

      // If still no categories, try loading without flat parameter
      if (mainCategories.length === 0 && allCategories.length === 0) {
        console.log('No categories found, trying alternative load...');
        const altResponse = await categoryApi.getAll(false, false, false);
        allCategories = altResponse.categories || [];
        mainCategories = allCategories.filter((cat) => !cat.parentId);
        console.log('Alternative load result:', {
          all: allCategories.length,
          main: mainCategories.length,
        });
      }
    } catch (e) {
      console.error('Failed to load categories:', e);
      error = `Failed to load categories: ${e instanceof Error ? e.message : 'Unknown error'}`;
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

  async function loadWarehouses() {
    try {
      const response = await adminApi.getAllWarehouses();
      warehouses = response.warehouses;
    } catch (e) {
      console.error('Failed to load warehouses:', e);
    }
  }

  function handleImageSelect(event: Event) {
    const target = event.target as HTMLInputElement;
    if (target.files) {
      const newFiles = Array.from(target.files);
      processFiles(newFiles);
    }
  }

  function processFiles(files: File[]) {
    const validFiles = normalizeUploadFiles(
      files.filter((file) => {
        const isImage = file.type.startsWith('image/');
        const isVideo = file.type.startsWith('video/');
        return isImage || isVideo;
      })
    );

    images = [...images, ...validFiles];

    validFiles.forEach((file) => {
      const reader = new FileReader();
      reader.onload = (e) => {
        if (e.target?.result) {
          imagePreviews = [...imagePreviews, e.target.result as string];
        }
      };
      reader.readAsDataURL(file);
    });
  }

  function handleDragOver(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    isDragging = true;
  }

  function handleDragLeave(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    isDragging = false;
  }

  function handleDrop(event: DragEvent) {
    event.preventDefault();
    event.stopPropagation();
    isDragging = false;

    if (event.dataTransfer?.files) {
      const files = Array.from(event.dataTransfer.files);
      processFiles(files);
    }
  }

  function openFileDialog() {
    if (fileInputRef) {
      fileInputRef.click();
    }
  }

  function removeImage(index: number) {
    images = images.filter((_, i) => i !== index);
    imagePreviews = imagePreviews.filter((_, i) => i !== index);
  }

  function moveImage(index: number, direction: 'up' | 'down') {
    if (direction === 'up' && index > 0) {
      [images[index], images[index - 1]] = [images[index - 1], images[index]];
      [imagePreviews[index], imagePreviews[index - 1]] = [
        imagePreviews[index - 1],
        imagePreviews[index],
      ];
    } else if (direction === 'down' && index < images.length - 1) {
      [images[index], images[index + 1]] = [images[index + 1], images[index]];
      [imagePreviews[index], imagePreviews[index + 1]] = [
        imagePreviews[index + 1],
        imagePreviews[index],
      ];
    }
  }

  function toggleClothingSize(size: string) {
    if (selectedClothingSizes.includes(size)) {
      selectedClothingSizes = selectedClothingSizes.filter((s) => s !== size);
    } else {
      selectedClothingSizes = [...selectedClothingSizes, size];
    }
  }

  function toggleShoeSize(size: string) {
    if (selectedShoeSizes.includes(size)) {
      selectedShoeSizes = selectedShoeSizes.filter((s) => s !== size);
    } else {
      selectedShoeSizes = [...selectedShoeSizes, size];
    }
  }

  function toggleProductType(type: ProductType) {
    if (product.productTypes.includes(type)) {
      product.productTypes = product.productTypes.filter((t) => t !== type);
      // Clear sizes for removed type
      if (type === 'CLOTHING') {
        selectedClothingSizes = [];
      } else if (type === 'SHOES') {
        selectedShoeSizes = [];
      } else if (type === 'CUSTOM') {
        customSizes = [];
      } else if (type === 'VOLUME') {
        selectedVolumeSizes = [];
        customVolumeSizes = [];
      } else if (type === 'WEIGHT') {
        selectedWeightSizes = [];
        customWeightSizes = [];
      }
    } else {
      product.productTypes = [...product.productTypes, type];
    }
  }

  function toggleVolumeSize(size: string) {
    if (selectedVolumeSizes.includes(size)) {
      selectedVolumeSizes = selectedVolumeSizes.filter((s) => s !== size);
    } else {
      selectedVolumeSizes = [...selectedVolumeSizes, size];
    }
  }

  function toggleWeightSize(size: string) {
    if (selectedWeightSizes.includes(size)) {
      selectedWeightSizes = selectedWeightSizes.filter((s) => s !== size);
    } else {
      selectedWeightSizes = [...selectedWeightSizes, size];
    }
  }

  function addCustomSize() {
    const entry = createCustomSizeEntry({
      line: customSizeLine,
      widthCm: customSizeWidthCm,
      heightCm: customSizeHeightCm,
    });
    if (!entry) return;
    customSizes = [...customSizes, entry];
    customSizeLine = '';
    customSizeWidthCm = '';
    customSizeHeightCm = '';
  }

  function removeCustomSize(index: number) {
    customSizes = customSizes.filter((_, i) => i !== index);
  }

  function addCustomVolume() {
    const val = customVolumeValue.trim().replace(/\s/g, '');
    if (val && !isNaN(Number(val)) && Number(val) > 0) {
      const v = String(Number(val));
      if (!selectedVolumeSizes.includes(v) && !customVolumeSizes.includes(v)) {
        customVolumeSizes = [...customVolumeSizes, v];
        customVolumeValue = '';
      }
    }
  }

  function removeCustomVolume(index: number) {
    customVolumeSizes = customVolumeSizes.filter((_, i) => i !== index);
  }

  function addCustomWeight() {
    const val = customWeightValue.trim().replace(/\s/g, '');
    if (val && !isNaN(Number(val)) && Number(val) > 0) {
      const v = String(Number(val));
      if (!selectedWeightSizes.includes(v) && !customWeightSizes.includes(v)) {
        customWeightSizes = [...customWeightSizes, v];
        customWeightValue = '';
      }
    }
  }

  function removeCustomWeight(index: number) {
    customWeightSizes = customWeightSizes.filter((_, i) => i !== index);
  }

  function addColor() {
    if (!newColorName.trim()) {
      error = 'Please enter a color name';
      return;
    }

    syncColorHexFromCatalog();

    // Normalize hex code: ensure it starts with # and has 6 characters
    let normalizedHex = newColorHex.trim();

    // Remove # if present
    if (normalizedHex.startsWith('#')) {
      normalizedHex = normalizedHex.substring(1);
    }

    // Validate hex format (should be 6 hex characters)
    if (!/^[0-9A-Fa-f]{6}$/.test(normalizedHex)) {
      error = 'Hex color must be in format #RRGGBB (e.g., #000000)';
      return;
    }

    // Add # and convert to uppercase
    normalizedHex = '#' + normalizedHex.toUpperCase();

    // Check if color already exists
    if (
      product.colors.some(
        (c) => c.hex === normalizedHex || c.name.toLowerCase() === newColorName.trim().toLowerCase()
      )
    ) {
      error = 'This color already exists';
      return;
    }

    product.colors = [...product.colors, { name: newColorName.trim(), hex: normalizedHex }];
    newColorName = '';
    newColorHex = '#000000';
    error = ''; // Clear any previous errors
  }

  function removeColor(index: number) {
    product.colors = product.colors.filter((_, i) => i !== index);
  }

  // Complete the look - related products
  async function searchRelatedProducts() {
    const query = relatedProductsSearchQuery?.trim() || '';
    if (query.length < 2) {
      relatedProductsSearchResults = [];
      return;
    }

    relatedProductsSearchLoading = true;
    try {
      console.log('Searching for products with query:', query);
      console.log('API call: productApi.searchProducts');
      const response = await productApi.searchProducts(query, 10);
      console.log('Search response received:', response);
      console.log('Search results count:', response.products?.length || 0);
      console.log('Search results:', response.products);

      if (!response || !response.products) {
        console.error('Invalid response format:', response);
        relatedProductsSearchResults = [];
        return;
      }

      // Filter out already selected products
      relatedProductsSearchResults = response.products.filter(
        (p) => !product.relatedProducts.includes(p.id)
      );
      console.log('Filtered results count:', relatedProductsSearchResults.length);
      console.log('Filtered results:', relatedProductsSearchResults);

      if (relatedProductsSearchResults.length === 0 && response.products.length > 0) {
        console.log('All products are already selected');
      }
    } catch (e) {
      console.error('Failed to search products:', e);
      console.error('Error details:', e instanceof Error ? e.message : String(e));
      console.error('Error stack:', e instanceof Error ? e.stack : 'No stack');
      relatedProductsSearchResults = [];
      // Show error message to user
      error = `Failed to search products: ${e instanceof Error ? e.message : 'Unknown error'}`;
    } finally {
      relatedProductsSearchLoading = false;
    }
  }

  async function toggleRelatedProduct(productId: string) {
    console.log('Toggle related product:', productId, 'Current:', product.relatedProducts);
    if (product.relatedProducts.includes(productId)) {
      product.relatedProducts = product.relatedProducts.filter((id) => id !== productId);
      selectedRelatedProducts = selectedRelatedProducts.filter((p) => p.id !== productId);
    } else {
      product.relatedProducts = [...product.relatedProducts, productId];
      // Load full product info
      try {
        const productInfo = relatedProductsSearchResults.find((p) => p.id === productId);
        if (productInfo) {
          selectedRelatedProducts = [...selectedRelatedProducts, productInfo];
        } else {
          // If not in search results, fetch it
          const response = await productApi.getById(productId);
          selectedRelatedProducts = [...selectedRelatedProducts, response.product];
        }
      } catch (e) {
        console.error('Failed to load product info:', e);
      }
    }
    console.log('Updated related products:', product.relatedProducts);
    // Clear search results when product is selected
    relatedProductsSearchResults = [];
    relatedProductsSearchQuery = '';
  }

  function removeRelatedProduct(productId: string) {
    product.relatedProducts = product.relatedProducts.filter((id) => id !== productId);
    selectedRelatedProducts = selectedRelatedProducts.filter((p) => p.id !== productId);
  }

  // Debounced search - trigger on input change
  $: if (relatedProductsSearchQuery !== undefined && relatedProductsSearchQuery !== null) {
    if (relatedProductsSearchTimeout) {
      clearTimeout(relatedProductsSearchTimeout);
    }
    if (relatedProductsSearchQuery.trim().length >= 2) {
      relatedProductsSearchTimeout = setTimeout(() => {
        searchRelatedProducts();
      }, 500);
    } else {
      relatedProductsSearchResults = [];
    }
  }

  /**
   * Validates warehouse inventory input
   * Returns error message if validation fails, null otherwise
   */
  function validateWarehouseInventory(): string | null {
    if (!selectedWarehouseId) {
      return null; // No warehouse selected, no validation needed
    }

    const hasSizeEntries = Object.keys(stockBySize).length > 0;
    const hasValidStockBySize = hasSizeEntries && Object.values(stockBySize).some((qty) => qty > 0);

    // If using stock by size but all quantities are 0
    if (hasSizeEntries && !hasValidStockBySize) {
      return t('product.quantityValidationStockBySize');
    }

    // If not using stock by size, general quantity must be > 0
    if (!hasSizeEntries && warehouseQuantity <= 0) {
      return t('product.quantityValidationGeneral');
    }

    return null; // Validation passed
  }

  async function handleSubmit() {
    // Determine final category: sub-subcategory > subcategory > main category
    let finalCategoryId = product.categoryId;
    if (!finalCategoryId && selectedSubcategoryId) {
      finalCategoryId = selectedSubcategoryId;
    }
    if (!finalCategoryId) {
      finalCategoryId = selectedMainCategoryId;
    }

    if (!product.name || !product.sku || !selectedMainCategoryId) {
      error = 'Please fill in all required fields';
      return;
    }

    // Validate price: if priceOnRequest is false, price is required
    if (!product.priceOnRequest && (!product.price || product.price <= 0)) {
      error = 'Price is required when "Price on Request" is not enabled';
      return;
    }

    // If priceOnRequest is true, price should be empty
    if (product.priceOnRequest && product.price !== undefined && product.price !== null) {
      error = 'Price must be empty when "Price on Request" is enabled';
      return;
    }

    // Validate warehouse inventory
    const warehouseValidationError = validateWarehouseInventory();
    if (warehouseValidationError) {
      error = warehouseValidationError;
      return;
    }

    loading = true;
    error = '';

    try {
      // Create product with final category ID
      // Remove undefined fields before sending
      const productData: any = {
        name: product.name,
        slug: product.slug || undefined,
        description: product.description || undefined,
        sku: product.sku,
        price: product.priceOnRequest ? undefined : product.price,
        priceOnRequest: product.priceOnRequest,
        categoryId: finalCategoryId,
        isActive: product.isActive,
        isFeatured: product.isFeatured,
      };

      // Only include optional fields if they have values
      if (
        product.compareAtPrice !== undefined &&
        product.compareAtPrice !== null &&
        product.compareAtPrice > 0
      ) {
        productData.compareAtPrice = product.compareAtPrice;
      }
      if (product.brandId) {
        productData.brandId = product.brandId;
      }
      if (product.productTypes && product.productTypes.length > 0) {
        productData.productTypes = product.productTypes;
        if (product.sizes && Object.keys(product.sizes).length > 0) {
          productData.sizes = product.sizes;
        }
      }
      // Send colors only if array is not empty
      // hideColor flag controls visibility on product page, but colors are still stored for filtering
      if (product.colors && product.colors.length > 0) {
        // Validate each color before sending
        const validColors = product.colors.filter(
          (c) => c.name && c.name.trim() && c.hex && /^#[0-9A-Fa-f]{6}$/i.test(c.hex)
        );
        if (validColors.length > 0) {
          productData.colors = validColors.map((c) => ({
            name: c.name.trim(),
            hex: c.hex.toUpperCase(),
          }));
        }
      }
      if (product.material) {
        productData.material = product.material;
      }
      if (product.lining) {
        productData.lining = product.lining;
      }
      if (product.application) {
        productData.application = product.application;
      }
      if (product.countryOfOrigin) {
        productData.countryOfOrigin = product.countryOfOrigin;
      }
      productData.hideColor = product.hideColor;
      productData.hideMaterial = product.hideMaterial;
      productData.hideLining = product.hideLining;
      productData.hideCountryOfOrigin = product.hideCountryOfOrigin;
      productData.showCompleteTheLook = product.showCompleteTheLook;
      // Always send relatedProducts (even if empty to allow clearing)
      if (product.relatedProducts && product.relatedProducts.length > 0) {
        productData.relatedProducts = product.relatedProducts;
      } else {
        productData.relatedProducts = null;
      }
      // SEO fields
      if (product.metaTitle) {
        productData.metaTitle = product.metaTitle;
      }
      if (product.metaDescription) {
        productData.metaDescription = product.metaDescription;
      }
      if (product.metaKeywords) {
        productData.metaKeywords = product.metaKeywords;
      }
      // Shipping (weight & dimensions per unit)
      if (product.weightNet != null && product.weightNet !== undefined && product.weightNet > 0) {
        productData.weightNet = product.weightNet;
      }
      if (
        product.weightGross != null &&
        product.weightGross !== undefined &&
        product.weightGross > 0
      ) {
        productData.weightGross = product.weightGross;
      }
      if (product.lengthCm != null && product.lengthCm !== undefined && product.lengthCm > 0) {
        productData.lengthCm = product.lengthCm;
      }
      if (product.widthCm != null && product.widthCm !== undefined && product.widthCm > 0) {
        productData.widthCm = product.widthCm;
      }
      if (product.heightCm != null && product.heightCm !== undefined && product.heightCm > 0) {
        productData.heightCm = product.heightCm;
      }

      console.log('Creating product with data:', JSON.stringify(productData, null, 2));
      console.log('Related products:', product.relatedProducts);
      console.log('Related products length:', product.relatedProducts?.length);
      const response = await adminApi.createProduct(productData);
      const productId = response.product.id;

      // Upload images if any
      if (images.length > 0) {
        try {
          await adminApi.uploadMultipleProductImages(images, productId);
        } catch (e) {
          console.error('Failed to upload images:', e);
          // Continue even if image upload fails
        }
      }

      // Add product to warehouse - either by size or general quantity
      if (selectedWarehouseId) {
        try {
          // Check if we have stock by size
          const hasStockBySize =
            Object.keys(stockBySize).length > 0 &&
            Object.values(stockBySize).some((qty) => qty > 0);

          if (hasStockBySize) {
            // Create variants for each size first, then add inventory with variantId
            const sizeToVariantIdMap: Record<string, string> = {};

            // Build sizes object explicitly to ensure we have correct data
            const currentSizes: ProductSizes = {};
            if (product.productTypes.includes('CLOTHING') && selectedClothingSizes.length > 0) {
              currentSizes.CLOTHING = selectedClothingSizes;
            }
            if (product.productTypes.includes('SHOES') && selectedShoeSizes.length > 0) {
              currentSizes.SHOES = selectedShoeSizes;
            }
            if (product.productTypes.includes('CUSTOM') && customSizes.length > 0) {
              currentSizes.CUSTOM = customSizes.map((s) => ({
                value: s.value.trim(),
                label: getCustomSizeDisplayLabel(s).trim(),
              }));
            }
            if (
              product.productTypes.includes('VOLUME') &&
              (selectedVolumeSizes.length > 0 || customVolumeSizes.length > 0)
            ) {
              currentSizes.VOLUME = [...new Set([...selectedVolumeSizes, ...customVolumeSizes])];
            }
            if (
              product.productTypes.includes('WEIGHT') &&
              (selectedWeightSizes.length > 0 || customWeightSizes.length > 0)
            ) {
              currentSizes.WEIGHT = [...new Set([...selectedWeightSizes, ...customWeightSizes])];
            }

            console.log('Creating variants with sizes:', {
              currentSizes,
              stockBySize,
              productTypes: product.productTypes,
            });

            // Determine size type and create variants
            for (const [sizeValue, quantity] of Object.entries(stockBySize)) {
              if (quantity > 0) {
                // Determine size type and label
                let sizeType: 'CLOTHING' | 'SHOES' | 'CUSTOM' | 'VOLUME' | 'WEIGHT' | null = null;
                let sizeLabel = sizeValue;

                // Check if it's a clothing size
                if (
                  product.productTypes.includes('CLOTHING') &&
                  currentSizes.CLOTHING?.includes(sizeValue)
                ) {
                  sizeType = 'CLOTHING';
                  sizeLabel = sizeValue;
                }
                // Check if it's a shoe size
                else if (
                  product.productTypes.includes('SHOES') &&
                  currentSizes.SHOES?.includes(sizeValue)
                ) {
                  sizeType = 'SHOES';
                  sizeLabel = sizeValue;
                }
                // Check if it's a custom size
                else if (product.productTypes.includes('CUSTOM') && currentSizes.CUSTOM) {
                  const customSize = currentSizes.CUSTOM.find(
                    (s: { value: string; label: string }) => s.value === sizeValue
                  );
                  if (customSize) {
                    sizeType = 'CUSTOM';
                    sizeLabel = getCustomSizeDisplayLabel(customSize);
                  }
                }
                // Check if it's a volume size (ml)
                else if (
                  product.productTypes.includes('VOLUME') &&
                  currentSizes.VOLUME?.includes(sizeValue)
                ) {
                  sizeType = 'VOLUME';
                  sizeLabel = `${sizeValue} ml`;
                }
                // Check if it's a weight size (g)
                else if (
                  product.productTypes.includes('WEIGHT') &&
                  currentSizes.WEIGHT?.includes(sizeValue)
                ) {
                  sizeType = 'WEIGHT';
                  sizeLabel = `${sizeValue} g`;
                }

                // Create variant for this size (always create, even if sizeType is not determined)
                try {
                  const variantName = `Size: ${sizeLabel}`;
                  console.log(
                    `Creating variant for size ${sizeValue} (type: ${sizeType || 'UNKNOWN'}):`,
                    {
                      variantName,
                      sizeValue,
                      productId,
                      currentSizes,
                      productTypes: product.productTypes,
                    }
                  );
                  const variantResponse = await adminApi.addProductVariant({
                    productId: productId,
                    name: variantName,
                    sku: `${response.product.sku}-${sizeValue}`,
                    price: undefined,
                    size: sizeValue,
                    showOnProduct: false, // Hidden by default
                  });
                  sizeToVariantIdMap[sizeValue] = variantResponse.variant.id;
                  console.log(
                    `✓ Variant created successfully for size ${sizeValue}:`,
                    variantResponse.variant.id
                  );
                } catch (variantError) {
                  console.error(`✗ Failed to create variant for size ${sizeValue}:`, variantError);
                  // Continue with other sizes even if one fails
                  notificationStore.error(
                    t('product.variantCreateFailedForSize', { size: sizeValue })
                  );
                }
              }
            }

            // Now add inventory with variantId for each size
            for (const [sizeValue, quantity] of Object.entries(stockBySize)) {
              if (quantity > 0) {
                const status = stockBySizeStatus[sizeValue] || warehouseStatus;
                const variantId = sizeToVariantIdMap[sizeValue];

                if (!variantId) {
                  console.warn(
                    `No variant ID found for size ${sizeValue}. Adding inventory without variant.`
                  );
                  notificationStore.error(
                    t('product.variantWarningInventoryWithout', { size: sizeValue })
                  );
                }

                console.log(`Adding inventory for size ${sizeValue}:`, {
                  variantId,
                  quantity,
                  status,
                });
                await adminApi.addInventory(selectedWarehouseId, {
                  productId: productId,
                  variantId: variantId || undefined,
                  quantity: quantity,
                  reason: `Initial stock for size ${sizeValue} from product creation`,
                  status: status,
                });
                console.log(`Inventory added successfully for size ${sizeValue}`);
              }
            }
          } else if (warehouseQuantity > 0) {
            // Use general quantity if no size-specific stock
            await adminApi.addInventory(selectedWarehouseId, {
              productId: productId,
              quantity: warehouseQuantity,
              reason: 'Initial stock from product creation',
              status: warehouseStatus,
            });
          }
        } catch (e) {
          console.error('Failed to add product to warehouse:', e);
          error = `Product created but failed to add to warehouse: ${e instanceof Error ? e.message : 'Unknown error'}`;
          loading = false;
          return;
        }
      }

      goto('/admin/products');
    } catch (e) {
      error = getErrorMessage(e, 'product.failedToCreate');
      loading = false;
    }
  }
</script>

<div>
  <div class="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4 mb-6">
    <h2 class="text-2xl sm:text-3xl font-bold">{t('product.newProduct')}</h2>
    <a
      href="/admin/products"
      class="px-4 py-2 bg-white border border-gray-300 hover:bg-gray-100 transition-colors text-black w-full sm:w-auto text-center"
    >
      {t('product.backToProducts')}
    </a>
  </div>

  {#if error}
    <div class="mb-6 p-4 bg-red-500/20 border border-red-500 text-red-400">
      {error}
    </div>
  {/if}

  <form on:submit|preventDefault={handleSubmit} class="space-y-6">
    <div class="flex gap-1 p-2 bg-gray-100 rounded-lg overflow-x-auto mb-6" role="tablist">
      <button
        type="button"
        role="tab"
        aria-selected={formTab === 'basic'}
        on:click={() => (formTab = 'basic')}
        class="px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors rounded-md"
        class:bg-white={formTab === 'basic'}
        class:shadow-sm={formTab === 'basic'}
        class:text-accent={formTab === 'basic'}
        class:text-gray-600={formTab !== 'basic'}
        class:hover:bg-gray-50={formTab !== 'basic'}
        class:hover:text-gray-900={formTab !== 'basic'}
      >
        {t('product.basicInformation')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={formTab === 'images'}
        on:click={() => (formTab = 'images')}
        class="px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors rounded-md"
        class:bg-white={formTab === 'images'}
        class:shadow-sm={formTab === 'images'}
        class:text-accent={formTab === 'images'}
        class:text-gray-600={formTab !== 'images'}
        class:hover:bg-gray-50={formTab !== 'images'}
        class:hover:text-gray-900={formTab !== 'images'}
      >
        {t('product.imagesVideos')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={formTab === 'warehouse'}
        on:click={() => (formTab = 'warehouse')}
        class="px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors rounded-md"
        class:bg-white={formTab === 'warehouse'}
        class:shadow-sm={formTab === 'warehouse'}
        class:text-accent={formTab === 'warehouse'}
        class:text-gray-600={formTab !== 'warehouse'}
        class:hover:bg-gray-50={formTab !== 'warehouse'}
        class:hover:text-gray-900={formTab !== 'warehouse'}
      >
        {t('product.warehouseInventory')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={formTab === 'seo'}
        on:click={() => (formTab = 'seo')}
        class="px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors rounded-md"
        class:bg-white={formTab === 'seo'}
        class:shadow-sm={formTab === 'seo'}
        class:text-accent={formTab === 'seo'}
        class:text-gray-600={formTab !== 'seo'}
        class:hover:bg-gray-50={formTab !== 'seo'}
        class:hover:text-gray-900={formTab !== 'seo'}
      >
        {t('product.seoSettings')}
      </button>
      <button
        type="button"
        role="tab"
        aria-selected={formTab === 'shipping'}
        on:click={() => (formTab = 'shipping')}
        class="px-4 py-2 text-sm font-medium whitespace-nowrap transition-colors rounded-md"
        class:bg-white={formTab === 'shipping'}
        class:shadow-sm={formTab === 'shipping'}
        class:text-accent={formTab === 'shipping'}
        class:text-gray-600={formTab !== 'shipping'}
        class:hover:bg-gray-50={formTab !== 'shipping'}
        class:hover:text-gray-900={formTab !== 'shipping'}
      >
        {t('product.shippingSection')}
      </button>
    </div>

    {#if formTab === 'basic'}
      <div class="bg-dark-light p-6 space-y-6">
        <h3 class="text-xl font-medium">{t('product.basicInformation')}</h3>

        {#if brandsEnabled}
          <div>
            <label for="productBrand" class="block text-sm font-medium mb-2"
              >{t('product.brand')}</label
            >
            <select
              id="productBrand"
              bind:value={product.brandId}
              class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
            >
              <option value="">{t('product.noBrand')}</option>
              {#each brands as brand}
                <option value={brand.id}>{brand.name}</option>
              {/each}
            </select>
          </div>
        {/if}

        <div>
          <label for="productName" class="block text-sm font-medium mb-2">
            {t('product.productName')} <span class="text-red-400">*</span>
          </label>
          <input
            id="productName"
            type="text"
            bind:value={product.name}
            required
            class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
            placeholder={t('product.enterProductName')}
          />
        </div>

        <div>
          <label for="productSlug" class="block text-sm font-medium mb-2">{t('common.slug')}</label>
          <input
            id="productSlug"
            type="text"
            bind:value={product.slug}
            class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
            placeholder={t('product.autoGeneratedFromName')}
          />
          <p class="mt-1 text-xs text-accent-muted">{t('product.slugHint')}</p>
        </div>

        <div>
          <label for="productDescription" class="block text-sm font-medium mb-2"
            >{t('product.description')}</label
          >
          <textarea
            id="productDescription"
            bind:value={product.description}
            rows="4"
            class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
            placeholder={t('product.enterProductDescription')}
          ></textarea>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label for="productSku" class="block text-sm font-medium mb-2">
              {t('product.sku')} <span class="text-red-400">*</span>
            </label>
            <input
              id="productSku"
              type="text"
              bind:value={product.sku}
              required
              class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
              placeholder="SKU-001"
            />
          </div>

          <div>
            <label for="productPrice" class="block text-sm font-medium mb-2">
              {t('product.price')}
              {#if !product.priceOnRequest}<span class="text-red-400">*</span>{/if}
            </label>
            <input
              id="productPrice"
              type="number"
              bind:value={product.price}
              required={!product.priceOnRequest}
              disabled={product.priceOnRequest}
              min="0"
              step="0.01"
              class="w-full px-4 py-2 bg-white border border-gray-300 text-black disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder={product.priceOnRequest ? t('product.priceOnRequest') : '0.00'}
            />
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <label for="productCompareAtPrice" class="block text-sm font-medium mb-2"
              >{t('product.compareAtPrice')}</label
            >
            <input
              id="productCompareAtPrice"
              type="number"
              bind:value={product.compareAtPrice}
              min="0"
              step="0.01"
              disabled={product.priceOnRequest}
              class="w-full px-4 py-2 bg-white border border-gray-300 text-black disabled:opacity-50 disabled:cursor-not-allowed"
              placeholder="0.00"
            />
            <p class="mt-1 text-xs text-accent-muted">{t('product.compareAtPriceHint')}</p>
          </div>

          <div>
            <label class="flex items-center gap-2 mb-2">
              <input
                type="checkbox"
                bind:checked={product.priceOnRequest}
                class="w-4 h-4"
                on:change={() => {
                  if (product.priceOnRequest) {
                    product.price = undefined;
                    product.compareAtPrice = undefined;
                  }
                }}
              />
              <span class="text-sm font-medium">{t('product.priceOnRequest')}</span>
            </label>
            <p class="text-xs text-accent-muted">
              {t('product.priceOnRequestHint')}
            </p>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-3 gap-4">
          <div>
            <label for="productMainCategory" class="block text-sm font-medium mb-2">
              {t('product.category')} <span class="text-red-400">*</span>
            </label>
            <select
              id="productMainCategory"
              bind:value={selectedMainCategoryId}
              required
              class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
              on:change={(e) => {
                // Reset dependent selections when main category changes
                const newMainId = e.currentTarget.value;
                if (newMainId !== selectedMainCategoryId) {
                  selectedSubcategoryId = '';
                  product.categoryId = '';
                }
              }}
            >
              <option value="">{t('common.select')} {t('product.category').toLowerCase()}</option>
              {#if mainCategories.length === 0}
                <option value="" disabled>{t('category.noCategories')}</option>
              {:else}
                {#each mainCategories as category}
                  <option value={category.id}>{category.name}</option>
                {/each}
              {/if}
            </select>
            {#if mainCategories.length === 0 && allCategories.length > 0}
              <p class="mt-1 text-xs text-black">
                Warning: No main categories found. Please check category settings.
              </p>
            {/if}
          </div>

          <div>
            <label for="productSubcategory" class="block text-sm font-medium mb-2">
              {t('category.subcategory')}
              {selectedMainCategoryId ? '' : '' + t('') + ''}
            </label>
            <select
              id="productSubcategory"
              bind:value={selectedSubcategoryId}
              disabled={!selectedMainCategoryId}
              class="w-full px-4 py-2 bg-white border border-gray-300 text-black disabled:opacity-50 disabled:cursor-not-allowed"
              on:change={(e) => {
                // Reset sub-subcategory if it's not valid for new subcategory
                const newSubId = e.currentTarget.value;
                if (newSubId && product.categoryId) {
                  const currentSubSubs = allCategories.filter((cat) => cat.parentId === newSubId);
                  const isValidSubSub = currentSubSubs.find((cat) => cat.id === product.categoryId);
                  const isSubcategoryItself = product.categoryId === newSubId;
                  if (!isValidSubSub && !isSubcategoryItself) {
                    product.categoryId = '';
                  }
                } else if (!newSubId) {
                  product.categoryId = '';
                }
              }}
            >
              <option value=""
                >{t('common.select')}
                {t('category.subcategory').toLowerCase()} ({t('common.optional')})</option
              >
              {#each subcategories as subcategory}
                <option value={subcategory.id}>{subcategory.name}</option>
              {/each}
            </select>
            {#if selectedMainCategoryId && !selectedSubcategoryId}
              <p class="mt-1 text-xs text-accent-muted">
                {t('common.optional')}: {t('common.select')}
                {t('category.subcategory').toLowerCase()}
              </p>
            {/if}
          </div>

          <div>
            <label for="productSubSubcategory" class="block text-sm font-medium mb-2">
              {t('category.subSubcategory')}
              {selectedSubcategoryId ? '' : ''}
            </label>
            <select
              id="productSubSubcategory"
              bind:value={product.categoryId}
              disabled={!selectedSubcategoryId || subSubcategories.length === 0}
              class="w-full px-4 py-2 bg-white border border-gray-300 text-black disabled:opacity-50 disabled:cursor-not-allowed"
            >
              <option value=""
                >{t('common.select')}
                {t('category.subSubcategory').toLowerCase()} ({t('common.optional')})</option
              >
              {#if subSubcategories.length > 0}
                {#each subSubcategories as subSubcategory}
                  <option value={subSubcategory.id}>{subSubcategory.name}</option>
                {/each}
              {:else if selectedSubcategoryId}
                <option value={selectedSubcategoryId}>{t('category.useSubcategory')}</option>
              {/if}
            </select>
            {#if selectedSubcategoryId && subSubcategories.length === 0}
              <p class="mt-1 text-xs text-accent-muted">
                {t('category.noSubSubcategories')}
              </p>
            {/if}
          </div>
        </div>

        <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
          <div>
            <p class="block text-sm font-medium mb-2">
              {t('product.productTypes')} ({t('product.canSelectMultiple')})
            </p>
            <div class="flex flex-wrap gap-3">
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={product.productTypes.includes('CLOTHING')}
                  on:change={() => toggleProductType('CLOTHING')}
                  class="w-4 h-4"
                />
                <span class="text-sm">{t('product.clothing')}</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={product.productTypes.includes('SHOES')}
                  on:change={() => toggleProductType('SHOES')}
                  class="w-4 h-4"
                />
                <span class="text-sm">{t('product.shoes')}</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={product.productTypes.includes('CUSTOM')}
                  on:change={() => toggleProductType('CUSTOM')}
                  class="w-4 h-4"
                />
                <span class="text-sm">{t('product.custom')} (cm)</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={product.productTypes.includes('VOLUME')}
                  on:change={() => toggleProductType('VOLUME')}
                  class="w-4 h-4"
                />
                <span class="text-sm">{t('product.volume')}</span>
              </label>
              <label class="flex items-center gap-2 cursor-pointer">
                <input
                  type="checkbox"
                  checked={product.productTypes.includes('WEIGHT')}
                  on:change={() => toggleProductType('WEIGHT')}
                  class="w-4 h-4"
                />
                <span class="text-sm">{t('product.weight')}</span>
              </label>
            </div>
            {#if product.productTypes.length > 0}
              <p class="mt-2 text-xs text-accent-muted">
                {t('common.selected')}: {product.productTypes.join(', ')}
              </p>
            {/if}
          </div>
        </div>

        <!-- Sizes Section - Show for each selected type -->
        {#if product.productTypes.includes('CLOTHING')}
          <div>
            <p class="block text-sm font-medium mb-2">{t('product.clothingSizes')}</p>
            <div class="flex flex-wrap gap-2">
              {#each clothingSizes as size}
                <button
                  type="button"
                  on:click={() => toggleClothingSize(size)}
                  class="px-4 py-2 border transition-colors {selectedClothingSizes.includes(size)
                    ? 'bg-accent text-dark border-accent'
                    : 'bg-white text-black border-gray-300 hover:border-accent'}"
                >
                  {size}
                </button>
              {/each}
            </div>
            {#if selectedClothingSizes.length > 0}
              <p class="mt-2 text-xs text-accent-muted">
                {t('common.selected')}: {selectedClothingSizes.join(', ')}
              </p>
            {/if}
          </div>
        {/if}

        {#if product.productTypes.includes('SHOES')}
          <div>
            <p class="block text-sm font-medium mb-2">{t('product.shoeSizes')} (EU)</p>
            <div class="flex flex-wrap gap-2">
              {#each shoeSizes as size}
                <button
                  type="button"
                  on:click={() => toggleShoeSize(size)}
                  class="px-4 py-2 border transition-colors {selectedShoeSizes.includes(size)
                    ? 'bg-accent text-dark border-accent'
                    : 'bg-white text-black border-gray-300 hover:border-accent'}"
                >
                  {size}
                </button>
              {/each}
            </div>
            {#if selectedShoeSizes.length > 0}
              <p class="mt-2 text-xs text-accent-muted">Selected: {selectedShoeSizes.join(', ')}</p>
            {/if}
          </div>
        {/if}

        {#if product.productTypes.includes('VOLUME')}
          <div>
            <p class="block text-sm font-medium mb-2">{t('product.volumeSizes')} (ml)</p>
            <div class="flex flex-wrap gap-2">
              {#each volumeSizes as size}
                <button
                  type="button"
                  on:click={() => toggleVolumeSize(size)}
                  class="px-4 py-2 border transition-colors {selectedVolumeSizes.includes(size)
                    ? 'bg-accent text-dark border-accent'
                    : 'bg-white text-black border-gray-300 hover:border-accent'}"
                >
                  {size} ml
                </button>
              {/each}
            </div>
            <div class="flex flex-col sm:flex-row gap-2 mt-2">
              <input
                type="number"
                bind:value={customVolumeValue}
                placeholder={t('product.customVolumePlaceholder')}
                min="1"
                step="1"
                class="flex-1 px-4 py-2 bg-white border border-gray-300 text-black max-w-[140px]"
                on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomVolume())}
              />
              <span class="self-center text-sm text-black/70">ml</span>
              <button
                type="button"
                on:click={addCustomVolume}
                class="px-4 py-2 bg-accent text-dark hover:bg-accent-muted whitespace-nowrap"
              >
                {t('common.add')}
              </button>
            </div>
            {#if customVolumeSizes.length > 0}
              <div class="flex flex-wrap gap-2 mt-2">
                {#each customVolumeSizes as size, index}
                  <div class="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300">
                    <span class="text-sm text-black">{size} ml</span>
                    <button
                      type="button"
                      on:click={() => removeCustomVolume(index)}
                      class="text-red-500 hover:text-red-700"
                      title={t('common.remove')}
                    >
                      ×
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
            {#if selectedVolumeSizes.length > 0 || customVolumeSizes.length > 0}
              <p class="mt-2 text-xs text-accent-muted">
                {t('common.selected')}: {[...selectedVolumeSizes, ...customVolumeSizes].join(', ')} ml
              </p>
            {/if}
          </div>
        {/if}

        {#if product.productTypes.includes('WEIGHT')}
          <div>
            <p class="block text-sm font-medium mb-2">{t('product.weightSizes')} (g)</p>
            <div class="flex flex-wrap gap-2">
              {#each weightSizes as size}
                <button
                  type="button"
                  on:click={() => toggleWeightSize(size)}
                  class="px-4 py-2 border transition-colors {selectedWeightSizes.includes(size)
                    ? 'bg-accent text-dark border-accent'
                    : 'bg-white text-black border-gray-300 hover:border-accent'}"
                >
                  {size} g
                </button>
              {/each}
            </div>
            <div class="flex flex-col sm:flex-row gap-2 mt-2">
              <input
                type="number"
                bind:value={customWeightValue}
                placeholder={t('product.customWeightPlaceholder')}
                min="1"
                step="1"
                class="flex-1 px-4 py-2 bg-white border border-gray-300 text-black max-w-[140px]"
                on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomWeight())}
              />
              <span class="self-center text-sm text-black/70">g</span>
              <button
                type="button"
                on:click={addCustomWeight}
                class="px-4 py-2 bg-accent text-dark hover:bg-accent-muted whitespace-nowrap"
              >
                {t('common.add')}
              </button>
            </div>
            {#if customWeightSizes.length > 0}
              <div class="flex flex-wrap gap-2 mt-2">
                {#each customWeightSizes as size, index}
                  <div class="flex items-center gap-2 px-4 py-2 bg-white border border-gray-300">
                    <span class="text-sm text-black">{size} g</span>
                    <button
                      type="button"
                      on:click={() => removeCustomWeight(index)}
                      class="text-red-500 hover:text-red-700"
                      title={t('common.remove')}
                    >
                      ×
                    </button>
                  </div>
                {/each}
              </div>
            {/if}
            {#if selectedWeightSizes.length > 0 || customWeightSizes.length > 0}
              <p class="mt-2 text-xs text-accent-muted">
                {t('common.selected')}: {[...selectedWeightSizes, ...customWeightSizes].join(', ')} g
              </p>
            {/if}
          </div>
        {/if}

        {#if product.productTypes.includes('CUSTOM')}
          <div>
            <p class="block text-sm font-medium mb-2">{t('product.customSizes')} (cm)</p>
            <div class="flex flex-wrap items-center gap-2 mb-2">
              <input
                type="text"
                bind:value={customSizeLine}
                placeholder={t('product.customSizeLinePlaceholder')}
                class="flex-1 min-w-[8rem] px-4 py-2 bg-white border border-gray-300 text-black"
                on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomSize())}
              />
              <span class="text-xs text-gray-400 shrink-0">{t('product.customSizeOr')}</span>
              <input
                type="number"
                step="0.1"
                min="0"
                bind:value={customSizeWidthCm}
                placeholder="70"
                aria-label={t('product.widthCm')}
                class="w-[4.5rem] px-2 py-2 bg-white border border-gray-300 text-black text-center"
              />
              <span class="text-gray-400 shrink-0" aria-hidden="true">×</span>
              <input
                type="number"
                step="0.1"
                min="0"
                bind:value={customSizeHeightCm}
                placeholder="100"
                aria-label={t('product.heightCm')}
                class="w-[4.5rem] px-2 py-2 bg-white border border-gray-300 text-black text-center"
                on:keydown={(e) => e.key === 'Enter' && (e.preventDefault(), addCustomSize())}
              />
              <button
                type="button"
                on:click={addCustomSize}
                class="px-4 py-2 bg-accent text-dark hover:bg-accent-muted whitespace-nowrap shrink-0"
              >
                {t('common.add')}
              </button>
            </div>
            {#if customSizes.length > 0}
              <div>
                <h5 class="text-sm font-medium mb-2">Custom Sizes</h5>
                <div class="grid grid-cols-2 md:grid-cols-4 gap-4">
                  {#each customSizes as size}
                    <div class="space-y-2">
                      <label
                        for={`stockBySize-${size.value}-${selectedWarehouseId}`}
                        class="block text-xs font-medium">{getCustomSizeDisplayLabel(size)}</label
                      >
                      <input
                        id={`stockBySize-${size.value}-${selectedWarehouseId}`}
                        type="number"
                        bind:value={stockBySize[size.value]}
                        min="0"
                        step="1"
                        class="w-full px-3 py-2 bg-white border border-gray-300 text-black text-sm"
                        placeholder="0"
                      />
                      <select
                        id={`stockBySizeStatus-${size.value}-${selectedWarehouseId}`}
                        bind:value={stockBySizeStatus[size.value]}
                        class="w-full px-2 py-1 bg-white border border-gray-300 text-black text-xs"
                      >
                        {#each statusOptions as option}
                          <option value={option.value}>{option.label}</option>
                        {/each}
                      </select>
                    </div>
                  {/each}
                </div>
              </div>
            {/if}
          </div>
        {/if}

        <div>
          <p class="block text-sm font-medium mb-2">{t('product.colors')}</p>
          <div class="space-y-3">
            <div class="flex flex-col sm:flex-row gap-2 sm:flex-wrap">
              <input
                type="text"
                bind:value={newColorName}
                placeholder={t('product.colorNamePlaceholder')}
                class="flex-1 px-4 py-2 bg-white border border-gray-300 text-black"
                autocomplete="off"
                on:keydown={(e) => {
                  if (e.key === 'Enter') {
                    e.preventDefault();
                    addColor();
                  }
                }}
                on:blur={syncColorHexFromCatalog}
              />
              {#if colorCatalogMatch && !colorAlreadyOnProduct}
                <p class="text-xs text-amber-600 sm:basis-full">
                  {t('product.colorAlreadyInCatalog', {
                    name: colorCatalogMatch.name,
                    hex: colorCatalogMatch.hex,
                  })}
                </p>
              {/if}
              <div class="flex gap-2">
                <input
                  type="color"
                  bind:value={newColorHex}
                  class="w-16 h-10 border border-gray-300 cursor-pointer"
                />
                <input
                  type="text"
                  bind:value={newColorHex}
                  placeholder="#000000"
                  class="w-24 px-3 py-2 bg-white border border-gray-300 text-black text-sm font-mono"
                  autocomplete="off"
                  spellcheck="false"
                />
                <button
                  type="button"
                  on:click={addColor}
                  class="px-4 py-2 bg-accent text-dark hover:bg-accent-muted whitespace-nowrap"
                >
                  {t('product.addColor')}
                </button>
              </div>
            </div>
            {#if product.colors.length > 0}
              <div class="flex flex-wrap gap-3">
                {#each product.colors as color, index}
                  <div
                    class="flex items-center gap-2 px-3 py-2 bg-white border border-gray-300 rounded"
                  >
                    <div
                      class="w-8 h-8 rounded border border-gray-300"
                      style="background-color: {color.hex};"
                      title={color.name}
                    ></div>
                    <span class="text-sm text-black">{color.name}</span>
                    <span class="text-xs text-gray-500 font-mono">{color.hex}</span>
                    <button
                      type="button"
                      on:click={() => removeColor(index)}
                      class="ml-1 text-red-500 hover:text-red-700 text-lg leading-none">×</button
                    >
                  </div>
                {/each}
              </div>
            {/if}
            <p class="text-xs text-accent-muted">{t('product.colorsOptional')}</p>
            <label class="flex items-center gap-2">
              <input type="checkbox" bind:checked={product.hideColor} class="w-4 h-4" />
              <span class="text-sm">{t('product.hideColorsOnProductPage')}</span>
            </label>
          </div>
        </div>

        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div>
            <p class="block text-sm font-medium mb-2">{t('product.material')}</p>
            <div class="flex items-center gap-2">
              <input
                type="text"
                bind:value={product.material}
                class="flex-1 px-4 py-2 bg-white border border-gray-300 text-black"
                placeholder={t('product.materialPlaceholder')}
              />
              <label class="flex items-center gap-1 text-xs whitespace-nowrap">
                <input type="checkbox" bind:checked={product.hideMaterial} class="w-4 h-4" />
                <span>{t('common.hide')}</span>
              </label>
            </div>
          </div>

          <div>
            <p class="block text-sm font-medium mb-2">{t('product.lining')}</p>
            <div class="flex items-center gap-2">
              <input
                type="text"
                bind:value={product.lining}
                class="flex-1 px-4 py-2 bg-white border border-gray-300 text-black"
                placeholder={t('product.liningPlaceholder')}
              />
              <label class="flex items-center gap-1 text-xs whitespace-nowrap">
                <input type="checkbox" bind:checked={product.hideLining} class="w-4 h-4" />
                <span>{t('common.hide')}</span>
              </label>
            </div>
          </div>

          <div class="md:col-span-2">
            <label for="productApplication" class="block text-sm font-medium mb-2">
              {t('product.application')} ({t('common.optional')})
            </label>
            <textarea
              id="productApplication"
              bind:value={product.application}
              rows="3"
              class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
            ></textarea>
          </div>
        </div>

        <div>
          <label for="productCountryOfOrigin" class="block text-sm font-medium mb-2">
            {t('product.countryOfOrigin')} ({t('common.optional')})
          </label>
          <div class="flex items-center gap-2">
            <input
              id="productCountryOfOrigin"
              type="text"
              bind:value={product.countryOfOrigin}
              list="catalog-countries-list-new"
              class="flex-1 px-4 py-2 bg-white border border-gray-300 text-black"
              placeholder={t('product.countryPlaceholder')}
            />
            <label class="flex items-center gap-1 text-xs whitespace-nowrap">
              <input type="checkbox" bind:checked={product.hideCountryOfOrigin} class="w-4 h-4" />
              <span>{t('common.hide')}</span>
            </label>
          </div>
          <datalist id="catalog-countries-list-new">
            {#each catalogCountries as country}
              <option value={country}></option>
            {/each}
          </datalist>
          {#if countryCatalogMatch}
            <p class="text-xs text-amber-600 mt-1">
              {t('product.countryAlreadyInCatalog', { country: countryCatalogMatch })}
            </p>
          {/if}
        </div>
      </div>
    {/if}

    {#if formTab === 'warehouse'}
      <div class="bg-dark-light p-6 space-y-6">
        <div>
          <h3 class="text-xl font-medium">{t('product.warehouseInventory')}</h3>
          <p class="mt-1 text-sm text-accent-muted">{t('product.selectWarehouseHint')}</p>
        </div>

        <div>
          <label for="initialWarehouse" class="block text-sm font-medium mb-2">
            {t('warehouse.selectWarehouse')}
          </label>
          <select
            id="initialWarehouse"
            bind:value={selectedWarehouseId}
            class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
          >
            <option value="">{t('warehouse.selectWarehouse')}</option>
            {#each warehouses.filter((warehouse) => warehouse.isActive) as warehouse}
              <option value={warehouse.id}>{warehouse.name}</option>
            {/each}
          </select>
        </div>

        {#if selectedWarehouseId}
          {@const sizeEntries = Object.keys(stockBySize)}
          {#if sizeEntries.length > 0}
            <div>
              <h4 class="text-base font-medium">{t('product.stockBySize')}</h4>
              <p class="mt-1 mb-4 text-sm text-accent-muted">{t('product.stockBySizeHint')}</p>
              <div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                {#each sizeEntries as size}
                  <div class="p-4 bg-white border border-gray-300 space-y-3">
                    <p class="font-medium text-black">{size}</p>
                    <div>
                      <label for={`initialQuantity-${size}`} class="block text-xs mb-1">
                        {t('warehouse.quantity')}
                      </label>
                      <input
                        id={`initialQuantity-${size}`}
                        type="number"
                        min="0"
                        step="1"
                        bind:value={stockBySize[size]}
                        class="w-full px-3 py-2 bg-white border border-gray-300 text-black"
                      />
                    </div>
                    <select
                      aria-label={statusLabels[stockBySizeStatus[size] || warehouseStatus]}
                      bind:value={stockBySizeStatus[size]}
                      class="w-full px-3 py-2 bg-white border border-gray-300 text-black"
                    >
                      {#each statusOptions as option}
                        <option value={option.value}>{option.label}</option>
                      {/each}
                    </select>
                  </div>
                {/each}
              </div>
            </div>
          {:else}
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div>
                <label for="initialWarehouseQuantity" class="block text-sm font-medium mb-2">
                  {t('warehouse.quantity')}
                </label>
                <input
                  id="initialWarehouseQuantity"
                  type="number"
                  min="0"
                  step="1"
                  bind:value={warehouseQuantity}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                />
              </div>
              <div>
                <label for="initialWarehouseStatus" class="block text-sm font-medium mb-2">
                  Status
                </label>
                <select
                  id="initialWarehouseStatus"
                  bind:value={warehouseStatus}
                  class="w-full px-4 py-2 bg-white border border-gray-300 text-black"
                >
                  {#each statusOptions as option}
                    <option value={option.value}>{option.label}</option>
                  {/each}
                </select>
              </div>
            </div>
          {/if}
        {/if}
      </div>
    {/if}

    {#if formTab === 'images'}
      <div class="bg-dark-light p-6">
        <h3 class="text-xl font-medium mb-4">{t('product.imagesVideos')}</h3>

        <!-- Modern Upload Zone -->
        <div
          class="relative border-2 border-dashed p-6 sm:p-12 text-center transition-all {isDragging
            ? 'border-black bg-black/5'
            : 'border-black/30 bg-white hover:border-black/50 hover:bg-black/5'}"
          on:dragover={handleDragOver}
          on:dragleave={handleDragLeave}
          on:drop={handleDrop}
          role="button"
          tabindex="0"
          on:keydown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault();
              openFileDialog();
            }
          }}
        >
          <input
            bind:this={fileInputRef}
            type="file"
            accept="image/*,video/*"
            multiple
            on:change={handleImageSelect}
            class="hidden"
          />

          <div class="flex flex-col items-center justify-center">
            <svg
              class="w-16 h-16 text-black mb-4"
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
            <p class="text-base font-medium text-black mb-2">
              {t('product.dragFilesHere')}
              <button
                type="button"
                on:click={openFileDialog}
                class="text-black underline font-semibold ml-1 hover:no-underline"
              >
                {t('product.selectFiles')}
              </button>
            </p>
            <p class="text-sm text-black/60">
              {t('product.supportedFormats')}
            </p>
            <p class="text-xs text-black/40 mt-2">
              {t('product.maxFileSize')}
            </p>
          </div>
        </div>

        {#if imagePreviews.length > 0}
          <div class="mt-6">
            <div class="flex items-center justify-between mb-4">
              <p class="text-sm font-semibold text-black">
                {t('product.selectedFiles')}: {imagePreviews.length}
              </p>
              <button
                type="button"
                on:click={() => {
                  images = [];
                  imagePreviews = [];
                  if (fileInputRef) fileInputRef.value = '';
                }}
                class="text-xs text-black underline hover:no-underline"
              >
                {t('product.clearAll')}
              </button>
            </div>
            <div class="space-y-4">
              {#each imagePreviews as preview, index}
                <div class="flex items-center gap-4 bg-white p-4">
                  <div class="relative flex-shrink-0">
                    {#if images[index]?.type.startsWith('image/')}
                      <img src={preview} alt="Preview {index + 1}" class="w-24 h-24 object-cover" />
                    {:else if images[index]?.type.startsWith('video/')}
                      <div class="w-24 h-24 bg-black flex items-center justify-center">
                        <svg class="w-12 h-12 text-white" fill="currentColor" viewBox="0 0 20 20">
                          <path
                            d="M6.3 2.841A1.5 1.5 0 004 4.11V15.89a1.5 1.5 0 002.3 1.269l9.344-5.89a1.5 1.5 0 000-2.538L6.3 2.84z"
                          />
                        </svg>
                      </div>
                    {/if}
                  </div>
                  <div class="flex-1">
                    <p class="text-sm text-black font-medium">{t('common.order')}: {index + 1}</p>
                    <p class="text-xs text-gray-600">{images[index]?.name || 'File'}</p>
                  </div>
                  <div class="flex gap-2">
                    <button
                      type="button"
                      on:click={() => moveImage(index, 'up')}
                      disabled={index === 0}
                      class="px-3 py-1 bg-white border border-gray-300 text-sm hover:bg-gray-100 transition-colors text-black disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Move up"
                    >
                      ↑
                    </button>
                    <button
                      type="button"
                      on:click={() => moveImage(index, 'down')}
                      disabled={index === images.length - 1}
                      class="px-3 py-1 bg-white border border-gray-300 text-sm hover:bg-gray-100 transition-colors text-black disabled:opacity-50 disabled:cursor-not-allowed"
                      title="Move down"
                    >
                      ↓
                    </button>
                    <button
                      type="button"
                      on:click={() => removeImage(index)}
                      class="px-3 py-1 bg-white border border-red-500/20 text-sm text-red-400 hover:bg-red-50 transition-colors"
                      title="Delete"
                    >
                      {t('common.delete')}
                    </button>
                  </div>
                </div>
              {/each}
            </div>
          </div>
        {/if}
      </div>
    {/if}

    <div class="flex flex-col sm:flex-row gap-4">
      <button
        type="submit"
        disabled={loading}
        class="px-6 py-2 bg-accent text-dark hover:bg-accent-muted transition-colors disabled:opacity-50 w-full sm:w-auto"
      >
        {loading ? t('product.creating') : t('product.createProduct')}
      </button>
      <a
        href="/admin/products"
        class="px-6 py-2 bg-white border border-gray-300 hover:bg-gray-100 transition-colors text-black text-center w-full sm:w-auto"
      >
        {t('common.cancel')}
      </a>
    </div>
  </form>
</div>
