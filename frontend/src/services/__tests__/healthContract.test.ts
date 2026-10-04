import fs from 'fs';
import path from 'path';

/**
 * The frontend's hand-mirrored types, checked against the backend source that
 * actually produces the payload (Phase 6, T614).
 *
 * ── WHY THIS FILE EXISTS ────────────────────────────────────────────────────
 *
 * Types in this repo are mirrored by hand; there is no shared-types package, and
 * `capeApi.ts` and `explorerGrowthApi.ts` both record that as the standing
 * convention. The cost of that convention came due in T613: three fields in
 * `JourneyHealth` had drifted from what the server sends -
 *
 *   StatusAge.oldest_hours   -> the wire says max_age_hours
 *   CronHealth.agent_name    -> the wire says agent (and also sends schedule)
 *   TruncatedRead {read,cap} -> the wire sends a bare string union
 *
 * - so the Overview health panel rendered `undefined` for the receipt age and the
 * cron name, and "undefined (cap undefined)" for a capped read. Every check was
 * green the whole time. It could not have been otherwise: the component suite
 * mocks the API module wholesale and builds its fixture from the SAME frontend
 * types, so the fixture, the component and the suite agreed with each other and
 * all three disagreed with the backend. A closed loop cannot detect its own
 * offset. Neither can `tsc`, which only ever sees one side of the wire.
 *
 * So this test deliberately reaches OUTSIDE the frontend, reads the backend file
 * that declares the shape, and asserts the two declarations use the same field
 * names. It is a string comparison over source text, not a type check, because
 * the two sides cannot import each other.
 *
 * ── WHAT IT DOES AND DOES NOT CATCH ─────────────────────────────────────────
 *
 * It catches a RENAMED or REMOVED field on either side, which is the failure that
 * actually happened. It does NOT verify types (a `number` the backend changed to a
 * string still passes), it does not check nullability, and it says nothing about
 * fields the backend adds that the frontend has not mirrored - only that every
 * name the frontend claims exists over there. A positive control below proves the
 * reader is really parsing the backend file, because an assertion that cannot fail
 * is not a check.
 */

const BACKEND_HEALTH = path.resolve(
  __dirname,
  '../../../../backend/src/services/growthJourney/health/journeyHealth.ts',
);
const FRONTEND_CLIENT = path.resolve(__dirname, '../growthJourneyApi.ts');

const read = (p: string): string => fs.readFileSync(p, 'utf8');

/** The field names declared inside `export interface <name> { ... }`. */
function interfaceFields(src: string, name: string): string[] {
  const m = new RegExp(`export interface ${name}\\s*\\{([\\s\\S]*?)\\n\\}`).exec(src);
  if (!m) throw new Error(`interface ${name} not found`);
  return Array.from(m[1].matchAll(/^\s{2}([a-z_][a-z0-9_]*)\??:/gim)).map((x) => x[1]);
}

/** The members of `export type <name> = 'a' | 'b';`. */
function unionMembers(src: string, name: string): string[] {
  const m = new RegExp(`export type ${name} =([^;]*);`).exec(src);
  if (!m) throw new Error(`type ${name} not found`);
  return Array.from(m[1].matchAll(/'([^']+)'/g)).map((x) => x[1]).sort();
}

describe('the backend file this contract is read from', () => {
  it('is where this test thinks it is, and declares the shape', () => {
    // The positive control. Every assertion below is a string search over this
    // file; if the path were wrong, a missing field would read as agreement.
    expect(fs.existsSync(BACKEND_HEALTH)).toBe(true);
    const src = read(BACKEND_HEALTH);
    expect(src).toContain('export interface JourneyHealth');
    expect(src).toContain('export interface CronHealth');
    expect(src).toContain('export interface StatusAge');
    expect(src).toContain('export type TruncatedRead');
  });

  it('and the reader really parses it - a name that is NOT there must not pass', () => {
    // Proves `interfaceFields` discriminates rather than returning everything.
    const fields = interfaceFields(read(BACKEND_HEALTH), 'StatusAge');
    expect(fields).toContain('max_age_hours');
    expect(fields).not.toContain('oldest_hours');
  });
});

