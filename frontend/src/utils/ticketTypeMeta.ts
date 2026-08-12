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
