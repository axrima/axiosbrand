import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import cookieParser from 'cookie-parser';
import { config } from './config/env';
import prisma from './config/database';
import { ragService } from './services/rag.service';

const app = express();

const DEFAULT_LOGIN_PAGE_CONTENT = JSON.stringify({
  content: '',
  config: {
    imageUrl: '/login-showcase.png',
    videoUrl: '',
    buttonText: '',
    buttonLink: '',
    description:
      'Left panel is ready for a branded image, campaign visual, or showroom-style artwork while the form stays focused on the right.',
    backgroundColor: '#fcfaf7',
    textColor: '#ffffff',
    buttonColor: '#000000',
    buttonTextColor: '#ffffff',
    titleSize: '',
    subtitleSize: '',
    paddingTop: '',
    paddingBottom: '',
    textAlign: 'left',
    imageOpacity: '100',
    sectionHeight: '',
    overlayColor: '#000000',
    overlayOpacity: '35',
    mediaAspectRatio: 'auto',
    gridColumns: '1',
    gridGap: '4',
    gridLayout: 'default',
    badge: 'Content Management',
    eyebrow: 'Admin access',
    sideTitle: 'Visual workspace for your shop operations.',
  },
});

const DEFAULT_SYSTEM_PAGES = [
  {
    slug: 'privacy',
    title: 'Privacy Policy',
    content:
      '<h1>Privacy Policy</h1><p>Use this page to describe how customer data is collected, stored, and processed.</p>',
    metaTitle: 'Privacy Policy',
    metaDescription: 'Privacy policy and data processing information.',
    isActive: true,
  },
  {
    slug: 'terms',
    title: 'Terms & Conditions',
    content:
      '<h1>Terms &amp; Conditions</h1><p>Use this page to describe the terms, conditions, and responsibilities for using your store.</p>',
    metaTitle: 'Terms & Conditions',
    metaDescription: 'Terms and conditions for using the store.',
    isActive: true,
  },
  {
    slug: 'login',
    title: 'Login Page',
    content: DEFAULT_LOGIN_PAGE_CONTENT,
    metaTitle: 'Login',
    metaDescription: 'Customize the login page hero image and copy.',
    isActive: true,
  },
] as const;

async function ensureDefaultPages(): Promise<void> {
  for (const page of DEFAULT_SYSTEM_PAGES) {
    await prisma.page.upsert({
      where: { slug: page.slug },
      update: {},
      create: page,
    });
  }
  console.log(`✅ Default pages ensured: ${DEFAULT_SYSTEM_PAGES.map((page) => page.slug).join(', ')}`);
}

// Respect trusted proxy chain in production so req.ip is reliable for security controls.
if (config.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

// Security headers (helmet + CSP). HSTS only in production.
app.use(
  helmet({
    contentSecurityPolicy: {
      directives: {
        defaultSrc: ["'self'"],
        styleSrc: ["'self'", "'unsafe-inline'"],
        scriptSrc: ["'self'"],
        imgSrc: ["'self'", 'data:', 'https:'],
        connectSrc: ["'self'"],
        fontSrc: ["'self'"],
        objectSrc: ["'none'"],
        mediaSrc: ["'self'", 'https:'],
        frameSrc: ["'none'"],
      },
    },
    strictTransportSecurity:
      config.nodeEnv === 'production'
        ? { maxAge: 31536000, includeSubDomains: true, preload: true }
        : false,
  })
);

// Additional security headers (helmet sets most; these reinforce)
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'DENY');
  res.setHeader('X-XSS-Protection', '1; mode=block');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

