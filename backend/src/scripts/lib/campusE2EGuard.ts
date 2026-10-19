/**
 * Local-only guard for the campus e2e seed.
 *
 * The seed writes users, enrollments, a cohort, an organization and a staff row. It must only ever
 * write to the throwaway `campus_e2e` database in a container on this machine. Three ways it could go
 * wrong, each refused here:
 *   1. DATABASE_URL unset: env.ts would fall back to the local accelerator_dev database.
 *   2. A host that merely LOOKS local (localhost.evil.com, a tunnel) or is remote.
 *   3. A local host carrying a real database (an `ssh -L` tunnel to production lands on 127.0.0.1),
 *      which is why the database NAME must be exactly campus_e2e as well.
 * Pure: no I/O, so the seed can call it before importing anything that opens a connection.
 */

export const E2E_DATABASE_NAME = 'campus_e2e';
export const LOCAL_HOSTS: readonly string[] = ['localhost', '127.0.0.1', '[::1]'];

export type GuardResult = { ok: true; host: string; database: string } | { ok: false; reason: string };

export function checkCampusE2EDatabase(env: Record<string, string | undefined>): GuardResult {
  if (env.NODE_ENV === 'production') return { ok: false, reason: 'NODE_ENV is production' };
  const raw = env.DATABASE_URL;
  if (!raw || !raw.trim()) return { ok: false, reason: 'DATABASE_URL must be set explicitly (the env.ts default is refused)' };
  let url: URL;
  try {
    url = new URL(raw);
  } catch {
    return { ok: false, reason: 'DATABASE_URL is not a valid URL' };
  }
  if (url.protocol !== 'postgres:' && url.protocol !== 'postgresql:') {
    return { ok: false, reason: `protocol ${url.protocol} is not postgres` };
  }
  if (!LOCAL_HOSTS.includes(url.hostname)) return { ok: false, reason: `host ${url.hostname} is not local` };
  const database = decodeURIComponent(url.pathname.replace(/^\//, ''));
  if (database !== E2E_DATABASE_NAME) {
    return { ok: false, reason: `database ${database || '(none)'} is not ${E2E_DATABASE_NAME}` };
  }
  return { ok: true, host: url.hostname, database };
}
