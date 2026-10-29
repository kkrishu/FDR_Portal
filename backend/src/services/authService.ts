/**
 * Authentication Service
 * Handles login, register, token management, MFA, password reset
 */

import bcrypt from 'bcryptjs';
import speakeasy from 'speakeasy';
import QRCode from 'qrcode';
import { prisma } from '../lib/prisma';
import logger from '../lib/logger';
import { config, constants, isDevelopment } from '../config';
import { 
  generateAccessToken, 
  generateRefreshToken, 
  verifyRefreshToken, 
  storeRefreshToken, 
  revokeRefreshToken,
  revokeAllRefreshTokens 
} from '../middleware/auth';
import { 
  AppError, 
  AuthenticationError, 
  ValidationError, 
  ConflictError,
  NotFoundError,
  ErrorCodes, 
  HttpStatus 
} from '../middleware/errorHandler';
import { UserRole, UserStatus, AuthTokens, JWTPayload } from '@fdr-portal/shared';
import { USER_STATUS } from '@fdr-portal/shared/constants';
import {
  passwordSchema,
  createUserSchema,
  selfRegisterSchema,
  updateOwnAccountSchema,
  loginSchema,
  mfaSetupSchema,
  mfaVerifySchema,
} from '@fdr-portal/shared/validators';
import { generateSecureToken, hashSHA256, verifySHA256 } from '@fdr-portal/shared/utils';
import { mailService } from './mailService';
import { notificationService } from './notificationService';
import { NOTIFICATION_TYPES } from '@fdr-portal/shared/constants';

const SALT_ROUNDS = 12;
const RESET_TOKEN_TTL_MINUTES = 60;

/** Next free AICTE-style code for a self-registered institution. */
async function generateInstitutionCode(): Promise<string> {
  for (let attempt = 0; attempt < 20; attempt += 1) {
    const count = await prisma.institution.count();
    const code = `AICTE-SELF-${String(count + 1 + attempt).padStart(4, '0')}`;
    const clash = await prisma.institution.findUnique({ where: { code }, select: { id: true } });
    if (!clash) return code;
  }
  return `AICTE-SELF-${Date.now().toString(36).toUpperCase()}`;
}

