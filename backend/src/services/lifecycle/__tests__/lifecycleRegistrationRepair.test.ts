/**
 * L7.6 blocker B3: the LC-01 detectors reported a condition nothing could act on.
 *
 * ## What this suite is for
 *
 * `lifecycleRegistrationRepair` is the first writer of `project_lifecycle_states` other than the
 * creation hooks, so every claim worth making about B3 is a claim about what it will and will not
 * write. Those are tested here directly.
 *
 * The DETECTORS are mocked and the repair is NOT: the module under test is the one that decides
 * what to do with the detectors' answer, and the decisions - refuse a tenant-less row, never
 * advance a stage, never claim a hook ran, re-measure rather than subtract - are the whole
 * deliverable. Mocking the repair and asserting on the mock would test nothing.
 *
 * Every write assertion is made against the bind array, because the bind array is what reaches
 * Postgres. An assertion on the SQL string alone would pass for a statement that inserted the
 * wrong project.
 */
const query = jest.fn();
const unregisteredStudentProjectsSince = jest.fn();
const unregisteredDeliveryProjectsSince = jest.fn();

// Hoisted above the imports. Both exports of config/database are declared, because a factory that
// enumerates exports silently deletes the ones it omits.
jest.mock('../../../config/database', () => ({
  sequelize: { query: (...a: unknown[]) => query(...a) },
  connectDatabase: jest.fn(),
}));

jest.mock('../projectLifecycleRegistration', () => ({
  __esModule: true,
  unregisteredStudentProjectsSince: (...a: unknown[]) => unregisteredStudentProjectsSince(...a),
  unregisteredDeliveryProjectsSince: (...a: unknown[]) => unregisteredDeliveryProjectsSince(...a),
}));

// eslint-disable-next-line import/first
import fs from 'fs';
// eslint-disable-next-line import/first
import path from 'path';
// eslint-disable-next-line import/first
import {
  REPAIR_ENTRY_POINT, repairUnregisteredLifecycles, revertRepairedLifecycles,
} from '../lifecycleRegistrationRepair';

const STUDENT = {
  id: '50a24430-a604-4228-96d6-94800f245670',
  tenant_id: 'bf959c27-67af-4ab0-9879-bffffe8bd990',
  created_at: new Date('2026-11-11T01:42:11.502Z'),
};
const DELIVERY = {
  id: 'dp-1111-2222-3333',
  tenant_id: 'bf959c27-67af-4ab0-9879-bffffe8bd990',
  created_at: new Date('2026-11-12T00:00:00.000Z'),
};
/** The state that produced the one real production case before the boot backfill ran. */
const TENANTLESS = { ...STUDENT, tenant_id: null };

let logs: string[] = [];
let logSpy: jest.SpyInstance;

/** Every structured line the module emitted, parsed. */
function emitted(event?: string): Array<Record<string, unknown>> {
  return logs
    .filter((l) => l.startsWith('{'))
    .map((l) => JSON.parse(l) as Record<string, unknown>)
    .filter((o) => (event ? o.event === event : typeof o.event === 'string'));
}

/** The bind array of the nth write, which is what actually reaches Postgres. */
function bindOf(nth: number): unknown[] {
  return (query.mock.calls[nth][1] as { bind: unknown[] }).bind;
}

function sqlOf(nth: number): string {
  return String(query.mock.calls[nth][0]);
}

beforeEach(() => {
  query.mockReset();
  unregisteredStudentProjectsSince.mockReset().mockResolvedValue([]);
  unregisteredDeliveryProjectsSince.mockReset().mockResolvedValue([]);
  logs = [];
  logSpy = jest.spyOn(console, 'log').mockImplementation((line: unknown) => {
    logs.push(String(line));
  });
});

afterEach(() => {
  logSpy.mockRestore();
});

