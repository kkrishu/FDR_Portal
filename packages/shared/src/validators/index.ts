/**
 * Shared Validation Schemas using Zod
 * Used by both backend and frontend for consistent validation
 */

import { z } from 'zod';
import type {
  UserRole,
  UserStatus,
  FDRStatus,
  FDRFlagCategory,
  FDRFlagSeverity,
  VerificationChannel,
  AssuranceLevel,
  ReleaseStatus,
  NotificationChannel,
  NotificationType,
  ErrorCode,
} from '../types';

// DocumentType enum for Zod
const DocumentTypeEnum = {
  FDR_CERTIFICATE: 'FDR_CERTIFICATE',
  BOARD_RESOLUTION: 'BOARD_RESOLUTION',
  LIEN_LETTER: 'LIEN_LETTER',
  OTHER: 'OTHER',
} as const;

type DocumentType = typeof DocumentTypeEnum[keyof typeof DocumentTypeEnum];

// ============================================
// Primitive Validators
// ============================================

export const emailSchema = z.string().email('Invalid email format').toLowerCase().trim();

export const passwordSchema = z
  .string()
  .min(8, 'Password must be at least 8 characters')
  .max(128, 'Password too long')
  .regex(/[A-Z]/, 'Password must contain at least one uppercase letter')
  .regex(/[a-z]/, 'Password must contain at least one lowercase letter')
  .regex(/[0-9]/, 'Password must contain at least one number')
  .regex(/[^A-Za-z0-9]/, 'Password must contain at least one special character');

export const panSchema = z
  .string()
  .regex(/^[A-Z]{5}[0-9]{4}[A-Z]{1}$/, 'Invalid PAN format (e.g., ABCDE1234F)')
  .toUpperCase()
  .trim();

export const aadhaarSchema = z
  .string()
  .regex(/^\d{12}$/, 'Aadhaar must be 12 digits')
  .trim();

export const ifscSchema = z
  .string()
  .regex(/^[A-Z]{4}0[A-Z0-9]{6}$/, 'Invalid IFSC format (e.g., SBIN0001234)')
  .toUpperCase()
  .trim();

export const phoneSchema = z
  .string()
  .regex(
    /^(?:\+?91[\s-]?)?[\(]?[0-9]{3,5}[\)]?[\s\.-]?[0-9]{3,8}[\s\.-]?[0-9]{0,6}$/,
    'Enter a valid phone number, e.g. +91 94104 88552'
  )
  .trim();

export const pincodeSchema = z
  .string()
  .regex(/^\d{6}$/, 'Pincode must be 6 digits')
  .trim();

export const fdrNumberSchema = z
  .string()
  .min(1, 'FDR number is required')
  .max(50, 'FDR number too long')
  .trim();

export const positiveNumberSchema = z.number().positive('Must be a positive number');

export const nonNegativeNumberSchema = z.number().nonnegative('Must be non-negative');

export const percentageSchema = z.number().min(0, 'Percentage cannot be negative').max(100, 'Percentage cannot exceed 100');

export const dateStringSchema = z.string().datetime({ offset: true }).or(z.date());

export const objectIdSchema = z.string().regex(/^[0-9a-fA-F]{24}$/, 'Invalid ID format');

// ============================================
// User Validators
// ============================================

// Enum objects for Zod nativeEnum
const UserRoleEnum = {
  INSTITUTION: 'INSTITUTION',
  OFFICER: 'OFFICER',
  ADMIN: 'ADMIN',
  BANK_MANAGER: 'BANK_MANAGER',
  NODAL_OFFICER: 'NODAL_OFFICER',
  AUDITOR: 'AUDITOR',
} as const;

const UserStatusEnum = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  PENDING: 'PENDING',
  SUSPENDED: 'SUSPENDED',
} as const;

