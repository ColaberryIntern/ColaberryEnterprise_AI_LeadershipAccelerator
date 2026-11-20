/**
 * INTEGRATION TEST: the client-email and client-call matching SQL, against a real Postgres.
 *
 * The unit suite mocks the query, so it cannot prove what the Phase 4 review found wrong in the
 * first version: substring matches (bob@gmail.com pulling in jimbob@gmail.com), a domain
 * pattern that could never match JSONB text, Cc never read, and calls without a transcript
 * stalling the sweep. Only the database can show the SQL does what it says.
 *
 * Runs in the CI integration tier (one fresh database per suite). It creates the two tables it
 * reads if they are missing, with only the columns the query uses, and deletes its own rows.
 * Never point it at production.
 */
export {};

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;
if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn('[enterpriseIntakeSync.integration] SKIPPED: no DATABASE_URL. The matching SQL is only proven against Postgres.');
}

describeIfDb('enterpriseIntakeSync matching SQL (requires DATABASE_URL)', () => {
  let sequelize: any;
  let sync: typeof import('../enterpriseIntakeSync');
  const OPENED = new Date('2026-11-20T15:00:00Z');
  const TAG = 'w31-integration';

  const intake = (email: string, over: Record<string, unknown> = {}) =>
    ({ id: 'i-int', email, createdAt: OPENED, lead_id: 990001, call_id: 'call_intake', comms_calls_posted: null, ...over }) as any;

  async function email(row: { from: string; to?: unknown; cc?: unknown; provider?: string; received?: Date; synced?: Date; subject?: string }) {
    await sequelize.query(
      `INSERT INTO inbox_emails (id, provider, provider_message_id, from_address, from_name, to_addresses, cc_addresses, subject, body_text, received_at, synced_at)
       VALUES (gen_random_uuid(), :provider, :pmid, :from, NULL, CAST(:to AS jsonb), CAST(:cc AS jsonb), :subject, 'body', :received, :synced)`,
      {
        replacements: {
          provider: row.provider || 'gmail_colaberry',
          pmid: `${TAG}-${Math.random()}`,
          from: row.from,
          to: JSON.stringify(row.to ?? []),
          cc: JSON.stringify(row.cc ?? []),
          subject: row.subject || TAG,
          received: row.received || new Date('2026-11-20T16:00:00Z'),
          synced: row.synced || new Date('2026-11-20T16:01:00Z'),
        },
      },
    );
  }

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    await sequelize.query('CREATE EXTENSION IF NOT EXISTS pgcrypto');
    await sequelize.query(`CREATE TABLE IF NOT EXISTS inbox_emails (
      id uuid PRIMARY KEY, provider text NOT NULL, provider_message_id text, provider_thread_id text,
      from_address text NOT NULL, from_name text, to_addresses jsonb, cc_addresses jsonb, subject text,
      body_text text, body_html text, headers jsonb, received_at timestamptz NOT NULL, synced_at timestamptz NOT NULL DEFAULT now(),
      has_attachments boolean DEFAULT false)`);
    await sequelize.query(`CREATE TABLE IF NOT EXISTS communication_logs (
      id serial PRIMARY KEY, lead_id integer, channel text, provider_message_id text, provider_response jsonb,
      created_at timestamptz NOT NULL DEFAULT now())`);
    sync = await import('../enterpriseIntakeSync');
  });

  afterEach(async () => {
    await sequelize.query('DELETE FROM inbox_emails WHERE provider_message_id LIKE :t', { replacements: { t: `${TAG}-%` } });
    await sequelize.query('DELETE FROM communication_logs WHERE lead_id = 990001');
  });

  afterAll(async () => {
    await sequelize.close();
  });

  it('matches the exact address as sender, To (objects or bare strings) and Cc; never a substring', async () => {
    await email({ from: 'bob@gmail.com', subject: 'from client' });
    await email({ from: 'ali@colaberry.com', to: [{ address: 'Bob@Gmail.com', name: 'Bob' }], subject: 'to client' });
    await email({ from: 'ali@colaberry.com', to: ['bob@gmail.com'], subject: 'to client, bare string' });
    await email({ from: 'ali@colaberry.com', to: [{ address: 'x@y.com' }], cc: [{ address: 'bob@gmail.com' }], subject: 'cc client' });
    await email({ from: 'jimbob@gmail.com', subject: 'NOT the client: a longer address' });
    await email({ from: 'ali@colaberry.com', to: [{ address: 'bob@gmail.com.au' }], subject: 'NOT the client: a longer domain' });
    await email({ from: 'b_b@gmail.com', subject: 'NOT the client: underscore is not a wildcard' });
    await email({ from: 'bob@gmail.com', provider: 'gmail_personal', subject: 'NOT read: personal mailbox' });
    await email({ from: 'bob@gmail.com', received: new Date('2026-11-19T10:00:00Z'), subject: 'NOT read: before the form' });
    const subjects = (await sync.emailTouches(intake('bob@gmail.com'), new Date(0))).map((t) => t.subject).sort();
    expect(subjects).toEqual(['cc client', 'from client', 'to client', 'to client, bare string']);
  });

  it('matches the company domain exactly (not for webmail), including outbound to colleagues', async () => {
    await email({ from: 'ali@colaberry.com', to: [{ address: 'cfo@acme-int.test' }], subject: 'to a colleague' });
    await email({ from: 'ops@acme-int.test', subject: 'from a colleague' });
    await email({ from: 'x@notacme-int.test', subject: 'NOT: a longer domain' });
    await email({ from: 'x@acme-int.testing.com', subject: 'NOT: a domain prefix' });
    const subjects = (await sync.emailTouches(intake('dana@acme-int.test'), new Date(0))).map((t) => t.subject).sort();
    expect(subjects).toEqual(['from a colleague', 'to a colleague']);
  });

  it('watermarks on synced_at, so a late-mirrored email with an older date is still seen', async () => {
    await email({ from: 'bob@gmail.com', received: new Date('2026-11-20T16:00:00Z'), synced: new Date('2026-11-21T09:00:00Z'), subject: 'late' });
    const t = await sync.emailTouches(intake('bob@gmail.com'), new Date('2026-11-21T08:00:00Z'));
    expect(t.map((x) => x.subject)).toEqual(['late']);
  });

  it('leaves a tied group for the next run when the page limit cuts through it', async () => {
    const tie = new Date('2026-11-20T17:00:00Z');
    await email({ from: 'bob@gmail.com', synced: new Date('2026-11-20T16:59:00Z'), subject: 'first' });
    await email({ from: 'bob@gmail.com', synced: tie, subject: 'tied 1' });
    await email({ from: 'bob@gmail.com', synced: tie, subject: 'tied 2' });
    const t = await sync.emailTouches(intake('bob@gmail.com'), new Date(0), 2);
    expect(t.map((x) => x.subject)).toEqual(['first']);
  });

  it('calls: only ones with a transcript, never the intake call, and a no-transcript call never blocks a later one', async () => {
    for (let n = 0; n < 12; n++) {
      await sequelize.query(
        `INSERT INTO communication_logs (lead_id, channel, provider_message_id, provider_response, created_at)
         VALUES (990001, 'voice', :id, '{"call_status":"no-answer"}'::jsonb, :at)`,
        { replacements: { id: `nt-${n}`, at: new Date(OPENED.getTime() + (n + 1) * 60_000) } },
      );
    }
    await sequelize.query(
      `INSERT INTO communication_logs (lead_id, channel, provider_message_id, provider_response, created_at) VALUES
       (990001, 'voice', 'call_intake', '{"transcript":"the intake"}'::jsonb, :a),
       (990001, 'voice', 'call_later', '{"transcript":"bot: hi\\nhuman: we signed the NDA"}'::jsonb, :b)`,
      { replacements: { a: new Date(OPENED.getTime() + 30 * 60_000), b: new Date(OPENED.getTime() + 40 * 60_000) } },
    );
    const t = await sync.callTouches(intake('bob@gmail.com'));
    expect(t.map((x) => x.ref)).toEqual(['call_later']);
    expect(await sync.callTouches(intake('bob@gmail.com', { comms_calls_posted: ['call_later'] }))).toEqual([]);
  });
});
