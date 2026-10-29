/**
 * Upload Routes
 *
 * Authenticated multipart upload used by the FDR submission wizard and by
 * release-request evidence. Validation (size, type) happens in the Cloudinary
 * service so the API and any future direct-upload path share one rule set.
 */

import { Router, Request, Response } from 'express';
import multer from 'multer';
import { authMiddleware } from '../middleware/auth';
import { asyncHandler } from '../middleware/errorHandler';
import { AppError, HttpStatus, ErrorCodes } from '../middleware/errorHandler';
import { cloudinaryService } from '../services/cloudinaryService';
import { auditService } from '../services/auditService';

const router: Router = Router();

// Files are held in memory only long enough to hash and stream them upstream.
// The 11 MB ceiling leaves room for multipart overhead above the 10 MB limit
// enforced in the service, so users get a clear message rather than a silent cut.
const upload = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 11 * 1024 * 1024, files: 1 },
});

router.use(authMiddleware);

/**
 * POST /api/v1/uploads
 * Upload a single document and return its storage metadata.
 */
router.post(
  '/',
  upload.single('file'),
  asyncHandler(async (req: Request, res: Response) => {
    if (!req.file) {
      throw new AppError('No file provided', HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_ERROR);
    }

    const folder =
      typeof req.body?.folder === 'string' && /^[a-z0-9-]{1,32}$/.test(req.body.folder)
        ? req.body.folder
        : 'documents';

    const uploaded = await cloudinaryService.upload(req.file.buffer, {
      fileName: req.file.originalname,
      mimeType: req.file.mimetype,
      folder,
    });

    // entityId is a Mongo ObjectId column, and the upload has no record of its
    // own yet — the actor is the stable reference, and the file hash travels in
    // the payload so the audit row still identifies the exact bytes stored.
    await auditService.recordForRequest(req, {
      action: 'FILE_UPLOADED',
      entityType: 'Upload',
      entityId: req.user!.id,
      after: {
        fileName: uploaded.fileName,
        fileHash: uploaded.fileHash,
        fileUrl: uploaded.fileUrl,
        fileSize: uploaded.fileSize,
        mimeType: uploaded.mimeType,
      },
    });

    res.status(HttpStatus.CREATED).json({
      success: true,
      data: uploaded,
      meta: { timestamp: new Date().toISOString(), requestId: req.correlationId! },
    });
  })
);

/**
 * GET /api/v1/uploads/status
 * Report whether file storage is configured, so the UI can warn before a user
 * spends time filling in a submission form.
 */
router.get(
  '/status',
  asyncHandler(async (_req: Request, res: Response) => {
    res.json({
      success: true,
      data: { configured: cloudinaryService.isAvailable() },
      meta: { timestamp: new Date().toISOString(), requestId: _req.correlationId! },
    });
  })
);

export default router;
