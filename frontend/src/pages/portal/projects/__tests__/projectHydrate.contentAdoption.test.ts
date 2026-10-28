import {
  overlayCompletions, adoptServerContent, backendTreeToProject,
  type BackendProjectTree, type BackendTaskNode,
} from '../projectHydrate';
import type { StudentProject, ProjectTask } from '../projectsStore';

/**
 * SERVER-AUTHORED STORY CONTENT MUST REACH A DEVICE THAT ALREADY HOLDS THE STORY.
 *
 * ── WHY THIS SUITE IS NOT projectHydrate.renamedTitle.test.ts AGAIN ──────────
 *
 * That suite closes with "These tests exist so the fourth one is caught by a
 * test instead of a screenshot." The fourth one was not caught, because the
 * suite guards the FIELD (`title`) and not the RULE. `prompt`, `what` and
 * `acceptance` went stale the same way a few weeks later.
 *
 * On 2026-10-21 Mihret opened a story and read "This story is human work ... no
 * prompt on purpose". The row held a correct ~4,100-character prompt. She was
 * told to hard refresh, which cannot help — the stale copy is in localStorage,
 * which outlives a refresh — and eventually opened an incognito window on her
 * own initiative, where an empty store forces the hydrate path, and saw the
 * real prompt. Quincy hit it on a different story hours later. Every
 * server-side check passed the whole time: 0 rows table-wide carried the
 * phrase, so nothing server-side could see a problem.
 *
 * So the LAST test in this file is the one that matters. It does not name any
 * field: it asserts that a device holding the story ends up with the same story
 * as a device seeing it for the first time, which is the invariant
 * `taskFromServer`'s own docblock states. Add a seventh server-authored field
 * and that test fails until adoption carries it, with no one needing to
 * remember this file exists.
 */

const localTask = (over: Partial<ProjectTask> = {}): ProjectTask => ({
  id: 't1', title: 'STORY-001', storyId: 'STORY-001', state: 'todo', due: 'up', ...over,
});

// Named to MATCH the tree below: the overlay also adopts the server's project
// name, so a fixture that disagrees about it could never return the same
// reference, and the fast-path tests would pass or fail for the wrong reason.
const localProject = (tasks: ProjectTask[]): StudentProject => ({
  id: 'p1', name: 'My Build', slug: 'my-build', descriptor: '', accent: '#000', cover: '', icon: '',
  status: 'ready', createdAt: 1, stage: '', curStep: 2, size: 'project', idea: '',
  reqs: [], lists: [{ id: 'p1-L1', step: 2, name: 'L1', sub: '', tasks }], activity: [],
  preview: { toolName: 'My Build', summary: '', tools: [], dataSources: [], guardrails: [] },
});

const bTask = (over: Partial<BackendTaskNode> = {}): BackendTaskNode => ({
  id: 'uuid-STORY-001', story_id: 'STORY-001', requirement_key: null, title: 'STORY-001',
  description: null, status: 'not_started', position: 0, owner_agent: null, release_key: null,
  acceptance: null, build: null, blocked_by: [], ...over,
});

const bTree = (tasks: BackendTaskNode[]): BackendProjectTree => ({
  id: 'proj-uuid', name: 'My Build', organization_name: null,
  lists: [{ id: 'p1-L1', title: 'L1', position: 0, tasks }],
});

const story = (p: StudentProject, storyId = 'STORY-001') =>
  p.lists.flatMap((l) => l.tasks).find((t) => t.storyId === storyId) as ProjectTask;

const REAL_PROMPT = 'Build the MCP server. Start by reading the acceptance criteria below, then '
  + 'scaffold the project with `npm init`.';
const STALE_PROMPT = 'This story is human work. There is no prompt on purpose.';

