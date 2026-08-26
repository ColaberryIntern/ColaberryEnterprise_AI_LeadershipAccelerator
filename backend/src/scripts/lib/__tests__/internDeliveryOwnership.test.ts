/**
 * Tests for who owns a project and what each person is credited with.
 *
 * Both rules exist because of one Basecamp list. "Autonomous" holds four todos
 * that are four different people's builds. The old code named whoever held the
 * most todos as the owner of the whole thing, and rendered every todo on the
 * list to every person who opened it, so Harpreet's single task appeared as a
 * four-task project she was 50% through and Meera was labelled its owner on the
 * strength of holding two.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { computeDelivery, resolveOwnership, LEAD_OWNERSHIP_SHARE } = require('../internDeliveryMetrics');

const HARPREET = 48161826;
const MEERA = 52003305;
const ISAAC = 45962714;
const SOHAIL = 47335940; // staff
const ALI = 17454835;

const PEOPLE_BY_ID = new Map([
  [HARPREET, { id: HARPREET, name: 'Harpreet Kaur' }],
  [MEERA, { id: MEERA, name: 'Meera Hussain' }],
  [ISAAC, { id: ISAAC, name: 'Kwadjossan Isaac KPAKPAVI' }],
  [SOHAIL, { id: SOHAIL, name: 'Sohail Syed' }],
]);

// Ids are handed out from a counter rather than at random: the idempotency
// test compares two full snapshots, and a random id would make it fail for a
// reason that has nothing to do with the code under test.
let nextTodoId = 1;
function todo(assigneeIds: number[], completed = false, over: Record<string, unknown> = {}) {
  return {
    id: nextTodoId++,
    title: 'todo', completed, completedAt: completed ? '2026-08-01T00:00:00.000Z' : null,
    createdAt: '2026-06-01T00:00:00.000Z', dueOn: null, commentsCount: 0,
    assignees: assigneeIds.map((id) => ({ id, name: (PEOPLE_BY_ID.get(id) || { name: 'x' }).name })),
    groupKind: 'other', groupName: null, releaseIndex: null, groupPosition: 0,
    url: 'https://app.basecamp.com/x',
    ...over,
  };
}

const NO_COMMENTS = new Map();

describe('resolveOwnership', () => {
  it('names a sole assignee as owner however many tasks there are', () => {
    const r = resolveOwnership([todo([HARPREET]), todo([HARPREET])], PEOPLE_BY_ID, NO_COMMENTS);
    expect(r.ownershipModel).toBe('single');
    expect(r.ownerId).toBe(HARPREET);
  });

  it('names a clear majority holder as the lead', () => {
    const todos = [todo([MEERA]), todo([MEERA]), todo([MEERA]), todo([MEERA]), todo([HARPREET])];
    const r = resolveOwnership(todos, PEOPLE_BY_ID, NO_COMMENTS);
    expect(r.ownershipModel).toBe('lead');
    expect(r.ownerId).toBe(MEERA);
    expect(r.ownerShare).toBeGreaterThanOrEqual(LEAD_OWNERSHIP_SHARE);
  });

  // The Autonomous shape. Meera holds 2 of 4, which is a plurality but not
  // ownership.
  it('refuses to name an owner when the list is flat', () => {
    const todos = [todo([MEERA], true), todo([MEERA], true), todo([HARPREET]), todo([ISAAC])];
    const r = resolveOwnership(todos, PEOPLE_BY_ID, NO_COMMENTS);
    expect(r.ownershipModel).toBe('shared');
    expect(r.ownerId).toBeNull();
    expect(r.ownerShare).toBe(0.5);
  });

  it('reports every holder with their own done count on a shared list', () => {
    const todos = [todo([MEERA], true), todo([MEERA], true), todo([HARPREET]), todo([ISAAC])];
    const { holders } = resolveOwnership(todos, PEOPLE_BY_ID, NO_COMMENTS);
    expect(holders).toEqual([
      { personId: MEERA, name: 'Meera Hussain', taskCount: 2, doneCount: 2 },
      { personId: HARPREET, name: 'Harpreet Kaur', taskCount: 1, doneCount: 0 },
      { personId: ISAAC, name: 'Kwadjossan Isaac KPAKPAVI', taskCount: 1, doneCount: 0 },
    ]);
  });

  it('never makes staff the owner of an intern project', () => {
    const todos = [todo([SOHAIL]), todo([SOHAIL]), todo([SOHAIL]), todo([HARPREET])];
    const r = resolveOwnership(todos, PEOPLE_BY_ID, NO_COMMENTS);
    expect(r.ownerId).toBe(HARPREET);
    expect(r.holders.map((h: { personId: number }) => h.personId)).not.toContain(SOHAIL);
  });

  it('reports unowned rather than guessing when nobody is assigned', () => {
    const r = resolveOwnership([todo([]), todo([])], PEOPLE_BY_ID, NO_COMMENTS);
    expect(r.ownershipModel).toBe('unowned');
    expect(r.ownerId).toBeNull();
  });

  it('excludes approval gates from the ownership maths', () => {
    const todos = [
      todo([HARPREET]),
      todo([ALI], false, { groupKind: 'approval_gate', groupName: 'MILESTONE APPROVALS - Ali' }),
      todo([ALI], false, { groupKind: 'approval_gate', groupName: 'MILESTONE APPROVALS - Ali' }),
    ];
    const r = resolveOwnership(todos, PEOPLE_BY_ID, NO_COMMENTS);
    expect(r.ownerId).toBe(HARPREET);
    expect(r.ownerShare).toBe(1);
  });

  it('is deterministic when two people are exactly level', () => {
    const todos = [todo([MEERA]), todo([HARPREET])];
    const a = resolveOwnership(todos, PEOPLE_BY_ID, NO_COMMENTS);
    const b = resolveOwnership(todos.slice().reverse(), PEOPLE_BY_ID, NO_COMMENTS);
    expect(a.holders.map((h: { name: string }) => h.name)).toEqual(b.holders.map((h: { name: string }) => h.name));
  });
});

describe('a person is credited with their own tasks only', () => {
  function snapshot() {
    nextTodoId = 1000; // same ids on every call, so two snapshots are comparable
    return computeDelivery({
      generatedAt: '2026-08-12T12:00:00.000Z',
      accountId: '3945211',
      lookbackDays: 14,
      historyDays: 28,
      scope: [],
      withheld: [],
      people: [
        { id: HARPREET, name: 'Harpreet Kaur', email: 'h@example.com', streams: ['Internship'] },
        { id: MEERA, name: 'Meera Hussain', email: 'm@example.com', streams: ['Internship'] },
        { id: ISAAC, name: 'Kwadjossan Isaac KPAKPAVI', email: 'i@example.com', streams: ['Internship'] },
        { id: SOHAIL, name: 'Sohail Syed', email: 'sohail@colaberry.com', streams: ['Internship'] },
      ],
      projects: [{
        projectId: 9688707052,
        name: 'Autonomous',
        description: '', bucketId: 24865175, bucketName: 'Internship / Apprenticeship',
        stream: 'Internship', url: 'https://app.basecamp.com/3945211/buckets/1/todolists/9688707052',
        createdAt: '2026-06-01T00:00:00.000Z', updatedAt: '2026-08-10T00:00:00.000Z',
        groups: [],
        todos: [
          todo([MEERA], true), todo([MEERA], true),
          todo([HARPREET]), todo([ISAAC]),
        ],
        comments: [],
      }],
      commentCount: 0,
    });
  }

  it('gives Harpreet her one task, not the list of four', () => {
    const d = snapshot();
    const h = d.people.find((p: { personId: number }) => p.personId === HARPREET);
    expect(h.taskTotal).toBe(1);
    expect(h.taskDone).toBe(0);
    expect(h.holdings).toHaveLength(1);
    expect(h.holdings[0]).toMatchObject({ taskTotal: 1, taskDone: 0, isWholeList: false });
  });

  it('reads Meera as complete on her own two tasks without owning the list', () => {
    const d = snapshot();
    const m = d.people.find((p: { personId: number }) => p.personId === MEERA);
    expect(m.taskTotal).toBe(2);
    expect(m.percentComplete).toBe(100);
    expect(m.status).toBe('COMPLETE');
    expect(d.projects[0].ownerId).toBeNull();
  });

  it('marks the list shared so the drawer can say so', () => {
    expect(snapshot().projects[0].ownershipModel).toBe('shared');
  });

  it('keeps staff off the roster', () => {
    expect(snapshot().people.map((p: { personId: number }) => p.personId)).not.toContain(SOHAIL);
  });

  it('attaches a note to the list and one per holder', () => {
    const p = snapshot().projects[0];
    expect(p.coachNote.scope).toBe('shared_list');
    expect(Object.keys(p.coachNotesByPerson).map(Number).sort()).toEqual([HARPREET, MEERA, ISAAC].sort());
    expect(p.coachNotesByPerson[HARPREET].scope).toBe('person_on_shared_list');
  });

  // Same snapshot in, same snapshot out. The note is pasted into Basecamp by
  // hand, so the wording must not drift between two runs of the same data.
  it('is idempotent', () => {
    expect(JSON.stringify(snapshot())).toBe(JSON.stringify(snapshot()));
  });
});