const FDRStatusEnum = {
  DRAFT: 'DRAFT',
  SUBMITTED: 'SUBMITTED',
  AWAITING_BANK_VERIFICATION: 'AWAITING_BANK_VERIFICATION',
  BANK_VERIFIED: 'BANK_VERIFIED',
  BANK_FLAGGED: 'BANK_FLAGGED',
  UNDER_REVIEW: 'UNDER_REVIEW',
  VERIFIED: 'VERIFIED',
  FLAGGED: 'FLAGGED',
  MANUAL_VERIFIED: 'MANUAL_VERIFIED',
  EXPIRED: 'EXPIRED',
  RENEWAL_PENDING: 'RENEWAL_PENDING',
  RENEWED: 'RENEWED',
  RELEASE_REQUESTED: 'RELEASE_REQUESTED',
  RELEASE_RECOMMENDED: 'RELEASE_RECOMMENDED',
  RELEASE_APPROVED: 'RELEASE_APPROVED',
  RELEASE_REJECTED: 'RELEASE_REJECTED',
  RELEASED: 'RELEASED',
} as const;

const FDRFlagCategoryEnum = {
  AMOUNT_MISMATCH: 'AMOUNT_MISMATCH',
  DATE_MISMATCH: 'DATE_MISMATCH',
  FDR_NUMBER_MISMATCH: 'FDR_NUMBER_MISMATCH',
  DUPLICATE_FDR: 'DUPLICATE_FDR',
  EXPIRED_FDR: 'EXPIRED_FDR',
  INVALID_JOINT_HOLDER: 'INVALID_JOINT_HOLDER',
  MISSING_DOCUMENTS: 'MISSING_DOCUMENTS',
  LIEN_MISMATCH: 'LIEN_MISMATCH',
  SUSPICIOUS_PATTERN: 'SUSPICIOUS_PATTERN',
} as const;

const FDRFlagSeverityEnum = {
  BLOCK: 'BLOCK',
  WARNING: 'WARNING',
  INFO: 'INFO',
} as const;

const VerificationChannelEnum = {
  SECURE_LINK: 'SECURE_LINK',
  NODAL_OFFICER: 'NODAL_OFFICER',
  MANUAL: 'MANUAL',
  API_CONNECTOR: 'API_CONNECTOR',
} as const;

const AssuranceLevelEnum = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
} as const;

const ReleaseStatusEnum = {
  REQUESTED: 'REQUESTED',
  CHECKLIST_PENDING: 'CHECKLIST_PENDING',
  RECOMMENDED: 'RECOMMENDED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  RELEASED: 'RELEASED',
} as const;

const NotificationChannelEnum = {
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  IN_APP: 'IN_APP',
  WEBHOOK: 'WEBHOOK',
} as const;

const NotificationTypeEnum = {
  FDR_SUBMITTED: 'FDR_SUBMITTED',
  FDR_VERIFIED: 'FDR_VERIFIED',
  FDR_FLAGGED: 'FDR_FLAGGED',
  FDR_EXPIRING: 'FDR_EXPIRING',
  FDR_EXPIRED: 'FDR_EXPIRED',
  FDR_RENEWAL_REMINDER: 'FDR_RENEWAL_REMINDER',
  BANK_VERIFICATION_REQUESTED: 'BANK_VERIFICATION_REQUESTED',
  BANK_VERIFICATION_REMINDER: 'BANK_VERIFICATION_REMINDER',
  BANK_VERIFICATION_COMPLETED: 'BANK_VERIFICATION_COMPLETED',
  BANK_VERIFICATION_ESCALATED: 'BANK_VERIFICATION_ESCALATED',
  RELEASE_REQUESTED: 'RELEASE_REQUESTED',
  RELEASE_RECOMMENDED: 'RELEASE_RECOMMENDED',
  RELEASE_APPROVED: 'RELEASE_APPROVED',
  RELEASE_REJECTED: 'RELEASE_REJECTED',
  RELEASE_COMPLETED: 'RELEASE_COMPLETED',
  DOCUMENT_REQUESTED: 'DOCUMENT_REQUESTED',
  SCRUTINY_REMARKS: 'SCRUTINY_REMARKS',
  MANUAL_VERIFICATION_REQUIRED: 'MANUAL_VERIFICATION_REQUIRED',
  SECOND_OFFICER_REQUIRED: 'SECOND_OFFICER_REQUIRED',
  SYSTEM_ALERT: 'SYSTEM_ALERT',
} as const;

