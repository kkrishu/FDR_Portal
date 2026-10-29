import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authMiddleware, requireRole, requirePermission, dataIsolationMiddleware } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { AppError, NotFoundError, ValidationError, ErrorCodes, HttpStatus } from '@/middleware/errorHandler';
import { 
  createFDRSchema, 
  updateFDRSchema, 
  fdrSearchFiltersSchema,
  CreateFDRInput,
  UpdateFDRInput,
  FDRSearchFilters
} from '@fdr-portal/shared/validators';
import { FDR_STATUS, UserRole, NOTIFICATION_TYPES } from '@fdr-portal/shared/constants';
import { notificationService } from '@/services/notificationService';
import { auditService } from '@/services/auditService';
import { assessFdrRisk, loadRules } from '@/services/fdrRiskService';
import { generateSecureToken, hashSHA256 } from '@fdr-portal/shared/utils';

const router: Router = Router();

/**
 * Simple interest for the deposit's actual term, annualised from the quoted
 * p.a. rate. Returns undefined when no rate was declared so the field stays
 * honest rather than implying a computed figure that was never requested.
 */
export function computeInterestAmount(
  amount: number,
  rate: number | null | undefined,
  issueDate: Date,
  maturityDate: Date
): number | undefined {
  if (!rate || rate <= 0) return undefined;
  const days = Math.max(
    1,
    Math.round((maturityDate.getTime() - issueDate.getTime()) / (1000 * 60 * 60 * 24))
  );
  return Math.round((amount * rate * days) / (100 * 365));
}

// All FDR routes require authentication
router.use(authMiddleware);
router.use(dataIsolationMiddleware);

/**
 * POST /api/v1/fdrs
 * Create a new FDR (draft or submit)
 */