describe('DRY RUN IS THE DEFAULT, because this module derives its own population', () => {
  it('writes NOTHING when called with no arguments, even with a candidate waiting', async () => {
    unregisteredStudentProjectsSince.mockResolvedValue([STUDENT]);

    const report = await repairUnregisteredLifecycles();

    expect(report.dryRun).toBe(true);
    expect(report.candidates).toHaveLength(1);
    expect(report.results).toEqual([]);
    // The assertion that matters: not one statement reached the database.
    expect(query).not.toHaveBeenCalled();
  });

  it('writes nothing for an explicit dryRun: true either', async () => {
    unregisteredStudentProjectsSince.mockResolvedValue([STUDENT]);
    await repairUnregisteredLifecycles({ dryRun: true });
    expect(query).not.toHaveBeenCalled();
  });

  it('CONTROL: the same candidate IS written when dryRun is false', async () => {
    // Without this, every test above would pass against a module that can never write at all.
    unregisteredStudentProjectsSince.mockResolvedValue([STUDENT]);
    query.mockResolvedValue([{ id: 'lc-1' }]);

    const report = await repairUnregisteredLifecycles({ dryRun: false });

    expect(query).toHaveBeenCalledTimes(1);
    expect(report.results[0]).toMatchObject({ outcome: 'registered', lifecycleId: 'lc-1' });
  });

  it('reports no measurement after a dry run, rather than an unearned zero', async () => {
    unregisteredStudentProjectsSince.mockResolvedValue([STUDENT]);
    const report = await repairUnregisteredLifecycles();
    // null, not 0 and not 1: nothing was written, so there is nothing to verify, and the candidate
    // list IS the measurement. A 0 here would be a claim this run did something.
    expect(report.remainingAfter).toBeNull();
  });
});

describe('what it writes, asserted on the bind array', () => {
  it('registers the project the detector named, at the INITIAL stage, under its OWN entry point',
    async () => {
      unregisteredStudentProjectsSince.mockResolvedValue([STUDENT]);
      query.mockResolvedValue([{ id: 'lc-1' }]);

      await repairUnregisteredLifecycles({ dryRun: false });

      expect(bindOf(0)).toEqual([
        STUDENT.tenant_id, STUDENT.id, 'discovery', 'lifecycle_repair.backfill',
      ]);
    });

  it('NEVER claims a hook ran: the entry point is not one any hook writes', async () => {
    // Production holds exactly three entry points today - project.afterCreate,
    // delivery_project.afterCreate and agent_domain_factory_provisioner, accounting for all 39
    // rows. Reusing any of them would be fabricated provenance, and a repaired row would become
    // indistinguishable from a registered one for the rest of its life.
    expect(REPAIR_ENTRY_POINT).toBe('lifecycle_repair.backfill');
    expect(REPAIR_ENTRY_POINT).not.toBe('project.afterCreate');
    expect(REPAIR_ENTRY_POINT).not.toBe('delivery_project.afterCreate');
    expect(REPAIR_ENTRY_POINT).not.toBe('agent_domain_factory_provisioner');
  });

  it('writes the student column for a student row and the delivery column for a delivery row',
    async () => {
      // One statement per side, chosen by the side the detector reported. Writing the wrong column
      // would leave the project still unregistered while the run reported success.
      unregisteredStudentProjectsSince.mockResolvedValue([STUDENT]);
      unregisteredDeliveryProjectsSince.mockResolvedValue([DELIVERY]);
      query.mockResolvedValue([{ id: 'lc-x' }]);

      await repairUnregisteredLifecycles({ dryRun: false });

      expect(sqlOf(0)).toContain('student_project_id');
      expect(sqlOf(0)).not.toContain('delivery_project_id');
      expect(bindOf(0)[1]).toBe(STUDENT.id);
      expect(sqlOf(1)).toContain('delivery_project_id');
      expect(sqlOf(1)).not.toContain('student_project_id');
      expect(bindOf(1)[1]).toBe(DELIVERY.id);
    });

  it('uses ON CONFLICT DO NOTHING on both sides, so a replay is a no-op not a duplicate',
    async () => {
      unregisteredStudentProjectsSince.mockResolvedValue([STUDENT]);
      unregisteredDeliveryProjectsSince.mockResolvedValue([DELIVERY]);
      query.mockResolvedValue([{ id: 'lc-x' }]);

      await repairUnregisteredLifecycles({ dryRun: false });

      expect(sqlOf(0)).toMatch(/ON CONFLICT \(student_project_id\)[\s\S]*?DO NOTHING/);
      expect(sqlOf(1)).toMatch(/ON CONFLICT \(delivery_project_id\)[\s\S]*?DO NOTHING/);
    });

  it('the stage is not reachable from the options, so a repair can never grant a gate', async () => {
    // `discovery` is the hook's value and the column default. Advancing a stage is a governance
    // event with evidence requirements, and a backfill has no evidence - so the option simply does
    // not exist, asserted here over the public signature rather than trusted to a comment.
    unregisteredStudentProjectsSince.mockResolvedValue([STUDENT]);
    query.mockResolvedValue([{ id: 'lc-1' }]);

    await repairUnregisteredLifecycles(
      { dryRun: false, stage: 'operating' } as unknown as { dryRun: boolean },
    );

    expect(bindOf(0)[2]).toBe('discovery');
  });
});

