import * as fs from 'fs';
import * as path from 'path';

/**
 * M38a - the Maya acceptance registry: every acceptance criterion of M31, M32, M33, M35, M36 and M37 mapped to the real
 * test that proves it, in the shape of the Phase 2 registry (acceptanceScenarios.phase2.test.ts) and for its reason: a claim
 * of "all criteria pass" must name a population someone can reconstruct. The behavior is proven where it lives; the
 * mapping is proven here, and this file fails if a covering test is renamed, duplicated, skipped or deleted.
 *
 * Titles are SUBSTRINGS that identify one test uniquely in its suite. The controls below run the real check on mutated copies of real suite text; a title that
 * was never written is not found; a title must appear exactly once; a suite path that does not exist fails loudly.
 *
 * NOT IN THIS REGISTRY, stated rather than implied:
 *   - frontend assertions (the "Back soon" text, the readiness toggle) live in the frontend suite and are cited in the
 *     handoff document, not here;
 *   - M36 "No Campus UI built in this ticket" and M35 "No new task or approval system" are DIFF properties, checked by
 *     review (the PR diff adds no task, approval or Campus UI system), not by a test;
 *   - M36 "Maya is never shown to members or business sponsors" is SUPERSEDED by Ali's later decision C21 (v6 D3): she is
 *     on every desk for every audience. The registry pins the CURRENT rule and marks the line superseded.
 */

const SRC = path.join(__dirname, '..');

interface Criterion { ticket: string; text: string; suite: string; test: string; note?: string }

const CRITERIA: Criterion[] = [
  // M37 - shadow to live
  { ticket: 'M37', text: 'Each capability promotes independently', suite: 'services/maya/__tests__/mayaPromotion.test.ts', test: 'runs the full cycle on one capability without touching the others' },
  { ticket: 'M37', text: 'Promote, verify, revert, verify again all demonstrated', suite: 'services/maya/__tests__/mayaPromotion.test.ts', test: 'runs the full cycle on one capability without touching the others' },
  { ticket: 'M37', text: 'The kill switch silences her immediately', suite: 'services/maya/__tests__/mayaPromotion.test.ts', test: 'on -> off for all four, regardless of promotion' },
  { ticket: 'M37', text: 'No promotion without human review', suite: 'services/maya/__tests__/mayaPromotion.test.ts', test: 'rejects a promotion with no note or no reviewer, and stores nothing' },
  { ticket: 'M37', text: 'No promotion without human review (only Ali or a super_admin may promote)', suite: 'routes/admin/__tests__/mayaCapabilityRoutes.access.test.ts', test: '403 for an admin who is not Ali or a super_admin' },
  // M31 - respond_to_explorer_dm
  { ticket: 'M31', text: 'Replies come through the existing DM surface', suite: 'services/maya/__tests__/mayaReplyService.test.ts', test: 'answers through sendDmMessage as Maya' },
  { ticket: 'M31', text: 'She says she is AI', suite: 'services/maya/__tests__/mayaReplyService.m31.test.ts', test: 'her first message in a room starts with the disclosure' },
  { ticket: 'M31', text: 'A price or date question with no authoritative answer returns a handoff, not a number', suite: 'services/maya/__tests__/mayaReplyService.m31.test.ts', test: 'REFUSAL: "how many seats are left?"', note: 'price IS authoritative (price of record); proved on seats, deadlines, consent and dates' },
  { ticket: 'M31', text: 'A date question with no authoritative answer returns a handoff, not a date', suite: 'services/maya/__tests__/mayaDmGovernance.test.ts', test: 'no batch of record -> a handoff, never a generated date' },
  { ticket: 'M31', text: 'Refusal test present', suite: 'services/maya/__tests__/mayaDmGovernance.test.ts', test: 'REFUSAL TEST: a seat question returns a handoff, not a number' },
  // M32 - send_in_app_welcome
  { ticket: 'M32', text: 'Shadow records and delivers nothing, proved by the absence of a send', suite: 'services/maya/__tests__/mayaWelcomeService.test.ts', test: 'records the exact body it WOULD send, and sends NOTHING' },
  { ticket: 'M32', text: 'In-app only', suite: 'services/maya/__tests__/mayaWelcomeService.test.ts', test: 'claims the row, then sends exactly one in-app DM' },
  { ticket: 'M32', text: 'Promotion out of shadow requires Ali', suite: 'routes/admin/__tests__/mayaCapabilityRoutes.access.test.ts', test: '403 for an admin who is not Ali or a super_admin' },
  { ticket: 'M32', text: 'Promotion alone does not make the welcome send (the M29 flags are also Ali decisions)', suite: 'services/maya/__tests__/mayaPromotion.test.ts', test: 'a promoted proactive capability stays shadow while M29 is off' },
  { ticket: 'M32', text: 'Copy never advertises the banned word', suite: 'services/maya/__tests__/mayaWelcomeService.test.ts', test: 'never the banned word or an em dash' },
  // M33 - create_journey_handoff
  { ticket: 'M33', text: 'A handoff is created server-side and confirmed', suite: 'services/maya/__tests__/mayaJourneyHandoff.test.ts', test: 'creates one admissions handoff with the reason code' },
  { ticket: 'M33', text: 'Success is claimed only on confirmation; otherwise the fallback opens', suite: 'services/maya/__tests__/mayaDmGovernance.test.ts', test: 'claims "someone will follow up" ONLY on a confirmed handoff' },
  { ticket: 'M33', text: 'Human ownership pauses the journey', suite: 'services/explorerGrowth/governor/__tests__/humanOwnership.test.ts', test: 'human_owned stops the decision' },
  { ticket: 'M33', text: 'Idempotent: the same handoff twice yields one', suite: 'services/maya/__tests__/mayaJourneyHandoff.test.ts', test: 'the same handoff twice yields ONE row' },
  // M35 - admissions queue
  { ticket: 'M35', text: 'Every handoff appears exactly once', suite: 'services/growthJourney/handoffs/__tests__/handoffReadiness.test.ts', test: 'EVERY handoff appears exactly once' },
  { ticket: 'M35', text: 'Ordered by the readiness score', suite: 'routes/admin/__tests__/growthJourneyHandoffRoutes.access.test.ts', test: 'M35 order=readiness: ranked by the readiness score' },
  { ticket: 'M35', text: 'Taking ownership pauses the journey', suite: 'services/explorerGrowth/governor/__tests__/humanOwnership.test.ts', test: 'true when an accepted handoff exists for the enrollment' },
  // M36 - Campus contract
  { ticket: 'M36', text: 'Maya is never shown to members or business sponsors (SUPERSEDED by C21 v6 D3: every audience)', suite: 'services/campus/__tests__/campusStaffDesks.test.ts', test: 'mayaVisibleTo is every audience', note: 'superseded' },
  { ticket: 'M36', text: 'A disabled Maya shows back soon, not an error', suite: 'services/campus/__tests__/campusStaffDesks.test.ts', test: 'on the M37 switch: desk off duty' },
  { ticket: 'M36', text: 'Tour completion returns handoff false when handoffs are off', suite: 'services/campus/__tests__/campusTourHandoff.test.ts', test: '-> disabled, no dependency touched' },
];

