/**
 * CH10.2 on a real Postgres (scratch database): group sync is an upsert keyed on the provider's group id
 * (unique index), running it twice gives identical rows, a group no longer listed is kept and marked
 * left, enabled survives a sync, the id CHECK holds, and a provider failure mid-list writes nothing.
 *
 * Runs in CI's integration tier (scripts/ci/runIntegrationSuites.js). Locally:
 *   DATABASE_URL=postgres://chub@127.0.0.1:55452/postgres node scripts/ci/runIntegrationSuites.js --filter commsHub
 * NEVER point it at production: it creates and drops tables. No WhatsApp request is made: the provider is a stub.
 */
import { QueryTypes } from 'sequelize';
import type { ProviderGroup, WhatsAppProvider } from '../provider';

jest.setTimeout(120_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[commsHub whatsappGroups.integration] SKIPPED: no DATABASE_URL. Not evidence that group sync is idempotent in Postgres, unless it ran.');
}

describeIfDb('CH10.2 WhatsApp group sync, on a scratch Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let sync: typeof import('../whatsappGroups').syncWhatsAppGroups;
  let setEnabled: typeof import('../whatsappGroups').setGroupEnabled;
  const ME = '15550001234';
  const ACTOR = { id: 'u-jackie', label: 'jackie@colaberry.com' };
  const G = (n: number, o: Partial<ProviderGroup> = {}): ProviderGroup => ({
    id: `12036300000000000${n}@g.us`, name: `Group ${n}`, participants: [{ id: ME, rank: 'member' }], participants_count: 3,
    announcements: false, suspended: false, terminated: false, ...o,
  });
  const provider = (groups: ProviderGroup[], failAt?: number): WhatsAppProvider => ({
    listGroups: async (count: number, offset: number) => {
      if (offset === failAt) throw new Error('upstream down');
      return { groups: groups.slice(offset, offset + count), total: groups.length };
    },
  } as never);
  const conn = (groups: ProviderGroup[], failAt?: number) => ({ connection: { provider: provider(groups, failAt), number: ME } });
  const q = async <T extends object>(sql: string, bind: unknown[] = []): Promise<T[]> => sequelize.query<T>(sql, { bind, type: QueryTypes.SELECT });
  const snapshot = () => q<Record<string, unknown>>(
    `SELECT provider_group_id, name, participants_count, announcements, our_rank, suspended, terminated, left_at IS NOT NULL AS left, enabled, cant_send_reason
       FROM comms_hub_whatsapp_groups ORDER BY provider_group_id`);

  beforeAll(async () => {
    ({ sequelize } = await import('../../../../config/database'));
    const db = (await q<{ d: string }>('SELECT current_database() AS d'))[0].d;
    if (/prod/i.test(db)) throw new Error(`Refusing to run against ${db}`);
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await sequelize.query('CREATE TABLE IF NOT EXISTS community_events (id UUID PRIMARY KEY DEFAULT gen_random_uuid())');
    const { ensureCommsHubSchema } = await import('../../../../db/ensureCommsHubSchema');
    expect((await ensureCommsHubSchema()).missing).toEqual([]);
    ({ syncWhatsAppGroups: sync, setGroupEnabled: setEnabled } = await import('../whatsappGroups'));
  });
  beforeEach(async () => {
    await sequelize.query('DELETE FROM comms_hub_whatsapp_groups');
    await sequelize.query("DELETE FROM comms_hub_activity WHERE action LIKE 'whatsapp.%'");
  });
  afterAll(async () => { await sequelize.close(); });

  it('first sync adds every group NOT enabled; a second identical sync changes nothing', async () => {
    const groups = [G(1), G(2, { participants: [{ id: ME, rank: 'admin' }], announcements: true }), G(3, { participants: [] })];
    expect(await sync(ACTOR, conn(groups))).toEqual({ listed: 3, added: 3, left: 0 });
    const first = await snapshot();
    expect(first.map((r) => [r.our_rank, r.enabled])).toEqual([['member', false], ['admin', false], [null, false]]);
    expect(await sync(ACTOR, conn(groups))).toEqual({ listed: 3, added: 0, left: 0 });
    expect(await snapshot()).toEqual(first);
    expect((await q<{ n: number }>("SELECT count(*)::int n FROM comms_hub_activity WHERE action = 'whatsapp.groups_synced'"))[0].n).toBe(2);
  });

  it('a group no longer listed is kept, marked left and switched off; enabled survives on listed groups; a returning group needs a fresh opt-in', async () => {
    await sync(ACTOR, conn([G(1), G(2)]));
    const ids = await q<{ id: string; name: string }>('SELECT id, name FROM comms_hub_whatsapp_groups ORDER BY name');
    await setEnabled(ids[0].id, true, ACTOR);
    await setEnabled(ids[1].id, true, ACTOR);
    expect(await sync(ACTOR, conn([G(1, { name: 'Group 1 renamed' })]))).toEqual({ listed: 1, added: 0, left: 1 });
    const rows = await snapshot();
    expect(rows.map((r) => [r.name, r.left, r.enabled])).toEqual([['Group 1 renamed', false, true], ['Group 2', true, false]]);
    expect(await sync(ACTOR, conn([G(1), G(2)]))).toEqual({ listed: 2, added: 0, left: 0 });
    expect((await snapshot()).map((r) => [r.left, r.enabled])).toEqual([[false, true], [false, false]]);
  });

  it('a provider failure on a later page writes nothing at all', async () => {
    await sync(ACTOR, conn([G(1)]));
    const before = await snapshot();
    const many = Array.from({ length: 150 }, (_, i) => ({ ...G(1), id: `1203631${String(i).padStart(8, '0')}@g.us`, name: `Big ${i}` }));
    await expect(sync(ACTOR, conn(many, 100))).rejects.toThrow('upstream down');
    expect(await snapshot()).toEqual(before);
  });

  it('switching on a group that cannot be sent to is refused; the unique index and the id CHECK hold', async () => {
    await sync(ACTOR, conn([G(1, { announcements: true })]));
    const [g] = await q<{ id: string }>('SELECT id FROM comms_hub_whatsapp_groups');
    await expect(setEnabled(g.id, true, ACTOR)).rejects.toMatchObject({ name: 'GroupNotSendable' });
    await expect(sequelize.query("INSERT INTO comms_hub_whatsapp_groups (provider_group_id, name) VALUES ('120363000000000001@g.us', 'dup')")).rejects.toMatchObject({ name: 'SequelizeUniqueConstraintError' });
    await expect(sequelize.query("INSERT INTO comms_hub_whatsapp_groups (provider_group_id, name) VALUES ('15551234567@s.whatsapp.net', 'not a group')")).rejects.toThrow(/check/i);
  });

  it('two syncs at once end in the same rows as one (advisory lock plus upsert)', async () => {
    const groups = [G(1), G(2), G(3)];
    await Promise.all([sync(ACTOR, conn(groups)), sync(ACTOR, conn(groups))]);
    expect((await snapshot()).length).toBe(3);
  });
});
