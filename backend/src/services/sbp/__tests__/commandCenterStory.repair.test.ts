/**
 * STORY-000 must REPAIR an existing build, not only create a new one.
 *
 * THE PRODUCTION FAILURE THIS PINS. `commandCenterPrompt` was written for a
 * blank repo: "this is the first thing you build, before any part of the system
 * itself". It is not handed a blank repo. It is handed to students who have
 * built nothing, students who stopped halfway, and students whose Command Center
 * was finished weeks ago against a SHORTER list of criteria — #1490 took
 * `COMMAND_CENTER_ACCEPTANCE` from three lines to five, so every build that
 * predates it is behind the standard through no fault of its own.
 *
 * The dangerous failure is not an agent that does nothing. It is the opposite:
 * an agent handed a greenfield brief in a populated repo concludes that the
 * tidiest way to satisfy it is to start over, and a student's real work goes in
 * the bin. Ali's proving-ground repo carries 120 files of it.
 *
 * WHAT THESE TESTS DO AND DO NOT PROVE — read this before trusting them.
 *
 * They are assertions about WORDING. `commandCenterPrompt` is a pure function of
 * a BuildPlan; it never sees a repo, so it cannot behave one way for an empty
 * one and another way for a half-built one. Nothing here demonstrates that an
 * agent handed this prompt repairs rather than recreates. What it demonstrates
 * is narrower and still worth pinning: that the instruction for each starting
 * state is PRESENT, is ordered ahead of the build, names all
 * `COMMAND_CENTER_ACCEPTANCE.length` criteria, and does not contradict the
 * honesty rule.
 *
 * The behavioural proof is a live run of this prompt against a genuinely
 * half-built repo, which is a different task in this run. Do not read a green
 * suite here as coverage of that.
 *
 * The `describe` names below say "wording —" for that reason: a block called
 * "starting state: half built" would quietly claim the behavioural coverage
 * this file does not have.
 *
 * EVERY line-level assertion goes through `linesMatching`, which fails when a
 * pattern hits zero lines as loudly as when it hits three. This workstream has
 * already shipped a test that passed while asserting nothing, because it pinned
 * a constant by an index that had moved.
 */
import {
  commandCenterPrompt,
  commandCenterStoryDoc,
  COMMAND_CENTER_ACCEPTANCE,
  COMMAND_CENTER_STORY_ID,
} from '../commandCenterStory';
import { BLOCK_BEGIN, BLOCK_END } from '../managedBlock';
import { PLAN_FILE_PATH } from '../planDocument';
import { PROGRESS_FILE_PATH } from '../verification/progressContract';
import { BuildPlan, PlanRequirement, PlanStory } from '../planContract';
import type { Schedule } from '../buildSchedule';
import {
  BLANKET_APPROVAL,
  TRUTH_CONDITION,
  claimInstructions,
  expectEveryClaimIsConditional,
} from './honestyGuard';

// ── fixtures ────────────────────────────────────────────────────────────────

function req(id: string, over: Partial<PlanRequirement> = {}): PlanRequirement {
  return { id, statement: `The system must do ${id}.`, kind: 'FUNC', priority: 'must', cluster: 'core', ...over };
}
function story(id: string, over: Partial<PlanStory> = {}): PlanStory {
  return {
    id, release: 'r0', title: `Deliver ${id}`,
    narrative: `As an account owner, I want ${id}, so that the work lands.`,
    fulfills: [], owner_agent: 'Developer',
    acceptance: ['Given a, when b, then c.', 'Given d, when e, then f.', 'Trust — g.'],
    task_guidance: 'guidance', failure_paths: ['upstream down'],
    ...over,
  };
}

function plan(): BuildPlan {
  return {
    project_name: 'Client Onboarding Concierge',
    descriptor: 'runs a new client\'s first week',
    requirements: [
      req('REQ-001', { statement: 'The system must read the signed agreement from HelloSign.', kind: 'CONSTRAINT' }),
      req('REQ-002', { statement: 'Time from signature to kickoff booked must fall below 2 days.', kind: 'NFR', priority: 'should' }),
      req('REQ-003', { statement: 'Nothing is sent to a client without a named person approving it.', kind: 'SAFE' }),
    ],
    releases: [
      { key: 'r0', name: 'Walking skeleton', goal: 'g', demo: 'd', week_start: 1, week_end: 2 },
      { key: 'r1', name: 'Drafting', goal: 'g', demo: 'd', week_start: 3, week_end: 4 },
    ],
    stories: [
      story('STORY-001', { fulfills: ['REQ-003'], owner_agent: 'Drafting Agent' }),
      story('STORY-002', { release: 'r1', owner_agent: 'Review Agent' }),
    ],
  };
}

