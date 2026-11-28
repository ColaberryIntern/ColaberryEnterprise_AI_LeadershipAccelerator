import type { DemoEvent, DemoSpec } from '../demoSpec/contract';

/**
 * Fixture specs for the visual rules, in six deliberately unrelated shapes.
 *
 * ## Why six, and why unrelated
 *
 * The engine renders thousands of projects in domains nobody has seen. A rule proved against one
 * spec is a rule proved against one spec. These differ STRUCTURALLY, not just in wording, because
 * that is what the detections actually read:
 *
 *   shiftCoverage   work items carrying two times of their own, a meter, a narrowing child
 *   salesPipeline   work items with ONE time, so the timeline must come from the events instead
 *   maintenance     no child entity at all, but a join entity carrying a number
 *   documentReview  long prose, and a status enum whose counts do not narrow
 *   thinSpec        too little of everything: every visual must fall back
 *   overCapSpec     more of everything than any cap allows
 *
 * If a rule reads a domain word rather than a shape, at least one of these breaks.
 *
 * ## Fictional, as the contract requires
 *
 * Invented names, `555-01xx` numbers and `@example.com` addresses only. These are also what the
 * phase 2 screenshots are taken from, so they are the faces of this feature in a PR.
 */

/** Fills the fifteen required event fields so a fixture can state only what it is testing. */
export function ev(over: Partial<DemoEvent> & Pick<DemoEvent, 'event_id' | 'work_id'>): DemoEvent {
  return {
    occurred_at: '2026-11-25T14:00:00Z',
    trace_id: `t-${over.work_id}`,
    parent_event_id: null,
    actor: { type: 'agent', id: 'agent.one', label: 'First Agent', verified: false },
    human_owner_id: 'owner.one',
    action: 'Did a thing',
    status: 'succeeded',
    risk_level: 'low',
    autonomy_tier: 'A2',
    reason_summary: 'Because the rules allowed it.',
    evidence_refs: ['e/1'],
    policy_refs: ['p/1'],
    approval: { required: false, status: 'not_required', assigned_to: null },
    side_effects: [],
    reversible: true,
    recovery_ref: null,
    environment: 'demo',
    ...over,
  };
}

function spec(over: Partial<DemoSpec> & { app: DemoSpec['app'] }): DemoSpec {
  return {
    schema_version: 2,
    environment: 'demo',
    events: [],
    ...over,
  } as DemoSpec;
}

/* ------------------------------------------------------------------ 1. shift coverage */

