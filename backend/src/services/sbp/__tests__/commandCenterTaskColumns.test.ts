/**
 * The two STORY-000 columns that must move together.
 *
 * ── THE PRODUCTION DEFECT THESE PIN ──────────────────────────────────────────
 *
 * #1490 raised `COMMAND_CENTER_ACCEPTANCE` from three criteria to five. The
 * backfill rewrote `student_tasks.build` — whose "Done means" section renders
 * from that same constant — across all 20 published builds, reported clean, and
 * never touched `student_tasks.acceptance`. It could not have: it did not
 * select the column and did not import the constant.
 *
 * 19 of 20 students were then holding a prompt listing FIVE criteria, a portal
 * checklist showing THREE, and a verifier grading against FIVE. Three things
 * done correctly, three boxes ticked, and held at `submitted 3/5` against two
 * criteria the checklist never showed them.
 *
 * What made it survive a release was not the missing column but the
 * NON-CONVERGENCE: the broken row reported `unchanged` on every subsequent run,
 * so the script could never repair its own damage and only a human reading two
 * screens side by side would ever notice.
 */
import {
  commandCenterColumnDrift, commandCenterTaskColumns, normaliseAcceptance,
} from '../commandCenterTaskColumns';
import { COMMAND_CENTER_ACCEPTANCE, COMMAND_CENTER_STORY_ID } from '../commandCenterStory';
import { BuildPlan } from '../planContract';

function plan(): BuildPlan {
  return {
    project_name: 'Client Onboarding Concierge',
    descriptor: 'runs a new client\'s first week',
    requirements: [
      { id: 'REQ-001', statement: 'The system must draft the welcome pack.', kind: 'FUNC', priority: 'must', cluster: 'core' },
    ],
    releases: [{ key: 'r0', name: 'Walking skeleton', goal: 'g', demo: 'd', week_start: 1, week_end: 2 }],
    stories: [{
      id: 'STORY-001', release: 'r0', title: 'Deliver the draft',
      narrative: 'As an account owner, I want a draft, so that the work lands.',
      fulfills: ['REQ-001'], owner_agent: 'Drafting Agent',
      acceptance: ['Given a, when b, then c.'],
      task_guidance: 'guidance', failure_paths: ['upstream down'],
    }],
  };
}

/** What a build published before #1490 still carries: the first three criteria. */
const THREE_CRITERIA = COMMAND_CENTER_ACCEPTANCE.slice(0, 3);

// ── one source for both columns ─────────────────────────────────────────────

describe('commandCenterTaskColumns produces both columns from one call', () => {
  it('carries the criteria the verifier grades against', () => {
    const cols = commandCenterTaskColumns(plan(), null);

    expect(cols.story_id).toBe(COMMAND_CENTER_STORY_ID);
    expect(cols.acceptance).toEqual([...COMMAND_CENTER_ACCEPTANCE]);
  });

  /**
   * THE STRUCTURAL PIN, and the one that makes the next criteria bump safe.
   *
   * The prompt renders its "Done means" list from `COMMAND_CENTER_ACCEPTANCE`,
   * so every line of the `acceptance` column must appear verbatim inside the
   * `build` column produced by the SAME call. If a future change lets the two
   * come from different places, this fails — which is the whole defect, caught
   * at the source rather than three screens downstream.
   */
  it('renders every acceptance line into the prompt it ships beside', () => {
    const cols = commandCenterTaskColumns(plan(), null);

    // Anti-vacuity: a `for` over an empty list is green and proves nothing, and
    // this workstream has already shipped exactly that failure once today.
    expect(cols.acceptance.length).toBeGreaterThanOrEqual(5);

    for (const line of cols.acceptance) expect(cols.build).toContain(line);
  });

  it('hands out a fresh array, so no caller can mutate the constant', () => {
    const cols = commandCenterTaskColumns(plan(), null);
    cols.acceptance.push('Given nonsense, when tampered, then broken.');

    expect(COMMAND_CENTER_ACCEPTANCE).toHaveLength(5);
    expect(commandCenterTaskColumns(plan(), null).acceptance).toEqual([...COMMAND_CENTER_ACCEPTANCE]);
  });

  it('leaves the per-student columns out entirely, so a regeneration cannot overwrite them', () => {
    // status, verified_at, verification_json, due_on and due_baseline_on are
    // facts about one student's progress. A type that carried them is a type a
    // caller can spread into an UPDATE by accident.
    expect(Object.keys(commandCenterTaskColumns(plan(), null)).sort())
      .toEqual(['acceptance', 'build', 'narrative', 'story_id', 'title']);
  });
});

