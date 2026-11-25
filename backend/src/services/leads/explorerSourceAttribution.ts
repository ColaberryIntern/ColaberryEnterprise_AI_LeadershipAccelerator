/**
 * Resolve the DOOR's own slug to a `lead_sources.id`, so a lead captured through
 * the Explorer / Open House path is attributable to a brand.
 *
 * WHY THIS MODULE EXISTS
 *
 * `Lead` has no brand column. Origin brand is DERIVED, and only one way:
 * `Lead.source_id -> LeadSource.brand_id`. A lead with a NULL `source_id`
 * therefore belongs to no brand, and nothing downstream can recover it.
 *
 * `enrollmentService.createExplorerEnrollment` never resolved one. Measured on
 * production 2026-11-25, over the preceding 25 days:
 *
 *   capture path   leads   with a source_id
 *   open_house       352                  0
 *   free_signup      146                146
 *
 * The `free_signup` path has never missed; this one has never worked. It only
 * became visible when the ad funnels moved onto it around 10 November, taking it
 * from 20 leads to 332 and making it 94 percent of all new leads. The symptom
 * that surfaced it was a landing-page snack bar with nothing to show, because the
 * snack bar selects leads by brand.
 *
 * WHY A SLUG AND NOT A HOSTNAME
 *
 * `lead_sources.domain` is populated for all 11 rows, so resolving the host of
 * `page_url` looks like the cheaper fix. It was measured and it is WRONG:
 * `www.refactored.ai` resolves to brand `refactored` by domain, yet all 146
 * attributed leads on that exact host resolve to `training`, because the door is
 * the Colaberry Training class and the domain it happens to be served from does
 * not change whose lead it is. A host rule would have misattributed 221 leads to
 * a brand that never ran the class. The door names itself; the host is evidence
 * of delivery, not of ownership.
 *
 * FAILURE POSTURE
 *
 * Never throws, never blocks a signup, and never invents a source. Lead capture
 * is already best-effort in the caller, and a person must get their account
 * whatever happens here. Unresolved means NULL, which is honest and recoverable;
 * a fabricated brand is neither.
 */

/** Bounded so a stalled resolver can never hold up somebody's account. */
const RESOLVE_TIMEOUT_MS = 2_000;

/**
 * How the attribution was decided. Logged rather than inferred, so "we had no
 * slug", "the catalog does not know this slug" and "the lookup broke" stay three
 * distinguishable facts instead of collapsing into one silent NULL.
 */
export type DoorResolutionPath =
  | 'resolved'
  | 'no_slug_supplied'
  | 'slug_unknown_to_catalog'
  | 'resolver_unavailable'
  | 'resolver_timeout';

export interface DoorSourceResolution {
  sourceId: string | null;
  path: DoorResolutionPath;
}

function log(event: string, outcome: 'success' | 'partial' | 'failure', context: object): void {
  const line = JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : outcome === 'partial' ? 'warn' : 'info',
    service: 'backend',
    event,
    outcome,
    context,
  });
  if (outcome === 'failure') console.error(line);
  else if (outcome === 'partial') console.warn(line);
  else console.log(line);
}

/**
 * Resolve a door's slug to a `lead_sources.id`.
 *
 * Dynamically imported rather than imported at the top, matching
 * `freeSignupService`: it keeps the resolver out of this module's load-time graph,
 * so a caller that mocks `../../models` is not forced to also mock the tenancy
 * module to exercise an unrelated path.
 *
 * @param sourceSlug the door's claim about itself. Absent is a valid answer and
 *   writes NULL - it is never defaulted to a brand.
 * @param opts.timeoutMs overrides the bound. Present so the timeout path can be
 *   exercised by a test in milliseconds instead of making the suite wait two
 *   real seconds, and so the bound is asserted rather than assumed. Callers in
 *   production pass nothing.
 */
export async function resolveDoorSourceId(
  sourceSlug: string | null | undefined,
  opts: { timeoutMs?: number } = {},
): Promise<DoorSourceResolution> {
  const slug = typeof sourceSlug === 'string' ? sourceSlug.trim() : '';
  if (!slug) return { sourceId: null, path: 'no_slug_supplied' };

  const timeoutMs = typeof opts.timeoutMs === 'number' && opts.timeoutMs > 0
    ? opts.timeoutMs
    : RESOLVE_TIMEOUT_MS;

  let timer: ReturnType<typeof setTimeout> | undefined;
  try {
    const resolution = await Promise.race([
      (async () => {
        const { resolveContextBySourceSlug } = await import('../../modules/tenancy/tenantResolver');
        const context = await resolveContextBySourceSlug(slug);
        return { timedOut: false as const, sourceId: context?.sourceId ?? null };
      })(),
      new Promise<{ timedOut: true }>((resolve) => {
        timer = setTimeout(() => resolve({ timedOut: true }), timeoutMs);
      }),
    ]);

    if (resolution.timedOut) {
      log('lead.door_source_resolve_timeout', 'partial', { source_slug: slug, timeout_ms: timeoutMs });
      return { sourceId: null, path: 'resolver_timeout' };
    }

    if (!resolution.sourceId) {
      // Not an error: a slug the catalog does not carry, or one carried without a
      // brand yet, is the normal state during a migration. It is logged because
      // the alternative is a silent NULL nobody measures - which is exactly how
      // 352 leads went unattributed without anything reporting a failure.
      log('lead.door_source_unresolved', 'partial', { source_slug: slug });
      return { sourceId: null, path: 'slug_unknown_to_catalog' };
    }

    return { sourceId: resolution.sourceId, path: 'resolved' };
  } catch (err: unknown) {
    log('lead.door_source_resolve_failed', 'failure', {
      source_slug: slug,
      error_class: err instanceof Error ? err.constructor.name : 'UnknownError',
      message: err instanceof Error ? err.message : String(err),
    });
    return { sourceId: null, path: 'resolver_unavailable' };
  } finally {
    if (timer) clearTimeout(timer);
  }
}
