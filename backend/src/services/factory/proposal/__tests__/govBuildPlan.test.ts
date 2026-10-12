/**
 * deriveGovBuildPlan must be DETERMINISTIC + NON-FABRICATING: only a solution_build-classified requirement
 * becomes a story (an admin/proposal-only requirement NEVER does — the spec's "build stories where relevant"
 * rule), each story CITES its requirement verbatim with a stable id, every story is honestly `unassigned`, and
 * garbage yields an empty plan. buildGovStoryPrompt cites the requirement verbatim and references no files.
 */
import { deriveGovBuildPlan, buildGovStoryPrompt, applyAssignmentsToStories, reconcileGovBuildPlan } from '../govBuildPlan';

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

  it('prefers the requirement\'s OWN stored tracks over classifying its text (reviewer-set tracks are authoritative)', () => {
    // Stored tracks say build, but the TEXT has no build signal → still a story (stored wins).
    const yesStored = deriveGovBuildPlan([{ id: 'R1', statement: 'Provide a client reference binder.', tracks: ['proposal', 'solution_build'] }]);
    expect(yesStored.stories.map((s) => s.requirementId)).toEqual(['R1']);
    // Stored tracks say proposal-only, but the TEXT has a build signal → NO story (stored wins over text).
    const noStored = deriveGovBuildPlan([{ id: 'R2', statement: 'Provide a software system.', tracks: ['proposal'] }]);
    expect(noStored.stories).toEqual([]);
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

describe('applyAssignmentsToStories (P3-T2 overlay)', () => {
  const stories = deriveGovBuildPlan([buildReq('R1', 'A search database system.'), buildReq('R2', 'A reporting dashboard.')]).stories;

  it('overlays a persisted assignment to `assigned` + its assignee, and leaves the rest `unassigned` with no assignee', () => {
    const out = applyAssignmentsToStories(stories, [{ storyId: 'STORY-R1', canonicalReqId: 'R1', assigneeIdentityId: 'builder-7', assignedAt: '2026-10-08T00:00:00Z' }]);
    const r1 = out.find((s) => s.id === 'STORY-R1')!;
    const r2 = out.find((s) => s.id === 'STORY-R2')!;
    expect(r1.status).toBe('assigned');
    expect(r1.assigneeIdentityId).toBe('builder-7');
    expect(r2.status).toBe('unassigned');          // the honesty rail: no assignment ⇒ unassigned, never a phantom
    expect(r2.assigneeIdentityId).toBeNull();
  });

  it('NEVER fabricates an assignee — a story with no matching assignment resets to unassigned/null even if one was set before', () => {
    const preassigned = stories.map((s) => ({ ...s, status: 'assigned' as const, assigneeIdentityId: 'stale' }));
    const out = applyAssignmentsToStories(preassigned, []); // no assignments at all
    expect(out.every((s) => s.status === 'unassigned' && s.assigneeIdentityId === null)).toBe(true);
  });

  it('is total on garbage', () => {
    expect(applyAssignmentsToStories(undefined as any, undefined as any)).toEqual([]);
  });
});

describe('reconcileGovBuildPlan (P3-T4 revision-aware, preserves completed work)', () => {
  const derived = deriveGovBuildPlan([buildReq('R1', 'A search database system.')]).stories; // only STORY-R1 derives now

  it('surfaces a story whose requirement left the established set but which has EVIDENCE as an orphan — never drops it', () => {
    const recon = reconcileGovBuildPlan(
      derived,
      [],
      [{ storyId: 'STORY-R9', canonicalReqId: 'R9' }], // evidence for a story no longer derived (requirement revised away)
    );
    expect(recon.stories.map((s) => s.id)).toEqual(['STORY-R1']);     // the live plan is the current derivation
    expect(recon.orphanedStories.map((s) => s.id)).toEqual(['STORY-R9']); // the completed work is PRESERVED, not lost
    expect(recon.orphanedStories[0].orphaned).toBe(true);
    expect(recon.orphanedStories[0].requirementId).toBe('R9');        // the traceability anchor survives the revision
  });

  it('surfaces an ASSIGNED story whose requirement was revised away as an orphan, assignee preserved', () => {
    const recon = reconcileGovBuildPlan(
      derived,
      [{ storyId: 'STORY-R8', canonicalReqId: 'R8', assigneeIdentityId: 'builder-3', assignedAt: null }],
      [],
    );
    const orphan = recon.orphanedStories.find((s) => s.id === 'STORY-R8')!;
    expect(orphan).toBeTruthy();
    expect(orphan.status).toBe('assigned');
    expect(orphan.assigneeIdentityId).toBe('builder-3');
  });

  it('does NOT orphan a derived story that has evidence (its requirement is still established)', () => {
    const recon = reconcileGovBuildPlan(derived, [], [{ storyId: 'STORY-R1', canonicalReqId: 'R1' }]);
    expect(recon.orphanedStories).toEqual([]);
    expect(recon.stories.map((s) => s.id)).toEqual(['STORY-R1']);
  });
});
