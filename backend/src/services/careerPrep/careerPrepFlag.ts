import { getSetting } from '../settingsService';

/**
 * The career_prep flag (Career Prep v27, ticket CP1.1). Career Prep ships dark: only the enrollments
 * listed in system_settings key `career_prep_enrollments` (a JSON array of enrollment ids) see it,
 * until Ali opens it at milestone M4. The server decides; the portal only asks.
 *
 * Failure modes: a missing key, a value that is not an array of strings, or a read error all mean
 * OFF (fail closed), logged once per read with a stable error_class. Reads are cached for 60 s so a
 * page full of components costs one query.
 */
export const FLAG_KEY = 'career_prep_enrollments';
const CACHE_MS = 60_000;

type Reader = (key: string) => Promise<unknown>;
let cache: { at: number; ids: Set<string> } | null = null;

/** The allow-list out of the stored value; null when the value is not an array of strings. */
export function parseAllowList(raw: unknown): Set<string> | null {
  const value = typeof raw === 'string' ? safeJson(raw) : raw;
  if (!Array.isArray(value) || !value.every((v) => typeof v === 'string' && v.length > 0)) return null;
  return new Set(value as string[]);
}

function safeJson(s: string): unknown {
  try { return JSON.parse(s); } catch { return undefined; }
}

function logFlagProblem(errorClass: string, detail: string): void {
  console.warn(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'career_prep_flag_off',
    outcome: 'failure', error_class: errorClass, context: { detail },
  }));
}

async function allowList(read: Reader, now: number): Promise<Set<string>> {
  if (cache && now - cache.at < CACHE_MS) return cache.ids;
  let ids = new Set<string>();
  try {
    const raw = await read(FLAG_KEY);
    if (raw !== null && raw !== undefined) {
      const parsed = parseAllowList(raw);
      if (parsed) ids = parsed;
      else logFlagProblem('ValidationError', `${FLAG_KEY} is not an array of enrollment ids`);
    }
  } catch (e) {
    logFlagProblem('UpstreamUnavailable', (e as Error).message);
  }
  cache = { at: now, ids };
  return ids;
}

export async function careerPrepEnabled(enrollmentId: string | null | undefined, read: Reader = getSetting, now = Date.now()): Promise<boolean> {
  if (!enrollmentId) return false;
  return (await allowList(read, now)).has(enrollmentId);
}

/** Tests only: forget the cached allow-list. */
export function resetCareerPrepFlagCache(): void { cache = null; }
