import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authMiddleware, requireRole, requirePermission, dataIsolationMiddleware } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { AppError, NotFoundError, ValidationError, ErrorCodes, HttpStatus } from '@/middleware/errorHandler';
import { createBankDirectorySchema, updateBankDirectorySchema } from '@fdr-portal/shared/validators';

const router: Router = Router();

router.use(authMiddleware);
router.use(dataIsolationMiddleware);

/**
 * GET /api/v1/directory/ifsc/:code
 * Lookup bank branch by IFSC code
 */
router.get('/ifsc/:code',
  asyncHandler(async (req: Request, res: Response) => {
    const { code } = req.params;
    
    if (!/^[A-Z]{4}0[A-Z0-9]{6}$/.test(code.toUpperCase())) {
      throw new ValidationError('Invalid IFSC code format');
    }
    
    const branch = await prisma.bankBranch.findUnique({
      where: { ifscCode: code.toUpperCase() },
      include: { bank: true },
    });
    
    if (!branch) {
      throw new NotFoundError('Bank branch');
    }
    
    res.json({
      success: true,
      data: {
        id: branch.id,
        bankId: branch.bankId,
        ifscCode: branch.ifscCode,
        bankName: branch.bank?.name,
        branchName: branch.branchName,
        address: branch.address,
        city: branch.city,
        district: branch.district,
        state: branch.state,
        pincode: branch.pincode,
        contactPhone: branch.contactPhone,
        contactEmail: branch.contactEmail,
        contactPerson: branch.contactPerson,
        contactDesignation: branch.contactDesignation,
        isVerified: branch.isVerified,
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * GET /api/v1/directory/banks
 * List all banks
 */
router.get('/banks',
  asyncHandler(async (req: Request, res: Response) => {
    const banks = await prisma.bank.findMany({
      where: { isActive: true },
      orderBy: { name: 'asc' },
    });
    
    res.json({
      success: true,
      data: banks,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * GET /api/v1/directory/branches
 * List bank branches with filters
 */
router.get('/branches',
  asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 50, bankId, city, state, isVerified, search } = req.query;
    
    const where: any = {};
    if (bankId) where.bankId = bankId;
    if (city) where.city = { contains: city as string, mode: 'insensitive' };
    if (state) where.state = { contains: state as string, mode: 'insensitive' };
    if (isVerified !== undefined) where.isVerified = isVerified === 'true';
    if (search) {
      where.OR = [
        { ifscCode: { contains: search as string, mode: 'insensitive' } },
        { branchName: { contains: search as string, mode: 'insensitive' } },
        { bank: { name: { contains: search as string, mode: 'insensitive' } } },
      ];
    }
    
    const [branches, total] = await Promise.all([
      prisma.bankBranch.findMany({
        where,
        orderBy: [{ bank: { name: 'asc' } }, { branchName: 'asc' }],
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: { bank: { select: { id: true, name: true, code: true } } },
      }),
      prisma.bankBranch.count({ where }),
    ]);
    
    res.json({
      success: true,
      data: branches,
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
 * POST /api/v1/directory/branches
 * Create bank branch (admin only)
 */
router.post('/branches',
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const validated = createBankDirectorySchema.parse(req.body);
    
    const existing = await prisma.bankBranch.findUnique({
      where: { ifscCode: validated.ifscCode.toUpperCase() },
    });
    
    if (existing) {
      throw new AppError('Branch with this IFSC already exists', HttpStatus.CONFLICT, ErrorCodes.DUPLICATE_FDR);
    }
    
    const bank = await prisma.bank.findFirst({
      where: { name: validated.bankName },
    });

    if (!bank) {
      throw new NotFoundError('Bank');
    }

    const bankId = bank.id;

    const branch = await prisma.bankBranch.create({
      data: {
        bankId,
        ifscCode: validated.ifscCode.toUpperCase(),
        branchName: validated.branchName,
        address: validated.address,
        city: validated.city,
        district: validated.district,
        state: validated.state,
        pincode: validated.pincode,
        contactPhone: validated.contactPhone,
        contactEmail: validated.contactEmail,
        contactPerson: validated.contactPerson,
        contactDesignation: validated.contactDesignation,
      },
      include: { bank: true },
    });
    
    res.status(HttpStatus.CREATED).json({
      success: true,
      data: branch,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * PATCH /api/v1/directory/branches/:id
 * Update bank branch (admin only)
 */
router.patch('/branches/:id',
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const validated = updateBankDirectorySchema.parse(req.body);
    
    const branch = await prisma.bankBranch.update({
      where: { id: req.params.id },
      data: validated,
      include: { bank: true },
    });
    
    res.json({
      success: true,
      data: branch,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/directory/branches/import
 * Import RBI IFSC data (admin only)
 */
router.post('/branches/import',
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { branches } = req.body;
    
    if (!Array.isArray(branches)) {
      throw new ValidationError('Branches must be an array');
    }
    
    let created = 0;
    let updated = 0;
    const errors: any[] = [];
    
    for (const branchData of branches) {
      try {
        const validated = createBankDirectorySchema.parse(branchData);
        
        const existing = await prisma.bankBranch.findUnique({
          where: { ifscCode: validated.ifscCode.toUpperCase() },
        });
        
        const bank = await prisma.bank.findFirst({ where: { name: validated.bankName } });
        if (!bank) {
          errors.push({ ifscCode: branchData.ifscCode, error: 'Bank not found' });
          continue;
        }

        if (existing) {
          await prisma.bankBranch.update({
            where: { id: existing.id },
            data: validated,
          });
          updated++;
        } else {
          await prisma.bankBranch.create({
            data: {
              bankId: bank.id,
              ifscCode: validated.ifscCode.toUpperCase(),
              branchName: validated.branchName,
              address: validated.address,
              city: validated.city,
              district: validated.district,
              state: validated.state,
              pincode: validated.pincode,
              contactPhone: validated.contactPhone,
              contactEmail: validated.contactEmail,
              contactPerson: validated.contactPerson,
              contactDesignation: validated.contactDesignation,
            },
          });
          created++;
        }
      } catch (error: any) {
        errors.push({ ifscCode: branchData.ifscCode, error: error.message });
      }
    }
    
    res.json({
      success: true,
      data: { created, updated, errors: errors.length, errorDetails: errors },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/directory/branches/:id/verify
 * Mark branch contact as verified
 */
router.post('/branches/:id/verify',
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const { expiryDays = 365 } = req.body;
    
    const branch = await prisma.bankBranch.update({
      where: { id: req.params.id },
      data: {
        isVerified: true,
        verifiedAt: new Date(),
        verificationExpiry: new Date(Date.now() + expiryDays * 24 * 60 * 60 * 1000),
      },
    });
    
    res.json({
      success: true,
      data: branch,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

export default router;