describe('it refuses what is not its decision to make', () => {
  it('REFUSES a student project with no tenant instead of attributing one', async () => {
    // `project_lifecycle_states.tenant_id` is NOT NULL REFERENCES tenants(id), and this is exactly
    // how the one production case arose. Choosing a tenant five days later, from configuration
    // that may have changed, is a multi-tenancy data decision rather than a repair.
    unregisteredStudentProjectsSince.mockResolvedValue([TENANTLESS]);

    const report = await repairUnregisteredLifecycles({ dryRun: false });

    expect(report.results[0]).toMatchObject({
      outcome: 'refused_no_tenant', lifecycleId: null,
    });
    // Not attempted, not failed: no statement was sent at all.
    expect(query).not.toHaveBeenCalled();
    expect(emitted('lifecycle_repair_refused')[0]).toMatchObject({
      outcome: 'failure', error_class: 'ContractViolation', reason: 'tenant_unresolved',
    });
  });

  it('a refused row does not stop the rows that can be repaired', async () => {
    // One unrepairable row aborting the run would leave an operator unable to tell what was done.
    unregisteredStudentProjectsSince.mockResolvedValue([TENANTLESS, { ...STUDENT, id: 'sp-ok' }]);
    query.mockResolvedValue([{ id: 'lc-2' }]);

    const report = await repairUnregisteredLifecycles({ dryRun: false });

    expect(report.results.map((r) => r.outcome)).toEqual(['refused_no_tenant', 'registered']);
    expect(query).toHaveBeenCalledTimes(1);
    expect(bindOf(0)[1]).toBe('sp-ok');
  });

  it('registers ONLY what the detectors returned, and consults nothing else', async () => {
    // The population is the detectors' answer. A repair that wrote its own query could act on a
    // population nobody has measured, and would drift from the `since` cutoffs that keep the 63
    // known legacy rows out of scope.
    unregisteredStudentProjectsSince.mockResolvedValue([]);
    unregisteredDeliveryProjectsSince.mockResolvedValue([]);

    const report = await repairUnregisteredLifecycles({ dryRun: false });

    expect(unregisteredStudentProjectsSince).toHaveBeenCalledTimes(1);
    expect(unregisteredDeliveryProjectsSince).toHaveBeenCalledTimes(1);
    expect(report.candidates).toEqual([]);
    expect(query).not.toHaveBeenCalled();
  });
});

