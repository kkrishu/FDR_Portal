/**
 * CSRF Protection Middleware
 * Double-submit cookie pattern for state-changing operations
 */

import { Request, Response, NextFunction } from 'express';
import { config } from '../config';
import { AppError, ErrorCodes, HttpStatus } from './errorHandler';
import { createHash, randomBytes } from 'crypto';

const CSRF_COOKIE_NAME = 'csrf-token';
const CSRF_HEADER_NAME = 'X-CSRF-Token';
const CSRF_TOKEN_LENGTH = 32;

/**
 * Generate a CSRF token
 */
export function generateCsrfToken(): string {
  return randomBytes(CSRF_TOKEN_LENGTH).toString('hex');
}

/**
 * Create a CSRF token hash for storage/validation
 */
function hashToken(token: string): string {
  return createHash('sha256').update(token).digest('hex');
}

/**
 * Get CSRF cookie options
 */
function getCsrfCookieOptions() {
  return {
    httpOnly: true,
    secure: config.COOKIE_SECURE || config.NODE_ENV === 'production',
    sameSite: (config.COOKIE_SAMESITE || (config.NODE_ENV === 'production' ? 'none' : 'lax')) as 'lax' | 'strict' | 'none',
    maxAge: 24 * 60 * 60 * 1000, // 24 hours
    path: '/',
  };
}

/**
 * CSRF Protection Middleware
 * - Generates CSRF token for GET requests if not present
 * - Validates CSRF token for state-changing methods (POST, PUT, PATCH, DELETE)
 * - Uses double-submit cookie pattern
 */
export function csrfProtection(req: Request, res: Response, next: NextFunction) {
  // Skip CSRF for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    // Ensure CSRF token is available in cookie for future requests
    if (!req.cookies?.[CSRF_COOKIE_NAME]) {
      const token = generateCsrfToken();
      res.cookie(CSRF_COOKIE_NAME, token, getCsrfCookieOptions());
    }
    return next();
  }

  // Skip CSRF for health checks and non-API routes
  if (req.path === '/health' || req.path === '/' || req.path.startsWith('/api-docs')) {
    return next();
  }

  // For auth endpoints, CSRF is not needed (they use rate limiting and other protections)
  if (req.path.startsWith('/api/v1/auth/')) {
    return next();
  }

  // Validate CSRF token for state-changing operations
  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME.toLowerCase()];

  if (!cookieToken || !headerToken) {
    throw new AppError(
      'CSRF token missing',
      HttpStatus.FORBIDDEN,
      ErrorCodes.FORBIDDEN
    );
  }

  // Validate token (compare hashes to prevent timing attacks)
  const cookieHash = hashToken(cookieToken);
  const headerHash = hashToken(headerToken as string);

  if (cookieHash !== headerHash) {
    throw new AppError(
      'Invalid CSRF token',
      HttpStatus.FORBIDDEN,
      ErrorCodes.FORBIDDEN
    );
  }

  next();
}

/**
 * Optional CSRF protection - only validates if token is present
 * Useful for endpoints that might be called from non-browser clients
 */
export function optionalCsrfProtection(req: Request, res: Response, next: NextFunction) {
  // Skip CSRF for safe methods
  if (['GET', 'HEAD', 'OPTIONS'].includes(req.method)) {
    return next();
  }

  // Skip CSRF for health checks and non-API routes
  if (req.path === '/health' || req.path === '/' || req.path.startsWith('/api-docs')) {
    return next();
  }

  // Skip CSRF for auth endpoints
  if (req.path.startsWith('/api/v1/auth/')) {
    return next();
  }

  const cookieToken = req.cookies?.[CSRF_COOKIE_NAME];
  const headerToken = req.headers[CSRF_HEADER_NAME.toLowerCase()];

  // If both are present, validate
  if (cookieToken && headerToken) {
    const cookieHash = hashToken(cookieToken);
    const headerHash = hashToken(headerToken as string);

    if (cookieHash !== headerHash) {
      throw new AppError(
        'Invalid CSRF token',
        HttpStatus.FORBIDDEN,
        ErrorCodes.FORBIDDEN
      );
    }
  }

  next();
}

/**
 * Middleware to expose CSRF token to client via response header
 * Useful for SPA clients to read and include in subsequent requests
 */
export function exposeCsrfToken(req: Request, res: Response, next: NextFunction) {
  const token = req.cookies?.[CSRF_COOKIE_NAME] || generateCsrfToken();
  res.setHeader(CSRF_HEADER_NAME, token);
  next();
}

export { CSRF_COOKIE_NAME, CSRF_HEADER_NAME };