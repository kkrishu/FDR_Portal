/**
 * Express Application Setup
 * Main app configuration with middleware, routes, and error handling
 */

import express, { Application, Request, Response, NextFunction } from 'express';
import cors from 'cors';
import helmet from 'helmet';
import compression from 'compression';
import cookieParser from 'cookie-parser';
import rateLimit from 'express-rate-limit';
import swaggerUi from 'swagger-ui-express';
import yaml from 'yamljs';
import path from 'path';
import fs from 'fs';

import { config, corsOptions, rateLimitOptions, authRateLimitOptions } from './config';
import logger from './lib/logger';
import { connectRedis, disconnectRedis } from './lib/redis';
import { errorHandler, notFoundHandler } from './middleware/errorHandler';
import { requestLogger } from './middleware/requestLogger';
import { authMiddleware } from './middleware/auth';
import { PrismaClient } from '@prisma/client';

// Initialize Express app
const app: Application = express();

// Trust proxy for rate limiting behind reverse proxy
app.set('trust proxy', 1);

// ============================================
// Global Middleware
// ============================================

// Security headers
app.use(helmet({
  contentSecurityPolicy: false, // Disable CSP for API
  crossOriginEmbedderPolicy: false,
}));

// CORS
app.use(cors(corsOptions));

// Compression
app.use(compression());

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Cookie parser
app.use(cookieParser());

// Request logging
app.use(requestLogger);

// Correlation ID
app.use((req: Request, res: Response, next: NextFunction) => {
  req.correlationId = req.headers['x-correlation-id'] as string || 
    `req-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
  res.setHeader('X-Correlation-ID', req.correlationId);
  next();
});

// Rate limiting
const limiter = rateLimit(rateLimitOptions);
app.use('/api/', limiter);

// Stricter rate limiting for auth endpoints
const authLimiter = rateLimit(authRateLimitOptions);
app.use('/api/v1/auth/', authLimiter);

// ============================================
// Service Index
// ============================================

// A bare GET / is a common first probe; answer with the service map instead of
// falling through to the 404 handler.
app.get('/', (req: Request, res: Response) => {
  res.json({
    success: true,
    data: {
      service: 'FDR Portal API',
      version: config.APP_VERSION,
      environment: config.NODE_ENV,
      baseUrl: '/api/v1',
      endpoints: {
        health: '/health',
        docs: '/api-docs',
        auth: '/api/v1/auth',
        users: '/api/v1/users',
        institutions: '/api/v1/institutions',
        fdrs: '/api/v1/fdrs',
        verification: '/api/v1/verification',
        officer: '/api/v1/officer',
        release: '/api/v1/release',
        admin: '/api/v1/admin',
        notifications: '/api/v1/notifications',
        webhooks: '/api/v1/webhooks',
        directory: '/api/v1/directory',
        rules: '/api/v1/rules',
        audit: '/api/v1/audit',
        uploads: '/api/v1/uploads',
        dashboard: '/api/v1/dashboard',
      },
    },
    meta: {
      timestamp: new Date().toISOString(),
      requestId: req.correlationId!,
    },
  });
});

// ============================================
// Health Check
// ============================================

app.get('/health', async (req: Request, res: Response) => {
  const health = {
    status: 'ok',
    timestamp: new Date().toISOString(),
    version: config.APP_VERSION,
    environment: config.NODE_ENV,
    uptime: process.uptime(),
    memory: process.memoryUsage(),
  };

  // Check database connection
  try {
    const prisma = new PrismaClient();
    await prisma.$runCommandRaw({ ping: 1 });
    await prisma.$disconnect();
    health.status = 'ok';
  } catch (error) {
    health.status = 'degraded';
    logger.error({ err: error }, 'Health check: database connection failed');
  }

  // Check Redis connection
  try {
    const redis = await connectRedis();
    if (redis) {
      await redis.ping();
    }
  } catch (error) {
    logger.warn({ err: error }, 'Health check: Redis connection failed');
  }

  const statusCode = health.status === 'ok' ? 200 : 503;
  res.status(statusCode).json(health);
});

// ============================================
// API Documentation (Swagger)
// ============================================

// The compiled server runs from `dist/`, one level shallower than `src/`, so
// resolve the spec against both locations before giving up.
const swaggerCandidates = [
  path.resolve(__dirname, '../docs/swagger.yaml'),   // backend/dist -> backend/docs
  path.resolve(__dirname, '../../docs/swagger.yaml'), // backend/src -> backend/docs
  path.resolve(process.cwd(), 'docs/swagger.yaml'),   // run from backend/
];

const swaggerPath = swaggerCandidates.find((candidate) => fs.existsSync(candidate));

if (swaggerPath) {
  try {
    const swaggerDocument = yaml.load(swaggerPath);
    app.use('/api-docs', swaggerUi.serve, swaggerUi.setup(swaggerDocument, {
      customCss: '.swagger-ui .topbar { display: none }',
      customSiteTitle: 'FDR Portal API Documentation',
    }));
    logger.info({ swaggerPath }, 'API documentation available at /api-docs');
  } catch (error) {
    logger.warn({ err: error, swaggerPath }, 'Failed to load Swagger document');
  }
} else {
  logger.warn(
    { searched: swaggerCandidates },
    'Swagger document not found; /api-docs will be unavailable'
  );
}

// ============================================
// API Routes
// ============================================

// Import route modules
import authRoutes from './routes/auth';
import userRoutes from './routes/users';
import institutionRoutes from './routes/institutions';
import fdrRoutes from './routes/fdrs';
import verificationRoutes from './routes/verification';
import officerRoutes from './routes/officer';
import releaseRoutes from './routes/release';
import adminRoutes from './routes/admin';
import notificationRoutes from './routes/notifications';
import webhookRoutes from './routes/webhooks';
import directoryRoutes from './routes/directory';
import rulesRoutes from './routes/rules';
import auditRoutes from './routes/audit';
import uploadRoutes from './routes/uploads';
import dashboardRoutes from './routes/dashboard';

// Mount routes
app.use('/api/v1/auth', authRoutes);
app.use('/api/v1/users', userRoutes);
app.use('/api/v1/institutions', institutionRoutes);
app.use('/api/v1/fdrs', fdrRoutes);
app.use('/api/v1/verification', verificationRoutes);
app.use('/api/v1/officer', officerRoutes);
app.use('/api/v1/release', releaseRoutes);
app.use('/api/v1/admin', adminRoutes);
app.use('/api/v1/notifications', notificationRoutes);
app.use('/api/v1/webhooks', webhookRoutes);
app.use('/api/v1/directory', directoryRoutes);
app.use('/api/v1/rules', rulesRoutes);
app.use('/api/v1/audit', auditRoutes);
app.use('/api/v1/uploads', uploadRoutes);
app.use('/api/v1/dashboard', dashboardRoutes);

// ============================================
// Error Handling
// ============================================

// 404 handler
app.use(notFoundHandler);

// Global error handler
app.use(errorHandler);

// ============================================
// Graceful Shutdown
// ============================================

const shutdown = async (signal: string) => {
  logger.info({ signal }, 'Received shutdown signal, starting graceful shutdown');
  
  try {
    await disconnectRedis();
    logger.info('Graceful shutdown complete');
    process.exit(0);
  } catch (error) {
    logger.error({ err: error }, 'Error during shutdown');
    process.exit(1);
  }
};

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  logger.fatal({ err: error }, 'Uncaught exception');
  process.exit(1);
});

process.on('unhandledRejection', (reason) => {
  logger.fatal({ reason }, 'Unhandled rejection');
  process.exit(1);
});

export default app;