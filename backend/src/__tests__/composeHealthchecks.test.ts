import * as fs from 'fs';
import * as path from 'path';

/**
 * A source-text assertion, deliberately — the same shape as the one guarding the
 * delivery query's SQL, and for the same reason: nothing else catches this.
 *
 * THE DEFECT. `pg_isready -U accelerator` looks complete and is not. libpq
 * defaults the database to the USERNAME when -d is absent, so the production
 * healthcheck probed a database called "accelerator" that has never existed.
 *
 * What made it survive for so long is that it never failed. pg_isready reports
 * "accepting connections" either way, because the postmaster answers the
 * connection request before the database is resolved — so the container stayed
 * healthy, nothing alerted, and Postgres logged a FATAL every 5 seconds.
 *
 * Measured on production 2026-09-10: 16,960 failed connections in 24 hours,
 * 53% of every line Postgres wrote. That volume also rotated the container's
 * 30MB log ring in about a day, which is why crash-recovery evidence from the
 * OOM investigation could not be recovered.
 *
 * No runtime test can catch this: the healthcheck passes. Only reading the
 * command does.
 */

const ROOT = path.join(__dirname, '..', '..', '..');

function composeFiles(): string[] {
  return fs.readdirSync(ROOT)
    .filter((f) => /^docker-compose.*\.ya?ml$/.test(f))
    .map((f) => path.join(ROOT, f));
}

describe('pg_isready healthchecks always name a database', () => {
  it('finds compose files to check — a passing suite that read nothing is not a pass', () => {
    // Without this, a rename or a moved root would make every assertion below
    // vacuously true and the guard would silently stop guarding.
    expect(composeFiles().length).toBeGreaterThan(0);
  });

  it.each(composeFiles().map((f) => [path.basename(f), f]))(
    '%s: every pg_isready passes -d',
    (_name, file) => {
      const text = fs.readFileSync(file, 'utf8');
      const lines = text.split('\n').filter((l) => l.includes('pg_isready'));
      for (const line of lines) {
        // The comments above each healthcheck mention pg_isready; skip them.
        if (line.trim().startsWith('#')) continue;
        expect(line).toMatch(/-d\s+\S/);
      }
    }
  );

  it('the production healthcheck targets the same database the service creates', () => {
    // A -d that names the wrong database is the original bug wearing a fix.
    const text = fs.readFileSync(path.join(ROOT, 'docker-compose.production.yml'), 'utf8');
    const health = text.split('\n').find((l) => l.includes('pg_isready') && !l.trim().startsWith('#'));
    expect(health).toBeDefined();
    expect(health).toContain('${DB_NAME:-accelerator_prod}');
    // POSTGRES_DB is the authority on what actually exists.
    expect(text).toContain('POSTGRES_DB: ${DB_NAME:-accelerator_prod}');
  });
});
