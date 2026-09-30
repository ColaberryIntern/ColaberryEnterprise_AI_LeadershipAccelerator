/**
 * A card that says "Creating…" over a finished build.
 *
 * ── THE DEFECT ───────────────────────────────────────────────────────────────
 *
 * MEASURED 2026-08-18, production, ali@colaberry.com, project
 * cce94c20-a398-45b3-a6fb-b3fc87b6b1ef. His Projects page showed a single card
 * reporting BOTH "Creating…" and a complete, verified task tree at the same
 * time, and the workspace behind it said "still building". He read that as work
 * having been lost, mid-demo. Nothing was lost: the server row was healthy the
 * whole time (22 tasks, STORY-000 complete and verified against commit
 * 33f5436, 5/5 criteria). Only the browser's `status` field was wrong.
 *
 * `BuildCard` (ProjectsPage.tsx) derives its LABEL from `status` and its
 * NUMBERS from `lists`. Those two are allowed to disagree, so a card whose
 * `status` is stuck at `creating` while its `lists` are full renders as:
 *
 *     Creating…   ·   12/12 tasks   ·   8/8 verified   ·   [100% bar]
 *
 * ── HOW `status` GETS STUCK — TWO INDEPENDENT PATHS ──────────────────────────
 *
 * A. `createProjectFromAnswers` schedules a 7s timer that flips `creating` to
 *    `ready`, and looks the project up by the pseudo id it minted (`p<epoch>`).
 *    Meanwhile `claimBackendProject` re-keys that same project to the server's
 *    UUID and files the pseudo id under `legacyIds` — which is exactly what
 *    projectsStore.idAdoption.test.ts exists to guarantee. The timer's raw
 *    `find(x => x.id === id)` does not consult `legacyIds`, so it finds
 *    nothing and returns early. `GET /api/portal/projects/active` answers in
 *    well under 7s, so adoption normally wins the race: this is the COMMON
 *    case, not the edge case.
 *
 * B. `overlayCompletions` — the only path a device that already holds the
 *    project ever takes — adopts the server's tasks, completions, name and
 *    Command Center URL, and never normalises `status`. So even once the real
 *    tree arrives, the stale `creating` flag survives every subsequent sync.
 *
 * Path A strands the card. Path B is why it stays stranded forever, and is
 * therefore also the repair: a card the server is actively describing is not
 * being created, whatever this device last wrote down.
 *
 * ── WHAT THIS IS NOT ─────────────────────────────────────────────────────────
 *
 * Not the cause of his name mismatch — that was a server-side row whose
 * `projects.name` disagreed with its own published plan, fixed separately.
 * Not data loss: no test here asserts a repair of `lists`, because `lists` was
 * never wrong.
 */
import { overlayCompletions, type BackendProjectTree, type BackendTaskNode } from '../projectHydrate';
import type { StudentProject, ProjectTask } from '../projectsStore';
import { createProjectFromAnswers, claimBackendProject, getProject } from '../projectsStore';

const PROJECT_ID = 'cce94c20-a398-45b3-a6fb-b3fc87b6b1ef';

const bTask = (story_id: string, position: number, status = 'complete'): BackendTaskNode => ({
  id: `uuid-${story_id}`, story_id, requirement_key: null, title: `${story_id} title`,
  description: null, status, position, owner_agent: null, release_key: null,
  acceptance: null, build: null, blocked_by: [],
});

/** His shape: a real, published build with a completed first story. */
const serverTree = (): BackendProjectTree => ({
  id: PROJECT_ID, name: 'PropertyPulse AI', organization_name: null,
  lists: [{
    id: 'l-r0', title: 'Release 0 · Initial Setup and Trust Spine', position: 0,
    tasks: [bTask('STORY-000', 0, 'complete'), bTask('STORY-001', 1, 'not_started')],
  }],
});

const localTask = (storyId: string): ProjectTask =>
  ({ id: `uuid-${storyId}`, title: `${storyId} title`, storyId, state: 'todo', due: 'up' });

/** The stranded card: status stuck at `creating`, but holding the real tree. */
const strandedCard = (over: Partial<StudentProject> = {}): StudentProject => ({
  id: PROJECT_ID, name: 'PropertyPulse AI', slug: 'propertypulse-ai', descriptor: '',
  accent: '#000', cover: '', icon: '', status: 'creating', createdAt: 1, stage: '',
  curStep: 2, size: 'project', idea: '', sample: false, reqs: [], activity: [],
  preview: { toolName: 'PropertyPulse AI', summary: '', tools: [], dataSources: [], guardrails: [] },
  lists: [{
    id: 'l-r0', step: 2, name: 'Release 0 · Initial Setup and Trust Spine', sub: '',
    tasks: [localTask('STORY-000'), localTask('STORY-001')],
  }],
  ...over,
});

// ── path B: the repair that also heals every already-stranded device ─────────
describe('a card the server is describing is not "creating"', () => {
  it('clears the stale creating flag when the server tree arrives', () => {
    expect(strandedCard().status).toBe('creating');   // the precondition, spelled out

    const merged = overlayCompletions(strandedCard(), serverTree());

    expect(merged.status).not.toBe('creating');
    expect(merged.status).toBe('ready');
  });

  it('never reports "creating" and a completed task in the same card', () => {
    const merged = overlayCompletions(strandedCard(), serverTree());
    const done = merged.lists.flatMap((l) => l.tasks).filter((t) => t.state === 'done');

    expect(done.length).toBeGreaterThan(0);           // STORY-000 came back complete
    expect(merged.status).not.toBe('creating');       // …so the label cannot say Creating…
  });

  it('leaves a card that is genuinely ready alone', () => {
    const ready = strandedCard({ status: 'ready' });
    expect(overlayCompletions(ready, serverTree()).status).toBe('ready');
  });

  it('does not invent tasks while repairing status — lists were never wrong', () => {
    const merged = overlayCompletions(strandedCard(), serverTree());
    expect(merged.lists.flatMap((l) => l.tasks)).toHaveLength(2);
  });
});

// ── path A: the race that stranded it in the first place ─────────────────────
describe('the assemble timer survives the project adopting its server UUID', () => {
  beforeEach(() => { localStorage.clear(); jest.useFakeTimers(); });
  afterEach(() => { jest.useRealTimers(); });

  it('still flips the project to ready after claimBackendProject re-keys it', () => {
    const localId = createProjectFromAnswers({ idea: 'PropertyPulse AI', size: 'project' } as never);
    expect(getProject(localId)?.status).toBe('creating');

    // What handleCreate does the moment GET /active answers — well inside 7s.
    claimBackendProject(localId, PROJECT_ID);
    expect(getProject(localId)?.id).toBe(PROJECT_ID);  // adoption happened

    jest.advanceTimersByTime(7000);

    // The timer must find the project under its NEW id, via legacyIds.
    expect(getProject(PROJECT_ID)?.status).toBe('ready');
  });

  it('still populates the lists it was holding back', () => {
    const localId = createProjectFromAnswers({ idea: 'PropertyPulse AI', size: 'project' } as never);
    claimBackendProject(localId, PROJECT_ID);
    jest.advanceTimersByTime(7000);

    expect(getProject(PROJECT_ID)?.lists.length).toBeGreaterThan(0);
  });

  it('is unaffected when no adoption happens at all', () => {
    const localId = createProjectFromAnswers({ idea: 'PawLife', size: 'project' } as never);
    jest.advanceTimersByTime(7000);

    expect(getProject(localId)?.status).toBe('ready');
  });
});
