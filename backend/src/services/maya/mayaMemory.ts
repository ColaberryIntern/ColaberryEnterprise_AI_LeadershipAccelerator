import { QueryTypes } from 'sequelize';
import { sequelize } from '../../config/database';

/**
 * OH1g (T1) - ONE MEMORY. Ali, 2026-11-18: Maya is one person across the campus IM, the website chat, email and
 * calls, so she must remember what was said on every one of them before she answers on any of them.
 *
 * This is the ONE READER every Maya surface calls before replying. It owns no table and writes nothing: each surface
 * keeps writing where it already writes (communication_logs for email/sms/voice, chat_messages for the site chat,
 * room_messages for the campus DM), and this module merges those three into one per-person timeline.
 *
 *   1. The person is resolved through growthJourney/subjectResolver.resolveSubject (lead <-> enrollment <-> visitor),
 *      the read-only identity view; nothing here re-implements identity matching.
 *   2. Each source is read on its own. A source that fails is LOGGED and OMITTED - never invented, never fatal. A
 *      surface asking "what have we said" must not gain a new failure mode by asking.
 *   3. Turns are de-duplicated (same channel + direction + text within two minutes, e.g. a message mirrored to two
 *      tables), ordered newest-LAST, bodies trimmed to 600 characters, and capped at `limit` (newest kept).
 *
 * Dependencies are injectable (the humanOwnership.ts pattern) so the merge is tested without a database.
 */

export type MemoryChannel = 'email' | 'sms' | 'voice' | 'chat' | 'im';
export type MemorySourceTable = 'communication_logs' | 'chat_messages' | 'room_messages';

export interface MemoryTurn {
  at: Date;
  channel: MemoryChannel;
  direction: 'inbound' | 'outbound';
  /** 'Maya' (or the sending system) for outbound, 'Them' for the person. */
  author: string;
  subject: string | null;
  text: string;
  sourceTable: MemorySourceTable;
  sourceId: string;
}

export interface MemoryAnchor {
  leadId?: number | null;
  enrollmentId?: string | null;
  visitorId?: string | null;
}

export interface MemoryOptions {
  /** Maximum turns returned (newest kept). Default 30. */
  limit?: number;
  /** Only turns at or after this instant. */
  since?: Date;
  /** A row to leave out, typically the message being answered right now. */
  excludeSourceId?: string;
  /** Sources the calling surface already shows in its own history (so the prompt does not carry them twice). */
  excludeSources?: MemorySourceTable[];
}

export interface ResolvedPerson {
  leadId: number | null;
  enrollmentId: string | null;
  visitorId: string | null;
}

export interface CommLogRow {
  id: string; channel: string; direction: string; subject: string | null; body: string | null;
  transcript: string | null; created_at: Date | string;
}
export interface ChatRow { id: string; role: string; content: string; at: Date | string }
export interface RoomRow { id: string; content: string; created_at: Date | string; from_maya: boolean }

export interface MayaMemoryDeps {
  resolve: (anchor: MemoryAnchor) => Promise<ResolvedPerson | null>;
  commLogs: (leadId: number, since: Date | null, limit: number) => Promise<CommLogRow[]>;
  chatMessages: (who: { leadId: number | null; visitorId: string | null }, since: Date | null, limit: number) => Promise<ChatRow[]>;
  roomMessages: (enrollmentId: string, since: Date | null, limit: number) => Promise<RoomRow[]>;
  warn: (event: string, details: Record<string, unknown>) => void;
}

export const MEMORY_TEXT_MAX = 600;
export const MEMORY_DEFAULT_LIMIT = 30;
const DEDUPE_WINDOW_MS = 2 * 60 * 1000;
export const MEMORY_BLOCK_HEADING = 'WHAT MAYA AND THIS PERSON HAVE SAID (all channels)';

/* ── default (database) dependencies ─────────────────────────────────────── */

