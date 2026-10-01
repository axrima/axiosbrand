import prisma from '../config/database';
import { CreatePageDto, UpdatePageDto } from '../types/page';
import { sanitizeHtmlContentOrPlain } from '../utils/sanitize';

function normalizeLanguageCode(languageCode?: string): string | undefined {
  if (typeof languageCode !== 'string') return undefined;
  const normalized = languageCode.trim().toLowerCase();
  return normalized ? normalized.split('-')[0] : undefined;
}

export class PageService {
  async getAllPages(activeOnly: boolean = false) {
    try {
      const where = activeOnly ? { isActive: true } : {};
      
      return await prisma.page.findMany({
        where,
        orderBy: { createdAt: 'desc' },
      });
    } catch (error: unknown) {
      console.error('Error in pageService.getAllPages:', error);
      
      if (error instanceof Error) {
        const errorMessage = error.message;
        const errorCode = (error as any)?.code;
        
        if (
          errorCode === 'P2021' || 
          errorCode === 'P2022' ||
          errorMessage.includes('does not exist') || 
          errorMessage.includes('Unknown table') ||
          errorMessage.includes('relation') ||
          (errorMessage.includes('table') && errorMessage.includes('not found'))
        ) {
          console.warn('⚠️  Page table may not exist. Run migrations: npm run prisma:migrate');
          return [];
        }
        
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
        
        if (
          errorMessage.includes('PrismaClient') || 
          errorMessage.includes('generated') ||
          errorMessage.includes('Cannot find module')
        ) {
          console.error('❌ Prisma Client not generated. Run: npm run prisma:generate');
          throw new Error('Database client not initialized. Please run: npm run prisma:generate');
        }
        
        if (errorCode === 'P1000' || errorMessage.includes('authentication')) {
          console.error('❌ Database authentication failed. Check DATABASE_URL credentials.');
          throw new Error('Database authentication failed. Please check your database credentials.');
        }
      }
      
      throw error;
    }
  }

  async getPageBySlug(slug: string, languageCode?: string) {
    languageCode = normalizeLanguageCode(languageCode);
    const page = await prisma.page.findUnique({
      where: { slug },
      include: { translations: languageCode ? true : false },
    });

    if (!page) {
      return null;
    }

    // Apply translations if languageCode is provided
    if (languageCode) {
      // Existing data may contain a regional or differently-cased language code.
      // Match it the same way as category translations instead of relying on an
      // exact compound-key lookup.
      const translation = page.translations.find(
        (item) => normalizeLanguageCode(item.languageCode) === languageCode
      );
      
      if (translation) {
        let translatedContent = translation.content || page.content;

        if (translation.config) {
          try {
            const parsedBaseContentRaw = page.content ? JSON.parse(page.content) : {};
            const parsedBaseContent =
              parsedBaseContentRaw && typeof parsedBaseContentRaw === 'object' && !Array.isArray(parsedBaseContentRaw)
                ? (parsedBaseContentRaw as Record<string, unknown>)
                : {};
            const translationConfig = translation.config as Record<string, unknown>;
            const baseConfig =
              'config' in parsedBaseContent
                ? (parsedBaseContent.config as Record<string, unknown>)
                : {};
            translatedContent = JSON.stringify({
              ...parsedBaseContent,
              content: translation.content || parsedBaseContent.content || '',
              config: {
                ...baseConfig,
                ...translationConfig,
              },
            });
          } catch {
            translatedContent = translation.content || page.content;
          }
        }

        return {
          ...page,
          translations: undefined,
          title: translation.title || page.title,
          content: translatedContent,
          metaTitle: translation.metaTitle || page.metaTitle,
          metaDescription: translation.metaDescription || page.metaDescription,
        };
      }
    }

    return { ...page, translations: undefined };
  }

  async getPageById(id: string) {
    return prisma.page.findUnique({
      where: { id },
    });
  }

  async createPage(data: CreatePageDto) {
    return prisma.page.create({
      data: {
        slug: data.slug,
        title: data.title,
        content: sanitizeHtmlContentOrPlain(data.content) ?? data.content ?? null,
        metaTitle: data.metaTitle,
        metaDescription: data.metaDescription,
        isActive: data.isActive,
      },
    });
  }

  async updatePage(id: string, data: UpdatePageDto) {
    return prisma.page.update({
      where: { id },
      data: {
        ...(data.slug && { slug: data.slug }),
        ...(data.title !== undefined && { title: data.title }),
        ...(data.content !== undefined && { content: sanitizeHtmlContentOrPlain(data.content) ?? data.content ?? null }),
        ...(data.metaTitle !== undefined && { metaTitle: data.metaTitle }),
        ...(data.metaDescription !== undefined && { metaDescription: data.metaDescription }),
        ...(data.isActive !== undefined && { isActive: data.isActive }),
      },
    });
  }

  async deletePage(id: string) {
    return prisma.page.delete({
      where: { id },
    });
  }
}

export const pageService = new PageService();
