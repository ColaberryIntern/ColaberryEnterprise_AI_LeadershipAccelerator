/**
 * CP9.1 against a REAL Postgres (the integration tier): the consent gate's statements (the row lock, the consent insert,
 * the turn-on claim, the finish and read-back writes, the review item and the daily escalation row) run as written, on
 * the real placement schema, under real concurrency.
 *   DATABASE_URL=postgres://... npx jest -c jest.config.ts roomService.integration
 * Without DATABASE_URL it SKIPS, loudly. Never point it at production: it creates and drops tables.
 * The meeting provider is a stand-in (no Zoom call is ever made); it records every recording change.
 */
export {};
const mockSets: string[] = [];
const mockScopes = { ok: true, missing: [] as string[], reason: 'ok' };
jest.mock('../roomProvider', () => ({ roomProvider: {
  canSetRecording: async () => mockScopes,
  setRecording: async (m: string, mode: string) => { await new Promise((r) => setTimeout(r, 20)); mockSets.push(`${m}:${mode}`); },
  recording: async (m: string) => (mockSets.includes(`${m}:cl${'oud'}`) ? 'on' : 'off'),
} }));

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[roomService.integration] SKIPPED: no DATABASE_URL. See the header.');
}

jest.setTimeout(120_000);

describeIfDb('the room consent gate against Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let schema: typeof import('../../../db/ensurePlacementSchema');
  let room: typeof import('../roomService');
  let pre: typeof import('../zoomScopePreflight');
  const E1 = '7eeeeeee-eeee-4eee-8eee-eeeeeeeeeeee';
  const START = new Date('2026-11-23T15:00:00Z');
  const AT = new Date(START.getTime() - 5 * 60_000);
  const CAND = { party: 'candidate' as const, enrollmentId: E1 };
  const EMP = { party: 'employer' as const, endMs: START.getTime() + 30 * 60_000 };
  const one = async (sql: string): Promise<Record<string, unknown>> => ((await sequelize.query(sql))[0] as Array<Record<string, unknown>>)[0];
  let n = 0;
  async function interview(): Promise<string> {
    n += 1;
    const r = await one(`INSERT INTO placement_interviews (enrollment_id, source_event_id, company, state, starts_at, minutes, room_provider_id, room_url, readback_meeting_id, readback_recording)
      VALUES ('${E1}', 'room:${n}', 'Acme', 'booked', '${START.toISOString()}', 30, 'zm-${n}', 'https://zoom.example/j/SECRET', 'zm-${n}', 'off') RETURNING id`);
    return String(r.id);
  }

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    schema = await import('../../../db/ensurePlacementSchema');
    room = await import('../roomService');
    pre = await import('../zoomScopePreflight');
    jest.spyOn(console, 'log').mockImplementation(() => undefined);
    jest.spyOn(console, 'error').mockImplementation(() => undefined);
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
  beforeEach(() => { mockSets.length = 0; Object.assign(mockScopes, { ok: true, missing: [], reason: 'ok' }); });

  it('both parties consent at the same moment: the row lock makes each see the other, recording ON exactly once', async () => {
    const id = await interview();
    await Promise.all([room.decide(CAND, id, 'consent', AT), room.decide(EMP, id, 'consent', AT)]);
    expect(mockSets).toEqual([`zm-${n}:cl${'oud'}`]);
    expect(await one(`SELECT recording_consent, recording_meeting_id, readback_recording FROM placement_interviews WHERE id = '${id}'`))
      .toEqual({ recording_consent: 'on', recording_meeting_id: `zm-${n}`, readback_recording: 'on' });
  });
  it('a double-submitted decision makes one consent row (the first stands) and one change', async () => {
    const id = await interview();
    await room.decide(CAND, id, 'consent', AT);
    await Promise.all([room.decide(EMP, id, 'consent', AT), room.decide(EMP, id, 'decline', AT), room.decide(EMP, id, 'consent', AT)]);
    expect((await one(`SELECT COUNT(*)::int AS c FROM interview_consents WHERE interview_id = '${id}'`)).c).toBe(2);
    const first = String((await one(`SELECT decision FROM interview_consents WHERE interview_id = '${id}' AND party = 'employer'`)).decision);
    expect(mockSets).toHaveLength(first === 'consent' ? 1 : 0);
  });
  it('a decline stores the flag; the view gives the decider the link, unrecorded', async () => {
    const id = await interview();
    await room.decide(CAND, id, 'decline', AT);
    await room.decide(EMP, id, 'consent', AT);
    expect(mockSets).toHaveLength(0);
    const r = await room.openRoom(EMP, id, AT);
    expect(r.status === 'ok' && r.view).toMatchObject({ recording: { status: 'declined' }, join: { status: 'ready' } });
  });
  it('recording on without consent: no link, and ONE review item the CHECK accepts, however often it is opened', async () => {
    const id = await interview();
    await sequelize.query(`UPDATE placement_interviews SET readback_recording = 'on' WHERE id = '${id}'`);
    await room.decide(CAND, id, 'consent', AT);
    const a = await room.openRoom(CAND, id, AT);
    await room.openRoom(CAND, id, AT);
    expect(a.status === 'ok' && a.view.join).toMatchObject({ status: 'withheld', url: null });
    expect((await one(`SELECT COUNT(*)::int AS c FROM placement_review_items WHERE kind = 'recording_mismatch' AND interview_id = '${id}'`)).c).toBe(1);
  });
  it('scope missing: unavailable for both interviews, one escalation event for the day even when they race', async () => {
    Object.assign(mockScopes, { ok: false, missing: ['meeting:update:meeting:admin'], reason: 'missing' });
    const [a, b] = [await interview(), await interview()];
    await Promise.all([room.decide(CAND, a, 'consent', AT), room.decide(CAND, b, 'consent', AT)]);
    await Promise.all([room.decide(EMP, a, 'consent', AT), room.decide(EMP, b, 'consent', AT), pre.escalateScopeMissing(['meeting:update:meeting:admin'], AT)]);
    expect(mockSets).toHaveLength(0);
    expect((await one(`SELECT COUNT(*)::int AS c FROM placement_interviews WHERE id IN ('${a}', '${b}') AND recording_consent = 'unavailable'`)).c).toBe(2);
    expect((await one("SELECT COUNT(*)::int AS c FROM placement_events WHERE event = 'zoom_scope_missing'")).c).toBe(1);
  });
  it('a claim left pending past the lease is claimed again by the next view, once', async () => {
    const id = await interview();
    await room.decide(CAND, id, 'consent', AT);
    await room.decide(EMP, id, 'consent', AT);
    await sequelize.query(`UPDATE placement_interviews SET recording_consent = 'pending', recording_changed_at = NOW() - INTERVAL '${room.PENDING_LEASE_SECONDS + 5} seconds' WHERE id = '${id}'`);
    await Promise.all([room.openRoom(CAND, id, AT), room.openRoom(EMP, id, AT)]);
    expect(mockSets).toHaveLength(2);
    expect((await one(`SELECT recording_consent FROM placement_interviews WHERE id = '${id}'`)).recording_consent).toBe('on');
  });
});
