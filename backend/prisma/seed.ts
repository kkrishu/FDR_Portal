/**
 * Seed script — a working demo dataset.
 *
 * Run with: pnpm --filter=backend db:seed
 * Run with cleanup: pnpm --filter=backend db:seed --clean
 * Skip demo users: pnpm --filter=backend db:seed --no-demo-users
 *
 * Everything a dashboard, list or detail page renders comes from here: FDRs
 * across every workflow status, their joint holders, lien details, documents,
 * timeline entries, verification results, release requests, notifications, and
 * a hash-chained audit log. Records are upserted by natural key, so re-running
 * updates rather than duplicates.
 *
 * Environment variables:
 * - SEED_DEMO_USERS=true|false (default: true) - Include demo user accounts
 * - SEED_DEMO_DATA=true|false (default: true) - Include demo FDRs, notifications, etc.
 * - SEED_CLEAN=true|false (default: false) - Remove all data before seeding
 */

import { PrismaClient } from '@prisma/client';
import bcrypt from 'bcryptjs';
import { createHash } from 'crypto';
import { computeAuditHash } from '../src/services/auditService';
import { assessFdrRisk } from '../src/services/fdrRiskService';

const prisma = new PrismaClient();

const PASSWORD = 'Password@123';
const SALT_ROUNDS = 12;
const DAY = 24 * 60 * 60 * 1000;

// Parse CLI arguments
const args = process.argv.slice(2);
const shouldClean = args.includes('--clean') || process.env.SEED_CLEAN === 'true';
const includeDemoUsers = !args.includes('--no-demo-users') && process.env.SEED_DEMO_USERS !== 'false';
const includeDemoData = process.env.SEED_DEMO_DATA !== 'false';

// ============================================
// Reference data
// ============================================

const institutions = [
  {
    code: 'AICTE-INST-001',
    name: 'Government Engineering College',
    address: 'Sector 12, Ring Road',
    city: 'Ahmedabad',
    state: 'Gujarat',
    pincode: '380015',
    phone: '07926851234',
    email: 'office@gec-ahmedabad.edu.in',
    website: 'https://gec-ahmedabad.edu.in',
    contactPerson: 'Dr. Meera Patel',
    contactPhone: '07926851234',
    contactEmail: 'principal@gec-ahmedabad.edu.in',
  },
  {
    code: 'AICTE-INST-002',
    name: 'Sardar Vallabhbhai Institute of Technology',
    address: 'Vidyanagar Campus, Bhaikaka Road',
    city: 'Vallabh Vidyanagar',
    state: 'Gujarat',
    pincode: '388120',
    phone: '02692236123',
    email: 'office@svit.edu.in',
    website: 'https://svit.edu.in',
    contactPerson: 'Dr. Anil Desai',
    contactPhone: '02692236124',
    contactEmail: 'registrar@svit.edu.in',
  },
  {
    code: 'AICTE-INST-003',
    name: 'National Institute of Engineering Studies',
    address: 'Plot 44, Institutional Area',
    city: 'Pune',
    state: 'Maharashtra',
    pincode: '411045',
    phone: '02025671234',
    email: 'office@nies.edu.in',
    website: 'https://nies.edu.in',
    contactPerson: 'Dr. Rohan Kulkarni',
    contactPhone: '02025671235',
    contactEmail: 'registrar@nies.edu.in',
  },
];

const banks = [
  {
    code: 'SBI',
    name: 'State Bank of India',
    branches: [
      {
        ifscCode: 'SBIN0001234',
        branchName: 'Navrangpura Branch',
        address: 'Commerce Six Roads, Navrangpura',
        city: 'Ahmedabad',
        district: 'Ahmedabad',
        state: 'Gujarat',
        pincode: '380009',
        contactPerson: 'Suresh Iyer',
        contactDesignation: 'Branch Manager',
        contactPhone: '07926560123',
        contactEmail: 'sbi.navrangpura@sbi.co.in',
        isVerified: true,
      },
      {
        ifscCode: 'SBIN0002345',
        branchName: 'Kothrud Branch',
        address: 'Paud Road, Kothrud',
        city: 'Pune',
        district: 'Pune',
        state: 'Maharashtra',
        pincode: '411038',
        contactPerson: 'Anil Joshi',
        contactDesignation: 'Branch Manager',
        contactPhone: '02025380123',
        contactEmail: 'sbi.kothrud@sbi.co.in',
        isVerified: true,
      },
    ],
  },
  {
    code: 'HDFC',
    name: 'HDFC Bank',
    branches: [
      {
        ifscCode: 'HDFC0000456',
        branchName: 'Prahladnagar Branch',
        address: 'Mondeal Heights, SG Highway',
        city: 'Ahmedabad',
        district: 'Ahmedabad',
        state: 'Gujarat',
        pincode: '380015',
        contactPerson: 'Kavita Nair',
        contactDesignation: 'Branch Operations Head',
        contactPhone: '07940214567',
        contactEmail: 'prahladnagar@hdfcbank.com',
        isVerified: true,
      },
    ],
  },
  {
    code: 'ICICI',
    name: 'ICICI Bank',
    branches: [
      {
        ifscCode: 'ICIC0000789',
        branchName: 'Viman Nagar Branch',
        address: 'Phoenix Marketcity Road, Viman Nagar',
        city: 'Pune',
        district: 'Pune',
        state: 'Maharashtra',
        pincode: '411014',
        contactPerson: 'Priya Menon',
        contactDesignation: 'Branch Manager',
        contactPhone: '02040123456',
        contactEmail: 'vimannagar@icicibank.com',
        isVerified: false,
      },
    ],
  },
];

