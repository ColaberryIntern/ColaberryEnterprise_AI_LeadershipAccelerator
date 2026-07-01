/**
 * Unit tests for the Ali Task Agent (ATA) pure logic + injectable primitives.
 *
 * Covers, per the Test Strategy Framework (happy + failure + boundary +
 * idempotency), the guardrails that make it safe to act AS Ali:
 *   - self-loop marker detection (isAtaPost) and thread idempotency (alreadyHandled)
 *   - outward-facing classifier (the autonomy gate)
 *   - identity halt (assertAliIdentity) - the inverse of CB's identity halt
 *   - deterministic scoring + assignee filter + queue build
 *   - executor primitives: sign-off appended, em-dash stripped, no external send,
 *     completion endpoint, dry-run no-op
 *   - report renderer smoke (sections + counts)
 */
/* eslint-disable @typescript-eslint/no-var-requires */
const { ATA_MARKER, isAtaPost, ataSignoffHtml, stripEmDashes } = require('../lib/aliTaskAgent/signoff');
const { alreadyHandled } = require('../lib/aliTaskAgent/ataIdempotency');
const { classifyTask, isOutwardFacing } = require('../lib/aliTaskAgent/outwardFacing');
const { assertAliIdentity, resolveIdentity, AtaIdentityHalt } = require('../lib/aliTaskAgent/aliTokenSource');
const { scoreTask, isAssignedToAli, buildQueue, buildQueueFromRows, filterByCommented, mirrorRowToItem, daysSince } = require('../lib/aliTaskAgent/queueBuilder');
const { collectAliParents, fetchAliCommentedTodoIds } = require('../lib/aliTaskAgent/recentlyCommented');
const executor = require('../lib/aliTaskAgent/executor');
const { renderRunReport, renderRunReportText } = require('../lib/aliTaskAgent/renderRunReport');

const ALI = 17454835;
const TODAY = new Date('2026-06-30T12:00:00Z');

describe('signoff / self-loop guard', () => {
  test('isAtaPost true only when authored by Ali AND carries the marker', () => {
    const ataComment = { creator: { id: ALI }, content: `Done. <code>${ATA_MARKER}</code>` };
    expect(isAtaPost(ataComment, ALI)).toBe(true);
  });

  test('a genuine Ali comment with no marker is NOT an ATA post', () => {
    expect(isAtaPost({ creator: { id: ALI }, content: 'I did this myself' }, ALI)).toBe(false);
  });

  test('someone else cannot be mistaken for ATA even quoting the marker', () => {
    expect(isAtaPost({ creator: { id: 999 }, content: `look: ${ATA_MARKER}` }, ALI)).toBe(false);
  });

  test('null-safe', () => {
    expect(isAtaPost(null, ALI)).toBe(false);
    expect(isAtaPost({}, ALI)).toBe(false);
  });

  test('ataSignoffHtml embeds the marker and the AI-assistant label', () => {
    const sig = ataSignoffHtml({ runId: 'ATA-1' });
    expect(sig).toContain(ATA_MARKER);
    expect(sig).toMatch(/AI assistant/i);
  });

  test('stripEmDashes replaces em/en dashes', () => {
    expect(stripEmDashes('a—b–c')).toBe('a-b-c');
  });
});

describe('idempotency (thread is authoritative)', () => {
  test('alreadyHandled true when an ATA post exists on the thread', () => {
    const comments = [
      { creator: { id: 123 }, content: 'human note' },
      { creator: { id: ALI }, content: `deliverable ${ATA_MARKER}` },
    ];
    expect(alreadyHandled(comments, ALI)).toBe(true);
  });

  test('alreadyHandled false on a fresh thread (only human comments)', () => {
    expect(alreadyHandled([{ creator: { id: ALI }, content: 'just me' }], ALI)).toBe(false);
    expect(alreadyHandled([], ALI)).toBe(false);
    expect(alreadyHandled(null, ALI)).toBe(false);
  });
});

