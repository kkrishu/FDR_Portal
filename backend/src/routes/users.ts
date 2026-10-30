import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authMiddleware, requireRole, requirePermission, dataIsolationMiddleware } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { AppError, NotFoundError, ErrorCodes, HttpStatus } from '@/middleware/errorHandler';
import { UserRole, USER_STATUS } from '@fdr-portal/shared/constants';
import { createUserSchema, updateUserSchema } from '@fdr-portal/shared/validators';
import bcrypt from 'bcryptjs';
import { getRedisClient, cache } from '@/lib/redis';

const router: Router = Router();

router.use(authMiddleware);
router.use(dataIsolationMiddleware);

/**
 * GET /api/v1/users
 * List users (admin only) - with Redis caching
 */
router.get('/',
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 20, role, status, institutionId, search } = req.query;
    
    // Create cache key based on query params
    const cacheKey = `users:list:${JSON.stringify({ page, limit, role, status, institutionId, search })}`;
    
    // Try to get from cache first
    const cached = await cache.get<{ users: any[]; total: number }>(cacheKey);
    if (cached) {
      return res.json({
        success: true,
        data: cached.users,
        meta: {
          timestamp: new Date().toISOString(),
          requestId: req.correlationId!,
          page: Number(page),
          limit: Number(limit),
          total: cached.total,
          totalPages: Math.ceil(cached.total / Number(limit)),
          cached: true,
        },
      });
    }
    
    const where: any = {};
    if (role) where.role = role;
    if (status) where.status = status;
    if (institutionId) where.institutionId = institutionId;
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { email: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    
    const [users, total] = await Promise.all([
      prisma.user.findMany({
        where,
        orderBy: { createdAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        select: {
          id: true,
          email: true,
          name: true,
          role: true,
          status: true,
          institutionId: true,
          bankId: true,
          mfaEnabled: true,
          lastLoginAt: true,
          createdAt: true,
        },
      }),
      prisma.user.count({ where }),
    ]);
    
    // Cache for 60 seconds
    await cache.set(cacheKey, { users, total }, 60);
    
    res.json({
      success: true,
      data: users,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.correlationId!,
        page: Number(page),
        limit: Number(limit),
        total,
        totalPages: Math.ceil(total / Number(limit)),
      },
    });
  })
);

/**
 * GET /api/v1/users/:id
 * Get user by ID with full details for admin
 */
