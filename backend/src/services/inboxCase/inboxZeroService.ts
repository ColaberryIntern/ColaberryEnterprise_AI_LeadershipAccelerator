import { randomUUID } from 'crypto';
import { Op } from 'sequelize';
import InboxCase from '../../models/InboxCase';
import InboxCaseItem from '../../models/InboxCaseItem';
import InboxCaseAction from '../../models/InboxCaseAction';
import InboxCommitment from '../../models/InboxCommitment';
import InboxVip from '../../models/InboxVip';
import { CaseState, PriorityBand, readResponseNeeded, ResponseNeededRead } from '../../types/inboxCase';
import { getBackoffStatus } from '../inbox/inboxSyncBackoff';
import { getColaberryGmailClient, getPersonalGmailClient } from '../inbox/inboxSyncService';
import { isConfigured as isHotmailConfigured } from '../inbox/graphMailService';
import { getBcToken } from '../ops/basecampToken';
import { bcGet } from '../ops/basecampClient';
import { itemInjectionSignals } from './promptSafety';
import { verifyCaseLivenessNow } from './inboxLivenessService';
import { allGoneCaseIds, loadVisibleCases, LivenessSummary } from './inboxZeroVisibility';

export type { LivenessSummary, VisibleCases } from './inboxZeroVisibility';
export { loadVisibleCases } from './inboxZeroVisibility';
import InboxClassification from '../../models/InboxClassification';

// /inbox-zero operator service (T9a). The read model behind the console:
// what is healthy, what is actionable, what comes first and WHY, and what
// changed since the operator's cursor. Pure reads — nothing here writes a
// case. Every external write still goes through the existing case
// approve/execute endpoints and their approval gates.
//
// Gate 2 only: every case this service sees was created by the auto-sync
// from mail that survived gate 1 (caseAutoSyncService.filterToInScopeEmails),
// or from Basecamp. Nothing here reaches behind gate 1.
//
// Liveness (T16, Ali: "only my current inboxes"): every read below goes
// through inboxZeroVisibility.loadVisibleCases(), which hides any case whose
// evidence has ALL been confirmed gone from the inbox. An item never checked
// is shown and counted as unverified, never silently treated as gone — and
// `next` asks the provider about its candidate before handing it to Ali.

export const INBOX_ZERO_PROVIDERS = ['gmail_colaberry', 'gmail_personal', 'hotmail'] as const;
export type InboxZeroProvider = (typeof INBOX_ZERO_PROVIDERS)[number];

export interface ProviderHealth {
  provider: InboxZeroProvider;
  configured: boolean;
  consecutive_failures: number;
  next_attempt_at: string | null;
  state: 'healthy' | 'degraded' | 'not_configured';
}

export interface InboxZeroHealth {
  providers: ProviderHealth[];
  basecamp: 'healthy' | 'not_configured' | 'degraded' | 'unprobed';
  degraded: boolean;
  degraded_reasons: string[];
}

export type CaseCategory = 'due_now' | 'needs_decision' | 'unassessed' | 'waiting' | 'review' | 'snoozed';

export interface OverviewCounts {
  due_now: number;
  needs_decision: number;
  /** Cases the engine has not assessed yet (DISCOVERING / ASSESSING / REOPENED).
   * These ARE actionable — the 625-case backlog this build exists for sits here. */
  unassessed: number;
  waiting: number;
  /** In flight with the system (EXECUTING); nothing for Ali to do this second. */
  review: number;
  snoozed: number;
  new_since_cursor: number;
  /** Gate 1's work in the last 24h: messages classified AUTOMATION and archived.
   * Read-only count from inbox_classifications; null if that read failed. */
  noise_24h: number | null;
}

export interface CaseSummary {
  id: string;
  title: string;
  state: CaseState;
  priority_band: PriorityBand | null;
  priority_reason: string | null;
  category: CaseCategory;
  sla_due_at: string | null;
  snoozed_until: string | null;
  opened_at: string;
  updated_at: string;
  response: ResponseNeededRead;
  score: number;
  why: string;
}

export type InboxZeroStatus = 'ACTIVE' | 'DEGRADED' | 'ZERO';

