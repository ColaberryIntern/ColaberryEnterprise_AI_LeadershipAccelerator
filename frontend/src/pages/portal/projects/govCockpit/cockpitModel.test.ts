import { buildTasks, summarize, STAGES } from './cockpitModel';
import type { StudentGovProjectView } from '../../../../services/govProjectPortalApi';

/**
 * cockpitModel merges AI build stories + human proposal tasks into one board model. It trusts the backend's
 * stage/owner/mine when present and derives them otherwise (older backend). The rail it preserves: a commit is
 * `matched`, never `done` — only verified evidence is done.
 */
const story = (over: any = {}): any => ({
  id: 'STORY-' + (over.requirementId ?? 'R1'), requirementId: 'R1', title: 'Build the thing', statement: 'Build the thing',
  release: 'r0', acceptance: ['Satisfies R1'], status: 'unassigned', prompt: '# prompt', evidence: [], ...over,
});
const prop = (over: any = {}): any => ({ requirementId: 'P1', statement: 'Security approach', status: 'draft', approved: false, openGapCount: 1, ...over });
const view = (over: Partial<StudentGovProjectView> = {}): StudentGovProjectView => ({
  projectId: 'dp-1', name: 'X', status: 'discovery', tracks: [], requirements: [], requirementCounts: { total: 0, proposal: 0, build: 0 },
  build: { releases: [], buildStoryCount: 0, stories: [], orphanedStories: [] } as any,
  viewerCanVerify: false, ...over,
});

describe('buildTasks — unified AI + proposal task list', () => {
  it('maps a build story (owner ai, track build) and a proposal item (owner human, track proposal)', () => {
    const v = view({
      build: { releases: [], buildStoryCount: 1, stories: [story({ stage: 'build', mine: true })], orphanedStories: [] } as any,
      submissionChecklist: { items: [prop({ stage: 'build', mine: false })], counts: { total: 1, approved: 0, remaining: 1 }, ready: false },
    });
    const tasks = buildTasks(v);
    expect(tasks.map((t) => t.key)).toEqual(['R1', 'P1']);
    expect(tasks[0]).toMatchObject({ owner: 'ai', track: 'build', stage: 'build', mine: true, storyId: 'STORY-R1' });
    expect(tasks[1]).toMatchObject({ owner: 'human', track: 'proposal', stage: 'build', mine: false, storyId: null, openGapCount: 1 });
  });

  it('includes preserved (orphaned) build stories', () => {
    const v = view({ build: { releases: [], buildStoryCount: 0, stories: [], orphanedStories: [story({ requirementId: 'OLD', orphaned: true, stage: 'matched' })] } as any });
    const tasks = buildTasks(v);
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ key: 'OLD', orphaned: true });
  });

  it('derives the stage when the backend did not send one (commit ⇒ matched, never done)', () => {
    const v = view({ build: { releases: [], buildStoryCount: 2, orphanedStories: [], stories: [
      story({ requirementId: 'A', status: 'assigned', evidence: [{ id: 'e', status: 'submitted', source: 'github_push', commitSha: 'abc', description: 'feat A', storyId: 'STORY-A', canonicalReqId: 'A', artifactRef: null, submittedAt: null }] }),
      story({ requirementId: 'B', status: 'assigned', evidence: [{ id: 'e2', status: 'verified', storyId: 'STORY-B', canonicalReqId: 'B', description: 'done', artifactRef: null, submittedAt: null }] }),
    ] } as any });
    const tasks = buildTasks(v);
    expect(tasks.find((t) => t.key === 'A')!.stage).toBe('matched');     // commit present, not verified
    expect(tasks.find((t) => t.key === 'A')!.commit).toEqual({ sha: 'abc', message: 'feat A' });
    expect(tasks.find((t) => t.key === 'B')!.stage).toBe('done');        // verified
  });

  it('is total on a null/empty view', () => {
    expect(buildTasks(null)).toEqual([]);
    expect(buildTasks(view())).toEqual([]);
  });
});

describe('summarize — the progress + stat numbers', () => {
  it('counts stages, computes percent verified, and splits AI vs human + awaiting-review', () => {
    const v = view({
      build: { releases: [], buildStoryCount: 3, orphanedStories: [], stories: [
        story({ requirementId: 'A', stage: 'done' }), story({ requirementId: 'B', stage: 'matched' }), story({ requirementId: 'C', stage: 'todo' }),
      ] } as any,
      submissionChecklist: { items: [prop({ requirementId: 'P1', stage: 'build' })], counts: { total: 1, approved: 0, remaining: 1 }, ready: false },
    });
    const s = summarize(buildTasks(v));
    expect(s.total).toBe(4);
    expect(s.counts).toEqual({ todo: 1, build: 1, matched: 1, done: 1 });
    expect(s.pct).toBe(25);              // 1 of 4 verified
    expect(s.aiCount).toBe(3);
    expect(s.humanCount).toBe(1);
    expect(s.reviewCount).toBe(1);       // one matched, awaiting review
  });

  it('is total on empty (no divide-by-zero)', () => {
    expect(summarize([])).toMatchObject({ total: 0, pct: 0, reviewCount: 0 });
  });
});

it('STAGES is the 4-column board order', () => {
  expect(STAGES.map((s) => s.id)).toEqual(['todo', 'build', 'matched', 'done']);
});
