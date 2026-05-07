/**
 * emailSubscriber — sends incident notifications via email.
 *
 * V1 uses an injected `send` function so the project's existing Mandrill
 * transport can be wired in without this module knowing about it. When
 * no `send` function is provided, the subscriber is permanently 'skipped'.
 */
import type { IncidentSubscriber, IncidentDispatchPayload, SubscriberDispatchResult } from './types';
import { renderIncidentSummary } from './types';

export interface EmailSendFn {
  (input: { to: string[]; subject: string; html: string; text: string }): Promise<{ ok: boolean; error?: string }>;
}

export interface EmailSubscriberConfig {
  readonly id?: string;
  readonly recipients: ReadonlyArray<string>;
  readonly send_fn: EmailSendFn | null;
  readonly min_severity?: 'info' | 'warning' | 'error';
  readonly subject_prefix?: string;
}

export function createEmailSubscriber(config: EmailSubscriberConfig): IncidentSubscriber {
  const sevRank: Record<string, number> = { info: 0, warning: 1, error: 2 };
  const minSev = config.min_severity ?? 'error';

  return {
    id: config.id ?? 'email',
    description: `Emails incidents to ${config.recipients.length} recipient(s)`,
    accepts(p: IncidentDispatchPayload): boolean {
      if (!config.send_fn) return false;
      if (config.recipients.length === 0) return false;
      return sevRank[p.severity] >= sevRank[minSev];
    },
    async dispatch(p: IncidentDispatchPayload): Promise<SubscriberDispatchResult> {
      if (!config.send_fn) return { status: 'skipped', message: 'no send function configured' };

      const summary = renderIncidentSummary(p);
      const subject = `${config.subject_prefix ?? '[Cognition]'} ${summary}`;
      const text = [
        summary,
        '',
        `Incident: ${p.incident_id}`,
        `Type: ${p.type}`,
        `Severity: ${p.severity}`,
        `Project: ${p.project_id}`,
        `Affected routes: ${p.affected_routes.join(', ') || '(none)'}`,
        `Cognition impact: ${p.cognition_impact ?? 'n/a'}`,
        '',
        'Recommended actions:',
        ...p.recommended_actions.map(a => `  • ${a}`),
      ].join('\n');
      const html = `<pre>${escapeHtml(text)}</pre>`;
      try {
        const result = await config.send_fn({ to: [...config.recipients], subject, html, text });
        if (!result.ok) return { status: 'failed', message: result.error };
        return { status: 'succeeded' };
      } catch (err: any) {
        return { status: 'failed', message: err?.message ?? 'send failed' };
      }
    },
  };
}

function escapeHtml(s: string): string {
  return s.replace(/[&<>"']/g, c =>
    c === '&' ? '&amp;' :
    c === '<' ? '&lt;' :
    c === '>' ? '&gt;' :
    c === '"' ? '&quot;' :
    '&#39;');
}
