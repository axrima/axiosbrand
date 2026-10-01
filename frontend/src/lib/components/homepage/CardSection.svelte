<script lang="ts">
  import type { HomepageSection } from '$lib/api/homepage.api';
  import type { CardItem } from '$lib/api/homepage.api';
  import BlurredImage from '$lib/components/BlurredImage.svelte';
  import HomepageAutoplayVideo from '$lib/components/homepage/HomepageAutoplayVideo.svelte';

  export let section: HomepageSection | null = null;

  $: config = section?.config || {};
  $: title = typeof section?.title === 'string' ? section.title.trim() : '';
  $: cards = (config.cards as CardItem[]) || [];
  $: gridColumns = config.gridColumns || 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3';
  $: gap = config.gap || 'gap-4';
</script>

{#if section?.isActive}
  <section class="container-custom py-2">
    {#if title}
      <h2 class="text-5xl font-bold mb-12 text-center">{title}</h2>
    {/if}

    {#if cards.length > 0}
      <div class="grid {gridColumns} {gap}">
        {#each cards as card, index}
          {#if card.link}
            <a href={card.link} class="group block">
              <div
                class="relative overflow-hidden {card.borderRadius === '' ||
                card.borderRadius === 'rounded-none'
                  ? 'rounded-none'
                  : card.borderRadius || 'rounded-lg'} aspect-[4/5]"
              >
                {#if card.videoUrl}
                  <HomepageAutoplayVideo
                    src={card.videoUrl}
                    poster={card.imageUrl || ''}
                    autoplay
                    loop
                    muted
                    playsinline
                    className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300 group-hover:brightness-75"
                    preload="metadata"
                    ariaLabel={card.title || `Card ${index + 1}`}
                  />
                {:else if card.imageUrl}
                  <BlurredImage
                    src={card.imageUrl}
                    alt={card.title || `Card ${index + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300 group-hover:brightness-75"
                    eager={false}
                    fetchPriority="low"
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                  />
                {/if}
                {#if card.title}
                  <!-- Overlay that appears on hover -->
                  <div
                    class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  ></div>
                  <!-- Text overlay -->
                  <div
                    class="absolute inset-0 flex items-center justify-center p-6 pointer-events-none {card.showTitleOnHover
                      ? 'opacity-0 group-hover:opacity-100 transition-opacity duration-300'
                      : 'opacity-100'}"
                  >
                    <h3
                      class="text-xl font-medium text-center"
                      style="color: {card.titleColor || '#ffffff'}"
                    >
                      {card.title}
                    </h3>
                  </div>
                {/if}
              </div>
            </a>
          {:else}
            <div class="group block">
              <div
                class="relative overflow-hidden {card.borderRadius === '' ||
                card.borderRadius === 'rounded-none'
                  ? 'rounded-none'
                  : card.borderRadius || 'rounded-lg'} aspect-[4/5]"
              >
                {#if card.videoUrl}
                  <HomepageAutoplayVideo
                    src={card.videoUrl}
                    poster={card.imageUrl || ''}
                    autoplay
                    loop
                    muted
                    playsinline
                    className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300 group-hover:brightness-75"
                    preload="metadata"
                    ariaLabel={card.title || `Card ${index + 1}`}
                  />
                {:else if card.imageUrl}
                  <BlurredImage
                    src={card.imageUrl}
                    alt={card.title || `Card ${index + 1}`}
                    className="w-full h-full object-cover group-hover:scale-105 transition-all duration-300 group-hover:brightness-75"
                    eager={false}
                    fetchPriority="low"
                    sizes="(max-width: 768px) 100vw, (max-width: 1280px) 50vw, 33vw"
                  />
                {/if}
                {#if card.title}
                  <!-- Overlay that appears on hover -->
                  <div
                    class="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                  ></div>
                  <!-- Text overlay -->
                  <div
                    class="absolute inset-0 flex items-center justify-center p-6 pointer-events-none {card.showTitleOnHover
                      ? 'opacity-0 group-hover:opacity-100 transition-opacity duration-300'
                      : 'opacity-100'}"
                  >
                    <h3
                      class="text-xl font-medium text-center"
                      style="color: {card.titleColor || '#ffffff'}"
                    >
                      {card.title}
                    </h3>
                  </div>
                {/if}
              </div>
            </div>
          {/if}
        {/each}
      </div>
    {:else}
      <!-- Placeholder when no cards -->
      <div class="grid {gridColumns} {gap}">
        {#each Array(3) as _}
          <div class="bg-dark-light aspect-[4/5] rounded-lg"></div>
        {/each}
      </div>
    {/if}
  </section>
{/if}
