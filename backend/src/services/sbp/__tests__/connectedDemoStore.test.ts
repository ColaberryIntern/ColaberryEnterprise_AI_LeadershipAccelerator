/**
 * The Connected Demo producer: what it writes, what it refuses, and what it can never carry.
 *
 * The centrepiece is the WRITE-BOUNDARY SENTINEL. `demo_spec` has to be on the public route's
 * response allow-list for the feature to work, so it is the one field a response-side check is
 * structurally blind to. The sentinel test seeds EVERY column of `projects` with a unique value
 * and proves none of them reaches the persisted spec. It reads the column list out of the model
 * source rather than from a hand-written list, so a column added next year is seeded without
 * anyone remembering to, and the test fails closed instead of passing on a stale list.
 */
import { projectColumns as sharedProjectColumns } from '../../../models/__tests__/helpers/projectColumns';
import path from 'path';

jest.mock('../../../config/database', () => ({
  sequelize: { query: jest.fn() },
}));

/* eslint-disable @typescript-eslint/no-var-requires */
const { sequelize } = require('../../../config/database') as { sequelize: { query: jest.Mock } };
const {
  generateConnectedDemo,
  ConnectedDemoStoreError,
} = require('../connectedDemoStore') as typeof import('../connectedDemoStore');
const {
  buildConnectedDemoSpec,
  ConnectedDemoDataModelMissing,
} = require('../connectedDemoSpec') as typeof import('../connectedDemoSpec');
const { RESTRICTED_PROJECT_FIELDS } = require('../demoSpec/contentPolicy') as typeof import('../demoSpec/contentPolicy');
const { ACTION_LIFECYCLE } = require('../demoSpec/contract') as typeof import('../demoSpec/contract');

type Loose = Record<string, unknown>;

const PROJECT_ID = '11111111-2222-3333-4444-555555555555';

const DATA_MODEL = {
  app_name: 'Dispatch console',
  tables: [{ name: 'shift', columns: [{ name: 'id' }, { name: 'starts_at' }] }],
};

function plan(storyCount = 6): Loose {
  return {
    project_name: 'A project',
    descriptor: 'a descriptor',
    requirements: [],
    releases: [],
    stories: Array.from({ length: storyCount }, (_, i) => ({
      id: `STORY-${String(i + 1).padStart(3, '0')}`,
      release: 'R1',
      title: `Story ${i + 1} does a thing`,
      narrative: `As a user, I want thing ${i + 1}, so that outcome ${i + 1}.`,
      fulfills: [`REQ-${i + 1}`],
      owner_agent: 'agent.builder',
      acceptance: ['Given a thing', 'When it happens', 'Trust: it is logged'],
    })),
  };
}

function input(over: Loose = {}): Loose {
  return {
    projectId: PROJECT_ID,
    plan: plan(),
    dataModel: DATA_MODEL,
    planSha: 'a19f4c8d2b7e0000',
    planVersion: '3',
    generatedAt: '2026-11-21T09:00:00Z',
    ...over,
  };
}

/**
 * The column list, from the shared helper in models/__tests__/helpers.
 *
 * This file and demoRoutes.test.ts each had their own copy of this parse. When a verifier
 * found the copy here was missing four DDL-only columns plus the two Sequelize-managed
 * timestamps, fixing it left the other copy still blind. One helper, so a fix lands in both.
 */
const projectColumns = () =>
  sharedProjectColumns(
    path.resolve(__dirname, '../../../models'),
    path.resolve(__dirname, '../../../db'),
    expect as never,
  );

/** Wire the mock: SELECT returns `row`, UPDATE returns a token and a disabled flag. */
function mockDb(row: Loose, updateRow: Loose = { demo_share_token: 'existing-token', demo_share_enabled: false }) {
  sequelize.query.mockImplementation((sql: string) => {
    if (/^\s*SELECT/i.test(sql)) return Promise.resolve([row]);
    if (/^\s*UPDATE/i.test(sql)) return Promise.resolve([updateRow]);
    return Promise.resolve([]);
  });
}

/** A clean project row: every restricted field present and empty. */
function cleanRow(): Loose {
  const row: Loose = {};
  for (const f of RESTRICTED_PROJECT_FIELDS) row[f] = null;
  return row;
}

const sqlOf = (call: unknown[]) => String(call[0]);
const updateCalls = () => sequelize.query.mock.calls.filter((c: unknown[]) => /^\s*UPDATE/i.test(sqlOf(c)));
const selectCalls = () => sequelize.query.mock.calls.filter((c: unknown[]) => /^\s*SELECT/i.test(sqlOf(c)));