const read = (suite: string): string => fs.readFileSync(path.join(SRC, suite), 'utf8');
const occurrences = (hay: string, needle: string): number => hay.split(needle).length - 1;

/** A test declaration and its modifiers: it / test / xit / fit / it.skip / it.only / it.each / it.skip.each / test.concurrent. */
const DECLARATION = /\b([xf]?(?:it|test))((?:\.(?:skip|only|each|concurrent|todo))*)\s*(?:\(|$)/g;
const DISABLED_DECL = (name: string, mods: string): boolean => /^[xf]/.test(name) || /\.(skip|only|todo)\b/.test(mods);
/** A column-0 describe and its modifiers, the convention in every covering suite (as in Phase 2). */
const BLOCK = /^([xf]?describe)((?:\.(?:skip|only|each))*)\s*\(/;

/**
 * Why `src` fails to prove `title`, or null when it proves it: the title appears exactly once, the call that declares it
 * (searched back across the line break an `it.each([...])(` puts between the call and its title) is live, and the
 * column-0 describe that encloses it is live.
 */
export function provesLive(src: string, title: string): string | null {
  const count = occurrences(src, title);
  if (count !== 1) return `title appears ${count} times`;
  const lines = src.split(/\r?\n/);
  const at = lines.findIndex((l) => l.includes(title));
  // The declaring call: the LAST declaration token in the window from up to 3 lines above the title to the title line.
  const windowText = lines.slice(Math.max(0, at - 3), at + 1).join('\n');
  let decl: RegExpExecArray | null = null;
  let m: RegExpExecArray | null;
  DECLARATION.lastIndex = 0;
  while ((m = DECLARATION.exec(windowText)) !== null) decl = m;
  if (!decl) return 'no it/test declaration found for the title';
  if (DISABLED_DECL(decl[1], decl[2])) return `declaration is disabled (${decl[1]}${decl[2]})`;
  for (let i = at; i >= 0; i--) {
    const b = BLOCK.exec(lines[i]);
    if (b) return /^[xf]/.test(b[1]) || /\.(skip|only)\b/.test(b[2]) ? `enclosing block is disabled (${b[1]}${b[2]})` : null;
  }
  return null; // a top-level test with no describe is live
}

describe('M38a: the Maya acceptance criteria are a set, not a claim', () => {
  it('covers every ticket in the Maya build (M31, M32, M33, M35, M36, M37)', () => {
    expect([...new Set(CRITERIA.map((c) => c.ticket))].sort()).toEqual(['M31', 'M32', 'M33', 'M35', 'M36', 'M37']);
  });

  it.each(CRITERIA.map((c) => [`${c.ticket}: ${c.text}`, c] as const))('%s', (_label, c) => {
    expect(fs.existsSync(path.join(SRC, c.suite))).toBe(true);
    expect(provesLive(read(c.suite), c.test)).toBeNull();
  });
});

/**
 * The controls run the REAL check on mutated copies of REAL suite text, and each mutation must be caught. Mutations that
 * the 2026-11-09 verifier showed the first version of this file missed are included by name.
 */
describe('M38a: the matcher can fail, on real suite text', () => {
  const promotion = read('services/maya/__tests__/mayaPromotion.test.ts');
  const desks = read('services/campus/__tests__/campusStaffDesks.test.ts');
  const CYCLE = 'runs the full cycle on one capability without touching the others';
  const PAUSED = 'on the M37 switch: desk off duty';

  it('positive control: the unmutated suites prove live', () => {
    expect(provesLive(promotion, CYCLE)).toBeNull();
    expect(provesLive(desks, PAUSED)).toBeNull();
  });
  it('xdescribe on the enclosing block is caught', () => {
    const mutated = promotion.replace("describe('promote, verify, revert, verify again'", "xdescribe('promote, verify, revert, verify again'");
    expect(mutated).not.toBe(promotion);
    expect(provesLive(mutated, CYCLE)).toMatch(/enclosing block is disabled/);
  });
  it('describe.skip on the enclosing block is caught', () => {
    const mutated = promotion.replace("describe('promote, verify, revert, verify again'", "describe.skip('promote, verify, revert, verify again'");
    expect(provesLive(mutated, CYCLE)).toMatch(/enclosing block is disabled/);
  });
  it('it.skip.each, with the title on the NEXT line, is caught', () => {
    const mutated = desks.replace("it.each([['shadow' as const], ['off' as const]])(", "it.skip.each([['shadow' as const], ['off' as const]])(");
    expect(mutated).not.toBe(desks);
    expect(provesLive(mutated, PAUSED)).toMatch(/declaration is disabled/);
  });
  it('xit on a single-line declaration is caught', () => {
    const mutated = promotion.replace(`it('${CYCLE}'`, `xit('${CYCLE}'`);
    expect(mutated).not.toBe(promotion);
    expect(provesLive(mutated, CYCLE)).toMatch(/declaration is disabled/);
  });
  it('a doubled REAL title is caught', () => {
    const line = promotion.split(/\r?\n/).find((l) => l.includes(CYCLE))!;
    expect(provesLive(`${promotion}\n${line}\n`, CYCLE)).toMatch(/appears 2 times/);
  });
  it('a title that was never written is caught', () => {
    expect(provesLive(promotion, 'promotes everything by default on deploy')).toMatch(/appears 0 times/);
  });
  it('a suite path that does not exist fails the existence check the registry runs', () => {
    expect(fs.existsSync(path.join(SRC, 'services/maya/__tests__/noSuchSuite.test.ts'))).toBe(false);
  });
});

/*
 * WHAT THIS FILE STILL CANNOT DETECT, stated rather than implied (as Phase 2 does):
 *   - an EMPTIED body: a covering test whose assertions were deleted still declares itself and passes;
 *   - a block disabled by EXPRESSION, e.g. `(cond ? describe.skip : describe)(...)`, or an INDENTED nested describe.skip
 *     (only column-0 blocks are walked, the convention in every covering suite);
 *   - a title quoted in a COMMENT directly above a different live `it`: the comment is found, and the live test after it
 *     is taken as its declaration;
 *   - a WRONG mapping: that a cited test really proves its criterion is a human read (the 2026-11-09 verifier did it and
 *     re-mapped two entries); nothing mechanical here can.
 */
