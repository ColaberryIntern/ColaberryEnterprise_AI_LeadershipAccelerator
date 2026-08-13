import type { Tone } from '../components/admin/shell/StatusBadge';

// ─── Ticket Type Meta ────────────────────────────────────────────────────────
// Single source of truth for "how does a ticket type look/read" on the admin
// ticket board. Fixes a real staleness bug: AdminTicketBoardPage.tsx used to hold
// THREE separate hardcoded type lists (filter dropdown, New Ticket modal dropdown,
// TYPE_TONE color map) that were never updated when backend/src/models/Ticket.ts's
// TicketType union grew — 'student_support' (Reese Phase 1) and
// 'reese_autonomous_outreach' (Reese Phase 2) shipped with real production tickets
// but no way to filter to them and no distinct badge color (generic gray fallback).
//
// This module only supplies LABELS and COLORS for types we know about; it never
// decides which types are selectable in a filter — that's driven by real ticket
// data (see buildTicketTypeFilterOptions below), so a NEW TicketType union member
// can never again silently vanish from the board the way these two did. A type not
// listed here still renders (humanized fallback label, neutral tone) — see
// getTicketTypeLabel/getTicketTypeTone.

export interface TicketTypeMetaEntry {
  label: string;
  tone: Tone;
}

const TICKET_TYPE_META: Record<string, TicketTypeMetaEntry> = {
  task: { label: 'Task', tone: 'neutral' },
  bug: { label: 'Bug', tone: 'danger' },
  feature: { label: 'Feature', tone: 'success' },
  curriculum: { label: 'Curriculum', tone: 'info' },
  agent_action: { label: 'Agent Action', tone: 'primary' },
  strategic: { label: 'Strategic', tone: 'warning' },
  // Reese Phase 1 — a real student DM conversation with the Reese AI staff mentor.
  student_support: { label: 'Student Support', tone: 'violet' },
  // Reese Phase 2 — an autonomous (Reese-initiated) outreach thread.
  reese_autonomous_outreach: { label: 'Reese Outreach', tone: 'teal' },
};

/** 'some_raw_type' -> 'Some Raw Type', for any type not in TICKET_TYPE_META. */
function humanize(raw: string): string {
  return raw
    .split('_')
    .filter(Boolean)
    .map((word) => word.charAt(0).toUpperCase() + word.slice(1))
    .join(' ');
}

export function getTicketTypeLabel(type: string): string {
  if (!type) return 'Unknown';
  return TICKET_TYPE_META[type]?.label ?? humanize(type);
}

export function getTicketTypeTone(type: string): Tone {
  return TICKET_TYPE_META[type]?.tone ?? 'neutral';
}

export interface TicketTypeFilterOption {
  value: string;
  label: string;
  count: number;
}

/**
 * Builds the ticket-board Type filter's option list directly from real ticket data
 * (stats.byType — computed by backend ticketService.getTicketStats() from actual
 * ticket rows, not a fixed list) rather than a hardcoded array. A type present on a
 * real ticket is ALWAYS listed here, known to TICKET_TYPE_META or not — this is the
 * guarantee that makes the filter dropdown non-stale: it can never again silently
 * omit a real, in-use TicketType the way the old hardcoded <select> did.
 */
export function buildTicketTypeFilterOptions(byType: Record<string, number> | null | undefined): TicketTypeFilterOption[] {
  return Object.entries(byType || {})
    .filter(([, count]) => count > 0)
    .map(([value, count]) => ({ value, label: getTicketTypeLabel(value), count }))
    .sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

// ─── Ticket Status Meta ──────────────────────────────────────────────────────
// Same "single source of truth" pattern as TICKET_TYPE_META above, for the
// backend's TicketStatus union (backend/src/models/Ticket.ts). Fixes a real bug
// Ali found live: the Agent Dashboard's ticket-activity table rendered Status as
// plain text with a single fixed gray badge class for every row — no color varied
// by value. `StatusBadge`'s own WORD_TONE fallback doesn't cover these exact status
// strings (e.g. 'in_progress', 'in_review' aren't in its generic word list), so
// this module supplies the same kind of explicit, tested mapping TICKET_TYPE_META
// already supplies for type.

const TICKET_STATUS_META: Record<string, TicketTypeMetaEntry> = {
  backlog: { label: 'Backlog', tone: 'neutral' },
  todo: { label: 'To Do', tone: 'info' },
  in_progress: { label: 'In Progress', tone: 'primary' },
  in_review: { label: 'In Review', tone: 'warning' },
  done: { label: 'Done', tone: 'success' },
  cancelled: { label: 'Cancelled', tone: 'danger' },
};

/** A status not in TICKET_STATUS_META still renders (humanized fallback, neutral
 * tone) rather than vanishing — same never-vanishes guarantee as getTicketTypeLabel. */
export function getTicketStatusLabel(status: string): string {
  if (!status) return 'Unknown';
  return TICKET_STATUS_META[status]?.label ?? humanize(status);
}

export function getTicketStatusTone(status: string): Tone {
  return TICKET_STATUS_META[status]?.tone ?? 'neutral';
}

// ─── Staleness ───────────────────────────────────────────────────────────────
// "Anything over 3 days old should have a valid reason why it's still open"
// (Ali, live feedback). Visibility only — this never changes a ticket's status,
// never auto-closes, never auto-escalates; it just answers "is this stale" for a
// banner/chip to render conditionally.

export const STALE_THRESHOLD_MS = 3 * 24 * 60 * 60 * 1000;

const TERMINAL_STATUSES = new Set(['done', 'cancelled']);

/**
 * A closed ticket is never "stale" regardless of age — closure means the work
 * concluded, not that it's languishing. Only an open ticket whose last activity
 * (tickets.updated_at, reliably bumped by every activity-producing path in
 * ticketService.ts) is 3+ days old is flagged.
 */
export function isTicketStale(updatedAt: string | Date | null | undefined, status: string): boolean {
  if (TERMINAL_STATUSES.has(status)) return false;
  if (!updatedAt) return false;
  const d = updatedAt instanceof Date ? updatedAt : new Date(updatedAt);
  if (Number.isNaN(d.getTime())) return false;
  return Date.now() - d.getTime() >= STALE_THRESHOLD_MS;
}
