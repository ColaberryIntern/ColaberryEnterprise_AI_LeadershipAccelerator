// ─── Revenue Opportunity Service ──────────────────────────────────────────
// Detects potential revenue opportunities from leads, alumni, and pipeline data.

import { RevenueOpportunity, Lead, OpportunityScore } from '../../models';
import { logEvent } from '../ledgerService';
import { Op } from 'sequelize';
import type { OpportunityType, OpportunityUrgency, OpportunityStatus } from '../../models/RevenueOpportunity';

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

  // 1. High-intent leads without recent outreach
  const highScoredLeads = await Lead.findAll({
    where: {
      lead_score: { [Op.gte]: 70 },
      pipeline_stage: { [Op.in]: ['qualified', 'proposal', 'negotiation'] },
      source: { [Op.ne]: 'campaign_test' },
    },
    attributes: ['id', 'name', 'company', 'lead_score', 'pipeline_stage'],
    limit: 20,
    raw: true,
  });

  for (const lead of highScoredLeads) {
    const l = lead as any;
    opportunities.push({
      opportunity_type: 'expansion',
      entity_type: 'lead',
      entity_id: String(l.id),
      department: 'Admissions',
      title: `High-intent lead: ${l.name || l.company || 'Unknown'}`,
      description: `Lead score ${l.lead_score} in ${l.pipeline_stage} stage. Consider prioritized outreach.`,
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