describe('the Mihret case — a stale prompt on a story this device already has', () => {
  it('adopts the prompt the server holds', () => {
    const local = localProject([localTask({ prompt: STALE_PROMPT })]);
    const next = overlayCompletions(local, bTree([bTask({ build: REAL_PROMPT })]));

    expect(story(next).prompt).toBe(REAL_PROMPT);
  });

  it('adopts the description and the acceptance criteria too', () => {
    const local = localProject([localTask({ what: 'old summary', acceptance: ['old criterion'] })]);
    const next = overlayCompletions(local, bTree([bTask({
      description: 'Expose the project tree over MCP',
      acceptance: ['Given a request, the server answers', 'Given no auth, it refuses'],
    })]));

    expect(story(next).what).toBe('Expose the project tree over MCP');
    expect(story(next).acceptance).toEqual([
      'Given a request, the server answers', 'Given no auth, it refuses',
    ]);
  });
});

describe('set from the server, never cleared by it', () => {
  it('keeps a local prompt when the server sends none', () => {
    const local = localProject([localTask({ prompt: REAL_PROMPT })]);
    const next = adoptServerContent(local, bTree([bTask({ build: null })]));

    expect(story(next).prompt).toBe(REAL_PROMPT);
  });

  it('keeps local acceptance criteria when the server sends none', () => {
    const local = localProject([localTask({ acceptance: ['Given a request, it answers'] })]);
    const next = adoptServerContent(local, bTree([bTask({ acceptance: null })]));

    expect(story(next).acceptance).toEqual(['Given a request, it answers']);
  });

  it('ignores a zero or negative price, preserving the rule the points overlay set', () => {
    const local = localProject([localTask({ points: 40 })]);

    expect(story(adoptServerContent(local, bTree([bTask({ points: 0 })]))).points).toBe(40);
    expect(story(adoptServerContent(local, bTree([bTask({ points: -5 })]))).points).toBe(40);
    expect(story(adoptServerContent(local, bTree([bTask({ points: 55 })]))).points).toBe(55);
  });
});

describe('what adoption must not touch', () => {
  it('leaves the student\'s own completion alone while refreshing the text', () => {
    const local = localProject([localTask({ state: 'done', due: 'done', prompt: STALE_PROMPT })]);
    const next = adoptServerContent(local, bTree([bTask({ build: REAL_PROMPT, status: 'not_started' })]));

    expect(story(next).prompt).toBe(REAL_PROMPT);
    expect(story(next).state).toBe('done');
    expect(story(next).due).toBe('done');
  });

  it('leaves the local task id alone, because it keys the acceptance ticks', () => {
    // A student's ticked boxes are parked in localStorage under `te_ws_acc_*`
    // keyed by this id. Re-pointing it to the server's uuid would silently
    // disconnect them from their own checklist.
    const local = localProject([localTask({ id: 'p1-t1', prompt: STALE_PROMPT })]);
    const next = adoptServerContent(local, bTree([bTask({ id: 'uuid-xyz', build: REAL_PROMPT })]));

    expect(story(next).id).toBe('p1-t1');
  });

  it('changes nothing when the server returns a tree with no stories at all', () => {
    // THE PLANLESS DOMAIN PROJECT, which is what both reported cases were.
    // `buildTree` returns a tree with `lists: []` for a project that has no
    // published plan — not null, and not an error — so the client sees a
    // perfectly valid 200 carrying nothing. Adoption must read that as "the
    // server told us nothing", never as "the server says these fields are
    // empty", or a student would watch a published plan get blanked by a
    // project whose plan had simply not been written yet.
    const local = localProject([localTask({ prompt: REAL_PROMPT, what: 'summary', points: 40 })]);
    const empty: BackendProjectTree = { id: 'proj-uuid', name: 'My Build', organization_name: null, lists: [] };

    expect(adoptServerContent(local, empty)).toBe(local);
  });

  it('does not invent a story the device does not have — that is adoptServerTasks\' job', () => {
    const local = localProject([localTask({ storyId: 'STORY-001' })]);
    const next = adoptServerContent(local, bTree([bTask({ story_id: 'STORY-009' })]));

    expect(next.lists.flatMap((l) => l.tasks).map((t) => t.storyId)).toEqual(['STORY-001']);
  });
});