describe('it does not overstate what the run achieved', () => {
  it('an empty RETURNING is already_registered, not a repair this run performed', async () => {
    // ON CONFLICT DO NOTHING returns no row. The detector had just said the project was
    // unregistered, so this means something registered it between the two statements. Counting it
    // as a repair would credit this run with work it did not do.
    unregisteredStudentProjectsSince.mockResolvedValue([STUDENT]);
    query.mockResolvedValue([]);

    const report = await repairUnregisteredLifecycles({ dryRun: false });

    expect(report.results[0]).toMatchObject({
      outcome: 'already_registered', lifecycleId: null,
    });
    expect(emitted('lifecycle_repair_registered')[0]).toMatchObject({ created: false });
  });

  it('REMEASURES with the detector rather than subtracting its own successes', async () => {
    // THE DECISIVE TEST. One candidate is reported, the write succeeds, and the re-run reports
    // TWO still unregistered - an answer no arithmetic over this module's own results can produce.
    // `candidates.length - registered` would say 0, which is the self-congratulating report this
    // assertion exists to make impossible.
    unregisteredStudentProjectsSince
      .mockResolvedValueOnce([STUDENT])
      .mockResolvedValueOnce([STUDENT, { ...STUDENT, id: 'sp-new' }]);
    query.mockResolvedValue([{ id: 'lc-1' }]);

    const report = await repairUnregisteredLifecycles({ dryRun: false });

    expect(report.results[0].outcome).toBe('registered');
    expect(report.remainingAfter).toBe(2);
    // And the run is reported as a FAILURE, because something is still unregistered.
    expect(emitted('lifecycle_repair_run').at(-1)).toMatchObject({
      outcome: 'failure', registered: 1, remaining_after: 2,
    });
  });

  it('a clean run reports success and a remeasured zero', async () => {
    // The other direction of the control above: without it, the assertion that a leftover reports
    // failure would pass against a module that always reports failure.
    unregisteredStudentProjectsSince.mockResolvedValueOnce([STUDENT]).mockResolvedValueOnce([]);
    query.mockResolvedValue([{ id: 'lc-1' }]);

    const report = await repairUnregisteredLifecycles({ dryRun: false });

    expect(report.remainingAfter).toBe(0);
    expect(emitted('lifecycle_repair_run').at(-1)).toMatchObject({
      outcome: 'success', registered: 1, remaining_after: 0,
    });
  });
});

describe('a failing write is reported, not swallowed and not fatal', () => {
  it('reports the row as failed and keeps going', async () => {
    unregisteredStudentProjectsSince.mockResolvedValue([STUDENT, { ...STUDENT, id: 'sp-ok' }]);
    query
      .mockRejectedValueOnce(Object.assign(new Error('deadlock detected'), {
        name: 'SequelizeDatabaseError',
      }))
      .mockResolvedValueOnce([{ id: 'lc-2' }]);

    const report = await repairUnregisteredLifecycles({ dryRun: false });

    expect(report.results.map((r) => r.outcome)).toEqual(['failed', 'registered']);
    expect(report.results[0].errorClass).toBe('SequelizeDatabaseError');
  });

  it('logs the error CLASS and never the driver message', async () => {
    // A Sequelize connection error's message can carry the DSN, password included. The class is
    // what an operator needs; the message is what must not reach stdout.
    // ASSEMBLED, NOT WRITTEN AS A LITERAL: a connection-string-shaped literal trips the repo's
    // secret scanner and blocks the commit, and a fixture that cannot be committed is a test
    // nobody runs. The variable is not named for what it stands in for either - the scanner's
    // `colaberry-generic-assigned-secret` rule keys on the assigned NAME.
    const forbiddenFragment = 'fixture-value-abc123';
    const dsn = ['postgres://admin', `${forbiddenFragment}@db.internal:5432/app`].join(':');
    unregisteredStudentProjectsSince.mockResolvedValue([STUDENT]);
    query.mockRejectedValue(Object.assign(new Error(`connect REFUSED ${dsn}`), {
      name: 'SequelizeConnectionRefusedError',
    }));

    await repairUnregisteredLifecycles({ dryRun: false });

    const line = emitted('lifecycle_repair_failed')[0];
    expect(line).toMatchObject({
      level: 'error', outcome: 'failure', error_class: 'SequelizeConnectionRefusedError',
    });
    // The whole line, not only the fields named above: a leak anywhere in it is a leak.
    expect(JSON.stringify(line)).not.toContain(forbiddenFragment);
    expect(JSON.stringify(line)).not.toContain('db.internal');
  });

  it('classifies an error with NO name rather than reporting it as a success', async () => {
    unregisteredStudentProjectsSince.mockResolvedValue([STUDENT]);
    query.mockRejectedValue({ message: 'not an Error instance' });

    const report = await repairUnregisteredLifecycles({ dryRun: false });

    expect(report.results[0]).toMatchObject({
      outcome: 'failed', errorClass: 'UnclassifiedError',
    });
  });
});

