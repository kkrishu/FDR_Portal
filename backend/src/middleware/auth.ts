/**
 * Authentication Middleware
 * JWT validation, user context, and permission checks
 */

import { Request, Response, NextFunction } from 'express';
import jwt from 'jsonwebtoken';
import { prisma } from '../lib/prisma';
import logger from '../lib/logger';
import { config, constants } from '../config';
import { AppError, AuthenticationError, AuthorizationError, ErrorCodes, HttpStatus } from './errorHandler';
import { UserRole, UserStatus, JWTPayload } from '@fdr-portal/shared';

// Extend Express Request type
declare global {
  namespace Express {
    interface Request {
      user?: JWTPayload & { id: string };
      correlationId?: string;
    }
  }
}

/**
 * Extract token from request
 */
function extractToken(req: Request): string | null {
  // Check Authorization header
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith('Bearer ')) {
    return authHeader.substring(7);
  }

  // Check cookie
  if (req.cookies?.accessToken) {
    return req.cookies.accessToken;
  }

  // SECURITY: Query parameter token support removed to prevent token leakage in logs/referrer
  // For SSE/WebSocket, use proper authentication mechanisms instead

  return null;
}

/**
 * Verify JWT token
 */
async function verifyToken(token: string): Promise<JWTPayload | null> {
  try {
    const decoded = jwt.verify(token, config.JWT_PUBLIC_KEY || config.JWT_SECRET, {
      issuer: constants.jwt.issuer,
      audience: constants.jwt.audience,
      algorithms: [constants.jwt.algorithm as jwt.Algorithm],
    }) as JWTPayload;

    return decoded;
  } catch (error) {
    if (error instanceof jwt.TokenExpiredError) {
      throw new AuthenticationError('Token expired', ErrorCodes.TOKEN_EXPIRED);
    }
    if (error instanceof jwt.JsonWebTokenError) {
      throw new AuthenticationError('Invalid token', ErrorCodes.TOKEN_INVALID);
    }
    throw error;
  }
}

/**
 * Check if token is revoked
 */
async function isTokenRevoked(token: string): Promise<boolean> {
  const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex');
  
  const refreshToken = await prisma.refreshToken.findUnique({
    where: { tokenHash },
  });

  return refreshToken?.revoked ?? false;
}

/**
 * Main authentication middleware
 */
export async function authMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    
    if (!token) {
      throw new AuthenticationError('No token provided', ErrorCodes.TOKEN_INVALID);
    }

    // Check if token is revoked
    const revoked = await isTokenRevoked(token);
    if (revoked) {
      throw new AuthenticationError('Token has been revoked', ErrorCodes.REFRESH_TOKEN_REVOKED);
    }

    // Verify token
    const payload = await verifyToken(token);
    if (!payload) {
      throw new AuthenticationError('Invalid token', ErrorCodes.TOKEN_INVALID);
    }

    // Attach user to request
    req.user = {
      ...payload,
      id: payload.sub,
    };

    next();
  } catch (error) {
    next(error);
  }
}

/**
 * Optional authentication - doesn't throw if no token
 */
export async function optionalAuthMiddleware(req: Request, res: Response, next: NextFunction) {
  try {
    const token = extractToken(req);
    
    if (!token) {
      return next();
    }

    const revoked = await isTokenRevoked(token);
    if (revoked) {
      return next();
    }

    const payload = await verifyToken(token);
    if (payload) {
      req.user = {
        ...payload,
        id: payload.sub,
      };
    }

    next();
  } catch (error) {
    // Silently fail for optional auth
    next();
  }
}

/**
 * Role-based authorization middleware
 */
export function requireRole(...allowedRoles: UserRole[]) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AuthenticationError('Authentication required', ErrorCodes.TOKEN_INVALID);
    }

    if (!allowedRoles.includes(req.user.role)) {
      throw new AuthorizationError(
        `Role ${req.user.role} not authorized for this resource`,
        ErrorCodes.INSUFFICIENT_PERMISSIONS
      );
    }

    next();
  };
}

/**
 * Permission-based authorization middleware
 */
