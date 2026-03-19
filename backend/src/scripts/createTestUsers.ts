/**
 * Test User Creation Script
 *
 * Creates two test enrollments for controlled testing:
 * - Cold user (GUIDED_DISCOVERY): no variables, no intake
 * - Warm user (FAST_TRACK): pre-seeded variables from strategy session
 *
 * Idempotent — safe to run multiple times via findOrCreate.
 */

import crypto from 'crypto';
import { Enrollment, VariableStore } from '../models';
import * as variableService from '../services/variableService';
import { detectContextMode, type UserContextState } from '../services/userContextService';

// ─── Types ──────────────────────────────────────────────────────────

export interface TestEnrollmentResult {
  enrollment_id: string;
  portal_token: string;
  portal_url: string;
  mode: string;
  variables_seeded: number;
  context_state: UserContextState;
}

// ─── Warm User Variable Seed Data ───────────────────────────────────

const WARM_USER_VARIABLES: Record<string, string> = {
  industry: 'Manufacturing',
  company_name: 'Acme Industries',
  company_size: '500-1000',
  role: 'VP of Operations',
  goal: 'Automate quality control using AI vision systems',
  ai_maturity_level: 'experimenting',
  identified_use_case: 'AI-powered visual inspection for production line defects',
  strategic_priority: 'Reduce defect rate by 40% in 6 months',
  transformation_timeline: '6-12 months',
  budget_range: '$100K-$500K',
  team_size: '15',
  current_ai_tools: 'Basic Excel analytics, no ML',
};

// ─── Test Email Constants ───────────────────────────────────────────

const COLD_EMAIL = 'test-cold@colaberry.test';
const WARM_EMAIL = 'test-warm@colaberry.test';

// ─── Create Test Enrollments ────────────────────────────────────────

export async function createTestEnrollments(
  cohortId: string
): Promise<{ cold: TestEnrollmentResult; warm: TestEnrollmentResult }> {
  // --- Cold User ---
  const coldToken = crypto.randomUUID();
  const [coldEnrollment, coldCreated] = await Enrollment.findOrCreate({
    where: { email: COLD_EMAIL, cohort_id: cohortId },
    defaults: {
      full_name: 'Test User (Cold)',
      email: COLD_EMAIL,
      company: 'Test Corp',
      cohort_id: cohortId,
      portal_enabled: true,
      portal_token: coldToken,
      portal_token_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      intake_completed: false,
      status: 'active',
      payment_status: 'paid',
      payment_method: 'invoice',
    } as any,
  });

  // If already existed, refresh token
  if (!coldCreated) {
    coldEnrollment.portal_token = coldToken;
    coldEnrollment.portal_token_expires_at = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    coldEnrollment.portal_enabled = true;
    coldEnrollment.intake_completed = false;
    await coldEnrollment.save();
  }

  // --- Warm User ---
  const warmToken = crypto.randomUUID();
  const [warmEnrollment, warmCreated] = await Enrollment.findOrCreate({
    where: { email: WARM_EMAIL, cohort_id: cohortId },
    defaults: {
      full_name: 'Test User (Warm)',
      email: WARM_EMAIL,
      company: 'Acme Industries',
      cohort_id: cohortId,
      portal_enabled: true,
      portal_token: warmToken,
      portal_token_expires_at: new Date(Date.now() + 90 * 24 * 60 * 60 * 1000),
      intake_completed: true,
      status: 'active',
      payment_status: 'paid',
      payment_method: 'invoice',
    } as any,
  });

  if (!warmCreated) {
    warmEnrollment.portal_token = warmToken;
    warmEnrollment.portal_token_expires_at = new Date(Date.now() + 90 * 24 * 60 * 60 * 1000);
    warmEnrollment.portal_enabled = true;
    warmEnrollment.intake_completed = true;
    await warmEnrollment.save();
  }

  // Seed warm user variables
  let seededCount = 0;
  for (const [key, value] of Object.entries(WARM_USER_VARIABLES)) {
    await variableService.setVariable(warmEnrollment.id, key, value, 'program');
    seededCount++;
  }

  // Detect context states
  const coldState = await detectContextMode(coldEnrollment.id);
  const warmState = await detectContextMode(warmEnrollment.id);

  const baseUrl = process.env.FRONTEND_URL || 'https://enterprise.colaberry.ai';

  return {
    cold: {
      enrollment_id: coldEnrollment.id,
      portal_token: coldEnrollment.portal_token,
      portal_url: `${baseUrl}/portal/${coldEnrollment.portal_token}`,
      mode: coldState.mode,
      variables_seeded: 0,
      context_state: coldState,
    },
    warm: {
      enrollment_id: warmEnrollment.id,
      portal_token: warmEnrollment.portal_token,
      portal_url: `${baseUrl}/portal/${warmEnrollment.portal_token}`,
      mode: warmState.mode,
      variables_seeded: seededCount,
      context_state: warmState,
    },
  };
}

// ─── Reset Test Enrollments ─────────────────────────────────────────

export async function resetTestEnrollments(
  cohortId: string
): Promise<{ cold_reset: boolean; warm_reset: boolean }> {
  // Find test enrollments
  const coldEnrollment = await Enrollment.findOne({
    where: { email: COLD_EMAIL, cohort_id: cohortId },
  });
  const warmEnrollment = await Enrollment.findOne({
    where: { email: WARM_EMAIL, cohort_id: cohortId },
  });

  let coldReset = false;
  let warmReset = false;

  // Reset cold user — clear any variables that may have been generated during testing
  if (coldEnrollment) {
    await VariableStore.destroy({
      where: { enrollment_id: coldEnrollment.id },
    });
    coldEnrollment.intake_completed = false;
    await coldEnrollment.save();
    coldReset = true;
  }

  // Reset warm user — clear and re-seed variables
  if (warmEnrollment) {
    await VariableStore.destroy({
      where: { enrollment_id: warmEnrollment.id },
    });
    for (const [key, value] of Object.entries(WARM_USER_VARIABLES)) {
      await variableService.setVariable(warmEnrollment.id, key, value, 'program');
    }
    warmEnrollment.intake_completed = true;
    await warmEnrollment.save();
    warmReset = true;
  }

  return { cold_reset: coldReset, warm_reset: warmReset };
}