const users = [
  { email: 'admin@fdrportal.local', name: 'System Administrator', role: 'ADMIN', label: 'Full system oversight' },
  { email: 'officer@fdrportal.local', name: 'Review Officer', role: 'OFFICER', label: 'Review queue and approvals' },
  { email: 'officer2@fdrportal.local', name: 'Senior Review Officer', role: 'OFFICER', label: 'Second officer for assignments' },
  {
    email: 'institution@fdrportal.local',
    name: 'Institution Officer',
    role: 'INSTITUTION',
    institutionCode: 'AICTE-INST-001',
    label: 'Submits and tracks FDRs',
  },
  {
    email: 'institution2@fdrportal.local',
    name: 'Second Institution',
    role: 'INSTITUTION',
    institutionCode: 'AICTE-INST-002',
    label: 'Second institution for cross-checks',
  },
  {
    email: 'institution3@fdrportal.local',
    name: 'Third Institution',
    role: 'INSTITUTION',
    institutionCode: 'AICTE-INST-003',
    label: 'Third institution for volume',
  },
  { email: 'bank@fdrportal.local', name: 'Bank Manager', role: 'BANK_MANAGER', bankCode: 'SBI', label: 'Verifies FDRs at the bank' },
  { email: 'nodal@fdrportal.local', name: 'Nodal Officer', role: 'NODAL_OFFICER', bankCode: 'HDFC', label: 'Nodal review portal' },
  { email: 'auditor@fdrportal.local', name: 'Internal Auditor', role: 'AUDITOR', label: 'Read-only audit access' },
];

/**
 * A compact description of each demo FDR. The seeder expands these into the
 * related records that the workflow would normally produce, so a list page and
 * a detail page agree with each other.
 */
