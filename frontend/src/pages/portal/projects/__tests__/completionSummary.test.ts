/**
 * The hero's "nothing left to open" sentence. It used to say "Every task on
 * your build is done" whenever no unblocked todo task remained, which a student
 * read directly above a card saying "9/15 tasks" and asked which to believe.
 * Both were right about different sets; the sentence now names them.
 */
import { completionSummary } from '../ProjectsNextStepHero';
import type { StudentProject, ProjectTask } from '../projectsStore';

const task = (storyId: string, over: Partial<ProjectTask> = {}): ProjectTask =>
  ({ id: `uuid-${storyId}`, title: storyId, storyId, state: 'done', due: 'done', verifiedAt: '2026-09-11T00:00:00.000Z', ...over });

const project = (tasks: ProjectTask[]): StudentProject => ({
  id: 'p', name: 'AI Support Workflow Assistant', slug: 'aiswa', descriptor: '',
  accent: '#000', cover: '', icon: '', status: 'ready', createdAt: 1, stage: '',
  curStep: 2, size: 'project', idea: '', sample: false, reqs: [], activity: [],
  preview: { toolName: 'x', summary: '', tools: [], dataSources: [], guardrails: [] },
  lists: [{ id: 'l', step: 2, name: 'R0', sub: '', tasks }],
});

describe('completionSummary', () => {
  it('genuinely finished: the original sentence, unchanged', () => {
    const s = completionSummary(project([task('STORY-000'), task('STORY-001')]));
    expect(s.title).toBe('AI Support Workflow Assistant is complete');
    expect(s.body).toMatch(/^Every task on your build is done/);
  });

  it('the reporting case: 8 build stories verified, 6 Demo-prep steps skipped', () => {
    const stories = Array.from({ length: 8 }, (_, i) => task(`STORY-00${i}`));
    const prep = Array.from({ length: 6 }, (_, i) => task(`PREP-${i + 1}`, { state: 'skipped', due: 'up', verifiedAt: null }));
    const s = completionSummary(project([...stories, ...prep]));
    expect(s.title).toBe('AI Support Workflow Assistant: every build story is verified');
    expect(s.body).toMatch(/^All 8 build stories are verified from your repo\./);
    expect(s.body).toMatch(/6 Demo-prep steps you skipped remain\./);
    expect(s.body).not.toMatch(/Every task on your build is done/);
  });

  it('stories not all verified, but nothing open: says how many are, and what is left', () => {
    const s = completionSummary(project([
      task('STORY-000'), task('STORY-001', { verifiedAt: null }),
      task('PREP-1', { state: 'skipped', due: 'up', verifiedAt: null }),
      task('STORY-002', { state: 'skipped', due: 'up', verifiedAt: null }),
    ]));
    expect(s.title).toBe('AI Support Workflow Assistant has nothing open right now');
    expect(s.body).toMatch(/^1 of 3 build stories are verified\. 2 tasks you skipped remain\./);
  });

  it('a mix of skipped and untouched remaining tasks is counted honestly', () => {
    const s = completionSummary(project([
      task('STORY-000'),
      task('PREP-1', { state: 'skipped', due: 'up', verifiedAt: null }),
      task('PREP-2', { state: 'todo', due: 'up', verifiedAt: null }),
    ]));
    expect(s.body).toMatch(/2 Demo-prep steps, 1 skipped remain\./);
  });
});