describe('outward-facing classifier (autonomy gate)', () => {
  test.each([
    'Email the client the updated proposal',
    'Schedule a call with the vendor',
    'Approve the SOW and sign it',
    'Interview the new intern candidate',
    'Send pricing to the prospect',
    'Pay the invoice',
    'Post the announcement to LinkedIn',
  ])('OUTWARD: %s', (title) => {
    expect(classifyTask(title)).toBe('outward');
    expect(isOutwardFacing(title)).toBe(true);
  });

  test.each([
    'Draft the architecture doc for the portal',
    'Summarize the research on AI use cases',
    'Refactor the scoring service',
    'Write the spec for the queue builder',
  ])('INTERNAL: %s', (title) => {
    expect(classifyTask(title)).toBe('internal');
  });

  test('empty/null defaults to internal but is harmless (no action without a task)', () => {
    expect(classifyTask('')).toBe('internal');
    expect(classifyTask(null)).toBe('internal');
  });
});

describe('identity halt (must be Ali)', () => {
  test('assertAliIdentity resolves when the token is Ali', async () => {
    const bcGet = async () => ({ id: ALI, name: 'Ali Muwwakkil' });
    await expect(assertAliIdentity({ bcGet })).resolves.toEqual({ id: ALI, name: 'Ali Muwwakkil' });
  });

  test('assertAliIdentity HALTS (throws) when the token is someone else (CB System)', async () => {
    const bcGet = async () => ({ id: 37708014, name: 'CB System' });
    await expect(assertAliIdentity({ bcGet })).rejects.toBeInstanceOf(AtaIdentityHalt);
  });

  test('assertAliIdentity HALTS when identity is unresolvable', async () => {
    const bcGet = async () => ({});
    await expect(assertAliIdentity({ bcGet })).rejects.toBeInstanceOf(AtaIdentityHalt);
  });

  test('resolveIdentity returns {id:null} on a null profile', async () => {
    const bcGet = async () => null;
    await expect(resolveIdentity({ bcGet })).resolves.toEqual({ id: null });
  });
});

describe('scoring + assignee filter', () => {
  test('isAssignedToAli matches the assignee list, null-safe', () => {
    expect(isAssignedToAli({ assignees: [{ id: 1 }, { id: ALI }] }, ALI)).toBe(true);
    expect(isAssignedToAli({ assignees: [{ id: 1 }] }, ALI)).toBe(false);
    expect(isAssignedToAli({}, ALI)).toBe(false);
    expect(isAssignedToAli(null, ALI)).toBe(false);
  });

  test('overdue scores higher than due-today higher than far-future', () => {
    const overdue = scoreTask({ due_on: '2026-06-20', updated_at: '2026-06-29' }, TODAY);
    const today = scoreTask({ due_on: '2026-06-30', updated_at: '2026-06-29' }, TODAY);
    const far = scoreTask({ due_on: '2026-08-30', updated_at: '2026-06-29' }, TODAY);
    expect(overdue).toBeGreaterThan(today);
    expect(today).toBeGreaterThan(far);
  });

  test('staleness and keyword tier add weight; score caps at 100', () => {
    const stale = scoreTask({ due_on: '2026-06-20', updated_at: '2026-05-01', content: 'URGENT blocker' }, TODAY);
    expect(stale).toBeLessThanOrEqual(100);
    expect(stale).toBeGreaterThan(scoreTask({ due_on: '2026-06-20', updated_at: '2026-06-29', content: 'tidy up' }, TODAY));
  });

  test('daysSince is whole-day and sign-correct', () => {
    expect(daysSince('2026-06-28', TODAY)).toBe(2);
    expect(daysSince(null, TODAY)).toBeNull();
  });
});

describe('buildQueue (API-direct, mocked client)', () => {
  const bc = {
    bcGet: async (p: string) => ({ dock: [{ name: 'todoset', id: 11 }] }),
    bcGetAll: async (p: string) => {
      if (p === '/projects.json') return [{ id: 1, name: 'P1', dock: [{ name: 'todoset', id: 11 }] }];
      if (p.includes('/todosets/11/todolists.json')) return [{ id: 21, name: 'L1', completed: false }];
      if (p.includes('/todolists/21/todos.json')) {
        return [
          { id: 100, content: 'Mine A', assignees: [{ id: ALI }], due_on: '2026-06-20', updated_at: '2026-06-29' },
          { id: 101, content: 'Not mine', assignees: [{ id: 5 }], due_on: '2026-06-20', updated_at: '2026-06-29' },
          { id: 102, content: 'Mine B', assignees: [{ id: ALI }], due_on: '2026-08-30', updated_at: '2026-06-29' },
        ];
      }
      return [];
    },
  };

  test('returns only Ali-assigned todos, priority-sorted (overdue first)', async () => {
    const q = await buildQueue({ aliId: ALI, today: TODAY, bc });
    expect(q.map((i: any) => i.todo.id)).toEqual([100, 102]);
    expect(q[0].score).toBeGreaterThan(q[1].score);
    expect(q[0].projectName).toBe('P1');
  });

  test('respects max', async () => {
    const q = await buildQueue({ aliId: ALI, today: TODAY, bc, max: 1 });
    expect(q).toHaveLength(1);
  });
});

