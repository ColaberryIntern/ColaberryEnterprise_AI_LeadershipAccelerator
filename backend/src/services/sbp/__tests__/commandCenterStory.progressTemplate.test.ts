/**
 * The starting-state template — `.colaberry/progress.json` as the prompt hands
 * it to a student.
 *
 * ── THE DEFECT THIS PINS ────────────────────────────────────────────────────
 *
 * The worked example in Step 3 seeded every criterion with `"passed": true`.
 * Students copy that block as their STARTING POINT — on a pull-only repo it is
 * the only copy of the shape that exists, because no managed block and no seeded
 * file ever reach them. Across all 15 verified stories in the system there was
 * not one partial tick: every criterion everywhere was `true`. A pre-ticked
 * template is the strongest nudge in the pipeline and it was ours.
 *
 * The prompt's own next sentence conceded it — "that example is a build where
 * all N lines are genuinely true" — which is a caption asking the reader to
 * un-tick five booleans by hand. The platform's real seeded file
 * (`renderProgressFile`) has always emitted all-`false`, the story doc has
 * always said the criteria arrive `"passed": false`, and `renderDocs` says the
 * same. The example was the single outlier, and it was the one students copied.
 *
 * ── THE SECOND TEMPLATE ─────────────────────────────────────────────────────
 *
 * The remedial template emailed on 2026-08-18 shipped all-`false` and confused a
 * student into thinking he had to earn criteria he had already met — because
 * `false` alone does not say whether it means "not done" or "not yet checked".
 * So both templates were wrong in opposite directions, and agreeing on `false`
 * is only half the fix. The file has to SAY what a tick means, in the file, where
 * someone reading it cold will see it.
 */
import { commandCenterPrompt, COMMAND_CENTER_ACCEPTANCE, COMMAND_CENTER_STORY_ID } from '../commandCenterStory';
import { parseProgressFile, renderProgressFile } from '../verification/progressContract';
import { BuildPlan } from '../planContract';

const plan: BuildPlan = {
  project_name: 'Agreement to Onboarding',
  descriptor: 'turns a signed agreement into a scheduled kickoff',
  requirements: [{
    id: 'REQ-001',
    statement: 'The system must create an onboarding record within 5 minutes.',
    kind: 'FUNC', priority: 'must', cluster: 'Intake',
  }],
  releases: [{ key: 'r0', name: 'Walking skeleton', goal: 'g', demo: 'd', week_start: 1, week_end: 2 }],
  stories: [{
    id: 'STORY-001',
    release: 'r0',
    title: 'Create the onboarding record',
    narrative: 'As an operator, I want the record made for me, so that nobody retypes it.',
    fulfills: ['REQ-001'],
    owner_agent: 'Intake Agent',
    acceptance: ['Given a signed agreement, when the webhook fires, then a record exists.'],
    task_guidance: 'guidance',
    failure_paths: ['upstream down'],
  }],
} as unknown as BuildPlan;

/** The single ```json block in Step 3 — the thing a student copies. */
function templateBlock(): string {
  const prompt = commandCenterPrompt(plan);
  const blocks = [...prompt.matchAll(/```json\n([\s\S]*?)\n```/g)].map((m) => m[1]);
  const withStory = blocks.filter((b) => b.includes(COMMAND_CENTER_STORY_ID));
  expect(withStory).toHaveLength(1);      // anti-vacuity: exactly one, or the pins below mean nothing
  return withStory[0];
}

describe('the progress.json template in the prompt', () => {
  it('is valid against the platform reader that will judge it', () => {
    const parsed = parseProgressFile(templateBlock());
    expect(parsed.ok).toBe(true);
  });

  it('carries every acceptance criterion, byte-identical to the constant', () => {
    const parsed = parseProgressFile(templateBlock());
    if (!parsed.ok) throw new Error(parsed.reason);
    const story = parsed.file.stories.find((s) => s.id === COMMAND_CENTER_STORY_ID)!;
    expect(story.criteria.map((c) => c.text)).toEqual([...COMMAND_CENTER_ACCEPTANCE]);
  });

  it('SHIPS EVERY CRITERION FALSE — the student starts having claimed nothing', () => {
    const parsed = parseProgressFile(templateBlock());
    if (!parsed.ok) throw new Error(parsed.reason);
    const story = parsed.file.stories.find((s) => s.id === COMMAND_CENTER_STORY_ID)!;
    expect(story.criteria.length).toBeGreaterThan(0);
    expect(story.criteria.map((c) => c.passed)).toEqual(story.criteria.map(() => false));
  });

  it('agrees exactly with the file the platform seeds through renderProgressFile', () => {
    // The two templates that reach a student — the one we commit into repos we
    // can push to, and the one the prompt shows everyone else — must not differ.
    const seeded = renderProgressFile(
      [{ id: COMMAND_CENTER_STORY_ID, release: null, acceptance: [...COMMAND_CENTER_ACCEPTANCE] }],
      null,
    );
    const seededStory = seeded.stories.find((s) => s.id === COMMAND_CENTER_STORY_ID)!;

    const parsed = parseProgressFile(templateBlock());
    if (!parsed.ok) throw new Error(parsed.reason);
    const templateStory = parsed.file.stories.find((s) => s.id === COMMAND_CENTER_STORY_ID)!;

    expect(templateStory.criteria.map((c) => ({ text: c.text, passed: c.passed })))
      .toEqual(seededStory.criteria.map((c) => ({ text: c.text, passed: c.passed })));
  });

  it('says in the FILE what a tick means, so `false` is not ambiguous when read cold', () => {
    const block = templateBlock();
    expect(block).toMatch(/how_to_use|_README|_how_to_use/);
    expect(block.toLowerCase()).toContain('true');
  });

  it('keeps the how-to-use note readable by the platform — it must not break the schema', () => {
    const parsed = parseProgressFile(templateBlock());
    expect(parsed.ok).toBe(true);
  });
});

describe('the prose around the template no longer describes a finished build', () => {
  it('does not tell the student the example is one where every line is true', () => {
    expect(commandCenterPrompt(plan)).not.toMatch(/example is a build where all \d+ lines are genuinely/);
  });

  it('tells the student that starting with nothing ticked is the correct starting state', () => {
    expect(commandCenterPrompt(plan).toLowerCase()).toContain('nothing claimed yet');
  });
});
