// ─── Revenue Opportunity Service ──────────────────────────────────────────
// Detects potential revenue opportunities from leads, alumni, and pipeline data.
//
// ── R11: WHY THIS SCANS ON SCORE ALONE ───────────────────────────────────────
//
// It used to require `lead_score >= 70 AND pipeline_stage IN ('qualified',
// 'proposal', 'negotiation')`. Two of those three stage literals have never been
// values of that column: the real vocabulary is `new_lead, contacted, enrolled,
// meeting_scheduled, negotiation, proposal_sent`. "qualified" never existed and
// "proposal" is really "proposal_sent", which looks like a rename this service
// never followed.
//
// But correcting the literals does not fix it, and that is the finding worth
// keeping. Measured in production on 2026-11-12:
//
//   stage              score >=70   score 1-69   score 0
//   new_lead                  161          108    16,686
//   contacted                 939          963     6,548
//   enrolled                    0            0        15
//   meeting_scheduled           0            1         5
//   negotiation                 0            0         2
//   proposal_sent               0            0         1
//
// Every late-stage lead is unscored and every scored lead is early-stage. The
// two sets have never once intersected, so the old predicate was an AND across
// disjoint populations and could not match a row however the data moved. It
// matched 0 before the fix and 0 with the literals corrected, and
// `revenue_opportunities` has never held a row.
//
// The cause is that scoring and staging are different subsystems that never
// touch the same rows: scoring runs over inbound marketing leads, while
// pipeline_stage is a hand-managed sales pipeline of about two dozen people
// nobody scores. So "high score AND far along" encoded an intent the data has
// never supported.
//
// Ali's decision, 2026-11-12: scan on score alone and say plainly that the
// result is a high-intent WORKLIST rather than a sales pipeline. The two dozen
// late-stage leads are few enough to read without an agent.
//
// The deliberate non-goal, from the ticket: do not loosen the predicate until
// rows appear. The point is a scan whose output someone trusts, not a non-zero
// count.

import { RevenueOpportunity, Lead, OpportunityScore } from '../../models';
import { logEvent } from '../ledgerService';
import { Op } from 'sequelize';
import type { OpportunityType, OpportunityUrgency, OpportunityStatus } from '../../models/RevenueOpportunity';

/**
 * The real vocabulary of `leads.pipeline_stage`, exported so a test can fail if this file
 * ever names a stage the column does not have. A hardcoded list silently drifting from the
 * column it describes is precisely what made this scan dead for months without an error.
 */
export const PIPELINE_STAGES = [
  'new_lead', 'contacted', 'enrolled', 'meeting_scheduled', 'negotiation', 'proposal_sent',
] as const;

/** A lead already enrolled is a customer, not an opportunity. */
const EXCLUDED_STAGES: readonly string[] = ['enrolled'];

/** The intent threshold. 70 of a 0-100 score; the live scorer reaches 95. */
export const HIGH_INTENT_SCORE = 70;

/**
 * A cap, and an order to go with it.
 *
 * The previous `limit: 20` carried no ORDER BY, so had it ever matched it would have written
 * twenty arbitrary rows rather than the twenty best — a cap without an order is a random
 * sample wearing a priority's clothes. About 1,100 leads clear the threshold today, and
 * writing all of them would produce a list nobody works. So: highest score first, capped,
 * and the cap is stated rather than implied.
 */
export const SCAN_LIMIT = 100;

// ─── Opportunity Scanning ─────────────────────────────────────────────────

export async function scanForOpportunities(): Promise<{
  opportunities_found: number;
  total_estimated_value: number;
}> {
  const opportunities: Array<{
    opportunity_type: OpportunityType;
    entity_type: string;
    entity_id: string;
    department?: string;
    title: string;
    description: string;
    estimated_value: number;
    confidence: number;
    urgency: OpportunityUrgency;
    evidence: Record<string, any>;
    recommended_actions: Record<string, any>;
  }> = [];

  // 1. High-intent leads, by score. See the R11 note at the top of this file for why stage
  //    is not part of the predicate.
  const highScoredLeads = await Lead.findAll({
    where: {
      lead_score: { [Op.gte]: HIGH_INTENT_SCORE },
      pipeline_stage: { [Op.notIn]: EXCLUDED_STAGES },
      source: { [Op.ne]: 'campaign_test' },
    },
    attributes: ['id', 'name', 'company', 'lead_score', 'pipeline_stage'],
    order: [['lead_score', 'DESC']],
    limit: SCAN_LIMIT,
    raw: true,
  });

  for (const lead of highScoredLeads) {
    const l = lead as any;
    opportunities.push({
      opportunity_type: 'expansion',
      entity_type: 'lead',
      entity_id: String(l.id),
      department: 'Admissions',
      title: `High-intent lead, not yet in pipeline: ${l.name || l.company || 'Unknown'}`,
      // Says what this is and what it is not. These are scored inbound leads, so the stage
      // is almost always new_lead or contacted; calling them pipeline would overstate them.
      // The value is MODELLED, not measured, and the sentence says so rather than leaving a
      // currency figure to be read as revenue.
      description: `Lead score ${l.lead_score} of 100, currently at stage "${l.pipeline_stage}". `
        + 'This is a high-intent signal rather than an open deal. Estimated value is modelled '
        + 'from the score against a nominal course price, not measured from anything agreed.',
      estimated_value: estimateLeadValue(l),
      confidence: Math.min(l.lead_score / 100, 1),
      urgency: l.lead_score >= 85 ? 'high' : 'medium',
      evidence: { lead_score: l.lead_score, pipeline_stage: l.pipeline_stage, company: l.company },
      recommended_actions: { action: 'Schedule strategy call', priority: 'high' },
    });
  }

  // Persist opportunities
  let totalValue = 0;
  for (const opp of opportunities) {
    const [, created] = await RevenueOpportunity.findOrCreate({
      where: { entity_type: opp.entity_type, entity_id: opp.entity_id, opportunity_type: opp.opportunity_type, status: 'detected' },
      defaults: opp,
    });
    if (created) totalValue += opp.estimated_value;
  }

  return { opportunities_found: opportunities.length, total_estimated_value: totalValue };
}

function estimateLeadValue(lead: any): number {
  const base = 5000; // Base course value
  const scoreMultiplier = (lead.lead_score || 50) / 100;
  return base * scoreMultiplier;
}

// ─── CRUD ─────────────────────────────────────────────────────────────────

export async function listOpportunities(filters: {
  status?: string;
  department?: string;
  opportunity_type?: string;
  page?: number;
  limit?: number;
}): Promise<{ rows: any[]; count: number }> {
  const where: any = {};
  if (filters.status) where.status = filters.status;
  if (filters.department) where.department = filters.department;
  if (filters.opportunity_type) where.opportunity_type = filters.opportunity_type;

  const page = filters.page || 1;
  const limit = filters.limit || 20;

  return RevenueOpportunity.findAndCountAll({
    where,
    order: [['estimated_value', 'DESC']],
    limit,
    offset: (page - 1) * limit,
  });
}

export async function updateOpportunityStatus(id: string, status: string): Promise<void> {
  await RevenueOpportunity.update({ status: status as OpportunityStatus, updated_at: new Date() }, { where: { id } });
}
