import { apiClient } from './client';

export interface CardItem {
  id?: string;
  imageUrl?: string;
  videoUrl?: string;
  title?: string;
  link?: string;
  borderRadius?: string;
  showTitleOnHover?: boolean;
  titleColor?: string;
}

export interface HomepageSection {
  id: string;
  type:
    | 'hero'
    | 'collection'
    | 'editorial'
    | 'lookbook_preview'
    | 'card'
    | 'blog'
    | 'audio'
    | 'split_triple'
    | 'bleed_left'
    | 'bleed_right'
    | 'center_title_media'
    | 'text_block';
  title?: string;
  order: number;
  isActive: boolean;
  config?: {
    imageUrl?: string;
    videoUrl?: string;
    audioUrl?: string;
    buttonText?: string;
    buttonLink?: string;
    description?: string;
    products?: string[];
    lookbookId?: string;
    // Card section config
    cards?: CardItem[];
    gridColumns?: string; // e.g., 'grid-cols-1 md:grid-cols-2 lg:grid-cols-3'
    gap?: string; // e.g., 'gap-4', 'gap-6'
    // Blog section: 'latest' | 'featured', limit, postIds
    displayMode?: 'latest' | 'featured';
    limit?: number;
    postIds?: string[];
    // Audio section: player customization
    playerVariant?: 'minimal' | 'bar' | 'compact';
    playerAccentColor?: string;
    playerBgColor?: string;
    showPlayPause?: boolean;
    showProgress?: boolean;
    showTime?: boolean;
    showVolume?: boolean;
    autoplay?: boolean;
    // Media presentation
    mediaAspectRatio?: 'auto' | '1:1' | '4:5' | '3:4' | '16:9' | '9:16';
    mediaHoverEffect?: 'none' | 'zoom' | 'dim';
    mediaLinkMode?: 'none' | 'always' | 'hover';
    titleOverlayOnMedia?: boolean;
    titleOverlayPosition?: 'top' | 'center' | 'bottom';
    /** Text block (HTML): column width preset */
    textBlockMaxWidth?: 'narrow' | 'medium' | 'wide' | 'full';
    /** Text block (HTML): scroll-in animation */
    textBlockAnimation?: 'fade_up' | 'fade' | 'scale' | 'none';
    [key: string]: unknown;
  };
  createdAt: string;
  updatedAt: string;
}

export interface CreateHomepageSectionDto {
  type: HomepageSection['type'];
  title?: string;
  order: number;
  isActive: boolean;
  config?: Record<string, unknown>;
}

export interface UpdateHomepageSectionDto extends Partial<CreateHomepageSectionDto> {}

export const homepageApi = {
  getAll: (activeOnly: boolean = false, languageCode?: string) => {
    const params = new URLSearchParams({
      active: activeOnly.toString(),
    });
    if (languageCode) {
      params.append('languageCode', languageCode);
    }
    return apiClient.get<{ sections: HomepageSection[] }>(`/homepage?${params.toString()}`, {
      cache: 'no-store',
    });
  },
  getById: (id: string) => apiClient.get<{ section: HomepageSection }>(`/homepage/admin/${id}`),
  create: (data: CreateHomepageSectionDto) =>
    apiClient.post<{ section: HomepageSection }>('/homepage', data),
  update: (id: string, data: UpdateHomepageSectionDto) =>
    apiClient.put<{ section: HomepageSection }>(`/homepage/admin/${id}`, data),
  delete: (id: string) => apiClient.delete<{ message: string }>(`/homepage/admin/${id}`),
  reorder: (sectionOrders: { id: string; order: number }[]) =>
    apiClient.post<{ message: string }>('/homepage/reorder', { sectionOrders }),
};
