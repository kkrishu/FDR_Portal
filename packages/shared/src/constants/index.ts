/**
 * Shared Constants for FDR Portal
 */

export const APP_CONSTANTS = {
  NAME: 'FDR Portal',
  VERSION: '1.0.0',
  DESCRIPTION: 'Security Deposit/FDR Management System for AICTE',
} as const;

export const API_CONSTANTS = {
  VERSION: 'v1',
  PREFIX: '/api/v1',
  HEALTH_ENDPOINT: '/health',
  DOCS_ENDPOINT: '/api-docs',
} as const;

export const ROLES = {
  INSTITUTION: 'INSTITUTION',
  OFFICER: 'OFFICER',
  ADMIN: 'ADMIN',
  BANK_MANAGER: 'BANK_MANAGER',
  NODAL_OFFICER: 'NODAL_OFFICER',
  AUDITOR: 'AUDITOR',
} as const;

export type UserRole = typeof ROLES[keyof typeof ROLES];

export const USER_STATUS = {
  ACTIVE: 'ACTIVE',
  INACTIVE: 'INACTIVE',
  PENDING: 'PENDING',
  SUSPENDED: 'SUSPENDED',
} as const;

export const FDR_STATUS = {
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

export type FDRStatus = typeof FDR_STATUS[keyof typeof FDR_STATUS];

export const FDR_FLAG_CATEGORIES = {
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

export const FDR_FLAG_SEVERITY = {
  BLOCK: 'BLOCK',
  WARNING: 'WARNING',
  INFO: 'INFO',
} as const;

export const VERIFICATION_CHANNELS = {
  SECURE_LINK: 'SECURE_LINK',
  NODAL_OFFICER: 'NODAL_OFFICER',
  MANUAL: 'MANUAL',
  API_CONNECTOR: 'API_CONNECTOR',
} as const;

export const VERIFICATION_STATUS = {
  PENDING: 'PENDING',
  VERIFIED: 'VERIFIED',
  FLAGGED: 'FLAGGED',
  EXPIRED: 'EXPIRED',
  REVOKED: 'REVOKED',
} as const;

export const ASSURANCE_LEVELS = {
  HIGH: 'HIGH',
  MEDIUM: 'MEDIUM',
  LOW: 'LOW',
} as const;

export const RELEASE_STATUS = {
  REQUESTED: 'REQUESTED',
  CHECKLIST_PENDING: 'CHECKLIST_PENDING',
  RECOMMENDED: 'RECOMMENDED',
  APPROVED: 'APPROVED',
  REJECTED: 'REJECTED',
  RELEASED: 'RELEASED',
} as const;

export const NOTIFICATION_CHANNELS = {
  EMAIL: 'EMAIL',
  SMS: 'SMS',
  IN_APP: 'IN_APP',
  WEBHOOK: 'WEBHOOK',
} as const;

export const NOTIFICATION_TYPES = {
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

export const DOCUMENT_TYPES = {
  FDR_CERTIFICATE: 'FDR_CERTIFICATE',
  BOARD_RESOLUTION: 'BOARD_RESOLUTION',
  LIEN_LETTER: 'LIEN_LETTER',
  OTHER: 'OTHER',
} as const;

export const JOINT_HOLDER_TYPES = {
  AICTE: 'AICTE',
  INSTITUTION: 'INSTITUTION',
} as const;

export const FILE_UPLOAD = {
  MAX_SIZE_MB: 10,
  ALLOWED_MIME_TYPES: [
    'application/pdf',
    'image/jpeg',
    'image/png',
    'application/msword',
    'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  ],
} as const;

export const JWT_CONSTANTS = {
  ACCESS_TOKEN_EXPIRY: '15m',
  REFRESH_TOKEN_EXPIRY: '7d',
  ISSUER: 'fdr-portal',
  AUDIENCE: 'fdr-portal',
  ALGORITHM: 'RS256',
} as const;

export const OTP_CONSTANTS = {
  LENGTH: 6,
  EXPIRY_MINUTES: 10,
  MAX_ATTEMPTS: 5,
} as const;

export const VERIFICATION_TOKEN_CONSTANTS = {
  EXPIRY_HOURS: 48,
  TOKEN_BYTES: 32, // 256-bit
} as const;

export const RATE_LIMIT = {
  DEFAULT_MAX: 100,
  DEFAULT_WINDOW_MS: 60000, // 1 minute
  AUTH_MAX: 10,
  AUTH_WINDOW_MS: 900000, // 15 minutes
} as const;

export const PAGINATION = {
  DEFAULT_PAGE: 1,
  DEFAULT_LIMIT: 20,
  MAX_LIMIT: 100,
} as const;

export const MATURITY_REMINDER_DAYS = [60, 30, 15, 7, 1];

export const BANK_REMINDER_HOURS = [24, 48];

export const ESCALATION = {
  BANK_NO_REPLY_TO_OFFICER_HOURS: 72,
  BANK_NO_REPLY_TO_ADMIN_DAYS: 5,
  OVERDUE_RENEWAL_DAYS: 1,
  RELEASE_SLA_HOURS: 72,
} as const;

export const RISK_SCORE = {
  BLOCK_THRESHOLD: 70,
  WARNING_THRESHOLD: 40,
  MAX_SCORE: 100,
} as const;

export const HTTP_HEADERS = {
  CORRELATION_ID: 'x-correlation-id',
  REQUEST_ID: 'x-request-id',
  CLIENT_VERSION: 'x-client-version',
} as const;

export const CACHE_TTL = {
  SHORT: 60, // 1 minute
  MEDIUM: 300, // 5 minutes
  LONG: 3600, // 1 hour
  VERY_LONG: 86400, // 24 hours
} as const;

export const RELEASE_CHECKLIST_ITEMS = [
  {
    id: 'bank_verified',
    name: 'Bank Verification Complete',
    description: 'FDR has been verified by bank',
    isRequired: true,
    isAutoCheck: true,
  },
  {
    id: 'lien_confirmed',
    name: 'Lien Confirmed',
    description: 'Lien holder has confirmed or lien released',
    isRequired: true,
    isAutoCheck: true,
  },
  {
    id: 'conditions_met',
    name: 'Release Conditions Met',
    description: 'All institutional conditions for release satisfied',
    isRequired: true,
    isAutoCheck: true,
  },
  {
    id: 'no_open_observations',
    name: 'No Open Observations',
    description: 'No pending flags, remarks, or document requests',
    isRequired: true,
    isAutoCheck: true,
  },
  {
    id: 'documents_present',
    name: 'Required Documents Present',
    description: 'All required documents uploaded and valid',
    isRequired: true,
    isAutoCheck: true,
  },
] as const;

export const DEFAULT_RULES_CONFIG = {
  bankReminderDays: [1, 2],
  bankNoReplyEscalationHours: 72,
  bankAdminEscalationDays: 5,
  maturityReminderDays: [60, 30, 15, 7, 1],
  overdueRenewalEscalationDays: 1,
  releaseSLAHours: 72,
  releaseStageSLAHours: {
    requested_to_recommended: 24,
    recommended_to_approved: 24,
    approved_to_released: 24,
  },
  otpExpiryMinutes: 10,
  otpMaxAttempts: 5,
  verificationTokenExpiryHours: 48,
  requiredDocuments: {
    fdrCertificate: true,
    boardResolution: true,
    lienLetter: true,
  },
  releaseConditions: {
    requireBankVerified: true,
    requireLienConfirmed: true,
    requireNoOpenFlags: true,
    requireAllDocuments: true,
  },
  maxFileSizeMB: 10,
  allowedMimeTypes: [
    'application/pdf',
    'image/jpeg',
    'image/png',
  ],
  rateLimitMax: 100,
  rateLimitWindowMinutes: 1,
  featureMFAEnabled: true,
  featureSSOEnabled: false,
  featureWebhooksEnabled: true,
  featureAPIConnectorEnabled: true,
} as const;