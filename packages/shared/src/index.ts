/**
 * Shared Package - Main Entry Point
 * Exports all types, constants, utilities, validators, and schemas
 */

// Types
export * from './types';

// Constants - explicitly export to avoid conflicts with types
export {
  APP_CONSTANTS,
  API_CONSTANTS,
  ROLES,
  USER_STATUS,
  FDR_STATUS,
  FDR_FLAG_CATEGORIES,
  FDR_FLAG_SEVERITY,
  VERIFICATION_CHANNELS,
  ASSURANCE_LEVELS,
  RELEASE_STATUS,
  NOTIFICATION_CHANNELS,
  NOTIFICATION_TYPES,
  DOCUMENT_TYPES,
  JOINT_HOLDER_TYPES,
  FILE_UPLOAD,
  JWT_CONSTANTS,
  OTP_CONSTANTS,
  VERIFICATION_TOKEN_CONSTANTS,
  RATE_LIMIT,
  PAGINATION,
  MATURITY_REMINDER_DAYS,
  BANK_REMINDER_HOURS,
  ESCALATION,
  RISK_SCORE,
  HTTP_HEADERS,
  CACHE_TTL,
  RELEASE_CHECKLIST_ITEMS,
  DEFAULT_RULES_CONFIG,
} from './constants';

// Export HttpStatus from types
export { HttpStatus } from './types';

// Utilities
export * from './utils';

// Validators - explicitly re-export to avoid conflicts with types
export {
  // Primitive validators
  emailSchema,
  passwordSchema,
  panSchema,
  aadhaarSchema,
  ifscSchema,
  phoneSchema,
  pincodeSchema,
  fdrNumberSchema,
  positiveNumberSchema,
  nonNegativeNumberSchema,
  percentageSchema,
  dateStringSchema,
  objectIdSchema,

  // User validators
  userRoleSchema,
  userStatusSchema,
  createUserSchema,
  selfRegisterSchema,
  updateOwnAccountSchema,
  selfRegisterRoleSchema,
  updateUserSchema,
  loginSchema,
  refreshTokenSchema,
  mfaSetupSchema,
  mfaVerifySchema,

  // Institution validators
  createInstitutionSchema,
  updateInstitutionSchema,

  // Bank Directory validators
  createBankDirectorySchema,
  updateBankDirectorySchema,

  // FDR validators
  fdrStatusSchema,
  fdrFlagCategorySchema,
  fdrFlagSeveritySchema,
  fdrFlagSchema,
  jointHolderSchema,
  lienDetailsSchema,
  documentSchema,
  createFDRSchema,
  updateFDRSchema,
  fdrSearchFiltersSchema,

  // Bank Verification validators
  verificationChannelSchema,
  assuranceLevelSchema,
  createVerificationRequestSchema,
  otpRequestSchema,
  otpVerifySchema,
  bankVerificationSubmitSchema,
  nodalVerificationSubmitSchema,

  // Officer Action validators
  verifyFDRSchema,
  flagFDRSchema,
  addRemarksSchema,
  requestDocumentsSchema,
  manualVerifySchema,

  // Release Request validators
  releaseStatusSchema,
  createReleaseRequestSchema,
  recommendReleaseSchema,
  approveReleaseSchema,
  rejectReleaseSchema,

  // Notification validators
  notificationChannelSchema,
  notificationTypeSchema,
  createNotificationSchema,

  // Rules Configuration validators
  rulesConfigSchema,

  // Audit Log validators
  auditLogSchema,

  // Webhook validators
  createWebhookSchema,
  updateWebhookSchema,

  // API Key validators
  createAPIKeySchema,

  // File Upload validators
  fileUploadSchema,
  fileUploadResponseSchema,

  // Pagination validators
  paginationSchema,

  // Type exports
  type CreateUserInput,
  type SelfRegisterInput,
  type UpdateUserInput,
  type LoginInput,
  type CreateInstitutionInput,
  type UpdateInstitutionInput,
  type CreateBankDirectoryInput,
  type CreateFDRInput,
  type UpdateFDRInput,
  type FDRSearchFilters,
  type CreateVerificationRequestInput,
  type OTPRequestInput,
  type OTPVerifyInput,
  type BankVerificationSubmitInput,
  type NodalVerificationSubmitInput,
  type VerifyFDRInput,
  type FlagFDRInput,
  type AddRemarksInput,
  type RequestDocumentsInput,
  type ManualVerifyInput,
  type CreateReleaseRequestInput,
  type RecommendReleaseInput,
  type ApproveReleaseInput,
  type RejectReleaseInput,
  type CreateNotificationInput,
  type RulesConfig,
  type CreateWebhookInput,
  type UpdateWebhookInput,
  type CreateAPIKeyInput,
  type FileUploadInput,
  type PaginationInput,
} from './validators';