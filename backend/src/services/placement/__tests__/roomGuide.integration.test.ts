/**
 * CP9.1 against a REAL Postgres (the integration tier): the employer notes' statements (the interview row lock, the
 * replay read, the cap count and the insert ON CONFLICT on UNIQUE (interview_id, client_key)) run as written, on the
 * real placement schema, under real concurrency.
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts roomGuide.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 */
export {};
const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[roomGuide.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('the employer notes against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../../../db/ensurePlacementSchema');
  let guide: typeof import('../roomGuide');
  const E1 = '7fffffff-eeee-4eee-8eee-eeeeeeeeeeee';
  const START = new Date('2026-11-23T15:00:00Z');
  const END = START.getTime() + 30 * 60_000;
  const K = (n: number) => `aaaaaaaa-aaaa-4aaa-8aaa-${String(n).padStart(12, '0')}`;
  const one = async (sql: string): Promise<Record<string, unknown>> => ((await sequelize.query(sql))[0] as Array<Record<string, unknown>>)[0];
  let n = 0;
  async function interview(): Promise<string> {
    n += 1;
    const r = await one(`INSERT INTO placement_interviews (enrollment_id, source_event_id, company, position, state, starts_at, minutes, room_url)
      VALUES ('${E1}', 'guide:${n}', 'Acme', 'Data Analyst', 'booked', '${START.toISOString()}', 30, 'https://zoom.example/j/SECRET') RETURNING id`);
    return String(r.id);
  }
  const count = async (id: string) => Number((await one(`SELECT COUNT(*) AS n FROM interview_notes WHERE interview_id = '${id}'`)).n);

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    schema = await import('../../../db/ensurePlacementSchema');
    guide = await import('../roomGuide');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)');
    await sequelize.query(`INSERT INTO enrollments (id) VALUES ('${E1}') ON CONFLICT DO NOTHING`);
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await schema.ensurePlacementSchema();
  });
  afterAll(async () => {
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await sequelize.close();
  });

  it('the same Save sent twice at the same moment stores ONE note; one answer is the replay', async () => {
    const id = await interview();
    const [a, b] = await Promise.all([guide.addNote(id, END, K(1), 'Same words.'), guide.addNote(id, END, K(1), 'Same words.')]);
    expect(await count(id)).toBe(1);
    expect([a, b].map((x) => x.status === 'ok' && x.replay).sort()).toEqual([false, true]);
  });

  it('the database itself refuses a second row with the same key (UNIQUE (interview_id, client_key))', async () => {
    const id = await interview();
    await guide.addNote(id, END, K(2), 'first');
    // Sequelize wraps Postgres's unique violation (23505) as SequelizeUniqueConstraintError ("Validation error"); the
    // driver's own error names the constraint.
    const err = await sequelize.query(`INSERT INTO interview_notes (interview_id, client_key, body) VALUES ('${id}', '${K(2)}', 'again')`).then(() => null, (e: unknown) => e);
    expect(err).toMatchObject({ name: 'SequelizeUniqueConstraintError', parent: { code: '23505', constraint: 'uq_interview_notes_key' } });
    expect(await count(id)).toBe(1);
  });

  it('at the cap, two racing saves with different keys: exactly one is stored', async () => {
    const id = await interview();
    for (let i = 0; i < guide.MAX_NOTES - 1; i += 1) await guide.addNote(id, END, K(100 + i), `n${i}`);
    const [a, b] = await Promise.all([guide.addNote(id, END, K(1), 'last'), guide.addNote(id, END, K(2), 'one too many')]);
    expect([a.status, b.status].sort()).toEqual(['full', 'ok']);
    expect(await count(id)).toBe(guide.MAX_NOTES);
  });

  it('a link signed for an earlier time writes nothing; the guide lists notes oldest first', async () => {
    const id = await interview();
    expect(await guide.addNote(id, END - 60_000, K(3), 'x')).toEqual({ status: 'moved' });
    await guide.addNote(id, END, K(4), 'one');
    await guide.addNote(id, END, K(5), 'two');
    const g = await guide.employerGuide(id, END);
    expect(g.status === 'ok' && g.guide.notes.map((x) => x.body)).toEqual(['one', 'two']);
    expect(JSON.stringify(g)).not.toContain('zoom.example');
  });
});
