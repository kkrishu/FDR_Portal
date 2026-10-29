/**
 * Cloudinary Service
 *
 * Streams an in-memory upload straight to Cloudinary, then returns everything
 * the FDR document model needs to record the file. The SHA-256 hash is computed
 * over the original bytes so duplicate detection and audit integrity work
 * independently of the CDN URL.
 */

import { createHash } from 'crypto';
import { Readable } from 'stream';
import { v2 as cloudinary } from 'cloudinary';
import { config } from '../config';
import logger from '../lib/logger';
import { AppError, HttpStatus, ErrorCodes } from '../middleware/errorHandler';

export interface UploadedFile {
  fileUrl: string;
  fileHash: string;
  fileSize: number;
  mimeType: string;
  fileName: string;
  publicId: string;
}

const FOLDER_PREFIX = 'fdr-portal';
const MAX_FILE_SIZE_BYTES = 10 * 1024 * 1024;
const ALLOWED_MIME_TYPES = new Set(['application/pdf', 'image/jpeg', 'image/png']);

function isConfigured(): boolean {
  return Boolean(
    config.CLOUDINARY_CLOUD_NAME && config.CLOUDINARY_API_KEY && config.CLOUDINARY_API_SECRET
  );
}

let configured = false;
function configure() {
  if (configured || !isConfigured()) return;
  cloudinary.config({
    cloud_name: config.CLOUDINARY_CLOUD_NAME,
    api_key: config.CLOUDINARY_API_KEY,
    api_secret: config.CLOUDINARY_API_SECRET,
    secure: true,
  });
  configured = true;
}

class CloudinaryService {
  isAvailable(): boolean {
    return isConfigured();
  }

  /** Reject anything the portal will not accept before a byte is uploaded. */
  validate(buffer: Buffer, mimeType: string, size: number): void {
    if (!buffer?.length) {
      throw new AppError('No file provided', HttpStatus.BAD_REQUEST, ErrorCodes.VALIDATION_ERROR);
    }
    if (size > MAX_FILE_SIZE_BYTES) {
      throw new AppError(
        `File is too large. Maximum size is ${MAX_FILE_SIZE_BYTES / (1024 * 1024)} MB`,
        HttpStatus.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR
      );
    }
    if (!ALLOWED_MIME_TYPES.has(mimeType)) {
      throw new AppError(
        'Unsupported file type. Upload a PDF, JPEG or PNG.',
        HttpStatus.BAD_REQUEST,
        ErrorCodes.VALIDATION_ERROR
      );
    }
  }

  async upload(
    buffer: Buffer,
    options: { fileName: string; mimeType: string; folder?: string }
  ): Promise<UploadedFile> {
    this.validate(buffer, options.mimeType, buffer.byteLength);
    configure();

    const fileHash = createHash('sha256').update(buffer).digest('hex');
    const folder = `${FOLDER_PREFIX}/${options.folder ?? 'documents'}`;

    if (!this.isAvailable()) {
      throw new AppError(
        'File storage is not configured. Set CLOUDINARY_CLOUD_NAME, CLOUDINARY_API_KEY and CLOUDINARY_API_SECRET.',
        HttpStatus.SERVICE_UNAVAILABLE,
        ErrorCodes.INTERNAL_ERROR
      );
    }

    const result = await new Promise<any>((resolve, reject) => {
      const stream = cloudinary.uploader.upload_stream(
        {
          folder,
          resource_type: 'auto',
          // Keep the original bytes so the stored hash can be re-verified later.
          type: 'upload',
          public_id: `${fileHash.slice(0, 24)}-${sanitizeName(options.fileName)}`,
          overwrite: false,
          use_filename: true,
          unique_filename: false,
        },
        (error, uploadResult) => {
          if (error) return reject(error);
          if (!uploadResult) return reject(new Error('Cloudinary returned no result'));
          resolve(uploadResult);
        }
      );

      Readable.from(buffer).pipe(stream);
    }).catch((uploadError: any) => {
      // A storage misconfiguration must read as an operator problem, not a 500
      // the user is told to retry.
      const httpCode = uploadError?.http_code;
      if (httpCode === 401) {
        throw new AppError(
          'File storage rejected the upload (authentication failed). Check the Cloudinary credentials in the server configuration.',
          HttpStatus.SERVICE_UNAVAILABLE,
          ErrorCodes.INTERNAL_ERROR
        );
      }
      if (httpCode === 420 || httpCode === 429) {
        throw new AppError(
          'File storage is rate limiting uploads. Try again in a moment.',
          HttpStatus.TOO_MANY_REQUESTS,
          ErrorCodes.RATE_LIMIT_EXCEEDED
        );
      }
      throw uploadError;
    });

    logger.info(
      { publicId: result.public_id, bytes: buffer.byteLength, mimeType: options.mimeType },
      'File uploaded to Cloudinary'
    );

    return {
      fileUrl: result.secure_url as string,
      fileHash,
      fileSize: buffer.byteLength,
      mimeType: options.mimeType,
      fileName: options.fileName,
      publicId: result.public_id as string,
    };
  }

  /** Remove an uploaded asset. Used when a draft is discarded. */
  async destroy(publicId: string): Promise<void> {
    if (!this.isAvailable()) return;
    configure();
    try {
      await cloudinary.uploader.destroy(publicId);
    } catch (error) {
      logger.warn({ err: error, publicId }, 'Failed to delete Cloudinary asset');
    }
  }
}

function sanitizeName(name: string): string {
  return name
    .replace(/\.[^.]+$/, '')
    .replace(/[^a-zA-Z0-9-_]+/g, '-')
    .slice(0, 60)
    .toLowerCase();
}

export const cloudinaryService = new CloudinaryService();
