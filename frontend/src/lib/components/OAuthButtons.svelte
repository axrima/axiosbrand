<script lang="ts">
  import { settingsStore } from '$lib/stores/settings.store';
  import { apiClient } from '$lib/api/client';
  import { authStore } from '$lib/stores/auth.store';
  import { goto } from '$app/navigation';
  import { page } from '$app/stores';
  import { onMount } from 'svelte';
  import { getErrorMessage } from '$lib/utils/error-handler';

  let loading = false;
  let error = '';

  function getReturnUrl(): string {
    const returnUrl = $page.url.searchParams.get('returnUrl');
    return returnUrl || '/account/profile';
  }

  async function handleOAuthLogin(provider: string) {
    loading = true;
    error = '';

    try {
      // Get redirect URI
      const redirectUri = `${window.location.origin}/auth/oauth/${provider.toLowerCase()}/callback`;

      // Get authorization URL
      const response = await apiClient.get<{ authUrl: string }>(
        `/auth/oauth/${provider}/initiate?redirectUri=${encodeURIComponent(redirectUri)}`
      );

      // Redirect to OAuth provider
      window.location.href = response.authUrl;
    } catch (e) {
      error = getErrorMessage(e, 'auth.oauthInitFailed');
      loading = false;
    }
  }

  $: enabledProviders = {
    google: $settingsStore.oauthGoogleEnabled,
    yandex: $settingsStore.oauthYandexEnabled,
    vkontakte: $settingsStore.oauthVkontakteEnabled,
    facebook: $settingsStore.oauthFacebookEnabled,
    apple: $settingsStore.oauthAppleEnabled,
  };

  $: hasEnabledProviders = Object.values(enabledProviders).some(Boolean);
</script>

{#if hasEnabledProviders}
  <div class="space-y-3">
    <div class="relative">
      <div class="absolute inset-0 flex items-center">
        <div class="w-full border-t border-gray-300"></div>
      </div>
      <div class="relative flex justify-center text-sm">
        <span class="px-2 bg-white text-gray-500">или</span>
      </div>
    </div>

    {#if error}
      <div class="p-3 bg-red-50 border border-red-200 rounded">
        <p class="text-red-600 text-sm">{error}</p>
      </div>
    {/if}

    <div class="grid grid-cols-2 gap-3">
      {#if enabledProviders.google}
        <button
          type="button"
          on:click={() => handleOAuthLogin('GOOGLE')}
          disabled={loading}
          class="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <svg class="w-5 h-5" viewBox="0 0 24 24">
            <path
              fill="#4285F4"
              d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
            />
            <path
              fill="#34A853"
              d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
            />
            <path
              fill="#FBBC05"
              d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
            />
            <path
              fill="#EA4335"
              d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
            />
          </svg>
          <span class="text-sm font-medium">Google</span>
        </button>
      {/if}

      {#if enabledProviders.yandex}
        <button
          type="button"
          on:click={() => handleOAuthLogin('YANDEX')}
          disabled={loading}
          class="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
        >
          <span class="text-sm font-medium">Яндекс</span>
        </button>
      {/if}

      {#if enabledProviders.vkontakte}
        <button
          type="button"
          on:click={() => handleOAuthLogin('VKONTAKTE')}
          disabled={loading}
          class="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-[#0077FF] text-white border-[#0077FF] hover:bg-[#0066DD]"
        >
          <span class="text-sm font-medium">VK</span>
        </button>
      {/if}

      {#if enabledProviders.facebook}
        <button
          type="button"
          on:click={() => handleOAuthLogin('FACEBOOK')}
          disabled={loading}
          class="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-[#1877F2] text-white border-[#1877F2] hover:bg-[#166FE5]"
        >
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path
              d="M24 12.073c0-6.627-5.373-12-12-12s-12 5.373-12 12c0 5.99 4.388 10.954 10.125 11.854v-8.385H7.078v-3.47h3.047V9.43c0-3.007 1.792-4.669 4.533-4.669 1.312 0 2.686.235 2.686.235v2.953H15.83c-1.491 0-1.956.925-1.956 1.874v2.25h3.328l-.532 3.47h-2.796v8.385C19.612 23.027 24 18.062 24 12.073z"
            />
          </svg>
          <span class="text-sm font-medium">Facebook</span>
        </button>
      {/if}

      {#if enabledProviders.apple}
        <button
          type="button"
          on:click={() => handleOAuthLogin('APPLE')}
          disabled={loading}
          class="flex items-center justify-center gap-2 px-4 py-2 border border-gray-300 rounded hover:bg-gray-50 transition-colors disabled:opacity-50 disabled:cursor-not-allowed bg-black text-white border-black hover:bg-gray-900"
        >
          <svg class="w-5 h-5" fill="currentColor" viewBox="0 0 24 24">
            <path
              d="M17.05 20.28c-.98.95-2.05.88-3.08.4-1.09-.5-2.08-.48-3.24 0-1.44.62-2.2.44-3.08-.4C2.79 15.25 3.51 7.59 9.05 7.31c1.35.07 2.29.74 3.08.8 1.18-.24 2.31-.93 3.57-.84 1.51.12 2.65.72 3.4 1.8-3.12 1.87-2.38 5.98.48 7.13-.57 1.5-1.31 2.99-2.54 4.09l.01-.01zM12.03 7.25c-.15-2.23 1.66-4.07 3.74-4.25.29 2.58-2.34 4.5-3.74 4.25z"
            />
          </svg>
          <span class="text-sm font-medium">Apple</span>
        </button>
      {/if}
    </div>
  </div>
{/if}
