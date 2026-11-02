/**
 * The Zoom host registry against REAL Postgres: re-registering a host preserves it,
 * disabling one preserves its purpose, and the pool partitions by purpose.
 *
 * ## Why this suite exists
 *
 * `registerHost` is an upsert whose whole correctness is in its ON CONFLICT clause,
 * and a mocked `query` cannot judge that clause: it records the SQL as a string and
 * returns whatever the mock was told to. It cannot report that `COALESCE(:purpose,
 * zoom_hosts.purpose)` preserves and `purpose = EXCLUDED.purpose` destroys, because
 * the difference only exists once Postgres evaluates it. The same goes for the
 * `::varchar` / `::integer` / `::boolean` casts, which exist so a NULL replacement has
 * a resolvable type — a mock type-deduces nothing and would pass either way.
 *
 * ## What was wrong, and is pinned here
 *
 * Every column was assigned from the incoming row, so the natural way to change one
 * field — `register a@b.com --purpose=room` — also cleared that host's label, priority
 * and credential_ref. And `disable` was implemented as `registerHost({ enabled: false
 * })`, so parking a host for an afternoon reset its PURPOSE to `any`: it came back
 * matched by both the room allocator and the rehearsal allocator, which is the
 * collision the purpose split exists to prevent, arriving silently.
 *
 * ## The controls
 *
 * Two tests run the OLD statements against the same table and assert they DO destroy
 * the fields. Without them, "the label survived" is unfalsifiable — a test that writes
 * a label and reads it back passes against an upsert that never touched it. The
 * controls prove this suite can tell the two versions apart.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────
 *
 *   docker run --rm -d --name zoomhosts-pg-test -p 55438:5432 \
 *     -e POSTGRES_PASSWORD=test -e POSTGRES_USER=test -e POSTGRES_DB=zoomhosts_test \
 *     postgres:16-alpine
 *
 *   # from backend/, once pg_isready reports "accepting connections":
 *   DATABASE_URL=postgres://test:test@127.0.0.1:55438/zoomhosts_test \
 *     npx jest -c jest.config.ts src/services/zoom/__tests__/zoomHostRegistry.integration
 *
 *   docker rm -f zoomhosts-pg-test
 *
 * Port 55438: 55433-55437 belong to the agent-domain, stale-claim, lease, execution-run
 * and room-outbox suites, so all six can run at once. Throwaway credentials, one run,
 * nothing persists. With no `DATABASE_URL` the suite SKIPS AND SAYS SO.
 *
 * It must never be pointed at production: it creates `zoom_hosts` from the real schema
 * bootstrap and deletes every row in it between tests.
 */

jest.setTimeout(120_000);

const HAS_DB = Boolean(process.env.DATABASE_URL);
const describeIfDb = HAS_DB ? describe : describe.skip;

if (!HAS_DB) {
  // eslint-disable-next-line no-console
  console.warn(
    '[zoomHostRegistry.integration] SKIPPED: no DATABASE_URL. This suite needs a real '
    + 'Postgres; the docblock has the one-line docker run and the exact command. It is NOT '
    + 'evidence that re-registering a host preserves its purpose, nor that disabling one '
    + 'keeps it, unless it ran.',
  );
}

interface Row {
  host_email: string;
  label: string | null;
  purpose: string;
  priority: number;
  credential_ref: string | null;
  enabled: boolean;
  verified_at: Date | null;
}