beforeEach(() => sequelize.query.mockReset());

describe('the happy path writes one row', () => {
  it('persists a valid spec and returns the token', async () => {
    mockDb(cleanRow());
    const result = await generateConnectedDemo(input() as never);
    expect(result.shareToken).toBe('existing-token');
    expect(result.eventCount).toBe(6);
    expect(updateCalls()).toHaveLength(1);
  });

  it('writes the spec as JSONB, and what it writes parses back to what it returned', async () => {
    mockDb(cleanRow());
    const result = await generateConnectedDemo(input() as never);
    const written = JSON.parse(String((updateCalls()[0][1] as Loose).replacements as never && ((updateCalls()[0][1] as { replacements: { spec: string } }).replacements.spec)));
    expect(written).toEqual(result.spec);
    expect(sqlOf(updateCalls()[0])).toContain('CAST(:spec AS JSONB)');
  });
});

describe('it does not publish, and cannot be edited into publishing by accident', () => {
  it('never names demo_share_enabled in the UPDATE', async () => {
    mockDb(cleanRow());
    await generateConnectedDemo(input() as never);
    const sql = sqlOf(updateCalls()[0]);
    // Absent from the statement entirely, which is stronger than setting it to its own value:
    // there is no expression here that a later edit could turn into a flip.
    expect(sql).not.toContain('demo_share_enabled =');
    expect(sql.slice(0, sql.indexOf('WHERE'))).not.toContain('demo_share_enabled');
  });

  it('reports the row\'s CURRENT enabled state rather than asserting one', async () => {
    mockDb(cleanRow(), { demo_share_token: 't', demo_share_enabled: true });
    const result = await generateConnectedDemo(input() as never);
    // A project somebody already published stays published; this module just says so.
    expect(result.shareEnabled).toBe(true);

    sequelize.query.mockReset();
    mockDb(cleanRow(), { demo_share_token: 't', demo_share_enabled: false });
    expect((await generateConnectedDemo(input() as never)).shareEnabled).toBe(false);
  });

  it('keeps an existing token across a regeneration, so a shared link keeps working', async () => {
    mockDb(cleanRow());
    await generateConnectedDemo(input() as never);
    expect(sqlOf(updateCalls()[0])).toContain('COALESCE(demo_share_token, :newToken)');
  });

  it('mints a 256-bit token, and a different one each time it is asked', async () => {
    mockDb(cleanRow());
    await generateConnectedDemo(input() as never);
    await generateConnectedDemo(input() as never);
    const minted = updateCalls().map(
      (c: unknown[]) => (c[1] as { replacements: { newToken: string } }).replacements.newToken,
    );
    expect(minted[0]).not.toBe(minted[1]);
    for (const t of minted) {
      expect(t).toMatch(/^[A-Za-z0-9_-]+$/); // base64url: safe in a path segment
      expect(Buffer.from(t, 'base64url')).toHaveLength(32);
    }
  });
});

