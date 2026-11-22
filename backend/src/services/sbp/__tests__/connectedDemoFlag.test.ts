/**
 * connectedDemoFlag - the rollout gate, and the rule that the gate is not the source of truth.
 *
 * Three things are proved here, and the third is the one that would otherwise rot:
 *
 *   1. the env parse, table-driven, in BOTH directions, including values that LOOK like "on" and
 *      are not;
 *   2. the board lookup, including what it does when the database is unavailable;
 *   3. two SOURCE invariants - that no read path consults the env variable, and that every
 *      caller of `renderDocs` resolves the story. Both are mechanical, because both describe a
 *      mistake a future change makes by omission, and an omission is exactly what a
 *      behavior-only suite cannot see.
 */
import fs from 'fs';
import path from 'path';

const count = jest.fn(async () => 0);
jest.mock('../../../models/StudentTask', () => ({
  __esModule: true,
  default: { count: (...a: unknown[]) => count(...(a as [])) },
}));

import {
  connectedDemoEnabledFor,
  connectedDemoMaterializedFor,
  connectedDemoForPublish,
} from '../connectedDemoFlag';
import { CONNECTED_DEMO_STORY_ID } from '../connectedDemoStory';

const ENR = 'enr-in-scope';
const OTHER = 'enr-not-in-scope';

beforeEach(() => {
  jest.clearAllMocks();
  count.mockResolvedValue(0);
});

describe('connectedDemoEnabledFor: the env parse', () => {
  /**
   * One table, both directions. A test that only listed the true cases would pass with
   * `return true`, which is the recurring defect in this repo and the reason the false rows are
   * here in the same table rather than in a separate "and also" block.
   */
  const cases: ReadonlyArray<[string, string | null | undefined, string | null | undefined, boolean]> = [
    ['omitted entirely',                 undefined,          ENR,       false],
    ['null',                             null,               ENR,       false],
    ['empty string',                     '',                 ENR,       false],
    ['whitespace only',                  '   ',              ENR,       false],
    ['the literal off',                  'off',              ENR,       false],
    ['off with padding',                 '  off  ',          ENR,       false],
    ['all',                              'all',              ENR,       true],
    ['all with padding',                 ' all ',            ENR,       true],
    ['all, with no enrollment at all',   'all',              undefined, true],
    ['all, with a null enrollment',      'all',              null,      true],
    ['the one id, matching',             ENR,                ENR,       true],
    ['the one id, not matching',         ENR,                OTHER,     false],
    ['a list containing the id',         `${OTHER},${ENR}`,  ENR,       true],
    ['a list with spaces',               ` ${OTHER} , ${ENR} `, ENR,    true],
    ['a list not containing the id',     `${OTHER},e-3`,     ENR,       false],
    ['a list, with no enrollment',       `${OTHER},${ENR}`,  undefined, false],
    ['a list, with a null enrollment',   `${OTHER},${ENR}`,  null,      false],
    ['empty entries in the list',        `,,${ENR},,`,       ENR,       true],
    ['only empty entries',               ',,,',              ENR,       false],
    // The fail-closed rows. Somebody WILL set this to `true` and expect it to work; it must not,
    // and more importantly it must not accidentally admit everybody.
    ['the word true',                    'true',             ENR,       false],
    ['the word on',                      'on',               ENR,       false],
    ['the word yes',                     'yes',              ENR,       false],
    ['ALL in capitals',                  'ALL',              ENR,       false],
    ['the number 1',                     '1',                ENR,       false],
    /*
     * The three rows a mutation run added, each because a tripwire of mine turned out to be
     * decorative: the mutated code still passed every row above.
     */
    // `off` as an ENROLLMENT ID. Without the `v === 'off'` early return this falls through to the
    // list test and matches, which would hand the feature to one absurdly named account.
    ['off, as the id as well as the setting', 'off',           'off',     false],
    // PREFIX COLLISION. A membership test that had been written as `v.includes(enrollmentId)`
    // would admit `enr-1` because the list contains `enr-12`, which is a different account.
    ['a list whose entry merely CONTAINS the id', 'enr-12,enr-9', 'enr-1', false],
    // And the exact match still works, so the row above is not passing by being strict about
    // everything.
    ['that same list, matching exactly',     'enr-12,enr-9',   'enr-12',  true],
  ];

  it.each(cases)('%s', (_label, setting, enrollmentId, expected) => {
    expect(connectedDemoEnabledFor(enrollmentId, setting)).toBe(expected);
  });

  it('the table contains both answers, so it cannot be satisfied by a constant', () => {
    // The guard on the guard. A table that had drifted to all-false would still pass every row
    // above against `return false`.
    expect(cases.some(([, , , e]) => e === true)).toBe(true);
    expect(cases.some(([, , , e]) => e === false)).toBe(true);
  });

  it('never reads the database: it is a pure parse', async () => {
    connectedDemoEnabledFor(ENR, 'all');
    connectedDemoEnabledFor(ENR, 'off');
    expect(count).not.toHaveBeenCalled();
  });
});

