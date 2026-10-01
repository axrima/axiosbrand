import { writable } from 'svelte/store';
import { get } from 'svelte/store';
import { browser } from '$app/environment';
import { authStore } from './auth.store';
import { customerApi } from '$lib/api/customer.api';
import { ensureLanguageLoaded } from '$lib/utils/i18n-loader';

/** Locale codes with a messages file in `utils/i18n/*.ts` — keep in sync with `i18n.ts` `translations`. */
export const supportedLanguages = [
  'en',
  'ru',
  'fr',
  'de',
  'es',
  'ja',
  'zh',
  'ko',
  'ar',
  'hi',
  'it',
  'nl',
  'pl',
  'pt',
];
export const defaultLanguage = 'en';
export const i18nBundleVersion = writable(0);

const ISO639_1 = /^[a-z]{2}$/;

function normalizeLangCode(code: string | null | undefined): string | null {
  if (code == null || typeof code !== 'string') return null;
  const n = code.toLowerCase().trim();
  return ISO639_1.test(n) ? n : null;
}

/** Active language codes from API (admin-configured). Used for validation and browser-based init. */
let allowedLanguageCodes: string[] = [];

function getAllowedCodes(): string[] {
  return allowedLanguageCodes.length > 0 ? allowedLanguageCodes : supportedLanguages;
}

function bumpBundleVersion() {
  i18nBundleVersion.update((version) => version + 1);
}

const createI18nStore = () => {
  const { subscribe, set } = writable<string>(defaultLanguage);
  let currentLanguage = defaultLanguage;

  const updateLanguage = (lang: string) => {
    currentLanguage = lang;
    set(lang);
  };

  // Load language on init from localStorage. Accept any ISO 639-1 code so API-only locales work; `t()` falls back to EN for missing keys.
  if (browser) {
    const stored = normalizeLangCode(localStorage.getItem('language'));
    if (stored) {
      updateLanguage(stored);
      void ensureLanguageLoaded(stored)
        .then(() => bumpBundleVersion())
        .catch(() => {});
    } else {
      updateLanguage(defaultLanguage);
    }
  }

  return {
    subscribe,
    setLanguage: async (lang: string, options?: { persist?: boolean }): Promise<boolean> => {
      const normalized = normalizeLangCode(lang);
      if (!normalized) return false;
      const allowed = getAllowedCodes();
      if (!allowed.includes(normalized)) return false;

      const changed = currentLanguage !== normalized;
      if (changed) {
        updateLanguage(normalized);
      }

      // Persist when language changes, or when caller asks (auto-detect may match in-memory default).
      if (browser && (changed || options?.persist)) {
        localStorage.setItem('language', normalized);
      }

      if (!changed) {
        return false;
      }

      void ensureLanguageLoaded(normalized)
        .then(() => bumpBundleVersion())
        .catch((error) => {
          console.error('Failed to load language bundle:', error);
        });

      if (browser) {
        // Persist to user profile when customer is logged in
        const auth = get(authStore);
        if (auth?.user?.role === 'CUSTOMER') {
          customerApi.updateProfile({ preferredLanguage: normalized }).catch(() => {});
        }
      }
      return true;
    },
    /** Set active language codes from API (used after fetch in initLanguageFromBrowser). */
    setAllowedLanguages: (codes: string[]) => {
      allowedLanguageCodes = codes;
    },
  };
};

export const i18nStore = createI18nStore();

/**
 * Resolves initial language from browser when user has no saved preference.
 * Uses only admin-configured active languages and default language from API.
 * Always syncs allowed languages from API for setLanguage() validation.
 * Call from root layout onMount. Returns true if language was set and page should reload.
 */
export async function initLanguageFromBrowser(): Promise<boolean> {
  if (!browser) return false;

  try {
    const { languageApi } = await import('$lib/api/language.api');
    const [activeRes, defaultRes] = await Promise.all([
      languageApi.getAll(true),
      languageApi.getDefault(),
    ]);
    const activeCodes = (activeRes.languages ?? []).map((l) => l.code.toLowerCase());
    const defaultCode = (defaultRes.language?.code ?? defaultLanguage).toLowerCase();
    i18nStore.setAllowedLanguages(activeCodes);

    // Align store with localStorage when the saved locale is still active (no reload — avoids reload loops).
    const storedPref = normalizeLangCode(localStorage.getItem('language'));
    if (storedPref && activeCodes.length > 0 && activeCodes.includes(storedPref)) {
      await i18nStore.setLanguage(storedPref);
    }

    const current = get(i18nStore);
    const hasStored = !!normalizeLangCode(localStorage.getItem('language'));

    // If current language is no longer active, fall back — must use a code that exists in activeCodes or setLanguage no-ops and we must not reload forever.
    if (activeCodes.length > 0 && !activeCodes.includes(current)) {
      const fallback = activeCodes.includes(defaultCode) ? defaultCode : activeCodes[0];
      if (fallback && fallback !== current) {
        const before = get(i18nStore);
        await i18nStore.setLanguage(fallback);
        if (get(i18nStore) !== before) {
          return true;
        }
      }
      return false;
    }

    if (hasStored) return false;

    const browserLang = navigator.language || navigator.languages?.[0] || '';
    const browserLangCode = browserLang.split('-')[0].toLowerCase();
    const resolved = activeCodes.includes(browserLangCode)
      ? browserLangCode
      : activeCodes.includes(defaultCode)
        ? defaultCode
        : (activeCodes[0] ?? defaultCode);
    if (resolved && resolved !== current) {
      const before = get(i18nStore);
      await i18nStore.setLanguage(resolved);
      if (get(i18nStore) !== before) {
        return true;
      }
    }
  } catch (e) {
    console.error('Failed to init language from browser:', e);
  }
  return false;
}