export class AuthService {
  /**
   * Register a new user
   */
  async register(
    data: {
      email: string;
      name: string;
      password: string;
      role: UserRole;
      institutionId?: string;
      bankId?: string;
      institutionName?: string;
      institutionCity?: string;
      institutionState?: string;
      institutionPhone?: string;
    },
    options: { allowAdmin?: boolean } = {}
  ): Promise<{ user: any; tokens: AuthTokens }> {
    // Public sign-up uses the narrower schema, which has no ADMIN option. Only
    // an authenticated admin provisioning an account may pass `allowAdmin`.
    const validated = options.allowAdmin
      ? createUserSchema.parse(data)
      : selfRegisterSchema.parse(data);

    // Check if user already exists
    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email.toLowerCase() },
    });

    if (existingUser) {
      throw new ConflictError('User with this email already exists', ErrorCodes.DUPLICATE_FDR);
    }

    // Hash password
    const passwordHash = await bcrypt.hash(validated.password, SALT_ROUNDS);

    // An institution that signs itself up must own a real institution record —
    // otherwise the account would have no portfolio of its own and would either
    // see nothing or, worse, inherit another tenant's scope. Admin-provisioned
    // accounts pass an explicit institutionId instead.
    // Bank-role signups scope themselves to a real bank from the directory —
    // the same records an administrator manages — never a free-text name.
    let bankId = validated.bankId;
    if (['BANK_MANAGER', 'NODAL_OFFICER'].includes(validated.role)) {
      const bank = await prisma.bank.findUnique({
        where: { id: bankId! },
        select: { id: true, isActive: true },
      });
      if (!bank || !bank.isActive) {
        throw new NotFoundError('Bank');
      }
    }

    let institutionId = validated.institutionId;
    if (validated.role === 'INSTITUTION' && !institutionId) {
      const institution = await prisma.institution.create({
        data: {
          name: data.institutionName?.trim() || `${validated.name}'s institution`,
          code: await generateInstitutionCode(),
          address: 'To be updated',
          city: data.institutionCity?.trim() || 'To be updated',
          state: data.institutionState?.trim() || 'To be updated',
          pincode: '000000',
          phone: data.institutionPhone?.trim() || '',
          email: validated.email.toLowerCase(),
        },
        select: { id: true },
      });
      institutionId = institution.id;
    }

    // Create user
    const user = await prisma.user.create({
      data: {
        email: validated.email.toLowerCase(),
        name: validated.name,
        passwordHash,
        role: validated.role,
        institutionId,
        bankId,
        status: USER_STATUS.ACTIVE,
      },
    });

    // Generate tokens
    const tokens = await this.generateTokens(user);

    logger.info({ userId: user.id, role: user.role }, 'User registered');

    return {
      user: this.sanitizeUser(user),
      tokens,
    };
  }

  /**
   * Update the signed-in user's own name or avatar. Deliberately excludes role,
   * status and tenant bindings — those are administrative fields.
   */
  async updateOwnAccount(userId: string, data: { name?: string; avatarUrl?: string }) {
    const validated = updateOwnAccountSchema.parse(data);

    const user = await prisma.user.update({
      where: { id: userId },
      data: {
        ...(validated.name !== undefined && { name: validated.name }),
        ...(validated.avatarUrl !== undefined && { avatarUrl: validated.avatarUrl || null }),
      },
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
      },
    });

    logger.info({ userId }, 'Own account updated');
    return user;
  }

  /**
   * Login user
   */
  async login(email: string, password: string, mfaCode?: string): Promise<{ user: any; tokens: AuthTokens; mfaRequired?: boolean }> {
    // Validate input
    const validated = loginSchema.parse({ email, password, mfaCode });

    // Find user
    const user = await prisma.user.findUnique({
      where: { email: validated.email.toLowerCase() },
    });

    if (!user) {
      throw new AuthenticationError('Invalid credentials', ErrorCodes.INVALID_CREDENTIALS);
    }

    // Check user status
    if (user.status !== USER_STATUS.ACTIVE) {
      throw new AuthenticationError('Account is not active', ErrorCodes.ACCOUNT_INACTIVE);
    }

    // Verify password
    const isValidPassword = await bcrypt.compare(validated.password, user.passwordHash);
    if (!isValidPassword) {
      throw new AuthenticationError('Invalid credentials', ErrorCodes.INVALID_CREDENTIALS);
    }

    // Check MFA
    if (user.mfaEnabled && config.FEATURE_MFA_ENABLED) {
      if (!validated.mfaCode) {
        return { user: this.sanitizeUser(user), tokens: { accessToken: '', refreshToken: '', accessTokenExpiry: 0, refreshTokenExpiry: 0 }, mfaRequired: true };
      }

      const isValidMFA = speakeasy.totp.verify({
        secret: user.mfaSecret!,
        encoding: 'base32',
        token: validated.mfaCode,
        window: 1,
      });

      if (!isValidMFA) {
        throw new AuthenticationError('Invalid MFA code', ErrorCodes.MFA_INVALID);
      }
    }

    // Update last login
    await prisma.user.update({
      where: { id: user.id },
      data: { lastLoginAt: new Date() },
    });

    // Generate tokens
    const tokens = await this.generateTokens(user);

    logger.info({ userId: user.id, role: user.role }, 'User logged in');

    return { user: this.sanitizeUser(user), tokens };
  }

  /**
   * Refresh access token
   */
  async refreshToken(refreshToken: string): Promise<AuthTokens> {
    const validated = { refreshToken };

    // Verify refresh token
    const payload = await verifyRefreshToken(validated.refreshToken);
    if (!payload) {
      throw new AuthenticationError('Invalid or expired refresh token', ErrorCodes.REFRESH_TOKEN_EXPIRED);
    }

    // Get user
    const user = await prisma.user.findUnique({
      where: { id: payload.userId },
    });

    if (!user || user.status !== USER_STATUS.ACTIVE) {
      throw new AuthenticationError('User not found or inactive', ErrorCodes.ACCOUNT_INACTIVE);
    }

    // Revoke old refresh token
    await revokeRefreshToken(validated.refreshToken);

    // Generate new tokens
    const tokens = await this.generateTokens(user);

    return tokens;
  }

  /**
   * Logout user (revoke refresh token)
   */
  async logout(refreshToken: string): Promise<void> {
    await revokeRefreshToken(refreshToken);
  }

  /**
   * Logout from all devices
   */
  async logoutAll(userId: string): Promise<void> {
    await revokeAllRefreshTokens(userId);
  }

  /**
   * Setup MFA
   */
  async setupMFA(userId: string): Promise<{ secret: string; qrCodeUrl: string; backupCodes: string[] }> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError('User');
    }

    // Generate secret
    const secret = speakeasy.generateSecret({
      name: `${config.MFA_ISSUER} (${user.email})`,
      length: 20,
    });

    // Generate backup codes
    const backupCodes = Array.from({ length: 10 }, () => 
      Math.random().toString(36).substring(2, 10).toUpperCase()
    );

    // Generate QR code
    const qrCodeUrl = await QRCode.toDataURL(secret.otpauth_url!);

    // Store secret (not enabled yet)
    await prisma.user.update({
      where: { id: userId },
      data: { mfaSecret: secret.base32 },
    });

    return {
      secret: secret.base32,
      qrCodeUrl,
      backupCodes,
    };
  }

  /**
   * Verify and enable MFA
   */
  async verifyAndEnableMFA(userId: string, token: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaSecret) {
      throw new AppError('MFA not set up', HttpStatus.BAD_REQUEST, ErrorCodes.MFA_INVALID);
    }

    const validated = mfaVerifySchema.parse({ token });

    const isValid = speakeasy.totp.verify({
      secret: user.mfaSecret,
      encoding: 'base32',
      token: validated.token,
      window: 1,
    });

    if (!isValid) {
      throw new AuthenticationError('Invalid MFA code', ErrorCodes.MFA_INVALID);
    }

    // Generate backup codes
    const backupCodes = Array.from({ length: 10 }, () => 
      Math.random().toString(36).substring(2, 10).toUpperCase()
    );

    // Enable MFA
    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: true,
        mfaBackupCodes: backupCodes,
      },
    });

    logger.info({ userId }, 'MFA enabled');
  }

  /**
   * Disable MFA
   */
  async disableMFA(userId: string, password: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError('User');
    }

    const isValidPassword = await bcrypt.compare(password, user.passwordHash);
    if (!isValidPassword) {
      throw new AuthenticationError('Invalid password', ErrorCodes.INVALID_CREDENTIALS);
    }

    await prisma.user.update({
      where: { id: userId },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: [],
      },
    });

    // Revoke all tokens to force re-login
    await revokeAllRefreshTokens(userId);

    logger.info({ userId }, 'MFA disabled');
  }

  /**
   * Verify MFA backup code
   */
  async verifyBackupCode(userId: string, code: string): Promise<boolean> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user || !user.mfaEnabled) {
      return false;
    }

    const index = user.mfaBackupCodes.indexOf(code.toUpperCase());
    if (index === -1) {
      return false;
    }

    // Remove used backup code
    const updatedCodes = [...user.mfaBackupCodes];
    updatedCodes.splice(index, 1);

    await prisma.user.update({
      where: { id: userId },
      data: { mfaBackupCodes: updatedCodes },
    });

    return true;
  }

  /**
   * Change password
   */
  async changePassword(userId: string, currentPassword: string, newPassword: string): Promise<void> {
    const user = await prisma.user.findUnique({ where: { id: userId } });
    if (!user) {
      throw new NotFoundError('User');
    }

    const isValidPassword = await bcrypt.compare(currentPassword, user.passwordHash);
    if (!isValidPassword) {
      throw new AuthenticationError('Current password is incorrect', ErrorCodes.INVALID_CREDENTIALS);
    }

    const passwordHash = await bcrypt.hash(newPassword, SALT_ROUNDS);

    await prisma.user.update({
      where: { id: userId },
      data: { passwordHash },
    });

    // Revoke all tokens
    await revokeAllRefreshTokens(userId);

    logger.info({ userId }, 'Password changed');
  }

  /**
   * Request a password reset. The response is identical whether or not the
   * address exists, so the endpoint cannot be used to enumerate accounts.
   */
  async requestPasswordReset(email: string, ipAddress?: string): Promise<string> {
    const genericMessage = 'If an account exists for this address, a reset link has been sent.';

    const user = await prisma.user.findUnique({
      where: { email: email.toLowerCase() },
    });

    if (!user || user.status !== USER_STATUS.ACTIVE) {
      return genericMessage;
    }

    // Any previously issued reset tokens for this user are superseded by this one.
    await prisma.passwordResetToken.updateMany({
      where: { userId: user.id, usedAt: null },
      data: { usedAt: new Date() },
    });

    const resetToken = generateSecureToken(32);
    const tokenHash = hashSHA256(resetToken);
    const expiresAt = new Date(Date.now() + RESET_TOKEN_TTL_MINUTES * 60 * 1000);

    await prisma.passwordResetToken.create({
      data: {
        userId: user.id,
        tokenHash,
        expiresAt,
        requestedIp: ipAddress,
      },
    });

    const resetUrl = `${config.FRONTEND_URL}/reset-password?token=${encodeURIComponent(resetToken)}`;

    await mailService.sendPasswordReset(user.email, user.name, resetUrl, RESET_TOKEN_TTL_MINUTES);

    // Development has no mail server configured by default; surface the link so
    // the flow is testable end to end without reading a mailbox.
    if (isDevelopment) {
      logger.info({ userId: user.id, resetUrl }, 'Password reset link issued');
    }

    await notificationService.notify({
      userId: user.id,
      type: NOTIFICATION_TYPES.SYSTEM_ALERT,
      title: 'Password reset requested',
      message: 'A password reset link was sent to your email address. If this was not you, change your password immediately.',
    });

    return genericMessage;
  }

  /**
   * Consume a reset token and set the new password. All existing sessions are
   * revoked so a stolen session cannot survive the reset.
   */
  async resetPassword(token: string, newPassword: string): Promise<void> {
    const passwordHashValue = passwordSchema.parse(newPassword);
    const tokenHash = hashSHA256(token);

    const resetToken = await prisma.passwordResetToken.findUnique({
      where: { tokenHash },
      include: { user: true },
    });

    if (!resetToken || resetToken.usedAt || resetToken.expiresAt < new Date()) {
      throw new AppError(
        'This reset link is invalid or has expired. Request a new one.',
        HttpStatus.BAD_REQUEST,
        ErrorCodes.TOKEN_EXPIRED
      );
    }

    const passwordHash = await bcrypt.hash(passwordHashValue, SALT_ROUNDS);

    await prisma.$transaction([
      prisma.user.update({
        where: { id: resetToken.userId },
        data: { passwordHash },
      }),
      prisma.passwordResetToken.update({
        where: { id: resetToken.id },
        data: { usedAt: new Date() },
      }),
    ]);

    await revokeAllRefreshTokens(resetToken.userId);

    await notificationService.notify({
      userId: resetToken.userId,
      type: NOTIFICATION_TYPES.SYSTEM_ALERT,
      title: 'Password changed',
      message: 'Your password was reset. All other sessions have been signed out.',
    });

    logger.info({ userId: resetToken.userId }, 'Password reset completed');
  }

  /**
   * Generate access and refresh tokens
   */
  private async generateTokens(user: any): Promise<AuthTokens> {
    const payload: Omit<JWTPayload, 'iat' | 'exp' | 'iss' | 'aud'> = {
      sub: user.id,
      email: user.email,
      role: user.role,
      name: user.name,
      institutionId: user.institutionId,
      bankId: user.bankId,
      mfaEnabled: user.mfaEnabled,
    };

    const accessToken = generateAccessToken(payload);
    const refreshToken = generateRefreshToken(user.id);

    // Store refresh token
    await storeRefreshToken(user.id, refreshToken);

    // Calculate expiry timestamps
    const accessTokenExpiry = Math.floor(Date.now() / 1000) + 15 * 60; // 15 minutes
    const refreshTokenExpiry = Math.floor(Date.now() / 1000) + 7 * 24 * 60 * 60; // 7 days

    return {
      accessToken,
      refreshToken,
      accessTokenExpiry,
      refreshTokenExpiry,
    };
  }

  /**
   * Sanitize user object for response
   */
  private sanitizeUser(user: any): any {
    const { passwordHash, mfaSecret, mfaBackupCodes, refreshTokens, ...sanitized } = user;
    return sanitized;
  }
}

export const authService = new AuthService();