import { browser } from '$app/environment';
import { get, writable } from 'svelte/store';
import { countryApi, type Country } from '$lib/api/country.api';
import { languageApi } from '$lib/api/language.api';
import { currencyStore, defaultCurrency } from '$lib/stores/currency.store';
import { defaultLanguage, i18nStore, supportedLanguages } from '$lib/stores/i18n.store';

const LOCALE_PREFERENCE_MODE_KEY = 'localePreferenceMode';
const LOCALE_PREFS_VERSION_KEY = 'localePrefsVersion';
/** Bump when auto-detect rules change so stuck US/en prefs can recover once. */
const LOCALE_PREFS_VERSION = '2';

export type LocalePreferenceMode = 'auto' | 'language' | 'region';

/** Current region code for header/nav; updated by locale init and user selection. */
export const selectedCountryStore = writable<string | null>(null);

let initPromise: Promise<boolean> | null = null;

function normalizeCode(code: string | null | undefined): string | null {
  if (typeof code !== 'string') return null;
  const normalized = code.trim().toLowerCase();
  return normalized ? normalized : null;
}

function normalizeCountryCode(code: string | null | undefined): string | null {
  const normalized = normalizeCode(code);
  return normalized ? normalized.toUpperCase() : null;
}

/** Full browser locale list, most-preferred first (`ru-RU`, `ru`, `en-US`, …). */
function getBrowserLocales(): string[] {
  if (!browser) return [];
  const seen = new Set<string>();
  const locales: string[] = [];
  const candidates = [
    ...(Array.isArray(navigator.languages) ? navigator.languages : []),
    navigator.language,
  ];
  for (const raw of candidates) {
    if (typeof raw !== 'string') continue;
    const locale = raw.trim();
    if (!locale) continue;
    const key = locale.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    locales.push(locale);
  }
  return locales;
}

function getBrowserLanguageCode(): string | null {
  for (const locale of getBrowserLocales()) {
    const lang = normalizeCode(locale.split('-')[0]);
    if (lang) return lang;
  }
  return null;
}

function getBrowserRegionCode(): string | null {
  for (const locale of getBrowserLocales()) {
    const region = locale.split('-')[1];
    if (region) return region.toUpperCase();
  }
  return null;
}

export function getLocalePreferenceMode(): LocalePreferenceMode {
  if (!browser) return 'auto';
  const stored = normalizeCode(localStorage.getItem(LOCALE_PREFERENCE_MODE_KEY));
  return stored === 'language' || stored === 'region' || stored === 'auto' ? stored : 'auto';
}

export function setLocalePreferenceMode(mode: LocalePreferenceMode): void {
  if (!browser) return;
  localStorage.setItem(LOCALE_PREFERENCE_MODE_KEY, mode);
}

function pickPreferredCountry(matches: Country[]): Country | null {
  if (matches.length === 0) return null;
  return matches.find((country) => country.isDefault) ?? matches[0];
}

/**
 * Resolve region for a UI language.
 * Order: browser region tag → countries for that language (default first) →
 * language-specific hints → optional API/admin default country.
 */
export function resolveCountryForLanguage(
  languageCode: string,
  countries: Country[],
  browserLocale?: string,
  fallbackCountry?: Country | null
): Country | null {
  const lang = normalizeCode(languageCode);
  if (!lang || countries.length === 0) return fallbackCountry ?? null;

  const regionCandidates: string[] = [];
  if (browserLocale) {
    const region = browserLocale.split('-')[1]?.toUpperCase();
    if (region) regionCandidates.push(region);
  }
  for (const locale of getBrowserLocales()) {
    const region = locale.split('-')[1]?.toUpperCase();
    if (region && !regionCandidates.includes(region)) regionCandidates.push(region);
  }
  // Also accept bare region from primary helper when locales were empty above
  const primaryRegion = getBrowserRegionCode();
  if (primaryRegion && !regionCandidates.includes(primaryRegion)) {
    regionCandidates.push(primaryRegion);
  }

  for (const regionCode of regionCandidates) {
    const byRegion = countries.find(
      (country) => normalizeCountryCode(country.code) === regionCode
    );
    if (byRegion) return byRegion;
  }

  const byLanguage = pickPreferredCountry(
    countries.filter((country) => normalizeCode(country.language) === lang)
  );
  if (byLanguage) return byLanguage;

  if (lang === 'ru') {
    const ruCountry =
      countries.find((country) => normalizeCountryCode(country.code) === 'RU') ||
      countries.find((country) => country.currency?.toUpperCase() === 'RUB');
    if (ruCountry) return ruCountry;
  }

  if (fallbackCountry) {
    const fallbackCode = normalizeCountryCode(fallbackCountry.code);
    const activeFallback = countries.find(
      (country) => normalizeCountryCode(country.code) === fallbackCode
    );
    if (activeFallback) return activeFallback;
  }

  return pickPreferredCountry(countries.filter((country) => country.isDefault)) ?? countries[0] ?? null;
}

