import { Lead } from '../models';
import { Op } from 'sequelize';

export interface AdvisorySessionPayload {
  id: string;
  userId: string;
  user: {
    email: string;
    name?: string;
    role?: string;
  };
  recommendation: {
    type: string;
    title: string;
    description: string;
    confidence: number;
    severity: string;
    status: string;
    metadata?: Record<string, any>;
  };
  metadata?: {
    company?: string;
    industry?: string;
    company_size?: number;
    estimated_roi?: number;
    departments?: string[];
    systems?: string[];
  };
}

export async function mapAdvisoryToLead(session: AdvisorySessionPayload): Promise<any> {
  const email = session.user.email;
  if (!email) throw new Error('Advisory session missing email');

  const name = session.user.name || email.split('@')[0];
  const company = session.metadata?.company || null;
  const title = session.user.role || null;
  const industry = session.metadata?.industry || null;

  // Dedup by email - find or create
  const [lead, created] = await Lead.findOrCreate({
    where: { email: email.toLowerCase() },
    defaults: {
      name,
      email: email.toLowerCase(),
      company,
      title,
      industry,
      source: 'advisory',
      lead_source_type: 'warm',
      advisory_session_id: session.id,
      advisory_source: 'AI_Workforce_Designer',
      advisory_status: mapAdvisoryStatus(session.recommendation.status),
      idea_input: session.recommendation.description,
      maturity_score: Math.round(session.recommendation.confidence * 100),
      estimated_roi: session.metadata?.estimated_roi || null,
      departments_impacted: session.metadata?.departments || null,
      selected_systems: session.metadata?.systems || null,
      lead_temperature: 'warm',
      pipeline_stage: 'new_lead',
      status: 'active',
    } as any,
  });

  if (!created) {
    // Update existing lead with advisory data
    await lead.update({
      advisory_session_id: session.id,
      advisory_source: 'AI_Workforce_Designer',
      advisory_status: mapAdvisoryStatus(session.recommendation.status),
      idea_input: session.recommendation.description,
      maturity_score: Math.round(session.recommendation.confidence * 100),
      estimated_roi: session.metadata?.estimated_roi || null,
      departments_impacted: session.metadata?.departments || null,
      selected_systems: session.metadata?.systems || null,
      ...(company && !lead.company ? { company } : {}),
      ...(title && !lead.title ? { title } : {}),
      ...(industry && !lead.industry ? { industry } : {}),
    } as any);
  }

  return { lead, created };
}

function mapAdvisoryStatus(status: string): string {
  switch (status) {
    case 'active': return 'started';
    case 'accepted': return 'completed';
    case 'dismissed': return 'completed';
    case 'expired': return 'completed';
    default: return 'started';
  }
}