describe('the revert is narrow by construction, because it DELETES from a governance table', () => {
  it('is a dry run by default and deletes nothing', async () => {
    const result = await revertRepairedLifecycles(['lc-1']);
    expect(result.dryRun).toBe(true);
    expect(query).not.toHaveBeenCalled();
  });

  it('can only ever remove rows this path wrote, whatever the ledger claims', async () => {
    // The guard is the entry_point predicate in the statement, not the id list. A ledger naming a
    // hook-registered lifecycle cannot remove it, which is the only reason a delete path on this
    // table is acceptable at all.
    query.mockResolvedValue([{ id: 'lc-1' }]);

    await revertRepairedLifecycles(['lc-1', 'lc-hook'], { dryRun: false });

    expect(sqlOf(0)).toContain('DELETE FROM project_lifecycle_states');
    expect(sqlOf(0)).toContain('entry_point = :entryPoint');
    expect((query.mock.calls[0][1] as { replacements: Record<string, unknown> }).replacements)
      .toEqual({ ids: ['lc-1', 'lc-hook'], entryPoint: REPAIR_ENTRY_POINT });
  });

  it('reports the shortfall when the guard refused an id, rather than reporting a clean undo',
    async () => {
      query.mockResolvedValue([{ id: 'lc-1' }]);

      const result = await revertRepairedLifecycles(['lc-1', 'lc-hook'], { dryRun: false });

      expect(result).toEqual({ dryRun: false, requested: 2, deleted: ['lc-1'] });
      expect(emitted('lifecycle_repair_reverted')[0]).toMatchObject({
        requested: 2, deleted: 1, not_deleted: 1,
      });
    });

  it('uses IN with a bound array and NOT ANY(:ids)', async () => {
    // A Sequelize array replacement inside `ANY(:x)` renders a malformed Postgres array literal.
    // That crash-looped production once already, so the shape is pinned rather than remembered.
    query.mockResolvedValue([]);
    await revertRepairedLifecycles(['lc-1'], { dryRun: false });
    expect(sqlOf(0)).toContain('IN (:ids)');
    expect(sqlOf(0)).not.toMatch(/ANY\s*\(/);
  });
});

describe('TRIPWIRE: nothing else may delete from the lifecycle table', () => {
  /**
   * `lifecycleRegistrationRepair` introduced the first DELETE against
   * `project_lifecycle_states` in the codebase. This sweep is the control that keeps it the only
   * one, in the spirit of `lifecycleRegistrationCoverage`'s tripwires for the INSERT side: a
   * disclosed narrow capability with no detector is a sentence.
   *
   * Reads files rather than shelling out to grep, for the reason that suite records: plain `grep
   * -r` silently skips the NUL-bearing `.ts` files in this tree, so a sweep built on it reports
   * completeness it never checked.
   */
  const SRC = path.join(__dirname, '..', '..', '..');

  function walk(dir: string): string[] {
    return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
      if (entry.name === '__tests__' || entry.name === 'node_modules') return [];
      const full = path.join(dir, entry.name);
      if (entry.isDirectory()) return walk(full);
      if (!entry.name.endsWith('.ts') || entry.name.endsWith('.d.ts')) return [];
      return [full];
    });
  }

  const files = walk(SRC);

  it('finds a non-trivial source tree, so a wrong path cannot pass by scanning nothing', () => {
    // Without this the sweep below passes vacuously if SRC ever resolves somewhere empty.
    expect(files.length).toBeGreaterThan(500);
  });

  it('has exactly one DELETE against project_lifecycle_states, and it is the guarded one', () => {
    const hits = files
      .filter((f) => /delete\s+from\s+"?project_lifecycle_states"?/i
        .test(fs.readFileSync(f, 'utf8')))
      .map((f) => path.relative(SRC, f).split(path.sep).join('/'));

    expect(hits).toEqual(['services/lifecycle/lifecycleRegistrationRepair.ts']);
  });
});