describe('the same-reference fast path every caller relies on', () => {
  it('returns the SAME project when the server agrees with the device', () => {
    const local = localProject([localTask({ prompt: REAL_PROMPT, what: 'summary' })]);
    const next = adoptServerContent(local, bTree([bTask({ build: REAL_PROMPT, description: 'summary' })]));

    expect(next).toBe(local);
  });

  it('compares acceptance by CONTENT, so an equal array is not a change', () => {
    // A fresh array with the same strings is a new reference every pull. Identity
    // comparison would report a change on every single load, write localStorage
    // every time, and re-render the workspace for nothing.
    const local = localProject([localTask({ acceptance: ['Given a request, it answers'] })]);
    const next = adoptServerContent(local, bTree([bTask({ acceptance: ['Given a request, it answers'] })]));

    expect(next).toBe(local);
  });

  it('returns a NEW project when a single field moved', () => {
    const local = localProject([localTask({ prompt: STALE_PROMPT })]);
    const next = adoptServerContent(local, bTree([bTask({ build: REAL_PROMPT })]));

    expect(next).not.toBe(local);
  });
});

/**
 * THE CONTROL THAT NAMES NO FIELD.
 *
 * `taskFromServer`'s docblock states the invariant this enforces: "a story
 * adopted onto an existing card has to carry the same prompt, acceptance
 * criteria and blockers as the same story on a fresh device, or the workspace
 * shows different work depending on which browser opened it."
 *
 * So: build the project both ways from ONE tree and compare every key. `id`,
 * `state` and `due` are exempt and that is deliberate — the fresh device mints
 * its own ids and ranks its own `today`, and completion belongs to the student.
 * Everything else must match.
 *
 * Nothing here lists the content fields, which is the whole point: the fourth,
 * fifth and sixth forgotten fields each slipped past a test that named the
 * third. This one fails on the seventh without being edited.
 */
describe('a device that has the story and a device seeing it for the first time', () => {
  const EXEMPT = new Set(['id', 'state', 'due']);

  /** Both tasks' content keys, with undefined and null treated as the same fact. */
  const content = (a: ProjectTask, b: ProjectTask) => {
    const keys = [...new Set([...Object.keys(a), ...Object.keys(b)])]
      .filter((k) => !EXEMPT.has(k)).sort();
    const pick = (t: ProjectTask) => Object.fromEntries(
      keys.map((k) => [k, (t as unknown as Record<string, unknown>)[k] ?? null]),
    );
    return { fresh: pick(a), adopted: pick(b) };
  };

  it('end up holding the same story', () => {
    // Every server-authored field populated and DIFFERENT from what the device
    // holds, so a field adoption skips shows up as a mismatch rather than as
    // two coincidentally-equal blanks.
    const tree = bTree([bTask({
      title: 'Expose the tree over MCP',
      description: 'Expose the project tree over MCP',
      build: REAL_PROMPT,
      requirement_key: 'R7',
      owner_agent: 'architect',
      release_key: 'r1 (wk4)',
      acceptance: ['Given a request, it answers', 'Given no auth, it refuses'],
      blocked_by: ['STORY-000'],
      points: 55,
      verified_at: '2026-10-21T18:30:00.000Z',
    })]);

    const staleLocal = localProject([localTask({
      title: 'STORY-001', prompt: STALE_PROMPT, what: 'old summary',
      acceptance: ['old criterion'], req: 'R1', owner: 'nobody', release: 'r0 (wk1)',
      blockedBy: [], points: 10, verifiedAt: null,
    })]);

    const { fresh, adopted } = content(
      story(backendTreeToProject(tree)),
      story(overlayCompletions(staleLocal, tree)),
    );

    expect(adopted).toEqual(fresh);
  });

  it('and still do when the device has never stored those fields at all', () => {
    // The pre-plan case: a card minted by the browser's starter template, whose
    // tasks carry a title and nothing else.
    const tree = bTree([bTask({
      title: 'Expose the tree over MCP', description: 'summary', build: REAL_PROMPT,
      requirement_key: 'R7', owner_agent: 'architect', release_key: 'r1 (wk4)',
      acceptance: ['Given a request, it answers'], blocked_by: ['STORY-000'], points: 55,
      verified_at: '2026-10-21T18:30:00.000Z',
    })]);

    const { fresh, adopted } = content(
      story(backendTreeToProject(tree)),
      story(overlayCompletions(localProject([localTask()]), tree)),
    );

    expect(adopted).toEqual(fresh);
  });
});