export const userRoleSchema = z.nativeEnum(UserRoleEnum);

export const userStatusSchema = z.nativeEnum(UserStatusEnum);

export const createUserSchema = z.object({
  email: emailSchema,
  name: z.string().min(1, 'Name is required').max(100, 'Name too long').trim(),
  password: passwordSchema,
  role: userRoleSchema,
  institutionId: objectIdSchema.optional(),
  bankId: objectIdSchema.optional(),
});

/**
 * Self-service sign-up. ADMIN is deliberately absent: administrator accounts
 * can only be created by an existing admin from the Users page. This is enforced
 * here rather than only in the UI, because a hidden field is not a control.
 */
const SelfRegisterRoleEnum = {
  INSTITUTION: 'INSTITUTION',
  OFFICER: 'OFFICER',
  BANK_MANAGER: 'BANK_MANAGER',
  NODAL_OFFICER: 'NODAL_OFFICER',
  AUDITOR: 'AUDITOR',
} as const;

export const selfRegisterRoleSchema = z.nativeEnum(SelfRegisterRoleEnum);

export const updateUserSchema = z.object({
  name: z.string().min(1).max(100).trim().optional(),
  status: userStatusSchema.optional(),
  institutionId: objectIdSchema.optional(),
  bankId: objectIdSchema.optional(),
  mfaEnabled: z.boolean().optional(),
});

/** Fields a user may change on their own account, without admin rights. */
export const updateOwnAccountSchema = z.object({
  name: z.string().min(2, 'Name must be at least 2 characters').max(100).trim().optional(),
  avatarUrl: z.string().url('Invalid avatar URL').max(500).optional().or(z.literal('')),
});

/**
 * Public sign-up, with the details each role actually needs:
 *  - INSTITUTION names its organisation (the server provisions the record), and
 *    may prefill city/state/phone so the profile is not a stub.
 *  - BANK_MANAGER and NODAL_OFFICER must say which bank they belong to; the id
 *    must exist in the admin-managed directory and becomes their data scope.
 */
export const selfRegisterSchema = createUserSchema.extend({
  role: selfRegisterRoleSchema,
  institutionName: z.string().min(2, 'Institution name is required').max(200).trim().optional(),
  institutionCity: z.string().max(100).trim().optional(),
  institutionState: z.string().max(100).trim().optional(),
  institutionPhone: z.string().max(20).trim().optional(),
}).refine(
  (data) => data.role !== 'INSTITUTION' || Boolean(data.institutionName),
  { message: 'Institution name is required for institution accounts', path: ['institutionName'] }
).refine(
  (data) =>
    !['BANK_MANAGER', 'NODAL_OFFICER'].includes(data.role) || Boolean(data.bankId),
  { message: 'Select the bank you belong to', path: ['bankId'] }
);

export const loginSchema = z.object({
  email: emailSchema,
  password: z.string().min(1, 'Password is required'),
  // Forms submit an empty string when the field is untouched, so an empty
  // value must be treated as "not supplied" rather than as an invalid code.
  mfaCode: z
    .string()
    .regex(/^\d{6}$/, 'MFA code must be 6 digits')
    .optional()
    .or(z.literal(''))
    .transform((value) => (value ? value : undefined)),
});

export const refreshTokenSchema = z.object({
  refreshToken: z.string().min(1, 'Refresh token is required'),
});

export const mfaSetupSchema = z.object({
  secret: z.string().min(1),
  token: z.string().regex(/^\d{6}$/, 'MFA code must be 6 digits'),
});

export const mfaVerifySchema = z.object({
  token: z.string().regex(/^\d{6}$/, 'MFA code must be 6 digits'),
});

// ============================================
// Institution Validators
// ============================================

