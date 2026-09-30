/**
 * STORY-000's doc must be true for the student who is reading it.
 *
 * ── THE SENTENCE THAT CAUSED THE DRIFT IT WARNED ABOUT ──────────────────────
 *
 * `commandCenterStoryDoc` told every student:
 *
 *     your acceptance criteria are **already seeded** in `.colaberry/progress.json`
 *     ...
 *     **Do not retype the criteria.** ... Retyping is how the text drifts.
 *
 * `Colaberry Build Bot` has committed to exactly one student repository — the
 * only one where our token holds `push`. On the other twelve we are pull-only,
 * so `plan.json`, `progress.json` and `docs/stories/*.md` were never written.
 * The instruction was false for twelve students out of thirteen.
 *
 * And it did not fail harmlessly. An agent told not to retype, that then finds
 * nothing to copy, does not stop — it writes the criteria out from the prose
 * around it. One student's agent paraphrased every criterion into wording no
 * verifier will ever match; three more ended up with `criteria: []`. So the
 * sentence was the most reliable CAUSE of the drift it was warning against.
 *
 * ── WHAT THESE TESTS PIN ────────────────────────────────────────────────────
 *
 *   - The seeded claim is made ONLY on a confirmed `push`.
 *   - Every other access state hands over the criteria in full, in a block that
 *     can be copied rather than retyped.
 *   - That block is not decorative: it parses, and `decideStory` matches every
 *     line in it against the real plan with nothing unrecognised. If it did not,
 *     we would be shipping the drift in the fix for the drift.
 *   - Nothing in the copyable block is pre-ticked.
 *   - The doc never tells a student to overwrite a progress file that has their
 *     other stories in it. Twelve of these repos we cannot write to, students
 *     have already been mailed their exact sentences, and clobbering a
 *     student-authored `progress.json` is the one outcome that must never happen.
 */
import {
  commandCenterStoryDoc,
  commandCenterProgressSeedBlock,
  commandCenterStorySeed,
  COMMAND_CENTER_ACCEPTANCE,
  COMMAND_CENTER_STORY_ID,
} from '../commandCenterStory';
import { renderDocs } from '../renderDocs';
import { parseProgressFile } from '../verification/progressContract';
import { decideStory } from '../verification/verifyDecision';
import { BuildPlan } from '../planContract';
import raw from './fixtures/pilot-dryrun-plan.json';

const pilot = raw as unknown as BuildPlan;

const docFor = (writeAccess: 'push' | 'pull_only' | null | undefined) =>
  commandCenterStoryDoc(pilot, null, { writeAccess });

describe('the seeded claim is made only where the platform can actually seed', () => {
  it('says "already seeded" when we hold push', () => {
    const doc = docFor('push');
    expect(doc).toContain('already seeded');
    expect(doc).toMatch(/push access to/i);
    expect(doc).toContain('**Do not retype the criteria.**');
  });

  it('never says "already seeded" on a pull-only repo', () => {
    const doc = docFor('pull_only');
    expect(doc).not.toContain('already seeded');
    expect(doc).toMatch(/cannot write to this repo/i);
  });

  it('never says "already seeded" when the permission was never recorded', () => {
    // `writeAccessOf` returns null for every connection made before the
    // permission was captured. Unknown is not a licence to claim.
    const doc = docFor(null);
    expect(doc).not.toContain('already seeded');
    expect(doc).toMatch(/has not\s+confirmed it can write to this repo/i);
  });

  it('defaults to the not-seeded text when the caller says nothing', () => {
    // The safe direction: the not-seeded text is true whether or not the file
    // happens to be there; the seeded text is false the moment we are wrong.
    expect(docFor(undefined)).toBe(docFor(null));
  });
});