router.get('/:id',
  asyncHandler(async (req: Request, res: Response) => {
    // Users can view their own profile, admins can view any
    if (req.user!.role !== 'ADMIN' && req.user!.id !== req.params.id) {
      throw new AppError('Access denied', HttpStatus.FORBIDDEN, ErrorCodes.INSUFFICIENT_PERMISSIONS);
    }
    
    const isAdmin = req.user!.role === 'ADMIN';
    
    // Base user query
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        institutionId: true,
        bankId: true,
        mfaEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    
    if (!user) {
      throw new NotFoundError('User');
    }
    
    // If admin, fetch additional related data
    let additionalData: any = {};
    if (isAdmin) {
      // Fetch institution details
      if (user.institutionId) {
        additionalData.institution = await prisma.institution.findUnique({
          where: { id: user.institutionId },
          select: {
            id: true,
            name: true,
            code: true,
            address: true,
            city: true,
            state: true,
            pincode: true,
            phone: true,
            email: true,
            website: true,
            isActive: true,
            createdAt: true,
          },
        });
      }
      
      // Fetch bank details
      if (user.bankId) {
        additionalData.bank = await prisma.bank.findUnique({
          where: { id: user.bankId },
          select: {
            id: true,
            name: true,
            code: true,
            logoUrl: true,
            isActive: true,
            createdAt: true,
            branches: {
              select: {
                id: true,
                ifscCode: true,
                branchName: true,
                address: true,
                city: true,
                state: true,
                isVerified: true,
              },
            },
          },
        });
      }
      
      // Fetch FDR statistics
      const fdrStats = await prisma.fDR.groupBy({
        by: ['status'],
        where: { createdBy: user.id },
        _count: { status: true },
      });
      
      const fdrStatusCounts = fdrStats.reduce((acc, item) => {
        acc[item.status] = item._count.status;
        return acc;
      }, {} as Record<string, number>);
      
      // Fetch recent FDRs (last 10)
      const recentFDRs = await prisma.fDR.findMany({
        where: { createdBy: user.id },
        orderBy: { createdAt: 'desc' },
        take: 10,
        select: {
          id: true,
          fdrNumber: true,
          bankName: true,
          branchName: true,
          amount: true,
          status: true,
          issueDate: true,
          maturityDate: true,
          riskScore: true,
          createdAt: true,
        },
      });
      
      // Fetch notifications (last 20)
      const notifications = await prisma.notification.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          type: true,
          title: true,
          message: true,
          channels: true,
          readAt: true,
          createdAt: true,
        },
      });
      
      // Fetch audit log entries (last 20)
      const auditLogs = await prisma.auditLog.findMany({
        where: { actorId: user.id },
        orderBy: { createdAt: 'desc' },
        take: 20,
        select: {
          id: true,
          action: true,
          entityType: true,
          entityId: true,
          actorName: true,
          createdAt: true,
        },
      });
      
      // Fetch refresh tokens
      const refreshTokens = await prisma.refreshToken.findMany({
        where: { userId: user.id },
        orderBy: { createdAt: 'desc' },
        select: {
          id: true,
          expiresAt: true,
          revoked: true,
          createdAt: true,
        },
      });
      
      additionalData = {
        ...additionalData,
        fdrStats: {
          total: Object.values(fdrStatusCounts).reduce((a, b) => a + b, 0),
          byStatus: fdrStatusCounts,
        },
        recentFDRs,
        notifications,
        auditLogs,
        refreshTokens,
      };
    }
    
    res.json({
      success: true,
      data: { ...user, ...additionalData },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/users
 * Create user (admin only)
 */
router.post('/',
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const validated = createUserSchema.parse(req.body);
    
    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email.toLowerCase() },
    });
    
    if (existingUser) {
      throw new AppError('User with this email already exists', HttpStatus.CONFLICT, ErrorCodes.DUPLICATE_FDR);
    }
    
    const passwordHash = await bcrypt.hash(validated.password, 12);
    
    const user = await prisma.user.create({
      data: {
        email: validated.email.toLowerCase(),
        name: validated.name,
        passwordHash,
        role: validated.role,
        institutionId: validated.institutionId,
        bankId: validated.bankId,
        status: USER_STATUS.ACTIVE,
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
        createdAt: true,
      },
    });
    
    res.status(HttpStatus.CREATED).json({
      success: true,
      data: user,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * PATCH /api/v1/users/:id
 * Update user
 */
router.patch('/:id',
  asyncHandler(async (req: Request, res: Response) => {
    // Users can update their own profile (limited fields), admins can update any
    const isAdmin = req.user!.role === 'ADMIN';
    const isSelf = req.user!.id === req.params.id;
    
    if (!isAdmin && !isSelf) {
      throw new AppError('Access denied', HttpStatus.FORBIDDEN, ErrorCodes.INSUFFICIENT_PERMISSIONS);
    }
    
    const validated = updateUserSchema.parse(req.body);
    
    // Non-admins can only update name
    const updateData: any = {};
    if (isAdmin) {
      Object.assign(updateData, validated);
    } else if (validated.name) {
      updateData.name = validated.name;
    }
    
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        institutionId: true,
        bankId: true,
        mfaEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    
    res.json({
      success: true,
      data: user,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * DELETE /api/v1/users/:id
 * Deactivate user (admin only) - soft delete by setting status to INACTIVE
 */
router.delete('/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    if (req.params.id === req.user!.id) {
      throw new AppError('Cannot deactivate yourself', HttpStatus.BAD_REQUEST, ErrorCodes.INVALID_CREDENTIALS);
    }
    
    await prisma.user.update({
      where: { id: req.params.id },
      data: { status: USER_STATUS.INACTIVE },
    });
    
    // Invalidate cache
    const redisClient = getRedisClient();
    if (redisClient) {
      await cache.del('users:list:*');
    }
    
    res.json({
      success: true,
      data: { message: 'User deactivated' },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * DELETE /api/v1/users/:id/hard
 * Permanently delete user (admin only) - hard delete
 * Use with caution - this removes all user data
 */
router.delete('/:id/hard',
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    if (req.params.id === req.user!.id) {
      throw new AppError('Cannot delete yourself', HttpStatus.BAD_REQUEST, ErrorCodes.INVALID_CREDENTIALS);
    }
    
    // Check if user has related data that would be orphaned
    const user = await prisma.user.findUnique({
      where: { id: req.params.id },
      include: {
        createdFDRs: { select: { id: true }, take: 1 },
        notifications: { select: { id: true }, take: 1 },
        refreshTokens: { select: { id: true }, take: 1 },
      },
    });
    
    if (!user) {
      throw new NotFoundError('User');
    }
    
    // Delete related data first (cascade will handle some)
    await prisma.refreshToken.deleteMany({ where: { userId: req.params.id } });
    await prisma.passwordResetToken.deleteMany({ where: { userId: req.params.id } });
    await prisma.notification.deleteMany({ where: { userId: req.params.id } });
    
    // Now delete the user
    await prisma.user.delete({
      where: { id: req.params.id },
    });
    
    // Invalidate cache
    const redisClient = getRedisClient();
    if (redisClient) {
      await cache.del('users:list:*');
    }
    
    res.json({
      success: true,
      data: { message: 'User permanently deleted' },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * PUT /api/v1/users/:id
 * Full update user (admin only) - all fields
 */
router.put('/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const validated = createUserSchema.parse(req.body); // Reuse create schema for full update
    
    const existingUser = await prisma.user.findUnique({
      where: { email: validated.email.toLowerCase() },
    });
    
    // Check if email is being changed to an existing one
    if (existingUser && existingUser.id !== req.params.id) {
      throw new AppError('User with this email already exists', HttpStatus.CONFLICT, ErrorCodes.DUPLICATE_FDR);
    }
    
    const updateData: any = {
      email: validated.email.toLowerCase(),
      name: validated.name,
      role: validated.role,
      institutionId: validated.institutionId,
      bankId: validated.bankId,
      status: validated.status || USER_STATUS.ACTIVE,
    };
    
    // Only update password if provided
    if (validated.password) {
      updateData.passwordHash = await bcrypt.hash(validated.password, 12);
    }
    
    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: updateData,
      select: {
        id: true,
        email: true,
        name: true,
        role: true,
        status: true,
        institutionId: true,
        bankId: true,
        mfaEnabled: true,
        lastLoginAt: true,
        createdAt: true,
        updatedAt: true,
      },
    });
    
    // Invalidate cache
    const redisClient = getRedisClient();
    if (redisClient) {
      await cache.del('users:list:*');
    }
    
    res.json({
      success: true,
      data: user,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/users/:id/reset-mfa
 * Reset MFA for user (admin only)
 */
router.post('/:id/reset-mfa',
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    await prisma.user.update({
      where: { id: req.params.id },
      data: {
        mfaEnabled: false,
        mfaSecret: null,
        mfaBackupCodes: [],
      },
    });
    
    res.json({
      success: true,
      data: { message: 'MFA reset successfully' },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

export default router;