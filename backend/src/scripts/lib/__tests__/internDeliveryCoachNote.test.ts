/**
 * Tests for the Basecamp comment Ali posts on an intern's project list.
 *
 * This note names a person, quotes their completion percentage, and commits to
 * a projected finish date. Everything pinned here is something that would be
 * embarrassing or unfair to send: an em-dash against house style, a percentage
 * that disagrees with the dashboard panel above it, a shared list's numbers
 * attributed to one person, or "you are 0% of the way through, with 0 of 48
 * closed and 48 open" saying the same thing three times.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { buildCoachNote, normalizeName, greetingName, projectDisplayName, nextFriday, releasePosition } = require('../internDeliveryCoachNote');

const GENERATED_AT = '2026-08-12T12:51:52.431Z'; // a Wednesday
const HARPREET = 48161826;
const MEERA = 52003305;

function task(over: Record<string, unknown> = {}) {
  return {
    taskId: 1, title: 'A task', completed: false, completedAt: null, dueOn: null,
    createdAt: '2026-06-01T00:00:00.000Z', url: 'https://app.basecamp.com/x',
    groupName: 'R0 - Skeleton', groupKind: 'release', releaseIndex: 0,
    commentsCount: 0, assignees: ['Harpreet Kaur'], assigneeIds: [HARPREET], overdue: false,
    ...over,
  };
}

function project(over: Record<string, unknown> = {}) {
  return {
    projectId: 555, name: 'Widget Engine - BUILD (story-driven)', stream: 'Internship',
    url: 'https://app.basecamp.com/3945211/buckets/1/todolists/555',
    ownerId: HARPREET, ownershipModel: 'single', ownerShare: 1,
    holders: [{ personId: HARPREET, name: 'Harpreet Kaur', taskCount: 10, doneCount: 4 }],
    taskTotal: 10, taskDone: 4, taskRemaining: 6, percentComplete: 40,
    releases: [
      { name: 'R0 - Skeleton', index: 0, total: 4, done: 4, pct: 100 },
      { name: 'R1 - Data', index: 1, total: 3, done: 0, pct: 0 },
      { name: 'R2 - Launch', index: 2, total: 3, done: 0, pct: 0 },
    ],
    currentRelease: { name: 'R1 - Data', index: 1, done: 0, total: 3, pct: 0 },
    doneLast7: 2, donePrior7: 1, updatesLast7: 3, updatesPrior7: 2,
    daysSinceActivity: 2, projectedFinish: '2026-09-20', projectedDays: 39,
    overdue: [], status: 'ON_TRACK', tasks: [task()],
    ...over,
  };
}

// Holdings have to match the project fixture under test: computePerson derives
// them from the same task list, so a mismatched fixture would test a state the
// pipeline cannot actually produce.
//
// PEOPLE_SOLE:   Harpreet holds the whole 10-task build.
// PEOPLE_SHARED: the Autonomous shape, where she holds 1 todo of 4 and Meera 2.
const PEOPLE_SOLE = [
  {
    personId: HARPREET, name: 'Harpreet Kaur', status: 'WATCH',
    doneLast7: 0, donePrior7: 0, updatesLast7: 1, updatesPrior7: 0, daysSinceUpdate: 4,
    holdings: [{ projectId: 555, taskTotal: 10, taskDone: 4, percentComplete: 40, overdueCount: 0, isWholeList: true }],
  },
];

const PEOPLE_SHARED = [
  {
    personId: HARPREET, name: 'Harpreet Kaur', status: 'AT_RISK',
    doneLast7: 0, donePrior7: 0, updatesLast7: 1, updatesPrior7: 0, daysSinceUpdate: 4,
    holdings: [{ projectId: 555, taskTotal: 1, taskDone: 0, percentComplete: null, overdueCount: 0, isWholeList: false }],
  },
  {
    personId: MEERA, name: 'Meera Hussain', status: 'COMPLETE',
    doneLast7: 0, donePrior7: 0, updatesLast7: 0, updatesPrior7: 0, daysSinceUpdate: 21,
    holdings: [{ projectId: 555, taskTotal: 2, taskDone: 2, percentComplete: 100, overdueCount: 0, isWholeList: false }],
  },
];

function note(over: Record<string, unknown> = {}, opts: Record<string, unknown> = {}) {
  return buildCoachNote(project(over), {
    people: PEOPLE_SOLE, portfolio: { doneLast7: 20 }, generatedAt: GENERATED_AT, ...opts,
  });
}

describe('house style', () => {
  it('never emits an em-dash or an en-dash, even from a task title', () => {
    const n = note({
      name: 'Tool — Smith',
      tasks: [task({ title: 'ToolSmith AI — Autonomous Tool Creation' })],
      ownershipModel: 'shared',
      ownerId: null,
      holders: [
        { personId: HARPREET, name: 'Harpreet Kaur', taskCount: 1, doneCount: 0 },
        { personId: MEERA, name: 'Meera Hussain', taskCount: 2, doneCount: 2 },
      ],
    }, { focusPersonId: HARPREET, people: PEOPLE_SHARED });
    expect(n.plainText).not.toMatch(/[—–]/);
    expect(n.html).not.toMatch(/[—–]/);
    for (const p of n.paragraphs) expect(p).not.toMatch(/[—–]/);
  });

  it('signs off exactly once', () => {
    expect(note().plainText.match(/^Ali$/gm)).toHaveLength(1);
  });

  it('escapes HTML from Basecamp task titles', () => {
    const n = note({ tasks: [task({ title: '<script>alert(1)</script>' })], ownershipModel: 'shared', ownerId: null,
      holders: [{ personId: HARPREET, name: 'Harpreet Kaur', taskCount: 1, doneCount: 0 }] },
    { focusPersonId: HARPREET, people: PEOPLE_SHARED });
    expect(n.html).not.toMatch(/<script>/);
    expect(n.html).toMatch(/&lt;script&gt;/);
  });
});

describe('the numbers in the message', () => {
  it('quotes the completion figures the dashboard computed, not its own', () => {
    const n = note();
    expect(n.plainText).toContain('40% of the way through');
    expect(n.plainText).toContain('4 of 10 tasks closed');
    expect(n.plainText).toContain('6 still open');
  });

  it('states which release they are in and what finishing it is worth', () => {
    const n = note();
    // R0 (4) + R1 (3) = 7 of 10 tasks, so closing R1 puts the build at 70%.
    expect(n.plainText).toContain('R1 - Data');
    expect(n.plainText).toContain('release 2 of 3');
    expect(n.plainText).toContain('roughly 70%');
  });

  it('gives the projected finish as a real date', () => {
    expect(note().plainText).toContain('September 20, 2026');
  });

  it('quotes the KPIs and the portfolio benchmark', () => {
    const n = note();
    expect(n.plainText).toContain('2 tasks closed in the last 7 days');
    expect(n.plainText).toContain('against 1 the week before');
    expect(n.plainText).toContain('3 updates posted');
    expect(n.plainText).toContain('portfolio closed 20 tasks last week');
  });

  it('says so plainly when there is no credible forecast', () => {
    const n = note({ projectedFinish: null, projectedDays: null, taskDone: 0, taskRemaining: 10, doneLast7: 0, donePrior7: 0 });
    expect(n.plainText).toContain('I cannot give you one');
    expect(n.plainText).toMatch(/close about \d+ a week/);
    expect(n.plainText).not.toMatch(/lands on/);
  });

  it('does not say the same thing three times when nothing is closed', () => {
    const n = note({ taskDone: 0, taskRemaining: 10, percentComplete: 0 });
    expect(n.plainText).toContain('Nothing has been closed on this yet');
    expect(n.plainText).not.toContain('0% of the way through');
  });

  it('treats a single remaining task as a date, not a weekly rate', () => {
    const n = note({ taskTotal: 10, taskDone: 9, taskRemaining: 1, projectedFinish: null, projectedDays: null });
    expect(n.plainText).toContain('single open task');
    expect(n.plainText).not.toMatch(/close about 1 a week/);
  });

  it('asks for a reply by a Friday that is never today', () => {
    expect(note().plainText).toContain('By August 14');
    expect(nextFriday(new Date('2026-08-14T12:00:00Z').getTime())).toBe('2026-08-21');
  });
});

describe('tone follows the status', () => {
  it('leads with recognition when the work is on track', () => {
    expect(note({ status: 'ON_TRACK' }).plainText).toContain('what on track looks like');
  });

  it('names the drift without hedging when at risk', () => {
    expect(note({ status: 'AT_RISK' }).plainText).toContain('the finish date is drifting');
  });

  it('does not tell someone their velocity dropped when it was never above zero', () => {
    const n = note({ status: 'AT_RISK', taskDone: 0, taskRemaining: 10 });
    expect(n.plainText).toContain('has not started moving yet');
    expect(n.plainText).not.toContain('slowed enough');
  });

  it('is direct but not punitive when stalled', () => {
    const n = note({ status: 'STALLED', daysSinceActivity: 22 });
    expect(n.plainText).toContain('quiet for 22 days');
    expect(n.plainText).toContain('rather hear that you are stuck');
  });

  it('drops the accountability ask entirely once the build is complete', () => {
    const n = note({ status: 'COMPLETE', taskDone: 10, taskRemaining: 0, percentComplete: 100 });
    expect(n.plainText).toContain('Everything on this is closed');
    expect(n.plainText).not.toMatch(/reply here with two things/);
  });
});

describe('shared lists and person scoping', () => {
  const SHARED = {
    ownershipModel: 'shared',
    ownerId: null,
    taskTotal: 4,
    taskDone: 2,
    taskRemaining: 2,
    percentComplete: 50,
    releases: [],
    currentRelease: null,
    tasks: [
      task({ taskId: 1, title: 'ToolSmith AI', assignees: ['Harpreet Kaur'], assigneeIds: [HARPREET], groupKind: 'other', groupName: null }),
      task({ taskId: 2, title: 'CareerCanvas', completed: true, assignees: ['Meera Hussain'], assigneeIds: [MEERA], groupKind: 'other', groupName: null }),
      task({ taskId: 3, title: 'Ticket Arbitrage', completed: true, assignees: ['Meera Hussain'], assigneeIds: [MEERA], groupKind: 'other', groupName: null }),
      task({ taskId: 4, title: 'Something else', assignees: [], assigneeIds: [], groupKind: 'other', groupName: null }),
    ],
    holders: [
      { personId: MEERA, name: 'Meera Hussain', taskCount: 2, doneCount: 2 },
      { personId: HARPREET, name: 'Harpreet Kaur', taskCount: 1, doneCount: 0 },
    ],
  };

  it('addresses everyone and does not say "you" about a shared list', () => {
    const n = note(SHARED, { people: PEOPLE_SHARED });
    expect(n.scope).toBe('shared_list');
    expect(n.greeting).toBe('Hi Meera, Harpreet,');
    expect(n.plainText).toContain('The list is 50% of the way through');
    expect(n.plainText).not.toContain('You are 50%');
  });

  it('scopes to one person and names their actual task', () => {
    const n = note(SHARED, { focusPersonId: HARPREET, people: PEOPLE_SHARED });
    expect(n.scope).toBe('person_on_shared_list');
    expect(n.recipientName).toBe('Harpreet Kaur');
    expect(n.plainText).toContain('You hold 1 task on this list');
    expect(n.plainText).toContain('"ToolSmith AI"');
    expect(n.plainText).not.toContain('CareerCanvas');
  });

  // The whole point of the change: a shared list's numbers must never be
  // attributed to one person on it.
  it('quotes the person\'s own rates, not the list\'s', () => {
    const n = note({ ...SHARED, doneLast7: 9, donePrior7: 9 }, { focusPersonId: HARPREET, people: PEOPLE_SHARED });
    expect(n.plainText).toContain('for your part: 0 tasks closed in the last 7 days');
    expect(n.plainText).not.toContain('9 tasks closed');
  });

  it('reads a finished contributor as complete even when the list is at risk', () => {
    const n = note({ ...SHARED, status: 'AT_RISK' }, { focusPersonId: MEERA, people: PEOPLE_SHARED });
    expect(n.plainText).toContain('Everything on this is closed');
    expect(n.plainText).not.toContain('the finish date is drifting');
  });
});

describe('names and labels', () => {
  it('flips the "LAST, FIRST" Basecamp form and de-shouts it', () => {
    expect(normalizeName('OBI, ANAMELECHI KINGSLEY')).toBe('Anamelechi Kingsley Obi');
    expect(greetingName('OBI, ANAMELECHI KINGSLEY')).toBe('Anamelechi');
  });

  it('leaves an ordinary name alone', () => {
    expect(normalizeName('Meera Hussain')).toBe('Meera Hussain');
    expect(greetingName('samrawit mekonen')).toBe('samrawit');
    expect(greetingName('Akiwam')).toBe('Akiwam');
  });

  it('strips build-system suffixes but keeps build vs proposal', () => {
    expect(projectDisplayName('Selective Service Modernization - BUILD (story-driven)')).toBe('Selective Service Modernization (build)');
    expect(projectDisplayName('Detroit Voter Education - PROPOSAL')).toBe('Detroit Voter Education (proposal)');
    expect(projectDisplayName('Autonomous')).toBe('Autonomous');
  });

  it('carries the list URL through so the copy button has somewhere to point', () => {
    expect(note().listUrl).toBe('https://app.basecamp.com/3945211/buckets/1/todolists/555');
  });
});

describe('determinism', () => {
  it('produces identical text for the same snapshot', () => {
    expect(note().plainText).toBe(note().plainText);
  });

  it('returns null rather than a fake position when there is no release structure', () => {
    expect(releasePosition({ releases: [], currentRelease: null, taskTotal: 4 })).toBeNull();
  });
});
