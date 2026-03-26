import crypto from 'crypto';
import { Op } from 'sequelize';
import Lead from '../../../models/Lead';
import OpenclawResponse from '../../../models/OpenclawResponse';
import EngagementEvent from '../../../models/EngagementEvent';

/**
 * OpenClaw Lead Capture Service
 *
 * Creates and updates Lead records from social engagement signals.
 * Social platforms don't provide emails, so leads get unique placeholder emails.
 * Deduplication by platform + author name hash.
 */

/**
 * Generate a deterministic placeholder email for a social lead.
 * Format: openclaw-{platform}-{hash}@pending.local
 */
function generatePlaceholderEmail(platform: string, name: string): string {
  const hash = crypto.createHash('md5').update(`${platform}:${name.toLowerCase().trim()}`).digest('hex').slice(0, 8);
  return `openclaw-${platform}-${hash}@pending.local`;
}

/**
 * Create or update a Lead from a signal author when a response is generated.
 */
export async function captureLeadFromSignal(
  signal: { platform: string; author?: string; title?: string; source_url?: string; topic_tags?: any; relevance_score?: number },
  response: InstanceType<typeof OpenclawResponse>,
): Promise<InstanceType<typeof Lead> | null> {
  const name = signal.author;
  if (!name || name === 'unknown' || name === '[deleted]') return null;

  const email = generatePlaceholderEmail(signal.platform, name);
  const intentLevel = response.intent_level || 'low';

  try {
    // Check for existing lead by placeholder email
    const existing = await Lead.findOne({ where: { email: { [Op.iLike]: email } } });

    if (existing) {
      // Update existing lead
      const notes = (existing as any).notes || {};
      const openclawData = notes.openclaw || { engagement_count: 0, platforms: [] };
      openclawData.engagement_count = (openclawData.engagement_count || 0) + 1;
      openclawData.last_signal_title = signal.title;
      openclawData.last_platform = signal.platform;
      if (!openclawData.platforms.includes(signal.platform)) {
        openclawData.platforms.push(signal.platform);
      }

      await existing.update({
        last_contacted_at: new Date(),
        notes: { ...notes, openclaw: openclawData },
        updated_at: new Date(),
      });

      return existing;
    }

    // Create new lead
    const lead = await Lead.create({
      name,
      email,
      source: 'openclaw',
      lead_source_type: 'warm',
      interest_area: Array.isArray(signal.topic_tags) ? signal.topic_tags.join(', ') : '',
      interest_level: intentLevel,
      lead_score: Math.round((signal.relevance_score || 0.3) * 100),
      lead_temperature: 'warm',
      pipeline_stage: 'new_lead',
      status: 'active',
      notes: {
        openclaw: {
          platform: signal.platform,
          profile_url: signal.source_url || '',
          problem_detected: signal.title || '',
          engagement_count: 1,
          platforms: [signal.platform],
          follow_up_flag: false,
        },
      },
      linkedin_url: signal.platform === 'linkedin_comments' ? (signal.source_url || '') : undefined,
      created_at: new Date(),
      updated_at: new Date(),
    } as any);

    return lead;
  } catch (err: any) {
    console.warn(`[OpenClaw LeadCapture] Failed to capture lead for ${name} on ${signal.platform}: ${err.message}`);
    return null;
  }
}

/**
 * Update a Lead when someone engages with our posted content.
 */
export async function updateLeadFromEngagement(
  engagement: InstanceType<typeof EngagementEvent>,
): Promise<InstanceType<typeof Lead> | null> {
  const name = engagement.user_name;
  if (!name || name === 'unknown') return null;

  const email = generatePlaceholderEmail(engagement.platform, name);

  try {
    const existing = await Lead.findOne({ where: { email: { [Op.iLike]: email } } });

    if (existing) {
      const notes = (existing as any).notes || {};
      const openclawData = notes.openclaw || { engagement_count: 0, platforms: [] };
      openclawData.engagement_count = (openclawData.engagement_count || 0) + 1;
      openclawData.last_engagement_type = engagement.engagement_type;
      openclawData.last_engagement_content = (engagement.content || '').slice(0, 200);
      if (engagement.intent_score && engagement.intent_score > 0.6) {
        openclawData.follow_up_flag = true;
      }

      // Escalate interest level if engagement shows high intent
      let interestLevel = existing.interest_level;
      if (engagement.intent_score && engagement.intent_score > 0.7) {
        interestLevel = 'high';
      } else if (engagement.intent_score && engagement.intent_score > 0.5 && interestLevel === 'low') {
        interestLevel = 'medium';
      }

      await existing.update({
        last_contacted_at: new Date(),
        interest_level: interestLevel,
        notes: { ...notes, openclaw: openclawData },
        updated_at: new Date(),
      });

      return existing;
    }

    // Create new lead from engagement
    const lead = await Lead.create({
      name,
      email,
      title: engagement.user_title || undefined,
      company: engagement.user_company || engagement.company_detected || undefined,
      source: 'openclaw',
      lead_source_type: 'warm',
      interest_level: engagement.intent_score && engagement.intent_score > 0.5 ? 'medium' : 'low',
      lead_score: Math.round((engagement.intent_score || 0.3) * 100),
      lead_temperature: 'warm',
      pipeline_stage: 'new_lead',
      status: 'active',
      notes: {
        openclaw: {
          platform: engagement.platform,
          profile_url: engagement.source_url || '',
          engagement_count: 1,
          platforms: [engagement.platform],
          follow_up_flag: engagement.intent_score && engagement.intent_score > 0.6,
          last_engagement_type: engagement.engagement_type,
        },
      },
      created_at: new Date(),
      updated_at: new Date(),
    } as any);

    return lead;
  } catch (err: any) {
    console.warn(`[OpenClaw LeadCapture] Failed to update lead for ${name}: ${err.message}`);
    return null;
  }
}
