/**
 * Unit tests for the pure decision logic of govContractsTurnWatcher.js.
 *
 * These guard the duplicate-send defect observed 2026-06-16: ~10 identical
 * "[Your Turn]" emails for the same bid + same next task, fired by a retrying
 * scheduler because the dedup checkpoint was only written at end-of-run and a
 * crash mid-run lost it. The fixes proven here:
 *   1. A handoff is keyed on (bidId, nextTaskId); once in firedKeys it never
 *      re-emits, even if the same completion is re-detected (crash/retry).
 *   2. Multiple completions in one window on one bid yield ONE turn, not N.
 *   3. computeTurns coalesces all waiting bids; renderTurnsEmail makes them ONE
 *      joint email.
 *   4. advanceSeen leaves failed-send bids un-advanced so they retry.
 *   5. pruneFiredKeys bounds the dedup set.
 *
 * Requiring the module does not fire Basecamp/Mandrill (guarded by
 * require.main === module).
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const watcher = require('../govContractsTurnWatcher');
const {
  classify,
  turnKey,
  selectNextOverall,
  computeTurns,
  advanceSeen,
  recordFired,
  pruneFiredKeys,
  renderTurnsEmail,
} = watcher;

const completedTodo = (id: number, content: string, at: string, by = 'Omolola Makinde') => ({
  id,
  content,
  completion: { created_at: at, creator: { name: by } },
});
const openTodo = (id: number, content: string, due_on: string | null = null, created_at = '2026-06-01T00:00:00Z') => ({
  id,
  content,
  due_on,
  created_at,
  app_url: `https://3.basecamp.com/3945211/buckets/1/todos/${id}`,
});

const freshState = () => ({ lastSeenCompletions: {}, firedKeys: {}, lastTickAt: null });

describe('classify - tiering', () => {
  test('a signature task is HUMAN', () => expect(classify('Sign the bid bond')).toBe('HUMAN'));
  test('a drafting task is AI', () => expect(classify('Draft the capability statement')).toBe('AI'));
  test('an unmatched task is EITHER', () => expect(classify('Misc placeholder')).toBe('EITHER'));
});

describe('selectNextOverall - execution order', () => {
  test('earliest due_on wins; nulls sort last', () => {
    const next = selectNextOverall([
      openTodo(1, 'no due'),
      openTodo(2, 'due later', '2026-07-01'),
      openTodo(3, 'due soon', '2026-06-20'),
    ]);
    expect(next.id).toBe(3);
    expect(next.tier).toBeDefined();
  });
  test('empty list -> null (bid done)', () => expect(selectNextOverall([])).toBeNull());
});

describe('computeTurns - the firing decision', () => {
  test('first sighting of a bid never fires (no lastSeen baseline)', () => {
    const bids = [{ id: 100, name: 'UTD Residential Life', completed: [completedTodo(1, 'spec', '2026-06-16T06:00:00Z')], open: [openTodo(2, 'Sign the agreement')] }];
    expect(computeTurns({ bids, state: freshState() })).toEqual([]);
  });

  test('happy path: new completion + next is HUMAN -> exactly one turn', () => {
    const state = { ...freshState(), lastSeenCompletions: { 100: '2026-06-15T00:00:00Z' } };
    const bids = [{ id: 100, name: 'UTD Residential Life', completed: [completedTodo(1, 'Generate schema migrations', '2026-06-16T06:00:00Z')], open: [openTodo(2, 'Sign the residential life agreement')] }];
    const turns = computeTurns({ bids, state });
    expect(turns).toHaveLength(1);
    expect(turns[0].nextTask.content).toMatch(/Sign/);
    expect(turns[0].key).toBe(turnKey(100, 2));
  });

  test('next is AI/EITHER -> no turn (not Ali\'s move)', () => {
    const state = { ...freshState(), lastSeenCompletions: { 100: '2026-06-15T00:00:00Z' } };
    const bids = [{ id: 100, name: 'UTD', completed: [completedTodo(1, 'x', '2026-06-16T06:00:00Z')], open: [openTodo(2, 'Draft the technical requirements')] }];
    expect(computeTurns({ bids, state })).toEqual([]);
  });

  test('DEFECT GUARD: already-fired handoff does NOT re-emit (idempotency)', () => {
    const key = turnKey(100, 2);
    const state = { ...freshState(), lastSeenCompletions: { 100: '2026-06-15T00:00:00Z' }, firedKeys: { [key]: '2026-06-16T06:20:00Z' } };
    const bids = [{ id: 100, name: 'UTD', completed: [completedTodo(1, 'x', '2026-06-16T06:00:00Z')], open: [openTodo(2, 'Sign the agreement')] }];
    expect(computeTurns({ bids, state })).toEqual([]);
  });

  test('DEFECT GUARD: N completions in one window on one bid -> ONE turn, not N', () => {
    const state = { ...freshState(), lastSeenCompletions: { 100: '2026-06-15T00:00:00Z' } };
    const bids = [{
      id: 100, name: 'UTD',
      completed: [
        completedTodo(1, 'step a', '2026-06-16T06:00:00Z'),
        completedTodo(2, 'step b', '2026-06-16T06:05:00Z'),
        completedTodo(3, 'step c', '2026-06-16T06:10:00Z'),
      ],
      open: [openTodo(4, 'Sign the agreement')],
    }];
    const turns = computeTurns({ bids, state });
    expect(turns).toHaveLength(1);
    expect(turns[0].completedTask.content).toBe('step c'); // most-recent completion
  });

  test('coalescing: two waiting bids -> two turns from one computeTurns call', () => {
    const state = { ...freshState(), lastSeenCompletions: { 100: '2026-06-15T00:00:00Z', 200: '2026-06-15T00:00:00Z' } };
    const bids = [
      { id: 100, name: 'UTD', completed: [completedTodo(1, 'x', '2026-06-16T06:00:00Z')], open: [openTodo(2, 'Sign UTD agreement')] },
      { id: 200, name: 'Patriot', completed: [completedTodo(3, 'y', '2026-06-16T06:01:00Z')], open: [openTodo(4, 'Approve Patriot bid go/no-go')] },
    ];
    expect(computeTurns({ bids, state })).toHaveLength(2);
  });
});

describe('recordFired + computeTurns - end-to-end idempotency', () => {
  test('after recordFired, the same inputs produce no further turns', () => {
    const state0 = { ...freshState(), lastSeenCompletions: { 100: '2026-06-15T00:00:00Z' } };
    const bids = [{ id: 100, name: 'UTD', completed: [completedTodo(1, 'x', '2026-06-16T06:00:00Z')], open: [openTodo(2, 'Sign the agreement')] }];
    const turns = computeTurns({ bids, state: state0 });
    expect(turns).toHaveLength(1);
    const state1 = recordFired(state0, turns, '2026-06-16T06:20:00Z');
    // Re-detecting the SAME completion (e.g. a retry) must not re-fire.
    expect(computeTurns({ bids, state: state1 })).toEqual([]);
  });
});

describe('advanceSeen - watermark + retry safety', () => {
  test('advances lastSeenCompletions to the newest completion', () => {
    const bids = [{ id: 100, name: 'UTD', completed: [completedTodo(1, 'a', '2026-06-16T06:00:00Z'), completedTodo(2, 'b', '2026-06-16T07:00:00Z')], open: [] }];
    const next = advanceSeen(freshState(), bids);
    expect(next.lastSeenCompletions[100]).toBe('2026-06-16T07:00:00Z');
  });
  test('skipBidIds leaves a failed-send bid un-advanced so it retries', () => {
    const bids = [
      { id: 100, name: 'UTD', completed: [completedTodo(1, 'a', '2026-06-16T06:00:00Z')], open: [] },
      { id: 200, name: 'Patriot', completed: [completedTodo(2, 'b', '2026-06-16T06:00:00Z')], open: [] },
    ];
    const next = advanceSeen(freshState(), bids, new Set([100]));
    expect(next.lastSeenCompletions[100]).toBeUndefined(); // retried next tick
    expect(next.lastSeenCompletions[200]).toBe('2026-06-16T06:00:00Z');
  });
  test('does not mutate the input state', () => {
    const state = freshState();
    advanceSeen(state, [{ id: 1, name: 'x', completed: [completedTodo(1, 'a', '2026-06-16T06:00:00Z')], open: [] }]);
    expect(state.lastSeenCompletions).toEqual({});
  });
});

describe('pruneFiredKeys - bounded growth', () => {
  test('drops keys older than the TTL, keeps fresh ones', () => {
    const nowMs = new Date('2026-06-16T00:00:00Z').getTime();
    const state = {
      ...freshState(),
      firedKeys: {
        'old': '2026-04-01T00:00:00Z',   // > 30d
        'fresh': '2026-06-10T00:00:00Z', // < 30d
      },
    };
    const pruned = pruneFiredKeys(state, nowMs);
    expect(pruned.firedKeys.old).toBeUndefined();
    expect(pruned.firedKeys.fresh).toBe('2026-06-10T00:00:00Z');
  });
});

describe('renderTurnsEmail - one joint email', () => {
  const turn = (bidId: number, bidName: string, taskId: number, next: string) => ({
    bidId, bidName, key: turnKey(bidId, taskId),
    completedTask: { content: 'Generate schema migrations', completedBy: 'Omolola Makinde' },
    nextTask: { id: taskId, content: next, due_on: '2026-06-16', app_url: `https://x/${taskId}` },
  });

  test('single turn: subject names the bid and the task', () => {
    const { subject, html, text } = renderTurnsEmail([turn(100, 'UTD Residential Life', 2, 'Sign the agreement')]);
    expect(subject).toBe('[Your Turn] UTD Residential Life - Sign the agreement');
    expect(html).toContain('UTD Residential Life');
    expect(text).toContain('Sign the agreement');
  });

  test('multiple turns: ONE email, count in subject, every bid present', () => {
    const { subject, html } = renderTurnsEmail([
      turn(100, 'UTD Residential Life', 2, 'Sign UTD agreement'),
      turn(200, 'Patriot', 4, 'Approve Patriot go/no-go'),
    ]);
    expect(subject).toBe('[Your Turn] 2 Gov Contracts bids waiting on you');
    expect(html).toContain('UTD Residential Life');
    expect(html).toContain('Patriot');
  });

  test('no em-dashes survive rendering (Ali style rule)', () => {
    const { html, text } = renderTurnsEmail([turn(100, 'A — B', 2, 'Sign — now')]);
    expect(html).not.toContain('—');
    expect(text).not.toContain('—');
  });
});

export {};
