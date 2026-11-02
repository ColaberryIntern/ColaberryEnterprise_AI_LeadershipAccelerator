import type { CampusPresence } from '../campusApi';
import type { OrgRosterMember } from '../../../services/orgApi';

/**
 * C23 WP-9: the Partner Office's team list, pure so every rule is tested. Each row is a real roster member
 * (GET /api/portal/org/members): their name, team, readiness (the server's 0-100 score; there is no per-lesson percentage on the
 * server) and whether they are on campus right now (live presence, which a partner's server limits to their own team). Never an
 * invented person or number.
 */
export interface PartnerRow { id: string; name: string; team: string; readiness: number; onCampus: boolean }

/** Every enrollment id the presence names, in any building or out on the Quad. */
export function onCampusIds(presence: CampusPresence | null | undefined): Set<string> {
  const ids = new Set<string>();
  if (!presence) return ids;
  for (const area of Object.values(presence)) {
    for (const e of area?.people ?? []) if ('enrollment_id' in e && e.enrollment_id) ids.add(e.enrollment_id);
  }
  return ids;
}

const clampPct = (n: number) => (Number.isFinite(n) ? Math.max(0, Math.min(100, Math.round(n))) : 0);

/** On campus first, then by readiness (highest first), then by name; the order a manager scans for who is active. */
export function partnerRows(roster: OrgRosterMember[], here: Set<string>): PartnerRow[] {
  return roster
    .map((m) => ({ id: m.enrollment_id, name: m.name || 'Unnamed', team: m.team?.trim() || 'Unassigned', readiness: clampPct(m.readiness), onCampus: here.has(m.enrollment_id) }))
    .sort((a, b) => Number(b.onCampus) - Number(a.onCampus) || b.readiness - a.readiness || a.name.localeCompare(b.name));
}

/** One CSV cell: quoted when it holds a comma, quote or line break; a leading =,+,-,@ is prefixed so a spreadsheet never runs it. */
export function csvCell(v: string | number): string {
  let s = String(v);
  if (/^[=+\-@]/.test(s)) s = `'${s}`;
  return /[",\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

/** The roster as a CSV the manager can open in a spreadsheet: the same columns the server gives, nothing derived but On campus. */
export function rosterCsv(roster: OrgRosterMember[], here: Set<string>): string {
  const head = ['Name', 'Team', 'Rung', 'Readiness %', 'Points', 'Streak (days)', 'Builder XP this week', 'On campus now'];
  const rows = roster.map((m) => [m.name, m.team ?? 'Unassigned', m.band_rung ?? m.level, clampPct(m.readiness), m.total_points, m.streak, m.builder_xp_week,
    here.has(m.enrollment_id) ? 'Yes' : 'No']);
  return [head, ...rows].map((r) => r.map(csvCell).join(',')).join('\r\n') + '\r\n';
}

/** "acme-logistics-team-2026-11-02.csv" (Central date), or "my-team-…" without a company name. */
export function csvFileName(company: string | null, now: Date): string {
  const ymd = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Chicago', year: 'numeric', month: '2-digit', day: '2-digit' }).format(now);
  const slug = (company ?? '').toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 40);
  return `${slug || 'my'}-team-${ymd}.csv`;
}

/** The invite box: one or more emails, split on commas, spaces or new lines; each checked; at most 50 at a time. */
export const INVITE_MAX = 50;
export function parseInviteEmails(text: string): { emails: string[]; bad: string[] } {
  const parts = text.split(/[\s,;]+/).map((s) => s.trim().toLowerCase()).filter(Boolean);
  const emails: string[] = [], bad: string[] = [];
  for (const s of parts) {
    if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s)) bad.push(s);
    else if (!emails.includes(s)) emails.push(s);
  }
  return { emails, bad };
}
