import prisma from '../config/database';
import { CreateCategoryDto, UpdateCategoryDto } from '../types/category';

function normalizeLanguageCode(languageCode?: string): string | undefined {
  if (typeof languageCode !== 'string') return undefined;
  const normalized = languageCode.trim().toLowerCase();
  return normalized ? normalized.split('-')[0] : undefined;
}

type CategoryTranslationValue = {
  languageCode: string;
  name?: string | null;
  description?: string | null;
};

function findTranslation(
  translations: CategoryTranslationValue[] | undefined,
  languageCode: string
): CategoryTranslationValue | undefined {
  return translations?.find(
    (translation) => normalizeLanguageCode(translation.languageCode) === languageCode
  );
}

export class CategoryService {
  async getAll(includeChildren = false, mainOnly = false, languageCode?: string) {
    languageCode = normalizeLanguageCode(languageCode);
    const where: any = {};
    
    if (mainOnly) {
      // Only use isMain filter if mainOnly is requested
      // This will fail if field doesn't exist, but that's expected
      where.isMain = true;
    } else {
      where.parentId = null;
    }
    
    try {
      const categories = await prisma.category.findMany({
        where,
        include: {
          children: includeChildren
            ? { include: { translations: languageCode ? true : false } }
            : false,
          translations: languageCode ? true : false,
          _count: {
            select: {
              products: true,
            },
          },
        },
        orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
      });

      // Apply translations if languageCode is provided
      if (languageCode) {
        return categories.map(category => {
          // For default language (en), always use original category.name
          // For other languages, find translation or fallback to original name
          if (languageCode === 'en') {
            return {
              ...category,
              children: category.children?.map((child: any) => ({
                ...child,
                translations: undefined,
              })),
              translations: undefined, // Remove translations from response
            };
          }
          
          const translation = findTranslation(category.translations, languageCode);
          return {
            ...category,
            name: translation?.name || category.name,
            description: translation?.description || category.description,
            children: category.children?.map((child: any) => {
              const childTranslation = findTranslation(child.translations, languageCode);
              return {
                ...child,
                name: childTranslation?.name || child.name,
                description: childTranslation?.description || child.description,
                translations: undefined,
              };
            }),
            translations: undefined, // Remove translations from response
          };
        });
      }

      return categories;
    } catch (error: any) {
      // If isMain field doesn't exist yet, fallback to simple ordering
      if (error.message?.includes('isMain') || error.message?.includes('Unknown argument')) {
        // Create fallback where clause without isMain
        const fallbackWhere: any = {};
        if (mainOnly) {
          // If mainOnly was requested but isMain doesn't exist, use parentId = null as fallback
          fallbackWhere.parentId = null;
        } else {
          fallbackWhere.parentId = null;
        }
        
        const categories = await prisma.category.findMany({
          where: fallbackWhere,
          include: {
            children: includeChildren,
            translations: languageCode ? true : false,
            _count: {
              select: {
                products: true,
              },
            },
          },
          orderBy: [{ name: 'asc' }],
        });

        // Apply translations if languageCode is provided
        if (languageCode) {
          return categories.map(category => {
            // For default language (en), always use original category.name
            // For other languages, find translation or fallback to original name
            if (languageCode === 'en') {
              return {
                ...category,
                translations: undefined, // Remove translations from response
              };
            }
            
            const translation = findTranslation(category.translations, languageCode);
            return {
              ...category,
              name: translation?.name || category.name,
              description: translation?.description || category.description,
              translations: undefined, // Remove translations from response
            };
          });
        }

        return categories;
      }
      throw error;
    }
  }