router.post('/', 
  requirePermission('fdr', 'create'),
  asyncHandler(async (req: Request, res: Response) => {
    const validated = createFDRSchema.parse(req.body);
    
    // Check for duplicate FDR number within institution
    const existingFDR = await prisma.fDR.findUnique({
      where: {
        institutionId_fdrNumber: {
          institutionId: req.user!.institutionId!,
          fdrNumber: validated.fdrNumber,
        },
      },
    });
    
    if (existingFDR) {
      throw new AppError('FDR number already exists for this institution', HttpStatus.CONFLICT, ErrorCodes.DUPLICATE_FDR);
    }
    
    // Validate bank branch exists
    const bankBranch = await prisma.bankBranch.findUnique({
      where: { ifscCode: validated.ifscCode },
      include: { bank: true },
    });
    
    if (!bankBranch) {
      throw new ValidationError('Invalid IFSC code', { field: 'ifscCode' });
    }
    
    // Calculate risk score and flags (simplified for now)
    const riskScore = 0;
    const flags: any[] = [];
    
    // Create FDR with transaction
    const fdr = await prisma.$transaction(async (tx) => {
      // Create FDR
      const newFDR = await tx.fDR.create({
        data: {
          institutionId: req.user!.institutionId!,
          fdrNumber: validated.fdrNumber,
          bankId: bankBranch.bankId,
          bankName: bankBranch.bank?.name || '',
          branchName: bankBranch.branchName,
          ifscCode: validated.ifscCode,
          amount: validated.amount,
          issueDate: new Date(validated.issueDate),
          maturityDate: new Date(validated.maturityDate),
          interestRate: validated.interestRate,
          // Simple interest annualised over the actual term, not a flat
          // percentage of principal — a 6-month deposit earns half the rate.
          interestAmount: computeInterestAmount(
            validated.amount,
            validated.interestRate,
            new Date(validated.issueDate),
            new Date(validated.maturityDate)
          ),
          status: FDR_STATUS.DRAFT,
          riskScore,
          createdBy: req.user!.id,
          jointHolders: {
            create: validated.jointHolders.map(h => ({
              name: h.name,
              pan: h.pan,
              isAICTE: h.isAICTE,
              percentage: h.percentage,
            })),
          },
          lienDetails: validated.lienDetails ? {
            create: {
              lienHolderName: validated.lienDetails.lienHolderName,
              lienHolderPAN: validated.lienDetails.lienHolderPAN,
              lienAmount: validated.lienDetails.lienAmount,
              lienStartDate: new Date(validated.lienDetails.lienStartDate),
              lienEndDate: validated.lienDetails.lienEndDate ? new Date(validated.lienDetails.lienEndDate) : null,
              lienDocumentId: validated.lienDetails.lienDocumentId,
            },
          } : undefined,
        },
        include: {
          jointHolders: true,
          lienDetails: true,
          documents: true,
        },
      });
      
      // Create documents. Uploader and version come from the session and the
      // lifecycle, not from the request body.
      for (const doc of validated.documents) {
        await tx.fDRDocument.create({
          data: {
            fdrId: newFDR.id,
            type: doc.type,
            fileName: doc.fileName,
            fileUrl: doc.fileUrl,
            fileSize: doc.fileSize,
            mimeType: doc.mimeType,
            uploadedBy: req.user!.id,
            version: doc.version ?? 1,
            fileHash: doc.fileHash,
            ocrData: doc.ocrData,
          },
        });
      }
      
      // Add timeline entry
      await tx.fDRTimelineEntry.create({
        data: {
          fdrId: newFDR.id,
          status: FDR_STATUS.DRAFT,
          actorId: req.user!.id,
          actorRole: req.user!.role,
          actorName: req.user!.name,
          action: 'CREATED',
          description: 'FDR created as draft',
        },
      });
      
      return newFDR;
    });
    
    res.status(HttpStatus.CREATED).json({
      success: true,
      data: fdr,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * GET /api/v1/fdrs
 * List FDRs with filters and pagination
 */
router.get('/',
  requirePermission('fdr', 'read'),
  asyncHandler(async (req: Request, res: Response) => {
    const filters = fdrSearchFiltersSchema.parse(req.query);
    const { page = 1, limit = 20, sortBy = 'createdAt', sortOrder = 'desc', ...searchFilters } = filters;
    
    // Build where clause
    const where: any = {};
    
    if (req.user!.institutionId) {
      where.institutionId = req.user!.institutionId;
    }
    if (req.user!.bankId) {
      where.bankId = req.user!.bankId;
    }
    
    if (searchFilters.query) {
      where.OR = [
        { fdrNumber: { contains: searchFilters.query, mode: 'insensitive' } },
        { bankName: { contains: searchFilters.query, mode: 'insensitive' } },
      ];
    }
    if (searchFilters.bankId) where.bankId = searchFilters.bankId;
    if (searchFilters.status?.length) where.status = { in: searchFilters.status };
    if (searchFilters.flagged !== undefined) {
      where.flags = searchFilters.flagged ? { some: {} } : { none: {} };
    }
    if (searchFilters.dateFrom || searchFilters.dateTo) {
      where.createdAt = {};
      if (searchFilters.dateFrom) where.createdAt.gte = new Date(searchFilters.dateFrom);
      if (searchFilters.dateTo) where.createdAt.lte = new Date(searchFilters.dateTo);
    }
    if (searchFilters.amountMin || searchFilters.amountMax) {
      where.amount = {};
      if (searchFilters.amountMin) where.amount.gte = searchFilters.amountMin;
      if (searchFilters.amountMax) where.amount.lte = searchFilters.amountMax;
    }
    if (searchFilters.expiryFrom || searchFilters.expiryTo) {
      where.maturityDate = {};
      if (searchFilters.expiryFrom) where.maturityDate.gte = new Date(searchFilters.expiryFrom);
      if (searchFilters.expiryTo) where.maturityDate.lte = new Date(searchFilters.expiryTo);
    }
    if (searchFilters.assuranceLevel?.length) {
      where.assuranceLevel = { in: searchFilters.assuranceLevel };
    }
    
    // Build orderBy
    const orderBy: any = {};
    orderBy[sortBy] = sortOrder;
    
    const [fdrs, total] = await Promise.all([
      prisma.fDR.findMany({
        where,
        orderBy,
        skip: (page - 1) * limit,
        take: limit,
        include: {
          jointHolders: true,
          lienDetails: true,
          documents: true,
          flags: true,
        },
      }),
      prisma.fDR.count({ where }),
    ]);
    
    res.json({
      success: true,
      data: fdrs,
      meta: {
        timestamp: new Date().toISOString(),
        requestId: req.correlationId!,
        page,
        limit,
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  })
);

/**
 * GET /api/v1/fdrs/:id
 * Get FDR by ID
 */
router.get('/:id',
  requirePermission('fdr', 'read'),
  asyncHandler(async (req: Request, res: Response) => {
    const fdr = await prisma.fDR.findUnique({
      where: { id: req.params.id },
      include: {
        institution: true,
        jointHolders: true,
        lienDetails: true,
        documents: true,
        flags: true,
        timeline: {
          orderBy: { createdAt: 'desc' },
          take: 50,
        },
        verificationRequests: true,
        verificationResult: true,
        releaseRequest: true,
      },
    });
    
    if (!fdr) {
      throw new NotFoundError('FDR');
    }
    
    // Check data isolation
    if (req.user!.role !== 'ADMIN' && req.user!.institutionId && fdr.institutionId !== req.user!.institutionId) {
      throw new AppError('Access denied', HttpStatus.FORBIDDEN, ErrorCodes.DATA_ISOLATION_VIOLATION);
    }
    
    res.json({
      success: true,
      data: fdr,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * PATCH /api/v1/fdrs/:id
 * Update FDR (draft only)
 */
router.patch('/:id',
  requirePermission('fdr', 'update'),
  asyncHandler(async (req: Request, res: Response) => {
    const validated = updateFDRSchema.parse(req.body);
    
    const existingFDR = await prisma.fDR.findUnique({
      where: { id: req.params.id },
    });
    
    if (!existingFDR) {
      throw new NotFoundError('FDR');
    }
    
    // Only allow updates for drafts
    if (existingFDR.status !== FDR_STATUS.DRAFT) {
      throw new AppError('Cannot update submitted FDR', HttpStatus.BAD_REQUEST, ErrorCodes.FDR_NOT_EDITABLE);
    }
    
    // Check ownership
    if (req.user!.role !== 'ADMIN' && existingFDR.institutionId !== req.user!.institutionId) {
      throw new AppError('Access denied', HttpStatus.FORBIDDEN, ErrorCodes.DATA_ISOLATION_VIOLATION);
    }
    
    const fdr = await prisma.$transaction(async (tx) => {
      // Update FDR
      const updated = await tx.fDR.update({
        where: { id: req.params.id },
        data: {
          ...(validated.fdrNumber !== undefined && { fdrNumber: validated.fdrNumber }),
          ...(validated.bankId !== undefined && { bankId: validated.bankId }),
          ...(validated.bankName !== undefined && { bankName: validated.bankName }),
          ...(validated.branchName !== undefined && { branchName: validated.branchName }),
          ...(validated.ifscCode !== undefined && { ifscCode: validated.ifscCode }),
          ...(validated.amount !== undefined && { amount: validated.amount }),
          ...(validated.interestRate !== undefined && { interestRate: validated.interestRate }),
          ...(validated.status !== undefined && { status: validated.status }),
          ...(validated.riskScore !== undefined && { riskScore: validated.riskScore }),
          issueDate: validated.issueDate ? new Date(validated.issueDate) : undefined,
          maturityDate: validated.maturityDate ? new Date(validated.maturityDate) : undefined,
          jointHolders: validated.jointHolders ? {
            deleteMany: {},
            create: validated.jointHolders.map((h: any) => ({
              name: h.name,
              pan: h.pan,
              isAICTE: h.isAICTE,
              percentage: h.percentage,
            })),
          } : undefined,
          lienDetails: validated.lienDetails ? {
            upsert: {
              create: {
                lienHolderName: validated.lienDetails.lienHolderName,
                lienHolderPAN: validated.lienDetails.lienHolderPAN,
                lienAmount: validated.lienDetails.lienAmount,
                lienStartDate: new Date(validated.lienDetails.lienStartDate),
                lienEndDate: validated.lienDetails.lienEndDate ? new Date(validated.lienDetails.lienEndDate) : null,
                lienDocumentId: validated.lienDetails.lienDocumentId,
              },
              update: {
                lienHolderName: validated.lienDetails.lienHolderName,
                lienHolderPAN: validated.lienDetails.lienHolderPAN,
                lienAmount: validated.lienDetails.lienAmount,
                lienStartDate: new Date(validated.lienDetails.lienStartDate),
                lienEndDate: validated.lienDetails.lienEndDate ? new Date(validated.lienDetails.lienEndDate) : null,
                lienDocumentId: validated.lienDetails.lienDocumentId,
              },
            },
          } : undefined,
        },
        include: {
          jointHolders: true,
          lienDetails: true,
          documents: true,
        },
      });
      
      // Add timeline entry
      await tx.fDRTimelineEntry.create({
        data: {
          fdrId: req.params.id,
          status: existingFDR.status,
          actorId: req.user!.id,
          actorRole: req.user!.role,
          actorName: req.user!.name,
          action: 'UPDATED',
          description: 'FDR draft updated',
        },
      });
      
      return updated;
    });
    
    res.json({
      success: true,
      data: fdr,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/fdrs/:id/submit
 * Submit FDR for verification
 */
router.post('/:id/submit',
  requirePermission('fdr', 'submit'),
  asyncHandler(async (req: Request, res: Response) => {
    const fdr = await prisma.fDR.findUnique({
      where: { id: req.params.id },
      include: {
        documents: true,
        jointHolders: true,
        lienDetails: true,
      },
    });
    
    if (!fdr) {
      throw new NotFoundError('FDR');
    }
    
    if (fdr.status !== FDR_STATUS.DRAFT) {
      throw new AppError('Only draft FDRs can be submitted', HttpStatus.BAD_REQUEST, ErrorCodes.FDR_ALREADY_SUBMITTED);
    }
    
    // Validate required documents
    const requiredDocs = ['FDR_CERTIFICATE', 'BOARD_RESOLUTION'];
    const hasRequiredDocs = requiredDocs.every(type => 
      fdr.documents.some(d => d.type === type)
    );
    
    if (!hasRequiredDocs) {
      throw new ValidationError('Missing required documents', { 
        field: 'documents',
        missing: requiredDocs.filter(type => !fdr.documents.some(d => d.type === type))
      });
    }
    
    // Validate AICTE in joint holders
    const hasAICTE = fdr.jointHolders.some(h => h.isAICTE);
    if (!hasAICTE) {
      throw new ValidationError('At least one joint holder must be AICTE', { field: 'jointHolders' });
    }
    
    // Run the real risk assessment: every check states what is wrong and what
    // to do about it, and the score is the weighted sum of what it found.
    const assessment = await assessFdrRisk(
      {
        fdrNumber: fdr.fdrNumber,
        amount: fdr.amount,
        issueDate: fdr.issueDate,
        maturityDate: fdr.maturityDate,
        interestRate: fdr.interestRate,
        institutionId: fdr.institutionId,
        ifscCode: fdr.ifscCode,
        lienAmount: fdr.lienDetails?.lienAmount ?? null,
      },
      await loadRules()
    );
    const riskScore = assessment.riskScore;
    const flags: any[] = assessment.flags;

    // Submit FDR
    const updatedFDR = await prisma.$transaction(async (tx) => {
      const updated = await tx.fDR.update({
        where: { id: req.params.id },
        data: {
          status: FDR_STATUS.SUBMITTED,
          riskScore,
          // Re-evaluate from scratch on every submission attempt.
          flags: { deleteMany: {}, create: flags.map((f) => ({ ...f, isAutoGenerated: true })) },
        },
      });
      
      // Add timeline entry
      await tx.fDRTimelineEntry.create({
        data: {
          fdrId: req.params.id,
          status: FDR_STATUS.SUBMITTED,
          actorId: req.user!.id,
          actorRole: req.user!.role,
          actorName: req.user!.name,
          action: 'SUBMITTED',
          description: 'FDR submitted for bank verification',
          metadata: { riskScore, flagsCount: flags.length },
        },
      });
      
      return updated;
    });
    
    // The branch manager and every reviewing officer need to know a deposit is
    // waiting on them; without this the queue only moves when someone reloads.
    await notificationService.notifyRole(['OFFICER'], {
      type: NOTIFICATION_TYPES.FDR_SUBMITTED,
      title: 'New FDR submitted',
      message: `${fdr.fdrNumber} from ${fdr.bankName} is awaiting review.`,
      metadata: { fdrId: fdr.id, fdrNumber: fdr.fdrNumber, link: `/dashboard/officer/cases/${fdr.id}` },
    });

    await notificationService.notify({
      userId: fdr.createdBy,
      type: NOTIFICATION_TYPES.FDR_SUBMITTED,
      title: 'FDR submitted for verification',
      message: `${fdr.fdrNumber} has been submitted and is awaiting bank verification.`,
      metadata: { fdrId: fdr.id, fdrNumber: fdr.fdrNumber, link: `/dashboard/institution/fdrs/${fdr.id}` },
    });

    await auditService.recordForRequest(req, {
      action: 'FDR_SUBMITTED',
      entityType: 'FDR',
      entityId: fdr.id,
      before: { status: FDR_STATUS.DRAFT },
      after: { status: FDR_STATUS.SUBMITTED, riskScore },
    });

    res.json({
      success: true,
      data: updatedFDR,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * GET /api/v1/fdrs/:id/timeline
 * Get FDR timeline
 */
router.get('/:id/timeline',
  requirePermission('fdr', 'read'),
  asyncHandler(async (req: Request, res: Response) => {
    const timeline = await prisma.fDRTimelineEntry.findMany({
      where: { fdrId: req.params.id },
      orderBy: { createdAt: 'desc' },
    });
    
    res.json({
      success: true,
      data: timeline,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * GET /api/v1/fdrs/:id/receipt
 * Generate receipt for FDR
 */
router.get('/:id/receipt',
  requirePermission('fdr', 'read'),
  asyncHandler(async (req: Request, res: Response) => {
    const fdr = await prisma.fDR.findUnique({
      where: { id: req.params.id },
      include: {
        institution: true,
        jointHolders: true,
        lienDetails: true,
        documents: true,
      },
    });
    
    if (!fdr) {
      throw new NotFoundError('FDR');
    }
    
    // Generate PDF receipt (placeholder - would use a PDF library)
    const receiptData = {
      fdrNumber: fdr.fdrNumber,
      institution: fdr.institution.name,
      bank: fdr.bankName,
      branch: fdr.branchName,
      amount: fdr.amount,
      issueDate: fdr.issueDate,
      maturityDate: fdr.maturityDate,
      status: fdr.status,
      jointHolders: fdr.jointHolders,
      lienDetails: fdr.lienDetails,
    };
    
    res.json({
      success: true,
      data: receiptData,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/fdrs/:id/flags/:flagId/respond
 * Institution's answer to an open flag: an explanation, a correction, or a
 * pointer to an uploaded document. Keeps the flag open but visible to the
 * officer, who decides whether it closes the issue.
 */
router.post('/:id/flags/:flagId/respond',
  requirePermission('fdr', 'update'),
  asyncHandler(async (req: Request, res: Response) => {
    const note = z.string().trim().min(5, 'Add a short explanation (at least 5 characters)').max(1000).parse(req.body?.note);

    const fdr = await prisma.fDR.findUnique({ where: { id: req.params.id } });
    if (!fdr) throw new NotFoundError('FDR');
    if (req.user!.role !== 'ADMIN' && fdr.institutionId !== req.user!.institutionId) {
      throw new AppError('Access denied', HttpStatus.FORBIDDEN, ErrorCodes.DATA_ISOLATION_VIOLATION);
    }

    const flag = await prisma.fDRFlag.findUnique({ where: { id: req.params.flagId } });
    if (!flag || flag.fdrId !== fdr.id) throw new NotFoundError('Flag');
    if (flag.resolvedAt) {
      throw new AppError('This flag is already resolved', HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_ERROR);
    }

    const updated = await prisma.fDRFlag.update({
      where: { id: flag.id },
      data: {
        institutionResponse: note,
        institutionRespondedAt: new Date(),
      },
    });

    await prisma.fDRTimelineEntry.create({
      data: {
        fdrId: fdr.id,
        status: fdr.status,
        actorId: req.user!.id,
        actorRole: req.user!.role,
        actorName: req.user!.name,
        action: 'FLAG_RESPONDED',
        description: `Institution responded to the ${flag.category.replace(/_/g, ' ').toLowerCase()} flag`,
        metadata: { flagId: flag.id, note },
      },
    });

    await notificationService.notifyRole(['OFFICER'], {
      type: NOTIFICATION_TYPES.SCRUTINY_REMARKS,
      title: 'Institution responded to a flag',
      message: `${fdr.fdrNumber}: ${note.slice(0, 120)}${note.length > 120 ? '…' : ''}`,
      metadata: { fdrId: fdr.id, fdrNumber: fdr.fdrNumber, flagId: flag.id, link: `/dashboard/officer/cases/${fdr.id}` },
    });

    await auditService.recordForRequest(req, {
      action: 'FLAG_RESPONDED',
      entityType: 'FDRFlag',
      entityId: flag.id,
      after: { note },
    });

    res.json({
      success: true,
      data: updated,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/officer-flags/:flagId/resolve is officer-only and lives in the
 * officer router; this pair keeps institution actions under /fdrs.
 */

/**
 * POST /api/v1/fdrs/:id/renew
 * Renew FDR
 */
router.post('/:id/renew',
  requirePermission('fdr', 'renew'),
  asyncHandler(async (req: Request, res: Response) => {
    const fdr = await prisma.fDR.findUnique({
      where: { id: req.params.id },
    });
    
    if (!fdr) {
      throw new NotFoundError('FDR');
    }
    
    if (fdr.status !== FDR_STATUS.VERIFIED && fdr.status !== FDR_STATUS.RELEASED) {
      throw new AppError('Only verified or released FDRs can be renewed', HttpStatus.BAD_REQUEST);
    }
    
    // Create the renewal as a fresh one-year deposit carrying the same rate.
    const renewalIssueDate = new Date();
    const renewalMaturityDate = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000);
    const newFDR = await prisma.fDR.create({
      data: {
        institutionId: fdr.institutionId,
        fdrNumber: `${fdr.fdrNumber}-R${fdr.renewalCount + 1}`,
        bankId: fdr.bankId,
        bankName: fdr.bankName,
        branchName: fdr.branchName,
        ifscCode: fdr.ifscCode,
        amount: fdr.amount,
        issueDate: renewalIssueDate,
        maturityDate: renewalMaturityDate,
        interestRate: fdr.interestRate,
        interestAmount: computeInterestAmount(
          fdr.amount,
          fdr.interestRate,
          renewalIssueDate,
          renewalMaturityDate
        ),
        status: FDR_STATUS.DRAFT,
        parentFdrId: fdr.id,
        renewalCount: fdr.renewalCount + 1,
        createdBy: req.user!.id,
      },
    });
    
    // Update parent FDR
    await prisma.fDR.update({
      where: { id: fdr.id },
      data: { status: FDR_STATUS.RENEWED },
    });
    
    res.status(HttpStatus.CREATED).json({
      success: true,
      data: newFDR,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/fdrs/:id/release-requests
 * Request FDR release
 */
router.post('/:id/release-requests',
  requirePermission('fdr', 'release-request'),
  asyncHandler(async (req: Request, res: Response) => {
    const fdr = await prisma.fDR.findUnique({
      where: { id: req.params.id },
    });
    
    if (!fdr) {
      throw new NotFoundError('FDR');
    }
    
    // Check eligibility
    if (fdr.status !== FDR_STATUS.VERIFIED && fdr.status !== FDR_STATUS.RELEASED) {
      throw new AppError('FDR must be verified before release', HttpStatus.BAD_REQUEST, ErrorCodes.RELEASE_NOT_ELIGIBLE);
    }
    
    if (fdr.releaseRequestId) {
      throw new AppError('Release request already exists', HttpStatus.CONFLICT);
    }
    
    const releaseRequest = await prisma.releaseRequest.create({
      data: {
        fdrId: fdr.id,
        institutionId: fdr.institutionId,
        reason: req.body.reason,
        documents: req.body.documents || [],
        checklist: [],
        requestedBy: req.user!.id,
        slaDeadline: new Date(Date.now() + 72 * 60 * 60 * 1000), // 72 hours
      },
    });
    
    // Update FDR status
    await prisma.fDR.update({
      where: { id: fdr.id },
      data: { 
        status: FDR_STATUS.RELEASE_REQUESTED,
        releaseRequestId: releaseRequest.id,
      },
    });
    
    // Add timeline entry
    await prisma.fDRTimelineEntry.create({
      data: {
        fdrId: fdr.id,
        status: FDR_STATUS.RELEASE_REQUESTED,
        actorId: req.user!.id,
        actorRole: req.user!.role,
        actorName: req.user!.name,
        action: 'RELEASE_REQUESTED',
        description: 'Release request submitted',
        metadata: { releaseRequestId: releaseRequest.id, reason: req.body.reason },
      },
    });
    
    await notificationService.notifyRole(['OFFICER', 'ADMIN'], {
      type: NOTIFICATION_TYPES.RELEASE_REQUESTED,
      title: 'Release requested',
      message: `${req.user!.name} requested release of FDR ${fdr.fdrNumber} (${fdr.bankName}).`,
      metadata: {
        fdrId: fdr.id,
        fdrNumber: fdr.fdrNumber,
        releaseRequestId: releaseRequest.id,
        link: `/dashboard/officer/releases`,
      },
    });

    await auditService.recordForRequest(req, {
      action: 'RELEASE_REQUESTED',
      entityType: 'ReleaseRequest',
      entityId: releaseRequest.id,
      after: { fdrId: fdr.id, reason: req.body.reason },
    });

    res.status(HttpStatus.CREATED).json({
      success: true,
      data: releaseRequest,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

export default router;