describeIfDb('the Zoom host registry, against real Postgres', () => {
  let sequelize: import('sequelize').Sequelize;
  let registry: typeof import('../zoomHostRegistry');

  const EMAIL = 'host-one@example.test';

  beforeAll(async () => {
    ({ sequelize } = await import('../../../config/database'));
    // From the real bootstrap, so the table and its UNIQUE LOWER(host_email) index are
    // the ones production has. A hand-written CREATE TABLE here could pass while the
    // deployed shape rejected the same write.
    const { ensureZoomHostSchema } = await import('../../../db/ensureZoomHostSchema');
    await ensureZoomHostSchema();
    registry = await import('../zoomHostRegistry');
  });

  afterAll(async () => {
    await sequelize.query('DROP TABLE IF EXISTS zoom_hosts');
    await sequelize.close();
  });

  beforeEach(async () => {
    await sequelize.query('DELETE FROM zoom_hosts');
  });

  async function read(email = EMAIL): Promise<Row> {
    const [rows] = await sequelize.query(
      `SELECT host_email, label, purpose, priority, credential_ref, enabled, verified_at
         FROM zoom_hosts WHERE LOWER(host_email) = LOWER(:email)`,
      { replacements: { email } },
    ) as [Row[], unknown];
    if (!rows.length) throw new Error(`no row for ${email}`);
    return rows[0];
  }

  /** Marks a host proved, which is the only state the allocator will draw from. */
  async function markVerified(email: string): Promise<void> {
    await sequelize.query(
      'UPDATE zoom_hosts SET verified_at = NOW() WHERE LOWER(host_email) = LOWER(:email)',
      { replacements: { email } },
    );
  }

  describe('a new host', () => {
    it('takes the documented defaults when only an address is given', async () => {
      await registry.registerHost({ hostEmail: EMAIL });
      expect(await read()).toMatchObject({
        host_email: EMAIL, label: null, purpose: 'any', priority: 100,
        credential_ref: null, enabled: true, verified_at: null,
      });
    });

    it('is stored lowercased, so the unique index cannot be defeated by casing', async () => {
      await registry.registerHost({ hostEmail: 'MiXeD@Example.Test' });
      const [rows] = await sequelize.query('SELECT host_email FROM zoom_hosts') as [Row[], unknown];
      expect(rows.map((r) => r.host_email)).toEqual(['mixed@example.test']);
    });

    it('is NOT allocatable until it is verified', async () => {
      await registry.registerHost({ hostEmail: EMAIL, purpose: 'room' });
      expect(await registry.allocatableHostEmails('room')).toEqual([]);
      await markVerified(EMAIL);
      expect(await registry.allocatableHostEmails('room')).toEqual([EMAIL]);
    });

    it('rejects a blank address rather than inserting an unusable row', async () => {
      await expect(registry.registerHost({ hostEmail: '  ' })).rejects.toThrow(/required/i);
      const [rows] = await sequelize.query('SELECT 1 FROM zoom_hosts') as [unknown[], unknown];
      expect(rows).toHaveLength(0);
    });
  });

  describe('re-registering an existing host', () => {
    beforeEach(async () => {
      await registry.registerHost({
        hostEmail: EMAIL, label: 'Standup host', purpose: 'room', priority: 10,
        credentialRef: 'other-account',
      });
      await markVerified(EMAIL);
    });

    it('changes ONLY the purpose when only the purpose is given', async () => {
      await registry.registerHost({ hostEmail: EMAIL, purpose: 'practice' });
      expect(await read()).toMatchObject({
        purpose: 'practice',
        label: 'Standup host',
        priority: 10,
        credential_ref: 'other-account',
        enabled: true,
      });
    });

    it('keeps verification, because changing a label does not unmake the Zoom user', async () => {
      await registry.registerHost({ hostEmail: EMAIL, label: 'Renamed' });
      const row = await read();
      expect(row.verified_at).not.toBeNull();
      expect(row.purpose).toBe('room');
    });

    it('is idempotent: the same call twice leaves the same row', async () => {
      await registry.registerHost({ hostEmail: EMAIL, purpose: 'practice' });
      const first = await read();
      await registry.registerHost({ hostEmail: EMAIL, purpose: 'practice' });
      const second = await read();
      expect(second).toEqual(first);
    });

    it('matches on case, so a differently-cased address updates rather than duplicates', async () => {
      await registry.registerHost({ hostEmail: EMAIL.toUpperCase(), purpose: 'practice' });
      const [rows] = await sequelize.query('SELECT purpose FROM zoom_hosts') as [Row[], unknown];
      expect(rows).toHaveLength(1);
      expect(rows[0].purpose).toBe('practice');
    });

    it('CONTROL: the old statement DOES wipe the fields this suite says are preserved', async () => {
      // Validated the other way. Without this, every assertion above would also pass
      // against an upsert that happened never to touch those columns at all.
      await sequelize.query(
        `INSERT INTO zoom_hosts (host_email, label, purpose, priority, credential_ref, enabled)
           VALUES (:email, :label, :purpose, :priority, :cred, TRUE)
         ON CONFLICT (LOWER(host_email)) DO UPDATE
           SET label = EXCLUDED.label,
               purpose = EXCLUDED.purpose,
               priority = EXCLUDED.priority,
               credential_ref = EXCLUDED.credential_ref,
               enabled = EXCLUDED.enabled`,
        { replacements: { email: EMAIL, label: null, purpose: 'any', priority: 100, cred: null } },
      );
      expect(await read()).toMatchObject({
        purpose: 'any', label: null, priority: 100, credential_ref: null,
      });
    });
  });

  describe('disabling a host', () => {
    beforeEach(async () => {
      await registry.registerHost({
        hostEmail: EMAIL, label: 'Standup host', purpose: 'room', priority: 10,
      });
      await markVerified(EMAIL);
    });

    it('turns it off and KEEPS its purpose, label and priority', async () => {
      await registry.setHostEnabled(EMAIL, false);
      expect(await read()).toMatchObject({
        enabled: false, purpose: 'room', label: 'Standup host', priority: 10,
      });
    });

    it('removes it from the pool, and re-enabling restores it to the same pool', async () => {
      await registry.setHostEnabled(EMAIL, false);
      expect(await registry.allocatableHostEmails('room')).toEqual([]);
      await registry.setHostEnabled(EMAIL, true);
      // The point of the whole fix: it comes back as a ROOM host, not as `any`.
      expect(await registry.allocatableHostEmails('room')).toEqual([EMAIL]);
      expect(await registry.allocatableHostEmails('practice')).toEqual([]);
    });

    it('is a no-op on an address that is not registered, rather than inserting one', async () => {
      await registry.setHostEnabled('ghost@example.test', false);
      const [rows] = await sequelize.query('SELECT host_email FROM zoom_hosts') as [Row[], unknown];
      expect(rows.map((r) => r.host_email)).toEqual([EMAIL]);
    });

    it('CONTROL: the old disable DID reset the purpose to any', async () => {
      // `registerHost({ hostEmail, enabled: false })` was the previous implementation.
      // Under the fixed upsert it now preserves, so the control reproduces the old
      // statement directly to show the hazard was real and is what changed.
      await sequelize.query(
        `INSERT INTO zoom_hosts (host_email, label, purpose, priority, credential_ref, enabled)
           VALUES (:email, NULL, 'any', 100, NULL, FALSE)
         ON CONFLICT (LOWER(host_email)) DO UPDATE
           SET purpose = EXCLUDED.purpose, enabled = EXCLUDED.enabled`,
        { replacements: { email: EMAIL } },
      );
      const row = await read();
      expect(row.purpose).toBe('any');
      expect(row.enabled).toBe(false);
    });
  });

  describe('the pool partitions by purpose', () => {
    beforeEach(async () => {
      const seed: Array<[string, string, number]> = [
        ['room-a@example.test', 'room', 10],
        ['room-b@example.test', 'room', 20],
        ['prac-a@example.test', 'practice', 15],
        ['both@example.test', 'any', 5],
      ];
      for (const [email, purpose, priority] of seed) {
        await registry.registerHost({ hostEmail: email, purpose, priority });
        await markVerified(email);
      }
    });

    it('gives the room allocator the room hosts and the shared one, best first', async () => {
      expect(await registry.allocatableHostEmails('room')).toEqual([
        'both@example.test', 'room-a@example.test', 'room-b@example.test',
      ]);
    });

    it('gives the rehearsal allocator the practice hosts and the shared one', async () => {
      expect(await registry.allocatableHostEmails('practice')).toEqual([
        'both@example.test', 'prac-a@example.test',
      ]);
    });

    it('offers the SHARED host to both, which is the hazard crossPurposeHosts reports', async () => {
      const rooms = await registry.allocatableHostEmails('room');
      const practice = await registry.allocatableHostEmails('practice');
      const overlap = rooms.filter((h) => practice.includes(h));
      expect(overlap).toEqual(['both@example.test']);
      // And both allocators take the first entry, so the overlap is not a tail risk:
      // it is the host each of them reaches for first.
      expect(rooms[0]).toBe('both@example.test');
      expect(practice[0]).toBe('both@example.test');
    });

    it('flags only the shared host once it carries a room', async () => {
      const hosts = await registry.listHosts();
      const carrying = new Map([['both@example.test', 2], ['room-a@example.test', 1]]);
      expect(registry.crossPurposeHosts(hosts, carrying)).toEqual([
        { host_email: 'both@example.test', room_count: 2 },
      ]);
    });

    it('reports nothing once the shared host is pinned to one allocator', async () => {
      await registry.registerHost({ hostEmail: 'both@example.test', purpose: 'room' });
      const hosts = await registry.listHosts();
      const carrying = new Map([['both@example.test', 2], ['room-a@example.test', 1]]);
      expect(registry.crossPurposeHosts(hosts, carrying)).toEqual([]);
      // Pinning must not have cost the host its verification, or the fix would read as
      // a capacity loss and get reverted.
      expect(await registry.allocatableHostEmails('room')).toContain('both@example.test');
    });
  });
});
