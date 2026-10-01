import { PrismaClient } from '@prisma/client';
import { withPrismaPoolDefaults } from './prisma-pool';

const databaseUrl = withPrismaPoolDefaults(process.env.DATABASE_URL || '');

const prisma = new PrismaClient({
  datasources: {
    db: {
      url: databaseUrl,
    },
  },
  log: process.env.NODE_ENV === 'development' ? ['query', 'error', 'warn'] : ['error'],
});

// Verify HeaderSettings, BlogPost, and EmailTemplate models are available at module load time
if (process.env.NODE_ENV === 'development') {
  const prismaAny = prisma as any;
  if (!prismaAny.headerSettings) {
    console.error('❌ WARNING: HeaderSettings model not found in Prisma client at module load time');
    console.error('   This usually means Prisma Client needs to be regenerated');
    console.error('   Run: npx prisma generate');
  } else {
    console.log('✅ HeaderSettings model verified in Prisma client');
  }
  
  if (!prismaAny.blogPost) {
    console.error('❌ WARNING: BlogPost model not found in Prisma client at module load time');
    console.error('   This usually means Prisma Client needs to be regenerated');
    console.error('   Run: npx prisma generate');
  } else {
    console.log('✅ BlogPost model verified in Prisma client');
  }
  
  if (!prismaAny.emailTemplate) {
    console.error('❌ WARNING: EmailTemplate model not found in Prisma client at module load time');
    console.error('   This usually means Prisma Client needs to be regenerated');
    console.error('   Run: npx prisma generate');
  } else {
    console.log('✅ EmailTemplate model verified in Prisma client');
  }
}

export default prisma;
