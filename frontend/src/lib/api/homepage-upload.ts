import { apiClient } from '$lib/api/client';
import { normalizeUploadFile } from '$lib/utils/file-upload';
import { extractVideoPosterFile } from '$lib/utils/video-poster';

export type HomepageUploadResult = {
  url: string;
  /** Auto first-frame still for videos — store in config.imageUrl / card.imageUrl */
  posterUrl?: string;
};

async function uploadRawFile(file: File): Promise<string> {
  const formData = new FormData();
  formData.append('file', normalizeUploadFile(file));
  const data = await apiClient.post<{ url: string }>('/homepage/upload', formData);
  return data.url;
}

/**
 * Upload homepage media. For videos, also extracts + uploads a first-frame poster.
 */
export async function uploadHomepageMedia(file: File): Promise<HomepageUploadResult> {
  const url = await uploadRawFile(file);

  if (!file.type.startsWith('video/')) {
    return { url };
  }

  try {
    const posterFile = await extractVideoPosterFile(file);
    if (!posterFile) return { url };

    const posterUrl = await uploadRawFile(posterFile);
    return { url, posterUrl };
  } catch (error) {
    console.warn('Homepage video poster generation failed:', error);
    return { url };
  }
}
