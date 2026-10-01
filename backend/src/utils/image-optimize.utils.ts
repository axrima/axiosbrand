import sharp from 'sharp';

export type OptimizedImage = {
  buffer: Buffer;
  contentType: string;
  extension: string;
  width: number;
  height: number;
};

export type OptimizedImageSet = {
  /** Primary storefront asset (WebP, max edge). */
  primary: OptimizedImage;
  /** Smaller WebP for srcset (mobile / cards). */
  small: OptimizedImage | null;
};

const MAX_PRIMARY_EDGE = 1600;
const SMALL_EDGE = 800;
const WEBP_QUALITY = 80;

function isOptimizableImage(mimetype: string): boolean {
  if (!mimetype.startsWith('image/')) return false;
  // Keep SVG vectors and animated GIF as-is.
  if (mimetype.includes('svg') || mimetype === 'image/gif') return false;
  return true;
}

async function toWebpVariant(
  input: Buffer,
  maxEdge: number
): Promise<OptimizedImage | null> {
  const image = sharp(input, { failOn: 'none' }).rotate();
  const meta = await image.metadata();
  const width = meta.width || 0;
  const height = meta.height || 0;
  if (!width || !height) return null;

  const pipeline = image
    .resize({
      width: maxEdge,
      height: maxEdge,
      fit: 'inside',
      withoutEnlargement: true,
    })
    .webp({ quality: WEBP_QUALITY, effort: 4 });

  const buffer = await pipeline.toBuffer();
  const outMeta = await sharp(buffer).metadata();

  return {
    buffer,
    contentType: 'image/webp',
    extension: '.webp',
    width: outMeta.width || width,
    height: outMeta.height || height,
  };
}

/**
 * Build storefront-ready WebP variants from an uploaded image buffer.
 * Returns null when the file should be stored unchanged.
 */
export async function optimizeImageSet(
  buffer: Buffer,
  mimetype: string
): Promise<OptimizedImageSet | null> {
  if (!isOptimizableImage(mimetype) || !buffer?.length) {
    return null;
  }

  try {
    const primary = await toWebpVariant(buffer, MAX_PRIMARY_EDGE);
    if (!primary) return null;

    // Always emit 800w sibling so frontend srcset never 404s for optimized uploads.
    const small = (await toWebpVariant(buffer, SMALL_EDGE)) || primary;

    return { primary, small };
  } catch (error) {
    console.warn('Image optimize skipped:', error instanceof Error ? error.message : error);
    return null;
  }
}
