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

/** The subset of a request this module reads. Keeps callers from needing Express types. */
export interface AuthFailureRequest {
  ip?: string;
  headers?: Record<string, unknown>;
}

/**
 * Who actually made the failing call, as far as we can honestly tell.
 *
 * `req.ip` is not the caller. Traffic arrives Cloudflare -> nginx -> Express and
 * `server.ts` sets `trust proxy` to 1, so Express trusts exactly one hop and
 * resolves `req.ip` to the Cloudflare edge node. Every auth failure was therefore
 * recorded against 162.159.x / 172.7x.x: a full week of `admin_auth_failed` rows
 * that could only ever name the CDN. Found 2026-08-22 while chasing a chronic
 * ~50/hr baseline that no one could attribute to a client.
 *
 * nginx sets `X-Forwarded-For` from `$proxy_add_x_forwarded_for`, which appends
 * its own peer to whatever Cloudflare sent, so the real caller is the LEFTMOST
 * entry. That header is set by our own nginx config, so relying on it needs no
 * assumption about which Cloudflare headers survive the hop.
 *
 * Deliberately additive: `ip` keeps its existing meaning and these are recorded
 * alongside it. Nothing here becomes an authorization or rate-limiting input, so
 * a forged header on a direct-to-origin request misleads a diagnostician at
 * worst. It never grants anything, and widening `trust proxy` — which WOULD make
 * X-Forwarded-For load-bearing and spoofable end to end — is deliberately avoided.
 */
export function describeCaller(req?: AuthFailureRequest): { forwarded_for: string | null; user_agent: string | null } {
  const header = (name: string): string | null => {
    const raw = req?.headers?.[name];
    if (typeof raw === 'string' && raw.trim()) return raw.trim().slice(0, 200);
    if (Array.isArray(raw) && typeof raw[0] === 'string') return String(raw[0]).trim().slice(0, 200) || null;
    return null;
  };
  return { forwarded_for: header('x-forwarded-for'), user_agent: header('user-agent') };
}

export function logAuthFailure(
  event: string,
  err: unknown,
  actorType: string,
  ip?: string,
  req?: AuthFailureRequest,
): void {
  const message = (err as { message?: string })?.message;
  const errorClass = classifyError(err);
  const caller = describeCaller(req);
  import('../services/aiEventService')
    .then(({ emitAiEvent }) =>
      emitAiEvent({
        event_type: event,
        outcome: 'failure',
        error_class: errorClass,
        actor_type: actorType,
        metadata: {
          ip: ip || null,
          message: message ? message.slice(0, 200) : null,
          ...caller,
        },
      }),
    )
    .catch((telemetryErr: any) => {
      console.error(JSON.stringify({
        level: 'error', service: 'backend', event: 'auth_failure_telemetry_failed',
        outcome: 'failure', error_class: telemetryErr?.constructor?.name ?? 'Error',
        context: { auth_event: event, message: telemetryErr?.message },
      }));
    });
}