  async getAllFlat(languageCode?: string) {
    languageCode = normalizeLanguageCode(languageCode);
    try {
      const categories = await prisma.category.findMany({
        include: {
          parent: true,
          translations: languageCode ? true : false,
          _count: {
            select: {
              products: true,
            },
          },
        },
        orderBy: [{ isMain: 'desc' }, { name: 'asc' }],
      });

      // Apply translations if languageCode is provided
      if (languageCode) {
        return categories.map(category => {
          // For default language (en), always use original category.name
          // For other languages, find translation or fallback to original name
          if (languageCode === 'en') {
            return {
              ...category,
              translations: undefined, // Remove translations from response
            };
          }
          
          const translation = findTranslation(category.translations, languageCode);
          return {
            ...category,
            name: translation?.name || category.name,
            description: translation?.description || category.description,
            translations: undefined, // Remove translations from response
          };
        });
      }

      return categories;
    } catch (error: any) {
      // If isMain field doesn't exist yet, fallback to simple ordering
      if (error.message?.includes('isMain') || error.message?.includes('Unknown argument')) {
        const categories = await prisma.category.findMany({
          include: {
            parent: true,
            translations: languageCode ? true : false,
            _count: {
              select: {
                products: true,
              },
            },
          },
          orderBy: [{ name: 'asc' }],
        });

        // Apply translations if languageCode is provided
        if (languageCode) {
          return categories.map(category => {
            // For default language (en), always use original category.name
            // For other languages, find translation or fallback to original name
            if (languageCode === 'en') {
              return {
                ...category,
                translations: undefined, // Remove translations from response
              };
            }
            
            const translation = findTranslation(category.translations, languageCode);
            return {
              ...category,
              name: translation?.name || category.name,
              description: translation?.description || category.description,
              translations: undefined, // Remove translations from response
            };
          });
        }

        return categories;
      }
      throw error;
    }
  }

  async getById(id: string, languageCode?: string) {
    languageCode = normalizeLanguageCode(languageCode);
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        parent: true,
        children: true,
        translations: true,
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    if (!category) {
      return null;
    }

    // Apply translation if languageCode is provided
    if (languageCode) {
      // For default language (en), always use original category.name
      // For other languages, find translation or fallback to original name
      if (languageCode === 'en') {
        return category;
      }
      
      const translation = findTranslation(category.translations, languageCode);
      if (translation) {
        return {
          ...category,
          name: translation.name || category.name,
          description: translation.description || category.description,
        };
      }
    }

    return category;
  }

  async getBySlug(slug: string) {
    return prisma.category.findUnique({
      where: { slug },
      include: {
        parent: true,
        children: true,
        _count: {
          select: {
            products: true,
          },
        },
      },
    });
  }

  async create(data: CreateCategoryDto) {
    let slug = data.slug;
    if (!slug) {
      slug = data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      
      const existing = await prisma.category.findUnique({ where: { slug } });
      if (existing) {
        slug = `${slug}-${Date.now()}`;
      }
    }

    // Validate parent exists if provided
    if (data.parentId) {
      const parent = await prisma.category.findUnique({
        where: { id: data.parentId },
      });
      if (!parent) {
        throw new Error('Parent category not found');
      }
    }

    // If this is a main category, it cannot have a parent
    if (data.isMain && data.parentId) {
      throw new Error('Main category cannot have a parent');
    }

    // If there is a parent, it cannot be a main category
    if (data.parentId && data.isMain) {
      throw new Error('Subcategory cannot be a main category');
    }

    const createData: any = {
      name: data.name,
      slug,
      description: data.description,
      parentId: data.parentId,
    };
    
    // Only include isMain if it's provided (and field exists in DB)
    if (data.isMain !== undefined) {
      createData.isMain = data.isMain;
    }
    
    try {
      return await prisma.category.create({
        data: createData,
        include: {
          parent: true,
          children: true,
          _count: {
            select: {
              products: true,
            },
          },
        },
      });
    } catch (error: any) {
      // If isMain field doesn't exist yet, retry without it
      if ((error.message?.includes('isMain') || error.message?.includes('Unknown argument')) && createData.isMain !== undefined) {
        delete createData.isMain;
        return prisma.category.create({
          data: createData,
          include: {
            parent: true,
            children: true,
            _count: {
              select: {
                products: true,
              },
            },
          },
        });
      }
      throw error;
    }
  }

