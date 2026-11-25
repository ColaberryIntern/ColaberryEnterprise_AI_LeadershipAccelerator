/**
 * Trust Center timeline (VS3.5), pure. Merges what actually happened on a call into one ordered,
 * read-only list. Every entry says WHO acted (human, ai, deterministic_service, carrier), WHAT they
 * did, and the POLICY VERDICT. Denied actions appear like any other entry. Nothing is inferred: an
 * entry exists only because a stored row exists, and entries are never edited or removed here.
 *
 * Redaction: every free-text value passes through redact() (phone numbers, emails). Tool arguments
 * are never included; the stored rows hold them redacted already and this view does not need them.
 */

export type ActorType = 'human' | 'ai' | 'deterministic_service' | 'carrier';
export type Verdict = 'allowed' | 'denied' | 'approval_required' | 'observed';

export interface TimelineEntry { at: string; actorType: ActorType; actor: string; action: string; verdict: Verdict; detail: string; sourceId: string }

export interface TimelineInput {
  call: { id: string; engine: string; state: string; consent_ref: string | null; created_at: Date | string };
  events: Array<{ id: string; source: string; state: string; occurred_at: Date | string }>;
  tools: Array<{ id: string; tool_name: string; auth_decision: string; status: string; started_at: Date | string }>;
  version: { id: string; version: number; author: string; approved_by: string | null; approved_at: Date | string | null } | null;
}

const PHONE = /\+?\d[\d\s().-]{7,}\d/g;
const EMAIL = /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi;
export const redact = (s: string): string => s.replace(EMAIL, '[redacted email]').replace(PHONE, (m) => (m.replace(/\D/g, '').length >= 10 ? '[redacted number]' : m)); // 10+ digits: a date has 8

const iso = (d: Date | string): string => new Date(d).toISOString();

function verdictOf(decision: string): Verdict {
  return decision === 'denied' ? 'denied' : decision === 'approval_required' ? 'approval_required' : 'allowed';
}

export function buildTimeline(i: TimelineInput): TimelineEntry[] {
  const out: TimelineEntry[] = [];
  const add = (e: TimelineEntry) => out.push({ ...e, actor: redact(e.actor), detail: redact(e.detail) });

  if (i.version?.approved_by && i.version.approved_at) {
    add({ at: iso(i.version.approved_at), actorType: 'human', actor: i.version.approved_by, action: 'approved_version', verdict: 'allowed', detail: `Approved agent version ${i.version.version} (author ${i.version.author})`, sourceId: i.version.id });
  }
  add({ at: iso(i.call.created_at), actorType: 'deterministic_service', actor: 'voice gateway', action: 'call_requested', verdict: i.call.state === 'blocked' ? 'denied' : 'allowed',
    detail: i.call.state === 'blocked' ? 'The gateway blocked this call before any dial' : `Call requested on ${i.call.engine}; consent ${i.call.consent_ref ? 'recorded' : 'not recorded'}`, sourceId: i.call.id });
  for (const e of i.events) {
    const carrier = e.source === 'carrier';
    add({ at: iso(e.occurred_at), actorType: carrier ? 'carrier' : 'deterministic_service', actor: carrier ? 'carrier' : e.source, action: `state_${e.state}`, verdict: 'observed', detail: `Call state: ${e.state.replace(/_/g, ' ')}`, sourceId: e.id });
  }
  for (const t of i.tools) {
    const verdict = verdictOf(t.auth_decision);
    add({ at: iso(t.started_at), actorType: 'ai', actor: `AI agent (${i.call.engine})`, action: `tool_${t.tool_name}`, verdict,
      detail: verdict === 'denied' ? `The agent asked for "${t.tool_name}" and was refused` : `The agent used "${t.tool_name}": ${t.status}`, sourceId: t.id });
  }
  // Stable: by time, then by source id, so the same rows always render in the same order.
  return out.sort((a, b) => a.at.localeCompare(b.at) || a.sourceId.localeCompare(b.sourceId));
}

/** CSV export of a timeline: already-redacted values, quoted, and neutralized against formula injection. */
export function timelineCsv(entries: TimelineEntry[]): string {
  const cell = (v: string): string => `"${(/^[=+\-@\t\r]/.test(v) ? `'${v}` : v).replace(/"/g, '""')}"`;
  const head = ['at', 'actor_type', 'actor', 'action', 'verdict', 'detail'];
  return [head.join(','), ...entries.map((e) => [e.at, e.actorType, e.actor, e.action, e.verdict, e.detail].map(cell).join(','))].join('\r\n') + '\r\n';
}
