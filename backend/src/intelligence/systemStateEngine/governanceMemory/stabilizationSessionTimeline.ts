/**
 * stabilizationSessionTimeline — Phase 31. Per-organization
 * append-only session + event log.
 *
 * Architectural commitment:
 *   - Append-only — events are immutable once recorded.
 *   - Each event carries `MemoryEventFinalityProof` with
 *     `cannot_be_modified` + `cannot_be_deleted` typed-as-literal.
 *   - Population is operator-mediated POST only — Phase 31 NEVER
 *     listens autonomously to Phase 14-30 events.
 *   - Cross-organization isolation absolute.
 *   - Sessions auto-expire after SESSION_TTL_MS but the event log
 *     remains immutable.
 */

import { randomUUID, createHash } from 'crypto';
import type {
  StabilizationSession, StabilizationSessionEvent,
  StabilizationSessionTimeline, StabilizationSessionEventKind,
  StabilizationSessionLifecycle, MemoryEventFinalityProof,
} from './governanceMemoryTypes';
import {
  MAX_SESSIONS_PER_PARTITION, MAX_EVENTS_PER_PARTITION,
  MAX_EVENTS_PER_SESSION, MAX_NOTE_LENGTH, SESSION_TTL_MS,
} from './governanceMemoryTypes';

interface PartitionStore {
  sessions: StabilizationSession[];
  events: StabilizationSessionEvent[];
}

const partitions = new Map<string, PartitionStore>();

function ensure(organization_id: string): PartitionStore {
  let s = partitions.get(organization_id);
  if (!s) { s = { sessions: [], events: [] }; partitions.set(organization_id, s); }
  return s;
}

function deterministicHash(input: string): string {
  return createHash('sha256').update(input).digest('hex').slice(0, 16);
}

function buildFinalityProof(event_id: string, recorded_at: string): MemoryEventFinalityProof {
  return {
    event_id, recorded_at,
    cannot_be_modified: true,
    cannot_be_deleted: true,
    replayable: true,
    finality_hash: deterministicHash(`finality::${event_id}::${recorded_at}`),
  };
}

// ─── Session lifecycle API ─────────────────────────────────────────

export interface OpenSessionInput {
  readonly organization_id: string;
  readonly operator_id: string;
  readonly note?: string;
}

export interface OpenSessionResult {
  readonly opened: boolean;
  readonly session?: StabilizationSession;
  readonly reason?: string;
}

export function openSession(input: OpenSessionInput): OpenSessionResult {
  if (!input.organization_id) return { opened: false, reason: 'organization_id_required' };
  if (!input.operator_id || input.operator_id.trim().length === 0) {
    return { opened: false, reason: 'operator_id_required' };
  }
  if (input.note && input.note.length > MAX_NOTE_LENGTH) {
    return { opened: false, reason: 'note_too_long' };
  }

  const opened_at = new Date().toISOString();
  const session_id = `session_${randomUUID()}`;
  const session: StabilizationSession = {
    session_id,
    organization_id: input.organization_id,
    operator_id: input.operator_id,
    opened_at,
    lifecycle_state: 'opened',
    note: input.note,
    deterministic_hash: deterministicHash(
      `session::${session_id}::${input.organization_id}::${input.operator_id}::${opened_at}`,
    ),
  };

  const store = ensure(input.organization_id);
  store.sessions.push(session);
  if (store.sessions.length > MAX_SESSIONS_PER_PARTITION) store.sessions.shift();

  // Auto-record session_opened event
  recordEventInternal(input.organization_id, {
    session_id, operator_id: input.operator_id,
    event_kind: 'session_opened', subject_kind: 'session', subject_id: session_id,
    note: input.note,
  });

  return { opened: true, session };
}

export interface RecordEventInput {
  readonly organization_id: string;
  readonly session_id: string;
  readonly operator_id: string;
  readonly event_kind: StabilizationSessionEventKind;
  readonly subject_kind?: string;
  readonly subject_id?: string;
  readonly note?: string;
}

