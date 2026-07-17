/**
 * Shared auth-failure telemetry — BC #10099862873 (P1, item 2).
 *
 * Used by authMiddleware.ts, participantAuth.ts, alumniAuth.ts. These JWT
 * verify catches were previously fully silent (`catch {}`) — an auth
 * failure produced zero observable signal, not even an unclassified log
 * line. Fire-and-forget by design: telemetry must never slow down or break
 * the 401 response it's describing.
 */
import { classifyError } from '../utils/errorClassifier';

export function logAuthFailure(event: string, err: unknown, actorType: string, ip?: string): void {
  const message = (err as { message?: string })?.message;
  import('../services/aiEventService').then(({ emitAiEvent }) => {
    emitAiEvent({
      event_type: event,
      outcome: 'failure',
      error_class: classifyError(err),
      actor_type: actorType,
      metadata: { ip: ip || null, message: message ? message.slice(0, 200) : null },
    }).catch(() => {});
  }).catch(() => {});
}