const COMM_SQL = `SELECT id, channel, direction, subject, body, provider_response->>'transcript' AS transcript, created_at
  FROM communication_logs
  WHERE lead_id = :leadId AND simulation_id IS NULL
    AND channel IN ('email', 'sms', 'voice')
    AND status NOT IN ('failed', 'bounced', 'rejected')
    AND (:since::timestamptz IS NULL OR created_at >= :since::timestamptz)
  ORDER BY created_at DESC LIMIT :limit`;

const ROOM_SQL = `SELECT rm.id, rm.content, rm.created_at, (rm.enrollment_id = :maya) AS from_maya
  FROM room_messages rm
  JOIN community_rooms r ON r.id = rm.room_id AND r.room_type = 'dm'
  WHERE rm.deleted_at IS NULL
    AND rm.room_id IN (
      SELECT a.room_id FROM room_memberships a JOIN room_memberships b ON b.room_id = a.room_id
       WHERE a.enrollment_id = :person AND b.enrollment_id = :maya)
    AND rm.enrollment_id IN (:person, :maya)
    AND (:since::timestamptz IS NULL OR rm.created_at >= :since::timestamptz)
  ORDER BY rm.created_at DESC LIMIT :limit`;

function defaultDeps(): MayaMemoryDeps {
  return {
    resolve: async (anchor) => {
      const { resolveSubject } = await import('../growthJourney/subjectResolver');
      const r = await resolveSubject(anchor);
      if (r.status !== 'resolved') {
        // An anchor the resolver cannot vouch for is still the caller's own record of the person (e.g. a visitor
        // id from a live chat whose visitor row is not linked yet): read with exactly what was supplied.
        if (r.reason === 'anchor_not_found') return null;
        return { leadId: anchor.leadId ?? null, enrollmentId: anchor.enrollmentId ?? null, visitorId: anchor.visitorId ?? null };
      }
      return {
        leadId: r.subject.lead_id,
        enrollmentId: r.subject.enrollment_id,
        visitorId: r.subject.visitor_id ?? anchor.visitorId ?? null,
      };
    },
    commLogs: (leadId, since, limit) => sequelize.query<CommLogRow>(COMM_SQL, {
      type: QueryTypes.SELECT, replacements: { leadId, since: since ? since.toISOString() : null, limit },
    }),
    chatMessages: async (who, since, limit) => {
      const conds: string[] = [];
      const replacements: Record<string, unknown> = { since: since ? since.toISOString() : null, limit };
      if (who.leadId !== null) { conds.push('c.lead_id = :leadId'); replacements.leadId = who.leadId; }
      if (who.visitorId) { conds.push('c.visitor_id = :visitorId'); replacements.visitorId = who.visitorId; }
      if (conds.length === 0) return [];
      return sequelize.query<ChatRow>(
        `SELECT m.id, m.role, m.content, m.timestamp AS at
           FROM chat_messages m JOIN chat_conversations c ON c.id = m.conversation_id
          WHERE (${conds.join(' OR ')}) AND m.role IN ('user', 'assistant')
            AND (:since::timestamptz IS NULL OR m.timestamp >= :since::timestamptz)
          ORDER BY m.timestamp DESC LIMIT :limit`,
        { type: QueryTypes.SELECT, replacements },
      );
    },
    roomMessages: async (enrollmentId, since, limit) => {
      const { getMayaEnrollmentId } = await import('../mayaIdentitySeed');
      const maya = await getMayaEnrollmentId();
      if (!maya || maya === enrollmentId) return [];
      return sequelize.query<RoomRow>(ROOM_SQL, {
        type: QueryTypes.SELECT,
        replacements: { person: enrollmentId, maya, since: since ? since.toISOString() : null, limit },
      });
    },
    warn: (event, details) => console.warn(JSON.stringify({
      timestamp: new Date().toISOString(), level: 'warn', service: 'maya-memory', event, outcome: 'failure', ...details,
    })),
  };
}