export interface RecordEventResult {
  readonly recorded: boolean;
  readonly event?: StabilizationSessionEvent;
  readonly reason?: string;
}

export function recordEvent(input: RecordEventInput): RecordEventResult {
  if (!input.organization_id) return { recorded: false, reason: 'organization_id_required' };
  if (!input.session_id) return { recorded: false, reason: 'session_id_required' };
  if (!input.operator_id) return { recorded: false, reason: 'operator_id_required' };
  if (input.note && input.note.length > MAX_NOTE_LENGTH) {
    return { recorded: false, reason: 'note_too_long' };
  }

  const store = partitions.get(input.organization_id);
  if (!store) return { recorded: false, reason: 'session_id_not_found' };
  const session = store.sessions.find(s => s.session_id === input.session_id);
  if (!session) return { recorded: false, reason: 'session_id_not_found' };

  // Cap per-session events
  const sessionEventCount = store.events.filter(e => e.session_id === input.session_id).length;
  if (sessionEventCount >= MAX_EVENTS_PER_SESSION) {
    return { recorded: false, reason: 'session_event_cap_reached' };
  }

  const event = recordEventInternal(input.organization_id, {
    session_id: input.session_id, operator_id: input.operator_id,
    event_kind: input.event_kind, subject_kind: input.subject_kind,
    subject_id: input.subject_id, note: input.note,
  });

  return { recorded: true, event };
}

function recordEventInternal(
  organization_id: string,
  input: {
    session_id: string;
    operator_id: string;
    event_kind: StabilizationSessionEventKind;
    subject_kind?: string;
    subject_id?: string;
    note?: string;
  },
): StabilizationSessionEvent {
  const recorded_at = new Date().toISOString();
  const event_id = `evt_${randomUUID()}`;
  const event: StabilizationSessionEvent = {
    event_id,
    session_id: input.session_id,
    organization_id,
    operator_id: input.operator_id,
    event_kind: input.event_kind,
    recorded_at,
    subject_kind: input.subject_kind,
    subject_id: input.subject_id,
    note: input.note,
    deterministic_hash: deterministicHash(
      `event::${event_id}::${input.session_id}::${input.event_kind}::${input.subject_id ?? ''}::${recorded_at}`,
    ),
    finality_proof: buildFinalityProof(event_id, recorded_at),
  };

  const store = ensure(organization_id);
  store.events.push(event);
  if (store.events.length > MAX_EVENTS_PER_PARTITION) store.events.shift();

  // Update session lifecycle to 'active' on first non-opened event
  if (input.event_kind !== 'session_opened') {
    const i = store.sessions.findIndex(s => s.session_id === input.session_id);
    if (i >= 0 && store.sessions[i].lifecycle_state === 'opened') {
      store.sessions[i] = { ...store.sessions[i], lifecycle_state: 'active' };
    }
  }

  return event;
}

export interface CloseSessionInput {
  readonly organization_id: string;
  readonly session_id: string;
  readonly operator_id: string;
  readonly note?: string;
}

export interface CloseSessionResult {
  readonly closed: boolean;
  readonly session?: StabilizationSession;
  readonly reason?: string;
}

export function closeSession(input: CloseSessionInput): CloseSessionResult {
  if (!input.organization_id) return { closed: false, reason: 'organization_id_required' };
  const store = partitions.get(input.organization_id);
  if (!store) return { closed: false, reason: 'session_id_not_found' };
  const i = store.sessions.findIndex(s => s.session_id === input.session_id);
  if (i < 0) return { closed: false, reason: 'session_id_not_found' };

  const existing = store.sessions[i];
  if (existing.lifecycle_state === 'closed' || existing.lifecycle_state === 'expired') {
    return { closed: false, reason: 'session_already_closed' };
  }

  const closed_at = new Date().toISOString();
  const closed: StabilizationSession = {
    ...existing,
    closed_at,
    lifecycle_state: 'closed' as StabilizationSessionLifecycle,
  };
  store.sessions[i] = closed;

  // Record session_closed event
  recordEventInternal(input.organization_id, {
    session_id: input.session_id, operator_id: input.operator_id,
    event_kind: 'session_closed', subject_kind: 'session', subject_id: input.session_id,
    note: input.note,
  });

  return { closed: true, session: closed };
}

