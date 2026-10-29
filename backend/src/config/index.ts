/**
 * Backend Configuration
 * Centralized configuration management with validation
 */

import { z } from 'zod';
import dotenv from 'dotenv';
import path from 'path';

// Load environment variables. .env.local holds developer secrets (gitignored)
// and takes precedence over the committed .env defaults.
dotenv.config({ path: path.resolve(process.cwd(), '.env.local') });
dotenv.config();

// Prisma reads DATABASE_URL; accept the more descriptive MONGODB_URI as an alias.
if (!process.env.DATABASE_URL && process.env.MONGODB_URI) {
  process.env.DATABASE_URL = process.env.MONGODB_URI;
}

// ============================================
// Environment Schema
// ============================================

const envSchema = z.object({
  // Server
  NODE_ENV: z.enum(['development', 'testing', 'staging', 'production']).default('development'),
  PORT: z.coerce.number().int().positive().default(3000),
  HOST: z.string().default('0.0.0.0'),
  APP_VERSION: z.string().default('1.0.0'),

  // Database
  DATABASE_URL: z.string().url().startsWith('mongodb', 'Must be a MongoDB connection string'),
  MONGODB_DATABASE: z.string().default('fdr_portal'),

  // Redis
  REDIS_URL: z.string().optional(),

  // JWT
  JWT_SECRET: z.string().min(32, 'JWT secret must be at least 32 characters'),
  JWT_ACCESS_EXPIRY: z.string().default('15m'),
  JWT_REFRESH_EXPIRY: z.string().default('7d'),
  JWT_ISSUER: z.string().default('fdr-portal'),
  JWT_AUDIENCE: z.string().default('fdr-portal'),
  JWT_ALGORITHM: z.enum(['RS256', 'HS256']).default('RS256'),
  JWT_PRIVATE_KEY: z.string().optional(),
  JWT_PUBLIC_KEY: z.string().optional(),

  // MFA
  MFA_ISSUER: z.string().default('FDR Portal'),

  // Encryption
  ENCRYPTION_KEY: z.string().length(32, 'Encryption key must be exactly 32 characters'),

  // File Storage (Cloudinary)
  CLOUDINARY_CLOUD_NAME: z.string().optional(),
  CLOUDINARY_API_KEY: z.string().optional(),
  CLOUDINARY_API_SECRET: z.string().optional(),

  // Email (SMTP)
  SMTP_HOST: z.string().default('localhost'),
  SMTP_PORT: z.coerce.number().int().positive().default(587),
  SMTP_USER: z.string().optional(),
  SMTP_PASS: z.string().optional(),
  SMTP_FROM: z.string().email().default('noreply@fdr-portal.gov.in'),
  SMTP_SECURE: z.coerce.boolean().default(false),

  // SMS (Twilio)
  SMS_PROVIDER: z.string().default('twilio'),
  SMS_ACCOUNT_SID: z.string().optional(),
  SMS_AUTH_TOKEN: z.string().optional(),
  SMS_FROM: z.string().optional(),

  // CORS. Comma-separated allow-list — a Vercel preview domain, the production
  // domain, and localhost can coexist. With credentials enabled the origin must
  // be matched exactly; '*' is never honoured by browsers.
  CORS_ORIGIN: z.string().default('http://localhost:3001'),

  // Refresh-cookie policy. A cross-site deployment (Vercel frontend, Render
  // backend) needs SameSite=None plus Secure, or the browser silently drops
  // the cookie and every session dies at access-token expiry.
  COOKIE_SAMESITE: z.enum(['lax', 'strict', 'none']).default('lax'),
  COOKIE_SECURE: z.coerce.boolean().default(false),

  // Rate Limiting
  RATE_LIMIT_MAX: z.coerce.number().int().positive().default(100),
  RATE_LIMIT_WINDOW: z.string().default('1 minute'),
  // Authentication is throttled more aggressively than general traffic. The
  // default is deliberately strict; local development overrides it in .env.local
  // so a test run does not lock the developer out of their own server.
  AUTH_RATE_LIMIT_MAX: z.coerce.number().int().positive().default(10),
  AUTH_RATE_LIMIT_WINDOW: z.string().default('15 minutes'),

  // OTP
  OTP_EXPIRY_MINUTES: z.coerce.number().int().positive().default(10),
  OTP_MAX_ATTEMPTS: z.coerce.number().int().positive().default(5),

  // Verification Token
  VERIFICATION_TOKEN_EXPIRY_HOURS: z.coerce.number().int().positive().default(48),

  // Webhook
  WEBHOOK_SECRET: z.string().optional(),

  // Frontend URL
  FRONTEND_URL: z.string().url().default('http://localhost:3001'),

  // API Keys
  API_KEY_PREFIX: z.string().default('fdr_'),

  // Logging
  LOG_LEVEL: z.enum(['trace', 'debug', 'info', 'warn', 'error', 'fatal']).default('debug'),

  // Feature Flags
  FEATURE_MFA_ENABLED: z.coerce.boolean().default(true),
  FEATURE_SSO_ENABLED: z.coerce.boolean().default(false),
  FEATURE_WEBHOOKS_ENABLED: z.coerce.boolean().default(true),
  FEATURE_API_CONNECTOR_ENABLED: z.coerce.boolean().default(true),
});