export const createInstitutionSchema = z.object({
  name: z.string().min(1, 'Institution name is required').max(200).trim(),
  code: z.string().min(1, 'AICTE code is required').max(20).trim().toUpperCase(),
  address: z.string().min(1, 'Address is required').max(500).trim(),
  city: z.string().min(1, 'City is required').max(100).trim(),
  state: z.string().min(1, 'State is required').max(100).trim(),
  pincode: pincodeSchema,
  phone: phoneSchema,
  email: emailSchema,
  website: z.string().url('Invalid URL').optional().or(z.literal('')),
  nodalOfficerId: objectIdSchema.optional(),
  contactPerson: z.string().max(100).trim().optional(),
  contactPhone: phoneSchema.optional(),
  contactEmail: emailSchema.optional(),
});

/**
 * Profile update. The edit form always sends every field, so an empty string
 * means "cleared / not provided" rather than invalid input: blanks are
 * normalised away and optional-format fields accept being absent.
 */
export const updateInstitutionSchema = createInstitutionSchema
  .partial()
  .extend({
    phone: phoneSchema.optional().or(z.literal('')),
    contactPhone: phoneSchema.optional().or(z.literal('')),
    contactEmail: emailSchema.optional().or(z.literal('')),
    website: z.string().url('Invalid URL').optional().or(z.literal('')),
  })
  .transform((data) =>
    Object.fromEntries(
      Object.entries(data).filter(([, value]) => value !== '' && value !== undefined)
    )
  );

// ============================================
// Bank Directory Validators
// ============================================

export const createBankDirectorySchema = z.object({
  ifscCode: ifscSchema,
  bankName: z.string().min(1).max(200).trim(),
  branchName: z.string().min(1).max(200).trim(),
  address: z.string().min(1).max(500).trim(),
  city: z.string().min(1).max(100).trim(),
  district: z.string().max(100).trim().optional(),
  state: z.string().min(1).max(100).trim(),
  pincode: pincodeSchema,
  contactPhone: phoneSchema.optional(),
  contactEmail: emailSchema.optional(),
  contactPerson: z.string().max(100).trim().optional(),
  contactDesignation: z.string().max(100).trim().optional(),
});

export const updateBankDirectorySchema = createBankDirectorySchema.partial().extend({
  isVerified: z.boolean().optional(),
  verifiedAt: z.date().optional(),
  verificationExpiry: z.date().optional(),
});

// ============================================
// FDR Validators
// ============================================

export const fdrStatusSchema = z.nativeEnum(FDRStatusEnum);

export const fdrFlagCategorySchema = z.nativeEnum(FDRFlagCategoryEnum);

export const fdrFlagSeveritySchema = z.nativeEnum(FDRFlagSeverityEnum);

export const fdrFlagSchema = z.object({
  category: fdrFlagCategorySchema,
  severity: fdrFlagSeveritySchema,
  message: z.string().min(1).max(500),
  details: z.record(z.unknown()).optional(),
  isAutoGenerated: z.boolean(),
});

export const jointHolderSchema = z.object({
  name: z.string().min(1, 'Joint holder name is required').max(100).trim(),
  pan: panSchema,
  isAICTE: z.boolean(),
  percentage: percentageSchema,
});

export const lienDetailsSchema = z.object({
  lienHolderName: z.string().min(1).max(200).trim(),
  lienHolderPAN: panSchema,
  lienAmount: positiveNumberSchema,
  lienStartDate: dateStringSchema,
  lienEndDate: dateStringSchema.optional(),
  lienDocumentId: objectIdSchema.optional(),
});

export const documentSchema = z.object({
  type: z.nativeEnum(DocumentTypeEnum),
  fileName: z.string().min(1).max(255),
  fileUrl: z.string().url('Invalid file URL'),
  fileSize: positiveNumberSchema,
  mimeType: z.string().min(1),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/, 'Invalid file hash (SHA-256)'),
  // Stamped by the server from the session, never accepted from the client.
  uploadedBy: objectIdSchema.optional(),
  version: z.number().int().positive().optional(),
  ocrData: z.object({
    extractedText: z.string(),
    confidence: z.number().min(0).max(1),
    fields: z.object({
      amount: z.object({ value: z.string(), confidence: z.number().min(0).max(1) }).optional(),
      issueDate: z.object({ value: z.string(), confidence: z.number().min(0).max(1) }).optional(),
      maturityDate: z.object({ value: z.string(), confidence: z.number().min(0).max(1) }).optional(),
      fdrNumber: z.object({ value: z.string(), confidence: z.number().min(0).max(1) }).optional(),
      bankName: z.object({ value: z.string(), confidence: z.number().min(0).max(1) }).optional(),
      branchName: z.object({ value: z.string(), confidence: z.number().min(0).max(1) }).optional(),
    }).optional(),
  }).optional(),
});