const schedule = (): Schedule => ({
  buildStart: new Date('2026-08-15T00:00:00Z'),
  buildEnd: new Date('2026-10-01T00:00:00Z'),
  demoDay: new Date('2026-10-08T00:00:00Z'),
  buildWeeks: 7, capacity: { low: 7, high: 14 }, totalTasks: 2,
  demoReleaseKey: null, roadmapReleaseKeys: [], verdict: 'comfortable',
  tasks: [
    { storyId: 'STORY-001', releaseKey: 'r0', dueOn: new Date('2026-08-20T00:00:00Z') },
    { storyId: 'STORY-002', releaseKey: 'r1', dueOn: new Date('2026-08-27T00:00:00Z') },
  ],
  prep: [],
});

const prompt = () => commandCenterPrompt(plan(), schedule());
const doc = () => commandCenterStoryDoc(plan(), schedule());

// ── matchers that cannot pass by matching nothing ───────────────────────────

/**
 * Lines of `text` matching `re`, asserted to be EXACTLY `count` of them.
 *
 * `expect(text).toMatch(re)` is satisfied by one hit and says nothing about
 * zero-vs-many; a pattern that has silently stopped matching the sentence it was
 * written for still passes as long as some other sentence happens to match. This
 * fails on both zero and duplicates, and reports the pattern in the diff.
 */
function linesMatching(text: string, re: RegExp, count = 1): string[] {
  const hit = text.split('\n').filter((l) => re.test(l));
  expect({ pattern: String(re), matched: hit.length })
    .toEqual({ pattern: String(re), matched: count });
  return hit;
}

/**
 * The body of exactly one heading, up to the next heading of the same or higher
 * level. Asserts the heading appears once — a duplicated step heading is its own
 * bug, and silently reading the first of two is how a test starts lying.
 */