/* ── normalization ───────────────────────────────────────────────────────── */

export function cleanText(raw: string | null | undefined, max = MEMORY_TEXT_MAX): string {
  const text = String(raw || '')
    .replace(/<(script|style)[^>]*>[\s\S]*?<\/\1>/gi, ' ')
    .replace(/<br\s*\/?>/gi, ' ')
    .replace(/<[^>]+>/g, ' ')
    .replace(/&nbsp;/g, ' ').replace(/&amp;/g, '&').replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&#39;|&rsquo;/g, "'")
    .replace(/\s+/g, ' ')
    .trim();
  return text.length > max ? `${text.slice(0, max - 3).trimEnd()}...` : text;
}

function toDate(v: Date | string): Date {
  return v instanceof Date ? v : new Date(v);
}

function fromComm(r: CommLogRow): MemoryTurn | null {
  const channel = (['email', 'sms', 'voice'].includes(r.channel) ? r.channel : null) as MemoryChannel | null;
  if (!channel) return null;
  const inbound = r.direction === 'inbound';
  // A call's words live in the transcript the Synthflow webhook stores on provider_response; the body is the prompt.
  const text = cleanText(channel === 'voice' ? (r.transcript || r.body) : r.body);
  if (!text && !r.subject) return null;
  return {
    at: toDate(r.created_at), channel, direction: inbound ? 'inbound' : 'outbound',
    author: inbound ? 'Them' : 'Maya', subject: r.subject ? cleanText(r.subject, 200) : null, text,
    sourceTable: 'communication_logs', sourceId: String(r.id),
  };
}

function fromChat(r: ChatRow): MemoryTurn | null {
  const text = cleanText(r.content);
  if (!text) return null;
  const inbound = r.role === 'user';
  return {
    at: toDate(r.at), channel: 'chat', direction: inbound ? 'inbound' : 'outbound', author: inbound ? 'Them' : 'Maya',
    subject: null, text, sourceTable: 'chat_messages', sourceId: String(r.id),
  };
}

function fromRoom(r: RoomRow): MemoryTurn | null {
  const text = cleanText(r.content);
  if (!text) return null;
  return {
    at: toDate(r.created_at), channel: 'im', direction: r.from_maya ? 'outbound' : 'inbound',
    author: r.from_maya ? 'Maya' : 'Them', subject: null, text, sourceTable: 'room_messages', sourceId: String(r.id),
  };
}

/** De-duplicate: the same row twice, or the same words on the same channel and direction within two minutes. */
export function dedupeTurns(turns: MemoryTurn[]): MemoryTurn[] {
  const seenIds = new Set<string>();
  const kept: MemoryTurn[] = [];
  for (const t of turns.slice().sort((a, b) => a.at.getTime() - b.at.getTime())) {
    const idKey = `${t.sourceTable}:${t.sourceId}`;
    if (seenIds.has(idKey)) continue;
    seenIds.add(idKey);
    const dup = kept.some((k) => k.channel === t.channel && k.direction === t.direction && k.text === t.text
      && (k.subject || '') === (t.subject || '') && Math.abs(k.at.getTime() - t.at.getTime()) <= DEDUPE_WINDOW_MS);
    if (!dup) kept.push(t);
  }
  return kept;
}

/* ── the reader ──────────────────────────────────────────────────────────── */

/**
 * The person's timeline across every Maya surface, oldest first, newest last. Never throws: an unresolvable person
 * or a failed resolver yields []; a failed source is logged and left out.
 */