/** Align header region country with selected checkout currency (e.g. RUB → RU for tax). */
export async function syncCountryCodeForCurrency(
  currency: string,
  countries?: Country[]
): Promise<void> {
  if (!browser) return;

  const normalizedCurrency = currency.trim().toUpperCase();
  if (!normalizedCurrency) return;

  let activeCountries = countries;
  if (!activeCountries?.length) {
    try {
      const response = await countryApi.getAll(true);
      activeCountries = response.countries ?? [];
    } catch (error) {
      console.error('Failed to load countries for currency sync:', error);
      return;
    }
  }

  const matches = activeCountries.filter(
    (country) => (country.currency || '').trim().toUpperCase() === normalizedCurrency
  );
  if (matches.length === 0) return;

  const storedCode = normalizeCountryCode(localStorage.getItem('selectedCountryCode'));
  const currentMatch = matches.find((country) => country.code === storedCode);
  const nextCountry = currentMatch ?? matches.find((country) => country.isDefault) ?? matches[0];

  localStorage.setItem('selectedCountryCode', nextCountry.code);
  selectedCountryStore.set(nextCountry.code);
}

export async function applyCountrySelection(country: Country | null): Promise<void> {
  if (!browser) return;

  if (country) {
    localStorage.setItem('selectedCountryCode', country.code);
    selectedCountryStore.set(country.code);
    const currency = country.currency?.trim().toUpperCase();
    const enabledCurrencies = currencyStore.getEnabledCurrencies();
    const fallbackCurrency = currencyStore.getDefaultCurrency();
    if (currency && enabledCurrencies.includes(currency)) {
      currencyStore.setCurrency(currency);
    } else {
      currencyStore.setCurrency(fallbackCurrency || defaultCurrency);
    }
  } else {
    localStorage.removeItem('selectedCountryCode');
    selectedCountryStore.set(null);
    currencyStore.setCurrency(currencyStore.getDefaultCurrency() || defaultCurrency);
  }

  await currencyStore.loadCurrencyPreferences();
  await currencyStore.loadExchangeRates();
}

export async function syncCountryToLanguage(
  languageCode: string,
  countries: Country[],
  browserLocale?: string,
  fallbackCountry?: Country | null
): Promise<Country | null> {
  const matched = resolveCountryForLanguage(
    languageCode,
    countries,
    browserLocale,
    fallbackCountry
  );
  setLocalePreferenceMode('language');
  await applyCountrySelection(matched);
  return matched;
}

export async function applyLanguageSelection(
  languageCode: string,
  countries?: Country[],
  browserLocale?: string
): Promise<boolean> {
  const normalized = normalizeCode(languageCode);
  if (!normalized) return false;

  const changed = await i18nStore.setLanguage(normalized, { persist: true });

  let activeCountries = countries;
  let defaultCountry: Country | null = null;
  if (!activeCountries?.length) {
    try {
      const [countriesRes, defaultCountryRes] = await Promise.all([
        countryApi.getAll(true),
        countryApi.getDefault(),
      ]);
      activeCountries = countriesRes.countries ?? [];
      defaultCountry = defaultCountryRes.country ?? null;
    } catch (error) {
      console.error('Failed to load countries for language locale sync:', error);
      return changed;
    }
  }

  await syncCountryToLanguage(normalized, activeCountries, browserLocale, defaultCountry);
  return changed;
}

/**
 * One-time recovery: older auto-init forced mode=language + en/US even when the
 * browser preferred another active locale. Reset those sticky prefs once.
 */
function migrateStuckAutoLocale(activeLanguageCodes: string[]): void {
  if (!browser) return;
  if (localStorage.getItem(LOCALE_PREFS_VERSION_KEY) === LOCALE_PREFS_VERSION) return;

  const mode = getLocalePreferenceMode();
  const storedLanguage = normalizeCode(localStorage.getItem('language'));
  const storedCountry = normalizeCountryCode(localStorage.getItem('selectedCountryCode'));
  const browserLanguage = getBrowserLanguageCode();

  const looksLikeStuckUsDefault =
    mode === 'language' &&
    storedLanguage === 'en' &&
    (storedCountry === 'US' || !storedCountry) &&
    !!browserLanguage &&
    browserLanguage !== 'en' &&
    activeLanguageCodes.includes(browserLanguage);

  if (looksLikeStuckUsDefault) {
    localStorage.removeItem('language');
    localStorage.removeItem('selectedCountryCode');
    setLocalePreferenceMode('auto');
    selectedCountryStore.set(null);
  }

  localStorage.setItem(LOCALE_PREFS_VERSION_KEY, LOCALE_PREFS_VERSION);
}