export const shiftCoverage: DemoSpec = spec({
  app: { name: 'Coverage console', descriptor: 'shift coverage', persona: { name: 'Dana Reyes', role: 'Operations manager' } },
  events: [
    ev({ event_id: 'e1', work_id: 'g1', occurred_at: '2026-11-25T12:02:00Z' }),
    ev({ event_id: 'e2', work_id: 'g1', parent_event_id: 'e1', occurred_at: '2026-11-25T12:20:00Z', autonomy_tier: 'A3' }),
    ev({ event_id: 'e3', work_id: 'g2', occurred_at: '2026-11-25T12:40:00Z', status: 'failed', risk_level: 'medium' }),
    ev({ event_id: 'e4', work_id: 'g2', parent_event_id: 'e3', occurred_at: '2026-11-25T13:05:00Z' }),
    ev({ event_id: 'e5', work_id: 'g3', occurred_at: '2026-11-25T13:30:00Z', actor: { type: 'human', id: 'person.dana', label: 'Dana Reyes', verified: false }, autonomy_tier: 'A0' }),
  ],
  entities: {
    gap: {
      label: 'Gap', plural: 'Gaps', status: 'state',
      columns: ['opens_at', 'state', 'fill_minutes'],
      fields: [
        { key: 'opens_at', type: 'datetime' },
        { key: 'closes_at', type: 'datetime' },
        { key: 'state', type: 'enum', labels: { open: 'Open', filled: 'Filled' }, tones: { open: 'attention', filled: 'ok' } },
        { key: 'fill_minutes', type: 'meter', max: 30, unit: 'min' },
        { key: 'site', type: 'ref', ref: 'site' },
      ],
      actions: [{ label: 'Approve cover', tone: 'primary', when: { state: 'open' } }],
      rows: [
        { id: 'g1', opens_at: '2026-11-25T08:30:00Z', closes_at: '2026-11-25T14:30:00Z', state: 'open', fill_minutes: 85, site: 's1' },
        { id: 'g2', opens_at: '2026-11-25T12:30:00Z', closes_at: '2026-11-25T18:30:00Z', state: 'open', fill_minutes: 3, site: 's2' },
        { id: 'g3', opens_at: '2026-11-25T08:00:00Z', closes_at: '2026-11-25T12:00:00Z', state: 'filled', fill_minutes: 29, site: 's1' },
      ],
    },
    offer: {
      label: 'Offer', plural: 'Offers', status: 'response',
      fields: [
        { key: 'gap', type: 'ref', ref: 'gap' },
        { key: 'response', type: 'enum', labels: { sent: 'Sent', replied: 'Replied', accepted: 'Accepted' } },
      ],
      rows: [
        { id: 'o1', gap: 'g1', response: 'sent' }, { id: 'o2', gap: 'g1', response: 'sent' },
        { id: 'o3', gap: 'g1', response: 'sent' }, { id: 'o4', gap: 'g2', response: 'replied' },
        { id: 'o5', gap: 'g2', response: 'replied' }, { id: 'o6', gap: 'g3', response: 'accepted' },
      ],
    },
    person: {
      label: 'Person', plural: 'People',
      fields: [
        { key: 'hours', type: 'number', unit: 'h' },
        { key: 'site', type: 'ref', ref: 'site' },
      ],
      rows: [
        { id: 'p1', hours: 38, site: 's1' }, { id: 'p2', hours: 41, site: 's1' },
        { id: 'p3', hours: 22, site: 's2' }, { id: 'p4', hours: 36, site: 's2' },
      ],
    },
    site: { label: 'Site', plural: 'Sites', fields: [{ key: 'name', type: 'text' }], rows: [{ id: 's1', name: 'North' }, { id: 's2', name: 'South' }] },
  },
  screens: {
    today: { type: 'home', title: 'Good morning', entity: 'gap' },
    gaps: { type: 'list', entity: 'gap' },
    people: { type: 'list', entity: 'person' },
    decide: { type: 'queue', entity: 'gap' },
    who: { type: 'roster' },
  },
});

/* ------------------------------------------------------------------ 2. sales pipeline */

/** One time field only, so the timeline cannot come from the rows and must come from events. */
export const salesPipeline: DemoSpec = spec({
  app: { name: 'Pipeline review', descriptor: 'deal progress', persona: { name: 'Priya Vance', role: 'Sales lead' } },
  events: [
    ev({ event_id: 'd1', work_id: 'deal1', occurred_at: '2026-11-24T09:00:00Z' }),
    ev({ event_id: 'd2', work_id: 'deal1', parent_event_id: 'd1', occurred_at: '2026-11-24T11:00:00Z' }),
    ev({ event_id: 'd3', work_id: 'deal2', occurred_at: '2026-11-24T13:00:00Z', autonomy_tier: 'A1' }),
    ev({ event_id: 'd4', work_id: 'deal3', occurred_at: '2026-11-24T15:00:00Z', autonomy_tier: 'A4', risk_level: 'high' }),
  ],
  entities: {
    deal: {
      label: 'Deal', plural: 'Deals', status: 'stage',
      fields: [
        { key: 'opened_on', type: 'date' },
        { key: 'stage', type: 'enum', labels: { new: 'New', working: 'Working', won: 'Won' } },
        { key: 'amount', type: 'number', unit: 'USD' },
      ],
      rows: [
        { id: 'deal1', opened_on: '2026-11-01', stage: 'working', amount: 18000 },
        { id: 'deal2', opened_on: '2026-11-03', stage: 'new', amount: 4200 },
        { id: 'deal3', opened_on: '2026-11-07', stage: 'won', amount: 65000 },
        { id: 'deal4', opened_on: '2026-11-09', stage: 'new', amount: 9100 },
      ],
    },
    touch: {
      label: 'Touch', plural: 'Touches', status: 'result',
      fields: [
        { key: 'deal', type: 'ref', ref: 'deal' },
        { key: 'result', type: 'enum', labels: { sent: 'Sent', opened: 'Opened', booked: 'Booked' } },
      ],
      rows: [
        { id: 't1', deal: 'deal1', result: 'sent' }, { id: 't2', deal: 'deal1', result: 'sent' },
        { id: 't3', deal: 'deal2', result: 'sent' }, { id: 't4', deal: 'deal1', result: 'opened' },
        { id: 't5', deal: 'deal3', result: 'booked' },
      ],
    },
  },
  screens: {
    board: { type: 'home', title: 'Pipeline', entity: 'deal' },
    deals: { type: 'list', entity: 'deal' },
  },
});

