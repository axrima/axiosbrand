<script lang="ts">
  import type { HomepageSection } from '$lib/api/homepage.api';
  import { blogApi, type BlogPost } from '$lib/api/blog.api';
  import BlurredImage from '$lib/components/BlurredImage.svelte';
  import HomepageAutoplayVideo from '$lib/components/homepage/HomepageAutoplayVideo.svelte';
  import { i18nStore } from '$lib/stores/i18n.store';
  import { t } from '$lib/utils/i18n';

  export let section: HomepageSection | null = null;

  let posts: BlogPost[] = [];
  let loading = true;

  $: currentLanguage = $i18nStore;
  $: config = section?.config || {};
  $: title = typeof section?.title === 'string' ? section.title.trim() : '';
  $: displayMode = config.displayMode === 'featured' ? 'featured' : 'latest';
  $: limit = Math.min(Math.max(Number(config.limit) || 6, 1), 12);
  $: postIds = Array.isArray(config.postIds) ? config.postIds : [];

  $: displayedPosts = (() => {
    if (displayMode === 'featured' && postIds.length > 0) {
      const byId = new Map(posts.map((p) => [p.id, p]));
      return postIds.map((id) => byId.get(id)).filter(Boolean) as BlogPost[];
    }
    return posts.slice(0, limit);
  })();

  async function loadPosts() {
    if (!section?.isActive || !currentLanguage) return;
    loading = true;
    try {
      const res = await blogApi.getAllPosts(true, currentLanguage);
      posts = res.posts;
    } catch (e) {
      console.error('Failed to load blog posts for homepage section:', e);
      posts = [];
    } finally {
      loading = false;
    }
  }

  $: if (section?.isActive && currentLanguage) void loadPosts();

  function formatDate(dateString: string) {
    return new Date(dateString).toLocaleDateString(currentLanguage || 'en', {
      year: 'numeric',
      month: 'short',
      day: 'numeric',
    });
  }
</script>

{#if section?.isActive}
  <section class="container-custom py-20">
    {#if title}
      <h2 class="text-5xl font-bold mb-12 text-center">{title}</h2>
    {/if}

    {#if loading}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {#each Array(limit) as _}
          <div class="animate-pulse">
            <div class="aspect-video bg-dark-light rounded-lg mb-4"></div>
            <div class="h-6 bg-dark-light rounded w-3/4 mb-2"></div>
            <div class="h-4 bg-dark-light rounded w-full mb-2"></div>
            <div class="h-4 bg-dark-light rounded w-1/2"></div>
          </div>
        {/each}
      </div>
    {:else if displayedPosts.length > 0}
      <div class="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
        {#each displayedPosts as post}
          <a href="/blog/{post.slug}" class="block group rounded-lg overflow-hidden bg-dark-light">
            <article class="h-full">
              <div class="relative aspect-video overflow-hidden">
                {#if post.videoUrl}
                  <HomepageAutoplayVideo
                    src={post.videoUrl}
                    poster={post.thumbnailUrl || ''}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    muted
                    loop
                    playsinline
                    autoplay
                    preload="metadata"
                    ariaLabel={post.title}
                  />
                {:else if post.thumbnailUrl}
                  <BlurredImage
                    src={post.thumbnailUrl}
                    alt={post.title}
                    className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                    loading="lazy"
                    fetchPriority="low"
                  />
                {:else}
                  <div class="w-full h-full bg-dark flex items-center justify-center">
                    <svg
                      class="w-16 h-16 text-accent-muted"
                      fill="none"
                      stroke="currentColor"
                      viewBox="0 0 24 24"
                    >
                      <path
                        stroke-linecap="round"
                        stroke-linejoin="round"
                        stroke-width="2"
                        d="M4 16l4.586-4.586a2 2 0 012.828 0L16 16m-2-2l1.586-1.586a2 2 0 012.828 0L20 14m-6-6h.01M6 20h12a2 2 0 002-2V6a2 2 0 00-2-2H6a2 2 0 00-2 2v12a2 2 0 002 2z"
                      />
                    </svg>
                  </div>
                {/if}
              </div>
              <div class="p-4">
                <h3
                  class="text-xl font-bold mb-2 group-hover:opacity-80 transition-opacity line-clamp-2"
                >
                  {post.title}
                </h3>
                {#if post.excerpt}
                  <p class="text-accent-muted text-sm mb-3 line-clamp-2">{post.excerpt}</p>
                {/if}
                {#if post.publishedAt}
                  <p class="text-xs text-accent-muted">{formatDate(post.publishedAt)}</p>
                {/if}
              </div>
            </article>
          </a>
        {/each}
      </div>
      <div class="text-center mt-8">
        <a
          href="/blog"
          class="inline-block px-6 py-2 bg-accent text-dark hover:bg-accent-muted transition-colors"
        >
          {t('homepage.viewAllBlog')}
        </a>
      </div>
    {:else}
      <p class="text-center text-accent-muted py-8">{t('homepage.noBlogPosts')}</p>
    {/if}
  </section>
{/if}