// ── THE CASE THE SCRIPT COULD NOT SEE ───────────────────────────────────────

describe('commandCenterColumnDrift', () => {
  const next = () => commandCenterTaskColumns(plan(), null);

  it('DETECTS a row whose prompt is current but whose criteria are stale', () => {
    // Exactly the 19 rows. The old rule compared `build` alone, found it
    // identical, and reported `unchanged` — permanently, on every future run.
    const drift = commandCenterColumnDrift(
      { build: next().build, acceptance: [...THREE_CRITERIA] },
      next(),
    );

    expect(drift).toEqual({
      needs_update: true,
      build_changed: false,
      acceptance_changed: true,
    });
  });

  /**
   * THE MUTATION TEST — what the previous rule actually did with that row.
   *
   * Kept permanently rather than deleted with the fix, in the same spirit as
   * the honesty guard's record of the two phrasings its old blacklist waved
   * through. A rule that "obviously" catches this is worth one assertion that
   * the previous, equally obvious rule did not.
   */
  it('records that the old build-only rule called that row unchanged', () => {
    const stale = { build: next().build, acceptance: [...THREE_CRITERIA] };
    const OLD_RULE = (cur: { build: string }, n: { build: string }) => cur.build !== n.build;

    expect(OLD_RULE(stale, next())).toBe(false);                       // saw nothing
    expect(commandCenterColumnDrift(stale, next()).needs_update).toBe(true);  // sees it now
  });

  it('detects a stale prompt when the criteria happen to be current', () => {
    const drift = commandCenterColumnDrift(
      { build: 'the prompt as it was three releases ago', acceptance: [...COMMAND_CENTER_ACCEPTANCE] },
      next(),
    );

    expect(drift).toEqual({ needs_update: true, build_changed: true, acceptance_changed: false });
  });

  it('is quiet when both columns are already current — the idempotency the sweep relies on', () => {
    const cols = next();

    expect(commandCenterColumnDrift({ build: cols.build, acceptance: cols.acceptance }, next()))
      .toEqual({ needs_update: false, build_changed: false, acceptance_changed: false });
  });

  it('treats a null acceptance column as stale rather than as a match', () => {
    const drift = commandCenterColumnDrift({ build: next().build, acceptance: null }, next());
    expect(drift.acceptance_changed).toBe(true);
  });

  it('reads an acceptance column the driver handed back as a JSON string', () => {
    // jsonb normally arrives parsed; a raw query or an older driver hands back
    // the text. Reporting drift on every row because of that would rewrite 20
    // live rows for no reason.
    const cols = next();
    const drift = commandCenterColumnDrift(
      { build: cols.build, acceptance: JSON.stringify(cols.acceptance) },
      next(),
    );

    expect(drift.needs_update).toBe(false);
  });

  it('treats a REORDERED criteria list as drift, because order is what students see', () => {
    const cols = next();
    const swapped = [cols.acceptance[1], cols.acceptance[0], ...cols.acceptance.slice(2)];

    // Guard the fixture: if the first two lines were ever made identical this
    // assertion would pass while comparing a list to itself.
    expect(swapped).not.toEqual(cols.acceptance);
    expect(commandCenterColumnDrift({ build: cols.build, acceptance: swapped }, next()).acceptance_changed)
      .toBe(true);
  });
});

describe('normaliseAcceptance', () => {
  it('reads an array, a JSON string, and null without throwing on any of them', () => {
    expect(normaliseAcceptance(['a', 'b'])).toEqual(['a', 'b']);
    expect(normaliseAcceptance('["a","b"]')).toEqual(['a', 'b']);
    expect(normaliseAcceptance(null)).toEqual([]);
    expect(normaliseAcceptance(undefined)).toEqual([]);
    expect(normaliseAcceptance('')).toEqual([]);
  });

  it('treats a bare non-JSON string as one stored line, which reports drift', () => {
    // The safe direction: it will never match the criteria list, so the row is
    // rewritten rather than silently accepted.
    expect(normaliseAcceptance('Given the Command Center, then it works.'))
      .toEqual(['Given the Command Center, then it works.']);
  });
});