const fdrPlans = [
  {
    institution: 'AICTE-INST-001',
    fdrNumber: 'FDR-2025-000001',
    bank: 'SBI',
    branch: 'SBIN0001234',
    amount: 2500000,
    issueOffsetDays: -400,
    maturityOffsetDays: 330,
    interestRate: 7.1,
    status: 'VERIFIED',
    riskScore: 8,
    timeline: ['CREATED', 'SUBMITTED', 'BANK_VERIFIED', 'VERIFIED'],
    verified: true,
    release: null,
  },
  {
    institution: 'AICTE-INST-001',
    fdrNumber: 'FDR-2025-000002',
    bank: 'HDFC',
    branch: 'HDFC0000456',
    amount: 1200000,
    issueOffsetDays: -300,
    maturityOffsetDays: 65,
    interestRate: 6.8,
    status: 'VERIFIED',
    riskScore: 12,
    timeline: ['CREATED', 'SUBMITTED', 'BANK_VERIFIED', 'VERIFIED'],
    verified: true,
    release: null,
  },
  {
    institution: 'AICTE-INST-001',
    fdrNumber: 'FDR-2025-000003',
    bank: 'SBI',
    branch: 'SBIN0001234',
    amount: 750000,
    issueOffsetDays: -250,
    maturityOffsetDays: 24,
    interestRate: 7.25,
    status: 'MANUAL_VERIFIED',
    riskScore: 45,
    timeline: ['CREATED', 'SUBMITTED', 'BANK_FLAGGED', 'MANUAL_VERIFIED'],
    verified: true,
    verifyMode: 'MANUAL',
    release: null,
  },
  {
    institution: 'AICTE-INST-001',
    fdrNumber: 'FDR-2025-000004',
    bank: 'SBI',
    branch: 'SBIN0001234',
    amount: 3000000,
    issueOffsetDays: -120,
    maturityOffsetDays: 610,
    interestRate: 7.5,
    status: 'SUBMITTED',
    riskScore: 0,
    timeline: ['CREATED', 'SUBMITTED'],
    verified: false,
    release: null,
  },
  {
    institution: 'AICTE-INST-001',
    fdrNumber: 'FDR-2025-000005',
    bank: 'HDFC',
    branch: 'HDFC0000456',
    amount: 500000,
    issueOffsetDays: -90,
    maturityOffsetDays: 640,
    interestRate: 6.9,
    status: 'DRAFT',
    riskScore: 0,
    timeline: ['CREATED'],
    verified: false,
    release: null,
  },
  {
    institution: 'AICTE-INST-001',
    fdrNumber: 'FDR-2025-000006',
    bank: 'SBI',
    branch: 'SBIN0001234',
    amount: 1800000,
    issueOffsetDays: -700,
    maturityOffsetDays: -30,
    interestRate: 7.0,
    status: 'EXPIRED',
    riskScore: 60,
    timeline: ['CREATED', 'SUBMITTED', 'BANK_VERIFIED', 'VERIFIED', 'EXPIRED'],
    verified: true,
    release: null,
  },
  {
    institution: 'AICTE-INST-001',
    fdrNumber: 'FDR-2025-000007',
    bank: 'HDFC',
    branch: 'HDFC0000456',
    amount: 2200000,
    issueOffsetDays: -200,
    maturityOffsetDays: 90,
    interestRate: 7.15,
    status: 'RELEASE_REQUESTED',
    riskScore: 10,
    timeline: ['CREATED', 'SUBMITTED', 'BANK_VERIFIED', 'VERIFIED', 'RELEASE_REQUESTED'],
    verified: true,
    release: { status: 'REQUESTED', reason: 'Deposit no longer required for the ongoing accreditation cycle.' },
  },
  {
    institution: 'AICTE-INST-001',
    fdrNumber: 'FDR-2025-000008',
    bank: 'SBI',
    branch: 'SBIN0001234',
    amount: 900000,
    issueOffsetDays: -500,
    maturityOffsetDays: -5,
    interestRate: 7.2,
    status: 'RELEASE_APPROVED',
    riskScore: 15,
    timeline: ['CREATED', 'SUBMITTED', 'BANK_VERIFIED', 'VERIFIED', 'RELEASE_REQUESTED', 'RELEASE_RECOMMENDED', 'RELEASE_APPROVED'],
    verified: true,
    release: {
      status: 'APPROVED',
      reason: 'Closure of the sponsored research project.',
      recommended: true,
      approved: true,
    },
  },
  {
    institution: 'AICTE-INST-001',
    fdrNumber: 'FDR-2025-000009',
    bank: 'HDFC',
    branch: 'HDFC0000456',
    amount: 400000,
    issueOffsetDays: -800,
    maturityOffsetDays: -100,
    interestRate: 6.7,
    status: 'RELEASED',
    riskScore: 5,
    timeline: ['CREATED', 'SUBMITTED', 'BANK_VERIFIED', 'VERIFIED', 'RELEASE_REQUESTED', 'RELEASE_RECOMMENDED', 'RELEASE_APPROVED', 'RELEASED'],
    verified: true,
    release: {
      status: 'RELEASED',
      reason: 'Deposit returned to the institution after course closure.',
      recommended: true,
      approved: true,
      released: true,
    },
  },
  {
    institution: 'AICTE-INST-001',
    fdrNumber: 'FDR-2025-000010',
    bank: 'SBI',
    branch: 'SBIN0001234',
    amount: 1500000,
    issueOffsetDays: -60,
    maturityOffsetDays: 45,
    interestRate: 7.35,
    status: 'BANK_FLAGGED',
    riskScore: 72,
    timeline: ['CREATED', 'SUBMITTED', 'AWAITING_BANK_VERIFICATION', 'BANK_FLAGGED'],
    verified: false,
    release: null,
  },
  {
    institution: 'AICTE-INST-002',
    fdrNumber: 'FDR-2025-000011',
    bank: 'SBI',
    branch: 'SBIN0002345',
    amount: 3200000,
    issueOffsetDays: -350,
    maturityOffsetDays: 380,
    interestRate: 7.4,
    status: 'VERIFIED',
    riskScore: 9,
    timeline: ['CREATED', 'SUBMITTED', 'BANK_VERIFIED', 'VERIFIED'],
    verified: true,
    release: null,
  },
  {
    institution: 'AICTE-INST-002',
    fdrNumber: 'FDR-2025-000012',
    bank: 'HDFC',
    branch: 'HDFC0000456',
    amount: 850000,
    issueOffsetDays: -180,
    maturityOffsetDays: 18,
    interestRate: 6.85,
    status: 'VERIFIED',
    riskScore: 20,
    timeline: ['CREATED', 'SUBMITTED', 'BANK_VERIFIED', 'VERIFIED'],
    verified: true,
    release: null,
  },
  {
    institution: 'AICTE-INST-002',
    fdrNumber: 'FDR-2025-000013',
    bank: 'SBI',
    branch: 'SBIN0001234',
    amount: 2100000,
    issueOffsetDays: -30,
    maturityOffsetDays: 700,
    interestRate: 7.1,
    status: 'AWAITING_BANK_VERIFICATION',
    riskScore: 0,
    timeline: ['CREATED', 'SUBMITTED', 'AWAITING_BANK_VERIFICATION'],
    verified: false,
    release: null,
  },
  {
    institution: 'AICTE-INST-002',
    fdrNumber: 'FDR-2025-000014',
    bank: 'HDFC',
    branch: 'HDFC0000456',
    amount: 640000,
    issueOffsetDays: -15,
    maturityOffsetDays: 730,
    interestRate: 6.95,
    status: 'SUBMITTED',
    riskScore: 0,
    timeline: ['CREATED', 'SUBMITTED'],
    verified: false,
    release: null,
  },
  {
    institution: 'AICTE-INST-002',
    fdrNumber: 'FDR-2025-000015',
    bank: 'SBI',
    branch: 'SBIN0002345',
    amount: 1100000,
    issueOffsetDays: -420,
    maturityOffsetDays: 200,
    interestRate: 72.5,
    status: 'FLAGGED',
    riskScore: 85,
    timeline: ['CREATED', 'SUBMITTED', 'BANK_VERIFIED', 'FLAGGED'],
    verified: false,
    release: null,
  },
  {
    institution: 'AICTE-INST-002',
    fdrNumber: 'FDR-2025-000016',
    bank: 'HDFC',
    branch: 'HDFC0000456',
    amount: 2750000,
    issueOffsetDays: -600,
    maturityOffsetDays: 120,
    interestRate: 7.05,
    status: 'RELEASE_RECOMMENDED',
    riskScore: 11,
    timeline: ['CREATED', 'SUBMITTED', 'BANK_VERIFIED', 'VERIFIED', 'RELEASE_REQUESTED', 'RELEASE_RECOMMENDED'],
    verified: true,
    release: {
      status: 'RECOMMENDED',
      reason: 'Funds required for a new laboratory build-out.',
      recommended: true,
    },
  },
  {
    institution: 'AICTE-INST-002',
    fdrNumber: 'FDR-2025-000017',
    bank: 'SBI',
    branch: 'SBIN0001234',
    amount: 1500000,
    issueOffsetDays: -220,
    maturityOffsetDays: 10,
    interestRate: 7.3,
    status: 'VERIFIED',
    riskScore: 25,
    timeline: ['CREATED', 'SUBMITTED', 'BANK_VERIFIED', 'VERIFIED'],
    verified: true,
    release: null,
  },
  {
    institution: 'AICTE-INST-003',
    fdrNumber: 'FDR-2025-000018',
    bank: 'ICICI',
    branch: 'ICIC0000789',
    amount: 4200000,
    issueOffsetDays: -280,
    maturityOffsetDays: 450,
    interestRate: 7.6,
    status: 'VERIFIED',
    riskScore: 7,
    timeline: ['CREATED', 'SUBMITTED', 'BANK_VERIFIED', 'VERIFIED'],
    verified: true,
    release: null,
  },
  {
    institution: 'AICTE-INST-003',
    fdrNumber: 'FDR-2025-000019',
    bank: 'ICICI',
    branch: 'ICIC0000789',
    amount: 1950000,
    issueOffsetDays: -140,
    maturityOffsetDays: 590,
    interestRate: 7.45,
    status: 'UNDER_REVIEW',
    riskScore: 55,
    timeline: ['CREATED', 'SUBMITTED', 'BANK_VERIFIED', 'UNDER_REVIEW'],
    verified: false,
    release: null,
  },
  {
    institution: 'AICTE-INST-003',
    fdrNumber: 'FDR-2025-000020',
    bank: 'SBI',
    branch: 'SBIN0002345',
    amount: 880000,
    issueOffsetDays: -75,
    maturityOffsetDays: 28,
    interestRate: 7.0,
    status: 'AWAITING_BANK_VERIFICATION',
    riskScore: 0,
    timeline: ['CREATED', 'SUBMITTED', 'AWAITING_BANK_VERIFICATION'],
    verified: false,
    release: null,
  },
  {
    institution: 'AICTE-INST-003',
    fdrNumber: 'FDR-2025-000021',
    bank: 'ICICI',
    branch: 'ICIC0000789',
    amount: 3600000,
    issueOffsetDays: -950,
    maturityOffsetDays: -200,
    interestRate: 7.2,
    status: 'RENEWED',
    riskScore: 30,
    timeline: ['CREATED', 'SUBMITTED', 'BANK_VERIFIED', 'VERIFIED', 'RENEWED'],
    verified: true,
    release: null,
  },
  {
    institution: 'AICTE-INST-003',
    fdrNumber: 'FDR-2025-000022',
    bank: 'SBI',
    branch: 'SBIN0002345',
    amount: 1250000,
    issueOffsetDays: -45,
    maturityOffsetDays: 700,
    interestRate: 7.55,
    status: 'DRAFT',
    riskScore: 0,
    timeline: ['CREATED'],
    verified: false,
    release: null,
  },
  {
    institution: 'AICTE-INST-003',
    fdrNumber: 'FDR-2025-000023',
    bank: 'HDFC',
    branch: 'HDFC0000456',
    amount: 700000,
    issueOffsetDays: -520,
    maturityOffsetDays: 85,
    interestRate: 6.75,
    status: 'VERIFIED',
    riskScore: 18,
    timeline: ['CREATED', 'SUBMITTED', 'BANK_VERIFIED', 'VERIFIED'],
    verified: true,
    release: null,
  },
  {
    institution: 'AICTE-INST-003',
    fdrNumber: 'FDR-2025-000024',
    bank: 'SBI',
    branch: 'SBIN0002345',
    amount: 2400000,
    issueOffsetDays: -380,
    maturityOffsetDays: 320,
    interestRate: 7.3,
    status: 'RELEASE_REJECTED',
    riskScore: 22,
    timeline: ['CREATED', 'SUBMITTED', 'BANK_VERIFIED', 'VERIFIED', 'RELEASE_REQUESTED', 'RELEASE_REJECTED'],
    verified: true,
    release: {
      status: 'REJECTED',
      reason: 'Deposit is required until the pending inspection is closed.',
      rejected: true,
    },
  },
];

