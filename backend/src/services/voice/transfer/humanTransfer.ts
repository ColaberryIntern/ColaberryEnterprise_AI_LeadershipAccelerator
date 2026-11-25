/**
 * Human transfer (VS3.2), pure. The supported Twilio pattern for ConversationRelay:
 *   1. the agent ends its session with handoffData {"reason":"transfer_to_human"},
 *   2. Twilio requests the <Connect action> URL (signed), and we answer with TwiML:
 *        - a teammate can take it (number configured, inside transfer hours): <Dial> that number,
 *          with its own signed action URL so a failed dial is handled too;
 *        - otherwise: the safe fallback (a short apology, "a teammate will call you back", hang up);
 *   3. Twilio requests the <Dial action> URL with DialCallStatus: answered/completed ends the call;
 *      busy / no-answer / failed / canceled get the same safe fallback.
 *
 * The model can only ASK for a person. It never sees or chooses a number: the destination is the
 * server-side VOICE_TRANSFER_NUMBER, read here and nowhere else, never logged or returned by an API.
 * A fallback is recorded on the call (state_reason 'transfer_fallback') so a teammate follows up.
 */

export const TRANSFER_REASON = 'transfer_to_human';
export const DIAL_TIMEOUT_SECONDS = 20;

/** Transfer hours: Monday to Friday, 9:00 to 17:00 Central (America/Chicago, DST-aware). */
export function withinTransferHours(now: Date): boolean {
  const parts = new Intl.DateTimeFormat('en-US', { timeZone: 'America/Chicago', weekday: 'short', hour: 'numeric', hourCycle: 'h23' }).formatToParts(now);
  const day = parts.find((p) => p.type === 'weekday')?.value ?? '';
  const hour = Number(parts.find((p) => p.type === 'hour')?.value ?? -1);
  return !['Sat', 'Sun'].includes(day) && hour >= 9 && hour < 17;
}

export function teammateAvailable(target: string | undefined, now: Date): boolean {
  return Boolean(target) && withinTransferHours(now);
}

/** handoffData arrives from Twilio as a string we sent; anything else is not a transfer. */
export function isTransferHandoff(raw: unknown): boolean {
  if (typeof raw !== 'string' || raw.length > 2_000) return false;
  try { return (JSON.parse(raw) as { reason?: unknown })?.reason === TRANSFER_REASON; } catch { return false; }
}

const xml = (s: string): string => s.replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const HEAD = '<?xml version="1.0" encoding="UTF-8"?><Response>';

export const FALLBACK_TWIML = `${HEAD}<Say>No teammate is free right now. Someone from Colaberry will call you back soon. Goodbye.</Say><Hangup/></Response>`;
export const END_TWIML = `${HEAD}<Hangup/></Response>`;

export function dialTwiml(target: string, dialActionUrl: string): string {
  if (!/^\+[1-9]\d{6,14}$/.test(target)) throw new Error('transfer target must be E.164');
  if (!dialActionUrl.startsWith('https://')) throw new Error('dial action URL must be https');
  return `${HEAD}<Say>Connecting you with a teammate now.</Say><Dial timeout="${DIAL_TIMEOUT_SECONDS}" action="${xml(dialActionUrl)}" method="POST">${target}</Dial></Response>`;
}

export type ConnectDecision = 'dial' | 'fallback' | 'end';

/** What to do when the relay session ended (the <Connect action> request). */
export function decideConnectAction(handoffData: unknown, target: string | undefined, now: Date): ConnectDecision {
  if (!isTransferHandoff(handoffData)) return 'end';
  return teammateAvailable(target, now) ? 'dial' : 'fallback';
}

/** What to do when the <Dial> finished (the <Dial action> request). */
export function decideDialAction(dialCallStatus: unknown): 'end' | 'fallback' {
  return dialCallStatus === 'completed' || dialCallStatus === 'answered' ? 'end' : 'fallback';
}

export const CONNECT_ACTION_PATH = '/api/webhook/voice/twilio/connect-action';
export const DIAL_ACTION_PATH = '/api/webhook/voice/twilio/dial-action';
/** Action links stay valid for the longest call plus a margin; they reuse the non-single-use 'status' purpose. */
export const ACTION_TOKEN_TTL_SECONDS = 2 * 3600;