/* ------------------------------------------------------------------ 3. maintenance queue */

/** No child entity, so no funnel. A join entity with two refs and a number, so a matrix. */
export const maintenanceQueue: DemoSpec = spec({
  app: { name: 'Work order desk', descriptor: 'maintenance queue', persona: { name: 'Mo Okafor', role: 'Facilities lead' } },
  events: [
    ev({ event_id: 'm1', work_id: 'wo1', occurred_at: '2026-11-20T08:00:00Z' }),
    ev({ event_id: 'm2', work_id: 'wo1', parent_event_id: 'm1', occurred_at: '2026-11-20T09:30:00Z', status: 'executing' }),
    ev({ event_id: 'm3', work_id: 'wo2', occurred_at: '2026-11-20T10:00:00Z', autonomy_tier: 'A3' }),
    ev({ event_id: 'm4', work_id: 'wo3', occurred_at: '2026-11-20T11:00:00Z' }),
    ev({ event_id: 'm5', work_id: 'wo4', occurred_at: '2026-11-20T12:00:00Z', status: 'reverted', recovery_ref: 'r/1' }),
  ],
  entities: {
    work_order: {
      label: 'Work order', plural: 'Work orders', status: 'state',
      fields: [
        { key: 'raised_at', type: 'datetime' },
        { key: 'due_at', type: 'datetime' },
        { key: 'state', type: 'enum', labels: { queued: 'Queued', active: 'Active', done: 'Done' } },
        { key: 'response_minutes', type: 'meter', max: 240, warn: 180, unit: 'min' },
      ],
      rows: [
        { id: 'wo1', raised_at: '2026-11-20T07:00:00Z', due_at: '2026-11-20T15:00:00Z', state: 'active', response_minutes: 60 },
        { id: 'wo2', raised_at: '2026-11-20T07:30:00Z', due_at: '2026-11-20T19:00:00Z', state: 'queued', response_minutes: 310 },
        { id: 'wo3', raised_at: '2026-11-20T08:15:00Z', due_at: '2026-11-21T08:00:00Z', state: 'done', response_minutes: 120 },
        { id: 'wo4', raised_at: '2026-11-20T09:00:00Z', due_at: '2026-11-21T12:00:00Z', state: 'queued', response_minutes: 15 },
      ],
    },
    assignment: {
      label: 'Assignment', plural: 'Assignments',
      fields: [
        { key: 'work_order', type: 'ref', ref: 'work_order' },
        { key: 'crew', type: 'ref', ref: 'crew' },
        { key: 'hours', type: 'number', unit: 'h' },
      ],
      rows: [
        { id: 'a1', work_order: 'wo1', crew: 'c1', hours: 3 },
        { id: 'a2', work_order: 'wo2', crew: 'c2', hours: 5 },
        { id: 'a3', work_order: 'wo3', crew: 'c1', hours: 2 },
      ],
    },
    crew: { label: 'Crew', plural: 'Crews', fields: [{ key: 'name', type: 'text' }], rows: [{ id: 'c1', name: 'Blue' }, { id: 'c2', name: 'Green' }] },
  },
  screens: {
    desk: { type: 'home', title: 'Open work', entity: 'work_order' },
    orders: { type: 'list', entity: 'work_order' },
    crews: { type: 'list', entity: 'assignment' },
  },
});