// ============================================
// Helpers
// ============================================

function daysFromNow(days: number): Date {
  return new Date(Date.now() + days * DAY);
}

function hash(input: string): string {
  return createHash('sha256').update(input).digest('hex');
}

/** Deterministic pseudo-random so re-seeding produces the same values. */
function pseudoRandom(seed: number): number {
  const x = Math.sin(seed) * 10000;
  return x - Math.floor(x);
}

function panFor(name: string): string {
  const letters = name.replace(/[^A-Za-z]/g, '').toUpperCase().padEnd(5, 'X').slice(0, 5);
  const digits = String(1000 + (name.length * 137) % 9000);
  const check = String.fromCharCode(65 + (name.length % 26));
  return `${letters}${digits}${check}`;
}

// ============================================
// Seed
// ============================================

async function main() {
  console.log('Seeding demo data…\n');

  // Clean up existing data if requested
  if (shouldClean) {
    console.log('Cleaning existing data…');
    await prisma.auditLog.deleteMany({});
    await prisma.webhookDelivery.deleteMany({});
    await prisma.webhook.deleteMany({});
    await prisma.notification.deleteMany({});
    await prisma.releaseRequest.deleteMany({});
    await prisma.verificationResult.deleteMany({});
    await prisma.oTPVerification.deleteMany({});
    await prisma.verificationRequest.deleteMany({});
    await prisma.fDRTimelineEntry.deleteMany({});
    await prisma.lienDetails.deleteMany({});
    await prisma.jointHolder.deleteMany({});
    await prisma.fDRDocument.deleteMany({});
    await prisma.fDRFlag.deleteMany({});
    await prisma.fDR.deleteMany({});
    await prisma.passwordResetToken.deleteMany({});
    await prisma.refreshToken.deleteMany({});
    await prisma.user.deleteMany({});
    await prisma.bankBranch.deleteMany({});
    await prisma.bank.deleteMany({});
    await prisma.institution.deleteMany({});
    await prisma.rulesConfig.deleteMany({});
    await prisma.aPIKey.deleteMany({});
    console.log('  Cleaned all existing data\n');
  }

  // The same thresholds the API reads, defined before the FDR loop so the
  // risk assessor and the rules row cannot disagree.
  const rulesValue = {
    bankReminderDays: [1, 2],
    bankNoReplyEscalationHours: 72,
    bankAdminEscalationDays: 5,
    maturityReminderDays: [60, 30, 15, 7, 1],
    overdueRenewalEscalationDays: 1,
    releaseSLAHours: 72,
    releaseStageSLAHours: { recommendation: 24, approval: 48 },
    releaseConditions: {
      requireNodalSignOff: true,
      requireNoOutstandingFlags: true,
      allowPartialRelease: false,
    },
    otpExpiryMinutes: 10,
    otpMaxAttempts: 5,
    verificationTokenExpiryHours: 48,
    maxFdrAmount: 100000000,
    minimumFdrAmount: 10000,
    duplicateDetectionWindowDays: 90,
  };

  const passwordHash = await bcrypt.hash(PASSWORD, SALT_ROUNDS);

  // --- Institutions ---
  const institutionIds = new Map<string, string>();
  for (const data of institutions) {
    const record = await prisma.institution.upsert({
      where: { code: data.code },
      update: data,
      create: data,
      select: { id: true },
    });
    institutionIds.set(data.code, record.id);
    console.log(`  institution  ${data.name}`);
  }

  // --- Banks and branches ---
  const bankIds = new Map<string, string>();
  const branchIds = new Map<string, string>();
  for (const { branches, ...bank } of banks) {
    const record = await prisma.bank.upsert({
      where: { code: bank.code },
      update: bank,
      create: bank,
      select: { id: true },
    });
    bankIds.set(bank.code, record.id);

    for (const branch of branches) {
      const stored = await prisma.bankBranch.upsert({
        where: { ifscCode: branch.ifscCode },
        update: { ...branch, bankId: record.id },
        create: { ...branch, bankId: record.id },
        select: { id: true },
      });
      branchIds.set(branch.ifscCode, stored.id);
    }
    console.log(`  bank         ${bank.name} (${branches.length} branch${branches.length === 1 ? '' : 'es'})`);
  }

  // --- Users (only if demo users enabled) ---
  const userIds = new Map<string, string>();
  
  if (includeDemoUsers) {
    for (const user of users) {
      const { label, institutionCode, bankCode, ...data } = user as typeof user & {
        institutionCode?: string;
        bankCode?: string;
      };
      const payload = {
        name: data.name,
        role: data.role,
        institutionId: institutionCode ? institutionIds.get(institutionCode)! : null,
        bankId: bankCode ? bankIds.get(bankCode)! : null,
        status: 'ACTIVE',
        passwordHash,
      };
      const record = await prisma.user.upsert({
        where: { email: data.email },
        update: payload,
        create: { ...payload, email: data.email, mfaEnabled: false },
        select: { id: true },
      });
      userIds.set(data.email, record.id);
      console.log(`  user         ${data.email.padEnd(34)} ${data.role.padEnd(14)} ${label}`);
    }
  } else {
    console.log('  users        skipped (SEED_DEMO_USERS=false or --no-demo-users)');
  }

  const adminId = includeDemoUsers ? userIds.get('admin@fdrportal.local')! : null;
  const officerId = includeDemoUsers ? userIds.get('officer@fdrportal.local')! : null;
  const officer2Id = includeDemoUsers ? userIds.get('officer2@fdrportal.local')! : null;

  // Wire the nodal officer relation so institution-side notifications resolve (only if demo users exist)
  if (includeDemoUsers) {
    await prisma.institution.update({
      where: { code: 'AICTE-INST-001' },
      data: { nodalOfficerId: userIds.get('nodal@fdrportal.local')! },
    });
  }

  // --- FDRs and everything hanging off them (only if demo data enabled) ---
  let createdFdrs = 0;

  if (includeDemoData) {
console.log('');
    for (const plan of fdrPlans) {
      const institutionId = institutionIds.get(plan.institution)!;
    const createdBy = [...userIds.entries()].find(
      ([email]) => email.startsWith('institution') && email.includes(plan.institution.slice(-1))
    )?.[1] ?? userIds.get('institution@fdrportal.local')!;
    const branchId = branchIds.get(plan.branch)!;
    const bankId = bankIds.get(plan.bank)!;

    const issueDate = daysFromNow(plan.issueOffsetDays);
    const maturityDate = daysFromNow(plan.maturityOffsetDays);

    const existing = await prisma.fDR.findUnique({
      where: { institutionId_fdrNumber: { institutionId, fdrNumber: plan.fdrNumber } },
      select: { id: true },
    });

    const verified = plan.verified
      ? {
          verifiedBy: officerId,
          verifiedAt: daysFromNow(plan.issueOffsetDays + 12),
          assuranceLevel: plan.verifyMode === 'MANUAL' ? 'MEDIUM' : 'HIGH',
        }
      : {};

    const fdrData = {
      institutionId,
      fdrNumber: plan.fdrNumber,
      bankId,
      bankName: banks.find((b) => b.code === plan.bank)!.name,
      branchName: banks
        .flatMap((b) => b.branches)
        .find((b) => b.ifscCode === plan.branch)!.branchName,
      ifscCode: plan.branch,
      amount: plan.amount,
      issueDate,
      maturityDate,
      interestRate: plan.interestRate,
      interestAmount: Math.round((plan.amount * plan.interestRate * 365) / (365 * 100)),
      status: plan.status,
      riskScore: plan.riskScore,
      createdBy,
      ...verified,
    };

    const fdr = await prisma.fDR.upsert({
      where: { id: existing?.id ?? '000000000000000000000000' },
      update: fdrData,
      create: fdrData,
      select: { id: true, fdrNumber: true, bankName: true, amount: true, createdBy: true },
    });

    // --- Joint holders (always AICTE first so the validator's rule holds) ---
    const holderSeed = plan.fdrNumber.charCodeAt(plan.fdrNumber.length - 1);
    const bankShare = 40 + Math.round(pseudoRandom(holderSeed) * 20);

    await prisma.jointHolder.deleteMany({ where: { fdrId: fdr.id } });
    await prisma.jointHolder.createMany({
      data: [
        {
          fdrId: fdr.id,
          name: 'All India Council for Technical Education',
          pan: 'AAATA1234C',
          isAICTE: true,
          percentage: 100 - bankShare,
        },
        {
          fdrId: fdr.id,
          name: institutions.find((i) => i.code === plan.institution)!.name,
          pan: panFor(plan.institution),
          isAICTE: false,
          percentage: bankShare,
        },
      ],
    });

    // --- Lien details ---
    await prisma.lienDetails.upsert({
      where: { fdrId: fdr.id },
      update: {
        lienHolderName: 'All India Council for Technical Education',
        lienHolderPAN: 'AAATA1234C',
        lienAmount: plan.amount,
        lienStartDate: issueDate,
        lienEndDate: maturityDate,
      },
      create: {
        fdrId: fdr.id,
        lienHolderName: 'All India Council for Technical Education',
        lienHolderPAN: 'AAATA1234C',
        lienAmount: plan.amount,
        lienStartDate: issueDate,
        lienEndDate: maturityDate,
      },
    });

    // --- Documents (hash derived from the record so it stays unique) ---
    const documentPlans = [
      { type: 'FDR_CERTIFICATE', fileName: `${plan.fdrNumber}-certificate.pdf` },
      { type: 'BOARD_RESOLUTION', fileName: `${plan.fdrNumber}-board-resolution.pdf` },
      { type: 'LIEN_LETTER', fileName: `${plan.fdrNumber}-lien-letter.pdf` },
    ];

    for (const doc of documentPlans) {
      const fileHash = hash(`${plan.fdrNumber}:${doc.type}`);
      await prisma.fDRDocument.deleteMany({ where: { fileHash } });
      await prisma.fDRDocument.create({
        data: {
          fdrId: fdr.id,
          type: doc.type,
          fileName: doc.fileName,
          fileUrl: `https://res.cloudinary.com/demo/raw/upload/fdr-portal/${plan.fdrNumber}/${doc.fileName}`,
          fileSize: 180000 + Math.round(pseudoRandom(fileHash.length) * 400000),
          mimeType: 'application/pdf',
          fileHash,
          uploadedBy: createdBy,
        },
      });
    }

    // --- Flags from the real assessor, so seeded findings match what the API
    // would produce for the same data. Two plans intentionally trip checks:
    // FDR-2025-000010 has an oversized lien, FDR-2025-000015 an interest rate
    // that looks like a misplaced decimal. Everyone else seeds clean.
    await prisma.fDRFlag.deleteMany({ where: { fdrId: fdr.id } });
    const assessment = await assessFdrRisk(
      {
        fdrNumber: plan.fdrNumber,
        amount: plan.amount,
        issueDate,
        maturityDate,
        interestRate: plan.interestRate,
        institutionId,
        ifscCode: plan.branch,
        lienAmount: plan.fdrNumber === 'FDR-2025-000010' ? plan.amount * 1.2 : plan.amount,
      },
      rulesValue,
      { phase: 'historical' }
    );
    for (const flag of assessment.flags) {
      await prisma.fDRFlag.create({
        data: {
          fdrId: fdr.id,
          category: flag.category,
          severity: flag.severity,
          message: flag.message,
          details: (flag.details ?? undefined) as any,
          isAutoGenerated: true,
        },
      });
    }

    // --- Verification request + result ---
    const existingVerification = await prisma.verificationRequest.findFirst({
      where: { fdrId: fdr.id },
      select: { id: true },
    });
    if (existingVerification) {
      await prisma.verificationResult.deleteMany({ where: { fdrId: fdr.id } });
      await prisma.oTPVerification.deleteMany({
        where: { verificationRequestId: existingVerification.id },
      });
      await prisma.verificationRequest.delete({ where: { id: existingVerification.id } });
    }

    const shouldHaveVerification = [
      'AWAITING_BANK_VERIFICATION',
      'BANK_VERIFIED',
      'BANK_FLAGGED',
      'MANUAL_VERIFIED',
      'VERIFIED',
      'UNDER_REVIEW',
      'FLAGGED',
      'RELEASE_REQUESTED',
      'RELEASE_RECOMMENDED',
      'RELEASE_APPROVED',
      'RELEASE_REJECTED',
      'RELEASED',
      'RENEWED',
      'EXPIRED',
    ].includes(plan.status);

    if (shouldHaveVerification) {
      // A deposit still awaiting the bank has an open request with a live OTP;
      // everything past that stage carries the bank's completed result.
      const awaitingBank = plan.status === 'AWAITING_BANK_VERIFICATION';
      const bankVerified = !['BANK_FLAGGED', 'FLAGGED'].includes(plan.status);

      const verification = await prisma.verificationRequest.create({
        data: {
          fdrId: fdr.id,
          tokenHash: hash(`${plan.fdrNumber}:verification`),
          tokenExpiry: daysFromNow(awaitingBank ? 2 : -2),
          channel: 'SECURE_LINK',
          status: awaitingBank ? 'PENDING' : bankVerified ? 'VERIFIED' : 'FLAGGED',
          sentToEmail: `branch.${plan.branch.toLowerCase()}@bank.example`,
          sentAt: daysFromNow(awaitingBank ? -3 : plan.issueOffsetDays + 5),
          completedAt: awaitingBank ? null : daysFromNow(plan.issueOffsetDays + 7),
          assuranceLevel: awaitingBank ? null : bankVerified ? 'HIGH' : 'LOW',
          bankBranchId: branchId,
        },
      });

      if (awaitingBank) {
        await prisma.oTPVerification.create({
          data: {
            verificationRequestId: verification.id,
            otpHash: hash(`${plan.fdrNumber}:otp`),
            maxAttempts: 5,
            expiresAt: daysFromNow(2),
          },
        });
      } else {
        await prisma.verificationResult.create({
          data: {
            verificationRequestId: verification.id,
            fdrId: fdr.id,
            verifiedBy: userIds.get('bank@fdrportal.local')!,
            verifiedByRole: 'BANK_MANAGER',
            verifiedAt: daysFromNow(plan.issueOffsetDays + 7),
            amountMatch: bankVerified,
            issueDateMatch: bankVerified,
            maturityDateMatch: bankVerified,
            fdrNumberMatch: bankVerified,
            jointHoldersMatch: bankVerified,
            lienMatch: bankVerified,
            confirmations: { amount: bankVerified, dates: bankVerified, holders: bankVerified },
            remarks: bankVerified
              ? 'All details confirmed against the branch records.'
              : 'Amount on the certificate differs from the submitted value.',
            assuranceLevel: bankVerified ? 'HIGH' : 'LOW',
          },
        });
      }
    }

    // --- Release request ---
    const existingRelease = await prisma.releaseRequest.findUnique({ where: { fdrId: fdr.id } });
    if (existingRelease) {
      await prisma.fDR.update({
        where: { id: fdr.id },
        data: { releaseRequestId: null },
      });
      await prisma.releaseRequest.delete({ where: { fdrId: fdr.id } });
    }

    if (plan.release) {
      const release = await prisma.releaseRequest.create({
        data: {
          fdrId: fdr.id,
          institutionId,
          reason: plan.release.reason,
          documents: [],
          status: plan.release.status,
          checklist: [
            { item: 'FDR certificate surrendered', completed: ['APPROVED', 'RELEASED'].includes(plan.release.status) },
            { item: 'No outstanding dues', completed: true },
            { item: 'Nodal officer sign-off', completed: plan.release.status !== 'REQUESTED' },
          ],
          requestedBy: fdr.createdBy,
          recommendedBy: plan.release.recommended ? officerId : null,
          recommendedAt: plan.release.recommended ? daysFromNow(-10) : null,
          recommendationRemarks: plan.release.recommended ? 'Documents verified; release recommended.' : null,
          approvedBy: plan.release.approved ? adminId : null,
          approvedAt: plan.release.approved ? daysFromNow(-5) : null,
          approvalRemarks: plan.release.approved ? 'Approved for release.' : null,
          rejectedBy: plan.release.rejected ? adminId : null,
          rejectedAt: plan.release.rejected ? daysFromNow(-5) : null,
          rejectionReason: plan.release.rejected ? plan.release.reason : null,
          releasedAt: plan.release.released ? daysFromNow(-2) : null,
          slaDeadline: daysFromNow(3),
        },
        select: { id: true },
      });

      await prisma.fDR.update({
        where: { id: fdr.id },
        data: {
          releaseRequestId: release.id,
          releasedAt: plan.release.released ? daysFromNow(-2) : null,
        },
      });
    }

    // --- Timeline ---
    await prisma.fDRTimelineEntry.deleteMany({ where: { fdrId: fdr.id } });

    const actionDescriptions: Record<string, string> = {
      CREATED: 'FDR record created as a draft',
      SUBMITTED: 'Submitted for bank verification',
      AWAITING_BANK_VERIFICATION: 'Secure verification link sent to the bank branch',
      BANK_VERIFIED: 'Bank confirmed all particulars',
      BANK_FLAGGED: 'Bank reported a discrepancy',
      MANUAL_VERIFIED: 'Verified manually after bank confirmation',
      VERIFIED: 'Verified by the reviewing officer',
      FLAGGED: 'Flagged for scrutiny by the reviewing officer',
      UNDER_REVIEW: 'Under review by the scrutiny team',
      EXPIRED: 'Deposit matured without renewal',
      RENEWED: 'Deposit renewed for a further term',
      RELEASE_REQUESTED: 'Institution requested release',
      RELEASE_RECOMMENDED: 'Release recommended by the reviewing officer',
      RELEASE_APPROVED: 'Release approved by the administrator',
      RELEASE_REJECTED: 'Release request rejected',
      RELEASED: 'Deposit released to the institution',
    };

    const actorFor = (action: string) => {
      if (action.startsWith('BANK')) {
        return { id: userIds.get('bank@fdrportal.local')!, role: 'BANK_MANAGER', name: 'Bank Manager' };
      }
      if (action.startsWith('RELEASE_APPROVED') || action.startsWith('RELEASE_REJECTED')) {
        return { id: adminId, role: 'ADMIN', name: 'System Administrator' };
      }
      if (action.startsWith('RELEASE_RECOMMENDED')) {
        return { id: officerId, role: 'OFFICER', name: 'Review Officer' };
      }
      if (['VERIFIED', 'MANUAL_VERIFIED', 'FLAGGED', 'UNDER_REVIEW'].includes(action)) {
        return { id: officerId, role: 'OFFICER', name: 'Review Officer' };
      }
      return { id: fdr.createdBy, role: 'INSTITUTION', name: 'Institution Officer' };
    };

    let offset = plan.issueOffsetDays;
    for (const action of plan.timeline) {
      const actor = actorFor(action);
      await prisma.fDRTimelineEntry.create({
        data: {
          fdrId: fdr.id,
          status: action,
          actorId: actor.id,
          actorRole: actor.role,
          actorName: actor.name,
          action,
          description: actionDescriptions[action] ?? action,
          createdAt: daysFromNow(offset),
        },
      });
      offset += 3;
    }

    createdFdrs += 1;
    }
    console.log(`  fdrs         ${createdFdrs} records across all workflow states`);

    // --- Notifications for every user ---
    await prisma.notification.deleteMany({});
    const notificationPlans = [
    {
      email: 'institution@fdrportal.local',
      items: [
        {
          type: 'FDR_VERIFIED',
          title: 'FDR verified',
          message: 'FDR-2025-000001 has been verified. No action needed.',
          read: true,
          daysAgo: 12,
        },
        {
          type: 'BANK_VERIFICATION_REQUESTED',
          title: 'Verification request sent',
          message: 'A verification link went to State Bank of India, Navrangpura Branch for FDR-2025-000004.',
          read: false,
          daysAgo: 2,
        },
        {
          type: 'FDR_EXPIRING',
          title: 'Deposit maturing soon',
          message: 'FDR-2025-000003 matures in 24 days. Start the renewal process.',
          read: false,
          daysAgo: 1,
        },
        {
          type: 'FDR_FLAGGED',
          title: 'Discrepancy reported',
          message: 'State Bank of India flagged FDR-2025-000010 for an amount mismatch.',
          read: false,
          daysAgo: 1,
        },
        {
          type: 'RELEASE_APPROVED',
          title: 'Release approved',
          message: 'Release of FDR-2025-000008 has been approved.',
          read: true,
          daysAgo: 5,
        },
      ],
    },
    {
      email: 'officer@fdrportal.local',
      items: [
        {
          type: 'FDR_SUBMITTED',
          title: 'New submission in queue',
          message: 'FDR-2025-000004 from Government Engineering College is awaiting review.',
          read: false,
          daysAgo: 2,
        },
        {
          type: 'RELEASE_REQUESTED',
          title: 'Release requested',
          message: 'Government Engineering College requested release of FDR-2025-000007.',
          read: false,
          daysAgo: 1,
        },
        {
          type: 'SECOND_OFFICER_REQUIRED',
          title: 'Second officer required',
          message: 'FDR-2025-000015 needs a second opinion after the lien mismatch.',
          read: false,
          daysAgo: 3,
        },
        {
          type: 'SCRUTINY_REMARKS',
          title: 'Scrutiny remarks pending',
          message: 'FDR-2025-000019 has been under review for 4 days.',
          read: true,
          daysAgo: 4,
        },
      ],
    },
    {
      email: 'bank@fdrportal.local',
      items: [
        {
          type: 'BANK_VERIFICATION_REQUESTED',
          title: 'Verification requested',
          message: 'AICTE asks your branch to confirm FDR-2025-000013.',
          read: false,
          daysAgo: 1,
        },
        {
          type: 'BANK_VERIFICATION_REMINDER',
          title: 'Reminder: verification pending',
          message: 'FDR-2025-000020 has been awaiting your confirmation for 5 days.',
          read: false,
          daysAgo: 2,
        },
      ],
    },
    {
      email: 'admin@fdrportal.local',
      items: [
        {
          type: 'SYSTEM_ALERT',
          title: 'Audit chain verified',
          message: 'The audit log hash chain passed verification.',
          read: true,
          daysAgo: 1,
        },
        {
          type: 'BANK_VERIFICATION_ESCALATED',
          title: 'Escalation raised',
          message: 'Two verification requests have exceeded the 72-hour SLA.',
          read: false,
          daysAgo: 1,
        },
      ],
    },
    {
      email: 'nodal@fdrportal.local',
      items: [
        {
          type: 'FDR_EXPIRING',
          title: 'Deposits maturing this month',
          message: 'Two HDFC deposits linked to your branch mature within 30 days.',
          read: false,
          daysAgo: 2,
        },
      ],
    },
    {
      email: 'auditor@fdrportal.local',
      items: [
        {
          type: 'SYSTEM_ALERT',
          title: 'Quarterly report ready',
          message: 'The consolidated deposit report for the last quarter is available.',
          read: false,
          daysAgo: 6,
        },
      ],
    },
  ];

  let notificationCount = 0;
  for (const plan of notificationPlans) {
    const userId = userIds.get(plan.email);
    if (!userId) continue;
    for (const item of plan.items) {
      await prisma.notification.create({
        data: {
          userId,
          type: item.type,
          title: item.title,
          message: item.message,
          channels: ['IN_APP'],
          metadata: { seeded: true },
          readAt: item.read ? daysFromNow(-item.daysAgo) : null,
          createdAt: daysFromNow(-item.daysAgo),
        },
      });
      notificationCount += 1;
    }
  }
  console.log(`  notifs       ${notificationCount} notifications`);

  // --- Rules configuration (only if demo data enabled) ---
  if (includeDemoData) {
    await prisma.rulesConfig.upsert({
      where: { key: 'default' },
      update: { value: rulesValue, description: 'Live workflow thresholds', updatedBy: adminId },
      create: {
        key: 'default',
        value: rulesValue,
        description: 'Live workflow thresholds',
        updatedBy: adminId,
      },
    });
    console.log('  rules        default configuration');

    // --- Audit log with a real hash chain ---
    await prisma.auditLog.deleteMany({});

    const auditSeeds = [
      { action: 'USER_LOGIN', entityType: 'User', entityId: adminId, actor: 'admin@fdrportal.local', daysAgo: 21 },
      { action: 'INSTITUTION_CREATED', entityType: 'Institution', entityId: institutionIds.get('AICTE-INST-003')!, actor: 'admin@fdrportal.local', daysAgo: 20 },
      { action: 'BANK_BRANCH_VERIFIED', entityType: 'BankBranch', entityId: branchIds.get('ICIC0000789')!, actor: 'admin@fdrportal.local', daysAgo: 18 },
      { action: 'FDR_SUBMITTED', entityType: 'FDR', entityId: 'seed-fdr-001', actor: 'institution@fdrportal.local', daysAgo: 14 },
      { action: 'FDR_VERIFIED', entityType: 'FDR', entityId: 'seed-fdr-001', actor: 'officer@fdrportal.local', daysAgo: 12 },
      { action: 'RELEASE_REQUESTED', entityType: 'ReleaseRequest', entityId: 'seed-release-001', actor: 'institution@fdrportal.local', daysAgo: 8 },
      { action: 'RELEASE_RECOMMENDED', entityType: 'ReleaseRequest', entityId: 'seed-release-001', actor: 'officer@fdrportal.local', daysAgo: 6 },
      { action: 'RELEASE_APPROVED', entityType: 'ReleaseRequest', entityId: 'seed-release-001', actor: 'admin@fdrportal.local', daysAgo: 5 },
      { action: 'RULES_UPDATED', entityType: 'RulesConfig', entityId: 'default', actor: 'admin@fdrportal.local', daysAgo: 3 },
      { action: 'USER_STATUS_CHANGED', entityType: 'User', entityId: officer2Id, actor: 'admin@fdrportal.local', daysAgo: 2 },
    ];

    let previousHash: string | null = null;
    for (const entry of auditSeeds) {
      const createdAt = daysFromNow(-entry.daysAgo);
      const actorId = userIds.get(entry.actor) ?? adminId;
      const actor = users.find((u) => u.email === entry.actor);

      // entityId is an ObjectId in the schema, so the placeholder entries have to
      // be normalised before hashing — the stored value is what gets re-verified.
      const entityId = /^[0-9a-f]{24}$/.test(entry.entityId)
        ? entry.entityId
        : '000000000000000000000001';

      const payload = {
        actorId,
        actorRole: actor?.role ?? 'ADMIN',
        actorName: actor?.name ?? 'System',
        action: entry.action,
        entityType: entry.entityType,
        entityId,
        before: undefined,
        after: { seeded: true, action: entry.action },
        ipAddress: '127.0.0.1',
        userAgent: 'seed-script',
        createdAt,
      };

      // Hash through the same function the service uses, so `/audit/verify`
      // accepts seeded history instead of reporting a false tamper.
      const rowHash = computeAuditHash(previousHash, payload);

      await prisma.auditLog.create({
        data: { ...payload, hash: rowHash, previousHash },
      });

      previousHash = rowHash;
    }
    console.log(`  audit        ${auditSeeds.length} hash-chained entries`);

    // --- Webhook for the admin console ---
    const existingWebhook = await prisma.webhook.findFirst({ where: { name: 'AICTE reporting endpoint' } });
    if (!existingWebhook) {
      await prisma.webhook.create({
        data: {
          name: 'AICTE reporting endpoint',
          url: 'https://example.gov.in/hooks/fdr-events',
          events: ['fdr.submitted', 'fdr.verified', 'release.approved'],
          secret: hash('demo-webhook-secret').slice(0, 32),
          isActive: true,
          createdBy: adminId,
        },
      });
      console.log('  webhook      AICTE reporting endpoint');
    }

    console.log(`\nDone. All accounts use the password: ${PASSWORD}\n`);
  } else {
    console.log('\nDone. Demo data skipped (SEED_DEMO_DATA=false).\n');
  }
}

main()
  .catch((error) => {
    console.error('\nSeed failed:', error);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
