/**
 * Campaign Graduation Service
 *
 * Automatically moves leads through the cold outbound funnel:
 *   Phase 1 (Cold Outbound Q1) → Phase 2 (Authority Building) → Phase 3 (Decision)
 *
 * Graduation rules:
 *   Phase 1 → 2: Lead completed Phase 1 AND has at least 1 open or click
 *   Phase 2 → 3: Lead completed Phase 2
 *
 * Runs on a schedule (every 6 hours) or can be triggered manually.
 */
import { sequelize } from '../config/database';
import { CampaignLead, Campaign } from '../models';
import { enrollLeadInSequence } from './sequenceService';

const LOG_PREFIX = '[CampaignGraduation]';

// Campaign IDs (from the database)
const PHASE_1_ID = 'b90d7fd3-667a-41c3-8577-fd1b611c4480'; // Cold Outbound Q1
const PHASE_2_ID = 'ce014703-2a3b-4b35-914d-111e7f8859f2'; // Authority Building
const PHASE_3_ID = '9a757adf-a48c-4332-9af1-ad9ec039c74d'; // Decision

interface GraduationResult {
  phase1_to_2: number;
  phase2_to_3: number;
  skipped_no_engagement: number;
  errors: number;
}

/**
 * Graduate leads from Phase 1 → Phase 2.
 * Criteria: completed Phase 1 + at least 1 open or click.
 */
async function graduatePhase1ToPhase2(): Promise<{ graduated: number; skipped: number; errors: number }> {
  // Find Phase 1 completed leads with engagement who aren't already in Phase 2
  const [candidates] = await sequelize.query(`
    SELECT cl.lead_id
    FROM campaign_leads cl
    WHERE cl.campaign_id = '${PHASE_1_ID}'
      AND cl.status = 'completed'
      AND cl.lead_id NOT IN (
        SELECT lead_id FROM campaign_leads WHERE campaign_id = '${PHASE_2_ID}'
      )
      AND (
        SELECT COUNT(*) FROM interaction_outcomes io
        WHERE io.lead_id = cl.lead_id
          AND io.outcome IN ('opened', 'clicked')
      ) > 0
  `) as [any[], unknown];

  // Also count skipped (no engagement)
  const [noEngagement] = await sequelize.query(`
    SELECT COUNT(*)::int as c
    FROM campaign_leads cl
    WHERE cl.campaign_id = '${PHASE_1_ID}'
      AND cl.status = 'completed'
      AND cl.lead_id NOT IN (
        SELECT lead_id FROM campaign_leads WHERE campaign_id = '${PHASE_2_ID}'
      )
      AND (
        SELECT COUNT(*) FROM interaction_outcomes io
        WHERE io.lead_id = cl.lead_id
          AND io.outcome IN ('opened', 'clicked')
      ) = 0
  `) as [any[], unknown];

  const phase2 = await Campaign.findByPk(PHASE_2_ID) as any;
  if (!phase2 || !phase2.sequence_id) {
    console.error(`${LOG_PREFIX} Phase 2 campaign or sequence not found`);
    return { graduated: 0, skipped: noEngagement[0]?.c || 0, errors: 1 };
  }

  let graduated = 0, errors = 0;
  for (const c of candidates) {
    try {
      await enrollLeadInSequence(c.lead_id, phase2.sequence_id, PHASE_2_ID);
      graduated++;
    } catch (err: any) {
      errors++;
      if (graduated === 0) console.error(`${LOG_PREFIX} Phase 1→2 enrollment error: ${err.message}`);
    }
  }

  console.log(`${LOG_PREFIX} Phase 1 → 2: ${graduated} graduated, ${noEngagement[0]?.c || 0} skipped (no engagement), ${errors} errors`);
  return { graduated, skipped: noEngagement[0]?.c || 0, errors };
}

/**
 * Graduate leads from Phase 2 → Phase 3.
 * Criteria: completed Phase 2.
 */
async function graduatePhase2ToPhase3(): Promise<{ graduated: number; errors: number }> {
  const [candidates] = await sequelize.query(`
    SELECT cl.lead_id
    FROM campaign_leads cl
    WHERE cl.campaign_id = '${PHASE_2_ID}'
      AND cl.status = 'completed'
      AND cl.lead_id NOT IN (
        SELECT lead_id FROM campaign_leads WHERE campaign_id = '${PHASE_3_ID}'
      )
  `) as [any[], unknown];

  const phase3 = await Campaign.findByPk(PHASE_3_ID) as any;
  if (!phase3 || !phase3.sequence_id) {
    console.error(`${LOG_PREFIX} Phase 3 campaign or sequence not found`);
    return { graduated: 0, errors: 1 };
  }

  let graduated = 0, errors = 0;
  for (const c of candidates) {
    try {
      await enrollLeadInSequence(c.lead_id, phase3.sequence_id, PHASE_3_ID);
      graduated++;
    } catch (err: any) {
      errors++;
      if (graduated === 0) console.error(`${LOG_PREFIX} Phase 2→3 enrollment error: ${err.message}`);
    }
  }

  console.log(`${LOG_PREFIX} Phase 2 → 3: ${graduated} graduated, ${errors} errors`);
  return { graduated, errors };
}

/**
 * Run full graduation cycle across all phases.
 */
export async function runGraduationCycle(): Promise<GraduationResult> {
  console.log(`${LOG_PREFIX} Starting graduation cycle...`);

  const p1to2 = await graduatePhase1ToPhase2();
  const p2to3 = await graduatePhase2ToPhase3();

  const result: GraduationResult = {
    phase1_to_2: p1to2.graduated,
    phase2_to_3: p2to3.graduated,
    skipped_no_engagement: p1to2.skipped,
    errors: p1to2.errors + p2to3.errors,
  };

  console.log(`${LOG_PREFIX} Cycle complete: ${JSON.stringify(result)}`);
  return result;
}
