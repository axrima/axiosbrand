import { apiClient } from './client';

export interface Page {
  id: string;
  slug: string;
  title: string;
  content?: string;
  metaTitle?: string;
  metaDescription?: string;
  isActive: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface CreatePageDto {
  slug: string;
  title: string;
  content?: string;
  metaTitle?: string;
  metaDescription?: string;
  isActive: boolean;
}

export interface UpdatePageDto extends Partial<CreatePageDto> {}

export const pageApi = {
  getAll: (activeOnly: boolean = false) =>
    apiClient.get<{ pages: Page[] }>(`/pages?active=${activeOnly}`),
  getBySlug: (slug: string, languageCode?: string) => {
    const params = languageCode ? `?languageCode=${languageCode}` : '';
    return apiClient.get<{ page: Page }>(`/pages/slug/${slug}${params}`, { cache: 'no-store' });
  },
  getById: (id: string) => apiClient.get<{ page: Page }>(`/pages/admin/${id}`),
  create: (data: CreatePageDto) => apiClient.post<{ page: Page }>('/pages', data),
  update: (id: string, data: UpdatePageDto) =>
    apiClient.put<{ page: Page }>(`/pages/admin/${id}`, data),
  delete: (id: string) => apiClient.delete<{ message: string }>(`/pages/admin/${id}`),
};