export function requirePermission(resource: string, action: string) {
  return (req: Request, res: Response, next: NextFunction) => {
    if (!req.user) {
      throw new AuthenticationError('Authentication required', ErrorCodes.TOKEN_INVALID);
    }

    // Define permission matrix
    const permissions: Record<UserRole, Record<string, string[]>> = {
      INSTITUTION: {
        fdr: ['create', 'read', 'update', 'submit', 'renew', 'release-request'],
        document: ['create', 'read', 'update', 'delete'],
        profile: ['read', 'update'],
        notification: ['read'],
      },
      OFFICER: {
        fdr: ['read', 'verify', 'flag', 'remark', 'document-request', 'manual-verify', 'release-recommend'],
        reviewQueue: ['read'],
        search: ['read'],
        expiryTracker: ['read'],
        notification: ['read'],
      },
      ADMIN: {
        '*': ['*'], // Admin has all permissions
      },
      BANK_MANAGER: {
        verification: ['read', 'submit'],
        fdr: ['read'],
      },
      NODAL_OFFICER: {
        verification: ['read', 'submit', 'history'],
        fdr: ['read'],
        dashboard: ['read'],
      },
      AUDITOR: {
        audit: ['read'],
        fdr: ['read'],
        report: ['read'],
      },
    };

    const rolePermissions = permissions[req.user.role];
    if (!rolePermissions) {
      throw new AuthorizationError('Unknown role', ErrorCodes.INSUFFICIENT_PERMISSIONS);
    }

    // Check wildcard permission
    if (rolePermissions['*']?.includes('*') || rolePermissions['*']?.includes(action)) {
      return next();
    }

    const resourcePermissions = rolePermissions[resource];
    if (!resourcePermissions?.includes(action) && !resourcePermissions?.includes('*')) {
      throw new AuthorizationError(
        `Insufficient permissions for ${action} on ${resource}`,
        ErrorCodes.INSUFFICIENT_PERMISSIONS
      );
    }

    next();
  };
}

/**
 * Data isolation middleware - ensures users can only access their own data
 */
export function dataIsolationMiddleware(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return next();
  }

  // Admin can access all data
  if (req.user.role === 'ADMIN') {
    return next();
  }

  // Add institutionId/bankId to query for filtering
  const institutionId = req.user.institutionId;
  const bankId = req.user.bankId;

  // For GET requests, add filters to query
  if (req.method === 'GET') {
    if (institutionId && !req.query.institutionId) {
      req.query.institutionId = institutionId;
    }
    if (bankId && !req.query.bankId) {
      req.query.bankId = bankId;
    }
  }

  // For write operations, validate ownership
  if (['POST', 'PUT', 'PATCH', 'DELETE'].includes(req.method)) {
    const bodyInstitutionId = req.body.institutionId;
    const bodyBankId = req.body.bankId;

    if (institutionId && bodyInstitutionId && bodyInstitutionId !== institutionId) {
      throw new AuthorizationError('Cannot modify data for another institution', ErrorCodes.DATA_ISOLATION_VIOLATION);
    }

    if (bankId && bodyBankId && bodyBankId !== bankId) {
      throw new AuthorizationError('Cannot modify data for another bank', ErrorCodes.DATA_ISOLATION_VIOLATION);
    }

    // Set the correct institution/bank ID
    if (institutionId) {
      req.body.institutionId = institutionId;
    }
    if (bankId) {
      req.body.bankId = bankId;
    }
  }

  next();
}

/**
 * MFA verification middleware
 */
export function requireMFA(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    throw new AuthenticationError('Authentication required', ErrorCodes.TOKEN_INVALID);
  }

  // Check if MFA is enabled for this user's role
  const mfaRequiredRoles: UserRole[] = ['OFFICER', 'ADMIN', 'NODAL_OFFICER'];
  
  if (!mfaRequiredRoles.includes(req.user.role)) {
    return next();
  }

  // Check if user has MFA enabled
  // This would typically be checked from the database
  // For now, we'll check a header or claim
  const mfaVerified = req.headers['x-mfa-verified'] === 'true' || req.user.mfaVerified === true;
  
  if (!mfaVerified) {
    throw new AuthenticationError('MFA verification required', ErrorCodes.MFA_REQUIRED);
  }

  next();
}

/**
 * Generate access token
 */
export function generateAccessToken(payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'>): string {
  return jwt.sign(payload, config.JWT_PRIVATE_KEY || config.JWT_SECRET, {
    expiresIn: constants.jwt.accessExpiry as jwt.SignOptions['expiresIn'],
    issuer: constants.jwt.issuer,
    audience: constants.jwt.audience,
    algorithm: constants.jwt.algorithm as jwt.Algorithm,
  });
}

/**
 * Generate refresh token
 */
