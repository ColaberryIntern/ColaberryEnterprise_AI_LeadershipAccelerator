// /inbox-zero T9d fixture. Eight open cases spanning every overview category,
// one snoozed, one stale wait, one overdue commitment, plus one RESOLVED case
// that must never appear. No real names, addresses or message bodies.
// `now` is pinned so every age/SLA judgement is deterministic.

import { randomUUID } from 'crypto';

export const NOW = new Date('2026-09-11T15:00:00.000Z');
export const CURSOR = '2026-09-11T12:00:00.000Z';

const d = (iso: string) => new Date(iso);

function assessed(over: Record<string, unknown> = {}) {
  return {
    objective: 'x', current_state: 'x', summary: 'x', timeline: [], confirmed_facts: [], assumptions: [], contradictions: [],
    root_cause_assessment: null, impact: '', people_involved: [], current_owner: null, commitments_made: [], deadlines: [],
    blockers: [], missing_information: [], decisions_required: [], recommended_next_actions: ['Reply'], confidence: 80,
    ...over,
  };
}

export interface FixtureCase {
  key: string;
  row: Record<string, unknown>;
  items?: Array<Record<string, unknown>>;
  actions?: Array<Record<string, unknown>>;
  commitments?: Array<Record<string, unknown>>;
}

export const FIXTURE: FixtureCase[] = [
  {
    key: 'refund_p0',
    row: {
      title: 'Refund request from a placed student', mode: 'PERSON', state: 'AWAITING_APPROVAL', priority_band: 'P0', priority_reason: 'money',
      opened_at: d('2026-09-09T09:00:00Z'), updated_at: d('2026-09-11T14:30:00Z'), created_at: d('2026-09-09T09:00:00Z'),
      assessment: assessed({ response_needed: 'YES', response_needed_confidence: 92, response_needed_reason: 'Direct refund question, unanswered', response_channel: 'EMAIL', response_channel_reason: 'asked by email', current_owner: 'Ali' }),
    },
    items: [{ source_type: 'email', provider: 'gmail_colaberry', title: 'Re: refund', occurred_at: d('2026-09-09T08:00:00Z'), source_url: 'https://mail/1', inclusion_status: 'INCLUDED', disposition: null, snapshot: { from_address: 'student-a@example.com', thread_id: 'T-A' }, source_hash: 'h-a1' }],
    actions: [{ action_type: 'EMAIL_SEND', status: 'PROPOSED', preview: 'Reply: refund is on the way', requires_individual_approval: true, risk_level: 'HIGH', payload: {}, depends_on_action_ids: [], idempotency_key: 'k-a1', attempt_count: 0, verification_attempt_count: 0, acting_admin: 'ali' }],
  },
  {
    key: 'overdue_followup',
    row: {
      title: 'Vendor W9 still missing', mode: 'TOPIC', state: 'NEEDS_ALI', priority_band: 'P2', priority_reason: null,
      sla_due_at: d('2026-09-10T00:00:00Z'), opened_at: d('2026-09-01T09:00:00Z'), updated_at: d('2026-09-10T09:00:00Z'), created_at: d('2026-09-01T09:00:00Z'),
      assessment: assessed({ response_needed: 'YES', response_needed_confidence: 75, response_needed_reason: 'chase', response_channel: 'EMAIL', response_channel_reason: 'r' }),
    },
    items: [{ source_type: 'email', provider: 'hotmail', title: 'W9', occurred_at: d('2026-09-01T08:00:00Z'), source_url: null, inclusion_status: 'INCLUDED', disposition: null, snapshot: { from_address: 'vendor@example.com' }, source_hash: 'h-b1' }],
  },
  {
    key: 'bc_ready',
    row: {
      title: 'Cohort kickoff deck review', mode: 'TOPIC', state: 'READY_TO_PLAN', priority_band: null,
      opened_at: d('2026-09-11T13:00:00Z'), updated_at: d('2026-09-11T13:30:00Z'), created_at: d('2026-09-11T13:00:00Z'),
      assessment: assessed({ response_needed: 'YES', response_needed_confidence: 80, response_needed_reason: 'Kes asked in the to-do', response_channel: 'BASECAMP', response_channel_reason: 'active to-do', current_owner: 'Kes' }),
    },
    // T20: this one arrived as a Basecamp NOTIFICATION email, so it IS inbox
    // work — and the to-do it points at travels with it, so the response goes
    // to Basecamp while the email itself gets archived.
    items: [
      { source_type: 'email', provider: 'gmail_colaberry', title: '[Basecamp] Kes commented on "Review deck"', occurred_at: d('2026-09-11T12:31:00Z'), source_url: 'https://mail/c0', inclusion_status: 'INCLUDED', disposition: null, snapshot: { from_address: 'notifications@basecamp.com', thread_id: 'T-C' }, source_hash: 'h-c0' },
      { source_type: 'basecamp_todo', provider: 'basecamp', title: 'Review deck', occurred_at: d('2026-09-11T12:30:00Z'), source_url: 'https://3.basecamp.com/x', inclusion_status: 'INCLUDED', disposition: null, snapshot: { project_id: 1 }, source_hash: 'h-c1' },
    ],
  },
  {
    key: 'failed_verify',
    row: {
      title: 'Intro to a partner', mode: 'PERSON', state: 'FAILED', priority_band: 'P3',
      opened_at: d('2026-09-05T09:00:00Z'), updated_at: d('2026-09-11T11:00:00Z'), created_at: d('2026-09-05T09:00:00Z'),
      assessment: assessed({ response_needed: 'NO', response_needed_confidence: 88, response_needed_reason: 'already sent', response_channel: 'NONE', response_channel_reason: 'done' }),
    },
    items: [{ source_type: 'email', provider: 'gmail_colaberry', title: 'Intro request', occurred_at: d('2026-09-05T08:00:00Z'), source_url: 'https://mail/h-d1', inclusion_status: 'INCLUDED', disposition: null, snapshot: { from_address: 'partner@example.com' }, source_hash: 'h-d1' }],
  },
  {
    key: 'waiting_fresh',
    row: {
      title: 'Waiting on Priya for the SOW', mode: 'TOPIC', state: 'WAITING', waiting_since: d('2026-09-10T09:00:00Z'), sla_due_at: d('2026-09-15T00:00:00Z'),
      opened_at: d('2026-09-08T09:00:00Z'), updated_at: d('2026-09-10T09:00:00Z'), created_at: d('2026-09-08T09:00:00Z'), assessment: assessed(),
    },
    items: [{ source_type: 'email', provider: 'gmail_colaberry', title: 'SOW draft', occurred_at: d('2026-09-08T08:00:00Z'), source_url: 'https://mail/h-e1', inclusion_status: 'INCLUDED', disposition: null, snapshot: { from_address: 'priya@example.com' }, source_hash: 'h-e1' }],
  },
  {
    key: 'waiting_stale',
    row: {
      title: 'Waiting on the bank for the wire', mode: 'TOPIC', state: 'WAITING', waiting_since: d('2026-09-01T09:00:00Z'), sla_due_at: d('2026-09-04T00:00:00Z'),
      opened_at: d('2026-08-30T09:00:00Z'), updated_at: d('2026-09-01T09:00:00Z'), created_at: d('2026-08-30T09:00:00Z'), assessment: assessed(),
    },
    items: [{ source_type: 'email', provider: 'hotmail', title: 'Wire confirmation', occurred_at: d('2026-08-30T08:00:00Z'), source_url: 'https://mail/h-f1', inclusion_status: 'INCLUDED', disposition: null, snapshot: { from_address: 'bank@example.com' }, source_hash: 'h-f1' }],
  },
  {
    key: 'review_legacy',
    row: {
      title: 'Newsletter reply thread', mode: 'TOPIC', state: 'ASSESSING', priority_band: null,
      opened_at: d('2026-09-11T14:00:00Z'), updated_at: d('2026-09-11T14:45:00Z'), created_at: d('2026-09-11T14:00:00Z'), assessment: null,
    },
    items: [{ source_type: 'email', provider: 'gmail_colaberry', title: 'Re: newsletter', occurred_at: d('2026-09-11T13:50:00Z'), source_url: 'https://mail/h-g1', inclusion_status: 'INCLUDED', disposition: null, snapshot: { from_address: 'reader@example.com' }, source_hash: 'h-g1' }],
  },
  {
    key: 'snoozed',
    row: {
      title: 'Conference sponsorship', mode: 'TOPIC', state: 'READY_TO_PLAN', priority_band: 'P1', snoozed_until: d('2026-09-18T09:00:00Z'), snooze_reason: 'Budget meeting is the 17th',
      opened_at: d('2026-09-07T09:00:00Z'), updated_at: d('2026-09-11T10:00:00Z'), created_at: d('2026-09-07T09:00:00Z'), assessment: assessed(),
    },
    items: [{ source_type: 'email', provider: 'gmail_colaberry', title: 'Sponsorship packet', occurred_at: d('2026-09-07T08:00:00Z'), source_url: 'https://mail/h-h1', inclusion_status: 'INCLUDED', disposition: null, snapshot: { from_address: 'events@example.com' }, source_hash: 'h-h1' }],
  },
  {
    key: 'resolved',
    row: {
      title: 'Closed last week', mode: 'TOPIC', state: 'RESOLVED', closed_at: d('2026-09-04T00:00:00Z'),
      opened_at: d('2026-09-01T09:00:00Z'), updated_at: d('2026-09-04T00:00:00Z'), created_at: d('2026-09-01T09:00:00Z'), assessment: assessed(),
    },
    items: [{ source_type: 'email', provider: 'gmail_colaberry', title: 'Old thread', occurred_at: d('2026-09-01T08:00:00Z'), source_url: 'https://mail/h-i1', inclusion_status: 'INCLUDED', disposition: null, snapshot: { from_address: 'someone@example.com' }, source_hash: 'h-i1' }],
  },
  {
    // T20 control: board work that never came by email. The console must not
    // show it at all, and must not count it as inbox work.
    key: 'board_only',
    row: {
      title: 'Board to-do that never emailed Ali', mode: 'TOPIC', state: 'READY_TO_PLAN', priority_band: null,
      opened_at: d('2026-09-10T09:00:00Z'), updated_at: d('2026-09-11T09:00:00Z'), created_at: d('2026-09-10T09:00:00Z'), assessment: assessed(),
    },
    items: [{ source_type: 'basecamp_todo', provider: 'basecamp', title: 'Anchor to-do', occurred_at: d('2026-09-10T08:00:00Z'), source_url: 'https://3.basecamp.com/y', inclusion_status: 'INCLUDED', disposition: null, snapshot: { project_id: 2 }, source_hash: 'h-j1' }],
  },
];

