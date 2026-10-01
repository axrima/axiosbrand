/**
 * Capture a still from the start of a local video File (browser decode + canvas).
 * Used as homepage autoplay poster so cold loads never flash a native play icon.
 */
export async function extractVideoPosterFile(
  videoFile: File,
  options?: { seekSeconds?: number; quality?: number }
): Promise<File | null> {
  if (typeof document === 'undefined') return null;
  if (!videoFile.type.startsWith('video/')) return null;

  const objectUrl = URL.createObjectURL(videoFile);

  try {
    const video = document.createElement('video');
    video.muted = true;
    video.defaultMuted = true;
    video.playsInline = true;
    video.preload = 'auto';
    video.src = objectUrl;

    await new Promise<void>((resolve, reject) => {
      const onReady = () => resolve();
      const onError = () => reject(new Error('Failed to decode video for poster'));
      video.addEventListener('loadeddata', onReady, { once: true });
      video.addEventListener('error', onError, { once: true });
    });

    // Tiny seek so decoders that show a black keyframe at t=0 still give a real picture.
    // Playback still starts at 0 — visually the same first moment.
    const duration = Number.isFinite(video.duration) ? video.duration : 0;
    const seekSeconds = Math.max(0, options?.seekSeconds ?? 0.04);
    const targetTime =
      duration > 0 ? Math.min(seekSeconds, Math.max(duration * 0.01, 0.001)) : seekSeconds;

    if (targetTime > 0) {
      await new Promise<void>((resolve, reject) => {
        const onSeeked = () => resolve();
        const onError = () => reject(new Error('Failed to seek video for poster'));
        video.addEventListener('seeked', onSeeked, { once: true });
        video.addEventListener('error', onError, { once: true });
        try {
          video.currentTime = targetTime;
        } catch {
          resolve();
        }
      });
    }

    const width = video.videoWidth;
    const height = video.videoHeight;
    if (!width || !height) return null;

    const canvas = document.createElement('canvas');
    canvas.width = width;
    canvas.height = height;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.drawImage(video, 0, 0, width, height);

    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, 'image/jpeg', options?.quality ?? 0.86)
    );
    if (!blob) return null;

    const baseName = videoFile.name.replace(/\.[^.]+$/, '') || 'video';
    return new File([blob], `${baseName}-poster.jpg`, {
      type: 'image/jpeg',
      lastModified: Date.now(),
    });
  } catch {
    return null;
  } finally {
    URL.revokeObjectURL(objectUrl);
  }
}
