import { apiClient } from './client';

export interface Category {
  id: string;
  name: string;
  slug: string;
  description?: string;
  parentId?: string;
  isMain?: boolean; // Optional for backward compatibility
  createdAt: string;
  updatedAt: string;
  parent?: Category;
  children?: Category[];
  _count?: {
    products: number;
  };
}

export const categoryApi = {
  getAll: (includeChildren = false, flat = false, mainOnly = false, languageCode?: string) => {
    const params = new URLSearchParams({
      includeChildren: String(includeChildren),
      flat: String(flat),
      mainOnly: String(mainOnly),
    });
    if (languageCode) {
      params.append('languageCode', languageCode);
    }
    return apiClient.get<{ categories: Category[] }>(`/categories?${params.toString()}`, {
      // Category translations can be edited at runtime. Do not let a previously
      // cached locale response keep stale source-language names in navigation.
      cache: languageCode ? 'no-store' : 'default',
    });
  },
  getById: (id: string, languageCode?: string) => {
    const url = languageCode
      ? `/categories/${id}?languageCode=${languageCode}`
      : `/categories/${id}`;
    return apiClient.get<{ category: Category }>(url, {
      cache: languageCode ? 'no-store' : 'default',
    });
  },
  getBySlug: (slug: string) => apiClient.get<{ category: Category }>(`/categories/slug/${slug}`),
  create: (data: { name: string; slug?: string; description?: string; parentId?: string }) =>
    apiClient.post<{ category: Category }>('/categories', data),
  update: (id: string, data: Partial<Category>) =>
    apiClient.put<{ category: Category }>(`/categories/${id}`, data),
  delete: (id: string) => apiClient.delete<{ message: string }>(`/categories/${id}`),
};