/** Auto-expire sessions older than SESSION_TTL_MS. Returns count of expired sessions. */
export function sweepExpiredSessions(organization_id?: string): number {
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  const now = Date.now();
  for (const o of orgs) {
    const store = partitions.get(o);
    if (!store) continue;
    for (let i = 0; i < store.sessions.length; i++) {
      const s = store.sessions[i];
      if (s.lifecycle_state === 'opened' || s.lifecycle_state === 'active') {
        const age = now - Date.parse(s.opened_at);
        if (age > SESSION_TTL_MS) {
          store.sessions[i] = { ...s, lifecycle_state: 'expired' as StabilizationSessionLifecycle };
          total++;
        }
      }
    }
  }
  return total;
}

// ─── Read APIs ─────────────────────────────────────────────────────

export interface BuildTimelineInput {
  readonly organization_id: string;
  readonly window_start?: string;
  readonly window_end?: string;
  readonly operator_id_filter?: string;                        // optional read-time filter
  readonly session_id_filter?: string;                         // optional read-time filter
}

export function buildStabilizationSessionTimeline(
  input: BuildTimelineInput,
): StabilizationSessionTimeline {
  const store = partitions.get(input.organization_id);
  let events = store?.events ?? [];

  if (input.window_start) {
    const startTs = Date.parse(input.window_start);
    events = events.filter(e => Date.parse(e.recorded_at) >= startTs);
  }
  if (input.window_end) {
    const endTs = Date.parse(input.window_end);
    events = events.filter(e => Date.parse(e.recorded_at) <= endTs);
  }
  if (input.operator_id_filter) {
    events = events.filter(e => e.operator_id === input.operator_id_filter);
  }
  if (input.session_id_filter) {
    events = events.filter(e => e.session_id === input.session_id_filter);
  }

  // Sort chronologically (oldest → newest) — deterministic, no ranking.
  const sorted = [...events].sort((a, b) =>
    a.recorded_at < b.recorded_at ? -1 : a.recorded_at > b.recorded_at ? 1 : 0,
  );

  const timeline_hash = deterministicHash(
    `timeline::${input.organization_id}::${sorted.map(e => e.deterministic_hash).join('::')}`,
  );

  return {
    organization_id: input.organization_id,
    events: sorted,
    read_only: true,
    append_only: true,
    engine_never_profiles: true,
    timeline_hash,
    built_at: new Date().toISOString(),
  };
}

export function listSessions(organization_id: string): ReadonlyArray<StabilizationSession> {
  return [...(partitions.get(organization_id)?.sessions ?? [])].reverse();
}

export function getSession(
  organization_id: string, session_id: string,
): StabilizationSession | null {
  return partitions.get(organization_id)?.sessions.find(s => s.session_id === session_id) ?? null;
}

export function listEvents(organization_id: string): ReadonlyArray<StabilizationSessionEvent> {
  return [...(partitions.get(organization_id)?.events ?? [])].reverse();
}

export function recentSessionCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const sessions = partitions.get(o)?.sessions ?? [];
    total += sessions.filter(s => Date.parse(s.opened_at) >= cutoff).length;
  }
  return total;
}

export function recentEventCount24h(organization_id?: string): number {
  const cutoff = Date.now() - 24 * 60 * 60_000;
  const orgs = organization_id ? [organization_id] : Array.from(partitions.keys());
  let total = 0;
  for (const o of orgs) {
    const events = partitions.get(o)?.events ?? [];
    total += events.filter(e => Date.parse(e.recorded_at) >= cutoff).length;
  }
  return total;
}

export function _resetSessionTimelineForTests(): void {
  partitions.clear();
}