export const createFDRSchema = z.object({
  institutionId: objectIdSchema,
  fdrNumber: fdrNumberSchema,
  bankId: objectIdSchema,
  bankName: z.string().min(1).max(200).trim(),
  branchName: z.string().min(1).max(200).trim(),
  ifscCode: ifscSchema,
  amount: positiveNumberSchema,
  issueDate: dateStringSchema,
  maturityDate: dateStringSchema,
  interestRate: z.number().min(0).max(100).optional(),
  jointHolders: z.array(jointHolderSchema).min(1, 'At least one joint holder required').max(10),
  lienDetails: lienDetailsSchema.optional(),
  documents: z.array(documentSchema).min(1, 'At least one document required').max(20),
}).refine(
  data => data.maturityDate > data.issueDate,
  { message: 'Maturity date must be after issue date', path: ['maturityDate'] }
).refine(
  data => data.jointHolders.some(h => h.isAICTE),
  { message: 'At least one joint holder must be AICTE', path: ['jointHolders'] }
).refine(
  data => data.jointHolders.reduce((sum, h) => sum + h.percentage, 0) === 100,
  { message: 'Joint holder percentages must sum to 100', path: ['jointHolders'] }
);

export const updateFDRSchema = z.object({
  // The id comes from the URL for PATCH /fdrs/:id; requiring it in the body
  // forced every client to duplicate it.
  id: objectIdSchema.optional(),
  institutionId: objectIdSchema.optional(),
  fdrNumber: fdrNumberSchema.optional(),
  bankId: objectIdSchema.optional(),
  bankName: z.string().min(1).max(200).trim().optional(),
  branchName: z.string().min(1).max(200).trim().optional(),
  ifscCode: ifscSchema.optional(),
  amount: positiveNumberSchema.optional(),
  issueDate: dateStringSchema.optional(),
  maturityDate: dateStringSchema.optional(),
  interestRate: z.number().min(0).max(100).optional(),
  jointHolders: z.array(jointHolderSchema).min(1).max(10).optional(),
  lienDetails: lienDetailsSchema.optional(),
  documents: z.array(documentSchema).min(1).max(20).optional(),
  status: fdrStatusSchema.optional(),
  riskScore: z.number().min(0).max(100).optional(),
  flags: z.array(fdrFlagSchema).optional(),
}).refine(
  data => !data.maturityDate || !data.issueDate || (data.maturityDate as Date) > (data.issueDate as Date),
  { message: 'Maturity date must be after issue date', path: ['maturityDate'] }
).refine(
  data => !data.jointHolders || data.jointHolders.some((h: any) => h.isAICTE),
  { message: 'At least one joint holder must be AICTE', path: ['jointHolders'] }
).refine(
  data => !data.jointHolders || data.jointHolders.reduce((sum: number, h: any) => sum + (h.percentage || 0), 0) === 100,
  { message: 'Joint holder percentages must sum to 100', path: ['jointHolders'] }
);

/**
 * Query strings arrive as text, so every non-string field below has to be
 * coerced before validation. Without this, `GET /fdrs?page=1` fails with
 * "Expected number, received string" and the list endpoint is unusable.
 */
const queryArray = <T extends z.ZodTypeAny>(item: T) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (Array.isArray(value)) return value.flatMap((v) => (typeof v === 'string' ? v.split(',') : [v]));
    if (typeof value === 'string') return value.split(',');
    return [value];
  }, z.array(item).optional());

