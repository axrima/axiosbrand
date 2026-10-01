import prisma from '../config/database';
import { CreateHomepageSectionDto, UpdateHomepageSectionDto } from '../types/homepage';

function normalizeLanguageCode(languageCode?: string): string | undefined {
  if (typeof languageCode !== 'string') return undefined;
  const normalized = languageCode.trim().toLowerCase();
  if (!normalized) return undefined;
  return normalized.split('-')[0] || undefined;
}

export class HomepageService {
  async getAllSections(activeOnly: boolean = false, languageCode?: string) {
    try {
      const where = activeOnly ? { isActive: true } : {};
      const normalizedLanguageCode = normalizeLanguageCode(languageCode);
      
      const sections = await prisma.homepageSection.findMany({
        where,
        orderBy: { order: 'asc' },
        include: { translations: normalizedLanguageCode ? true : false },
      });

      // Apply translations if languageCode is provided
      if (normalizedLanguageCode) {
        const sectionsWithTranslations = sections.map((section) => {
            // Match normalized codes so existing `ru-RU`/mixed-case records are
            // also used for a storefront request for `ru`.
            const translation = section.translations.find(
              (item) => normalizeLanguageCode(item.languageCode) === normalizedLanguageCode
            );

            if (translation) {
              // Merge translated title and config
              const originalConfig = (section.config as Record<string, any>) || {};
              const translationConfig = (translation.config as Record<string, any>) || {};

              // Merge configs: start with original, then overlay translated fields.
              // This lets translated config values like `title`, `subtitle`, etc. reach the storefront.
              let mergedConfig: Record<string, any> = {
                ...originalConfig,
                ...translationConfig,
              };

              // Card section: merge translated cards by id so translated titles override
              // without losing original media/link fields.
              const originalCards = Array.isArray(originalConfig.cards) ? originalConfig.cards : [];
              const translatedCards = Array.isArray(translationConfig.cards) ? translationConfig.cards : [];
              if (originalCards.length > 0 && translatedCards.length > 0) {
                const translatedById = new Map(
                  translatedCards
                    .filter((c: any) => c && c.id != null)
                    .map((c: any) => [c.id, c])
                );
                mergedConfig = {
                  ...mergedConfig,
                  cards: originalCards.map((card: any) => {
                    const tCard = card.id != null ? translatedById.get(card.id) : undefined;
                    return {
                      ...card,
                      ...(tCard || {}),
                    };
                  }),
                };
              }

              return {
                ...section,
                translations: undefined,
                title: translation.title ?? section.title,
                config: mergedConfig,
              };
            }

            return { ...section, translations: undefined };
          });

        return sectionsWithTranslations;
      }

      return sections.map((section) => ({ ...section, translations: undefined }));
    } catch (error: unknown) {
      console.error('Error in homepageService.getAllSections:', error);
      
      // Handle specific Prisma errors
      if (error instanceof Error) {
        const errorMessage = error.message;
        const errorCode = (error as any)?.code;
        
        // Table doesn't exist (P2021, P2022, or specific error messages)
        if (
          errorCode === 'P2021' || 
          errorCode === 'P2022' ||
          errorMessage.includes('does not exist') || 
          errorMessage.includes('Unknown table') ||
          errorMessage.includes('relation') ||
          errorMessage.includes('table') && errorMessage.includes('not found')
        ) {
          console.warn('⚠️  HomepageSection table may not exist. Run migrations: npm run prisma:migrate');
          return [];
        }
        
        // Database connection error (P1001, P1002, P1003)
        if (
          errorCode === 'P1001' ||
          errorCode === 'P1002' ||
          errorCode === 'P1003' ||
          errorMessage.includes('Can\'t reach database') || 
          errorMessage.includes('Connection') ||
          errorMessage.includes('ECONNREFUSED') ||
          errorMessage.includes('timeout')
        ) {
          console.error('❌ Database connection error. Check DATABASE_URL in .env');
          throw new Error('Database connection failed. Please check your database configuration.');
        }
        
        // Read-only file system error (PostgreSQL file system issue)
        if (
          errorMessage.includes('Read-only file system') ||
          errorMessage.includes('read-only') ||
          errorMessage.includes('could not open file') ||
          errorCode === '42501'
        ) {
          console.error('❌ Database file system is read-only. This may indicate:');
          console.error('   1. Database volume is mounted as read-only');
          console.error('   2. Database container lacks write permissions');
          console.error('   3. Database filesystem is corrupted');
          console.error('   4. Disk space issues');
          console.error('   Solution: Check Docker volume permissions and restart the database container.');
          throw new Error('Database is in read-only mode. Please check database volume permissions and container configuration.');
        }
        
        // Prisma client not generated
        if (
          errorMessage.includes('PrismaClient') || 
          errorMessage.includes('generated') ||
          errorMessage.includes('Cannot find module')
        ) {
          console.error('❌ Prisma Client not generated. Run: npm run prisma:generate');
          throw new Error('Database client not initialized. Please run: npm run prisma:generate');
        }
        
        // Authentication error
        if (errorCode === 'P1000' || errorMessage.includes('authentication')) {
          console.error('❌ Database authentication failed. Check DATABASE_URL credentials.');
          throw new Error('Database authentication failed. Please check your database credentials.');
        }
      }
      
      // Re-throw other errors
      throw error;
    }
  }

  async getSectionById(id: string) {
    return prisma.homepageSection.findUnique({
      where: { id },
    });
  }

  async createSection(data: CreateHomepageSectionDto) {
    return prisma.homepageSection.create({
      data: {
        type: data.type,
        title: data.title,
        order: data.order,
        isActive: data.isActive,
        config: (data.config || {}) as any,
      },
    });
  }

  async updateSection(id: string, data: UpdateHomepageSectionDto) {
    return prisma.homepageSection.update({
      where: { id },
      data: {
        ...(data.type && { type: data.type }),
        ...(data.title !== undefined && { title: data.title }),
        ...(data.order !== undefined && { order: data.order }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
        ...(data.config && { config: data.config as any }),
      },
    });
  }

  async deleteSection(id: string) {
    return prisma.homepageSection.delete({
      where: { id },
    });
  }

  async reorderSections(sectionOrders: { id: string; order: number }[]) {
    const updates = sectionOrders.map(({ id, order }) =>
      prisma.homepageSection.update({
        where: { id },
        data: { order },
      })
    );

    return prisma.$transaction(updates);
  }
}

export const homepageService = new HomepageService();
