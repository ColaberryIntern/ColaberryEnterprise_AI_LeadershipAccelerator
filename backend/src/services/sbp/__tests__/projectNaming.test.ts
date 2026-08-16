/**
 * projectNaming — the derivation rule and the guarded write.
 *
 * MEASURED, 2026-08-16, production: 34 projects, 6 named, 28 with a NULL name.
 * Of those, exactly 20 were student builds carrying both an intake and a plan,
 * and 15 of the 20 had the student's own answer sitting unread in
 * `build_intake.name`. Nothing in the backend has ever written `projects.name`.
 *
 * These tests hold the three properties that make the fix safe to run against a
 * live cohort: the student's own words win, whitespace is not a name, and a name
 * that already exists is never overwritten by anything in this module.
 */
const mockQuery = jest.fn();
jest.mock('../../../config/database', () => ({ sequelize: { query: (...a: any[]) => mockQuery(...a) } }));

import { readFileSync } from 'fs';
import { join } from 'path';
import {
  normalizeProjectName, deriveProjectName, setProjectNameIfEmpty,
  MAX_PROJECT_NAME_LENGTH, PROJECT_NAME_COLUMNS,
} from '../projectNaming';

const PROJECT = '11111111-1111-1111-1111-111111111111';

beforeEach(() => mockQuery.mockReset());

describe('normalizeProjectName', () => {
  it('keeps a real name exactly as the student typed it', () => {
    expect(normalizeProjectName('GoalKick')).toBe('GoalKick');
  });

  it('returns null for whitespace-only input rather than an empty string', () => {
    // The defect this closes is downstream: `' '` is truthy, so it survives
    // every `name || fallback` and then renders as a heading with no text.
    // `null` is the only value that cannot do that.
    expect(normalizeProjectName(' ')).toBeNull();
    expect(normalizeProjectName('\t\n  ')).toBeNull();
    expect(normalizeProjectName('')).toBeNull();
  });

  it('returns null for a non-string, including null and undefined', () => {
    expect(normalizeProjectName(null)).toBeNull();
    expect(normalizeProjectName(undefined)).toBeNull();
    expect(normalizeProjectName(42)).toBeNull();
  });

  it('trims surrounding whitespace and collapses internal runs', () => {
    expect(normalizeProjectName('  Peace Of Mind  ')).toBe('Peace Of Mind');
    expect(normalizeProjectName('Goal   Kick')).toBe('Goal Kick');
    expect(normalizeProjectName('Meeting\nAssistant')).toBe('Meeting Assistant');
  });

  it('preserves the punctuation students actually use in names', () => {
    // Two real production names. An over-eager sanitiser that stripped these
    // would make the name unrecognisable to the person who chose it.
    expect(normalizeProjectName('NEXUS AI — Healthcare Operations Intelligence Platform'))
      .toBe('NEXUS AI — Healthcare Operations Intelligence Platform');
    expect(normalizeProjectName('Keysy – Home Buying App')).toBe('Keysy – Home Buying App');
  });

  it('bounds an overlong name to MAX_PROJECT_NAME_LENGTH', () => {
    const long = 'x'.repeat(MAX_PROJECT_NAME_LENGTH + 50);
    expect(normalizeProjectName(long)).toHaveLength(MAX_PROJECT_NAME_LENGTH);
  });
});

describe('deriveProjectName precedence', () => {
  it("prefers the student's intake name over the plan's generated one", () => {
    // Production row 48f67531: the student typed "CoreOps"; the plan called
    // itself "CoreOps AI Operations Dashboard". The student's word wins.
    expect(deriveProjectName({ intakeName: 'CoreOps', planName: 'CoreOps AI Operations Dashboard' }))
      .toEqual({ name: 'CoreOps', source: 'intake' });
  });

  it('falls back to the plan name when intake left it blank', () => {
    // Production row 8190a7ef: no intake name, plan carried "Keysy – Home Buying App".
    expect(deriveProjectName({ intakeName: '   ', planName: 'Keysy – Home Buying App' }))
      .toEqual({ name: 'Keysy – Home Buying App', source: 'plan' });
    expect(deriveProjectName({ intakeName: null, planName: 'Small Business KPI Copilot' }))
      .toEqual({ name: 'Small Business KPI Copilot', source: 'plan' });
  });

  it('yields no name at all when neither source says anything', () => {
    // Deliberately NOT a template. Production rows c16a410c and c30f8234 have
    // no intake and no plan; naming them "Project 1" would put a label on a
    // student's screen that they never chose and would not recognise.
    expect(deriveProjectName({ intakeName: '  ', planName: null }))
      .toEqual({ name: null, source: 'none' });
    expect(deriveProjectName({})).toEqual({ name: null, source: 'none' });
  });
});