const queryBoolean = z.preprocess((value) => {
  if (value === undefined || value === null || value === '') return undefined;
  if (typeof value === 'boolean') return value;
  if (typeof value === 'string') return ['true', '1', 'yes'].includes(value.toLowerCase());
  return value;
}, z.boolean().optional());

const queryNumber = (schema: z.ZodNumber) =>
  z.preprocess((value) => {
    if (value === undefined || value === null || value === '') return undefined;
    if (typeof value === 'number') return value;
    const parsed = Number(value);
    return Number.isNaN(parsed) ? value : parsed;
  }, schema.optional());

export const fdrSearchFiltersSchema = z.object({
  query: z.string().trim().optional(),
  institutionId: objectIdSchema.optional(),
  bankId: objectIdSchema.optional(),
  status: queryArray(fdrStatusSchema),
  flagged: queryBoolean,
  dateFrom: dateStringSchema.optional(),
  dateTo: dateStringSchema.optional(),
  amountMin: queryNumber(z.number().nonnegative()),
  amountMax: queryNumber(z.number().positive()),
  expiryFrom: dateStringSchema.optional(),
  expiryTo: dateStringSchema.optional(),
  assuranceLevel: queryArray(z.nativeEnum(AssuranceLevelEnum)),
  page: z.coerce.number().int().positive().default(1),
  limit: z.coerce.number().int().positive().max(100).default(20),
  sortBy: z.string().trim().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// ============================================
// Bank Verification Validators
// ============================================

export const verificationChannelSchema = z.nativeEnum(VerificationChannelEnum);

export const assuranceLevelSchema = z.nativeEnum(AssuranceLevelEnum);

export const createVerificationRequestSchema = z.object({
  fdrId: objectIdSchema,
  channel: verificationChannelSchema,
  sentToEmail: emailSchema,
  tokenExpiryHours: z.number().int().positive().default(48),
});

export const otpRequestSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
});

export const otpVerifySchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
  otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
});

export const bankVerificationSubmitSchema = z.object({
  token: z.string().min(1, 'Verification token is required'),
  otp: z.string().regex(/^\d{6}$/, 'OTP must be 6 digits'),
  amountConfirmed: z.boolean(),
  issueDateConfirmed: z.boolean(),
  maturityDateConfirmed: z.boolean(),
  fdrNumberConfirmed: z.boolean(),
  jointHoldersConfirmed: z.boolean(),
  lienConfirmed: z.boolean(),
  remarks: z.string().max(1000).optional(),
});

export const nodalVerificationSubmitSchema = z.object({
  fdrId: objectIdSchema,
  amountConfirmed: z.boolean(),
  issueDateConfirmed: z.boolean(),
  maturityDateConfirmed: z.boolean(),
  fdrNumberConfirmed: z.boolean(),
  jointHoldersConfirmed: z.boolean(),
  lienConfirmed: z.boolean(),
  remarks: z.string().max(1000).optional(),
});

// ============================================
// Officer Action Validators
// ============================================

export const verifyFDRSchema = z.object({
  // The FDR is identified by the URL for /officer/fdrs/:id/verify; the body
  // field is tolerated but not required.
  fdrId: objectIdSchema.optional(),
  remarks: z.string().max(1000).optional(),
});

export const flagFDRSchema = z.object({
  fdrId: objectIdSchema.optional(),
  category: fdrFlagCategorySchema,
  severity: fdrFlagSeveritySchema,
  message: z.string().min(1, 'Flag message is required').max(500),
  details: z.record(z.unknown()).optional(),
});

export const addRemarksSchema = z.object({
  fdrId: objectIdSchema.optional(),
  content: z.string().min(1, 'Remarks content is required').max(5000),
  isInternal: z.boolean(),
});

export const requestDocumentsSchema = z.object({
  fdrId: objectIdSchema.optional(),
  documentTypes: z.array(z.nativeEnum(DocumentTypeEnum)).min(1),
  dueDate: dateStringSchema,
  message: z.string().max(1000).optional(),
});

export const manualVerifySchema = z.object({
  fdrId: objectIdSchema.optional(),
  reason: z.string().min(1, 'Reason is required').max(1000),
  evidenceDocumentIds: z.array(objectIdSchema).min(1, 'At least one evidence document required'),
});

