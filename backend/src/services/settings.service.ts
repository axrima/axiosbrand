import prisma from '../config/database';
import { DEFAULT_SETTINGS, FeatureSettings } from '../types/settings';
import { decrypt, encrypt } from '../utils/crypto';

/** Keys whose values are encrypted at rest (tokens, passwords, API keys). */
const SENSITIVE_SETTINGS_KEYS = new Set<string>([
  'pinterestAccessToken',
  'emailNodemailerPassword',
  'emailSendgridApiKey',
  'emailAwsSesAccessKeyId',
  'emailAwsSesSecretAccessKey',
  'emailResendApiKey',
  'emailMailgunApiKey',
  'emailBrevoApiKey',
  'deliveryTrackingApiKey',
  'deliveryTrackingProviders',
]);

const SECRET_PLACEHOLDER = '***hidden***';

function isSensitiveSettingKey(key: string): boolean {
  if (SENSITIVE_SETTINGS_KEYS.has(key)) return true;

  // Broad protection for secret-like keys; keep known public keys excluded.
  const lowered = key.toLowerCase();
  const publicLikeKeys = new Set([
    'captchasitekey',
    'oauthgoogleclientid',
    'oauthyandexclientid',
    'oauthvkontakteclientid',
    'oauthfacebookclientid',
    'oauthappleclientid',
    'yookassashopid',
  ]);
  if (publicLikeKeys.has(lowered)) return false;

  return (
    lowered.includes('secret') ||
    lowered.includes('token') ||
    lowered.includes('password') ||
    lowered.includes('apikey') ||
    lowered.includes('privatekey') ||
    lowered.includes('accesskey') ||
    lowered.includes('clientsecret')
  );
}

function maybeDecrypt(key: string, value: unknown): unknown {
  if (!isSensitiveSettingKey(key) || value == null) return value;
  if (typeof value !== 'string') return value;
  return decrypt(value);
}

function maybeEncrypt(key: string, value: unknown): unknown {
  if (!isSensitiveSettingKey(key) || value == null) return value;
  if (typeof value !== 'string') return value;
  return encrypt(value);
}

function maskIfSensitive(key: string, value: unknown): unknown {
  if (!isSensitiveSettingKey(key)) return value;
  if (typeof value !== 'string') return value;
  return value ? SECRET_PLACEHOLDER : '';
}

function applySensitiveValueWrite(
  key: string,
  value: boolean | string | number | object,
  existing: { id: string } | null
): { value: boolean | string | number | object; skipValueWrite: boolean } {
  if (!isSensitiveSettingKey(key)) {
    return { value, skipValueWrite: false };
  }

  if (typeof value === 'string' && value === SECRET_PLACEHOLDER) {
    if (existing) {
      return { value, skipValueWrite: true };
    }
    // No existing secret to preserve; treat as empty write.
    return { value: '', skipValueWrite: false };
  }

  return { value, skipValueWrite: false };
}

export class SettingsService {
  /** Short TTL cache — settings are read on nearly every request/cleanup tick. */
  private static readonly CACHE_TTL_MS = 30_000;
  private cache: { value: FeatureSettings; expiresAt: number } | null = null;
  private inflightLoad: Promise<FeatureSettings> | null = null;

  private invalidateCache(): void {
    this.cache = null;
  }

  async getAllSettings(): Promise<FeatureSettings> {
    const now = Date.now();
    if (this.cache && this.cache.expiresAt > now) {
      return this.cache.value;
    }

    if (this.inflightLoad) {
      return this.inflightLoad;
    }

    this.inflightLoad = this.loadAllSettingsFromDb()
      .then((value) => {
        this.cache = {
          value,
          expiresAt: Date.now() + SettingsService.CACHE_TTL_MS,
        };
        return value;
      })
      .finally(() => {
        this.inflightLoad = null;
      });

    return this.inflightLoad;
  }

  private async loadAllSettingsFromDb(): Promise<FeatureSettings> {
    try {
      const settings = await prisma.featureSettings.findMany();

      // Convert to object with defaults
      const settingsMap: Partial<FeatureSettings> = {};

      settings.forEach((setting) => {
        const key = setting.key as keyof FeatureSettings;
        // Only set if value is not null/undefined
        if (setting.value !== null && setting.value !== undefined) {
          settingsMap[key] = maybeDecrypt(key, setting.value) as any;
        }
      });

      // Merge with defaults - defaults will be used for missing keys
      return {
        ...DEFAULT_SETTINGS,
        ...settingsMap,
      } as FeatureSettings;
    } catch (error) {
      console.error('Error loading settings from database:', error);
      // Return defaults if database query fails
      return DEFAULT_SETTINGS;
    }
  }

  async getSetting(key: string): Promise<unknown> {
    const all = await this.getAllSettings();
    const defaultKey = key as keyof FeatureSettings;
    if (Object.prototype.hasOwnProperty.call(all, defaultKey)) {
      return all[defaultKey];
    }
    return null;
  }

  async getAllSettingsForApi(): Promise<FeatureSettings> {
    const settings = await this.getAllSettings();
    const masked = { ...settings } as Record<string, unknown>;
    for (const key of Object.keys(masked)) {
      masked[key] = maskIfSensitive(key, masked[key]);
    }
    return masked as unknown as FeatureSettings;
  }

