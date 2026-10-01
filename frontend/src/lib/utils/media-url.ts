const MEDIA_PROXY_PREFIX = '/api/media';

const ALLOWED_PUBLIC_PREFIXES = [
  'products',
  'homepage',
  'lookbook',
  'blog',
  'header',
  'site',
  'uploads',
];

function extractObjectKeyFromPathname(pathname: string): string | null {
  const parts = pathname.split('/').filter(Boolean);
  const prefixIndex = parts.findIndex((part) => ALLOWED_PUBLIC_PREFIXES.includes(part));
  if (prefixIndex < 0) return null;

  const objectKey = parts.slice(prefixIndex).join('/');
  if (!objectKey || objectKey.includes('..')) return null;
  return objectKey;
}

export function isProxiedStorefrontMedia(url: string): boolean {
  return url.startsWith(MEDIA_PROXY_PREFIX);
}

/**
 * Same-origin media proxy — Chrome multiplexes one host; direct S3 stalls with many cards.
 */
export function resolveStorefrontMediaSrc(url: string | null | undefined): string {
  if (!url) return '';
  if (url.startsWith(MEDIA_PROXY_PREFIX)) return url;
  if (url.startsWith('/') && !url.startsWith('//')) return url;

  try {
    const parsed = new URL(url);
    if (parsed.protocol !== 'http:' && parsed.protocol !== 'https:') return url;

    const objectKey = extractObjectKeyFromPathname(parsed.pathname);
    if (objectKey) {
      return `${MEDIA_PROXY_PREFIX}/${objectKey}`;
    }
  } catch {
    return url;
  }

  return url;
}

/**
 * Derive srcset from optimized upload convention: `uuid.webp` + sibling `uuid-800.webp`.
 */
export function buildStorefrontImageSrcSet(url: string | null | undefined): string {
  const resolved = resolveStorefrontMediaSrc(url);
  if (!resolved) return '';

  const match = resolved.match(/^(.*\/[^/?#]+?)(?:-800)?\.webp([?#].*)?$/i);
  if (!match) return '';

  const base = match[1];
  const suffix = match[2] || '';
  // Already the small variant — no srcset needed.
  if (/\/[^/]+-800$/i.test(base)) return '';

  const small = `${base}-800.webp${suffix}`;
  const large = `${base}.webp${suffix}`;
  return `${small} 800w, ${large} 1600w`;
}
