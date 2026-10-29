// MongoDB Replica Set Initialization Script
// This runs when MongoDB container starts for the first time

// Check if replica set is already initialized
try {
  const status = rs.status();
  if (status.ok === 1) {
    print('Replica set already initialized');
  }
} catch (e) {
  // Initialize replica set
  print('Initializing replica set...');
  rs.initiate({
    _id: 'rs0',
    members: [
      { _id: 0, host: 'mongodb:27017', priority: 1 }
    ]
  });
  print('Replica set initialized');
}

// Wait for replica set to be ready
let retries = 30;
while (retries > 0) {
  try {
    const status = rs.status();
    if (status.ok === 1 && status.myState === 1) {
      print('Replica set is ready');
      break;
    }
  } catch (e) {
    // Ignore errors during startup
  }
  sleep(1000);
  retries--;
}

// Create database and collections with indexes
const db = db.getSiblingDB('fdr_portal');

// Create collections with validation
db.createCollection('users', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['email', 'passwordHash', 'name', 'role', 'status'],
      properties: {
        email: { bsonType: 'string', pattern: '^.+@.+$' },
        passwordHash: { bsonType: 'string' },
        name: { bsonType: 'string' },
        role: { enum: ['INSTITUTION', 'OFFICER', 'ADMIN', 'BANK_MANAGER', 'NODAL_OFFICER', 'AUDITOR'] },
        status: { enum: ['ACTIVE', 'INACTIVE', 'PENDING', 'SUSPENDED'] },
        institutionId: { bsonType: ['objectId', 'null'] },
        bankId: { bsonType: ['objectId', 'null'] },
        mfaEnabled: { bsonType: 'bool' },
        mfaSecret: { bsonType: ['string', 'null'] },
        mfaBackupCodes: { bsonType: 'array', items: { bsonType: 'string' } },
        lastLoginAt: { bsonType: ['date', 'null'] },
      }
    }
  }
});

db.createCollection('institutions', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'code', 'address', 'city', 'state', 'pincode', 'phone', 'email'],
      properties: {
        name: { bsonType: 'string' },
        code: { bsonType: 'string' },
        address: { bsonType: 'string' },
        city: { bsonType: 'string' },
        state: { bsonType: 'string' },
        pincode: { bsonType: 'string', pattern: '^\\d{6}$' },
        phone: { bsonType: 'string' },
        email: { bsonType: 'string', pattern: '^.+@.+$' },
        website: { bsonType: ['string', 'null'] },
        logoUrl: { bsonType: ['string', 'null'] },
        nodalOfficerId: { bsonType: ['objectId', 'null'] },
        contactPerson: { bsonType: ['string', 'null'] },
        contactPhone: { bsonType: ['string', 'null'] },
        contactEmail: { bsonType: ['string', 'null'] },
        isActive: { bsonType: 'bool' },
      }
    }
  }
});

db.createCollection('banks', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['name', 'code'],
      properties: {
        name: { bsonType: 'string' },
        code: { bsonType: 'string' },
        logoUrl: { bsonType: ['string', 'null'] },
        isActive: { bsonType: 'bool' },
      }
    }
  }
});

db.createCollection('bankbranches', {
  validator: {
    $jsonSchema: {
      bsonType: 'object',
      required: ['bankId', 'ifscCode', 'branchName', 'address', 'city', 'state', 'pincode'],
      properties: {
        bankId: { bsonType: 'objectId' },
        ifscCode: { bsonType: 'string', pattern: '^[A-Z]{4}0[A-Z0-9]{6}$' },
        branchName: { bsonType: 'string' },
        address: { bsonType: 'string' },
        city: { bsonType: 'string' },
        district: { bsonType: ['string', 'null'] },
        state: { bsonType: 'string' },
        pincode: { bsonType: 'string', pattern: '^\\d{6}$' },
        contactPhone: { bsonType: ['string', 'null'] },
        contactEmail: { bsonType: ['string', 'null'] },
        contactPerson: { bsonType: ['string', 'null'] },
        contactDesignation: { bsonType: ['string', 'null'] },
        isVerified: { bsonType: 'bool' },
        verifiedAt: { bsonType: ['date', 'null'] },
        verificationExpiry: { bsonType: ['date', 'null'] },
      }
    }
  }
});

// Create indexes
print('Creating indexes...');

// Users indexes
db.users.createIndex({ email: 1 }, { unique: true });
db.users.createIndex({ institutionId: 1 });
db.users.createIndex({ bankId: 1 });
db.users.createIndex({ role: 1 });
db.users.createIndex({ status: 1 });