export const COMMITMENTS_BY_KEY: Record<string, Array<Record<string, unknown>>> = {
  refund_p0: [{ statement: 'I will confirm the refund date by Friday', owed_to: 'student-a@example.com', due_at: d('2026-09-10T17:00:00Z'), status: 'OPEN', source: 'assessment' }],
  waiting_fresh: [{ statement: 'I will send the countersigned copy', owed_to: 'priya@example.com', due_at: null, status: 'OPEN', source: 'assessment' }],
};

export async function seedFixture(fakes: { cases: any; items: any; actions: any; commitments: any }): Promise<Record<string, any>> {
  const byKey: Record<string, any> = {};
  for (const f of FIXTURE) {
    const c = await fakes.cases.create({ correlation_id: randomUUID(), reopen_count: 0, snoozed_until: null, snooze_reason: null, waiting_since: null, sla_due_at: null, priority_band: null, priority_reason: null, closed_at: null, ...f.row });
    byKey[f.key] = c;
    for (const it of f.items ?? []) await fakes.items.create({ case_id: c.id, source_id: randomUUID(), ...it });
    for (const a of f.actions ?? []) await fakes.actions.create({ case_id: c.id, item_id: null, target_source: 'gmail_colaberry', correlation_id: c.correlation_id, ...a });
    for (const k of COMMITMENTS_BY_KEY[f.key] ?? []) await fakes.commitments.create({ case_id: c.id, statement_hash: randomUUID(), source_item_id: null, fulfilled_at: null, correlation_id: c.correlation_id, ...k });
  }
  return byKey;
}
