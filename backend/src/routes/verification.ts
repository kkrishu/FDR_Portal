import { Router, Request, Response } from 'express';
import { z } from 'zod';
import { prisma } from '@/lib/prisma';
import { authMiddleware, optionalAuthMiddleware, requireRole, requirePermission, dataIsolationMiddleware } from '@/middleware/auth';
import { asyncHandler } from '@/middleware/errorHandler';
import { AppError, NotFoundError, ValidationError, AuthenticationError, ErrorCodes, HttpStatus } from '@/middleware/errorHandler';
import { 
  VERIFICATION_CHANNELS, 
  VERIFICATION_STATUS, 
  ASSURANCE_LEVELS, 
  FDR_STATUS 
} from '@fdr-portal/shared/constants';
import { 
  createVerificationRequestSchema, 
  otpVerifySchema, 
  bankVerificationSubmitSchema,
  nodalVerificationSubmitSchema 
} from '@fdr-portal/shared/validators';
import { generateSecureToken, hashSHA256, verifySHA256, generateOTP, addMinutes, formatISODate } from '@fdr-portal/shared/utils';
import speakeasy from 'speakeasy';
import { config } from '@/config';
import { mailService } from '@/services/mailService';
import { notificationService } from '@/services/notificationService';
import { auditService } from '@/services/auditService';
import { NOTIFICATION_TYPES } from '@fdr-portal/shared/constants';

const router: Router = Router();

/**
 * POST /api/v1/verification/request
 * Create a verification request for an FDR
 */
