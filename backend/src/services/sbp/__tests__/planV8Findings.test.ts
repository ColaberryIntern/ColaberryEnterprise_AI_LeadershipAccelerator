/**
 * ShiftFill v8 (2026-11-22, project 6556e1dc): r3 was named "Safety and
 * Approval Mechanisms" after its approval requirements had moved to r1 and r2,
 * and its writer did them again. STORY-010 repeated REQ-007 (STORY-003, r1) and
 * STORY-011 repeated REQ-020 (STORY-009, r2) while citing REQ-019. Ids, titles,
 * fulfills and releases below are v8's.
 */
import { keepStoriesInTheirRelease, buildReleaseStoriesPrompt, ReleaseStories } from '../releaseStories';
import { PlanRelease, PlanRequirement, PlanStory } from '../planContract';

const rel = (key: string, name: string): PlanRelease => ({ key, name, goal: 'g', demo: 'd', week_start: 1, week_end: 1 });
const req = (id: string, kind: PlanRequirement['kind'], statement: string): PlanRequirement =>
  ({ id, kind, priority: 'must', statement, cluster: 'c' }) as PlanRequirement;
const story = (id: string, title: string, fulfills: string[], blocked_by: string[] = []): PlanStory =>
  ({ id, title, fulfills, blocked_by, release: '', narrative: 'n', acceptance: ['a'] }) as unknown as PlanStory;

const REQS = [
  req('REQ-002', 'FUNC', 'Rank hygienists.'),
  req('REQ-007', 'SAFE', 'The system must never offer a shift that would push someone over 40 hours without Dana approving overtime.'),
  req('REQ-016', 'CONSTRAINT', 'The system must use Gmail, Slack, Google Sheets, and Twilio SMS.'),
  req('REQ-017', 'SAFE', 'Flag any situation it is unsure about.'),
  req('REQ-019', 'FUNC', 'The system must offer shifts to the two temp agencies after ranking hygienists.'),
  req('REQ-020', 'SAFE', "The system must require Dana's approval before sending any message to a temp agency."),
];
const RELEASE_OF = new Map([['REQ-002', 'r1'], ['REQ-007', 'r1'], ['REQ-017', 'r2'], ['REQ-020', 'r2'], ['REQ-019', 'r3']]);
const V8: ReleaseStories[] = [
  { release: rel('r1', 'Hygienist Ranking and Offer'), stories: [story('S1', 'Rank Hygienists for Shift Offers', ['REQ-002', 'REQ-007'])] },
  { release: rel('r2', 'Shift Acceptance and Notifications'), stories: [
    story('S1', "Flag uncertain situations for Dana's review", ['REQ-017']),
    story('S2', "Require Dana's approval before messaging temp agencies", ['REQ-020'], ['S1']),
  ] },
  { release: rel('r3', 'Safety and Approval Mechanisms'), stories: [
    story('S1', 'Flag Overtime Offers for Approval', ['REQ-007']),
    story('S2', 'Require Approval for Temp Agency Messages', ['REQ-020', 'REQ-019'], ['S1']),
  ] },
];

describe('a release never re-writes another release\'s requirement', () => {
  const out = keepStoriesInTheirRelease(V8, RELEASE_OF, REQS);
  const r3 = out[2].stories;

  it('drops the story that only repeats another release (v8 STORY-010)', () => {
    expect(r3.map((s) => s.title)).toEqual(['Require Approval for Temp Agency Messages']);
  });

  it('strips the foreign citation and keeps the one it owns (v8 STORY-011)', () => {
    expect(r3[0].fulfills).toEqual(['REQ-019']);
    expect(r3[0].blocked_by).toEqual([]);
  });

  it('leaves releases that stayed in scope exactly as written', () => {
    expect(out[0]).toEqual(V8[0]);
    expect(out[1]).toEqual(V8[1]);
  });

  it('never uncovers a requirement: a citation stays when its own release has no story for it', () => {
    const noR2Story = V8.map((p) => (p.release.key === 'r2' ? { ...p, stories: p.stories.slice(0, 1) } : p));
    const kept = keepStoriesInTheirRelease(noR2Story, RELEASE_OF, REQS)[2].stories;
    expect(kept.map((s) => s.fulfills)).toEqual([['REQ-020', 'REQ-019']]);
  });

  it('keeps constraints and ids the outline does not know, and a story citing only constraints', () => {
    const p: ReleaseStories[] = [{ release: rel('r0', 'R0'), stories: [story('S1', 'Wire tools', ['REQ-016', 'REQ-999'])] }];
    expect(keepStoriesInTheirRelease(p, RELEASE_OF, REQS)).toEqual(p);
  });

  it('is idempotent and does not mutate its input', () => {
    const before = JSON.stringify(V8);
    expect(keepStoriesInTheirRelease(out, RELEASE_OF, REQS)).toEqual(out);
    expect(JSON.stringify(V8)).toBe(before);
  });

  it('handles empty input', () => {
    expect(keepStoriesInTheirRelease([], RELEASE_OF, REQS)).toEqual([]);
  });
});

describe('the release prompt says where every other requirement went', () => {
  const prompt = buildReleaseStoriesPrompt(
    { brief: 'b', document: '' }, rel('r3', 'Safety and Approval Mechanisms'),
    REQS.filter((r) => r.id === 'REQ-019'), REQS, 'release r2', RELEASE_OF,
  );

  it('labels each other requirement with its release, and constraints as constraints', () => {
    expect(prompt).toContain('- REQ-020 [SAFE] (written in r2) The system must require');
    expect(prompt).toContain('- REQ-016 [CONSTRAINT] (constraint)');
  });

  it('tells the writer to go by the assigned list, not the release name', () => {
    expect(prompt).toMatch(/Go\s+by the ASSIGNED list, not the name/);
    expect(prompt).toMatch(/Every acceptance line of a story must test something its own `fulfills` asks for/);
  });

  it('still works without the map (older callers)', () => {
    const p = buildReleaseStoriesPrompt({ brief: 'b', document: '' }, rel('r3', 'R'), [], REQS, null);
    expect(p).toContain('- REQ-020 [SAFE] The system must require');
  });
});
