import {
  ZOOM_HOST_STATEMENTS,
  ZOOM_HOST_TABLES,
  ZOOM_HOST_REQUIRED_COLUMNS,
  ZOOM_HOST_PURPOSES,
} from '../ensureZoomHostSchema';

/**
 * Static contract test — reads the DDL as source text, touches no database.
 *
 * The trap this directory keeps falling into is that `CREATE TABLE IF NOT EXISTS`
 * is a NO-OP on an existing table, so a column added only inside the CREATE never
 * appears on any environment that already has the table. Every column therefore
 * needs an explicit ALTER, and this asserts that mechanically rather than by
 * reviewer attention.
 */

const SQL = ZOOM_HOST_STATEMENTS.join('\n');

function columnsInCreate(): string[] {
  const create = ZOOM_HOST_STATEMENTS.find((s) => s.includes('CREATE TABLE IF NOT EXISTS zoom_hosts'))!;
  const body = create.slice(create.indexOf('(') + 1, create.lastIndexOf(')'));
  return body
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('--'))
    .map((l) => l.split(/\s+/)[0].replace(/,$/, ''))
    .filter((c) => /^[a-z_]+$/.test(c));
}

describe('zoom_hosts DDL', () => {
  it('declares the one table it is responsible for', () => {
    expect(ZOOM_HOST_TABLES).toEqual(['zoom_hosts']);
    expect(SQL).toContain('CREATE TABLE IF NOT EXISTS zoom_hosts');
  });

  it('gives EVERY column in the CREATE a matching ADD COLUMN IF NOT EXISTS', () => {
    const cols = columnsInCreate();
    // Positive control: if the parser returned nothing, the loop below would pass
    // while proving nothing at all.
    expect(cols.length).toBeGreaterThan(5);
    expect(cols).toContain('credential_ref');

    const missing = cols
      .filter((c) => c !== 'id') // the primary key cannot be added after the fact
      .filter((c) => !SQL.includes(`ADD COLUMN IF NOT EXISTS ${c} `));
    expect(missing).toEqual([]);
  });

  it('enforces one row per host, case-insensitively', () => {
    // A duplicated email silently doubles a host's apparent capacity, which is the
    // exact overbooking this register exists to prevent. Case matters because Zoom
    // emails are case-insensitive and humans type them by hand.
    expect(SQL).toContain('CREATE UNIQUE INDEX IF NOT EXISTS zoom_hosts_unique_email');
    expect(SQL).toContain('(LOWER(host_email))');
  });

  it('indexes only hosts that are allocatable', () => {
    expect(SQL).toContain('WHERE enabled AND verified_at IS NOT NULL');
  });

  it('every statement is re-runnable', () => {
    for (const stmt of ZOOM_HOST_STATEMENTS) {
      const safe = /IF NOT EXISTS/.test(stmt) || /DO \$\$/.test(stmt);
      expect({ stmt: stmt.slice(0, 70), safe }).toEqual({ stmt: stmt.slice(0, 70), safe: true });
    }
  });

  it('holds identifiers, never secrets', () => {
    // A host registry is a tempting place to put a client secret. It must not be.
    for (const forbidden of ['secret', 'client_secret', 'password', 'token', 'api_key']) {
      expect(SQL.toLowerCase()).not.toContain(forbidden);
    }
  });

  it('offers a purpose vocabulary that includes the general case', () => {
    expect(ZOOM_HOST_PURPOSES).toContain('any');
    expect(ZOOM_HOST_REQUIRED_COLUMNS).toContain('zoom_hosts.verified_at');
  });
});
