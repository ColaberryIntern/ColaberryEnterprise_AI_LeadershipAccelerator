import { plan, apply, revert, planFor, SECTION } from '../grantAdmissionsOpsAccess';
import { GrantRefusedError, type MemberRow, type MemberStore } from '../grantCommsHubAccess';
import { effectiveSections } from '../../services/access/mgmtRoles';

/** Fake store with prod's shapes: Taiwo is lead_intake + {agents} (comms_hub removed 2026-11-22); a second, student
 *  account carries her name and must never be touched. */
function fakeStore(rows: MemberRow[]) {
  const data = new Map(rows.map((r) => [r.id, { ...r, mgmt_extra_sections: [...r.mgmt_extra_sections] }]));
  const writes: Array<[string, string[]]> = [];
  const store: MemberStore = {
    async findByEmail(email) { return [...data.values()].filter((r) => r.email === email); },
    async findById(id) { return data.get(id) ?? null; },
    async setExtras(id, extras) { writes.push([id, extras]); data.get(id)!.mgmt_extra_sections = [...extras]; },
  };
  return { store, data, writes };
}
const TAIWO: MemberRow = { id: 't1', email: 'taiwo@colaberry.com', role: 'staff', mgmt_role: 'lead_intake', mgmt_extra_sections: ['agents'] };
const TAIWO_STUDENT: MemberRow = { id: 't2', email: 'taiwo.abisola@gmail.com', role: 'student', mgmt_role: null, mgmt_extra_sections: [] };

describe('AO1.3 grantAdmissionsOpsAccess', () => {
  it('happy: Taiwo gains admissions_ops, keeps lead_intake + agents, and the section becomes effective', async () => {
    const { store, data } = fakeStore([TAIWO, TAIWO_STUDENT]);
    const steps = await plan(store);
    expect(steps.map((s) => [s.email, s.change])).toEqual([['taiwo@colaberry.com', true]]);
    await apply(store, steps);
    const t = data.get('t1')!;
    expect(t.mgmt_role).toBe('lead_intake');
    expect([...t.mgmt_extra_sections].sort()).toEqual(['admissions_ops', 'agents']);
    expect(effectiveSections(t.mgmt_role, t.mgmt_extra_sections)).toContain(SECTION);
    expect(data.get('t2')!.mgmt_extra_sections).toEqual([]);
  });

  it('idempotent: a second run plans no change and writes nothing', async () => {
    const { store, writes } = fakeStore([TAIWO]);
    await apply(store, await plan(store));
    const second = await plan(store);
    expect(second.every((s) => !s.change)).toBe(true);
    expect(await apply(store, second)).toEqual([]);
    expect(writes).toHaveLength(1);
  });

  it('boundary: already holding the section is a no-op', async () => {
    const { store } = fakeStore([{ ...TAIWO, mgmt_extra_sections: ['agents', 'admissions_ops'] }]);
    expect((await plan(store)).every((s) => !s.change)).toBe(true);
  });

  it('failure: missing member, student-only match, or no management role is refused, never created', async () => {
    await expect(plan(fakeStore([TAIWO_STUDENT]).store)).rejects.toThrow(GrantRefusedError);
    expect(() => planFor('taiwo.abisola@gmail.com', [TAIWO_STUDENT])).toThrow(/exactly one staff/);
    expect(() => planFor('x@colaberry.com', [{ ...TAIWO, mgmt_role: null }])).toThrow(/no management role/);
  });

  it('revert restores exactly the before-values, and refuses if extras changed since', async () => {
    const { store, data } = fakeStore([TAIWO]);
    const written = await apply(store, await plan(store));
    expect(await revert(store, written)).toEqual(['taiwo@colaberry.com']);
    expect(data.get('t1')!.mgmt_extra_sections).toEqual(['agents']);
    const again = await apply(store, await plan(store));
    data.get('t1')!.mgmt_extra_sections = ['agents', 'admissions_ops', 'placement'];
    await expect(revert(store, again)).rejects.toThrow(/changed since/);
  });
});
