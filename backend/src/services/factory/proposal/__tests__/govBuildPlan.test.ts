/**
 * deriveGovBuildPlan must be DETERMINISTIC + NON-FABRICATING: only a solution_build-classified requirement
 * becomes a story (an admin/proposal-only requirement NEVER does — the spec's "build stories where relevant"
 * rule), each story CITES its requirement verbatim with a stable id, every story is honestly `unassigned`, and
 * garbage yields an empty plan. buildGovStoryPrompt cites the requirement verbatim and references no files.
 */
import { deriveGovBuildPlan, buildGovStoryPrompt } from '../govBuildPlan';

// A build-signal requirement (classifyRequirementTracks → solution_build via words like "system"/"database").
const buildReq = (id: string, text: string) => ({ id, text, applicability: 'always', dueStage: 'submission', bindingStatus: 'binding_solicitation_requirement' });

describe('deriveGovBuildPlan', () => {
  it('turns a solution_build requirement into a cited story but NEVER makes one for an admin/proposal-only requirement', () => {
    const plan = deriveGovBuildPlan([
      buildReq('R1', 'The vendor shall provide an online claims search database system.'), // build signal
      buildReq('R2', 'Submit a completed Execution of Offer form and pricing schedule.'),  // admin — no build signal
    ]);
    expect(plan.stories.map((s) => s.requirementId)).toEqual(['R1']); // only the build requirement
    expect(plan.buildStoryCount).toBe(1);
    expect(plan.stories.some((s) => s.requirementId === 'R2')).toBe(false); // the admin form never becomes a feature
  });

  it('cites the requirement VERBATIM and gives the story a STABLE id derived from the requirement id', () => {
    const plan = deriveGovBuildPlan([buildReq('R1', 'The vendor shall provide a reporting dashboard.')]);
    expect(plan.stories[0].statement).toBe('The vendor shall provide a reporting dashboard.'); // verbatim, not paraphrased
    expect(plan.stories[0].id).toBe('STORY-R1');  // stable: derived from the requirement id, survives regeneration
    expect(plan.stories[0].acceptance[0]).toContain('reporting dashboard'); // acceptance is derived from the requirement
  });

  it('marks every story `unassigned` (never a fabricated assigned/built state) and groups them into a release', () => {
    const plan = deriveGovBuildPlan([buildReq('R1', 'Build a data migration tool.'), buildReq('R2', 'Build an integration API.')]);
    expect(plan.stories.every((s) => s.status === 'unassigned')).toBe(true);
    expect(plan.releases).toHaveLength(1);
    expect(plan.releases[0].storyIds).toEqual(['STORY-R1', 'STORY-R2']);
  });

  it('de-duplicates by requirement id', () => {
    const plan = deriveGovBuildPlan([buildReq('R1', 'A software platform.'), buildReq('R1', 'A software platform (dupe).')]);
    expect(plan.stories).toHaveLength(1);
  });

  it('skips a requirement with no id, and is total on garbage', () => {
    expect(deriveGovBuildPlan([{ text: 'A system with no id.' }]).stories).toEqual([]);
    expect(deriveGovBuildPlan(undefined as any)).toEqual({ releases: [], stories: [], buildStoryCount: 0 });
    expect(deriveGovBuildPlan([null, undefined] as any).stories).toEqual([]);
  });

  it('an all-admin requirement set yields an EMPTY plan (no releases, no stories)', () => {
    const plan = deriveGovBuildPlan([buildReq('R1', 'Provide three client references.'), buildReq('R2', 'Register in SAM.')]);
    expect(plan).toEqual({ releases: [], stories: [], buildStoryCount: 0 });
  });
});

describe('buildGovStoryPrompt', () => {
  it('cites the requirement verbatim, traces evidence back to the requirement, and references no files', () => {
    const [story] = deriveGovBuildPlan([buildReq('R1', 'The vendor shall provide a search database.')]).stories;
    const prompt = buildGovStoryPrompt(story);
    expect(prompt).toContain('The vendor shall provide a search database.'); // the requirement, verbatim
    expect(prompt).toContain('traced back to R1');                            // evidence traces to the requirement
    expect(prompt).toContain('not a software feature');                      // the anti-invention guard rail
    expect(prompt).not.toMatch(/\.(ts|tsx|js|py)\b/);                        // references no concrete file (no manifest here)
  });
});
