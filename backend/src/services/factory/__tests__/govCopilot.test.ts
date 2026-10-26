/**
 * govCopilot — the DETERMINISTIC project copilot. It classifies a question and answers from the student-safe
 * projection only, so its answers are reproducible and can never reveal more than the page already shows. Under
 * test: intent classification, each grounded answer, and that it stays honest (a matched commit "counts only once
 * verified", it never invents a proposal answer) and total on an empty project.
 */
import { classifyCopilotQuestion, answerCopilot } from '../govCopilot';
import type { StudentGovProjectView } from '../govProjectProjection';

const story = (reqId: string, title: string, stage: string, over: any = {}): any => ({
  id: 'STORY-' + reqId, requirementId: reqId, title, statement: title, release: 'r0', acceptance: [`Satisfies ${reqId}`],
  status: stage === 'todo' ? 'unassigned' : 'assigned', assigneeIdentityId: null, assignedAt: null,
  prompt: '', evidence: [], stage, owner: 'ai', mine: false, commit: null, ...over,
});
const prop = (reqId: string, statement: string, stage: string, openGapCount: number): any => ({
  requirementId: reqId, statement, status: stage === 'done' ? 'approved' : 'draft', approved: stage === 'done',
  openGapCount, stage, owner: 'human', mine: true,
});
const view = (over: Partial<StudentGovProjectView> = {}): StudentGovProjectView => ({
  projectId: 'dp-1', name: 'TDCJ-OIG RMS', status: 'discovery', tracks: [], requirements: [],
  requirementCounts: { total: 0, proposal: 0, build: 0 },
  build: {
    releases: [], buildStoryCount: 3, orphanedStories: [],
    stories: [
      story('REQ-1', 'Immutable audit log', 'matched', { mine: true, commit: { sha: 'abc123', message: 'feat(audit) REQ-1' } }),
      story('REQ-2', 'MFA after password', 'todo', { mine: true }),
      story('REQ-3', 'Case dashboard', 'done'),
    ],
  } as any,
  proposal: { level: 'edit', canComment: true, canEdit: true, responses: [] } as any,
  submissionChecklist: { items: [prop('PRP-1', 'CJIS + NIST security approach', 'build', 2), prop('PRP-2', 'Past performance', 'done', 0)], counts: { total: 2, approved: 1, remaining: 1 }, ready: false },
  viewerCanVerify: false, agency: 'TDCJ OIG', keyDates: [{ date: '2026-11-01', text: 'Proposals due' }], commitFeed: [],
  ...over,
});

describe('classifyCopilotQuestion', () => {
  it('maps keywords to intents and falls back to `other`', () => {
    expect(classifyCopilotQuestion('What should I do next?')).toBe('next');
    expect(classifyCopilotQuestion('review the matched commits')).toBe('review');
    expect(classifyCopilotQuestion("what's at risk for the deadline?")).toBe('risk');
    expect(classifyCopilotQuestion('draft a proposal answer for MFA')).toBe('proposal');
    expect(classifyCopilotQuestion('hello there')).toBe('other');
    expect(classifyCopilotQuestion('')).toBe('other');
  });
});

describe('answerCopilot — grounded, deterministic answers', () => {
  it('next: reviews first, then the next task to start, then the open proposal', () => {
    const { intent, answer } = answerCopilot(view(), 'what next?');
    expect(intent).toBe('next');
    expect(answer).toContain('REQ-1');                       // the matched commit to review
    expect(answer).toMatch(/reviewer needs to verify/i);     // viewerCanVerify false ⇒ says a reviewer must verify
    expect(answer).toContain('REQ-2');                       // the next task to start
    expect(answer).toMatch(/commit with REQ-2/);             // the commit convention is spelled out
    expect(answer).toContain('PRP-1');                       // the open proposal
    expect(answer).not.toContain('REQ-3');                   // a done task is not "next"
  });

  it('review: lists each matched commit with its acceptance, and says a reviewer must verify', () => {
    const { answer } = answerCopilot(view(), 'review');
    expect(answer).toContain('REQ-1');
    expect(answer).toContain('abc123');                      // the public commit sha
    expect(answer).toContain('Satisfies REQ-1');             // checked against the acceptance
    expect(answer).toMatch(/reviewer has to verify/i);
  });

  it('review: says nothing is waiting when no story is matched', () => {
    const v = view({ build: { releases: [], buildStoryCount: 1, orphanedStories: [], stories: [story('REQ-2', 'MFA', 'todo')] } as any });
    expect(answerCopilot(v, 'review').answer).toMatch(/nothing is waiting for review/i);
  });

  it('risk: counts the unverified, names the unstarted, and states the deadline text verbatim', () => {
    const { answer } = answerCopilot(view(), 'what is at risk?');
    // 2 build not-done (REQ-1 matched + REQ-2 todo) + 1 proposal not-done (PRP-1) = 3, of 5 total.
    expect(answer).toMatch(/3 of 5 tasks are not verified/);
    expect(answer).toContain('Proposals due — 2026-11-01');   // deadline stated, not a computed countdown
    expect(answer).toContain('REQ-2');                        // the not-started task
  });

  it('proposal: names the responses that still need work and their open gaps, and never invents an answer', () => {
    const { answer } = answerCopilot(view(), 'draft the proposal answer');
    expect(answer).toContain('PRP-1');
    expect(answer).toContain('2 open gaps');
    expect(answer).not.toContain('PRP-2');                    // an approved response is not "still needs work"
    expect(answer).toMatch(/pricing is never shown/i);
  });

  it('other: a grounded status summary naming the project, agency and counts', () => {
    const { intent, answer } = answerCopilot(view(), 'tell me a joke');
    expect(intent).toBe('other');
    expect(answer).toContain('TDCJ-OIG RMS');
    expect(answer).toContain('TDCJ OIG');
    expect(answer).toContain('1/3');                          // 1 of 3 build tasks verified
  });

  it('is total on an empty project', () => {
    const empty = view({ build: { releases: [], buildStoryCount: 0, orphanedStories: [], stories: [] } as any, submissionChecklist: { items: [], counts: { total: 0, approved: 0, remaining: 0 }, ready: false }, keyDates: [] });
    expect(answerCopilot(empty, 'next').answer).toMatch(/nothing is queued/i);
    expect(answerCopilot(empty, 'risk').answer).toMatch(/all 0 tasks are verified|0 of 0/i);
    expect(answerCopilot(empty, 'proposal').answer).toMatch(/nothing to draft/i);
  });
});
