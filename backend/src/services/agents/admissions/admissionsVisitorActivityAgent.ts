import { Op, fn, col } from 'sequelize';
import { PageEvent, VisitorSession, Visitor } from '../../../models';
import AdmissionsMemory from '../../../models/AdmissionsMemory';
import { logAgentActivity } from '../../aiEventService';
import type { AgentExecutionResult, AgentAction } from '../types';

const AGENT_NAME = 'AdmissionsVisitorActivityAgent';

// Pages that indicate admissions interest
const ADMISSIONS_PAGES = ['/pricing', '/enroll', '/program', '/sponsorship', '/strategy-call-prep'];

/**
 * Enrich PageEvents with admissions context, tag sessions with admissions interest.
 * Schedule: every 10 minutes.
 */
export async function runAdmissionsVisitorActivityAgent(
  agentId: string,
  _config: Record<string, any>,
): Promise<AgentExecutionResult> {
  const startTime = Date.now();
  const actions: AgentAction[] = [];
  const errors: string[] = [];

  try {
    const since = new Date(Date.now() - 15 * 60 * 1000); // last 15 minutes

    // Find recent page events on admissions-relevant pages
    const recentEvents = await PageEvent.findAll({
      where: {
        event_type: 'pageview',
        created_at: { [Op.gte]: since },
      },
      include: [{ model: Visitor, as: 'visitor', attributes: ['id', 'lead_id'] }],
      limit: 200,
    });

    const admissionsEvents = recentEvents.filter((e: any) =>
      ADMISSIONS_PAGES.some((p) => (e.page_url || '').includes(p))
    );

    // Group by visitor
    const visitorPages = new Map<string, string[]>();
    for (const event of admissionsEvents) {
      const vid = (event as any).visitor_id;
      if (!visitorPages.has(vid)) visitorPages.set(vid, []);
      visitorPages.get(vid)!.push((event as any).page_url || '');
    }

    for (const [visitorId, pages] of visitorPages) {
      // Ensure memory exists
      const [memory] = await AdmissionsMemory.findOrCreate({
        where: { visitor_id: visitorId },
        defaults: {
          visitor_id: visitorId,
          conversation_count: 0,
          conversation_summaries: [],
          interests: [],
          questions_asked: [],
          visitor_type: 'new',
        },
      });

      // Detect interests from pages visited
      const newInterests: string[] = [];
      if (pages.some((p) => p.includes('/pricing'))) newInterests.push('pricing');
      if (pages.some((p) => p.includes('/enroll'))) newInterests.push('enrollment');
      if (pages.some((p) => p.includes('/sponsorship'))) newInterests.push('enterprise');
      if (pages.some((p) => p.includes('/program'))) newInterests.push('curriculum');

      const existingInterests = memory.interests || [];
      const mergedInterests = [...new Set([...existingInterests, ...newInterests])];

      if (mergedInterests.length > existingInterests.length) {
        await memory.update({ interests: mergedInterests, last_updated: new Date() });

        actions.push({
          campaign_id: '',
          action: 'activity_enriched',
          reason: `Visitor ${visitorId} visited admissions pages: ${pages.join(', ')}`,
          confidence: 0.75,
          before_state: { interests: existingInterests },
          after_state: { interests: mergedInterests },
          result: 'success',
          entity_type: 'system',
          entity_id: memory.id,
        });
      }
    }

    await logAgentActivity({
      agent_id: agentId,
      action: 'activity_enrichment',
      result: 'success',
      details: { events_scanned: admissionsEvents.length, visitors_enriched: actions.length },
    }).catch(() => {});
  } catch (err: any) {
    errors.push(err.message);
  }

  return {
    agent_name: AGENT_NAME,
    campaigns_processed: 0,
    actions_taken: actions,
    errors,
    duration_ms: Date.now() - startTime,
    entities_processed: actions.length,
  };
}
