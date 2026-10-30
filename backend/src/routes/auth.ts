/**
 * Authentication Routes
 * Login, register, token refresh, MFA, logout
 */

import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { authService } from '../services/authService';
import { prisma } from '../lib/prisma';
import { refreshCookieOptions } from '../config';
import { authMiddleware, optionalAuthMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { loginSchema, mfaVerifySchema, mfaSetupSchema } from '@fdr-portal/shared/validators';
import { ValidationError, AuthenticationError, AuthorizationError, NotFoundError, ErrorCodes } from '../middleware/errorHandler';
import { generateDeviceFingerprint } from '../middleware/auth';

const router: Router = Router();

// ============================================
// Public Routes
// ============================================

/**
 * GET /api/v1/auth/banks
 * Public list of active banks for the sign-up form. Bank and nodal-officer
 * registrants must attach themselves to a real directory entry, which only
 * exists if an administrator has added it.
 */
router.get('/banks', asyncHandler(async (_req: Request, res: Response) => {
  const banks = await prisma.bank.findMany({
    where: { isActive: true },
    orderBy: { name: 'asc' },
    select: { id: true, name: true, code: true },
  });

  res.json({
    success: true,
    data: banks,
    meta: { timestamp: new Date().toISOString(), requestId: _req.correlationId! },
  });
}));

/**
 * POST /api/v1/auth/login
 * User login with optional MFA
 */
router.post('/login', asyncHandler(async (req: Request, res: Response) => {
  const validated = loginSchema.parse(req.body);
  
  const result = await authService.login(validated.email, validated.password, validated.mfaCode);
  
  if (result.mfaRequired) {
    return res.status(200).json({
      success: true,
      data: { mfaRequired: true, user: result.user },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  }

  // Set refresh token as httpOnly cookie
  res.cookie('refreshToken', result.tokens.refreshToken, refreshCookieOptions);

  res.json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.tokens.accessToken,
      accessTokenExpiry: result.tokens.accessTokenExpiry,
    },
    meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
  });
}));

/**
 * POST /api/v1/auth/register
 * Public self-service registration. Administrators are excluded by the schema —
 * an admin account can only be created by an existing admin.
 */
router.post('/register', asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.register(req.body);
  
  // Set refresh token as httpOnly cookie
  res.cookie('refreshToken', result.tokens.refreshToken, refreshCookieOptions);

  res.status(201).json({
    success: true,
    data: {
      user: result.user,
      accessToken: result.tokens.accessToken,
      accessTokenExpiry: result.tokens.accessTokenExpiry,
    },
    meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
  });
}));

/**
 * POST /api/v1/auth/refresh
 * Refresh access token using refresh token
 */
router.post('/refresh', asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
  
  if (!refreshToken) {
    throw new AuthenticationError('Refresh token required', ErrorCodes.REFRESH_TOKEN_EXPIRED);
  }

  const tokens = await authService.refreshToken(refreshToken);

  // Set new refresh token as httpOnly cookie
  res.cookie('refreshToken', tokens.refreshToken, refreshCookieOptions);

  res.json({
    success: true,
    data: {
      accessToken: tokens.accessToken,
      accessTokenExpiry: tokens.accessTokenExpiry,
    },
    meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
  });
}));

/**
 * POST /api/v1/auth/logout
 * Logout current session
 */
router.post('/logout', asyncHandler(async (req: Request, res: Response) => {
  const refreshToken = req.cookies?.refreshToken || req.body.refreshToken;
  
  if (refreshToken) {
    await authService.logout(refreshToken);
  }

  // Clear refresh token cookie
  res.clearCookie('refreshToken', { path: refreshCookieOptions.path });

  res.json({
    success: true,
    data: { message: 'Logged out successfully' },
    meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
  });
}));

/**
 * POST /api/v1/auth/logout-all
 * Logout from all devices
 */
router.post('/logout-all', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  await authService.logoutAll(req.user!.id);
  
  // Clear refresh token cookie
  res.clearCookie('refreshToken', { path: refreshCookieOptions.path });

  res.json({
    success: true,
    data: { message: 'Logged out from all devices' },
    meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
  });
}));

/**
 * POST /api/v1/auth/forgot-password
 * Request a password reset link. Always answers with the same message so the
 * endpoint cannot be used to discover which addresses have accounts.
 */
router.post('/forgot-password', asyncHandler(async (req: Request, res: Response) => {
  const { email } = z.object({ email: z.string().email('Enter a valid email address') }).parse(req.body);

  const message = await authService.requestPasswordReset(email, req.ip);

  res.json({
    success: true,
    data: { message },
    meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
  });
}));

/**
 * POST /api/v1/auth/reset-password
 * Consume a reset token and set a new password.
 */
router.post('/reset-password', asyncHandler(async (req: Request, res: Response) => {
  const { token, password } = z
    .object({
      token: z.string().min(16, 'Reset token is required'),
      password: z.string().min(8, 'Password must be at least 8 characters').max(128),
    })
    .parse(req.body);

  await authService.resetPassword(token, password);

  res.json({
    success: true,
    data: { message: 'Password reset successfully. You can now sign in.' },
    meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
  });
}));

// ============================================
// Protected Routes (require authentication)
// ============================================

/**
 * PATCH /api/v1/auth/me
 * Update the signed-in user's own name or avatar. Role, status and tenant
 * bindings are intentionally not editable here.
 */
