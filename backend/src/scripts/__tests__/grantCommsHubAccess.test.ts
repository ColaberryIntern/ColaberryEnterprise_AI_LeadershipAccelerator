import { plan, apply, revert, planFor, GrantRefusedError, type MemberRow, type MemberStore } from '../grantCommsHubAccess';

/** A fake store seeded with prod's real shapes (read 2026-11-20): Jackie is already the organizer; Taiwo is
 *  lead_intake + {agents}; a second, student account carries Taiwo's name and must never be touched. */
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
const JACKIE: MemberRow = { id: 'j1', email: 'jackie@colaberry.com', role: 'staff', mgmt_role: 'community_organizer', mgmt_extra_sections: [] };
const TAIWO: MemberRow = { id: 't1', email: 'taiwo@colaberry.com', role: 'staff', mgmt_role: 'lead_intake', mgmt_extra_sections: ['agents'] };
const TAIWO_STUDENT: MemberRow = { id: 't2', email: 'taiwo.abisola@gmail.com', role: 'student', mgmt_role: null, mgmt_extra_sections: [] };

describe('CH1.2 grantCommsHubAccess', () => {
  it('happy: Jackie needs nothing; Taiwo gains comms_hub and keeps lead_intake + agents', async () => {
    const { store, data } = fakeStore([JACKIE, TAIWO, TAIWO_STUDENT]);
    const steps = await plan(store);
    expect(steps.map((s) => [s.email, s.change])).toEqual([['jackie@colaberry.com', false], ['taiwo@colaberry.com', true]]);
    await apply(store, steps);
    expect(data.get('t1')!.mgmt_role).toBe('lead_intake');
    expect([...data.get('t1')!.mgmt_extra_sections].sort()).toEqual(['agents', 'comms_hub']);
    expect(data.get('j1')!.mgmt_extra_sections).toEqual([]);
    expect(data.get('t2')!.mgmt_extra_sections).toEqual([]);
  });

  it('idempotent: a second run plans no change and writes nothing', async () => {
    const { store, writes } = fakeStore([JACKIE, TAIWO]);
    await apply(store, await plan(store));
    expect(writes).toHaveLength(1);
    const second = await plan(store);
    expect(second.every((s) => !s.change)).toBe(true);
    expect(await apply(store, second)).toEqual([]);
    expect(writes).toHaveLength(1);
  });

  it('boundary: Taiwo already holding comms_hub is a no-op', async () => {
    const { store } = fakeStore([JACKIE, { ...TAIWO, mgmt_extra_sections: ['agents', 'comms_hub'] }]);
    expect((await plan(store)).every((s) => !s.change)).toBe(true);
  });

  it('failure: a missing member, a non-staff-only match or a member with no role is refused, never created', async () => {
    await expect(plan(fakeStore([TAIWO]).store)).rejects.toThrow(GrantRefusedError);
    expect(() => planFor('taiwo.abisola@gmail.com', [TAIWO_STUDENT])).toThrow(/exactly one staff/);
    expect(() => planFor('x@colaberry.com', [{ ...TAIWO, mgmt_role: null }])).toThrow(/no management role/);
  });

  it('revert restores exactly the before-values, and refuses if extras changed since', async () => {
    const { store, data } = fakeStore([JACKIE, TAIWO]);
    const written = await apply(store, await plan(store));
    expect(await revert(store, written)).toEqual(['taiwo@colaberry.com']);
    expect(data.get('t1')!.mgmt_extra_sections).toEqual(['agents']);

    const again = await apply(store, await plan(store));
    data.get('t1')!.mgmt_extra_sections = ['agents', 'comms_hub', 'placement'];
    await expect(revert(store, again)).rejects.toThrow(/changed since/);
  });
});