// ============================================
// Release Request Validators
// ============================================

export const releaseStatusSchema = z.nativeEnum(ReleaseStatusEnum);

export const createReleaseRequestSchema = z.object({
  fdrId: objectIdSchema,
  reason: z.string().min(1, 'Reason is required').max(1000),
  documents: z.array(documentSchema).optional(),
});

export const recommendReleaseSchema = z.object({
  releaseRequestId: objectIdSchema.optional(),
  checklist: z.array(z.object({
    id: z.string(),
    status: z.enum(['PASS', 'FAIL', 'PENDING', 'MANUAL_OVERRIDE']),
    checkedAt: z.date().optional(),
  })).min(1),
  recommendationRemarks: z.string().max(1000).optional(),
});

export const approveReleaseSchema = z.object({
  releaseRequestId: objectIdSchema.optional(),
  approvalRemarks: z.string().max(1000).optional(),
});

export const rejectReleaseSchema = z.object({
  releaseRequestId: objectIdSchema.optional(),
  rejectionReason: z.string().min(1, 'Rejection reason is required').max(1000),
});

// ============================================
// Notification Validators
// ============================================

export const notificationChannelSchema = z.nativeEnum(NotificationChannelEnum);

export const notificationTypeSchema = z.nativeEnum(NotificationTypeEnum);

export const createNotificationSchema = z.object({
  userId: objectIdSchema,
  type: notificationTypeSchema,
  title: z.string().min(1).max(200),
  message: z.string().min(1).max(2000),
  channels: z.array(notificationChannelSchema).min(1),
  metadata: z.record(z.unknown()).optional(),
});

// ============================================
// Rules Configuration Validators
// ============================================

export const rulesConfigSchema = z.object({
  bankReminderDays: z.array(z.number().int().positive()).default([1, 2]),
  bankNoReplyEscalationHours: z.number().int().positive().default(72),
  bankAdminEscalationDays: z.number().int().positive().default(5),
  maturityReminderDays: z.array(z.number().int().positive()).default([60, 30, 15, 7, 1]),
  overdueRenewalEscalationDays: z.number().int().positive().default(1),
  releaseSLAHours: z.number().int().positive().default(72),
  releaseStageSLAHours: z.record(z.number().int().positive()).default({
    requested_to_recommended: 24,
    recommended_to_approved: 24,
    approved_to_released: 24,
  }),
  otpExpiryMinutes: z.number().int().positive().default(10),
  otpMaxAttempts: z.number().int().positive().default(5),
  verificationTokenExpiryHours: z.number().int().positive().default(48),
  requiredDocuments: z.object({
    fdrCertificate: z.boolean().default(true),
    boardResolution: z.boolean().default(true),
    lienLetter: z.boolean().default(true),
  }),
  releaseConditions: z.object({
    requireBankVerified: z.boolean().default(true),
    requireLienConfirmed: z.boolean().default(true),
    requireNoOpenFlags: z.boolean().default(true),
    requireAllDocuments: z.boolean().default(true),
  }),
  maxFileSizeMB: z.number().int().positive().default(10),
  allowedMimeTypes: z.array(z.string()).default(['application/pdf', 'image/jpeg', 'image/png']),
  rateLimitMax: z.number().int().positive().default(100),
  rateLimitWindowMinutes: z.number().int().positive().default(1),
  featureMFAEnabled: z.boolean().default(true),
  featureSSOEnabled: z.boolean().default(false),
  featureWebhooksEnabled: z.boolean().default(true),
  featureAPIConnectorEnabled: z.boolean().default(true),
});

// ============================================
// Audit Log Validators
// ============================================

export const auditLogSchema = z.object({
  actorId: objectIdSchema,
  actorRole: userRoleSchema,
  actorName: z.string().min(1).max(200),
  action: z.string().min(1).max(100),
  entityType: z.string().min(1).max(100),
  entityId: objectIdSchema,
  before: z.record(z.unknown()).optional(),
  after: z.record(z.unknown()).optional(),
  ipAddress: z.string().optional(),
  userAgent: z.string().optional(),
});