describe('idempotency', () => {
  /*
   * "Updates ONE row" is a claim about the WHERE clause, and until now nothing tested it.
   *
   * A verifier mutated `WHERE id = :projectId` to `WHERE id IS NOT NULL` on both statements and
   * the whole suite stayed green. That mutation rewrites `demo_spec` on EVERY project in the
   * table, and content-checks the new spec against an arbitrary project's restricted values. It
   * is the single worst thing this module could do, and it was the one thing not asserted: the
   * existing tests counted CALLS, which is not the same as counting ROWS.
   */
  it('keys BOTH statements on the project id, which is what makes it one row', async () => {
    mockDb(cleanRow());
    await generateConnectedDemo(input() as never);

    for (const call of [selectCalls()[0], updateCalls()[0]]) {
      const sql = sqlOf(call);
      expect(sql).toContain('WHERE id = :projectId');
      // And the id actually bound is the one that was asked for, not some other row's.
      expect((call[1] as { replacements: { projectId: string } }).replacements.projectId).toBe(PROJECT_ID);
    }
  });

  it('running twice issues exactly one UPDATE per run and no INSERT', async () => {
    mockDb(cleanRow());
    await generateConnectedDemo(input() as never);
    await generateConnectedDemo(input() as never);
    expect(updateCalls()).toHaveLength(2);
    expect(sequelize.query.mock.calls.filter((c: unknown[]) => /INSERT/i.test(sqlOf(c)))).toHaveLength(0);
  });

  /*
   * The clock is moved between the two runs on purpose.
   *
   * The first version of this test just called the generator twice and compared. A mutation that
   * seeded the sequence from `Date.now()` instead of the plan sha SURVIVED it: both calls landed
   * inside the same millisecond, so the clock gave the same seed and the specs matched by luck.
   * A test that passes by luck on a fast machine is a test that fails on a slow one, and either
   * way it was not testing what it claimed. Forcing the clock apart makes the assertion exact:
   * the only way both specs can match is if the clock is not an input.
   */
  it('produces the SAME spec for the same plan even when the clock moves', async () => {
    mockDb(cleanRow());
    const now = jest.spyOn(Date, 'now');
    try {
      now.mockReturnValue(1_700_000_000_000);
      const a = await generateConnectedDemo(input() as never);
      now.mockReturnValue(1_900_000_000_000);
      const b = await generateConnectedDemo(input() as never);
      expect(JSON.stringify(a.spec)).toBe(JSON.stringify(b.spec));
    } finally {
      now.mockRestore();
    }
  });

  it('and a DIFFERENT spec for a different plan, so the test above is not vacuous', async () => {
    mockDb(cleanRow());
    const a = await generateConnectedDemo(input() as never);
    const b = await generateConnectedDemo(input({ plan: plan(3) }) as never);
    expect(JSON.stringify(a.spec)).not.toBe(JSON.stringify(b.spec));
  });
});

describe('it refuses, and writes NOTHING when it does', () => {
  it.each([
    ['an absent data model', undefined],
    ['a null data model', null],
    ['a data model with no tables', { tables: [] }],
    ['a data model that is an array', [{ name: 'shift' }]],
    ['a data model that is a string', 'command-center/data-model.json'],
  ])('refuses %s with ConnectedDemoDataModelMissing and issues no UPDATE', async (_l, dataModel) => {
    mockDb(cleanRow());
    await expect(generateConnectedDemo(input({ dataModel }) as never)).rejects.toThrow(
      ConnectedDemoStoreError,
    );
    await expect(generateConnectedDemo(input({ dataModel }) as never)).rejects.toMatchObject({
      error_class: 'ConnectedDemoDataModelMissing',
    });
    // The assertion that matters: nothing was written.
    expect(updateCalls()).toHaveLength(0);
  });

  it('refuses a spec carrying a restricted project value, and writes nothing', async () => {
    const row = cleanRow();
    // The app name comes from the data model, so this is the realistic leak: a student whose
    // data model names the organization.
    row.organization_name = 'Dispatch console';
    mockDb(row);
    await expect(generateConnectedDemo(input() as never)).rejects.toMatchObject({
      error_class: 'ConnectedDemoContentRefused',
    });
    expect(updateCalls()).toHaveLength(0);
  });

  it('refuses when the UPDATE itself matched nothing, rather than reporting success', async () => {
    // The row can vanish between the read and the write: another session archives or deletes the
    // project in that window. Returning a result with an empty token would tell the caller a demo
    // exists at a link that goes nowhere, which is worse than an error they can see.
    sequelize.query.mockImplementation((sql: string) => {
      if (/^\s*SELECT/i.test(sql)) return Promise.resolve([cleanRow()]);
      if (/^\s*UPDATE/i.test(sql)) return Promise.resolve([]); // matched no rows
      return Promise.resolve([]);
    });
    await expect(generateConnectedDemo(input() as never)).rejects.toMatchObject({
      error_class: 'ConnectedDemoProjectMissing',
    });
  });

  it('refuses when the project does not exist, before doing any generation work', async () => {
    sequelize.query.mockImplementation((sql: string) =>
      /^\s*SELECT/i.test(sql) ? Promise.resolve([]) : Promise.resolve([]));
    await expect(generateConnectedDemo(input() as never)).rejects.toMatchObject({
      error_class: 'ConnectedDemoProjectMissing',
    });
    expect(updateCalls()).toHaveLength(0);
  });

  it('accepts the input these refusals are measured against', async () => {
    mockDb(cleanRow());
    await expect(generateConnectedDemo(input() as never)).resolves.toBeDefined();
  });

  /*
   * The contract re-check, tested through the only door that can reach it.
   *
   * `buildConnectedDemoSpec` parses its own output, so on the normal path the store's re-check
   * can never fire, and a mutation that deleted it SURVIVED - correctly reporting a tripwire that
   * could not trip. The check is still worth keeping: it makes "an invalid spec is never
   * persisted" a property of this MODULE rather than of one collaborator's good behavior. So the
   * generator is replaced with one that returns something off-contract, which is exactly the
   * regression the check exists for.
   */
  it('refuses an off-contract spec even when the generator hands one over', async () => {
    jest.resetModules();
    jest.doMock('../connectedDemoSpec', () => ({
      ...jest.requireActual('../connectedDemoSpec'),
      buildConnectedDemoSpec: () => ({ schema_version: 2, environment: 'demo', app: {}, events: 'not an array' }),
    }));
    jest.doMock('../../../config/database', () => ({ sequelize: { query: jest.fn() } }));

    /* eslint-disable @typescript-eslint/no-var-requires */
    const db = require('../../../config/database') as { sequelize: { query: jest.Mock } };
    db.sequelize.query.mockImplementation((sql: string) =>
      /^\s*SELECT/i.test(sql) ? Promise.resolve([cleanRow()]) : Promise.resolve([{}]));
    const store = require('../connectedDemoStore') as typeof import('../connectedDemoStore');

    await expect(store.generateConnectedDemo(input() as never)).rejects.toMatchObject({
      error_class: 'ConnectedDemoSpecInvalid',
    });
    const writes = db.sequelize.query.mock.calls.filter((c: unknown[]) => /^\s*UPDATE/i.test(String(c[0])));
    expect(writes).toHaveLength(0);

    jest.dontMock('../connectedDemoSpec');
    jest.resetModules();
  });
});

