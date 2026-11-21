/**
 * CP8.1 against a REAL Postgres (the integration tier): two CONCURRENT dispatches of one interview event make one
 * interview and one event row (UNIQUE source_event_id, and the row lock for updates); the state CHECK refuses junk.
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts interviewIngest.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[interviewIngest.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('placement interview ingestion against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../../../db/ensurePlacementSchema');
  let ingest: typeof import('../interviewIngest');
  let shape: typeof import('../inboxEventSchema');
  const E1 = '7bbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb';
  const count = async (sql: string): Promise<number> => (((await sequelize.query(sql))[0] as Array<{ n: number }>)[0]).n;
  const ev = (over: Record<string, unknown> = {}) => shape.InboxEventSchema.parse({ event_id: 'evt-1', message_id: '<m1@acme.example>', type: 'interview.detected',
    to_address: 'ann.lee.careers@gmail.com', received_at: '2026-11-21T18:00:00Z', company: 'Acme', sub_type: 'Phone Screen', confidence: 0.97, ...over });

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    schema = await import('../../../db/ensurePlacementSchema');
    ingest = await import('../interviewIngest');
    shape = await import('../inboxEventSchema');
    for (const k of ['log', 'warn'] as const) jest.spyOn(console, k).mockImplementation(() => undefined);
    await sequelize.query('CREATE TABLE IF NOT EXISTS enrollments (id UUID PRIMARY KEY)');
    await sequelize.query(`INSERT INTO enrollments (id) VALUES ('${E1}') ON CONFLICT DO NOTHING`);
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await schema.ensurePlacementSchema();
    await sequelize.query(`INSERT INTO job_search_inboxes (enrollment_id, address, mailbox) VALUES ('${E1}', 'ann.lee.careers@gmail.com', 'annleecareers@gmail.com')`);
  });
  afterAll(async () => {
    for (const sql of schema.PLACEMENT_SCHEMA_ROLLBACK) await sequelize.query(sql);
    await sequelize.close();
  });

  it('two concurrent detected dispatches: ONE interview, ONE event row', async () => {
    const both = await Promise.all([ingest.ingestInterviewEvent(ev()), ingest.ingestInterviewEvent(ev())]);
    expect(both.map((r) => r.status).sort()).toEqual(['duplicate', 'ingested']);
    expect(await count('SELECT COUNT(*)::int AS n FROM placement_interviews')).toBe(1);
    expect(await count("SELECT COUNT(*)::int AS n FROM placement_events WHERE event = 'detected'")).toBe(1);
  });

  it('two concurrent cancellations: ONE cancelled event, the second is a duplicate, no review item', async () => {
    await sequelize.query("UPDATE placement_interviews SET state = 'booked'");
    const cancel = ev({ type: 'interview.updated', message_id: '<c1@acme.example>', sub_type: 'Interview Cancelled' });
    const both = await Promise.all([ingest.ingestInterviewEvent(cancel), ingest.ingestInterviewEvent(cancel)]);
    expect(both.map((r) => r.status).sort()).toEqual(['duplicate', 'ingested']);
    expect(await count("SELECT COUNT(*)::int AS n FROM placement_events WHERE event = 'cancelled'")).toBe(1);
    expect(await count('SELECT COUNT(*)::int AS n FROM placement_review_items')).toBe(0);
  });

  it('two OPEN interviews at one company: a cancellation without a position changes neither, one ambiguous_update item', async () => {
    await ingest.ingestInterviewEvent(ev({ message_id: '<g1@globex.example>', company: 'Globex', position: 'Data Analyst' }));
    await ingest.ingestInterviewEvent(ev({ message_id: '<g2@globex.example>', company: 'Globex', position: 'Data Engineer' }));
    const cancel = ev({ type: 'interview.updated', message_id: '<gc@globex.example>', company: ' GLOBEX ', sub_type: 'Interview Cancelled' });
    expect(await ingest.ingestInterviewEvent(cancel)).toEqual({ status: 'review', kind: 'ambiguous_update' });
    expect(await count("SELECT COUNT(*)::int AS n FROM placement_interviews WHERE company = 'Globex' AND state = 'new'")).toBe(2);
    expect(await count("SELECT COUNT(*)::int AS n FROM placement_events WHERE source_event_id = 'interview.updated:<gc@globex.example>'")).toBe(0);
    expect(await count("SELECT COUNT(*)::int AS n FROM placement_review_items WHERE kind = 'ambiguous_update'")).toBe(1);
  });

  it('below 0.70: a review item, no interview; the state CHECK refuses an unknown state', async () => {
    expect(await ingest.ingestInterviewEvent(ev({ message_id: '<low@x>', confidence: 0.5 }))).toEqual({ status: 'review', kind: 'low_confidence' });
    expect(await count("SELECT COUNT(*)::int AS n FROM placement_interviews WHERE source_event_id = 'interview.detected:<low@x>'")).toBe(0);
    await expect(sequelize.query("UPDATE placement_interviews SET state = 'held'")).rejects.toThrow();
  });
});
