import { sequelize } from '../../config/database';
import { NO_INTERVIEW } from '../../db/ensureCareerPrepSchema';
import { getCaseStudySurfaceProfile } from '../caseStudy/caseStudySurfaceProfiles';

/**
 * Career Prep v27, CP10.2b (kit "Employer portal", candidate cards): the facts a candidate card shows beyond the name,
 * for the learners clientStore.clientCandidates already scoped to the signed-in client. This module is only ever
 * given THOSE enrollment ids; it never lists anyone on its own. Every fact comes from a real source or is null, and
 * the page says plainly that it is absent, never a made-up number:
 *   readiness         the learner's latest GENERAL interview readiness (prep_readiness_daily, interview_id = the
 *                     "no interview" uuid), the same number the staff Student prep list shows (prepStudents.ts);
 *                     null = not assessed yet (never 0).
 *   profile           the learner's Hire profile, ONLY when the Hire site would render it (hireTalentIndex's ONE gate:
 *                     a published, public or unlisted portfolio page with a case study published on the hire surface
 *                     that passes the visibility rule). url = hire.refactored.ai/talent/<slug>/ (the Digital resume),
 *                     role = the headline frozen at review, verifiedProjects = the titles of those published case
 *                     studies (at most 3; verifiedCount = all of them). null = no reviewed Hire profile yet.
 * If the Hire index cannot be read, the list still loads: every profile is null and `profilesUnavailable` is true, so
 * the page says "could not load" instead of "none yet". A readiness read failure propagates (the route answers 500).
 */
export interface CardProfile { url: string; role: string | null; verifiedProjects: string[]; verifiedCount: number }
export interface CardFacts { readiness: number | null; profile: CardProfile | null }
export interface Cards { facts: Map<string, CardFacts>; profilesUnavailable: boolean }

/** The slice of a Hire index entry this module reads (hireTalentIndex.HireIndexEntry). */
export interface IndexEntryLike {
  page: { enrollment_id: string; slug: string; approved_identity: unknown };
  cases: ReadonlyArray<{ title: string }>;
}
export interface CardDeps {
  readiness: (ids: string[]) => Promise<Map<string, number>>;
  hireIndex: () => Promise<IndexEntryLike[]>;
}

export const MAX_PROJECTS = 3;

/** Latest general readiness per learner, one statement, for the given (already client-scoped) ids. */
export async function latestReadiness(ids: string[]): Promise<Map<string, number>> {
  const out = new Map<string, number>();
  if (!ids.length) return out;
  const [rows] = await sequelize.query(
    `SELECT DISTINCT ON (enrollment_id) enrollment_id, readiness FROM prep_readiness_daily
      WHERE enrollment_id IN (:ids) AND interview_id = :none AND readiness IS NOT NULL
      ORDER BY enrollment_id, date DESC`,
    { replacements: { ids, none: NO_INTERVIEW } },
  );
  for (const r of rows as Array<{ enrollment_id: string; readiness: string | number }>) {
    const n = Math.round(Number(r.readiness));
    if (Number.isFinite(n) && n >= 0 && n <= 100) out.set(String(r.enrollment_id), n);
  }
  return out;
}

const text = (v: unknown): string | null => (typeof v === 'string' && v.trim() ? v.trim().slice(0, 120) : null);

/** The card's profile from a Hire index entry (PURE). */
export function profileOf(entry: IndexEntryLike, base: string): CardProfile {
  const titles = entry.cases.map((c) => text(c.title)).filter((t): t is string => !!t);
  const identity = entry.page.approved_identity as { title?: unknown } | null;
  return {
    url: `${base.replace(/\/+$/, '')}/talent/${encodeURIComponent(entry.page.slug)}/`,
    role: text(identity && typeof identity === 'object' ? identity.title : null),
    verifiedProjects: titles.slice(0, MAX_PROJECTS),
    verifiedCount: titles.length,
  };
}

const defaultDeps: CardDeps = {
  readiness: latestReadiness,
  hireIndex: async () => (await import('../hire/hireTalentIndex')).loadHireIndex(['public', 'unlisted']),
};

/** The card facts for these learners (ids from the client-scoped candidate read; nothing else is ever looked up). */
export async function loadCardFacts(ids: string[], deps: CardDeps = defaultDeps): Promise<Cards> {
  const facts = new Map<string, CardFacts>();
  if (!ids.length) return { facts, profilesUnavailable: false };
  const wanted = new Set(ids);
  const readiness = await deps.readiness(ids);
  let entries: IndexEntryLike[] = [];
  let profilesUnavailable = false;
  try { entries = await deps.hireIndex(); } catch (err) {
    profilesUnavailable = true;
    console.warn(JSON.stringify({ timestamp: new Date().toISOString(), level: 'warn', service: 'backend', event: 'hire_client_profiles_unavailable',
      outcome: 'partial', error_class: 'UpstreamUnavailable', context: { message: String((err as Error)?.message ?? err).slice(0, 200) } }));
  }
  // The same Hire site base the sign-in, booking and room links use (bookingReply.bookingLinkBase).
  const base = getCaseStudySurfaceProfile('hire').publicBaseUrl || 'https://hire.refactored.ai';
  const byId = new Map(entries.filter((e) => wanted.has(e.page.enrollment_id)).map((e) => [e.page.enrollment_id, e] as const));
  for (const id of ids) {
    const e = byId.get(id);
    facts.set(id, { readiness: readiness.get(id) ?? null, profile: e ? profileOf(e, base) : null });
  }
  return { facts, profilesUnavailable };
}
