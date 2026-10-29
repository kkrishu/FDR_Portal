/**
 * FDR risk detection.
 *
 * Turns submission data into concrete, explainable flags — every message states
 * what is wrong and what to do about it, because a flag nobody can act on is
 * noise. Runs at submission and over seeded history so the rules are identical
 * everywhere.
 *
 * The checks are deliberately the ones this data can actually support: the
 * service never invents a mismatch it cannot see (the bank's own confirmation
 * is what detects a value mismatch, via the verification result).
 */

import { prisma } from '../lib/prisma';
import { FDR_FLAG_CATEGORIES, FDR_FLAG_SEVERITY } from '@fdr-portal/shared/constants';

export interface RiskInput {
  fdrNumber: string;
  amount: number;
  issueDate: Date;
  maturityDate: Date;
  interestRate?: number | null;
  institutionId: string;
  ifscCode: string;
  lienAmount?: number | null;
}

export interface DetectedFlag {
  category: string;
  severity: string;
  message: string;
  details?: Record<string, unknown>;
}

export interface RiskAssessment {
  riskScore: number;
  flags: DetectedFlag[];
}

const SEVERITY_WEIGHT: Record<string, number> = {
  BLOCK: 40,
  WARNING: 18,
  INFO: 6,
};

const MIN_TERM_DAYS = 7;
const MAX_TERM_DAYS = 3650;
const MIN_INTEREST_RATE = 2;
const MAX_INTEREST_RATE = 12;

function inr(amount: number): string {
  return new Intl.NumberFormat('en-IN', {
    style: 'currency',
    currency: 'INR',
    maximumFractionDigits: 0,
  }).format(amount);
}

function dayDiff(a: Date, b: Date): number {
  return Math.round((a.getTime() - b.getTime()) / (1000 * 60 * 60 * 24));
}

/**
 * Evaluate one deposit. `rules` carries the admin-configured thresholds; a
 * lookup happens once per call rather than per check.
 *
 * `phase` matters: some checks are about the act of submitting (a maturity
 * that has already passed is a blocker on a draft, but a plain fact about a
 * deposit released two years ago), so they only run for submissions. Data
 * contradictions — an oversized lien, a rate that looks like a typo — apply at
 * every phase.
 */