describe('connectedDemoMaterializedFor: the board is the source of truth', () => {
  it('true when the row exists, false when it does not', async () => {
    count.mockResolvedValue(1);
    expect(await connectedDemoMaterializedFor('prj-1')).toBe(true);
    count.mockResolvedValue(0);
    expect(await connectedDemoMaterializedFor('prj-1')).toBe(false);
  });

  it('asks for THIS project and THAT story, by their literal values', async () => {
    await connectedDemoMaterializedFor('prj-1');
    expect(count).toHaveBeenCalledWith({
      where: { project_id: 'prj-1', story_id: CONNECTED_DEMO_STORY_ID },
    });
    // Pinned to the literal as well as the constant: a change to the constant that was not
    // intended would otherwise pass, since both sides would move together.
    expect(CONNECTED_DEMO_STORY_ID).toBe('STORY-900');
  });

  it('does not query at all for a missing project id', async () => {
    expect(await connectedDemoMaterializedFor('')).toBe(false);
    expect(await connectedDemoMaterializedFor(null)).toBe(false);
    expect(await connectedDemoMaterializedFor(undefined)).toBe(false);
    expect(count).not.toHaveBeenCalled();
  });

  it('fails soft to false and LOGS the failure with its error class', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    count.mockRejectedValue(new TypeError('connection terminated unexpectedly'));
    try {
      expect(await connectedDemoMaterializedFor('prj-1')).toBe(false);
      expect(warn).toHaveBeenCalledTimes(1);
      const logged = JSON.parse(warn.mock.calls[0][0] as string);
      // Swallowing would be a defect under CLAUDE.md. The log is what makes this a degrade.
      expect(logged.event).toBe('connected_demo_row_lookup_failed');
      expect(logged.error_class).toBe('TypeError');
      expect(logged.level).toBe('warn');
      expect(logged.context.projectId).toBe('prj-1');
      expect(logged.context.fell_back_to).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it('a boundary that reads like a bug if it is wrong: a count of 0 is false, not falsy-true', async () => {
    count.mockResolvedValue(0);
    const answer = await connectedDemoMaterializedFor('prj-1');
    expect(answer).toBe(false);
    expect(typeof answer).toBe('boolean');
  });
});

describe('connectedDemoForPublish: the OR, in both directions', () => {
  it('is true for an enrollment in scope WITHOUT reading the board', async () => {
    // The short circuit is deliberate: a build that is in scope must not depend on a database
    // read succeeding in order to get the story it was promised.
    expect(await connectedDemoForPublish('prj-1', ENR, 'all')).toBe(true);
    expect(count).not.toHaveBeenCalled();
  });

  it('is true for an enrollment OUT of scope that already has the row', async () => {
    // The half that keeps a student whole after the rollout narrows.
    count.mockResolvedValue(1);
    expect(await connectedDemoForPublish('prj-1', OTHER, ENR)).toBe(true);
  });

  it('is false when the flag is off and there is no row', async () => {
    count.mockResolvedValue(0);
    expect(await connectedDemoForPublish('prj-1', OTHER, 'off')).toBe(false);
  });

  it('is false when the flag is off and the board lookup fails', async () => {
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
    count.mockRejectedValue(new Error('down'));
    try {
      expect(await connectedDemoForPublish('prj-1', OTHER, 'off')).toBe(false);
    } finally {
      warn.mockRestore();
    }
  });

  it('is true when the flag is on even though the board lookup would fail', async () => {
    count.mockRejectedValue(new Error('down'));
    expect(await connectedDemoForPublish('prj-1', ENR, 'all')).toBe(true);
  });
});

/*
 * ── THE TWO SOURCE INVARIANTS ───────────────────────────────────────────────────────────────
 *
 * Behavior tests cannot catch a call site that was never written. These can.
 */

const SRC = path.resolve(__dirname, '../../..');

function walk(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name === 'node_modules' || entry.name === '__tests__') continue;
      walk(full, out);
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

const rel = (f: string) => path.relative(SRC, f).split(path.sep).join('/');

describe('only the publish path may consult the env variable', () => {
  /**
   * The rule this enforces, and what it costs to break it.
   *
   * `env.sbpConnectedDemo` answers "should a NEW build get a demo". Every other surface - the
   * document render, the bundle download, the story pricing, the verifier - must ask the board
   * instead. A read path that consulted the variable would stop rendering, pricing and judging
   * STORY-900 the moment the rollout narrowed, leaving students holding a task that cannot be
   * completed or paid. That is the `sbp_verification_task_missing` defect documented at the top
   * of `storyPoints.ts`, which cost the first task of every domain release its points.
   */
  const ALLOWED = ['services/sbp/sbpOrchestrator.ts'];

  it('is referenced in exactly the allowed files and nowhere else', () => {
    const offenders = walk(SRC)
      .filter((f) => fs.readFileSync(f, 'utf8').includes('env.sbpConnectedDemo'))
      .map(rel)
      .filter((f) => !ALLOWED.includes(f));
    expect(offenders).toEqual([]);
  });

  it('and it IS referenced there, so the rule is not vacuously satisfied', () => {
    for (const f of ALLOWED) {
      expect(fs.readFileSync(path.join(SRC, f), 'utf8')).toContain('env.sbpConnectedDemo');
    }
  });

  it('the sweep actually reads files, proved against a string that must be found', () => {
    // The control. A broken walk would return nothing and make both tests above pass forever.
    const hits = walk(SRC).filter((f) => fs.readFileSync(f, 'utf8').includes('connectedDemoForPublish'));
    expect(hits.length).toBeGreaterThanOrEqual(2); // the module, and its one caller
  });
});

/**
 * Extract every CALL EXPRESSION of `name(` in a source file, parentheses balanced.
 *
 * The first version of the sweep below asked `fileText.includes('connectedDemo')` per caller, and
 * an independent verifier showed what that actually enforces: "every caller MENTIONS the string
 * somewhere in the file". It deleted the `connectedDemo` argument from five separate call sites -
 * including the orchestrator's `renderDocs` context, which leaves a student with a STORY-900 task
 * and no STORY-900.md - and every test and both sweeps stayed green, because the leftover import
 * line and the explanatory comments kept the word in the file.
 *
 * Reading the call expression is the difference between checking that a file talks about
 * something and checking that it does it.
 */
/**
 * Strip comments, because a call expression carries its own.
 *
 * The first version of the call-expression sweep still missed two deletions, and the reason is
 * worth writing down: the explanatory comment ABOVE an argument sits inside the call's
 * parentheses, and those comments name `connectedDemo`. So removing the argument left the comment
 * behind and `call.includes('connectedDemo')` was still true. The sweep had moved from "the file
 * mentions it" to "the call mentions it" and needed to reach "the call DOES it".
 */
function stripComments(code: string): string {
  return code.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/[^\n]*/g, '');
}

function callExpressions(src: string, name: string): string[] {
  const out: string[] = [];
  const needle = `${name}(`;
  for (let i = src.indexOf(needle); i !== -1; i = src.indexOf(needle, i + 1)) {
    // Skip the DECLARATION: `export function planStorySpecs(` is not a call of itself.
    if (/\bfunction\s+$/.test(src.slice(Math.max(0, i - 20), i))) continue;
    // Skip an identifier that merely ends with the name, e.g. `myRenderDocs(`.
    if (/[A-Za-z0-9_$]/.test(src[i - 1] ?? '')) continue;
    let depth = 0;
    let j = i + name.length;
    for (; j < src.length; j += 1) {
      if (src[j] === '(') depth += 1;
      else if (src[j] === ')') {
        depth -= 1;
        if (depth === 0) break;
      }
    }
    out.push(stripComments(src.slice(i, j + 1)));
  }
  return out;
}

describe('the call-expression scanner itself works', () => {
  // Without this, a scanner that returned nothing would make every sweep below pass forever.
  it('finds a call, skips the declaration, and keeps nested parentheses together', () => {
    const src = 'export function f(a = 1) {}\nconst x = f(g(1), h(2));\nconst y = notf(3);';
    const calls = callExpressions(src, 'f');
    expect(calls).toEqual(['f(g(1), h(2))']);
  });

  it('strips comments, so a comment naming the argument cannot stand in for the argument', () => {
    // The exact miss this control exists for: two deletions survived a call-expression sweep
    // because the comment above the deleted line was still inside the parentheses and still
    // named it. Asserted in BOTH directions, which is what makes it a control and not a claim.
    const withArg = callExpressions('r(plan, {\n  // see connectedDemo\n  connectedDemo: x,\n});', 'r');
    const withoutArg = callExpressions('r(plan, {\n  // see connectedDemo\n});', 'r');
    expect(withArg[0]).toContain('connectedDemo');
    expect(withoutArg[0]).not.toContain('connectedDemo');
    // Block comments too, since both styles appear in these call sites.
    expect(callExpressions('r(plan, {\n  /* connectedDemo */\n});', 'r')[0]).not.toContain('connectedDemo');
  });
});

describe('every planStorySpecs caller resolves the Connected Demo story', () => {
  /**
   * The SHOW side and the PAY side must agree.
   *
   * `storyPoints.ts`' own header: "A number advertised on a tile has to be the number the student
   * is paid, so the two cannot be computed in two places." There are three production callers and
   * the first version of this work resolved two, which would have had the tile advertise
   * `budget / N` while the verifier paid `budget / (N + 1)` on any build carrying STORY-900.
   */
  it('every call passes the resolution, and there are at least three of them', () => {
    const callers = walk(SRC)
      .map((f) => [rel(f), fs.readFileSync(f, 'utf8')] as const)
      .flatMap(([file, src]) => callExpressions(src, 'planStorySpecs').map((call) => [file, call] as const));

    expect(callers.length).toBeGreaterThanOrEqual(3);
    const missing = callers.filter(([, call]) => !call.includes('connectedDemo'));
    expect(missing.map(([file]) => file)).toEqual([]);
  });

  it('and the three known call sites are among them, so the scan is not reading the wrong tree', () => {
    const files = walk(SRC)
      .filter((f) => callExpressions(fs.readFileSync(f, 'utf8'), 'planStorySpecs').length > 0)
      .map(rel);
    expect(files).toContain('services/sbp/verification/storyPoints.ts');
    expect(files).toContain('services/sbp/verification/buildVerificationService.ts');
    expect(files).toContain('services/progression/milestoneService.ts');
  });
});

describe('every renderDocs caller resolves the Connected Demo story', () => {
  /**
   * Why this is a directory sweep and not a list.
   *
   * There are four copies of the document set in production - the repo push, the refresh, the zip
   * download and the progress file - and `studentProgressFile.ts` already carries a comment
   * about what a fourth copy that disagrees costs. A fifth caller added later without the
   * resolution would render a student's STORY-900 doc away, or seed a progress file missing the
   * story they are being graded on, and no behavior test would notice.
   */
  const EXEMPT: ReadonlyArray<[string, string]> = [
    [
      'scripts/sbpLiveEndToEnd.ts',
      'A diagnostic that renders a checked-in fixture plan against a scratch GitHub repo. There is '
      + 'no project row to resolve from, and its subject is the render-and-commit chain, not the '
      + 'rollout.',
    ],
  ];

  it('every CALL passes connectedDemo, or its file is exempt for a written reason', () => {
    const exemptPaths = EXEMPT.map(([p]) => p);
    const calls = walk(SRC)
      .filter((f) => rel(f) !== 'services/sbp/renderDocs.ts')
      .map((f) => [rel(f), fs.readFileSync(f, 'utf8')] as const)
      .flatMap(([file, src]) => callExpressions(src, 'renderDocs').map((call) => [file, call] as const));

    const files = [...new Set(calls.map(([f]) => f))];
    // Found the ones we know about: a sweep that found nothing would pass trivially.
    expect(files).toContain('services/sbp/sbpOrchestrator.ts');
    expect(files).toContain('services/sbp/docsBundle.ts');
    expect(files).toContain('services/sbp/refreshRepoDocuments.ts');
    expect(files).toContain('services/sbp/studentProgressFile.ts');

    // The ARGUMENT, not the file. See `callExpressions` for what the file-level version missed.
    const missing = calls
      .filter(([file]) => !exemptPaths.includes(file))
      .filter(([, call]) => !call.includes('connectedDemo'));
    expect(missing.map(([file]) => file)).toEqual([]);
  });

  it('every exemption names a file that exists and gives a reason', () => {
    // An exemption list is a place to hide a defect. This makes a stale or empty entry fail.
    for (const [file, reason] of EXEMPT) {
      expect(fs.existsSync(path.join(SRC, file))).toBe(true);
      expect(reason.length).toBeGreaterThan(40);
    }
  });
});