function section(text: string, heading: RegExp): string {
  const lines = text.split('\n');
  const starts = lines.map((l, i) => ({ l, i })).filter(({ l }) => heading.test(l));
  expect({ heading: String(heading), found: starts.length })
    .toEqual({ heading: String(heading), found: 1 });

  const start = starts[0].i;
  const level = (lines[start].match(/^#+/) ?? ['##'])[0].length;
  const rest = lines.slice(start + 1);
  const endRel = rest.findIndex((l) => {
    const m = l.match(/^(#+) /);
    return !!m && m[1].length <= level;
  });
  return [lines[start], ...(endRel === -1 ? rest : rest.slice(0, endRel))].join('\n');
}

// ── starting state 1: nothing built ─────────────────────────────────────────

/**
 * The greenfield case still has to work, and it is the case most likely to be
 * broken by adding a repair path: an agent told to inspect first, handed an
 * empty repo, can sit there waiting for something to inspect.
 */
describe('wording — starting state: nothing built yet', () => {
  it('says up front that the same brief repairs as well as creates', () => {
    // The greenfield assumption lived in the opening paragraph — "this is the
    // first thing you build, before any part of the system itself" — which is
    // the frame every later section is read through.
    const intro = section(prompt(), /^## Read this first/);
    linesMatching(intro, /If some of it is already built, this same brief repairs it/i);
  });

  it('takes stock before building, as its own step, ahead of any writing', () => {
    const out = prompt();
    const stock = section(out, /^### Step 2a — take stock/);

    // Read-only, and said in words rather than implied.
    linesMatching(stock, /does not create, edit, move, rename or delete/i);
    // Ahead of the build itself.
    expect(out.indexOf('Step 2a')).toBeLessThan(out.indexOf('Step 2b'));
  });

  it('says plainly what to do when there is nothing there — do not stall on an empty repo', () => {
    const stock = section(prompt(), /^### Step 2a — take stock/);
    linesMatching(stock, /even if you are fairly sure the repo is empty/i);
  });

  it('still reports to the student before changing anything, even with nothing to report', () => {
    const stock = section(prompt(), /^### Step 2a — take stock/);
    const stop = linesMatching(stock, /STOP and tell me what you found/);

    expect(stop[0]).toMatch(/plain language/i);
    expect(stop[0]).toMatch(/before you change anything/i);
  });
});

// ── starting state 2: half built ────────────────────────────────────────────

/**
 * The state that does the damage. A repo with four tabs in it and a greenfield
 * brief invites a from-scratch rebuild, which is indistinguishable from deleting
 * the student's work.
 */
describe('wording — starting state: half built', () => {
  it('inventories which tabs exist and which are reachable, not just which are missing', () => {
    const stock = section(prompt(), /^### Step 2a — take stock/);
    const line = linesMatching(stock, /already exist and are actually reachable/i);

    expect(line[0]).toMatch(/missing/i);
    // "present but broken" is its own bucket: a tab that renders nothing is not
    // the same finding as a tab that is absent, and they need different repairs.
    expect(line[0]).toMatch(/empty or broken/i);
  });

  it('forbids deleting or rewriting work that is already right', () => {
    const repair = section(prompt(), /^### Step 2b — build what is missing/);

    linesMatching(repair, /Keep what is already right/i);
    const keep = linesMatching(repair, /do not regenerate the app from scratch/i);
    expect(keep[0]).toMatch(/do not delete/i);
    expect(keep[0]).toMatch(/tidier shape|tidier/i);
  });

  it('requires the smallest repair in place rather than a rewrite', () => {
    const repair = section(prompt(), /^### Step 2b — build what is missing/);
    const line = linesMatching(repair, /Repair in place/i);

    expect(line[0]).toMatch(/smallest change/i);
    expect(line[0]).toMatch(/not a rewrite/i);
  });

  it('makes removal a stop-and-ask, never a fait accompli', () => {
    const repair = section(prompt(), /^### Step 2b — build what is missing/);
    const line = linesMatching(repair, /has to be removed or restructured/i);

    expect(line[0]).toMatch(/stop and ask me/i);
    expect(line[0]).toMatch(/what would be lost/i);
  });

  it('reframes the tab sections as the finished state, not a build order for an empty repo', () => {
    // Without this the nine tab sections below read as nine things to create,
    // which is exactly the instruction that overwrites four that already exist.
    const repair = section(prompt(), /^### Step 2b — build what is missing/);
    const line = linesMatching(repair, /describes? the FINISHED state/);

    expect(line[0]).toMatch(/act only where it is not true yet/i);
  });
});

// ── starting state 3: nearly finished, against the OLD standard ─────────────

/**
 * The state #1490 created. A build finished last week satisfied three criteria
 * and ticked three lines. The list now has five. The file is not wrong, it is
 * short — and an agent that treats a short file as damage will either rewrite it
 * (losing the ticks) or tick the two new lines to make the shapes match.
 */
describe('wording — starting state: nearly finished against an older, shorter standard', () => {
  it('names the current criterion count so the standard is explicit, not implied', () => {
    const out = prompt();
    const n = COMMAND_CENTER_ACCEPTANCE.length;

    // Rendered from the constant, so raising the count again cannot leave the
    // prompt quoting the old number.
    linesMatching(out, new RegExp(`compare its criteria line by line against the ${n} lines`, 'i'));
    linesMatching(out, new RegExp(`Judge each of the ${n} criteria against the repo as it is`, 'i'));
  });

  it('tells the agent a pre-existing file can carry FEWER lines than the list, and why', () => {
    const stock = section(prompt(), /^### Step 2a — take stock/);
    const line = linesMatching(stock, /can carry fewer lines than the list has now/i);

    expect(line[0]).toMatch(/criteria get added/i);
    expect(line[0]).toMatch(/work still outstanding, not a mistake/i);
  });

  it('reconciles the seeded story instead of rewriting it', () => {
    const finish = section(prompt(), /^## Step 3 — finish it/);
    const line = linesMatching(finish, /reconcile it — do not rewrite it/i);

    expect(line[0]).toMatch(/passed.*false/i);
    expect(line[0]).toMatch(/leave the ticks that are already there alone/i);
  });

  it('starts a newly added criterion unticked rather than inheriting a tick', () => {
    const finish = section(prompt(), /^## Step 3 — finish it/);
    const line = linesMatching(finish, /does not inherit a tick from the lines around it/i);

    expect(line[0]).toMatch(/begins unticked/i);
  });

  it('treats a tick already in the file as a claim to re-check, not as proof', () => {
    const stock = section(prompt(), /^### Step 2a — take stock/);
    const line = linesMatching(stock, /is a claim, not proof/i);

    expect(line[0]).toMatch(/if the code no longer backs it, say so/i);
  });
});

// ── re-runnable ─────────────────────────────────────────────────────────────

describe('wording — running it again on a finished build changes nothing', () => {
  it('says so in as many words, and names the ways an agent would otherwise churn', () => {
    const repair = section(prompt(), /^### Step 2b — build what is missing/);
    const line = linesMatching(repair, /a second time on a finished build must change nothing/i);

    expect(line[0]).toMatch(/no reformatting/i);
    expect(line[0]).toMatch(/no empty commit/i);
  });

  it('is itself pure — the same plan renders byte-identical text', () => {
    // The prompt is stored on the task row and rendered into the repo doc. If it
    // were not deterministic, every backfill and every republish would churn.
    expect(commandCenterPrompt(plan(), schedule())).toBe(commandCenterPrompt(plan(), schedule()));
    expect(commandCenterStoryDoc(plan(), schedule())).toBe(commandCenterStoryDoc(plan(), schedule()));
  });
});

// ── invariant 1: the honesty rule ───────────────────────────────────────────

/**
 * The single way this change could do real harm. "Bring the build up to
 * standard" is one bad sentence away from "tick everything", and Ali's own agent
 * correctly refused to invent numbers for an empty Outcomes tab. That refusal
 * has to stay correct under the new wording.
 */
describe('the honesty rule survives the repair path', () => {
  it('states that raising an old build to the current standard does not license a tick', () => {
    const finish = section(prompt(), /^## Step 3 — finish it/);
    const line = linesMatching(finish, /is not permission to tick the new lines/i);

    expect(line[0]).toMatch(/true in the repo today/i);
    expect(line[0]).toMatch(/tell me which ones and why/i);
  });

  it('keeps the rules that were already there', () => {
    const out = prompt();

    linesMatching(out, /Only tick a line when it is actually true/i);
    // The resume line #1522 added, unchanged in intent.
    const resume = linesMatching(out, /remove the banner/i);
    expect(resume[0]).toMatch(/genuinely true/i);
    expect(resume[0]).toMatch(/Step 3/);
  });

  /**
   * The same positive guard `commandCenterStory.test.ts` applies to the prompt,
   * applied here to the REPO DOC — the copy a cold Claude Code session reads and
   * the copy that lands in a repo that is public by default. One definition, in
   * `honestyGuard.ts`, so the two documents cannot be held to different rules.
   */
  it('never instructs a claim without a truth condition, in the repo doc either', () => {
    expectEveryClaimIsConditional(doc());
  });

  it('finds those instructions in the doc at all, so the guard is not vacuous', () => {
    const claims = claimInstructions(doc());

    expect(claims.length).toBeGreaterThanOrEqual(4);
    // The two the doc adds on top of the embedded prompt: its own preamble and
    // its own acceptance checklist. If either stops being found, the doc has
    // been reshaped and this guard needs re-aiming rather than re-greening.
    expect(claims.some((c) => /flip `passed` to `true`/i.test(c))).toBe(true);
    expect(claims.some((c) => /Tick a box here as it genuinely passes/i.test(c))).toBe(true);
  });

  it('carries no blanket-approval phrasing in either document', () => {
    for (const re of BLANKET_APPROVAL) {
      expect({ pattern: String(re), inPrompt: re.test(prompt()), inDoc: re.test(doc()) })
        .toEqual({ pattern: String(re), inPrompt: false, inDoc: false });
    }
  });

  /**
   * MUTATION CHECK — the guard's own guard.
   *
   * "Every claim carries a truth condition" is green both when the documents are
   * honest and when the matcher has quietly stopped finding claims at all. The
   * floor tests above rule out the second case for the real documents; this rules
   * it out for the rule itself, by feeding the guard two sentences it MUST
   * reject. Both are phrasings a repair-flavoured rewrite reaches for naturally,
   * and both walked straight through the blacklist this replaced.
   */
  it('rejects the two phrasings the old blacklist let through', () => {
    const dishonest = [
      '- Once the tabs are all there, bring all five criteria to true in `.colaberry/progress.json`.',
      '- Complete each Done means line in the file, then commit naming the story.',
    ];

    for (const line of dishonest) {
      // It is recognised as a claim instruction …
      expect(claimInstructions(line)).toHaveLength(1);
      // … it carries no truth condition …
      expect(TRUTH_CONDITION.test(line)).toBe(false);
      // … so the guard throws, and the blacklist net catches it too.
      expect(() => expectEveryClaimIsConditional(line, 1)).toThrow();
      expect(BLANKET_APPROVAL.some((re) => re.test(line))).toBe(true);

      // And the historical record: the guard that shipped before this one saw
      // nothing wrong with either sentence. That is why it was replaced.
      expect(/tick (them |the |all )*all\b/i.test(line)).toBe(false);
      expect(/mark (them |all )*all (as )?pass/i.test(line)).toBe(false);
    }
  });
});

// ── invariant 2: the managed-block splice ───────────────────────────────────

/**
 * `managedBlock.test.ts` pins the splice itself. What was missing is the
 * instruction: the agent doing the repair has to be told the same rule, because
 * it is the one editing CLAUDE.md by hand while it works.
 */
describe('a student\'s own files are never replaced', () => {
  it('tells the agent the pipeline owns only the delimited block in CLAUDE.md', () => {
    const repair = section(prompt(), /^### Step 2b — build what is missing/);
    const line = linesMatching(repair, /Never replace the file/i);

    expect(line[0]).toContain('CLAUDE.md');
    expect(line[0]).toMatch(/append below my content/i);
  });

  it('names the real markers, read out of managedBlock rather than retyped', () => {
    // Derived here the same way the prompt derives it, from the same constants,
    // so renaming a marker fails this test instead of leaving the prompt telling
    // students to look for a marker that no longer exists.
    const nameOf = (marker: string) => marker.replace(/^<!--\s*/, '').split(/\s/)[0];
    const repair = section(prompt(), /^### Step 2b — build what is missing/);

    expect(repair).toContain(nameOf(BLOCK_BEGIN));
    expect(repair).toContain(nameOf(BLOCK_END));
    expect(nameOf(BLOCK_BEGIN)).toBe('COLABERRY:BEGIN');
  });
});

// ── the doc renders the same flow ───────────────────────────────────────────

/**
 * `docs/stories/STORY-000.md` is what a Claude Code session with no chat history
 * reads. It renders `commandCenterPrompt` verbatim — which is exactly the
 * assumption worth pinning rather than trusting.
 */
describe('the repo doc carries the same take-stock and repair flow', () => {
  it('carries both halves of Step 2 verbatim from the prompt', () => {
    const d = doc();

    linesMatching(d, /^### Step 2a — take stock/);
    linesMatching(d, /^### Step 2b — build what is missing/);
    expect(d).toContain(commandCenterPrompt(plan(), schedule()));
  });

  it('carries the repair rules a cold session needs, not a summary of them', () => {
    const d = doc();

    linesMatching(d, /Keep what is already right/i);
    linesMatching(d, /Never replace the file/i);
    linesMatching(d, /reconcile it — do not rewrite it/i);
    linesMatching(d, /a second time on a finished build must change nothing/i);
  });

  it('warns a cold reader that the seeded story may predate a criterion', () => {
    // The doc's own preamble, not the embedded prompt: it is read first, and it
    // is what tells the agent the file it finds may be short rather than wrong.
    // The `---` rule is the divider the doc puts between the two, and there is
    // exactly one of them — so this reads the preamble rather than the whole doc.
    const parts = doc().split(/\n---\n/);
    expect(parts).toHaveLength(2);

    const line = linesMatching(parts[0], /fewer lines than the acceptance list/i);
    expect(line[0]).toMatch(/predates/i);
  });

  it('still points at the files and the story id a cold session has to act on', () => {
    const d = doc();

    expect(d).toContain(COMMAND_CENTER_STORY_ID);
    expect(d).toContain(PROGRESS_FILE_PATH);
    expect(d).toContain(PLAN_FILE_PATH);
  });
});