router.post('/request',
  authMiddleware,
  requirePermission('fdr', 'read'),
  asyncHandler(async (req: Request, res: Response) => {
    const validated = createVerificationRequestSchema.parse(req.body);
    
    const fdr = await prisma.fDR.findUnique({
      where: { id: validated.fdrId },
      include: {
        institution: true,
        documents: true,
        jointHolders: true,
      },
    });
    
    if (!fdr) {
      throw new NotFoundError('FDR');
    }
    
    if (fdr.status !== FDR_STATUS.SUBMITTED && fdr.status !== FDR_STATUS.AWAITING_BANK_VERIFICATION) {
      throw new AppError('FDR must be in submitted status for verification', HttpStatus.BAD_REQUEST);
    }
    
    // Check if verification already exists
    const existingVerification = await prisma.verificationRequest.findFirst({
      where: {
        fdrId: validated.fdrId,
        status: { in: [VERIFICATION_STATUS.PENDING, VERIFICATION_STATUS.VERIFIED] },
      },
    });
    
    if (existingVerification) {
      throw new AppError('Verification already in progress', HttpStatus.CONFLICT);
    }
    
    // Get bank branch for contact
    const bankBranch = await prisma.bankBranch.findUnique({
      where: { ifscCode: fdr.ifscCode },
      include: { bank: true },
    });
    
    if (!bankBranch) {
      throw new NotFoundError('Bank branch');
    }
    
    // Generate token
    const token = generateSecureToken(32);
    const tokenHash = hashSHA256(token);
    const tokenExpiry = addMinutes(new Date(), validated.tokenExpiryHours * 60);
    
    // Create verification request
    const verification = await prisma.verificationRequest.create({
      data: {
        fdrId: validated.fdrId,
        tokenHash,
        tokenExpiry,
        channel: validated.channel,
        status: VERIFICATION_STATUS.PENDING,
        sentToEmail: validated.sentToEmail,
        sentAt: new Date(),
        bankBranchId: bankBranch.id,
      },
    });
    
    // Generate OTP if secure link channel
    if (validated.channel === VERIFICATION_CHANNELS.SECURE_LINK) {
      const otp = generateOTP(6);
      const otpHash = hashSHA256(otp);
      const otpExpiry = addMinutes(new Date(), 10); // 10 minutes
      
      await prisma.oTPVerification.create({
        data: {
          verificationRequestId: verification.id,
          otpHash,
          maxAttempts: 5,
          expiresAt: otpExpiry,
        },
      });
      
      await mailService.sendVerificationOtp({
        to: validated.sentToEmail,
        otp,
        fdrNumber: fdr.fdrNumber,
        bankName: fdr.bankName,
        amount: fdr.amount,
        expiresMinutes: 10,
        verifyUrl: `${config.FRONTEND_URL}/verify/${token}`,
      });
    }
    
    // Update FDR status
    await prisma.fDR.update({
      where: { id: validated.fdrId },
      data: { 
        status: FDR_STATUS.AWAITING_BANK_VERIFICATION,
        bankVerificationId: verification.id,
      },
    });
    
    // Add timeline entry
    await prisma.fDRTimelineEntry.create({
      data: {
        fdrId: validated.fdrId,
        status: FDR_STATUS.AWAITING_BANK_VERIFICATION,
        actorId: req.user!.id,
        actorRole: req.user!.role,
        actorName: req.user!.name,
        action: 'VERIFICATION_REQUESTED',
        description: `Bank verification requested via ${validated.channel}`,
        metadata: { verificationId: verification.id, channel: validated.channel },
      },
    });
    
    // The bank's contact address gets the secure link; the institution that
    // submitted the deposit is notified that the request went out.
    await notificationService.notify({
      userId: fdr.createdBy,
      type: NOTIFICATION_TYPES.BANK_VERIFICATION_REQUESTED,
      title: 'Bank verification requested',
      message: `Verification request sent to ${bankBranch.bank.name} for FDR ${fdr.fdrNumber}.`,
      metadata: {
        fdrId: fdr.id,
        fdrNumber: fdr.fdrNumber,
        verificationId: verification.id,
        link: `/dashboard/institution/fdrs/${fdr.id}`,
      },
    });

    await auditService.recordForRequest(req, {
      action: 'VERIFICATION_REQUESTED',
      entityType: 'VerificationRequest',
      entityId: verification.id,
      after: { fdrId: fdr.id, channel: validated.channel, sentToEmail: validated.sentToEmail },
    });

    const verificationUrl = `${config.FRONTEND_URL}/verify/${token}`;
    
    res.status(HttpStatus.CREATED).json({
      success: true,
      data: {
        verificationId: verification.id,
        verificationUrl,
        tokenExpiry: formatISODate(tokenExpiry),
        // In development, return token for testing
        ...(process.env.NODE_ENV === 'development' && { token }),
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * GET /api/v1/verification/bank-verify?token=...
 * Landing page for bank verification (no token consumption)
 */
router.get('/bank-verify',
  optionalAuthMiddleware,
  asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.query;
    
    if (!token || typeof token !== 'string') {
      throw new ValidationError('Verification token is required');
    }
    
    const tokenHash = hashSHA256(token);
    
    const verification = await prisma.verificationRequest.findUnique({
      where: { tokenHash },
      include: {
        fdr: {
          include: {
            institution: true,
            documents: true,
            jointHolders: true,
            lienDetails: true,
          },
        },
        bankBranch: {
          include: { bank: true },
        },
      },
    });
    
    if (!verification) {
      throw new NotFoundError('Verification request');
    }
    
    if (verification.status !== VERIFICATION_STATUS.PENDING) {
      throw new AppError('Verification link has expired or been used', HttpStatus.GONE);
    }
    
    if (verification.tokenExpiry < new Date()) {
      await prisma.verificationRequest.update({
        where: { id: verification.id },
        data: { status: VERIFICATION_STATUS.EXPIRED },
      });
      throw new AppError('Verification link has expired', HttpStatus.GONE);
    }
    
    // Return FDR details for verification page (without sensitive data)
    res.json({
      success: true,
      data: {
        verificationId: verification.id,
        fdr: {
          fdrNumber: verification.fdr.fdrNumber,
          bankName: verification.fdr.bankName,
          branchName: verification.fdr.branchName,
          amount: verification.fdr.amount,
          issueDate: verification.fdr.issueDate,
          maturityDate: verification.fdr.maturityDate,
          jointHolders: verification.fdr.jointHolders.map(h => ({
            name: h.name,
            pan: h.pan,
            isAICTE: h.isAICTE,
            percentage: h.percentage,
          })),
          lienDetails: verification.fdr.lienDetails ? {
            lienHolderName: verification.fdr.lienDetails.lienHolderName,
            lienAmount: verification.fdr.lienDetails.lienAmount,
          } : null,
          documents: verification.fdr.documents.map(d => ({
            type: d.type,
            fileName: d.fileName,
            fileUrl: d.fileUrl,
          })),
        },
        bankBranch: {
          bankName: verification.bankBranch.bank?.name,
          branchName: verification.bankBranch.branchName,
        },
        tokenExpiry: formatISODate(verification.tokenExpiry),
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/verification/otp
 * Request OTP for verification
 */
router.post('/otp',
  asyncHandler(async (req: Request, res: Response) => {
    const { token } = req.body;
    
    if (!token) {
      throw new ValidationError('Token is required');
    }
    
    const tokenHash = hashSHA256(token);
    
    const verification = await prisma.verificationRequest.findUnique({
      where: { tokenHash },
      include: { otp: true },
    });
    
    if (!verification || verification.status !== VERIFICATION_STATUS.PENDING) {
      throw new AppError('Invalid or expired verification request', HttpStatus.GONE);
    }
    
    if (!verification.otp) {
      throw new AppError('OTP not available for this verification', HttpStatus.BAD_REQUEST);
    }
    
    if (verification.otp.expiresAt < new Date()) {
      throw new AppError('OTP has expired', HttpStatus.GONE);
    }
    
    // Generate new OTP
    const otp = generateOTP(6);
    const otpHash = hashSHA256(otp);
    const otpExpiry = addMinutes(new Date(), 10);
    
    await prisma.oTPVerification.update({
      where: { id: verification.otp.id },
      data: {
        otpHash,
        expiresAt: otpExpiry,
        attempts: 0,
      },
    });
    
    // The branch contact asked for a new code; the FDR context is what they are
    // verifying, so include it to avoid a bare number in an email.
    const verificationWithFdr = await prisma.verificationRequest.findUnique({
      where: { id: verification.id },
      include: { fdr: true },
    });

    if (verificationWithFdr) {
      await mailService.sendVerificationOtp({
        to: verification.sentToEmail,
        otp,
        fdrNumber: verificationWithFdr.fdr.fdrNumber,
        bankName: verificationWithFdr.fdr.bankName,
        amount: verificationWithFdr.fdr.amount,
        expiresMinutes: 10,
        verifyUrl: `${config.FRONTEND_URL}/verify/${token}`,
      });
    }

    res.json({
      success: true,
      data: { message: 'OTP sent successfully', expiresAt: formatISODate(otpExpiry) },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/verification/verify
 * Submit bank verification with OTP
 */
router.post('/verify',
  asyncHandler(async (req: Request, res: Response) => {
    const validated = bankVerificationSubmitSchema.parse(req.body);
    
    const tokenHash = hashSHA256(validated.token);
    
    const verification = await prisma.verificationRequest.findUnique({
      where: { tokenHash },
      include: {
        fdr: true,
        otp: true,
        bankBranch: true,
      },
    });
    
    if (!verification) {
      throw new NotFoundError('Verification request');
    }
    
    if (verification.status !== VERIFICATION_STATUS.PENDING) {
      throw new AppError('Verification already completed or expired', HttpStatus.GONE);
    }
    
    if (verification.tokenExpiry < new Date()) {
      await prisma.verificationRequest.update({
        where: { id: verification.id },
        data: { status: VERIFICATION_STATUS.EXPIRED },
      });
      throw new AppError('Verification link has expired', HttpStatus.GONE);
    }
    
    // Verify OTP
    if (!verification.otp) {
      throw new AppError('OTP not available', HttpStatus.BAD_REQUEST);
    }
    
    if (verification.otp.attempts >= verification.otp.maxAttempts) {
      throw new AppError('Maximum OTP attempts exceeded', HttpStatus.TOO_MANY_REQUESTS, ErrorCodes.OTP_MAX_ATTEMPTS);
    }
    
    if (verification.otp.expiresAt < new Date()) {
      throw new AppError('OTP has expired', HttpStatus.GONE, ErrorCodes.OTP_EXPIRED);
    }
    
    const isValidOTP = verifySHA256(validated.otp, verification.otp.otpHash);
    
    if (!isValidOTP) {
      await prisma.oTPVerification.update({
        where: { id: verification.otp.id },
        data: { attempts: { increment: 1 } },
      });
      throw new AuthenticationError('Invalid OTP', ErrorCodes.OTP_INVALID);
    }
    
    // The bank confirms through the secure link without signing in, so attribute
    // the result to a real user: the bank's manager when one exists, otherwise an
    // administrator. Both are valid ObjectIds; a placeholder string is not.
    const verifier = await prisma.user.findFirst({
      where: { role: 'BANK_MANAGER', bankId: verification.bankBranch.bankId, status: 'ACTIVE' },
      select: { id: true, name: true },
    });
    const verifierRecord =
      verifier ??
      (await prisma.user.findFirst({
        where: { role: 'ADMIN', status: 'ACTIVE' },
        select: { id: true, name: true },
      }));
    if (!verifierRecord) {
      throw new AppError(
        'No bank user is available to record this verification',
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCodes.INTERNAL_ERROR
      );
    }

    // Verify confirmations match
    const mismatches: string[] = [];
    if (!validated.amountConfirmed) mismatches.push('amount');
    if (!validated.issueDateConfirmed) mismatches.push('issue date');
    if (!validated.maturityDateConfirmed) mismatches.push('maturity date');
    if (!validated.fdrNumberConfirmed) mismatches.push('FDR number');
    if (!validated.jointHoldersConfirmed) mismatches.push('joint holders');
    if (!validated.lienConfirmed) mismatches.push('lien details');
    
    const status = mismatches.length === 0 ? VERIFICATION_STATUS.VERIFIED : VERIFICATION_STATUS.FLAGGED;
    const assuranceLevel = mismatches.length === 0 ? ASSURANCE_LEVELS.HIGH : ASSURANCE_LEVELS.LOW;
    
    // Update verification
    await prisma.$transaction(async (tx) => {
      // Update OTP as verified
      await tx.oTPVerification.update({
        where: { id: verification.otp!.id },
        data: { verifiedAt: new Date() },
      });
      
      // Create verification result
      await tx.verificationResult.create({
        data: {
          verificationRequestId: verification.id,
          fdrId: verification.fdrId,
          verifiedBy: verifierRecord.id,
          verifiedByRole: 'BANK_MANAGER',
          verifiedAt: new Date(),
          amountMatch: validated.amountConfirmed,
          issueDateMatch: validated.issueDateConfirmed,
          maturityDateMatch: validated.maturityDateConfirmed,
          fdrNumberMatch: validated.fdrNumberConfirmed,
          jointHoldersMatch: validated.jointHoldersConfirmed,
          lienMatch: validated.lienConfirmed,
          confirmations: {
            amountConfirmed: validated.amountConfirmed,
            datesConfirmed: validated.issueDateConfirmed && validated.maturityDateConfirmed,
            jointHoldersConfirmed: validated.jointHoldersConfirmed,
            lienConfirmed: validated.lienConfirmed,
          },
          remarks: validated.remarks,
          rejectionReason: mismatches.length > 0 ? `Mismatches: ${mismatches.join(', ')}` : undefined,
          assuranceLevel,
          ipAddress: req.ip,
          userAgent: req.get('user-agent'),
        },
      });
      
      // Update verification request
      await tx.verificationRequest.update({
        where: { id: verification.id },
        data: {
          status,
          completedAt: new Date(),
          assuranceLevel,
        },
      });
      
      // Update FDR
      const newFDRStatus = status === VERIFICATION_STATUS.VERIFIED ? FDR_STATUS.BANK_VERIFIED : FDR_STATUS.BANK_FLAGGED;
      await tx.fDR.update({
        where: { id: verification.fdrId },
        data: {
          status: newFDRStatus,
          bankVerificationId: verification.id,
          bankVerificationResult: {
            amountMatch: validated.amountConfirmed,
            issueDateMatch: validated.issueDateConfirmed,
            maturityDateMatch: validated.maturityDateConfirmed,
            fdrNumberMatch: validated.fdrNumberConfirmed,
            jointHoldersMatch: validated.jointHoldersConfirmed,
            lienMatch: validated.lienConfirmed,
            mismatches,
            assuranceLevel,
          },
        },
      });
      
      // Add timeline entry
      await tx.fDRTimelineEntry.create({
        data: {
          fdrId: verification.fdrId,
          status: newFDRStatus,
          actorId: verifierRecord.id,
          actorRole: 'BANK_MANAGER',
          actorName: verifierRecord.name,
          action: status === VERIFICATION_STATUS.VERIFIED ? 'BANK_VERIFIED' : 'BANK_FLAGGED',
          description: status === VERIFICATION_STATUS.VERIFIED 
            ? 'FDR verified by bank' 
            : `FDR flagged by bank: ${mismatches.join(', ')}`,
          metadata: { verificationId: verification.id, mismatches, assuranceLevel },
        },
      });
    });
    
    await notificationService.notify({
      userId: verification.fdr.createdBy,
      type: status === VERIFICATION_STATUS.VERIFIED
        ? NOTIFICATION_TYPES.BANK_VERIFICATION_COMPLETED
        : NOTIFICATION_TYPES.FDR_FLAGGED,
      title: status === VERIFICATION_STATUS.VERIFIED ? 'Bank verified your deposit' : 'Bank reported a discrepancy',
      message:
        status === VERIFICATION_STATUS.VERIFIED
          ? `${verification.fdr.fdrNumber} was confirmed by ${verification.fdr.bankName}.`
          : `${verification.fdr.fdrNumber} was flagged by ${verification.fdr.bankName}: ${mismatches.join(', ')}.`,
      metadata: {
        fdrId: verification.fdrId,
        fdrNumber: verification.fdr.fdrNumber,
        link: `/dashboard/institution/fdrs/${verification.fdrId}`,
      },
    });

    await notificationService.notifyRole(['OFFICER'], {
      type: NOTIFICATION_TYPES.BANK_VERIFICATION_COMPLETED,
      title: status === VERIFICATION_STATUS.VERIFIED ? 'Bank verification complete' : 'Bank flagged a deposit',
      message: `${verification.fdr.fdrNumber} is ${status === VERIFICATION_STATUS.VERIFIED ? 'ready for officer review' : 'flagged and needs scrutiny'}.`,
      metadata: {
        fdrId: verification.fdrId,
        fdrNumber: verification.fdr.fdrNumber,
        link: `/dashboard/officer/cases/${verification.fdrId}`,
      },
    });

    await auditService.recordForRequest(req, {
      action: status === VERIFICATION_STATUS.VERIFIED ? 'BANK_VERIFIED' : 'BANK_FLAGGED',
      entityType: 'FDR',
      entityId: verification.fdrId,
      after: { status, mismatches, assuranceLevel },
    });

    res.json({
      success: true,
      data: { 
        status,
        assuranceLevel,
        mismatches,
        message: status === VERIFICATION_STATUS.VERIFIED 
          ? 'FDR verified successfully' 
          : 'FDR flagged - mismatches found',
      },
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * POST /api/v1/verification/nodal-verify
 * Nodal officer verification
 */
router.post('/nodal-verify',
  authMiddleware,
  requireRole('NODAL_OFFICER'),
  asyncHandler(async (req: Request, res: Response) => {
    const validated = nodalVerificationSubmitSchema.parse(req.body);
    
    const fdr = await prisma.fDR.findUnique({
      where: { id: validated.fdrId },
    });
    
    if (!fdr) {
      throw new NotFoundError('FDR');
    }
    
    // Find pending verification for this FDR
    const verification = await prisma.verificationRequest.findFirst({
      where: {
        fdrId: validated.fdrId,
        channel: VERIFICATION_CHANNELS.NODAL_OFFICER,
        status: VERIFICATION_STATUS.PENDING,
      },
    });
    
    if (!verification) {
      // Create new nodal verification request
      const bankBranch = await prisma.bankBranch.findUnique({
        where: { ifscCode: fdr.ifscCode },
      });
      
      if (!bankBranch) {
        throw new NotFoundError('Bank branch');
      }
      
      const newVerification = await prisma.verificationRequest.create({
        data: {
          fdrId: validated.fdrId,
          tokenHash: hashSHA256(generateSecureToken(32)),
          tokenExpiry: addMinutes(new Date(), 48 * 60),
          channel: VERIFICATION_CHANNELS.NODAL_OFFICER,
          status: VERIFICATION_STATUS.PENDING,
          sentToEmail: req.user!.email,
          sentAt: new Date(),
          bankBranchId: bankBranch.id,
        },
      });
      
      // Process verification with the new ID
      return processNodalVerification(newVerification.id, validated, req, res);
    }
    
    return processNodalVerification(verification.id, validated, req, res);
  })
);

async function processNodalVerification(
  verificationId: string,
  validated: any,
  req: Request,
  res: Response
) {
  const mismatches: string[] = [];
  if (!validated.amountConfirmed) mismatches.push('amount');
  if (!validated.issueDateConfirmed) mismatches.push('issue date');
  if (!validated.maturityDateConfirmed) mismatches.push('maturity date');
  if (!validated.fdrNumberConfirmed) mismatches.push('FDR number');
  if (!validated.jointHoldersConfirmed) mismatches.push('joint holders');
  if (!validated.lienConfirmed) mismatches.push('lien details');
  
  const status = mismatches.length === 0 ? VERIFICATION_STATUS.VERIFIED : VERIFICATION_STATUS.FLAGGED;
  const assuranceLevel = mismatches.length === 0 ? ASSURANCE_LEVELS.HIGH : ASSURANCE_LEVELS.LOW;
  
  await prisma.$transaction(async (tx) => {
    await tx.verificationResult.create({
      data: {
        verificationRequestId: verificationId,
        fdrId: validated.fdrId,
        verifiedBy: req.user!.id,
        verifiedByRole: 'NODAL_OFFICER',
        verifiedAt: new Date(),
        amountMatch: validated.amountConfirmed,
        issueDateMatch: validated.issueDateConfirmed,
        maturityDateMatch: validated.maturityDateConfirmed,
        fdrNumberMatch: validated.fdrNumberConfirmed,
        jointHoldersMatch: validated.jointHoldersConfirmed,
        lienMatch: validated.lienConfirmed,
        confirmations: {
          amountConfirmed: validated.amountConfirmed,
          datesConfirmed: validated.issueDateConfirmed && validated.maturityDateConfirmed,
          jointHoldersConfirmed: validated.jointHoldersConfirmed,
          lienConfirmed: validated.lienConfirmed,
        },
        remarks: validated.remarks,
        rejectionReason: mismatches.length > 0 ? `Mismatches: ${mismatches.join(', ')}` : undefined,
        assuranceLevel,
        ipAddress: req.ip,
        userAgent: req.get('user-agent'),
      },
    });
    
    await tx.verificationRequest.update({
      where: { id: verificationId },
      data: {
        status,
        completedAt: new Date(),
        assuranceLevel,
      },
    });
    
    const newFDRStatus = status === VERIFICATION_STATUS.VERIFIED ? FDR_STATUS.BANK_VERIFIED : FDR_STATUS.BANK_FLAGGED;
    await tx.fDR.update({
      where: { id: validated.fdrId },
      data: {
        status: newFDRStatus,
        bankVerificationId: verificationId,
        bankVerificationResult: {
          amountMatch: validated.amountConfirmed,
          issueDateMatch: validated.issueDateConfirmed,
          maturityDateMatch: validated.maturityDateConfirmed,
          fdrNumberMatch: validated.fdrNumberConfirmed,
          jointHoldersMatch: validated.jointHoldersConfirmed,
          lienMatch: validated.lienConfirmed,
          mismatches,
          assuranceLevel,
        },
      },
    });
    
    await tx.fDRTimelineEntry.create({
      data: {
        fdrId: validated.fdrId,
        status: newFDRStatus,
        actorId: req.user!.id,
        actorRole: 'NODAL_OFFICER',
        actorName: req.user!.name,
        action: status === VERIFICATION_STATUS.VERIFIED ? 'NODAL_VERIFIED' : 'NODAL_FLAGGED',
        description: status === VERIFICATION_STATUS.VERIFIED 
          ? 'FDR verified by nodal officer' 
          : `FDR flagged by nodal officer: ${mismatches.join(', ')}`,
        metadata: { verificationId, mismatches, assuranceLevel },
      },
    });
  });
  
  res.json({
    success: true,
    data: { 
      status,
      assuranceLevel,
      mismatches,
    },
    meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
  });
}

/**
 * GET /api/v1/verification/bank/pending
 * Verifications awaiting action. A bank manager sees only their own bank's
 * requests; a nodal officer sees everything.
 */
router.get('/bank/pending',
  authMiddleware,
  requireRole('NODAL_OFFICER', 'BANK_MANAGER'),
  asyncHandler(async (req: Request, res: Response) => {
    const { branchId, page = 1, limit = 20 } = req.query;
    
    const where: any = {
      channel: { in: [VERIFICATION_CHANNELS.NODAL_OFFICER, VERIFICATION_CHANNELS.SECURE_LINK] },
      status: VERIFICATION_STATUS.PENDING,
    };
    
    if (branchId) where.bankBranchId = branchId;

    if (req.user!.role === 'BANK_MANAGER' && req.user!.bankId) {
      const branches = await prisma.bankBranch.findMany({
        where: { bankId: req.user!.bankId },
        select: { id: true },
      });
      where.bankBranchId = { in: branches.map((b) => b.id) };
    }
    
    const [verifications, total] = await Promise.all([
      prisma.verificationRequest.findMany({
        where,
        orderBy: { sentAt: 'asc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: {
          fdr: {
            include: {
              institution: true,
              documents: true,
            },
          },
          bankBranch: true,
        },
      }),
      prisma.verificationRequest.count({ where }),
    ]);
    
    res.json({
      success: true,
      data: verifications,
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
 * GET /api/v1/verification/bank/history
 * Get verification history for nodal officer
 */
router.get('/bank/history',
  authMiddleware,
  requireRole('NODAL_OFFICER', 'BANK_MANAGER'),
  asyncHandler(async (req: Request, res: Response) => {
    const { branchId, page = 1, limit = 20 } = req.query;
    
    const where: any = {
      channel: { in: [VERIFICATION_CHANNELS.NODAL_OFFICER, VERIFICATION_CHANNELS.SECURE_LINK] },
      status: { in: [VERIFICATION_STATUS.VERIFIED, VERIFICATION_STATUS.FLAGGED] },
    };
    
    if (branchId) where.bankBranchId = branchId;

    if (req.user!.role === 'BANK_MANAGER' && req.user!.bankId) {
      const branches = await prisma.bankBranch.findMany({
        where: { bankId: req.user!.bankId },
        select: { id: true },
      });
      where.bankBranchId = { in: branches.map((b) => b.id) };
    }
    
    const [verifications, total] = await Promise.all([
      prisma.verificationRequest.findMany({
        where,
        orderBy: { completedAt: 'desc' },
        skip: (Number(page) - 1) * Number(limit),
        take: Number(limit),
        include: {
          fdr: {
            select: { id: true, fdrNumber: true, amount: true, institutionId: true },
          },
          result: true,
        },
      }),
      prisma.verificationRequest.count({ where }),
    ]);
    
    res.json({
      success: true,
      data: verifications,
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

export default router;