/** @returns true when language changed and a one-time reload is recommended */
async function runInitLocaleFromBrowser(): Promise<boolean> {
  if (!browser) return false;

  try {
    // Defaults are optional hints. A failure in either default endpoint must not
    // prevent browser locale detection when the active lists are available.
    const [activeLanguagesResult, activeCountriesResult, defaultLanguageResult, defaultCountryResult] =
      await Promise.allSettled([
        languageApi.getAll(true),
        countryApi.getAll(true),
        languageApi.getDefault(),
        countryApi.getDefault(),
      ]);

    const activeLanguagesRes =
      activeLanguagesResult.status === 'fulfilled'
        ? activeLanguagesResult.value
        : { languages: [] };
    const activeCountriesRes =
      activeCountriesResult.status === 'fulfilled'
        ? activeCountriesResult.value
        : { countries: [] };
    const defaultLanguageRecord =
      defaultLanguageResult.status === 'fulfilled'
        ? defaultLanguageResult.value.language
        : null;
    const defaultCountry =
      defaultCountryResult.status === 'fulfilled'
        ? defaultCountryResult.value.country
        : null;

    const apiLanguageCodes = (activeLanguagesRes.languages ?? []).map((language) =>
      language.code.toLowerCase()
    );
    const activeLanguageCodes = apiLanguageCodes.length > 0 ? apiLanguageCodes : supportedLanguages;
    i18nStore.setAllowedLanguages(activeLanguageCodes);

    migrateStuckAutoLocale(activeLanguageCodes);

    const activeCountries = activeCountriesRes.countries ?? [];
    const storedLanguage = normalizeCode(localStorage.getItem('language'));
    const storedCountryCode = normalizeCountryCode(localStorage.getItem('selectedCountryCode'));
    const storedMode = getLocalePreferenceMode();
    const browserLocales = getBrowserLocales();
    const browserLanguage =
      browserLocales
        .map((locale) => normalizeCode(locale.split('-')[0]))
        .find((code): code is string => !!code && activeLanguageCodes.includes(code)) ?? null;
    const defaultCode = normalizeCode(defaultLanguageRecord?.code) ?? defaultLanguage;
    const languageBefore = normalizeCode(get(i18nStore));

    const storedCountry = storedCountryCode
      ? (activeCountries.find(
          (country) => normalizeCountryCode(country.code) === storedCountryCode
        ) ?? null)
      : null;

    // Explicit user choice: keep region as selected.
    if (storedMode === 'region' && storedCountry) {
      if (storedLanguage && activeLanguageCodes.includes(storedLanguage)) {
        await i18nStore.setLanguage(storedLanguage, { persist: true });
      }
      await applyCountrySelection(storedCountry);
      return false;
    }

    // Explicit user language choice: keep language, sync region from it.
    if (storedMode === 'language' && storedLanguage && activeLanguageCodes.includes(storedLanguage)) {
      await i18nStore.setLanguage(storedLanguage, { persist: true });
      const matchedCountry = resolveCountryForLanguage(
        storedLanguage,
        activeCountries,
        browserLocales[0],
        defaultCountry
      );
      await applyCountrySelection(matchedCountry ?? storedCountry ?? defaultCountry);
      return false;
    }

    // Auto: browser language → admin default language → first active.
    const resolvedLanguage =
      (browserLanguage && activeLanguageCodes.includes(browserLanguage) && browserLanguage) ||
      (storedLanguage && activeLanguageCodes.includes(storedLanguage) && storedLanguage) ||
      (activeLanguageCodes.includes(defaultCode) && defaultCode) ||
      activeLanguageCodes[0] ||
      defaultLanguage;

    await i18nStore.setLanguage(resolvedLanguage, { persist: true });

    const matchedCountry = resolveCountryForLanguage(
      resolvedLanguage,
      activeCountries,
      browserLocales[0],
      defaultCountry
    );

    setLocalePreferenceMode('auto');
    await applyCountrySelection(matchedCountry ?? storedCountry ?? defaultCountry ?? null);

    return languageBefore !== resolvedLanguage;
  } catch (error) {
    console.error('Failed to initialize locale preferences:', error);
    return false;
  }
}

/** Initializes locale; resolves after init completes (shared singleton). */
export async function initLocaleFromBrowser(): Promise<boolean> {
  if (!browser) return false;
  if (!initPromise) {
    initPromise = runInitLocaleFromBrowser();
  }
  return initPromise;
}