export function generateRefreshToken(userId: string): string {
  return jwt.sign(
    { sub: userId, type: 'refresh' },
    config.JWT_PRIVATE_KEY || config.JWT_SECRET,
    {
      expiresIn: constants.jwt.refreshExpiry as jwt.SignOptions['expiresIn'],
      issuer: constants.jwt.issuer,
      audience: constants.jwt.audience,
      algorithm: constants.jwt.algorithm as jwt.Algorithm,
    }
  );
}

/**
 * Verify refresh token
 */
export async function verifyRefreshToken(token: string): Promise<{ userId: string } | null> {
  try {
    const decoded = jwt.verify(token, config.JWT_PUBLIC_KEY || config.JWT_SECRET, {
      issuer: constants.jwt.issuer,
      audience: constants.jwt.audience,
      algorithms: [constants.jwt.algorithm as jwt.Algorithm],
    }) as { sub: string; type: string };

    if (decoded.type !== 'refresh') {
      return null;
    }

    // Check if refresh token exists and not revoked
    const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex');
    const refreshToken = await prisma.refreshToken.findUnique({
      where: { tokenHash },
    });

    if (!refreshToken || refreshToken.revoked || refreshToken.expiresAt < new Date()) {
      return null;
    }

    return { userId: decoded.sub };
  } catch {
    return null;
  }
}

/**
 * Store refresh token
 */
export async function storeRefreshToken(userId: string, token: string): Promise<void> {
  const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex');
  const expiresAt = new Date(Date.now() + 7 * 24 * 60 * 60 * 1000); // 7 days

  await prisma.refreshToken.create({
    data: {
      userId,
      tokenHash,
      expiresAt,
    },
  });
}

/**
 * Revoke refresh token
 */
export async function revokeRefreshToken(token: string): Promise<void> {
  const tokenHash = require('crypto').createHash('sha256').update(token).digest('hex');

  await prisma.refreshToken.update({
    where: { tokenHash },
    data: { revoked: true },
  });
}

/**
 * Revoke all refresh tokens for a user
 */
export async function revokeAllRefreshTokens(userId: string): Promise<void> {
  await prisma.refreshToken.updateMany({
    where: { userId, revoked: false },
    data: { revoked: true },
  });
}

/**
 * Generate device fingerprint from request
 */
export function generateDeviceFingerprint(req: Request): string {
  const userAgent = req.get('user-agent') || '';
  const acceptLanguage = req.get('accept-language') || '';
  const acceptEncoding = req.get('accept-encoding') || '';
  const ip = req.ip || '';
  
  // Simple hash of identifying characteristics
  const data = `${userAgent}|${acceptLanguage}|${acceptEncoding}|${ip}`;
  return require('crypto').createHash('sha256').update(data).digest('hex').substring(0, 32);
}

/**
 * Track user session - creates or updates session on authenticated requests
 */
export async function trackSession(req: Request, res: Response, next: NextFunction) {
  if (!req.user) {
    return next();
  }

  try {
    const deviceFingerprint = generateDeviceFingerprint(req);
    const ipAddress = req.ip;
    const userAgent = req.get('user-agent');

    // Find existing session
    let session = await prisma.userSession.findFirst({
      where: {
        userId: req.user.id,
        deviceFingerprint,
        revokedAt: null,
      },
    });

    if (session) {
      // Update last active time
      await prisma.userSession.update({
        where: { id: session.id },
        data: { lastActiveAt: new Date() },
      });
    } else {
      // Create new session
      // Enrich with geolocation
      const geo = enrichIpAddress(ipAddress);
      
      await prisma.userSession.create({
        data: {
          userId: req.user.id,
          deviceFingerprint,
          ipAddress,
          userAgent,
          country: geo?.country,
          city: geo?.city,
          region: geo?.region,
        },
      });
    }
  } catch (error) {
    // Don't break the request if session tracking fails
    console.warn('Session tracking failed:', error);
  }

  next();
}

/**
 * Enrich IP address with geolocation data
 */
function enrichIpAddress(ipAddress?: string | null): {
  country?: string;
  city?: string;
  region?: string;
} | null {
  if (!ipAddress || ipAddress === '::1' || ipAddress === '127.0.0.1' || ipAddress.startsWith('192.168.') || ipAddress.startsWith('10.') || ipAddress.startsWith('172.')) {
    return null;
  }
  
  try {
    const geoip = require('geoip-lite');
    const geo = geoip.lookup(ipAddress);
    if (geo) {
      return {
        country: geo.country,
        city: geo.city,
        region: geo.region,
      };
    }
  } catch (error) {
    console.warn('Failed to lookup geolocation:', error);
  }
  return null;
}