describe('setProjectNameIfEmpty', () => {
  it('writes the normalized name and reports that it named the project', async () => {
    mockQuery.mockResolvedValue([[{ id: PROJECT }], {}]);
    await expect(setProjectNameIfEmpty(PROJECT, '  HomeHub  ')).resolves.toBe(true);

    expect(mockQuery).toHaveBeenCalledTimes(1);
    const [, options] = mockQuery.mock.calls[0];
    // Exactly the trimmed name — not the raw input, not a coerced empty string.
    expect(options.bind).toEqual({ pid: PROJECT, name: 'HomeHub' });
  });

  it('reports false when the row was already named, and is therefore idempotent', async () => {
    // The guarded UPDATE matches nothing on the second pass, so a re-run cannot
    // change a name and cannot claim it did.
    mockQuery.mockResolvedValue([[], {}]);
    await expect(setProjectNameIfEmpty(PROJECT, 'MeshMedic')).resolves.toBe(false);
    expect(mockQuery).toHaveBeenCalledTimes(1);
  });

  it('issues NO statement at all for a blank candidate', async () => {
    // A whitespace-only name must never reach the column: once `' '` is stored,
    // the frontend renders a blank heading and the row still looks "named".
    await expect(setProjectNameIfEmpty(PROJECT, '   ')).resolves.toBe(false);
    await expect(setProjectNameIfEmpty(PROJECT, null)).resolves.toBe(false);
    expect(mockQuery).not.toHaveBeenCalled();
  });

  it('guards the UPDATE so a name a student already set is unreachable', () => {
    // Asserted against the statement text, because this is the property that
    // makes the backfill safe to run twice against a live cohort and no mock
    // of `sequelize.query` can observe a WHERE clause it never evaluates.
    const src = readFileSync(join(__dirname, '..', 'projectNaming.ts'), 'utf8');
    const stmt = /UPDATE projects SET([\s\S]*?)RETURNING id/.exec(src);
    expect(stmt).not.toBeNull();
    const clause = (stmt as RegExpExecArray)[1];
    expect(clause).toContain("name IS NULL OR btrim(name) = ''");
    // Scoped to one row. A backfill that could touch every project is a
    // different and much worse script than this one.
    expect(clause).toContain('WHERE id = $pid');
  });
});

describe('the source file itself is reviewable text', () => {
  it('contains no raw control bytes', () => {
    // This file shipped with the control-character class written as LITERAL
    // bytes — an actual NUL, 0x1F and 0x7F sitting in the source. Functionally
    // the regex was correct, and that is exactly the problem: git classified
    // the file as binary, printed `Bin 0 -> 6890 bytes` instead of a diff, and
    // the whole module went to review unreadable. A naming rule nobody can read
    // is a naming rule nobody can check.
    const bytes = readFileSync(join(__dirname, '..', 'projectNaming.ts'));
    const offenders: number[] = [];
    for (const b of bytes) {
      if ((b < 0x20 && b !== 0x0a && b !== 0x0d && b !== 0x09) || b === 0x7f) offenders.push(b);
    }
    expect(offenders).toEqual([]);
  });

  it('still strips control characters at runtime, via escapes', () => {
    expect(normalizeProjectName('Meeting\u0000Assistant')).toBe('Meeting Assistant');
    expect(normalizeProjectName('Meeting\u001FAssistant')).toBe('Meeting Assistant');
    expect(normalizeProjectName('Meeting\u007FAssistant')).toBe('Meeting Assistant');
    expect(normalizeProjectName('\u0000\u001F\u007F')).toBeNull();
  });
});

describe('PROJECT_NAME_COLUMNS', () => {
  it('names only columns the Project model actually declares', () => {
    // The sibling statement in this pipeline, `makeActiveProject`, shipped
    // referencing `enrollments.updated_at`, which does not exist. It threw on
    // every publish and its own catch swallowed it, so the bug it was written
    // to fix stayed live while the suite stayed green. This is the same check,
    // applied to the same class of mistake, on the statement above.
    const src = readFileSync(join(__dirname, '..', '..', '..', 'models', 'Project.ts'), 'utf8');
    const declared = new Set<string>();
    for (const m of src.matchAll(/^ {4}(\w+): \{/gm)) declared.add(m[1]);
    if (!/timestamps:\s*false/.test(src)) { declared.add('created_at'); declared.add('updated_at'); }
    declared.add('id');

    const missing = PROJECT_NAME_COLUMNS.filter((c) => !declared.has(c));
    expect(missing).toEqual([]);
  });
});