  async update(id: string, data: UpdateCategoryDto) {
    // Prevent circular references
    if (data.parentId === id) {
      throw new Error('Category cannot be its own parent');
    }

    // Check if category exists
    const category = await prisma.category.findUnique({
      where: { id },
    });
    if (!category) {
      throw new Error('Category not found');
    }

    // Validate parent exists if provided
    if (data.parentId) {
      const parent = await prisma.category.findUnique({
        where: { id: data.parentId },
      });
      if (!parent) {
        throw new Error('Parent category not found');
      }

      // Prevent setting a descendant as parent
      const descendants = await this.getDescendants(id);
      if (descendants.some((d) => d.id === data.parentId)) {
        throw new Error('Cannot set a descendant category as parent');
      }
    }

    let slug = data.slug;
    if (!slug && data.name) {
      slug = data.name
        .toLowerCase()
        .replace(/[^a-z0-9]+/g, '-')
        .replace(/(^-|-$)/g, '');
      
      const existing = await prisma.category.findFirst({
        where: { slug, id: { not: id } },
      });
      if (existing) {
        slug = `${slug}-${Date.now()}`;
      }
    }

    // Validation: main category cannot have a parent
    if (data.isMain && data.parentId) {
      throw new Error('Main category cannot have a parent');
    }

    // Validation: if there is a parent, it cannot be a main category
    if (data.parentId && data.isMain) {
      throw new Error('Subcategory cannot be a main category');
    }

    // If making main, remove parent
    const updateData: any = {
      ...(data.name && { name: data.name }),
      ...(slug && { slug }),
      ...(data.description !== undefined && { description: data.description }),
    };
    
    // Only include isMain if it's provided (and field exists in DB)
    if (data.isMain !== undefined) {
      updateData.isMain = data.isMain;
    }

    if (data.parentId !== undefined) {
      updateData.parentId = data.parentId;
    }

    // If making main category, remove parent
    if (data.isMain === true) {
      updateData.parentId = null;
    }

    try {
      return await prisma.category.update({
        where: { id },
        data: updateData,
        include: {
          parent: true,
          children: true,
          _count: {
            select: {
              products: true,
            },
          },
        },
      });
    } catch (error: any) {
      // If isMain field doesn't exist yet, retry without it
      if ((error.message?.includes('isMain') || error.message?.includes('Unknown argument')) && updateData.isMain !== undefined) {
        delete updateData.isMain;
        return prisma.category.update({
          where: { id },
          data: updateData,
          include: {
            parent: true,
            children: true,
            _count: {
              select: {
                products: true,
              },
            },
          },
        });
      }
      throw error;
    }
  }

  async delete(id: string) {
    // Check if category has products
    const category = await prisma.category.findUnique({
      where: { id },
      include: {
        _count: {
          select: {
            products: true,
          },
        },
      },
    });

    if (!category) {
      throw new Error('Category not found');
    }

    if (category._count.products > 0) {
      throw new Error('Cannot delete category with products');
    }

    // Check if category has children
    const children = await prisma.category.findMany({
      where: { parentId: id },
    });

    if (children.length > 0) {
      throw new Error('Cannot delete category with subcategories');
    }

    return prisma.category.delete({
      where: { id },
    });
  }

  private async getDescendants(parentId: string): Promise<{ id: string }[]> {
    const children = await prisma.category.findMany({
      where: { parentId },
      select: { id: true },
    });

    const descendants = [...children];
    for (const child of children) {
      const childDescendants = await this.getDescendants(child.id);
      descendants.push(...childDescendants);
    }

    return descendants;
  }

  /**
   * Get all subcategory IDs (including nested) for the given category
   * Includes the category itself in the result
   */
  async getCategoryAndDescendantsIds(categoryId: string): Promise<string[]> {
    const category = await prisma.category.findUnique({
      where: { id: categoryId },
      select: { id: true },
    });

    if (!category) {
      return [];
    }

    const descendants = await this.getDescendants(categoryId);
    const allIds = [categoryId, ...descendants.map(d => d.id)];
    return allIds;
  }
}

export const categoryService = new CategoryService();