export interface Overview {
  status: InboxZeroStatus;
  generated_at: string;
  health: InboxZeroHealth;
  counts: OverviewCounts;
  recommended: CaseSummary | null;
  bottom_line: string;
  liveness: LivenessSummary;
}

// States in which Ali has something to decide or send.
export const ACTIONABLE_STATES: CaseState[] = ['NEEDS_ALI', 'READY_TO_PLAN', 'AWAITING_APPROVAL', 'FAILED'];
// States the engine has not assessed yet. Every auto-synced case starts in
// ASSESSING and only a human `assess` moves it, so these are ACTIONABLE too:
// the work is "run assess + plan", and an unassessed queue is never zero.
export const UNASSESSED_STATES: CaseState[] = ['DISCOVERING', 'ASSESSING', 'REOPENED'];
const WAITING_STATES: CaseState[] = ['WAITING', 'DELEGATED'];

// ─── Health ──────────────────────────────────────────────────────────────────

function providerHealth(provider: InboxZeroProvider, configured: boolean): ProviderHealth {
  const b = getBackoffStatus(provider);
  const state: ProviderHealth['state'] = !configured ? 'not_configured' : b.consecutiveFailures > 0 ? 'degraded' : 'healthy';
  return { provider, configured, consecutive_failures: b.consecutiveFailures, next_attempt_at: b.nextAttemptAt, state };
}

function basecampConfigured(): boolean {
  try {
    getBcToken();
    return true;
  } catch {
    return false;
  }
}

/** Never lies: a configured provider with consecutive failures makes the whole
 * console DEGRADED, and DEGRADED can never be reported as ZERO. Synchronous:
 * mailbox health comes from in-memory backoff state. Basecamp is reported
 * `unprobed` here; getOverview() probes it live (see probeBasecamp). */
export function getHealth(): InboxZeroHealth {
  const providers: ProviderHealth[] = [
    providerHealth('gmail_colaberry', !!getColaberryGmailClient()),
    providerHealth('gmail_personal', !!getPersonalGmailClient()),
    providerHealth('hotmail', isHotmailConfigured()),
  ];
  const degraded_reasons = providers
    .filter((p) => p.state === 'degraded')
    .map((p) => `${p.provider}: ${p.consecutive_failures} consecutive sync failure(s), next attempt ${p.next_attempt_at ?? 'unknown'}`);
  return {
    providers,
    basecamp: basecampConfigured() ? 'unprobed' : 'not_configured',
    degraded: degraded_reasons.length > 0,
    degraded_reasons,
  };
}

/** Live Basecamp probe: one cheap authenticated GET, bounded by the client's
 * own timeout. A configured Basecamp that cannot answer degrades the view —
 * the brief's "never celebrate zero while Basecamp is degraded". */
export async function probeBasecamp(): Promise<{ state: InboxZeroHealth['basecamp']; reason: string | null }> {
  if (!basecampConfigured()) return { state: 'not_configured', reason: null };
  try {
    await bcGet('/my/profile.json');
    return { state: 'healthy', reason: null };
  } catch (err: any) {
    return { state: 'degraded', reason: `basecamp: ${err?.error_class || err?.name || 'Error'}: ${String(err?.message ?? err).slice(0, 120)}` };
  }
}

/** getHealth() plus the live Basecamp probe. This is what the overview uses. */
export async function getFullHealth(): Promise<InboxZeroHealth> {
  const h = getHealth();
  const bc = await probeBasecamp();
  const reasons = bc.reason ? [...h.degraded_reasons, bc.reason] : h.degraded_reasons;
  return { ...h, basecamp: bc.state, degraded: reasons.length > 0, degraded_reasons: reasons };
}

// ─── Categorisation and explainable priority ─────────────────────────────────

const PRIORITY_SCORE: Record<PriorityBand, number> = { P0: 1000, P1: 500, P2: 100, P3: 0 };
const STATE_SCORE: Partial<Record<CaseState, number>> = { AWAITING_APPROVAL: 300, FAILED: 250, NEEDS_ALI: 200, REOPENED: 150, READY_TO_PLAN: 100, ASSESSING: 50, DISCOVERING: 50 };

