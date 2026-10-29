// Jest setup file for backend
import '@testing-library/jest-dom';

// Mock Prisma client
jest.mock('@/lib/prisma', () => ({
  prisma: {
    user: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    institution: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    fDR: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      findMany: jest.fn(),
    },
    verificationRequest: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
    },
    refreshToken: {
      findUnique: jest.fn(),
      create: jest.fn(),
      update: jest.fn(),
      updateMany: jest.fn(),
    },
    auditLog: {
      create: jest.fn(),
      findMany: jest.fn(),
    },
    $queryRaw: jest.fn(),
    $disconnect: jest.fn(),
  },
}));

// Mock Redis
jest.mock('@/lib/redis', () => ({
  getRedisClient: jest.fn(() => null),
  connectRedis: jest.fn(),
  disconnectRedis: jest.fn(),
  cache: {
    get: jest.fn(),
    set: jest.fn(),
    del: jest.fn(),
    exists: jest.fn(),
    increment: jest.fn(),
  },
  rateLimiter: {
    checkLimit: jest.fn(),
  },
}));

// Mock config
jest.mock('@/config', () => ({
  config: {
    NODE_ENV: 'test',
    PORT: 3000,
    HOST: '0.0.0.0',
    APP_VERSION: '1.0.0',
    DATABASE_URL: 'mongodb://localhost:27017/fdr_portal_test',
    REDIS_URL: '',
    JWT_SECRET: 'test-secret-key-for-testing-only-32-chars-long',
    JWT_ACCESS_EXPIRY: '15m',
    JWT_REFRESH_EXPIRY: '7d',
    JWT_ISSUER: 'fdr-portal',
    JWT_AUDIENCE: 'fdr-portal',
    JWT_ALGORITHM: 'HS256',
    MFA_ISSUER: 'FDR Portal',
    ENCRYPTION_KEY: 'test-encryption-key-32-chars-long!!',
    CORS_ORIGIN: 'http://localhost:3001',
    RATE_LIMIT_MAX: 100,
    RATE_LIMIT_WINDOW: '1 minute',
    OTP_EXPIRY_MINUTES: 10,
    OTP_MAX_ATTEMPTS: 5,
    VERIFICATION_TOKEN_EXPIRY_HOURS: 48,
    FRONTEND_URL: 'http://localhost:3001',
    LOG_LEVEL: 'silent',
  },
  isDevelopment: true,
  isProduction: false,
  isTesting: true,
  corsOptions: {
    origin: 'http://localhost:3001',
    credentials: true,
  },
  rateLimitOptions: {
    windowMs: 60000,
    max: 100,
  },
  authRateLimitOptions: {
    windowMs: 900000,
    max: 10,
  },
}));

// Mock logger
jest.mock('@/lib/logger', () => ({
  info: jest.fn(),
  warn: jest.fn(),
  error: jest.fn(),
  debug: jest.fn(),
  fatal: jest.fn(),
  child: jest.fn(() => ({
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
  })),
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    error: jest.fn(),
    debug: jest.fn(),
    fatal: jest.fn(),
    child: jest.fn(() => ({
      info: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
      debug: jest.fn(),
      fatal: jest.fn(),
    })),
  },
}));

// Increase timeout for async tests
jest.setTimeout(10000);