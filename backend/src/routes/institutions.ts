import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authMiddleware, requireRole, requirePermission, dataIsolationMiddleware } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { AppError, NotFoundError, ValidationError, ErrorCodes, HttpStatus } from '@/middleware/errorHandler';
import { UserRole } from '@fdr-portal/shared/types';
import { createInstitutionSchema, updateInstitutionSchema } from '@fdr-portal/shared/validators';

const router: Router = Router();

router.use(authMiddleware);
router.use(dataIsolationMiddleware);

/**
 * GET /api/v1/institutions
 * List institutions (admin only)
 */
router.get('/',
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 20, isActive, state, search } = req.query;
    
    const where: any = {};
    if (isActive !== undefined) where.isActive = isActive === 'true';
    if (state) where.state = state;
    if (search) {
      where.OR = [
        { name: { contains: search as string, mode: 'insensitive' } },
        { code: { contains: search as string, mode: 'insensitive' } },
      ];
    }
    
    const [institutions, total] = await Promise.all([
      prisma.institution.findMany({
        where,
        orderBy: { name: 'asc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: {
          _count: {
            select: { users: true, fdrs: true },
          },
        },
      }),
      prisma.institution.count({ where }),
    ]);
    
    res.json({
      success: true,
      data: institutions,
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
 * GET /api/v1/institutions/:id
 * Get institution by ID
 */
router.get('/:id',
  asyncHandler(async (req: Request, res: Response) => {
    // Check access
    if (req.user!.role !== 'ADMIN' && req.user!.institutionId !== req.params.id) {
      throw new AppError('Access denied', HttpStatus.FORBIDDEN, ErrorCodes.INSUFFICIENT_PERMISSIONS);
    }
    
    const institution = await prisma.institution.findUnique({
      where: { id: req.params.id },
      include: {
        nodalOfficer: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { users: true, fdrs: true },
        },
      },
    });
    
    if (!institution) {
      throw new NotFoundError('Institution');
    }
    
    res.json({
      success: true,
      data: institution,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/institutions
 * Create institution (admin only)
 */
router.post('/',
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const validated = createInstitutionSchema.parse(req.body);
    
    const existing = await prisma.institution.findUnique({
      where: { code: validated.code.toUpperCase() },
    });
    
    if (existing) {
      throw new AppError('Institution with this code already exists', HttpStatus.CONFLICT, ErrorCodes.DUPLICATE_FDR);
    }
    
    const institution = await prisma.institution.create({
      data: {
        ...validated,
        code: validated.code.toUpperCase(),
      },
    });
    
    res.status(HttpStatus.CREATED).json({
      success: true,
      data: institution,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * PATCH /api/v1/institutions/:id
 * Update institution
 */
router.patch('/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const validated = updateInstitutionSchema.parse(req.body);
    
    const institution = await prisma.institution.update({
      where: { id: req.params.id },
      data: validated,
    });
    
    res.json({
      success: true,
      data: institution,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * GET /api/v1/institutions/:id/profile
 * Get institution profile (for institution users)
 */
router.get('/:id/profile',
  asyncHandler(async (req: Request, res: Response) => {
    if (req.user!.role !== 'ADMIN' && req.user!.institutionId !== req.params.id) {
      throw new AppError('Access denied', HttpStatus.FORBIDDEN, ErrorCodes.INSUFFICIENT_PERMISSIONS);
    }
    
    const institution = await prisma.institution.findUnique({
      where: { id: req.params.id },
      include: {
        nodalOfficer: {
          select: { id: true, name: true, email: true },
        },
        _count: {
          select: { users: true, fdrs: true },
        },
      },
    });
    
    if (!institution) {
      throw new NotFoundError('Institution');
    }
    
    res.json({
      success: true,
      data: institution,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * PATCH /api/v1/institutions/:id/profile
 * Update institution profile
 */
router.patch('/:id/profile',
  asyncHandler(async (req: Request, res: Response) => {
    if (req.user!.role !== 'ADMIN' && req.user!.institutionId !== req.params.id) {
      throw new AppError('Access denied', HttpStatus.FORBIDDEN, ErrorCodes.INSUFFICIENT_PERMISSIONS);
    }
    
    const validated = updateInstitutionSchema.parse(req.body);
    
    const institution = await prisma.institution.update({
      where: { id: req.params.id },
      data: validated,
    });
    
    res.json({
      success: true,
      data: institution,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

export default router;