export async function assessFdrRisk(
  input: RiskInput,
  rules: Record<string, unknown>,
  options: { phase?: 'submission' | 'historical' } = {}
): Promise<RiskAssessment> {
  const phase = options.phase ?? 'submission';
  const flags: DetectedFlag[] = [];
  const now = new Date();

  const minAmount = Number(rules.minimumFdrAmount ?? 10000);
  const maxAmount = Number(rules.maxFdrAmount ?? 100000000);
  const duplicateWindowDays = Number(rules.duplicateDetectionWindowDays ?? 90);

  // 1. Maturity already passed at the time of submission.
  const daysToMaturity = dayDiff(input.maturityDate, now);
  if (phase === 'submission' && daysToMaturity < 0) {
    flags.push({
      category: FDR_FLAG_CATEGORIES.EXPIRED_FDR,
      severity: FDR_FLAG_SEVERITY.BLOCK,
      message: `The deposit matures on ${input.maturityDate.toLocaleDateString('en-IN')}, which has already passed. Correct the maturity date in the draft and resubmit — a deposit cannot be held once it has matured.`,
      details: { maturityDate: input.maturityDate.toISOString() },
    });
  }

  // 2. Term outside plausible bounds for a security deposit.
  const termDays = dayDiff(input.maturityDate, input.issueDate);
  if (phase === 'submission' && termDays > 0 && (termDays < MIN_TERM_DAYS || termDays > MAX_TERM_DAYS)) {
    flags.push({
      category: FDR_FLAG_CATEGORIES.SUSPICIOUS_PATTERN,
      severity: FDR_FLAG_SEVERITY.WARNING,
      message: `The term is ${termDays} days, outside the ${MIN_TERM_DAYS}-day to ${MAX_TERM_DAYS}-day range for a security deposit. Check the issue and maturity dates against the physical receipt.`,
      details: { termDays },
    });
  }

  // 3. Amount outside the configured limits.
  if (input.amount < minAmount) {
    flags.push({
      category: FDR_FLAG_CATEGORIES.SUSPICIOUS_PATTERN,
      severity: FDR_FLAG_SEVERITY.BLOCK,
      message: `The deposit amount ${inr(input.amount)} is below the ${inr(minAmount)} minimum for an AICTE security deposit. Confirm the amount on the receipt before resubmitting.`,
      details: { amount: input.amount, minAmount },
    });
  } else if (input.amount > maxAmount) {
    flags.push({
      category: FDR_FLAG_CATEGORIES.SUSPICIOUS_PATTERN,
      severity: FDR_FLAG_SEVERITY.WARNING,
      message: `The deposit amount ${inr(input.amount)} exceeds the ${inr(maxAmount)} configured ceiling. Large deposits may need additional scrutiny before release.`,
      details: { amount: input.amount, maxAmount },
    });
  }

  // 4. Interest rate outside the ordinary range — usually a typo.
  if (input.interestRate && (input.interestRate < MIN_INTEREST_RATE || input.interestRate > MAX_INTEREST_RATE)) {
    flags.push({
      category: FDR_FLAG_CATEGORIES.SUSPICIOUS_PATTERN,
      severity: FDR_FLAG_SEVERITY.INFO,
      message: `The interest rate ${input.interestRate}% is outside the typical ${MIN_INTEREST_RATE}–${MAX_INTEREST_RATE}% range. Confirm it matches the certificate — a misplaced decimal is the usual cause.`,
      details: { interestRate: input.interestRate },
    });
  }

  // 5. Lien larger than the deposit itself is contradictory.
  if (input.lienAmount && input.lienAmount > input.amount) {
    flags.push({
      category: FDR_FLAG_CATEGORIES.LIEN_MISMATCH,
      severity: FDR_FLAG_SEVERITY.BLOCK,
      message: `The lien amount ${inr(input.lienAmount)} exceeds the deposit amount ${inr(input.amount)}. A lien cannot be larger than what it secures — correct whichever figure is wrong.`,
      details: { lienAmount: input.lienAmount, amount: input.amount },
    });
  }

  // 6. Identical deposit already held by a different institution.
  const duplicate = await prisma.fDR.findFirst({
    where: {
      institutionId: { not: input.institutionId },
      ifscCode: input.ifscCode,
      amount: input.amount,
      maturityDate: input.maturityDate,
    },
    select: { fdrNumber: true },
  });
  if (duplicate) {
    flags.push({
      category: FDR_FLAG_CATEGORIES.DUPLICATE_FDR,
      severity: FDR_FLAG_SEVERITY.WARNING,
      message: `An identical deposit (same bank, amount ${inr(input.amount)}, same maturity date) is already recorded as ${duplicate.fdrNumber} for another institution. Confirm this receipt belongs to you and is not the same deposit filed twice.`,
      details: { otherFdrNumber: duplicate.fdrNumber },
    });
  }

  // 7. The same receipt number filed at the same bank by another institution.
  //    Numbering is per-institution, so a clash here is either a coincidence or
  //    one receipt entering the system twice under two owners.
  const sameNumberElsewhere = await prisma.fDR.findFirst({
    where: {
      fdrNumber: input.fdrNumber,
      ifscCode: input.ifscCode,
      institutionId: { not: input.institutionId },
    },
    select: { fdrNumber: true, institution: { select: { name: true } } },
  });
  if (sameNumberElsewhere) {
    flags.push({
      category: FDR_FLAG_CATEGORIES.DUPLICATE_FDR,
      severity: FDR_FLAG_SEVERITY.WARNING,
      message: `Receipt number ${input.fdrNumber} is also recorded at this bank by ${sameNumberElsewhere.institution.name}. If both institutions genuinely hold a deposit with this number, no action is needed — otherwise one filing may be fraudulent. Compare the physical certificates.`,
      details: { fdrNumber: input.fdrNumber, otherInstitution: sameNumberElsewhere.institution.name },
    });
  }

  // 8. The same institution holding several identical deposits. Splitting one
  //    large deposit into equal receipts is normal banking practice, so this is
  //    informational — the point is to make the officer check each certificate.
  const identicalCount = await prisma.fDR.count({
    where: {
      institutionId: input.institutionId,
      ifscCode: input.ifscCode,
      amount: input.amount,
      maturityDate: input.maturityDate,
      status: { notIn: ['RELEASED'] },
    },
  });
  if (identicalCount >= 3) {
    flags.push({
      category: FDR_FLAG_CATEGORIES.DUPLICATE_FDR,
      severity: FDR_FLAG_SEVERITY.INFO,
      message: `${identicalCount} deposits from this institution share the same bank, amount and maturity date. Splitting a large deposit into equal receipts is normal — confirm each one has its own distinct certificate before verifying.`,
      details: { identicalCount },
    });
  }

  // 8. Branch not verified — requests sent there often go unanswered.
  const branch = await prisma.bankBranch.findUnique({
    where: { ifscCode: input.ifscCode },
    select: { isVerified: true, branchName: true },
  });
  if (branch && !branch.isVerified) {
    flags.push({
      category: FDR_FLAG_CATEGORIES.SUSPICIOUS_PATTERN,
      severity: FDR_FLAG_SEVERITY.INFO,
      message: `Branch ${input.ifscCode} (${branch.branchName}) is not yet verified in the bank directory, so verification requests may go unanswered. An administrator can verify the branch, or you can switch to a verified one.`,
      details: { ifscCode: input.ifscCode },
    });
  }

  const riskScore = Math.min(
    100,
    flags.reduce((sum, flag) => sum + (SEVERITY_WEIGHT[flag.severity] ?? 0), 0)
  );

  return { riskScore, flags };
}

/** Thresholds from the admin-configured rules, with safe fallbacks. */
export async function loadRules(): Promise<Record<string, unknown>> {
  const config = await prisma.rulesConfig.findUnique({ where: { key: 'default' } });
  return (config?.value ?? {}) as Record<string, unknown>;
}
