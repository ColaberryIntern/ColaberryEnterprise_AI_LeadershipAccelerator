import { QueryTypes } from 'sequelize';
import { sequelize } from '../../../config/database';
import { resolveExplorerScope, type ExplorerScope } from '../explorerBrandScope';
import { EXPLORER_PROGRAM } from '../explorerProgramBridge';
import {
  getSummary,
  getDistribution,
  getLearners,
} from '../../explorerGrowth/explorerOverviewService';
import {
  getLearnerProfile,
  getLearnerSignals,
  getLearnerDecisions,
  getEligibility,
} from '../../explorerGrowth/explorerLearnerService';
import {
  getDecisions,
  getShadow,
  getContentHealth,
} from '../../explorerGrowth/explorerDecisionsService';
import { getExplorerWhyByDecision } from '../../explorerGrowth/explorerWhyService';
import { getCampusActivity, getOutreach } from '../../explorerGrowth/explorerCampusService';

/**
 * Explorer Growth's reads, brand-scoped, for the Growth Journey workspace.
 *
 * ─── THIS MODULE CALLS EXPLORER. IT DOES NOT REIMPLEMENT IT. ────────────────
 *
 * Every read below delegates to an UNMODIFIED Explorer service. Nothing here
 * re-derives a score, re-reads a profile table or reaches past those services
 * into Explorer's models. `explorerFacade.ts` states the reason and it holds
 * here too: a facade that re-derived anything would be a second Explorer, and
 * the moment the two disagreed nobody could say which was right.
 *
 * ─── OUT OF SCOPE RETURNS null, NEVER ZEROS ─────────────────────────────────
 *
 * "This brand has no explorers yet" and "we cannot show you this brand" are
 * different facts. A zero would assert the first while meaning the second, and
 * an operator reading a confident 0 has been told something false. So the
 * envelope carries `data: null` plus the reason, and the UI says which.
 *
 * The single most important property of this file is that when the scope refuses,
 * the Explorer service is NOT CALLED AT ALL. That is what a spy asserts in the
 * tests, because "returned null" could still be true of a version that fetched
 * the rows and then discarded them, and that version leaks through any logging,
 * timing or error message that quotes what it read.
 *
 * ─── ONE INHERITED WRITE, STATED RATHER THAN GLOSSED ────────────────────────
 *
 * Zero DATA writes: nothing here inserts, updates or deletes a row. One
 * qualification: `getOutreach` opens with `ensureCampusActivitySchema()`, three
 * `IF NOT EXISTS` DDL statements. That already fires today every time anyone
 * opens Explorer Growth's Campus tab, so delegating reaches it through a second
 * door rather than creating a capability. Inherited, not introduced.
 */

export interface ScopedRead<T> {
  scope: ExplorerScope;
  data: T | null;
  /** Present on the summary read only. See `explorerBrandInvariant` below. */
  invariant?: ExplorerBrandInvariant;
}

export interface ExplorerBrandInvariant {
  holds: boolean;
  foreign_brand_profiles: number;
}

/**
 * The one place the refusal is decided, so thirteen reads cannot drift apart.
 *
 * `read` is a thunk rather than a value precisely so an out-of-scope request
 * never evaluates it.
 */
async function scoped<T>(
  requestedBrandId: string | null,
  ctxBrandId: string | null,
  read: () => Promise<T>
): Promise<ScopedRead<T>> {
  const scope = await resolveExplorerScope(requestedBrandId, ctxBrandId);
  if (!scope.in_scope) return { scope, data: null };
  return { scope, data: await read() };
}

/**
 * Does the assumption this whole module rests on still hold?
 *
 * Explorer's services take NO brand filter, so an in-scope read returns the entire
 * population. That is correct only while every Explorer profile really is
 * Colaberry Training's. Measured on production 2026-11-21 across 1,191 profiles:
 * 282 resolve to a Colaberry Training brand context, 909 carry none, and ZERO
 * belong to any other brand. No lead carries more than one context, so there is
 * no double count.
 *
 * The invariant holds today and NOTHING ENFORCES IT. A single Explorer profile
 * acquiring another brand's context would start rendering under Colaberry
 * Training's name, silently.
 *
 * So this counts them. It REPORTS, it does not block: refusing the read would take
 * a working page down over a condition that is currently impossible, and an
 * operator who can see a caveat is better served than one who sees an outage.
 */
async function explorerBrandInvariant(): Promise<ExplorerBrandInvariant> {
  try {
    const rows = (await sequelize.query(
      `SELECT count(DISTINCT p.enrollment_id)::int AS n
         FROM explorer_journey_profiles p
         JOIN lead_tenant_contexts ltc ON ltc.lead_id = p.lead_id
         JOIN brands b ON b.id = ltc.brand_id
        WHERE b.slug <> :explorerBrandSlug`,
      {
        type: QueryTypes.SELECT,
        replacements: { explorerBrandSlug: EXPLORER_PROGRAM.brandSlug },
      }
    )) as Array<{ n: number }>;

    const foreign = rows[0]?.n ?? 0;
    if (foreign > 0) {
      console.warn(
        JSON.stringify({
          level: 'warn',
          service: 'growth-journey-admin',
          event: 'explorer_brand_invariant_broken',
          outcome: 'partial',
          error_class: 'ContractViolation',
          foreign_brand_profiles: foreign,
        })
      );
    }
    return { holds: foreign === 0, foreign_brand_profiles: foreign };
  } catch {
    // A sentinel that cannot read must not take the page down with it. Reported as
    // not-holding with a count of -1 so "we could not check" is distinguishable
    // from "we checked and it is fine".
    return { holds: false, foreign_brand_profiles: -1 };
  }
}

