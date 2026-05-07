/**
 * consoleSubscriber — always-on stdout logger. Useful as the default
 * subscriber and for tests.
 */
import type { IncidentSubscriber, IncidentDispatchPayload, SubscriberDispatchResult } from './types';
import { renderIncidentSummary } from './types';

export function createConsoleSubscriber(opts: { min_severity?: 'info' | 'warning' | 'error' } = {}): IncidentSubscriber {
  const minSeverity = opts.min_severity ?? 'info';
  const sevRank: Record<string, number> = { info: 0, warning: 1, error: 2 };

  return {
    id: 'console',
    description: 'Logs incidents to stdout',
    accepts(p: IncidentDispatchPayload): boolean {
      return sevRank[p.severity] >= sevRank[minSeverity];
    },
    async dispatch(p: IncidentDispatchPayload): Promise<SubscriberDispatchResult> {
      console.log('[INCIDENT]', renderIncidentSummary(p));
      return { status: 'succeeded' };
    },
  };
}
