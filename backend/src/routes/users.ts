import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authMiddleware, requireRole, requirePermission, dataIsolationMiddleware } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { AppError, NotFoundError, ErrorCodes, HttpStatus } from '@/middleware/errorHandler';
import { UserRole, USER_STATUS } from '@fdr-portal/shared/constants';
import { createUserSchema, updateUserSchema } from '@fdr-portal/shared/validators';
import bcrypt from 'bcryptjs';

const router: Router = Router();

router.use(authMiddleware);
router.use(dataIsolationMiddleware);

/**
 * GET /api/v1/users
 * List users (admin only)
 */
router.get('/',
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 20, role, status, institutionId, search } = req.query;
    
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
 * Get user by ID
 */
router.get('/:id',
  asyncHandler(async (req: Request, res: Response) => {
    // Users can view their own profile, admins can view any
    if (req.user!.role !== 'ADMIN' && req.user!.id !== req.params.id) {
      throw new AppError('Access denied', HttpStatus.FORBIDDEN, ErrorCodes.INSUFFICIENT_PERMISSIONS);
    }
    
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
    
    res.json({
      success: true,
      data: user,
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
 * Deactivate user (admin only)
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
    
    res.json({
      success: true,
      data: { message: 'User deactivated' },
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