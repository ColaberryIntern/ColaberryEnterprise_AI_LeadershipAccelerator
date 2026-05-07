/**
 * slackSubscriber — posts incident summaries to a Slack incoming webhook.
 *
 * V1 uses the simple text webhook payload. Phase 10 could upgrade to Block
 * Kit for actionable buttons (acknowledge / resolve from Slack).
 */
import type { IncidentSubscriber, IncidentDispatchPayload, SubscriberDispatchResult } from './types';
import { renderIncidentSummary } from './types';

export interface SlackSubscriberConfig {
  readonly id?: string;
  readonly webhook_url: string;
  readonly channel?: string;
  readonly username?: string;
  readonly min_severity?: 'info' | 'warning' | 'error';
}

export function createSlackSubscriber(config: SlackSubscriberConfig): IncidentSubscriber {
  const sevRank: Record<string, number> = { info: 0, warning: 1, error: 2 };
  const minSev = config.min_severity ?? 'warning';

  return {
    id: config.id ?? 'slack',
    description: `Posts incidents to Slack webhook (channel: ${config.channel ?? 'default'})`,
    accepts(p: IncidentDispatchPayload): boolean {
      return sevRank[p.severity] >= sevRank[minSev];
    },
    async dispatch(p: IncidentDispatchPayload): Promise<SubscriberDispatchResult> {
      const text = renderIncidentSummary(p);
      const recommended = p.recommended_actions.length > 0
        ? '\n*Recommended:* ' + p.recommended_actions.slice(0, 2).join('; ')
        : '';
      const body: any = { text: text + recommended };
      if (config.channel) body.channel = config.channel;
      if (config.username) body.username = config.username;
      try {
        const res = await fetch(config.webhook_url, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(body),
        });
        if (!res.ok) return { status: 'failed', message: `HTTP ${res.status}` };
        return { status: 'succeeded' };
      } catch (err: any) {
        return { status: 'failed', message: err?.message ?? 'slack post failed' };
      }
    },
  };
}