describe('recently-commented filter (relevance)', () => {
  const SINCE = Date.parse('2026-06-01T00:00:00Z');
  const rec = (creatorId: number, at: string, parentId: number | null, type = 'Todo') => ({
    creator: { id: creatorId },
    created_at: at,
    parent: parentId == null ? null : { id: parentId, type },
  });

  test('collectAliParents keeps only Ali-authored Todo parents within the window', () => {
    const page = [
      rec(ALI, '2026-06-20T10:00:00Z', 100),      // keep
      rec(999, '2026-06-21T10:00:00Z', 101),      // not Ali
      rec(ALI, '2026-05-15T10:00:00Z', 102),      // before window
      rec(ALI, '2026-06-22T10:00:00Z', 103, 'Message'), // not a Todo
      rec(ALI, '2026-06-23T10:00:00Z', 100),      // dup of 100
    ];
    const { ids, oldest } = collectAliParents(page, ALI, SINCE);
    expect([...ids].sort()).toEqual([100]);
    expect(oldest).toBe(Date.parse('2026-05-15T10:00:00Z'));
  });

  test('collectAliParents is null-safe and accumulates across pages', () => {
    const acc = new Set<number>([1]);
    const { ids } = collectAliParents(null, ALI, SINCE, acc);
    expect([...ids]).toEqual([1]);
    collectAliParents([rec(ALI, '2026-06-25T00:00:00Z', 2)], ALI, SINCE, ids);
    expect([...ids].sort()).toEqual([1, 2]);
  });

  test('fetchAliCommentedTodoIds walks pages and stops at the window edge', async () => {
    const pages: any = {
      1: [rec(ALI, '2026-06-28T00:00:00Z', 100), rec(999, '2026-06-28T00:00:00Z', 200)],
      2: [rec(ALI, '2026-06-10T00:00:00Z', 101)],
      3: [rec(ALI, '2026-05-01T00:00:00Z', 102)], // crosses the edge -> stop after this page
      4: [rec(ALI, '2026-04-01T00:00:00Z', 103)], // must never be read
    };
    let maxPageRead = 0;
    const bc = {
      bcGet: async (p: string) => {
        const n = Number((p.match(/page=(\d+)/) || [])[1]);
        maxPageRead = Math.max(maxPageRead, n);
        return pages[n] || [];
      },
    };
    const res = await fetchAliCommentedTodoIds({ aliId: ALI, sinceMs: SINCE, bc });
    expect([...res.ids].sort()).toEqual([100, 101]); // 102 is before window; 103 never read
    expect(res.reachedEdge).toBe(true);
    expect(maxPageRead).toBe(3);
  });

  test('filterByCommented keeps only listed todos; null set is a no-op', () => {
    const items = [{ todo: { id: 1 } }, { todo: { id: 2 } }, { todo: { id: 3 } }];
    expect(filterByCommented(items, new Set([2])).map((i: any) => i.todo.id)).toEqual([2]);
    expect(filterByCommented(items, null)).toHaveLength(3);
  });
});

describe('mirror-sourced queue', () => {
  const row = (over: any = {}) => ({
    bc_id: 1, project_id: 9, project_name: 'P', todolist_name: 'L',
    title: 'A task', description: '', due_on: '2026-07-01', bc_app_url: 'https://x/1',
    urgency_score: 50, bc_updated_at: '2026-06-30T00:00:00Z', ...over,
  });

  test('mirrorRowToItem prefers stored urgency_score, marks Ali as assignee', () => {
    const it = mirrorRowToItem(row({ urgency_score: 77 }));
    expect(it.score).toBe(77);
    expect(it.todo.assignees[0].id).toBe(ALI);
    expect(it.projectName).toBe('P');
    expect(it.todo.content).toBe('A task');
  });

  test('buildQueueFromRows filters by commented set, sorts by score, respects max', () => {
    const rows = [
      row({ bc_id: 1, urgency_score: 10 }),
      row({ bc_id: 2, urgency_score: 90 }),
      row({ bc_id: 3, urgency_score: 50 }),
    ];
    const commented = new Set([1, 2]); // 3 filtered out even though mid-score
    const q = buildQueueFromRows(rows, { commentedTodoIds: commented, max: 5 });
    expect(q.map((i: any) => i.todo.id)).toEqual([2, 1]); // 2 (90) before 1 (10), 3 excluded
    expect(buildQueueFromRows(rows, { commentedTodoIds: commented, max: 1 })).toHaveLength(1);
  });
});