export function categorise(c: InboxCase, now: Date): CaseCategory {
  if (c.snoozed_until && new Date(c.snoozed_until) > now) return 'snoozed';
  const overdue = !!c.sla_due_at && new Date(c.sla_due_at) < now;
  const urgent = c.priority_band === 'P0' || c.priority_band === 'P1' || overdue;
  if (ACTIONABLE_STATES.includes(c.state)) return urgent ? 'due_now' : 'needs_decision';
  // An unassessed case with a P0/P1 override or a blown SLA is due now too.
  if (UNASSESSED_STATES.includes(c.state)) return urgent ? 'due_now' : 'unassessed';
  if (WAITING_STATES.includes(c.state)) return 'waiting';
  return 'review';
}

/** The categories that stop the console from saying ZERO. */
export const ACTIONABLE_CATEGORIES: CaseCategory[] = ['due_now', 'needs_decision', 'unassessed'];

/** Deterministic, explainable ranking. The `why` is what the console shows
 * Ali so he can see why an item is first and correct a bad ranking. */
export function scoreCase(c: InboxCase, now: Date): { score: number; why: string } {
  const reasons: string[] = [];
  let score = 0;
  if (c.priority_band) {
    score += PRIORITY_SCORE[c.priority_band];
    reasons.push(`${c.priority_band}${c.priority_reason ? ` (${c.priority_reason})` : ''}`);
  }
  if (c.sla_due_at && new Date(c.sla_due_at) < now) {
    score += 400;
    reasons.push(`follow-up overdue since ${new Date(c.sla_due_at).toISOString().slice(0, 10)}`);
  }
  const stateScore = STATE_SCORE[c.state] ?? 0;
  if (stateScore) {
    score += stateScore;
    reasons.push(
      c.state === 'AWAITING_APPROVAL' ? 'has a plan waiting for your approval'
        : c.state === 'FAILED' ? 'an action failed or could not be verified'
        : c.state === 'NEEDS_ALI' ? 'has an open question only you can answer'
        : c.state === 'REOPENED' ? 'new activity on something you had already handled — needs re-assessment'
        : c.state === 'ASSESSING' || c.state === 'DISCOVERING' ? 'not yet assessed — run assess'
        : 'assessed and ready to plan',
    );
  }
  const r = readResponseNeeded(c.assessment);
  if (r.verdict === 'YES') {
    score += 50;
    reasons.push(`response needed (${r.confidence}%)`);
  } else if (r.verdict === 'UNCERTAIN') {
    reasons.push(r.legacy ? 'not yet assessed under the response-needed contract' : `response uncertain (${r.confidence}%)`);
  }
  const ageDays = Math.max(0, (now.getTime() - new Date(c.opened_at).getTime()) / 86_400_000);
  const ageScore = Math.min(100, Math.floor(ageDays) * 5);
  if (ageScore) {
    score += ageScore;
    reasons.push(`${Math.floor(ageDays)}d old`);
  }
  return { score, why: reasons.join(' · ') || 'no ranking signals yet' };
}

export function summarise(c: InboxCase, now: Date): CaseSummary {
  const { score, why } = scoreCase(c, now);
  return {
    id: c.id,
    title: c.title,
    state: c.state,
    priority_band: c.priority_band ?? null,
    priority_reason: c.priority_reason ?? null,
    category: categorise(c, now),
    sla_due_at: c.sla_due_at ? new Date(c.sla_due_at).toISOString() : null,
    snoozed_until: c.snoozed_until ? new Date(c.snoozed_until).toISOString() : null,
    opened_at: new Date(c.opened_at).toISOString(),
    updated_at: new Date(c.updated_at).toISOString(),
    response: readResponseNeeded(c.assessment),
    score,
    why,
  };
}

// ─── Overview ────────────────────────────────────────────────────────────────

// Gate 1's own work, for the "safe noise" row: how much the inbox manager
// archived in the last day. A READ of a COS table (never a write); if it
// fails the row shows null rather than a guess.
async function noiseLast24h(now: Date): Promise<number | null> {
  try {
    // classified_at is the model's timestamp (there is no created_at on
    // inbox_classifications) — the same column every COS sibling filters on.
    return await InboxClassification.count({ where: { state: 'AUTOMATION', classified_at: { [Op.gte]: new Date(now.getTime() - 86_400_000) } } as any }); // `as any`: Op-keyed where
  } catch (err: any) {
    console.error(JSON.stringify({
      timestamp: now.toISOString(), level: 'error', service: 'inboxZeroService', event: 'noise_count_read_failed',
      outcome: 'failure', error_class: err?.error_class || err?.name || 'UnknownError', context: { message: String(err?.message ?? err).slice(0, 200) },
    }));
    return null;
  }
}

