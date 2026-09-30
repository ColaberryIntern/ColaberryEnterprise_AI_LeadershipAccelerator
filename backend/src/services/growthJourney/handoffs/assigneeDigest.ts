import type { GrowthJourneyHandoffPriority } from '../../../models/GrowthJourneyHandoff';

/**
 * The assignee's daily digest, composed (Phase 5 T517, 5A).
 *
 * PURE. One person's open handoffs in, one mail's subject and body out;
 * nothing here reads a model or sends. The send lives outside the journey
 * tree (`services/briefings/handoffDigestSender.ts`), through the existing
 * guarded mailer, so the no-send scanner keeps this tree as it was.
 *
 * ─── ORDER ─────────────────────────────────────────────────────────────────
 *
 *   urgent first, then priority (critical > high > medium > low), then age
 *   (the older row first), then the id so two rows born in the same
 *   millisecond come out the same way twice.
 *
 * ─── WHAT A LINE CARRIES, AND WHAT IT NEVER CARRIES ────────────────────────
 *
 *   the handoff id, the brand's name, the queue, the priority, the reason,
 *   the SLA (due in / overdue by), and a link to the handoff. Never a lead's
 *   name, address, or message: the input has none of those, and every string
 *   copied from a row passes `safeField` (an `@` is replaced, the length is
 *   bounded). `DIGEST_LINE_CAP` bounds the mail; the rest is one count.
 */

export const HANDOFF_ADMIN_PATH = '/admin/growth-journey/handoffs';
export const DIGEST_LINE_CAP = 50;
export const PRIORITY_RANK: Readonly<Record<GrowthJourneyHandoffPriority, number>> = Object.freeze({ critical: 0, high: 1, medium: 2, low: 3 });
const FIELD_CAP = 120;
const HOUR = 3_600_000;

export interface DigestHandoff {
  id: string;
  brand_id: string;
  owner_queue: string;
  priority: string;
  urgent: boolean;
  reason: string;
  sla_due_at: Date | null;
  created_at: Date;
}

export interface ComposeDigestArgs {
  rows: readonly DigestHandoff[];
  /** brand_id -> the brand's name; an unknown brand is listed by a neutral label, never skipped. */
  brandNames: ReadonlyMap<string, string>;
  /** The admin app's origin, e.g. https://www.refactored.ai - the links are built on it. */
  baseUrl: string;
  asOf: Date;
}

export interface AssigneeDigest {
  subject: string;
  text: string;
  html: string;
  count: number;
  urgent: number;
  /** Row strings that carried an address-like value and were replaced. */
  redacted: number;
}

/** A string copied from a row: never an address, never unbounded. */
export function safeField(v: unknown): { value: string; redacted: boolean } {
  const s = typeof v === 'string' && v.length > 0 ? v : 'unknown';
  return s.includes('@') ? { value: 'redacted', redacted: true } : { value: s.slice(0, FIELD_CAP), redacted: false };
}

const priorityRank = (p: string): number => PRIORITY_RANK[p as GrowthJourneyHandoffPriority] ?? PRIORITY_RANK.low + 1;

/** Urgent first, then priority, then age (older first), then the id. */
export function rankForDigest<T extends DigestHandoff>(rows: readonly T[]): T[] {
  return [...rows].sort((a, b) => {
    if (a.urgent !== b.urgent) return a.urgent ? -1 : 1;
    const p = priorityRank(a.priority) - priorityRank(b.priority);
    if (p !== 0) return p;
    const age = a.created_at.getTime() - b.created_at.getTime();
    if (age !== 0) return age;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
}

/** "due in 3h" / "overdue by 2d" / "no SLA" - whole hours under two days, whole days after. */
export function slaLabel(dueAt: Date | null, asOf: Date): string {
  if (!dueAt) return 'no SLA';
  const ms = dueAt.getTime() - asOf.getTime();
  const abs = Math.abs(ms);
  const span = abs >= 48 * HOUR ? `${Math.floor(abs / (24 * HOUR))}d` : `${Math.max(1, Math.round(abs / HOUR))}h`;
  return ms >= 0 ? `due in ${span}` : `overdue by ${span}`;
}

const escapeHtml = (s: string): string => s.replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c] as string);

/** The mail for one assignee, or null when they have nothing open (no mail is sent for nothing). */
export function composeAssigneeDigest(args: ComposeDigestArgs): AssigneeDigest | null {
  if (args.rows.length === 0) return null;
  const ranked = rankForDigest(args.rows);
  const shown = ranked.slice(0, DIGEST_LINE_CAP);
  const base = safeField(args.baseUrl.replace(/\/+$/, ''));
  let redacted = base.redacted ? 1 : 0;
  const urgent = ranked.filter((r) => r.urgent).length;

  const lines = shown.map((r, i) => {
    const brand = safeField(args.brandNames.get(r.brand_id) ?? 'unknown brand');
    const queue = safeField(r.owner_queue);
    const priority = safeField(r.priority);
    const reason = safeField(r.reason);
    const id = safeField(r.id);
    redacted += [brand, queue, priority, reason, id].filter((f) => f.redacted).length;
    const link = `${base.value}${HANDOFF_ADMIN_PATH}/${id.value}`;
    const head = `${i + 1}. ${r.urgent ? '[URGENT] ' : ''}${priority.value} · ${queue.value} · ${brand.value}`;
    return {
      text: `${head}\n   ${slaLabel(r.sla_due_at, args.asOf)} · reason: ${reason.value}\n   ${link}`,
      html: `<li>${r.urgent ? '<strong>URGENT</strong> ' : ''}${escapeHtml(priority.value)} · ${escapeHtml(queue.value)} · ${escapeHtml(brand.value)}<br>` +
        `${escapeHtml(slaLabel(r.sla_due_at, args.asOf))} · reason: ${escapeHtml(reason.value)}<br><a href="${escapeHtml(link)}">${escapeHtml(link)}</a></li>`,
    };
  });
  const more = ranked.length - shown.length;
  const tail = more > 0 ? `… and ${more} more in the queue` : '';
  const plural = ranked.length === 1 ? '' : 's';
  const subject = `Growth Journey: ${ranked.length} handoff${plural} waiting for you${urgent > 0 ? ` (${urgent} urgent)` : ''}`;
  const intro = `You have ${ranked.length} open handoff${plural} assigned to you${urgent > 0 ? `, ${urgent} urgent` : ''}. Most urgent first, then the oldest.`;
  const text = [intro, '', ...lines.map((l) => l.text)];
  if (tail) text.push(tail);

  return {
    subject,
    text: text.join('\n'),
    html: `<p>${escapeHtml(intro)}</p><ol>${lines.map((l) => l.html).join('')}</ol>${tail ? `<p>${escapeHtml(tail)}</p>` : ''}`,
    count: ranked.length,
    urgent,
    redacted,
  };
}
