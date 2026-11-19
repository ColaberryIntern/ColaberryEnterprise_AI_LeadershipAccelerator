import { projectStoryInBrief, storyInBriefProblem, STORY_IN_BRIEF_LIMITS } from '../caseStudyStoryInBrief';
import { collectNarrative } from '../caseStudyPublishClaimScan';

const beats = [
  { label: 'Before', text: 'The funnel report was read once and then trusted for months.' },
  { label: 'What we built', text: 'A weekly report that names one move and hands Claude Code the prompt to build it.' },
  { label: 'What happened', text: 'Each edition grades the last move against the test it was given.' },
  { label: 'Why it matters', text: 'The reporting grows with every decision instead of going stale.' },
];

describe('the story in brief', () => {
  it('projects a usable set of beats, trimmed', () => {
    const out = projectStoryInBrief([{ label: '  Before ', text: ' one  two ' }, ...beats.slice(1)]);
    expect(out).toHaveLength(4);
    expect(out[0]).toEqual({ label: 'Before', text: 'one two' });
  });

  it('draws no band for a record without beats; nothing is derived', () => {
    expect(projectStoryInBrief(undefined)).toEqual([]);
    expect(storyInBriefProblem(undefined)).toBe('no story in brief');
  });

  it('is all or nothing: too few, too many, or one empty beat drops the band', () => {
    expect(projectStoryInBrief(beats.slice(0, 2))).toEqual([]);
    expect(projectStoryInBrief([...beats, beats[0], beats[1]])).toEqual([]);
    expect(projectStoryInBrief([...beats.slice(0, 3), { label: 'Why it matters', text: ' ' }])).toEqual([]);
    expect(storyInBriefProblem([...beats.slice(0, 3), { label: '', text: 'x' }])).toBe('beat 4 has no label');
  });

  it('refuses a beat longer than a glance', () => {
    const long = 'x'.repeat(STORY_IN_BRIEF_LIMITS.maxTextChars + 1);
    expect(storyInBriefProblem([...beats.slice(0, 3), { label: 'Why', text: long }])).toMatch(/beat 4 text is/);
    expect(projectStoryInBrief([...beats.slice(0, 3), { label: 'Why', text: long }])).toEqual([]);
  });

  it('every beat is scanned for claims like the standfirst', () => {
    const at = collectNarrative({ identity: { storyInBrief: beats } } as any).map((t) => t.path);
    expect(at).toEqual(expect.arrayContaining(['identity.storyInBrief[0].label', 'identity.storyInBrief[3].text']));
  });
});