export async function getOverview(cursorAt: string | null, now: Date = new Date()): Promise<Overview> {
  const [health, visible, noise_24h] = await Promise.all([getFullHealth(), loadVisibleCases(), noiseLast24h(now)]);
  const open = visible.cases;
  const summaries = open.map((c) => summarise(c, now));

  const counts: OverviewCounts = { due_now: 0, needs_decision: 0, unassessed: 0, waiting: 0, review: 0, snoozed: 0, new_since_cursor: 0, noise_24h };
  for (const s of summaries) counts[s.category]++;
  const cursorMs = cursorAt ? Date.parse(cursorAt) : null;
  if (cursorMs !== null) counts.new_since_cursor = open.filter((c) => new Date(c.created_at).getTime() > cursorMs).length;

  const recommended = pickRecommended(summaries);
  const actionable = counts.due_now + counts.needs_decision + counts.unassessed;

  let status: InboxZeroStatus;
  if (health.degraded) status = 'DEGRADED';
  else if (actionable === 0) status = 'ZERO';
  else status = 'ACTIVE';

  return { status, generated_at: now.toISOString(), health, counts, recommended, bottom_line: bottomLine(status, counts, recommended, health, visible.liveness), liveness: visible.liveness };
}

function pickRecommended(summaries: CaseSummary[]): CaseSummary | null {
  const candidates = summaries.filter((s) => ACTIONABLE_CATEGORIES.includes(s.category));
  if (candidates.length === 0) return null;
  return candidates.sort((a, b) => b.score - a.score || a.opened_at.localeCompare(b.opened_at))[0];
}

function bottomLine(status: InboxZeroStatus, counts: OverviewCounts, rec: CaseSummary | null, health: InboxZeroHealth, liveness?: LivenessSummary): string {
  const unverified = liveness && liveness.unchecked_items > 0 ? ` ${liveness.unchecked_items} item(s) have not yet been checked against your inbox.` : '';
  if (status === 'DEGRADED') {
    return `A source is degraded (${health.degraded_reasons.join('; ')}), so this view may be incomplete. ${counts.due_now + counts.needs_decision + counts.unassessed} item(s) still need you.${unverified}`;
  }
  if (status === 'ZERO') {
    return counts.waiting > 0
      ? `Actionable zero. Nothing needs you right now; ${counts.waiting} item(s) are waiting on someone else.`
      : 'Actionable zero. Nothing needs you right now.';
  }
  const parts = [`${counts.due_now} due now`, `${counts.needs_decision} need a decision`, `${counts.unassessed} not yet assessed`, `${counts.waiting} waiting on others`];
  return `${parts.join(', ')}. First: ${rec ? `"${rec.title}" — ${rec.why}` : 'nothing ranked'}.${unverified}`;
}

// ─── Delta since cursor ──────────────────────────────────────────────────────

export interface Delta {
  since: string;
  /** Open, visible cases that changed since the cursor — what "+N new" may claim. */
  count: number;
  cases: CaseSummary[];
  /** The only things allowed to interrupt a focused operator. */
  interrupts: CaseSummary[];
  /** Cases that reached RESOLVED since the cursor (Ali's decisions AND the
   * liveness sweep clearing mail that left the inbox). Reported separately so
   * a sweep that closes forty archived cases never reads as "+40 new". */
  closed: number;
  /** Still-open cases hidden because their evidence has all left the inbox. */
  hidden_gone: number;
  next_cursor: string;
}