export async function getMayaTimeline(
  anchor: MemoryAnchor,
  opts: MemoryOptions = {},
  deps: MayaMemoryDeps = defaultDeps(),
): Promise<MemoryTurn[]> {
  const limit = Math.max(1, Math.min(200, opts.limit ?? MEMORY_DEFAULT_LIMIT));
  const since = opts.since ?? null;
  const skip = new Set(opts.excludeSources || []);
  if (!anchor.leadId && !anchor.enrollmentId && !anchor.visitorId) return [];

  let person: ResolvedPerson | null;
  try {
    person = await deps.resolve(anchor);
  } catch (err: unknown) {
    deps.warn('maya_memory.resolve_failed', { error_class: err instanceof Error ? err.name : 'UnknownError' });
    return [];
  }
  if (!person) return [];

  const turns: MemoryTurn[] = [];
  const read = async <R>(source: MemorySourceTable, run: () => Promise<R[]>, map: (r: R) => MemoryTurn | null) => {
    if (skip.has(source)) return;
    try {
      for (const row of await run()) {
        const t = map(row);
        if (t) turns.push(t);
      }
    } catch (err: unknown) {
      deps.warn('maya_memory.source_failed', {
        source, error_class: err instanceof Error ? err.name : 'UnknownError', message: err instanceof Error ? err.message : String(err),
      });
    }
  };

  const p = person;
  await Promise.all([
    p.leadId !== null ? read('communication_logs', () => deps.commLogs(p.leadId as number, since, limit), fromComm) : Promise.resolve(),
    p.leadId !== null || p.visitorId
      ? read('chat_messages', () => deps.chatMessages({ leadId: p.leadId, visitorId: p.visitorId }, since, limit), fromChat)
      : Promise.resolve(),
    p.enrollmentId ? read('room_messages', () => deps.roomMessages(p.enrollmentId as string, since, limit), fromRoom) : Promise.resolve(),
  ]);

  const filtered = turns.filter((t) => t.sourceId !== opts.excludeSourceId && (!since || t.at.getTime() >= since.getTime()));
  const merged = dedupeTurns(filtered);
  return merged.slice(-limit);
}

const CHANNEL_LABEL: Record<MemoryChannel, string> = {
  email: 'email', sms: 'text', voice: 'call', chat: 'website chat', im: 'campus message',
};

function stamp(d: Date): string {
  return d.toLocaleString('en-US', {
    timeZone: 'America/Chicago', month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit',
  });
}

/**
 * The labelled prompt block. Empty string when there is nothing (a surface then adds nothing, never a heading over
 * an empty list). When the turns do not fit `maxChars`, the OLDEST are dropped first and the block says so.
 */
export function formatTimelineForPrompt(turns: MemoryTurn[], maxChars = 4000): string {
  if (!turns || turns.length === 0) return '';
  const header = `${MEMORY_BLOCK_HEADING} - oldest first, newest last, times Central. Use it to stay consistent and build on it; never repeat it word for word and never invent anything that is not here.`;
  const lines = turns.map((t) => {
    const who = t.direction === 'outbound' ? 'Maya ->' : 'Them ->';
    const subj = t.subject ? ` "${t.subject}"` : '';
    return `- ${stamp(t.at)} ${CHANNEL_LABEL[t.channel]} ${who}${subj}${t.text ? `: ${t.text}` : ''}`;
  });
  const kept: string[] = [];
  let used = header.length + 1;
  for (let i = lines.length - 1; i >= 0; i--) {
    if (used + lines[i].length + 1 > maxChars) break;
    kept.unshift(lines[i]);
    used += lines[i].length + 1;
  }
  if (kept.length === 0) return '';
  const dropped = lines.length - kept.length;
  return [header, ...(dropped > 0 ? [`(${dropped} earlier message${dropped === 1 ? '' : 's'} not shown)`] : []), ...kept].join('\n');
}

/** Convenience for the wire-ins: the block for a person, or '' (never throws). */
export async function mayaMemoryBlock(anchor: MemoryAnchor, opts: MemoryOptions & { maxChars?: number } = {}, deps?: MayaMemoryDeps): Promise<string> {
  try {
    const turns = await getMayaTimeline(anchor, opts, deps);
    return formatTimelineForPrompt(turns, opts.maxChars);
  } catch {
    return '';
  }
}