// CORS configuration with dynamic origin checking
const corsOptions = {
  origin: (origin: string | undefined, callback: (err: Error | null, allow?: boolean) => void) => {
    const allowedOrigins = Array.isArray(config.cors.origin) 
      ? config.cors.origin 
      : [config.cors.origin];
    
    // Allow requests with no origin (like mobile apps or curl requests)
    if (!origin) {
      return callback(null, true);
    }
    
    // Check if origin is in allowed list
    if (allowedOrigins.includes(origin)) {
      callback(null, true);
    } else {
      // In development, allow any localhost origin
      if (config.nodeEnv === 'development' && origin?.startsWith('http://localhost:')) {
        callback(null, true);
      } else {
        callback(new Error('Not allowed by CORS'));
      }
    }
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization', 'X-CSRF-Token'],
};

// Middleware
app.use(cors(corsOptions));
app.use(cookieParser());

// Log CORS configuration on startup
console.log('🔒 CORS Configuration:');
console.log(`   Allowed origins: ${JSON.stringify(config.cors.origin)}`);
console.log(`   Environment: ${config.nodeEnv}`);

// Stripe webhook route - must be before body parsing middleware (uses raw body)
import { stripeController } from './controllers/stripe.controller';
app.post(
  '/api/payments/stripe/webhook',
  express.raw({ type: 'application/json' }),
  stripeController.handleWebhook.bind(stripeController)
);

// YooKassa webhook route - raw body for HMAC verification
import { yookassaController } from './controllers/yookassa.controller';
app.post(
  '/api/payments/yookassa/webhook',
  express.raw({ type: 'application/json' }),
  yookassaController.handleWebhook.bind(yookassaController)
);

// CloudPayments webhook - raw body for HMAC verification
import { cloudpaymentsController } from './controllers/cloudpayments.controller';
app.post(
  '/api/payments/cloudpayments/webhook',
  express.raw({ type: 'application/json' }),
  cloudpaymentsController.handleWebhook.bind(cloudpaymentsController)
);

// Alipay webhook - form urlencoded (Alipay sends POST form data)
import { alipayController } from './controllers/alipay.controller';
app.post(
  '/api/payments/alipay/webhook',
  express.urlencoded({ extended: true }),
  alipayController.handleWebhook.bind(alipayController)
);

// WeChat Pay webhook - raw body for signature verification
import { wechatpayController } from './controllers/wechatpay.controller';
app.post(
  '/api/payments/wechatpay/webhook',
  express.raw({ type: 'application/json' }),
  wechatpayController.handleWebhook.bind(wechatpayController)
);

// Body parsing middleware (after webhook routes)
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Public storefront media proxy (same-origin for browsers; streams from S3/MinIO internally)
import mediaRoutes from './routes/media.routes';
app.use('/api/media', mediaRoutes);

// CSRF verification for state-changing API requests (skips GET/HEAD/OPTIONS and /webhook)
import { verifyCsrfToken } from './middleware/csrf.middleware';
app.use('/api', verifyCsrfToken);

import { apiLimiter } from './middleware/rate-limit.middleware';
app.use('/api', apiLimiter);

console.log(
  config.rateLimit.apiDisabled
    ? '⚠️ API rate limit: DISABLED'
    : `✅ API rate limit: ON (${config.rateLimit.apiMax}/${config.rateLimit.apiWindowMinutes}m)`
);

// Stripe routes (after body parsing)
import stripeRoutes from './routes/stripe.routes';
app.use('/api/payments/stripe', stripeRoutes);

// YooKassa routes (after body parsing)
import yookassaRoutes from './routes/yookassa.routes';
app.use('/api/payments/yookassa', yookassaRoutes);

// CloudPayments routes (after body parsing)
import cloudpaymentsRoutes from './routes/cloudpayments.routes';
app.use('/api/payments/cloudpayments', cloudpaymentsRoutes);

// Alipay routes
import alipayRoutes from './routes/alipay.routes';
app.use('/api/payments/alipay', alipayRoutes);

// WeChat Pay routes
import wechatpayRoutes from './routes/wechatpay.routes';
app.use('/api/payments/wechatpay', wechatpayRoutes);

// SEO: sitemap index, sub-sitemaps, robots.txt (public, no /api prefix)
import sitemapRoutes from './routes/sitemap.routes';
app.use(sitemapRoutes);

// Site icons: same-origin proxy for Safari/Yandex and /favicon.ico auto-requests
import faviconRoutes from './routes/favicon.routes';
app.use(faviconRoutes);

// Health check
app.get('/health', async (req, res) => {
  const ragHealth = await ragService.getHealth().catch(error => ({
    enabled: config.rag.enabled,
    configured: Boolean(config.rag.databaseUrl),
    available: false,
    mode: 'action_only' as const,
    reason: 'database_unreachable' as const,
    checkedAt: new Date().toISOString(),
    extensions: [],
    error: error instanceof Error ? error.message : String(error),
  }));

  res.json({
    status: 'ok',
    timestamp: new Date().toISOString(),
    database: {
      primary: 'ok',
    },
    rag: ragHealth,
  });
});

// API routes
app.get('/api', (req, res) => {
  res.json({ message: 'Fashion API v1' });
});

// CSRF token: explicit routes first (so login works even if auth router loads late)
import { getCsrfToken } from './middleware/csrf.middleware';
app.get('/api/csrf-token', getCsrfToken);
app.get('/api/auth/csrf-token', getCsrfToken);

// Auth routes
import authRoutes from './routes/auth.routes';
app.use('/api/auth', authRoutes);

// Homepage routes
import homepageRoutes from './routes/homepage.routes';
app.use('/api/homepage', homepageRoutes);

// Page routes
import pageRoutes from './routes/page.routes';
app.use('/api/pages', pageRoutes);

// Lookbook routes
import lookbookRoutes from './routes/lookbook.routes';
app.use('/api/lookbook', lookbookRoutes);

// Product routes
import productRoutes from './routes/product.routes';
app.use('/api/products', productRoutes);

// Cart routes
import cartRoutes from './routes/cart.routes';
app.use('/api/cart', cartRoutes);

// Category routes
import categoryRoutes from './routes/category.routes';
app.use('/api/categories', categoryRoutes);

// Brand routes
import brandRoutes from './routes/brand.routes';
app.use('/api/brands', brandRoutes);

// Customer routes
import customerRoutes from './routes/customer.routes';
app.use('/api/customer', customerRoutes);

// Guest checkout (token-gated public endpoints)
import guestCheckoutRoutes from './routes/guest-checkout.routes';
app.use('/api/checkout/guest', guestCheckoutRoutes);

// Admin routes
import adminRoutes from './routes/admin.routes';
app.use('/api/admin', adminRoutes);

// Partner routes
import partnerRoutes from './routes/partner.routes';
app.use('/api', partnerRoutes);

// Promo codes routes
import promoRoutes from './routes/promo.routes';
app.use('/api/promo', promoRoutes);

// Review routes
import reviewRoutes from './routes/review.routes';
app.use('/api/reviews', reviewRoutes);

// Report routes
import reportRoutes from './routes/report.routes';
app.use('/api/admin/reports', reportRoutes);

// Customs declarations (admin, for reports & accounting)
import customsRoutes from './routes/customs.routes';
app.use('/api/admin/customs', customsRoutes);

// Accounting (charts, templates, entries)
import accountingRoutes from './routes/accounting.routes';
app.use('/api/admin/accounting', accountingRoutes);

// Loyalty routes
import loyaltyRoutes from './routes/loyalty.routes';
app.use('/api/loyalty', loyaltyRoutes);

// Settings routes
import settingsRoutes from './routes/settings.routes';
app.use('/api/settings', settingsRoutes);

// Email Template routes
import emailTemplateRoutes from './routes/email-template.routes';
app.use('/api/email-templates', emailTemplateRoutes);

// Delivery Tracking routes
import deliveryTrackingRoutes from './routes/delivery-tracking.routes';
app.use('/api/delivery-tracking', deliveryTrackingRoutes);

import yandexDeliveryRoutes from './routes/yandex-delivery.routes';
app.use('/api/yandex-delivery', yandexDeliveryRoutes);

// Country routes
import countryRoutes from './routes/country.routes';
app.use('/api/countries', countryRoutes);

// Language routes
import languageRoutes from './routes/language.routes';
app.use('/api/languages', languageRoutes);

// Payment Gateway routes
import paymentGatewayRoutes from './routes/payment-gateway.routes';
app.use('/api/payment-gateways', paymentGatewayRoutes);

// Payment Request routes
import paymentRequestRoutes from './routes/payment-request.routes';
app.use('/api/payment-requests', paymentRequestRoutes);

// Messenger routes
import messengerRoutes from './routes/messenger.routes';
app.use('/api/messenger', messengerRoutes);

// Currency Rate routes
import currencyRateRoutes from './routes/currency-rate.routes';
app.use('/api/currency-rates', currencyRateRoutes);

// Admin Management routes (for managing admins/moderators)
import adminManagementRoutes from './routes/admin-management.routes';
app.use('/api/admin-management', adminManagementRoutes);

// Translation routes
import translationRoutes from './routes/translation.routes';
app.use('/api/translations', translationRoutes);

// Footer routes
import footerRoutes from './routes/footer.routes';
app.use('/api/footer', footerRoutes);

// Header routes
import headerRoutes from './routes/header.routes';
app.use('/api/header', headerRoutes);

// GPT Assistant routes
import gptAssistantRoutes from './routes/gpt-assistant.routes';
app.use('/api/gpt-assistant', gptAssistantRoutes);

// GPT Assistant Settings routes
import gptAssistantSettingsRoutes from './routes/gpt-assistant-settings.routes';
app.use('/api/admin/gpt-assistant', gptAssistantSettingsRoutes);

// Blog routes
import blogRoutes from './routes/blog.routes';
app.use('/api/blog', blogRoutes);

// Backup routes
import backupRoutes from './routes/backup.routes';
app.use('/api/backups', backupRoutes);

// API Key routes
import apiKeyRoutes from './routes/api-key.routes';
app.use('/api/api-keys', apiKeyRoutes);

// Social Media routes
// Error handler (must be last)
import { errorHandler } from './middleware/error.middleware';

// 404 handler (must be before error handler)
app.use((req: express.Request, res: express.Response, _next: express.NextFunction) => {
  const path = req.method + ' ' + req.originalUrl;
  if (process.env.NODE_ENV === 'development') {
    console.warn('[404] Route not found:', path);
  }
  res.status(404).json({ error: 'Route not found', path });
});

// Error handler (must be absolutely last)
app.use(errorHandler);

async function startServer() {
  // Test database connection
  try {
    await prisma.$connect();
    console.log('✅ Database connected successfully');
    
    // Test query to check if tables exist
    try {
      await prisma.$queryRaw`SELECT 1 FROM homepage_sections LIMIT 1`;
      console.log('✅ HomepageSection table exists');
    } catch (e: unknown) {
      const error = e instanceof Error ? e.message : String(e);
      if (error.includes('does not exist') || error.includes('relation') || error.includes('table')) {
        console.warn('⚠️  HomepageSection table does not exist.');
        console.warn('   Run migrations: cd backend && npm run prisma:migrate');
        console.warn('   The API will return empty arrays until migrations are run.');
      } else {
        console.warn('⚠️  Could not verify HomepageSection table:', error);
      }
    }

    try {
      await ensureDefaultPages();
    } catch (error) {
      console.warn('⚠️  Failed to ensure default pages:', error);
    }

    // Verify HeaderSettings and BlogPost models are available in Prisma Client
    try {
      const prismaAny = prisma as any;
      if (prismaAny.headerSettings) {
        console.log('✅ HeaderSettings model available in Prisma client');
      } else {
        const availableModels = Object.keys(prismaAny).filter(key => !key.startsWith('$') && !key.startsWith('_'));
        console.error('❌ HeaderSettings model NOT available in Prisma client');
        console.error('   Available models:', availableModels.length);
        console.error('   Please run: cd backend && npx prisma generate && restart the server');
      }
      
      if (prismaAny.blogPost) {
        console.log('✅ BlogPost model available in Prisma client');
      } else {
        const availableModels = Object.keys(prismaAny).filter(key => !key.startsWith('$') && !key.startsWith('_'));
        console.error('❌ BlogPost model NOT available in Prisma client');
        console.error('   Available models:', availableModels.length);
        console.error('   Please run: cd backend && npx prisma generate && restart the server');
      }
      
      if (prismaAny.emailTemplate) {
        console.log('✅ EmailTemplate model available in Prisma client');
      } else {
        const availableModels = Object.keys(prismaAny).filter(key => !key.startsWith('$') && !key.startsWith('_'));
        console.error('❌ EmailTemplate model NOT available in Prisma client');
        console.error('   Available models:', availableModels.length);
        console.error('   Please run: cd backend && npx prisma generate && restart the server');
      }
    } catch (e) {
      console.warn('⚠️  Could not verify Prisma models:', e);
    }

    // Initialize admin users
    try {
      const { initAdmins } = await import('./scripts/init-admins');
      await initAdmins();
    } catch (error) {
      console.error('⚠️  Failed to initialize admin users:', error);
      // Don't exit - server can still run without admins
    }

    // Cart: release expired holds (5 min cap). Manual-payment orders: auto-cancel if unpaid after 24h.
    try {
      const { cartService } = await import('./services/cart.service');
      const { paymentRequestService } = await import('./services/payment-request.service');
      const RESERVATION_CLEANUP_INTERVAL_MS = 60 * 1000; // 1 min
      let cleanupRunning = false;
      const runCleanup = async () => {
        // setInterval does not wait — overlapping runs exhaust the Prisma pool (P2024).
        if (cleanupRunning) {
          console.warn('[Cart] Cleanup skipped: previous run still in progress');
          return;
        }
        cleanupRunning = true;
        try {
          // Sequential to keep peak DB connections low under small pools.
          await cartService.releaseExpiredCartReservations();
          await paymentRequestService.releaseExpiredPendingPaymentRequests();
        } catch (e) {
          console.error('[Cart] Cleanup job failed:', e);
        } finally {
          cleanupRunning = false;
        }
      };
      await runCleanup(); // run once on startup
      setInterval(runCleanup, RESERVATION_CLEANUP_INTERVAL_MS);
      console.log('✅ Reservation cleanup scheduled (every 1 min)');
    } catch (error) {
      console.warn('⚠️  Cart reservation cleanup not started:', error);
    }

    try {
      const ragHealth = await ragService.getHealth();
      if (!config.rag.enabled) {
        console.log('ℹ️  RAG runtime disabled (RAG_ENABLED=false)');
      } else if (ragHealth.available) {
        console.log(
          `✅ RAG database reachable (${ragHealth.extensions.join(', ') || 'no extensions detected yet'})`
        );
      } else {
        console.warn(`⚠️  RAG unavailable; legacy assistant fallback stays active (${ragHealth.reason})`);
        if (ragHealth.error) {
          console.warn(`   RAG error: ${ragHealth.error}`);
        }
      }
    } catch (error) {
      console.warn('⚠️  Failed to evaluate RAG health on startup:', error);
    }
  } catch (error) {
    console.error('❌ Database connection failed:', error);
    console.error('   Please check your DATABASE_URL in .env file');
    console.error('   Make sure PostgreSQL is running and accessible');
    process.exit(1);
  }

  // Start server
  const PORT = config.port;
  const HOST = process.env.HOST || '0.0.0.0';
  app.listen(PORT, HOST, () => {
    console.log(`🚀 Server running on http://${HOST}:${PORT}`);
    console.log(`📝 Environment: ${config.nodeEnv}`);
    console.log(`🌐 API available at http://${HOST}:${PORT}/api`);
    console.log(
  config.authRateLimit.disabled
    ? '⏱️  Auth rate limit: OFF (AUTH_RATE_LIMIT_DISABLED=true)'
    : `⏱️  Auth rate limit: ON (login ${config.authRateLimit.login.max}/${config.authRateLimit.login.windowMs / 60000}min, register, forgot-password). API without limit.`
);
  });
}

startServer().catch((error) => {
  console.error('Failed to start server:', error);
  process.exit(1);
});

export default app;