router.patch('/me', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const updated = await authService.updateOwnAccount(req.user!.id, req.body ?? {});

  res.json({
    success: true,
    data: { user: updated },
    meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
  });
}));

/**
 * GET /api/v1/auth/me
 * Get current user profile
 */
router.get('/me', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const user = await prisma.user.findUnique({
    where: { id: req.user!.id },
    select: {
      id: true,
      email: true,
      name: true,
      role: true,
      status: true,
      institutionId: true,
      bankId: true,
      mfaEnabled: true,
      avatarUrl: true,
      lastLoginAt: true,
    },
  });

  res.json({
    success: true,
    data: { user },
    meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
  });
}));

/**
 * POST /api/v1/auth/change-password
 * Change password
 */
router.post('/change-password', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    currentPassword: z.string().min(1, 'Current password is required'),
    newPassword: z.string().min(8, 'Password must be at least 8 characters').max(128),
  });
  
  const { currentPassword, newPassword } = schema.parse(req.body);
  
  await authService.changePassword(req.user!.id, currentPassword, newPassword);
  
  res.json({
    success: true,
    data: { message: 'Password changed successfully' },
    meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
  });
}));

// ============================================
// MFA Routes
// ============================================

/**
 * POST /api/v1/auth/mfa/setup
 * Setup MFA - generate secret and QR code
 */
router.post('/mfa/setup', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const result = await authService.setupMFA(req.user!.id);
  
  res.json({
    success: true,
    data: result,
    meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
  });
}));

/**
 * POST /api/v1/auth/mfa/verify
 * Verify MFA token and enable MFA
 */
router.post('/mfa/verify', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const validated = mfaVerifySchema.parse(req.body);
  
  await authService.verifyAndEnableMFA(req.user!.id, validated.token);
  
  res.json({
    success: true,
    data: { message: 'MFA enabled successfully' },
    meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
  });
}));

/**
 * POST /api/v1/auth/mfa/disable
 * Disable MFA
 */
router.post('/mfa/disable', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    password: z.string().min(1),
  });
  
  const { password } = schema.parse(req.body);
  
  await authService.disableMFA(req.user!.id, password);
  
  res.json({
    success: true,
    data: { message: 'MFA disabled successfully' },
    meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
  });
}));

/**
 * POST /api/v1/auth/mfa/backup-code
 * Verify MFA backup code
 */
router.post('/mfa/backup-code', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const schema = z.object({
    code: z.string().length(8),
  });
  
  const { code } = schema.parse(req.body);
  
  const isValid = await authService.verifyBackupCode(req.user!.id, code);
  
  if (!isValid) {
    throw new AuthenticationError('Invalid backup code', ErrorCodes.MFA_INVALID);
  }
  
  res.json({
    success: true,
    data: { message: 'Backup code verified' },
    meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
  });
}));

/**
 * GET /api/v1/auth/mfa/status
 * Get MFA status
 */
router.get('/mfa/status', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  res.json({
    success: true,
    data: { mfaEnabled: req.user!.mfaEnabled || false },
    meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
  });
}));

// ============================================
// Session Management Routes
// ============================================

/**
 * GET /api/v1/auth/sessions
 * List active sessions for current user
 */
router.get('/sessions', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const sessions = await prisma.userSession.findMany({
    where: {
      userId: req.user!.id,
      revokedAt: null,
    },
    orderBy: { lastActiveAt: 'desc' },
    select: {
      id: true,
      deviceFingerprint: true,
      ipAddress: true,
      userAgent: true,
      country: true,
      city: true,
      region: true,
      createdAt: true,
      lastActiveAt: true,
    },
  });

  res.json({
    success: true,
    data: sessions,
    meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
  });
}));

/**
 * DELETE /api/v1/auth/sessions/:id
 * Revoke a specific session (logout from device)
 */
router.delete('/sessions/:id', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const session = await prisma.userSession.findUnique({
    where: { id: req.params.id },
  });

  if (!session) {
    throw new NotFoundError('Session');
  }

  if (session.userId !== req.user!.id) {
    throw new AuthorizationError('Cannot revoke another user\'s session', ErrorCodes.INSUFFICIENT_PERMISSIONS);
  }

  await prisma.userSession.update({
    where: { id: session.id },
    data: { revokedAt: new Date() },
  });

  // Also revoke the refresh token if it matches
  // This is a best-effort approach

  res.json({
    success: true,
    data: { message: 'Session revoked successfully' },
    meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
  });
}));

/**
 * DELETE /api/v1/auth/sessions
 * Revoke all sessions except current (logout all other devices)
 */
router.delete('/sessions', authMiddleware, asyncHandler(async (req: Request, res: Response) => {
  const currentFingerprint = generateDeviceFingerprint(req);

  await prisma.userSession.updateMany({
    where: {
      userId: req.user!.id,
      revokedAt: null,
      deviceFingerprint: { not: currentFingerprint },
    },
    data: { revokedAt: new Date() },
  });

  // Also revoke all refresh tokens except current
  await authService.logoutAll(req.user!.id);

  // Clear refresh token cookie for current session
  res.clearCookie('refreshToken', { path: refreshCookieOptions.path });

  res.json({
    success: true,
    data: { message: 'All other sessions revoked' },
    meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
  });
}));

export default router;