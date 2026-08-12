/**
 * Tests for the Intern Delivery Command Center email renderer.
 *
 * The invariants pinned here are the ones that silently break a send rather
 * than throw: an em-dash smuggled in from a Basecamp comment, a second
 * "Ali Muwwakkil" that the Mandrill preflight reads as a duplicated signature,
 * a body that creeps past Gmail's clip threshold, and any external asset
 * reference (blocked or privacy-leaking in a mail client).
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { renderInternDeliveryEmail, renderInternDeliveryEmailText } = require('../renderInternDeliveryEmail');

const GMAIL_CLIP_BYTES = 100 * 1024;

function makeProject(over: Record<string, unknown> = {}) {
  return {
    projectId: 1, name: 'Test Project - BUILD', stream: 'Internship',
    url: 'https://app.basecamp.com/3945211/buckets/1/todolists/1',
    taskTotal: 10, taskDone: 4, taskRemaining: 6,
    percentComplete: 40, percentCalculable: true, percentReason: null,
    doneLast7: 1, updatesLast7: 2, daysSinceActivity: 3,
    projectedFinish: '2026-09-01', openGateCount: 1,
    status: 'AT_RISK', statusLabel: 'At Risk', statusTone: 'risk', statusRank: 1,
    riskFlags: [{ code: 'overdue', label: '3 tasks past due', tone: 'risk' }],
    summary: 'A summary.', nextAction: 'Do the thing.',
    dailyCompletions: [], dailyUpdates: [],
    ...over,
  };
}

function makePerson(over: Record<string, unknown> = {}) {
  return {
    personId: 1, name: 'Test Person', active: true, hasUpdateInWindow: true,
    projectCount: 2, taskTotal: 8, taskDone: 4,
    percentComplete: 50, percentCalculable: true, percentReason: null,
    doneLast7: 2, updatesInLookback: 3, daysSinceUpdate: 2,
    trajectory: 'Steady', status: 'WATCH', statusLabel: 'Watch',
    statusTone: 'warning', statusRank: 2,
    ...over,
  };
}

function makeSnapshot(over: Record<string, unknown> = {}) {
  return {
    generatedAt: '2026-08-12T12:51:52.431Z',
    lookbackDays: 14,
    historyDays: 28,
    portfolio: {
      peopleTotal: 3, peopleActive: 2, peopleReporting: 2, peopleDormant: 1,
      projectsTotal: 2, projectsActive: 2,
      taskTotal: 20, taskDone: 8, doneLast7: 3, donePrior7: 2,
      updatesLast7: 5, updatesPrior7: 4, overdueTotal: 6, openGates: 2,
      byStatus: { STALLED: 1, AT_RISK: 1, WATCH: 0, ON_TRACK: 0, COMPLETE: 0, NOT_STARTED: 0 },
      byStream: [{ stream: 'Internship', projects: 2, taskTotal: 20, taskDone: 8 }],
      percentComplete: 40,
      velocityDelta: { value: 50, kind: 'up' },
      cadenceDelta: { value: 25, kind: 'up' },
      dailyCompletions: [{ date: '2026-08-11', count: 2 }, { date: '2026-08-12', count: 0 }],
      dailyUpdates: [{ date: '2026-08-11', count: 3 }, { date: '2026-08-12', count: 1 }],
    },
    people: [makePerson(), makePerson({ personId: 2, name: 'Dormant Person', active: false })],
    projects: [makeProject(), makeProject({ projectId: 2, status: 'STALLED', statusLabel: 'Stalled' })],
    decisionQueue: [
      {
        kind: 'open_question', approver: 'Ali', title: 'Can you approve this?',
        askedBy: 'An Intern', ageDays: 5, projectName: 'Test Project - BUILD',
        url: 'https://app.basecamp.com/3945211/buckets/1/todos/2',
        answerUrl: 'https://app.basecamp.com/3945211/buckets/1/todos/2',
        rawText: 'A comment body.', urgency: 'high',
        whyItMatters: 'Work is blocked.',
      },
      {
        kind: 'approval_gate', approver: 'Ali', title: 'Ali approves milestone R1',
        ageDays: 30, projectName: 'Test Project - BUILD',
        url: 'https://app.basecamp.com/3945211/buckets/1/todos/3',
      },
    ],
    meta: {
      commentCount: 42, narrativeMode: 'llm', narrativeModel: 'gpt-4o-mini',
      questionsScreenedOut: 3,
      scope: [{ bucketId: 24865175, label: 'Internship / Apprenticeship', stream: 'Internship' }],
    },
    ...over,
  };
}

describe('renderInternDeliveryEmail', () => {
  it('renders subject, html and text from a snapshot', () => {
    const out = renderInternDeliveryEmail(makeSnapshot());
    expect(out.subject).toContain('1 question');
    expect(out.subject).toContain('1 gate');
    expect(out.html).toContain('Every intern, every project, one email');
    expect(out.text).toContain('INTERN DELIVERY COMMAND CENTER');
  });

  it('never emits an em-dash, even when the snapshot is full of them', () => {
    const snap = makeSnapshot();
    snap.decisionQueue[0].rawText = 'Decision record — REQUEST CHANGES — see attached';
    snap.decisionQueue[0].title = 'Sign off — please';
    snap.projects[0].summary = 'Blocked — waiting on review';
    const out = renderInternDeliveryEmail(snap);
    expect(out.html).not.toMatch(/[—–]/);
    expect(out.text).not.toMatch(/[—–]/);
  });

  it('leaves the full name to the signature so preflight sees one occurrence', () => {
    const snap = makeSnapshot();
    snap.decisionQueue[0].rawText = 'Thanks @Ali Muwwakkil for setting this up';
    snap.projects[0].summary = 'Ali Muwwakkil owns the next step';
    const out = renderInternDeliveryEmail(snap);
    expect(out.html).not.toContain('Ali Muwwakkil');
    expect(out.text).not.toContain('Ali Muwwakkil');
  });

  it('carries no external asset references', () => {
    const { html } = renderInternDeliveryEmail(makeSnapshot());
    expect(html).not.toMatch(/<script/i);
    expect(html).not.toMatch(/src="https?:/i);
    expect(html).not.toMatch(/cdn\./i);
  });

  it('escapes markup arriving from Basecamp comment text', () => {
    const snap = makeSnapshot();
    snap.decisionQueue[0].title = '<img src=x onerror=alert(1)>';
    const { html } = renderInternDeliveryEmail(snap);
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;img src=x');
  });

  it('stays under the Gmail clip threshold at realistic portfolio size', () => {
    const snap = makeSnapshot({
      people: Array.from({ length: 40 }, (_, i) => makePerson({ personId: i, name: `Person ${i}` })),
      projects: Array.from({ length: 30 }, (_, i) => makeProject({ projectId: i, name: `Project ${i} - BUILD (story-driven)` })),
      decisionQueue: Array.from({ length: 40 }, (_, i) => ({
        kind: i % 2 ? 'approval_gate' : 'open_question', approver: 'Ali',
        title: `Question or gate number ${i} with a reasonably long title`,
        askedBy: 'An Intern', ageDays: i, projectName: `Project ${i} - BUILD (story-driven)`,
        url: 'https://app.basecamp.com/3945211/buckets/1/todos/2',
        rawText: 'A fairly long comment body. '.repeat(20),
        urgency: 'high', whyItMatters: 'Work is blocked until this is answered.',
      })),
    });
    const { html } = renderInternDeliveryEmail(snap);
    expect(Buffer.byteLength(html)).toBeLessThan(GMAIL_CLIP_BYTES);
  });

  it('is idempotent: same snapshot renders byte-identical output', () => {
    const snap = makeSnapshot();
    expect(renderInternDeliveryEmail(snap).html).toEqual(renderInternDeliveryEmail(snap).html);
  });

  it('handles an empty decision queue without claiming work is blocked', () => {
    const { html, subject } = renderInternDeliveryEmail(makeSnapshot({ decisionQueue: [] }));
    expect(subject).toContain('0 questions');
    expect(html).toContain('Nothing waiting');
  });

  it('reports "not calculable" rather than a misleading percentage', () => {
    const snap = makeSnapshot({
      people: [makePerson({ percentComplete: null, percentCalculable: false, percentReason: 'Single task only' })],
    });
    expect(renderInternDeliveryEmail(snap).html).toContain('Single task only');
  });
});

describe('renderInternDeliveryEmailText', () => {
  it('lists every open question with its link', () => {
    const text = renderInternDeliveryEmailText(makeSnapshot());
    expect(text).toContain('Can you approve this?');
    expect(text).toContain('https://app.basecamp.com/3945211/buckets/1/todos/2');
  });
});