describe('when we could not seed, the doc hands over the exact criteria', () => {
  const doc = docFor('pull_only');

  it('carries a copyable JSON block, not just a description of one', () => {
    expect(doc).toContain('```json');
    expect(doc).toContain(commandCenterProgressSeedBlock());
  });

  it('carries every criterion verbatim, em dash and all', () => {
    const block = commandCenterProgressSeedBlock();
    for (const a of COMMAND_CENTER_ACCEPTANCE) {
      // JSON.stringify escapes nothing in these sentences except quotes, and the
      // em dash must survive — it is the exact character that broke matching for
      // a student in production on 2026-08-15.
      expect(JSON.parse(block).stories[0].criteria.map((c: any) => c.text)).toContain(a);
    }
    expect(JSON.parse(block).stories[0].criteria).toHaveLength(COMMAND_CENTER_ACCEPTANCE.length);
  });

  it('ships every line false — a copyable pre-ticked block is an instruction', () => {
    const parsedBlock = JSON.parse(commandCenterProgressSeedBlock());
    expect(parsedBlock.stories[0].criteria.every((c: any) => c.passed === false)).toBe(true);
  });

  it('tells the agent to copy rather than to retype, and says why a paraphrase is worth nothing', () => {
    expect(doc).toMatch(/Do not retype the criteria — copy them/);
    expect(doc).toMatch(/verbatim/i);
    expect(doc).toMatch(/A paraphrase is not a claim/);
  });

  it('refuses to tell a student to overwrite a progress file holding their other stories', () => {
    expect(doc).toMatch(/Do not overwrite a\s+progress file that has your other stories in it/);
    expect(doc).toMatch(/paste only the object/i);
  });
});

describe('the copyable block is not merely present — it verifies', () => {
  /**
   * The strongest check in this file. A block that parses but whose sentences
   * do not match the plan would reproduce the exact bug, one level down: the
   * student copies faithfully and still gets nothing.
   */
  it('parses as a valid progress file', () => {
    const parsed = parseProgressFile(commandCenterProgressSeedBlock());
    expect(parsed.ok).toBe(true);
  });

  it('produces ZERO unrecognised criteria against the real STORY-000 spec', () => {
    const parsed = parseProgressFile(commandCenterProgressSeedBlock());
    if (!parsed.ok) throw new Error(`block did not parse: ${parsed.reason}`);

    const seed = commandCenterStorySeed();
    const verdict = decideStory(
      { id: seed.id, acceptance: seed.acceptance },
      parsed.file,
      [],
    );

    expect(verdict.unrecognised_criteria).toEqual([]);
    expect(verdict.rejected_claims).toEqual([]);
    expect(verdict.criteria_total).toBe(COMMAND_CENTER_ACCEPTANCE.length);
    // Nothing ticked, so nothing passes — which is the correct starting state.
    expect(verdict.criteria_passed).toBe(0);
  });

  it('a student who flips every flag on the copied block verifies every criterion', () => {
    // Proves the block is a working starting point and not a dead end: the only
    // thing standing between it and a full pass is the booleans.
    const ticked = JSON.parse(commandCenterProgressSeedBlock());
    for (const c of ticked.stories[0].criteria) c.passed = true;

    const parsed = parseProgressFile(JSON.stringify(ticked));
    if (!parsed.ok) throw new Error(`block did not parse: ${parsed.reason}`);

    const seed = commandCenterStorySeed();
    const verdict = decideStory({ id: seed.id, acceptance: seed.acceptance }, parsed.file, []);
    expect(verdict.criteria_passed).toBe(COMMAND_CENTER_ACCEPTANCE.length);
    expect(verdict.unrecognised_criteria).toEqual([]);
  });
});

describe('renderDocs threads the access answer through to the doc', () => {
  const CTX = {
    repoUrl: 'https://github.com/ColaberryIntern/sponsor-dashboard-248d9d63',
    generatedAt: '2026-08-10T00:00:00Z',
    planVersion: 1,
    planSha256: 'abc123',
  };
  const story000 = (ctx: any) =>
    renderDocs(pilot, ctx).find((f) => f.path === `docs/stories/${COMMAND_CENTER_STORY_ID}.md`)!.content;

  it('claims seeded only when the context says push', () => {
    expect(story000({ ...CTX, repoWriteAccess: 'push' })).toContain('already seeded');
  });

  it('hands over the criteria when the context says pull_only', () => {
    const doc = story000({ ...CTX, repoWriteAccess: 'pull_only' });
    expect(doc).not.toContain('already seeded');
    expect(doc).toContain(commandCenterProgressSeedBlock());
  });

  it('treats an absent repoWriteAccess as not-seeded', () => {
    const doc = story000(CTX);
    expect(doc).not.toContain('already seeded');
    expect(doc).toContain(commandCenterProgressSeedBlock());
  });

  it('still renders byte-identically for the same access level — idempotency holds', () => {
    for (const access of ['push', 'pull_only', undefined]) {
      const ctx = { ...CTX, repoWriteAccess: access };
      expect(story000(ctx)).toBe(story000(ctx));
    }
  });
});
