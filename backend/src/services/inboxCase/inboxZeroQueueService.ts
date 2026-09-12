import InboxCase from '../../models/InboxCase';
import InboxCaseItem from '../../models/InboxCaseItem';
import { CaseSummary, summarise } from './inboxZeroService';
import { loadVisibleCases } from './inboxZeroVisibility';

// /inbox-zero zoom-out (T9a). The portfolio view: the same open cases the
// overview counts, grouped the way the brief lists — so Ali can zoom out
// without losing his place and zoom back in by number. Pure reads.

export const QUEUE_VIEWS = ['urgency', 'mailbox', 'person', 'topic', 'destination', 'owner', 'age', 'due', 'confidence'] as const;
export type QueueView = (typeof QUEUE_VIEWS)[number];

export interface QueueGroup {
  key: string;
  label: string;
  count: number;
  cases: Array<CaseSummary & { n: number }>;
}

export interface QueueResult {
  view: QueueView;
  generated_at: string;
  total: number;
  groups: QueueGroup[];
}

const AGE_BUCKETS: Array<[number, string]> = [[1, 'under a day'], [3, '1-3 days'], [7, '3-7 days'], [30, '1-4 weeks'], [Infinity, 'over a month']];
const DUE_BUCKETS: Array<[number, string]> = [[-Infinity, 'overdue'], [1, 'due today'], [3, 'due in 1-3 days'], [7, 'due this week'], [Infinity, 'due later']];

function bucket(value: number, buckets: Array<[number, string]>): string {
  for (const [limit, label] of buckets) if (value < limit) return label;
  return buckets[buckets.length - 1][1];
}

function personOf(c: InboxCase, items: InboxCaseItem[]): string {
  const owner = c.assessment?.current_owner?.trim();
  if (owner) return owner;
  const first = c.assessment?.people_involved?.[0]?.name?.trim();
  if (first) return first;
  for (const i of items) {
    const from = (i.snapshot as Record<string, unknown> | null)?.from_address;
    if (typeof from === 'string' && from) return from.toLowerCase();
  }
  return 'unknown';
}

function ownerOf(c: InboxCase): string {
  if (c.state === 'WAITING') return 'waiting on sender';
  if (c.state === 'DELEGATED') return 'delegated';
  if (c.state === 'EXECUTING') return 'system';
  return 'Ali';
}

export async function getQueue(view: QueueView, now: Date = new Date()): Promise<QueueResult> {
  // T16: the same liveness-filtered set the overview and `next` use, and the
  // same bulk item load (the mailbox/person views group on items anyway).
  const { cases: open, itemsByCase } = await loadVisibleCases();

  const groups = new Map<string, QueueGroup>();
  const add = (key: string, label: string, s: CaseSummary) => {
    if (!groups.has(key)) groups.set(key, { key, label, count: 0, cases: [] });
    const g = groups.get(key)!;
    g.count++;
    g.cases.push({ ...s, n: 0 });
  };

  for (const c of open) {
    const s = summarise(c, now);
    if (s.category === 'snoozed') continue;
    const items = itemsByCase.get(c.id) ?? [];
    switch (view) {
      case 'urgency':
        add(s.category, { due_now: 'Due now', needs_decision: 'Needs a decision', unassessed: 'Not yet assessed', waiting: 'Waiting on someone else', review: 'In flight with the system', snoozed: 'Snoozed' }[s.category], s);
        break;
      case 'mailbox': {
        const providers = Array.from(new Set(items.map((i) => i.provider)));
        if (providers.length === 0) add('none', 'No linked source', s);
        for (const p of providers) add(p, p, s);
        break;
      }
      case 'person': {
        const p = personOf(c, items);
        add(p, p, s);
        break;
      }
      case 'topic':
        add(c.mode, c.mode === 'PERSON' ? 'Person cases' : 'Topic cases', s);
        break;
      case 'destination': {
        const d = s.response.channel ?? 'UNKNOWN';
        add(d, d === 'UNKNOWN' ? 'Destination not yet decided' : d, s);
        break;
      }
      case 'owner': {
        const o = ownerOf(c);
        add(o, o, s);
        break;
      }
      case 'age': {
        const days = (now.getTime() - new Date(c.opened_at).getTime()) / 86_400_000;
        const b = bucket(days, AGE_BUCKETS);
        add(b, b, s);
        break;
      }
      case 'due': {
        if (!s.sla_due_at) { add('none', 'No due date', s); break; }
        const days = (new Date(s.sla_due_at).getTime() - now.getTime()) / 86_400_000;
        const b = days < 0 ? 'overdue' : bucket(days, DUE_BUCKETS.slice(1));
        add(b, b, s);
        break;
      }
      case 'confidence': {
        const r = s.response;
        const b = r.legacy ? 'not assessed under the contract' : r.verdict === 'UNCERTAIN' ? 'uncertain' : r.confidence >= 85 ? 'high confidence' : r.confidence >= 70 ? 'medium confidence' : 'low confidence';
        add(b, b, s);
        break;
      }
    }
  }

  // Deterministic order: highest-scoring case first within a group, groups by
  // their best case. Then number every case 1..N across the whole view so
  // `zoom in <n>` is unambiguous.
  const ordered = Array.from(groups.values()).map((g) => ({ ...g, cases: g.cases.sort((a, b) => b.score - a.score || a.opened_at.localeCompare(b.opened_at)) }));
  if (view === 'urgency') {
    // The brief's fixed order — due now, needs a decision, waiting, review —
    // not score order, so the overview and the zoom-out never disagree.
    const rank: Record<string, number> = { due_now: 0, needs_decision: 1, unassessed: 2, waiting: 3, review: 4 };
    ordered.sort((a, b) => (rank[a.key] ?? 9) - (rank[b.key] ?? 9));
  } else {
    ordered.sort((a, b) => (b.cases[0]?.score ?? 0) - (a.cases[0]?.score ?? 0) || a.label.localeCompare(b.label));
  }
  let n = 0;
  for (const g of ordered) for (const s of g.cases) s.n = ++n;

  return { view, generated_at: now.toISOString(), total: n, groups: ordered };
}