// Institutions indexes
db.institutions.createIndex({ code: 1 }, { unique: true });
db.institutions.createIndex({ isActive: 1 });
db.institutions.createIndex({ state: 1 });

// Banks indexes
db.banks.createIndex({ code: 1 }, { unique: true });
db.banks.createIndex({ isActive: 1 });

// Bank branches indexes
db.bankbranches.createIndex({ bankId: 1 });
db.bankbranches.createIndex({ ifscCode: 1 }, { unique: true });
db.bankbranches.createIndex({ city: 1 });
db.bankbranches.createIndex({ state: 1 });
db.bankbranches.createIndex({ isVerified: 1 });

// FDR indexes
db.fdrs.createIndex({ institutionId: 1 });
db.fdrs.createIndex({ bankId: 1 });
db.fdrs.createIndex({ fdrNumber: 1 });
db.fdrs.createIndex({ status: 1 });
db.fdrs.createIndex({ maturityDate: 1 });
db.fdrs.createIndex({ parentFdrId: 1 });
db.fdrs.createIndex({ createdBy: 1 });
db.fdrs.createIndex({ riskScore: 1 });
db.fdrs.createIndex({ institutionId: 1, fdrNumber: 1 }, { unique: true });

// Verification requests indexes
db.verificationrequests.createIndex({ fdrId: 1 });
db.verificationrequests.createIndex({ tokenHash: 1 }, { unique: true });
db.verificationrequests.createIndex({ status: 1 });
db.verificationrequests.createIndex({ tokenExpiry: 1 });
db.verificationrequests.createIndex({ bankBranchId: 1 });

// Release requests indexes
db.releaserequests.createIndex({ fdrId: 1 }, { unique: true });
db.releaserequests.createIndex({ institutionId: 1 });
db.releaserequests.createIndex({ status: 1 });
db.releaserequests.createIndex({ requestedBy: 1 });
db.releaserequests.createIndex({ recommendedBy: 1 });
db.releaserequests.createIndex({ approvedBy: 1 });

// Notifications indexes
db.notifications.createIndex({ userId: 1 });
db.notifications.createIndex({ type: 1 });
db.notifications.createIndex({ createdAt: 1 });
db.notifications.createIndex({ readAt: 1 });

// Audit logs indexes
db.auditlogs.createIndex({ actorId: 1 });
db.auditlogs.createIndex({ entityType: 1 });
db.auditlogs.createIndex({ entityId: 1 });
db.auditlogs.createIndex({ createdAt: 1 });
db.auditlogs.createIndex({ hash: 1 });

// Webhooks indexes
db.webhooks.createIndex({ isActive: 1 });

// Webhook deliveries indexes
db.webhookdeliveries.createIndex({ webhookId: 1 });
db.webhookdeliveries.createIndex({ event: 1 });
db.webhookdeliveries.createIndex({ succeededAt: 1 });
db.webhookdeliveries.createIndex({ nextRetryAt: 1 });

// API keys indexes
db.apikeys.createIndex({ keyHash: 1 }, { unique: true });
db.apikeys.createIndex({ isActive: 1 });
db.apikeys.createIndex({ createdBy: 1 });

// Refresh tokens indexes
db.refreshtokens.createIndex({ userId: 1 });
db.refreshtokens.createIndex({ tokenHash: 1 }, { unique: true });
db.refreshtokens.createIndex({ expiresAt: 1 });

// OTP verifications indexes
db.otpverifications.createIndex({ verificationRequestId: 1 }, { unique: true });
db.otpverifications.createIndex({ expiresAt: 1 });

// Verification results indexes
db.verificationresults.createIndex({ verificationRequestId: 1 }, { unique: true });
db.verificationresults.createIndex({ fdrId: 1 });
db.verificationresults.createIndex({ verifiedBy: 1 });

// Rules config indexes
db.rulesconfigs.createIndex({ key: 1 }, { unique: true });

print('All indexes created successfully');

// Insert default rules configuration
db.rulesconfigs.insertOne({
  key: 'default',
  value: {
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
    allowedMimeTypes: ['application/pdf', 'image/jpeg', 'image/png'],
    rateLimitMax: 100,
    rateLimitWindowMinutes: 1,
    featureMFAEnabled: true,
    featureSSOEnabled: false,
    featureWebhooksEnabled: true,
    featureAPIConnectorEnabled: true,
  },
  description: 'Default system rules configuration',
  updatedBy: 'system',
  updatedAt: new Date(),
});

print('Default rules configuration inserted');

print('MongoDB initialization complete!');