/* ── The thirteen reads ──────────────────────────────────────────────────────
 *
 * Thirteen, matching the thirteen routes in `growthJourneyReadRoutes`. Explorer
 * exposes sixteen read GETs; three are deliberately not carried:
 *   /learners/:id/scores      no component renders it today
 *   /decisions/:id/history    only DraftRevisionPanel, a deferred write surface
 *   /controls                 the Settings tab, deferred
 */

export async function readExplorerSummary(
  brandId: string | null,
  ctxBrandId: string | null = null
): Promise<ScopedRead<Awaited<ReturnType<typeof getSummary>>>> {
  const result = await scoped(brandId, ctxBrandId, () => getSummary());
  // Only meaningful when rows were actually served.
  if (result.data === null) return result;
  return { ...result, invariant: await explorerBrandInvariant() };
}

export function readExplorerDistribution(
  brandId: string | null,
  ctxBrandId: string | null,
  days: number
): Promise<ScopedRead<Awaited<ReturnType<typeof getDistribution>>>> {
  return scoped(brandId, ctxBrandId, () => getDistribution(days));
}

export function readExplorerCampusActivity(
  brandId: string | null,
  ctxBrandId: string | null = null
): Promise<ScopedRead<Awaited<ReturnType<typeof getCampusActivity>>>> {
  return scoped(brandId, ctxBrandId, () => getCampusActivity());
}

export function readExplorerOutreach(
  brandId: string | null,
  ctxBrandId: string | null,
  args: { view: Parameters<typeof getOutreach>[0]; limit: number; offset: number }
): Promise<ScopedRead<Awaited<ReturnType<typeof getOutreach>>>> {
  return scoped(brandId, ctxBrandId, () =>
    getOutreach(args.view, args.limit, { offset: args.offset })
  );
}

export function readExplorerLearners(
  brandId: string | null,
  ctxBrandId: string | null,
  q: Parameters<typeof getLearners>[0]
): Promise<ScopedRead<Awaited<ReturnType<typeof getLearners>>>> {
  return scoped(brandId, ctxBrandId, () => getLearners(q));
}

export function readExplorerLearner(
  brandId: string | null,
  ctxBrandId: string | null,
  enrollmentId: string
): Promise<ScopedRead<Awaited<ReturnType<typeof getLearnerProfile>>>> {
  return scoped(brandId, ctxBrandId, () => getLearnerProfile(enrollmentId));
}

export function readExplorerLearnerSignals(
  brandId: string | null,
  ctxBrandId: string | null,
  enrollmentId: string,
  days: number
): Promise<ScopedRead<Awaited<ReturnType<typeof getLearnerSignals>>>> {
  return scoped(brandId, ctxBrandId, () => getLearnerSignals(enrollmentId, days));
}

export function readExplorerLearnerDecisions(
  brandId: string | null,
  ctxBrandId: string | null,
  enrollmentId: string,
  // Paginated at the service, so the page is passed through rather than defaulted
  // here. A default would silently cap a drawer at whatever this file chose.
  limit: number,
  offset: number
): Promise<ScopedRead<Awaited<ReturnType<typeof getLearnerDecisions>>>> {
  return scoped(brandId, ctxBrandId, () => getLearnerDecisions(enrollmentId, limit, offset));
}

export function readExplorerEligibility(
  brandId: string | null,
  ctxBrandId: string | null,
  enrollmentId: string
): Promise<ScopedRead<Awaited<ReturnType<typeof getEligibility>>>> {
  return scoped(brandId, ctxBrandId, () => getEligibility(enrollmentId));
}

export function readExplorerDecisions(
  brandId: string | null,
  ctxBrandId: string | null,
  q: Parameters<typeof getDecisions>[0]
): Promise<ScopedRead<Awaited<ReturnType<typeof getDecisions>>>> {
  return scoped(brandId, ctxBrandId, () => getDecisions(q));
}

export function readExplorerWhy(
  brandId: string | null,
  ctxBrandId: string | null,
  decisionId: string
): Promise<ScopedRead<Awaited<ReturnType<typeof getExplorerWhyByDecision>>>> {
  return scoped(brandId, ctxBrandId, () => getExplorerWhyByDecision(decisionId));
}

export function readExplorerShadow(
  brandId: string | null,
  ctxBrandId: string | null,
  q: Parameters<typeof getShadow>[0]
): Promise<ScopedRead<Awaited<ReturnType<typeof getShadow>>>> {
  return scoped(brandId, ctxBrandId, () => getShadow(q));
}

export function readExplorerContent(
  brandId: string | null,
  ctxBrandId: string | null,
  q: Parameters<typeof getContentHealth>[0]
): Promise<ScopedRead<Awaited<ReturnType<typeof getContentHealth>>>> {
  return scoped(brandId, ctxBrandId, () => getContentHealth(q));
}

/** Every read this module exposes, so a route test can assert one route per read. */
export const EXPLORER_BRAND_READS = [
  'readExplorerSummary',
  'readExplorerDistribution',
  'readExplorerCampusActivity',
  'readExplorerOutreach',
  'readExplorerLearners',
  'readExplorerLearner',
  'readExplorerLearnerSignals',
  'readExplorerLearnerDecisions',
  'readExplorerEligibility',
  'readExplorerDecisions',
  'readExplorerWhy',
  'readExplorerShadow',
  'readExplorerContent',
] as const;
