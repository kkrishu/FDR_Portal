import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authMiddleware, requireRole, requirePermission, dataIsolationMiddleware } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { AppError, NotFoundError, ErrorCodes, HttpStatus } from '@/middleware/errorHandler';
import { RELEASE_STATUS, FDR_STATUS } from '@fdr-portal/shared/constants';
import { 
  createReleaseRequestSchema, 
  recommendReleaseSchema, 
  approveReleaseSchema, 
  rejectReleaseSchema 
} from '@fdr-portal/shared/validators';

const router: Router = Router();

router.use(authMiddleware);
router.use(dataIsolationMiddleware);

/**
 * POST /api/v1/release/request
 * Create release request (institution)
 */
router.post('/request',
  requirePermission('fdr', 'release-request'),
  asyncHandler(async (req: Request, res: Response) => {
    const validated = createReleaseRequestSchema.parse(req.body);
    
    const fdr = await prisma.fDR.findUnique({
      where: { id: validated.fdrId },
      include: { lienDetails: true, flags: true, documents: true },
    });
    
    if (!fdr) {
      throw new NotFoundError('FDR');
    }
    
    // Check ownership
    if (req.user!.role !== 'ADMIN' && fdr.institutionId !== req.user!.institutionId) {
      throw new AppError('Access denied', HttpStatus.FORBIDDEN, ErrorCodes.DATA_ISOLATION_VIOLATION);
    }
    
    // Check eligibility
    if (fdr.status !== FDR_STATUS.VERIFIED && fdr.status !== FDR_STATUS.RELEASED) {
      throw new AppError('FDR must be verified before release', HttpStatus.BAD_REQUEST, ErrorCodes.RELEASE_NOT_ELIGIBLE);
    }
    
    if (fdr.releaseRequestId) {
      throw new AppError('Release request already exists', HttpStatus.CONFLICT);
    }
    
    // Auto-evaluate checklist
    const checklist = [
      { 
        id: 'bank_verified', 
        name: 'Bank Verification Complete', 
        description: 'FDR has been verified by bank',
        isRequired: true,
        isAutoCheck: true,
        status: (fdr.status as string) === FDR_STATUS.BANK_VERIFIED || (fdr.status as string) === FDR_STATUS.VERIFIED ? 'PASS' : 'FAIL',
        checkedAt: new Date(),
      },
      { 
        id: 'lien_confirmed', 
        name: 'Lien Confirmed', 
        description: 'Lien holder has confirmed or lien released',
        isRequired: true,
        isAutoCheck: true,
        status: fdr.lienDetails ? 'PASS' : 'PENDING',
        checkedAt: new Date(),
      },
      { 
        id: 'conditions_met', 
        name: 'Release Conditions Met', 
        description: 'All institutional conditions for release satisfied',
        isRequired: true,
        isAutoCheck: true,
        status: 'PENDING',
      },
      { 
        id: 'no_open_observations', 
        name: 'No Open Observations', 
        description: 'No pending flags, remarks, or document requests',
        isRequired: true,
        isAutoCheck: true,
        status: (fdr.flags?.length || 0) === 0 ? 'PASS' : 'FAIL',
        checkedAt: new Date(),
      },
      { 
        id: 'documents_present', 
        name: 'Required Documents Present', 
        description: 'All required documents uploaded and valid',
        isRequired: true,
        isAutoCheck: true,
        status: (fdr.documents?.length || 0) > 0 ? 'PASS' : 'FAIL',
        checkedAt: new Date(),
      },
    ];
    
    const allPass = checklist.every(c => c.status === 'PASS');
    
    const releaseRequest = await prisma.$transaction(async (tx) => {
      const created = await tx.releaseRequest.create({
        data: {
          fdrId: validated.fdrId,
          institutionId: fdr.institutionId,
          reason: validated.reason,
          documents: validated.documents || [],
          status: allPass ? RELEASE_STATUS.RECOMMENDED : RELEASE_STATUS.CHECKLIST_PENDING,
          checklist,
          requestedBy: req.user!.id,
          requestedAt: new Date(),
          slaDeadline: new Date(Date.now() + 72 * 60 * 60 * 1000), // 72 hours
        },
      });
      
      await tx.fDR.update({
        where: { id: validated.fdrId },
        data: { 
          status: allPass ? FDR_STATUS.RELEASE_RECOMMENDED : FDR_STATUS.RELEASE_REQUESTED,
          releaseRequestId: created.id,
        },
      });
      
      await tx.fDRTimelineEntry.create({
        data: {
          fdrId: validated.fdrId,
          status: allPass ? FDR_STATUS.RELEASE_RECOMMENDED : FDR_STATUS.RELEASE_REQUESTED,
          actorId: req.user!.id,
          actorRole: req.user!.role,
          actorName: req.user!.name,
          action: 'RELEASE_REQUESTED',
          description: 'Release request submitted',
          metadata: { releaseRequestId: created.id, checklist, reason: validated.reason },
        },
      });
      
      return created;
    });
    
    res.status(HttpStatus.CREATED).json({
      success: true,
      data: releaseRequest,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * GET /api/v1/release/requests
 * List release requests
 */
router.get('/requests',
  requirePermission('fdr', 'read'),
  asyncHandler(async (req: Request, res: Response) => {
    const { page = 1, limit = 20, status } = req.query;
    
    const where: any = {};
    if (status) where.status = Array.isArray(status) ? { in: status } : status;
    
    if (req.user!.role === 'INSTITUTION' && req.user!.institutionId) {
      where.institutionId = req.user!.institutionId;
    }
    
    if (req.user!.role === 'OFFICER' || req.user!.role === 'ADMIN') {
      // Officers see all, or filtered by their queue
    }
    
    const [requests, total] = await Promise.all([
      prisma.releaseRequest.findMany({
        where,
        orderBy: { requestedAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: {
          fdr: {
            include: {
              institution: { select: { id: true, name: true, code: true } },
            },
          },
          requestedByUser: { select: { id: true, name: true, email: true } },
          recommendedByUser: { select: { id: true, name: true } },
          approvedByUser: { select: { id: true, name: true } },
        },
      }),
      prisma.releaseRequest.count({ where }),
    ]);
    
    res.json({
      success: true,
      data: requests,
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
 * GET /api/v1/release/requests/:id
 * Get release request details
 */
router.get('/requests/:id',
  asyncHandler(async (req: Request, res: Response) => {
    const request = await prisma.releaseRequest.findUnique({
      where: { id: req.params.id },
      include: {
        fdr: {
          include: {
            institution: true,
            documents: true,
            jointHolders: true,
            lienDetails: true,
            flags: true,
          },
        },
        requestedByUser: { select: { id: true, name: true, email: true } },
        recommendedByUser: { select: { id: true, name: true } },
        approvedByUser: { select: { id: true, name: true } },
      },
    });
    
    if (!request) {
      throw new NotFoundError('Release request');
    }
    
    // Check access
    if (req.user!.role !== 'ADMIN' && req.user!.institutionId && request.institutionId !== req.user!.institutionId) {
      throw new AppError('Access denied', HttpStatus.FORBIDDEN, ErrorCodes.DATA_ISOLATION_VIOLATION);
    }
    
    res.json({
      success: true,
      data: request,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/release/requests/:id/recommend
 * Officer recommends release
 */
router.post('/requests/:id/recommend',
  requirePermission('fdr', 'release-recommend'),
  asyncHandler(async (req: Request, res: Response) => {
    const validated = recommendReleaseSchema.parse(req.body);
    
    const request = await prisma.releaseRequest.findUnique({
      where: { id: req.params.id },
      include: { fdr: true },
    });
    
    if (!request) {
      throw new NotFoundError('Release request');
    }
    
    // A brand-new request sits in REQUESTED; the checklist is evaluated during
    // recommendation, so both entry states are acceptable. Anything past
    // RECOMMENDED is not.
    if (
      request.status !== RELEASE_STATUS.REQUESTED &&
      request.status !== RELEASE_STATUS.CHECKLIST_PENDING
    ) {
      throw new AppError(
        `Release request has already been ${request.status.toLowerCase()}`,
        HttpStatus.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR
      );
    }
    
    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.releaseRequest.update({
        where: { id: req.params.id },
        data: {
          status: validated.checklist.every(c => c.status === 'PASS') ? RELEASE_STATUS.RECOMMENDED : RELEASE_STATUS.CHECKLIST_PENDING,
          checklist: validated.checklist,
          recommendedBy: req.user!.id,
          recommendedAt: new Date(),
          recommendationRemarks: validated.recommendationRemarks,
        },
      });
      
      if (validated.checklist.every(c => c.status === 'PASS')) {
        await tx.fDR.update({
          where: { id: request.fdrId },
          data: { status: FDR_STATUS.RELEASE_RECOMMENDED },
        });
        
        await tx.fDRTimelineEntry.create({
          data: {
            fdrId: request.fdrId,
            status: FDR_STATUS.RELEASE_RECOMMENDED,
            actorId: req.user!.id,
            actorRole: req.user!.role,
            actorName: req.user!.name,
            action: 'RELEASE_RECOMMENDED',
            description: 'Release recommended by officer',
            metadata: { releaseRequestId: req.params.id, checklist: validated.checklist },
          },
        });
      }
      
      return updated;
    });
    
    res.json({
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/release/requests/:id/approve
 * Admin approves release
 */
router.post('/requests/:id/approve',
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const validated = approveReleaseSchema.parse(req.body);
    
    const request = await prisma.releaseRequest.findUnique({
      where: { id: req.params.id },
      include: { fdr: true },
    });
    
    if (!request) {
      throw new NotFoundError('Release request');
    }
    
    if (request.status !== RELEASE_STATUS.RECOMMENDED) {
      throw new AppError('Release request must be recommended before approval', HttpStatus.BAD_REQUEST);
    }
    
    // Different person rule
    if (request.recommendedBy === req.user!.id) {
      throw new AppError('Cannot approve your own recommendation', HttpStatus.FORBIDDEN, ErrorCodes.SAME_PERSON_APPROVAL);
    }
    
    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.releaseRequest.update({
        where: { id: req.params.id },
        data: {
          status: RELEASE_STATUS.APPROVED,
          approvedBy: req.user!.id,
          approvedAt: new Date(),
          approvalRemarks: validated.approvalRemarks,
        },
      });
      
      await tx.fDR.update({
        where: { id: request.fdrId },
        data: { status: FDR_STATUS.RELEASE_APPROVED },
      });
      
      await tx.fDRTimelineEntry.create({
        data: {
          fdrId: request.fdrId,
          status: FDR_STATUS.RELEASE_APPROVED,
          actorId: req.user!.id,
          actorRole: req.user!.role,
          actorName: req.user!.name,
          action: 'RELEASE_APPROVED',
          description: 'Release approved by admin',
          metadata: { releaseRequestId: req.params.id, approvalRemarks: validated.approvalRemarks },
        },
      });
      
      return updated;
    });
    
    res.json({
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/release/requests/:id/reject
 * Reject release request
 */
router.post('/requests/:id/reject',
  requireRole('ADMIN', 'OFFICER'),
  asyncHandler(async (req: Request, res: Response) => {
    const validated = rejectReleaseSchema.parse(req.body);
    
    const request = await prisma.releaseRequest.findUnique({
      where: { id: req.params.id },
      include: { fdr: true },
    });
    
    if (!request) {
      throw new NotFoundError('Release request');
    }
    
    if (request.status === RELEASE_STATUS.RELEASED || request.status === RELEASE_STATUS.REJECTED) {
      throw new AppError('Release request already processed', HttpStatus.BAD_REQUEST);
    }
    
    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.releaseRequest.update({
        where: { id: req.params.id },
        data: {
          status: RELEASE_STATUS.REJECTED,
          rejectedBy: req.user!.id,
          rejectedAt: new Date(),
          rejectionReason: validated.rejectionReason,
        },
      });
      
      await tx.fDR.update({
        where: { id: request.fdrId },
        data: { 
          status: FDR_STATUS.RELEASE_REJECTED,
          releaseRequestId: null,
        },
      });
      
      await tx.fDRTimelineEntry.create({
        data: {
          fdrId: request.fdrId,
          status: FDR_STATUS.RELEASE_REJECTED,
          actorId: req.user!.id,
          actorRole: req.user!.role,
          actorName: req.user!.name,
          action: 'RELEASE_REJECTED',
          description: 'Release request rejected',
          metadata: { releaseRequestId: req.params.id, rejectionReason: validated.rejectionReason },
        },
      });
      
      return updated;
    });
    
    res.json({
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/release/requests/:id/complete
 * Complete release (generate certificate)
 */
router.post('/requests/:id/complete',
  requireRole('ADMIN'),
  asyncHandler(async (req: Request, res: Response) => {
    const request = await prisma.releaseRequest.findUnique({
      where: { id: req.params.id },
      include: { fdr: true },
    });
    
    if (!request) {
      throw new NotFoundError('Release request');
    }
    
    if (request.status !== RELEASE_STATUS.APPROVED) {
      throw new AppError('Release request must be approved before completion', HttpStatus.BAD_REQUEST);
    }
    
    // Generate certificate (placeholder - would use PDF library)
    const certificateUrl = `${process.env.FRONTEND_URL || 'http://localhost:3001'}/certificates/release-${request.id}.pdf`;
    
    const updated = await prisma.$transaction(async (tx) => {
      const updated = await tx.releaseRequest.update({
        where: { id: req.params.id },
        data: {
          status: RELEASE_STATUS.RELEASED,
          releasedAt: new Date(),
          releaseCertificateUrl: certificateUrl,
        },
      });
      
      await tx.fDR.update({
        where: { id: request.fdrId },
        data: { 
          status: FDR_STATUS.RELEASED,
          releasedAt: new Date(),
          releaseCertificateUrl: certificateUrl,
        },
      });
      
      await tx.fDRTimelineEntry.create({
        data: {
          fdrId: request.fdrId,
          status: FDR_STATUS.RELEASED,
          actorId: req.user!.id,
          actorRole: req.user!.role,
          actorName: req.user!.name,
          action: 'RELEASED',
          description: 'FDR released and certificate generated',
          metadata: { releaseRequestId: req.params.id, certificateUrl },
        },
      });
      
      return updated;
    });
    
    res.json({
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

export default router;