describe('WRITE-BOUNDARY SENTINEL: no column of projects can reach demo_spec', () => {
  it('seeds every column with a unique value and finds none of them in the spec', async () => {
    const columns = projectColumns();
    const sentinels = new Map(columns.map((c, i) => [c, `SENTINEL-${i}-${c.toUpperCase()}-ZX9`]));

    // The SELECT returns a row where EVERY column carries its own sentinel, including columns
    // this module does not ask for. If a future change widens the read, the sentinel is already
    // sitting there waiting.
    const row: Loose = {};
    for (const [c, v] of sentinels) row[c] = v;
    mockDb(row);

    const result = await generateConnectedDemo(input() as never);
    const persisted = (updateCalls()[0][1] as { replacements: { spec: string } }).replacements.spec;

    for (const [column, sentinel] of sentinels) {
      expect({ column, found: persisted.includes(sentinel) }).toEqual({ column, found: false });
      expect(JSON.stringify(result.spec)).not.toContain(sentinel);
    }
  });

  it('and the sentinel really would be found if one got through, so the sweep is not vacuous', async () => {
    // The control. Without it, the test above would pass on an implementation that wrote `{}`.
    const row = cleanRow();
    mockDb(row);
    await generateConnectedDemo(input({ dataModel: { app_name: 'CANARY-ZX9', tables: [{ name: 't' }] } }) as never);
    const persisted = (updateCalls()[0][1] as { replacements: { spec: string } }).replacements.spec;
    expect(persisted).toContain('CANARY-ZX9');
  });

  it('the spec that actually got persisted passes contentPolicy, asserted positively', async () => {
    // Every other test here proves the REFUSAL direction. This one proves the accept direction
    // on the bytes that reached the database, so a path that bypasses the generator cannot write
    // a spec nobody ever vetted. One-way coverage is this repo's recurring bug.
    /* eslint-disable @typescript-eslint/no-var-requires */
    const { isDemoSpecContentClean } = require('../demoSpec/contentPolicy') as typeof import('../demoSpec/contentPolicy');
    const row = cleanRow();
    row.organization_name = 'Some Unrelated Organization';
    mockDb(row);
    await generateConnectedDemo(input() as never);
    const persisted = JSON.parse(
      (updateCalls()[0][1] as { replacements: { spec: string } }).replacements.spec,
    );
    const restricted: Record<string, string[]> = {};
    for (const f of RESTRICTED_PROJECT_FIELDS) restricted[f] = row[f] ? [String(row[f])] : [];
    expect(isDemoSpecContentClean(persisted, restricted)).toBe(true);
  });

  it('reads ONLY restricted columns, so widening the read is a visible change', async () => {
    mockDb(cleanRow());
    await generateConnectedDemo(input() as never);
    const select = sqlOf(selectCalls()[0]);
    const named = select
      .slice(select.indexOf('SELECT') + 6, select.indexOf('FROM'))
      .split(',')
      .map((s) => s.trim())
      .filter(Boolean);
    expect(named.sort()).toEqual([...RESTRICTED_PROJECT_FIELDS].sort());
  });

  it('finds a restricted value nested deep inside a JSONB column', async () => {
    // A verifier demonstrated a leak at 10 levels when the cap was 8. Build the nest
    // programmatically so this tests the cap rather than a hand-counted literal.
    let nested: unknown = 'Dispatch console';
    for (let i = 0; i < 20; i += 1) nested = { level: nested };
    const row = cleanRow();
    row.project_variables = nested;
    mockDb(row);
    await expect(generateConnectedDemo(input() as never)).rejects.toMatchObject({
      error_class: 'ConnectedDemoContentRefused',
    });
    expect(updateCalls()).toHaveLength(0);
  });

  it('still terminates on a value nested past the cap rather than hanging', async () => {
    let nested: unknown = 'Dispatch console';
    for (let i = 0; i < 200; i += 1) nested = { level: nested };
    const row = cleanRow();
    row.project_variables = nested;
    mockDb(row);
    // Past the cap it is no longer found, which is the documented trade. What must NOT happen is
    // a hang or a stack overflow on the write path.
    await expect(generateConnectedDemo(input() as never)).resolves.toBeDefined();
  });

  it('stringifies JSONB restricted columns, so a value nested in one is still searchable', async () => {
    const row = cleanRow();
    // `data_sources` is JSONB: as an object it would stringify to "[object Object]" and the
    // policy would search for that instead of for the value actually inside it.
    row.data_sources = { vendor: 'Dispatch console' };
    mockDb(row);
    await expect(generateConnectedDemo(input() as never)).rejects.toMatchObject({
      error_class: 'ConnectedDemoContentRefused',
    });
  });
});