describe('executor primitives (injected bcPost/updateTodo)', () => {
  test('postComment strips em-dashes and appends the sign-off marker', async () => {
    const calls: any[] = [];
    const bcPost = async (p: string, body: any) => { calls.push({ p, body }); return { ok: true }; };
    await executor.postComment({ projectId: 1, todoId: 2, html: 'do—it', runId: 'R1', bcPost });
    expect(calls).toHaveLength(1);
    expect(calls[0].p).toBe('/buckets/1/recordings/2/comments.json');
    expect(calls[0].body.content).toContain(ATA_MARKER);
    expect(calls[0].body.content).not.toContain('—');
  });

  test('completeTodo hits the completion endpoint', async () => {
    const calls: any[] = [];
    const bcPost = async (p: string, body: any) => { calls.push(p); return { ok: true }; };
    await executor.completeTodo({ projectId: 1, todoId: 2, bcPost });
    expect(calls).toContain('/buckets/1/todos/2/completion.json');
  });

  test('queueForApproval posts a [DRAFT - needs Ali] banner and never sends externally', async () => {
    const calls: any[] = [];
    const bcPost = async (p: string, body: any) => { calls.push(body.content); return { ok: true }; };
    await executor.queueForApproval({ projectId: 1, todoId: 2, draftHtml: '<p>email body</p>', reason: 'outward-facing', bcPost });
    expect(calls[0]).toContain('[DRAFT - needs Ali]');
    expect(calls[0]).toContain('email body');
    // The executor module exposes no external-send primitive at all.
    expect(executor.sendEmail).toBeUndefined();
    expect(executor.postToSocial).toBeUndefined();
  });

  test('dry-run records intent without calling Basecamp', async () => {
    let called = false;
    const bcPost = async () => { called = true; return {}; };
    const r = await executor.postComment({ projectId: 1, todoId: 2, html: 'x', dryRun: true, bcPost });
    expect(called).toBe(false);
    expect(r.dryRun).toBe(true);
  });
});

describe('report renderer', () => {
  const summary = {
    runId: 'ATA-1',
    runAt: '2026-06-30T13:00:00Z',
    dryRun: false,
    identity: { id: ALI, name: 'Ali Muwwakkil' },
    counts: { scanned: 3, done: 1, queued: 1, failed: 1, skipped: 0 },
    done: [{ projectName: 'P1', title: 'Wrote the spec', url: 'https://x/1', note: 'Deliverable posted' }],
    needsApproval: [{ projectName: 'P2', title: 'Email client', url: 'https://x/2', reason: 'outward-facing' }],
    couldntDo: [{ projectName: 'P3', title: 'Pull report', url: 'https://x/3', reason: 'draft failed' }],
  };

  test('HTML includes all three sections, counts, and the home-base messaging', () => {
    const html = renderRunReport(summary);
    expect(html).toContain('Done');
    expect(html).toContain('Needs your approval');
    expect(html).toContain("Couldn't do");
    expect(html).toContain('Wrote the spec');
    expect(html).not.toContain('—'); // never em-dashes
  });

  test('text fallback lists the items', () => {
    const txt = renderRunReportText(summary);
    expect(txt).toContain('Email client');
    expect(txt).toContain('Needs your approval (1)');
  });

  test('dry-run badge surfaces when dryRun is true', () => {
    expect(renderRunReport({ ...summary, dryRun: true })).toMatch(/DRY RUN/i);
  });

  test('digest mode reframes the report and hides the blocked pill/section', () => {
    const html = renderRunReport({ ...summary, mode: 'digest', couldntDo: [] });
    expect(html).toContain('Your priority queue');
    expect(html).toContain('I can handle these once live');
    expect(html).toContain('Needs your decision');
    expect(html).toContain('nothing was posted');
    expect(html).not.toContain('Blocked'); // pill dropped in digest mode
    expect(html).not.toContain("Couldn't do"); // section hidden when empty in digest
  });
});
