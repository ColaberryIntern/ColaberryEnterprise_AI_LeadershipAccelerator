import * as fs from 'fs';
import * as path from 'path';
import { REVIEW_ONLY_CHANNELS } from '../execution/resolveExecutionMode';

/**
 * The 6A guard (Phase 6, T612): NOTHING generates Ali's outreach today.
 *
 * Section 6A is a policy that has not been written yet - what may be prepared in Ali's
 * name, by whom, on what evidence. Until it is, the safe state is that no strategy and
 * no candidate generator emits `SEND_ALI_OUTREACH` at all, and this suite is what keeps
 * that true while the rest of the phase moves around it. T620 carries the policy as a
 * handoff statement; this file is the fact on the ground.
 *
 * ─── WHY THE SCAN IS EMISSION-SHAPED AND NOT A SEARCH FOR THE STRING ────────
 *
 * The action name appears in eight places that are all correct and must stay: the Zod
 * enum and the TS union that DEFINE it, the human-in-the-loop set that names it in
 * order to exclude it, the channel map that routes it to the ladder, the experiment
 * assigner's comments explaining why it is excluded from arms, and a B2B tier map that
 * ranks it. A bare-string scan would fail on every one of those and would be deleted
 * within a week. So the scan looks for a candidate LITERAL - `action: '...'`,
 * `action_type: '...'`, `type: '...'`, `selected_action: '...'` - which is the shape an
 * emission actually has, and the legitimate sites are pinned below so that anyone
 * tempted to widen it can see what would break.
 *
 * ─── WHAT THIS SCAN CANNOT SEE, AND WHAT CATCHES THAT INSTEAD ──────────────
 *
 * A text scan constrains SPELLING, not behaviour. A generator that emitted the action
 * through a constant (`action_type: ACTIONS.ALI`) or a computed key would be invisible
 * here. That is not the last line of defence: `REVIEW_ONLY_CHANNELS` makes the ladder
 * answer `review` for this channel whatever a rollout row says, so even an emission
 * nobody noticed can only ever land in a human's review queue. The constant is pinned
 * below; the BEHAVIOUR is pinned where it belongs, in
 * `execution/__tests__/resolveExecutionMode.test.ts` ("review_only_channel") and
 * `decisionService.mode.test.ts` - deliberately not re-asserted here, because a second
 * copy of a pin in this repo has already gone stale once while the canonical one moved.
 */

const SRC = path.join(__dirname, '..', '..', '..');

/** The trees the plan names: where a candidate or strategy could be written. */
const SCANNED = [
  path.join('services', 'growthJourney', 'strategies'),
  path.join('services', 'growthJourney', 'governor'),
  path.join('services', 'explorerGrowth', 'governor', 'candidates'),
];

/** The shape an emission has. See the header on why this is not a string search. */
const EMISSION = /(?:selected_action|action_type|action|type)\s*:\s*['"`]SEND_ALI_OUTREACH['"`]/;

const stripComments = (src: string) =>
  src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');

function tsFilesUnder(dir: string): string[] {
  const abs = path.join(SRC, dir);
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const rel = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__') out.push(...tsFilesUnder(rel));
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(rel);
    }
  }
  return out;
}

/** Every emission-shaped hit, as `file:line`, over the scanned trees. */
function emissions(): string[] {
  const hits: string[] = [];
  for (const dir of SCANNED) {
    for (const rel of tsFilesUnder(dir)) {
      const lines = stripComments(fs.readFileSync(path.join(SRC, rel), 'utf8')).split('\n');
      lines.forEach((line, i) => {
        if (EMISSION.test(line)) hits.push(`${rel.replace(/\\/g, '/')}:${i + 1}`);
      });
    }
  }
  return hits;
}

describe('6A: nothing emits SEND_ALI_OUTREACH today', () => {
  it('no strategy or candidate generator produces it', () => {
    // Named, not counted: on failure this says WHICH file and line, because "1 !== 0"
    // would send the next reader hunting.
    expect(emissions()).toEqual([]);
  });

  it('the scan actually walked the three trees - it is not passing on an empty list', () => {
    // The vacuity control. A scan over zero files also returns zero hits.
    const counts = SCANNED.map((d) => tsFilesUnder(d).length);
    expect(counts.every((n) => n > 0)).toBe(true);
    expect(counts.reduce((a, b) => a + b, 0)).toBeGreaterThanOrEqual(10);
  });

  it('and it FIRES on an emission - proven against source, not asserted', () => {
    // The positive control, the property this whole file rests on. Two shapes a
    // generator really uses, and one that must NOT match: the bare string in a map.
    expect(EMISSION.test("  candidates.push({ action_type: 'SEND_ALI_OUTREACH', score: 3 });")).toBe(true);
    expect(EMISSION.test('  return { action: "SEND_ALI_OUTREACH" };')).toBe(true);
    expect(EMISSION.test("  SEND_ALI_OUTREACH: 3,")).toBe(false);
  });

  it('a commented-out emission does not count as one, and does not hide one either', () => {
    expect(EMISSION.test(stripComments("// candidates.push({ action: 'SEND_ALI_OUTREACH' });"))).toBe(false);
    expect(EMISSION.test(stripComments("const x = 1; /* c */ const y = { action: 'SEND_ALI_OUTREACH' };"))).toBe(true);
  });
});

describe('the legitimate sites, pinned - so nobody widens the scan into a string search', () => {
  // Each of these carries the bare action name for a correct reason. They are asserted
  // PRESENT: if the scan above were ever rewritten to look for the bare string, these
  // cells say exactly what it would start failing on and why that would be wrong.
  const contains = (rel: string) => fs.readFileSync(path.join(SRC, rel), 'utf8').includes('SEND_ALI_OUTREACH');

  it.each([
    ['services/growthJourney/governor/actionVocabulary.ts', 'names it in order to EXCLUDE it (human-in-the-loop)'],
    ['services/growthJourney/strategies/b2bCandidates.ts', 'ranks it in a tier map - a rank is not an emission'],
    ['services/growthJourney/decision/executionModeStamp.ts', 'routes it to the ladder as a channel'],
    ['schemas/explorerGrowthSchema.ts', 'DEFINES the vocabulary'],
    ['types/explorerGrowth.ts', 'defines the union member'],
  ])('%s carries the bare name, and that is correct: %s', (rel) => {
    expect(contains(rel)).toBe(true);
  });

  it('the tier map in b2bCandidates is a RANK, not a candidate - the distinction the scan rests on', () => {
    const code = stripComments(fs.readFileSync(path.join(SRC, 'services/growthJourney/strategies/b2bCandidates.ts'), 'utf8'));
    expect(code).toMatch(/SEND_ALI_OUTREACH:\s*\d+/);
    expect(EMISSION.test(code)).toBe(false);
  });
});

describe('the backstop: even an emission nobody caught can only reach REVIEW', () => {
  it('ali_outreach is a review-only channel, so no cohort rule can release it', () => {
    // The constant behind the ladder's behaviour. The behaviour itself is pinned in
    // resolveExecutionMode.test.ts ("review_only_channel") and decisionService.mode.test.ts;
    // this asserts the input that makes it true, without making a third copy of the pin.
    expect(REVIEW_ONLY_CHANNELS).toContain('ali_outreach');
  });

  it('and it is the ONLY review-only channel, so the set has not quietly grown', () => {
    expect([...REVIEW_ONLY_CHANNELS]).toEqual(['ali_outreach']);
  });
});