describe('every field the frontend claims on the health payload exists on the backend', () => {
  const be = () => read(BACKEND_HEALTH);
  const fe = () => read(FRONTEND_CLIENT);

  it.each(['StatusAge', 'CronHealth', 'JourneyHealth'])('%s', (name) => {
    const backend = interfaceFields(be(), name);
    const frontend = interfaceFields(fe(), name);
    expect(frontend.length).toBeGreaterThan(0);
    const missing = frontend.filter((f) => !backend.includes(f));
    expect(missing).toEqual([]);
  });

  it('TruncatedRead is the same union on both sides, member for member', () => {
    // The drift here was structural, not a rename: the frontend had an interface
    // where the backend has a string union, so `t.read` was undefined for every
    // element. Comparing members catches a narrowing or widening too.
    expect(unionMembers(fe(), 'TruncatedRead')).toEqual(unionMembers(be(), 'TruncatedRead'));
  });

  it('CronState is the same union on both sides', () => {
    expect(unionMembers(fe(), 'CronState')).toEqual(unionMembers(be(), 'CronState'));
  });

  it('and the three fields that were wrong are now right, by name', () => {
    // Named explicitly so that a future refactor of the helpers above cannot
    // quietly stop covering the exact regression this file was written for.
    //
    // Scoped to these two interfaces, NOT the whole file: the first draft of this
    // cell asserted the string `agent_name:` was absent from the module and failed
    // on `StatusRegistryAgent.agent_name`, which belongs to /status/registry and is
    // a different payload entirely. A negative assertion over a whole file catches
    // the right thing for the wrong reason, or the wrong thing.
    const feSrc = fe();
    const age = interfaceFields(feSrc, 'StatusAge');
    const cron = interfaceFields(feSrc, 'CronHealth');
    expect(age).toContain('max_age_hours');
    expect(age).not.toContain('oldest_hours');
    expect(cron).toContain('agent');
    expect(cron).toContain('schedule');
    expect(cron).not.toContain('agent_name');
  });
});

describe('the status/registry payload, mirrored from its controller', () => {
  // Added because the health drift was not a one-off risk: every type on this
  // surface is hand-mirrored, so each one can drift the same way. This payload
  // turned out to be CORRECT - and it is worth knowing why it is not the same
  // name as the health one. The backend is itself inconsistent: the registry
  // emits `agent_name` (growthJourneyStatusController.ts:135) while the health
  // report renames the same column to `agent` (journeyHealth.ts:331). The
  // frontend mirrored the column name both times and so was right once by luck.
  const REGISTRY_SRC = path.resolve(
    __dirname,
    '../../../../backend/src/controllers/growthJourneyStatusController.ts',
  );

  it('is where this test thinks it is', () => {
    expect(fs.existsSync(REGISTRY_SRC)).toBe(true);
    expect(read(REGISTRY_SRC)).toContain('export interface StatusRegistry');
  });

  it.each(['StatusRegistry', 'StatusRegistryAgent', 'StatusRegistryPath'])('%s', (name) => {
    const backend = interfaceFields(read(REGISTRY_SRC), name);
    const frontend = interfaceFields(read(FRONTEND_CLIENT), name);
    expect(frontend.length).toBeGreaterThan(0);
    expect(frontend.filter((f) => !backend.includes(f))).toEqual([]);
  });

  it('keeps the two agent field names apart, which is where the drift came from', () => {
    expect(interfaceFields(read(FRONTEND_CLIENT), 'StatusRegistryAgent')).toContain('agent_name');
    expect(interfaceFields(read(FRONTEND_CLIENT), 'CronHealth')).toContain('agent');
  });
});

describe('the base path reaches the backend', () => {
  it.each([
    ['../growthJourneyApi.ts', 'the status and handoff-move client'],
    ['../growthJourneyInspectApi.ts', 'the nine inspect reads'],
    ['../growthJourneyQueueApi.ts', 'the queue and experiments reads'],
    ['../growthJourneyControlsApi.ts', 'the only write client'],
    ['../growthJourneyPerformanceApi.ts', 'the performance reads'],
  ])('%s (%s) carries the /api prefix', (rel) => {
    // FIVE clients now reach this surface and every one needs the prefix. The
    // T615 split dropped the constant from a new file entirely, which tsc caught -
    // but a file with a WRONG prefix compiles fine and fails only in a browser, so
    // each one is pinned by name here rather than by whichever happened to exist
    // when this test was written.
    const src = read(path.resolve(__dirname, rel));
    const m = /const BASE = '([^']+)'/.exec(src);
    expect(m).not.toBeNull();
    expect(m![1].startsWith('/api/admin/growth-journey')).toBe(true);
  });

  it('carries the /api prefix nginx proxies, like every sibling admin service', () => {
    // The other half of the T613 defect, and the one no component test can see:
    // BASE was '/admin/growth-journey', which nginx (`location /api/`) does not
    // proxy and which is itself a React route, so every call returned index.html
    // with 200 OK. The backend serves '/api/admin/growth-journey'.
    const m = /const BASE = '([^']+)'/.exec(read(FRONTEND_CLIENT));
    expect(m).not.toBeNull();
    expect(m![1]).toBe('/api/admin/growth-journey');
  });

  it('and the backend serves exactly that prefix', () => {
    const routes = path.resolve(
      __dirname,
      '../../../../backend/src/routes/admin/growthJourneyRoutes.ts',
    );
    expect(fs.existsSync(routes)).toBe(true);
    expect(read(routes)).toContain("const BASE = '/api/admin/growth-journey'");
  });
});