export async function getDelta(since: string, now: Date = new Date()): Promise<Delta> {
  const rows = await InboxCase.findAll({
    where: { updated_at: { [Op.gt]: new Date(since) } } as any, // `as any`: Op-keyed where; served by idx_inbox_cases_updated_at
    order: [['updated_at', 'ASC']],
    limit: 200,
  });
  // Sorted here as well as in the query so the cursor semantics do not depend
  // on the driver honouring `order` (and so a test fake behaves like Postgres).
  const sorted = [...rows].sort((a, b) => new Date(a.updated_at).getTime() - new Date(b.updated_at).getTime() || a.id.localeCompare(b.id));
  const stillOpen = sorted.filter((c) => c.state !== 'RESOLVED');
  const closed = sorted.length - stillOpen.length;
  const goneIds = await allGoneCaseIds(stillOpen.map((c) => c.id));
  const cases = stillOpen.filter((c) => !goneIds.has(c.id)).map((c) => summarise(c, now));
  const interrupts = cases.filter((s) => s.category === 'due_now' && (s.priority_band === 'P0' || s.priority_band === 'P1'));
  // The cursor still advances past EVERY row read (closed and hidden included),
  // otherwise the same closed cases would be re-read on every tick forever.
  const nextCursor = sorted.length ? new Date(sorted[sorted.length - 1].updated_at).toISOString() : since;
  return { since, count: cases.length, cases, interrupts, closed, hidden_gone: goneIds.size, next_cursor: nextCursor };
}

// ─── Next item and its focus payload ─────────────────────────────────────────

export type FocusMode = 'urgent' | 'vip' | 'waiting' | 'basecamp' | 'email';

export interface FocusPayload {
  summary: CaseSummary;
  case: { id: string; title: string; mode: string; state: CaseState; objective: string | null; summary: string | null; recommendation: string | null; confidence: number | null; reopen_count: number; waiting_since: string | null };
  items: Array<{ id: string; source_type: string; provider: string; title: string; occurred_at: string; source_url: string | null; disposition: string | null; from: string | null }>;
  actions: Array<{ id: string; action_type: string; status: string; preview: string; requires_individual_approval: boolean; risk_level: string }>;
  commitments: Array<{ id: string; statement: string; due_at: string | null; status: string; source: string }>;
  destination: ResponseNeededRead['channel'];
  owner: 'ALI' | 'TEAM_MEMBER' | 'SENDER' | 'SYSTEM';
  current_owner: string | null;
  degraded: boolean;
  /** Just-in-time inbox check on this case's open items (T16). `verified_at`
   * is when the provider was asked; `unverified` lists items it could not
   * answer for (the console says so rather than assuming). */
  liveness: { verified_at: string | null; live: number; gone: Array<{ item_id: string; reason: string }>; unverified: Array<{ item_id: string; error_class: string }>; unchecked: number };
  /** Instruction-shaped content found on the case's items. Non-empty means the
   * console shows the notice, renders the verdict as UNCERTAIN, and every
   * action is already individual-approval (planner gate). Data, not blocking. */
  injection: { flagged: boolean; signals: Array<{ item_id: string; labels: string[] }> };
}

async function vipAddresses(): Promise<Set<string>> {
  const rows = await InboxVip.findAll();
  return new Set(rows.map((v) => String(v.email_address || '').toLowerCase()).filter(Boolean));
}

async function itemsFor(caseId: string): Promise<InboxCaseItem[]> {
  return InboxCaseItem.findAll({ where: { case_id: caseId, inclusion_status: { [Op.ne]: 'EXCLUDED' } } as any }); // `as any`: Op-keyed where
}

function fromOf(item: InboxCaseItem): string | null {
  const snap = (item.snapshot as Record<string, unknown> | null) ?? {};
  return typeof snap.from_address === 'string' ? snap.from_address.toLowerCase() : null;
}

/** How many ranked candidates `next` will check against the inbox before giving up. */
export const NEXT_LIVENESS_CANDIDATES = 5;

