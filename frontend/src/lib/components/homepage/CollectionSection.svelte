<script lang="ts">
  import type { HomepageSection } from '$lib/api/homepage.api';
  import type { Product } from '$lib/api/product.api';
  import { formatPrice } from '$lib/utils/price.utils';
  import {
    getCatalogPrimaryImageLoading,
    getProductImageAlt,
    getSecondaryMediaStatus,
    setSecondaryMediaStatus,
  } from '$lib/utils/image.utils';
  import { currencyStore } from '$lib/stores/currency.store';
  import { settingsStore } from '$lib/stores/settings.store';
  import { cartStore } from '$lib/stores/cart.store';
  import { notificationStore } from '$lib/stores/notification.store';
  import { t } from '$lib/utils/i18n';
  import BlurredImage from '$lib/components/BlurredImage.svelte';
  import HomepageAutoplayVideo from '$lib/components/homepage/HomepageAutoplayVideo.svelte';

  export let section: HomepageSection | null = null;
  export let products: Product[] = [];

  $: currentCurrency = $currencyStore;

  $: config = section?.config || {};
  $: title = typeof section?.title === 'string' ? section.title.trim() : '';
  $: productIds = config.products || [];
  $: displayedProducts = products.filter((p) => productIds.includes(p.id)).slice(0, 12);

  // Shop page design from settings (same as /shop and admin shop-page-design)
  $: shopGridColumns = $settingsStore.shopGridColumns ?? '4';
  $: shopGridGap = $settingsStore.shopGridGap ?? '6';
  $: shopCardAspectRatio = $settingsStore.shopCardAspectRatio ?? '9/16';
  $: shopCardHoverImage = $settingsStore.shopCardHoverImage ?? true;
  $: shopCardHoverAnimation = $settingsStore.shopCardHoverAnimation ?? 'scale';
  $: shopCardVideoSupport = $settingsStore.shopCardVideoSupport ?? true;
  $: shopCardShowQuickAdd = $settingsStore.shopCardShowQuickAdd ?? false;
  $: quickViewEnabled = $settingsStore.quickViewEnabled ?? true;
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
  $: shopGridClass = `grid ${gridColsClassMap[shopGridColumns] || gridColsClassMap['4']} ${gridGapClassMap[shopGridGap] || 'gap-6'}`;

  let hoveredCardIndex: number | null = null;
  let secondaryMediaStatusByKey: Record<string, 'idle' | 'loading' | 'loaded' | 'error'> = {};
  let quickViewProduct: Product | null = null;

  function handleSecondaryMediaStateChange(
    productId: string,
    url: string,
    event: CustomEvent<{ src: string; status: 'idle' | 'loading' | 'loaded' | 'error' }>
  ) {
    if (event.detail.src !== url) return;

    secondaryMediaStatusByKey = setSecondaryMediaStatus(
      secondaryMediaStatusByKey,
      productId,
      url,
      event.detail.status
    );
  }

  function isVideoUrl(url: string): boolean {
    if (!url) return false;
    const u = url.toLowerCase();
    return u.includes('.mp4') || u.includes('.webm') || u.includes('.mov') || u.includes('video/');
  }

  async function addToCart(productId: string) {
    try {
      await cartStore.add(productId, 1);
      /* Cart drawer opens automatically via lastAddedToCartStore */
    } catch (e) {
      const errorMessage = e instanceof Error ? e.message : 'Failed to add product to bag';
      notificationStore.error(errorMessage);
    }
  }
</script>

{#if section?.isActive}
  <section class="container-custom py-20">
    {#if title}
      <h2 class="text-5xl font-bold mb-12 text-center">{title}</h2>
    {/if}

    {#if displayedProducts.length > 0}
      <div class={shopGridClass}>
        {#each displayedProducts as product, index}
          {@const isCardHovered = hoveredCardIndex === index}
          {@const images = Array.isArray(product.images) ? product.images : []}
          {@const hasSecondImage = images.length > 1 && shopCardHoverImage}
          {@const secondImageUrl = hasSecondImage && images[1] ? images[1].url : ''}
          {@const secondImageLoaded = secondImageUrl
            ? getSecondaryMediaStatus(secondaryMediaStatusByKey, product.id, secondImageUrl) ===
              'loaded'
            : false}
          {@const showSecondImage = hasSecondImage && isCardHovered && secondImageLoaded}
          {@const primaryImageLoading = getCatalogPrimaryImageLoading(index)}
          <a
            href="/shop/product/{product.slug}"
            class="group block"
            on:mouseenter={() => (hoveredCardIndex = index)}
            on:mouseleave={() => (hoveredCardIndex = null)}
          >
            <div
              class="bg-gray-100 overflow-hidden mb-3 relative shop-card-image-wrap collection-card-image-wrap"
              style="aspect-ratio: {shopCardAspectRatio};"
              role="presentation"
            >
              {#if images.length > 0}
                {#if shopCardVideoSupport && isVideoUrl(images[0].url)}
                  <HomepageAutoplayVideo
                    src={images[0].url}
                    poster={images.find((img) => !isVideoUrl(img.url))?.url || ''}
                    className="w-full h-full object-cover {shopCardHoverAnimation === 'scale'
                      ? 'group-hover:scale-105 transition-transform duration-300'
                      : ''}"
                    muted
                    loop
                    playsinline
                    autoplay
                    preload="metadata"
                    ariaLabel={product.name}
                  />
                {:else}
                  <div
                    class="shop-card-first-img absolute inset-0 z-0 transition-opacity duration-300 ease-in-out {hasSecondImage
                      ? 'has-second-img'
                      : ''} {!hasSecondImage && shopCardHoverAnimation === 'scale'
                      ? 'transition-transform duration-300 group-hover:scale-105'
                      : ''}"
                    style={hasSecondImage && showSecondImage ? 'opacity: 0;' : ''}
                  >
                    <BlurredImage
                      src={images[0].url}
                      alt={getProductImageAlt(images[0].alt, product.name)}
                      className="w-full h-full object-cover {!hasSecondImage &&
                      shopCardHoverAnimation === 'scale'
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
              <p class="text-sm font-medium text-black">{formatPrice(product.price ?? 0)}</p>
              {#if product.compareAtPrice != null && product.price != null && Number(product.compareAtPrice) > Number(product.price)}
                <p class="text-sm text-gray-500 line-through">
                  {formatPrice(product.compareAtPrice)}
                </p>
              {/if}
            </div>
            <div class="flex flex-col gap-2">
              <button
                type="button"
                class="w-full py-2 bg-black text-white font-medium hover:bg-gray-800 transition-colors text-sm {shopCardShowQuickAdd
                  ? 'opacity-0 group-hover:opacity-100 transition-opacity'
                  : 'hidden'}"
                on:click|preventDefault|stopPropagation={() => addToCart(product.id)}
              >
                {t('productPage.addToBag')}
              </button>
            </div>
          </a>
        {/each}
      </div>
    {:else}
      <div class={shopGridClass}>
        {#each Array(3) as _}
          <div class="bg-dark-light rounded" style="aspect-ratio: {shopCardAspectRatio};"></div>
        {/each}
      </div>
    {/if}
  </section>

  <!-- Quick View modal (same as shop page) -->
  {#if quickViewProduct}
    <div
      class="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/50"
      role="dialog"
      aria-modal="true"
      aria-labelledby="quick-view-title-collection"
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
          <h2 id="quick-view-title-collection" class="text-lg font-medium text-black mb-2">
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
              {t('productPage.addToBag')}
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
{/if}

<style>
  :global(.collection-card-image-wrap) {
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