// ============================================
// Webhook Validators
// ============================================

export const createWebhookSchema = z.object({
  name: z.string().min(1).max(100).trim(),
  url: z.string().url('Invalid webhook URL'),
  events: z.array(notificationTypeSchema).min(1, 'At least one event required'),
});

export const updateWebhookSchema = createWebhookSchema.partial().extend({
  isActive: z.boolean().optional(),
});

// ============================================
// API Key Validators
// ============================================

export const createAPIKeySchema = z.object({
  name: z.string().min(1).max(100).trim(),
  scopes: z.array(z.string()).min(1, 'At least one scope required'),
  expiresAt: dateStringSchema.optional(),
});

// ============================================
// File Upload Validators
// ============================================

export const fileUploadSchema = z.object({
  fileName: z.string().min(1).max(255),
  mimeType: z.string().min(1),
  fileSize: z.number().int().positive(),
  fileHash: z.string().regex(/^[a-f0-9]{64}$/),
});

export const fileUploadResponseSchema = z.object({
  fileId: objectIdSchema,
  fileUrl: z.string().url(),
  fileName: z.string(),
  mimeType: z.string(),
  fileSize: z.number(),
  fileHash: z.string(),
});

// ============================================
// Pagination Validators
// ============================================

export const paginationSchema = z.object({
  page: z.number().int().positive().default(1),
  limit: z.number().int().positive().max(100).default(20),
  sortBy: z.string().optional(),
  sortOrder: z.enum(['asc', 'desc']).optional(),
});

// ============================================
// Type Exports
// ============================================

export type CreateUserInput = z.infer<typeof createUserSchema>;
export type SelfRegisterInput = z.infer<typeof selfRegisterSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type LoginInput = z.infer<typeof loginSchema>;
export type CreateInstitutionInput = z.infer<typeof createInstitutionSchema>;
export type UpdateInstitutionInput = z.infer<typeof updateInstitutionSchema>;
export type CreateBankDirectoryInput = z.infer<typeof createBankDirectorySchema>;
export type CreateFDRInput = z.infer<typeof createFDRSchema>;
export type UpdateFDRInput = z.infer<typeof updateFDRSchema>;
export type FDRSearchFilters = z.infer<typeof fdrSearchFiltersSchema>;
export type CreateVerificationRequestInput = z.infer<typeof createVerificationRequestSchema>;
export type OTPRequestInput = z.infer<typeof otpRequestSchema>;
export type OTPVerifyInput = z.infer<typeof otpVerifySchema>;
export type BankVerificationSubmitInput = z.infer<typeof bankVerificationSubmitSchema>;
export type NodalVerificationSubmitInput = z.infer<typeof nodalVerificationSubmitSchema>;
export type VerifyFDRInput = z.infer<typeof verifyFDRSchema>;
export type FlagFDRInput = z.infer<typeof flagFDRSchema>;
export type AddRemarksInput = z.infer<typeof addRemarksSchema>;
export type RequestDocumentsInput = z.infer<typeof requestDocumentsSchema>;
export type ManualVerifyInput = z.infer<typeof manualVerifySchema>;
export type CreateReleaseRequestInput = z.infer<typeof createReleaseRequestSchema>;
export type RecommendReleaseInput = z.infer<typeof recommendReleaseSchema>;
export type ApproveReleaseInput = z.infer<typeof approveReleaseSchema>;
export type RejectReleaseInput = z.infer<typeof rejectReleaseSchema>;
export type CreateNotificationInput = z.infer<typeof createNotificationSchema>;
export type RulesConfig = z.infer<typeof rulesConfigSchema>;
export type CreateWebhookInput = z.infer<typeof createWebhookSchema>;
export type UpdateWebhookInput = z.infer<typeof updateWebhookSchema>;
export type CreateAPIKeyInput = z.infer<typeof createAPIKeySchema>;
export type FileUploadInput = z.infer<typeof fileUploadSchema>;
export type PaginationInput = z.infer<typeof paginationSchema>;