// ============================================
// Parse and Validate
// ============================================

const parsedEnv = envSchema.safeParse(process.env);

if (!parsedEnv.success) {
  console.error('❌ Invalid environment variables:');
  console.error(parsedEnv.error.format());
  process.exit(1);
}

export const config = parsedEnv.data;

// ============================================
// Derived Configuration
// ============================================

export const isDevelopment = config.NODE_ENV === 'development';
export const isProduction = config.NODE_ENV === 'production';
export const isTesting = config.NODE_ENV === 'testing';

/**
 * The origin allow-list, trimmed. In development localhost on any port is
 * always allowed so the two dev servers keep working out of the box.
 */
const allowedOrigins = config.CORS_ORIGIN.split(',').map((origin) => origin.trim()).filter(Boolean);

export const corsOptions = {
  origin(origin: string | undefined, callback: (err: Error | null, value?: boolean) => void) {
    if (!origin) return callback(null, true); // curl, same-origin, health checks
    if (allowedOrigins.includes(origin)) return callback(null, true);
    if (!isProduction && /^https?:\/\/localhost(:\d+)?$/.test(origin)) return callback(null, true);
    // A disallowed origin gets no CORS headers rather than an error response —
    // the browser blocks it, and the backend stays quiet about probes.
    return callback(null, false);
  },
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: [
    'Content-Type',
    'Authorization',
    'X-Requested-With',
    'X-Correlation-ID',
    'X-Client-Version',
    'X-Retry',
    'X-CSRF-Token',
  ],
  exposedHeaders: ['X-Correlation-ID', 'X-RateLimit-Limit', 'X-RateLimit-Remaining'],
};

export const rateLimitOptions = {
  windowMs: parseRateLimitWindow(config.RATE_LIMIT_WINDOW),
  max: config.RATE_LIMIT_MAX,
  message: { error: 'Too many requests, please try again later' },
  standardHeaders: true,
  legacyHeaders: false,
};

export const authRateLimitOptions = {
  windowMs: parseRateLimitWindow(config.AUTH_RATE_LIMIT_WINDOW),
  max: config.AUTH_RATE_LIMIT_MAX,
  standardHeaders: true,
  legacyHeaders: false,
  // Keep successful logins from consuming the budget: only failed attempts count
  // toward the limit, so ordinary use never trips it.
  skipSuccessfulRequests: true,
  message: {
    success: false,
    error: {
      code: 'RATE_LIMIT_EXCEEDED',
      message: `Too many authentication attempts. Please wait and try again.`,
    },
  },
};

function parseRateLimitWindow(window: string): number {
  const match = window.match(/^(\d+)\s*(second|minute|hour|day)s?$/i);
  if (!match) return 60000; // default 1 minute

  const value = parseInt(match[1], 10);
  const unit = match[2].toLowerCase();

  switch (unit) {
    case 'second':
      return value * 1000;
    case 'minute':
      return value * 60 * 1000;
    case 'hour':
      return value * 60 * 60 * 1000;
    case 'day':
      return value * 24 * 60 * 60 * 1000;
    default:
      return 60000;
  }
}

// ============================================
// Feature Flags
// ============================================

export const features = {
  mfa: config.FEATURE_MFA_ENABLED,
  sso: config.FEATURE_SSO_ENABLED,
  webhooks: config.FEATURE_WEBHOOKS_ENABLED,
  apiConnector: config.FEATURE_API_CONNECTOR_ENABLED,
} as const;

// ============================================
// Constants
// ============================================

/**
 * Options for the httpOnly refresh cookie, derived from the environment. The
 * auth routes all set the same cookie, so the policy lives here.
 */
export const refreshCookieOptions = {
  httpOnly: true,
  secure: config.COOKIE_SECURE || isProduction,
  sameSite: (config.COOKIE_SAMESITE || (isProduction ? 'none' : 'lax')) as 'lax' | 'strict' | 'none',
  maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
  path: '/',
};

export const constants = {
  jwt: {
    accessExpiry: config.JWT_ACCESS_EXPIRY,
    refreshExpiry: config.JWT_REFRESH_EXPIRY,
    issuer: config.JWT_ISSUER,
    audience: config.JWT_AUDIENCE,
    algorithm: config.JWT_ALGORITHM,
  },
  mfa: {
    issuer: config.MFA_ISSUER,
  },
  otp: {
    expiryMinutes: config.OTP_EXPIRY_MINUTES,
    maxAttempts: config.OTP_MAX_ATTEMPTS,
  },
  verification: {
    tokenExpiryHours: config.VERIFICATION_TOKEN_EXPIRY_HOURS,
  },
  fileUpload: {
    maxSizeMB: 10,
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
  },
  pagination: {
    defaultPage: 1,
    defaultLimit: 20,
    maxLimit: 100,
  },
} as const;