  async getSettingForApi(key: string): Promise<unknown> {
    const value = await this.getSetting(key);
    return maskIfSensitive(key, value);
  }

  async updateSetting(
    key: string,
    value: boolean | string | number | object,
    description?: string,
    updatedBy?: string
  ) {
    const existing = await prisma.featureSettings.findUnique({
      where: { key },
    });

    const { value: normalizedValue, skipValueWrite } = applySensitiveValueWrite(key, value, existing);
    value = normalizedValue;

    // If client sent a masked secret and the row exists, only update metadata (avoid wiping secrets on bulk saves).
    if (skipValueWrite && existing) {
      const updated = await prisma.featureSettings.update({
        where: { key },
        data: {
          ...(description !== undefined && { description }),
          ...(updatedBy && { updatedBy }),
        },
      });
      this.invalidateCache();
      return updated;
    }

    // Masked secret for a non-existing row: nothing to persist.
    if (skipValueWrite && !existing) {
      return null;
    }

    const valueToStore = maybeEncrypt(key, value) ?? value;

    if (existing) {
      const updated = await prisma.featureSettings.update({
        where: { key },
        data: {
          value: valueToStore as any,
          ...(description !== undefined && { description }),
          ...(updatedBy && { updatedBy }),
        },
      });
      this.invalidateCache();
      return updated;
    }

    // Determine category based on key
    let category = 'FEATURES';
    if (key === 'onboarding') {
      category = 'SYSTEM';
    } else if (key.includes('payment') || key.includes('stripe') || key.includes('paypal')) {
      category = 'PAYMENT';
    } else if (key.includes('loyalty')) {
      category = 'LOYALTY';
    } else if (key.includes('filter') || key.includes('search')) {
      category = 'UI';
    } else if (key.includes('brand')) {
      category = 'UI';
    } else if (key.includes('font') || key.includes('Font') || key.includes('textTransform') || key.includes('fontSize')) {
      category = 'UI';
    } else if (key.includes('color') || key.includes('Color')) {
      category = 'UI';
    } else if (key.includes('Favicon') || key.includes('favicon') || key.includes('AppleTouch')) {
      category = 'UI';
    } else if (key.includes('registration') || key.includes('login') || key.includes('password') || key.includes('lockout') || key.includes('RateLimit') || key.includes('verification') || key.includes('captcha') || key.includes('Captcha')) {
      category = 'SECURITY';
    } else if (key.includes('yandexDelivery') || key.includes('deliveryTracking') || key.includes('geocoder')) {
      category = 'DELIVERY';
    }

    const created = await prisma.featureSettings.create({
      data: {
        key,
        value: valueToStore as any,
        description,
        category,
        updatedBy,
      },
    });
    this.invalidateCache();
    return created;
  }

  async updateMultipleSettings(
    settings: Record<string, boolean | string | number | object>,
    updatedBy?: string
  ) {
    const updates = Object.entries(settings).map(([key, value]) =>
      this.updateSetting(key, value, undefined, updatedBy)
    );

    return Promise.all(updates);
  }

  async resetToDefaults(updatedBy?: string) {
    // Delete all existing settings
    await prisma.featureSettings.deleteMany({});

    // Create default settings
    const defaults = Object.entries(DEFAULT_SETTINGS).map(([key, value]) => ({
      key,
      value: value as any,
      category: this.getCategoryForKey(key),
      updatedBy,
    }));

    const result = await prisma.featureSettings.createMany({
      data: defaults.map((row) => ({
        ...row,
        value: (maybeEncrypt(row.key, row.value) ?? row.value) as any,
      })),
    });
    this.invalidateCache();
    return result;
  }

  private getCategoryForKey(key: string): string {
    if (key.includes('payment') || key.includes('stripe') || key.includes('paypal')) {
      return 'PAYMENT';
    }
    if (key.includes('loyalty')) {
      return 'LOYALTY';
    }
    if (key.includes('filter') || key.includes('search') || key.includes('brand')) {
      return 'UI';
    }
    if (key.includes('review')) {
      return 'FEATURES';
    }
    if (key.includes('font') || key.includes('Font') || key.includes('textTransform') || key.includes('fontSize')) {
      return 'UI';
    }
    if (key.includes('color') || key.includes('Color')) {
      return 'UI';
    }
    if (key.includes('Favicon') || key.includes('favicon') || key.includes('AppleTouch')) {
      return 'UI';
    }
    if (key.includes('pinterest') || key.includes('Pinterest') || key.includes('frontendBaseUrl')) {
      return 'MARKETING';
    }
    if (key.includes('email') || key.includes('Email')) {
      return 'MARKETING';
    }
    if (key.includes('deliveryTracking') || key.includes('DeliveryTracking')) {
      return 'DELIVERY';
    }
    return 'FEATURES';
  }

  async isFeatureEnabled(key: keyof FeatureSettings): Promise<boolean> {
    const setting = await this.getSetting(key);
    if (typeof setting === 'boolean') {
      return setting;
    }
    // Return default
    const defaultValue = DEFAULT_SETTINGS[key];
    return typeof defaultValue === 'boolean' ? defaultValue : false;
  }
}

export const settingsService = new SettingsService();