/** Pick the single best case to work on, optionally narrowed by a focus mode. */
export async function getNext(focus: FocusMode | null, now: Date = new Date(), correlationId?: string): Promise<FocusPayload | null> {
  const visible = await loadVisibleCases();
  const open = visible.cases;
  let pool = open.map((c) => ({ c, s: summarise(c, now) })).filter(({ s }) => s.category !== 'snoozed');

  if (focus === 'waiting') {
    pool = pool.filter(({ s }) => s.category === 'waiting').sort((a, b) => (a.s.sla_due_at ?? '9').localeCompare(b.s.sla_due_at ?? '9'));
  } else {
    pool = pool.filter(({ s }) => ACTIONABLE_CATEGORIES.includes(s.category));
    if (focus === 'urgent') pool = pool.filter(({ s }) => s.category === 'due_now');
    if (focus === 'basecamp' || focus === 'email') {
      pool = pool.filter(({ s }) => (focus === 'basecamp' ? s.response.channel === 'BASECAMP' || s.response.channel === 'BOTH' : s.response.channel === 'EMAIL' || s.response.channel === null));
    }
    if (focus === 'vip') {
      const vips = await vipAddresses();
      pool = pool.filter((entry) => (visible.itemsByCase.get(entry.c.id) ?? []).some((i) => { const f = fromOf(i); return !!f && vips.has(f); }));
    }
    pool.sort((a, b) => b.s.score - a.s.score || a.s.opened_at.localeCompare(b.s.opened_at));
  }

  // Ask the provider about the candidate RIGHT NOW before handing it to Ali.
  // A candidate whose evidence has all left the inbox is dispositioned (and
  // closes through the real guard) and the next one is tried — bounded.
  const corr = correlationId ?? randomUUID(); // inbox_case_events.correlation_id is a UUID column
  for (const entry of pool.slice(0, NEXT_LIVENESS_CANDIDATES)) {
    const check = await verifyCaseLivenessNow(entry.c.id, corr, now);
    if (check.all_gone) continue;
    return buildFocus(entry.c, now, { verified_at: now.toISOString(), live: check.live, gone: check.gone, unverified: check.unverified, unchecked: check.unchecked });
  }
  return null;
}

export async function buildFocus(c: InboxCase, now: Date = new Date(), liveness?: FocusPayload['liveness']): Promise<FocusPayload> {
  const [items, actions, commitments] = await Promise.all([
    itemsFor(c.id),
    InboxCaseAction.findAll({ where: { case_id: c.id, status: { [Op.notIn]: ['REJECTED', 'SKIPPED', 'COMPENSATED'] } } as any }), // `as any`: Op-keyed where
    InboxCommitment.findAll({ where: { case_id: c.id, status: 'OPEN' } }),
  ]);
  const summary = summarise(c, now);
  const currentOwner = c.assessment?.current_owner ?? null;
  const injectionSignals = items
    .map((i) => ({ item_id: i.id, labels: itemInjectionSignals(i).map((s) => s.label) }))
    .filter((x) => x.labels.length > 0);
  const owner: FocusPayload['owner'] =
    c.state === 'WAITING' ? 'SENDER' : c.state === 'DELEGATED' ? 'TEAM_MEMBER' : c.state === 'EXECUTING' ? 'SYSTEM' : 'ALI';

  return {
    summary,
    case: {
      id: c.id, title: c.title, mode: c.mode, state: c.state, objective: c.objective, summary: c.summary,
      recommendation: c.recommendation, confidence: c.confidence, reopen_count: c.reopen_count,
      waiting_since: c.waiting_since ? new Date(c.waiting_since).toISOString() : null,
    },
    items: items.map((i) => ({
      id: i.id, source_type: i.source_type, provider: i.provider, title: i.title,
      occurred_at: new Date(i.occurred_at).toISOString(), source_url: i.source_url, disposition: i.disposition, from: fromOf(i),
    })),
    actions: actions.map((a) => ({
      id: a.id, action_type: a.action_type, status: a.status, preview: a.preview,
      requires_individual_approval: a.requires_individual_approval, risk_level: a.risk_level,
    })),
    commitments: commitments.map((k) => ({ id: k.id, statement: k.statement, due_at: k.due_at ? new Date(k.due_at).toISOString() : null, status: k.status, source: k.source })),
    destination: summary.response.channel,
    owner,
    current_owner: currentOwner,
    degraded: getHealth().degraded, // mailbox health only; the overview carries the Basecamp probe
    liveness: liveness ?? { verified_at: null, live: 0, gone: [], unverified: [], unchecked: items.length },
    injection: {
      flagged: injectionSignals.length > 0,
      signals: injectionSignals,
    },
  };
}