describe('the generator itself', () => {
  it('throws ConnectedDemoDataModelMissing, the pure error, not the store error', () => {
    /*
     * Spread through the real input type rather than through `never`. `{ ...(x as never) }` is
     * not spreadable under TS 5.9 and the cast was hiding the shape rather than widening it;
     * naming the one field being made invalid is also what the test is actually about.
     */
    expect(() =>
      buildConnectedDemoSpec({ ...input(), dataModel: null } as unknown as Parameters<typeof buildConnectedDemoSpec>[0]),
    ).toThrow(ConnectedDemoDataModelMissing);
  });

  it('never shows a timeline where everything succeeded', () => {
    const spec = buildConnectedDemoSpec(input() as never);
    const states = new Set(spec.events.map((e) => e.status));
    // The demo the trust standard exists to prevent is the one where the system always works.
    expect(states.has('succeeded')).toBe(true);
    expect([...states].some((s) => s !== 'succeeded')).toBe(true);
    expect(spec.events.some((e) => e.status === 'failed' || e.status === 'reverted')).toBe(true);
  });

  it('only ever emits states the contract names', () => {
    const spec = buildConnectedDemoSpec(input({ plan: plan(20) }) as never);
    for (const e of spec.events) {
      expect(ACTION_LIFECYCLE as readonly string[]).toContain(e.status);
    }
  });

  it('marks every actor unverified, because a demo can verify nothing', () => {
    const spec = buildConnectedDemoSpec(input() as never);
    expect(spec.events.every((e) => e.actor.verified === false)).toBe(true);
    expect(spec.events.every((e) => !!e.human_owner_id)).toBe(true);
  });

  it('carries provenance, so the demo can say which plan produced it', () => {
    const spec = buildConnectedDemoSpec(input() as never);
    expect(spec.source?.plan_sha256).toBe('a19f4c8d2b7e0000');
    expect(spec.source?.plan_version).toBe('3');
    // The one field here that could identify anyone is deliberately absent.
    expect(spec.source?.project).toBeUndefined();
  });

  it('names the app from the data model, never from the plan', () => {
    const spec = buildConnectedDemoSpec(input() as never);
    expect(spec.app.name).toBe('Dispatch console');
    expect(spec.app.name).not.toContain('A project');
  });

  it('falls back to the primary table when the data model names no app', () => {
    const spec = buildConnectedDemoSpec(
      input({ dataModel: { tables: [{ name: 'work_order' }] } }) as never,
    );
    expect(spec.app.name).toBe('Work order console');
  });

  it('handles a plan with no usable stories without crashing', () => {
    const spec = buildConnectedDemoSpec(input({ plan: { ...plan(0) } }) as never);
    expect(spec.events).toEqual([]);
  });
});
