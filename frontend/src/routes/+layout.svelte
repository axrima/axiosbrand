<script lang="ts">
  import '../app.css';
  import Nav from '$lib/components/Nav.svelte';
  import Notification from '$lib/components/Notification.svelte';
  import Dialog from '$lib/components/Dialog.svelte';
  import CartDrawer from '$lib/components/CartDrawer.svelte';
  import RateLimitBanner from '$lib/components/RateLimitBanner.svelte';
  import GPTAssistantChat from '$lib/components/GPTAssistantChat.svelte';
  import { onMount, onDestroy } from 'svelte';
  import { authStore } from '$lib/stores/auth.store';
  import { settingsStore } from '$lib/stores/settings.store';
  import { gptVisibilityStore } from '$lib/stores/gpt-visibility.store';
  import { i18nBundleVersion, i18nStore } from '$lib/stores/i18n.store';
  import { initLocaleFromBrowser } from '$lib/utils/locale-preferences';
  import { browser } from '$app/environment';
  import { beforeNavigate, afterNavigate } from '$app/navigation';
  import { page } from '$app/stores';

  const gaId = import.meta.env.VITE_GA_ID;

  /** Cleanup for GPT visibility tab listener (set in onMount). */
  let cleanupGptVisibility: (() => void) | null = null;

  import { setupGlobalDialogs } from '$lib/utils/dialog.utils';

  // Global scroll restoration function
  function restoreScroll() {
    if (browser) {
      document.body.style.overflow = '';
      document.body.style.paddingRight = '';
    }
  }

  onMount(() => {
    if (browser) {
      // Fix: Restore scroll on mount in case it was blocked
      restoreScroll();

      // Setup global dialogs to replace browser alerts
      setupGlobalDialogs();

      // Language + region: sync with API and browser locale on first load.
      initLocaleFromBrowser()
        .then((shouldReload) => {
          // One-time reload when auto-detect switches away from the in-memory default
          // so the first paint is fully translated (avoids reload loops once persisted).
          if (shouldReload) {
            window.location.reload();
          }
        })
        .catch((e) => {
          console.error('Failed to initialize locale preferences:', e);
        });

      // Load settings to apply typography
      settingsStore.load().catch((e) => {
        console.error('Failed to load settings:', e);
      });
      gptVisibilityStore.load().catch(() => {});

      // Reload GPT visibility when tab becomes visible (e.g. after admin changed settings in another tab)
      const onVisibilityChange = () => {
        if (document.visibilityState === 'visible') {
          gptVisibilityStore.load().catch(() => {});
        }
      };
      document.addEventListener('visibilitychange', onVisibilityChange);
      cleanupGptVisibility = () =>
        document.removeEventListener('visibilitychange', onVisibilityChange);

      // Restore authenticated session from secure httpOnly cookies.
      authStore.checkAuth().catch(() => {
        // If check fails, auth store will clear itself.
      });
    }
  });

  // Restore scroll before navigation
  beforeNavigate(() => {
    restoreScroll();
  });

  // Restore scroll after navigation; capture ?promo= from URL for partner links (cart/checkout/register)
  afterNavigate(() => {
    restoreScroll();
    if (browser && typeof window !== 'undefined') {
      const params = new URLSearchParams(window.location.search);
      const promo = params.get('promo')?.trim();
      if (promo) {
        sessionStorage.setItem('applied_promo_code', promo);
        params.delete('promo');
        const search = params.toString();
        const clean =
          window.location.pathname + (search ? '?' + search : '') + window.location.hash;
        window.history.replaceState({}, '', clean);
      }
    }
  });

  onDestroy(() => {
    if (browser && cleanupGptVisibility) {
      cleanupGptVisibility();
      cleanupGptVisibility = null;
    }
    // Ensure scroll is restored when component is destroyed
    restoreScroll();
  });
</script>

<svelte:head>
  <link rel="icon" type="image/png" href="/favicon.ico" sizes="32x32" />
  <link rel="icon" type="image/svg+xml" href="/favicon.svg" />
  <link rel="shortcut icon" href="/favicon.ico" />
  <link rel="apple-touch-icon" href="/apple-touch-icon.png" sizes="180x180" />
  {#if gaId}
    <script async src="https://www.googletagmanager.com/gtag/js?id={gaId}"></script>
    <script>
      window.dataLayer = window.dataLayer || [];
      function gtag() {
        dataLayer.push(arguments);
      }
      gtag('js', new Date());
      gtag('config', '{gaId}');
    </script>
  {/if}
</svelte:head>

<div class="min-h-screen flex flex-col">
  <RateLimitBanner />
  {#key `${$i18nStore}:${$i18nBundleVersion}`}
    <Nav />
  {/key}
  <main class="flex-1">
    {#key `${$i18nStore}:${$i18nBundleVersion}`}
      <slot />
    {/key}
  </main>
  <Notification />
  <Dialog />
  <CartDrawer />

  <!-- GPT Assistant Chat for customers/guests (only when enabled in settings) -->
  {#if !$page.url.pathname.startsWith('/admin') && !$page.url.pathname.startsWith('/account') && $gptVisibilityStore}
    {#if $authStore.isAuthenticated && $gptVisibilityStore.enabledCustomer}
      <GPTAssistantChat userType="customer" />
    {:else if !$authStore.isAuthenticated && $gptVisibilityStore.enabledGuest}
      <GPTAssistantChat userType="customer" />
    {/if}
  {/if}
</div>