/* ------------------------------------------------------------------ 4. document review */

/** Long prose to quote, and a status enum whose counts are equal, so nothing narrows. */
export const documentReview: DemoSpec = spec({
  app: { name: 'Review desk', descriptor: 'document review', persona: { name: 'Lena Hart', role: 'Reviewer' } },
  events: [
    ev({ event_id: 'r1', work_id: 'doc1', occurred_at: '2026-11-18T10:00:00Z' }),
    ev({ event_id: 'r2', work_id: 'doc2', occurred_at: '2026-11-18T11:00:00Z' }),
  ],
  entities: {
    doc: {
      label: 'Document', plural: 'Documents', status: 'state',
      fields: [
        { key: 'state', type: 'enum', labels: { draft: 'Draft', reviewed: 'Reviewed' } },
        { key: 'summary', type: 'text' },
        { key: 'holder', type: 'private', shown_as: 'Held under the retention rule' },
      ],
      rows: [
        { id: 'doc1', state: 'draft', summary: 'A'.repeat(200) },
        { id: 'doc2', state: 'reviewed', summary: 'Short note.' },
      ],
    },
  },
  screens: { desk: { type: 'home', title: 'To review', entity: 'doc' }, docs: { type: 'list', entity: 'doc' } },
});

/* ------------------------------------------------------------------ 5. thin */

/** Beneath every minimum. Everything must fall back, and nothing may be drawn from nothing. */
export const thinSpec: DemoSpec = spec({
  app: { name: 'Starter', descriptor: 'a first build', persona: { name: 'Sam Rivera', role: 'Owner' } },
  events: [ev({ event_id: 'only', work_id: 'w1' })],
  entities: {
    item: {
      label: 'Item', plural: 'Items',
      fields: [{ key: 'name', type: 'text' }],
      rows: [{ id: 'i1', name: 'One' }, { id: 'i2', name: 'Two' }],
    },
  },
  screens: { home: { type: 'home', title: 'Start', entity: 'item' }, items: { type: 'list', entity: 'item' } },
});

/* ------------------------------------------------------------------ 6. over cap */

const manyRows = Array.from({ length: 30 }, (_, i) => ({
  id: `k${i + 1}`,
  starts_at: `2026-11-10T0${(i % 9) + 1}:00:00Z`,
  ends_at: `2026-11-10T1${(i % 9)}:00:00Z`,
  state: `s${i % 10}`,
  weight: i * 3 + 1,
}));

/** More lanes, bars, tiles and stages than any cap allows, so every cap has something to trim. */
export const overCapSpec: DemoSpec = spec({
  app: { name: 'Wide board', descriptor: 'everything at once', persona: { name: 'Avery Lin', role: 'Coordinator' } },
  events: Array.from({ length: 24 }, (_, i) => ev({
    event_id: `x${i}`, work_id: `k${(i % 20) + 1}`, occurred_at: `2026-11-10T${String(i % 24).padStart(2, '0')}:30:00Z`,
  })),
  entities: {
    kase: {
      label: 'Case', plural: 'Cases', status: 'state',
      fields: [
        { key: 'starts_at', type: 'datetime' },
        { key: 'ends_at', type: 'datetime' },
        { key: 'state', type: 'enum' },
        { key: 'weight', type: 'number' },
      ],
      rows: manyRows,
    },
  },
  screens: { board: { type: 'home', title: 'All cases', entity: 'kase' }, cases: { type: 'list', entity: 'kase' } },
});

export const ALL_FIXTURES: ReadonlyArray<{ name: string; spec: DemoSpec }> = [
  { name: 'shiftCoverage', spec: shiftCoverage },
  { name: 'salesPipeline', spec: salesPipeline },
  { name: 'maintenanceQueue', spec: maintenanceQueue },
  { name: 'documentReview', spec: documentReview },
  { name: 'thinSpec', spec: thinSpec },
  { name: 'overCapSpec', spec: overCapSpec },
];
