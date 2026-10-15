/**
 * THE MISSING LINK: a composed blueprint becomes a persisted manifest.
 *
 * ## The defect this closes
 *
 * Three producers formed a chain with no consumer, measured by grep over `services`, `routes`,
 * `controllers` and `scripts` on 2026-10-14:
 *
 *   `POST /:projectId/compose`   validated a blueprint and returned refusals. Persisted NOTHING.
 *   `writeBlueprintManifest`     ZERO production callers. The only production INSERT into
 *                                `operating_blueprint_manifests`, reached from tests only.
 *   `factoryToManifestRefs`      ZERO production callers.
 *   `sbpToManifestRefs`          ZERO production callers.
 *
 * So no `operating_blueprint_manifests` row was ever written in production, `latestManifestRefs`
 * returned `null` for every real project, and EVERY refs-derived evidence measurement reported
 * NOT_MEASURED - which blocks. `blueprintApproval` could only approve a manifest that nothing
 * created. `manifestWriter.ts`'s own header names this as the dependency Phase 4 closed with:
 * *"Production never CREATES an `operating_blueprint_manifests` row - it only reads and updates
 * one."* This module is what creates one.
 *
 * ## Why a service rather than code in the route handler
 *
 * Every other handler in `projectLifecycleRoutes.ts` delegates to a service that owns the tenant
 * load and the authorization - `readLifecycleStatus`, `requestTransition`,
 * `approveLifecycleBlueprint`. Writing the manifest inline would put a tenant-scoped write in the
 * one handler that currently has no tenant check at all, and the route's own comment says why it
 * has none: *"`composeBlueprint` is pure and touches no tenant-scoped row, so it cannot raise"* a
 * `TenantAccessError`. That stops being true the moment compose persists, and the fix is to put
 * the write behind the same guard as its siblings rather than to widen the handler.
 *
 * ## What this does NOT do
 *
 * It does not validate. The caller composes first and persists only a blueprint that returned
 * zero refusals; this module would otherwise be a second place where "is this blueprint any good"
 * is decided. It does not approve or supersede - `blueprintApproval` owns that, and the row lands
 * `status = 'draft'`.
 */
import type { ProjectKind, AdminIdentity } from './lifecycleStatus';
import type { ManifestRefs, RefOrigin } from './adapters/manifestRefs';
import type {
  FactoryRequirementLike, FactorySourceBlockLike, FactoryTaskLike,
} from './adapters/factoryAdapter';

/**
 * Structured JSON to stdout, per CLAUDE.md's observability contract. `correlation_id` is threaded
 * from the route rather than minted here, so one compose request is one id end to end.
 */
function log(fields: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: fields.outcome === 'failure' ? 'error' : 'info',
    service: 'backend',
    event: 'blueprint_manifest_persisted',
    ...fields,
  }));
}

/**
 * The composition body's `project`, read structurally.
 *
 * NOT `import type { FactoryProject }`. The compose route's Zod schema is deliberately shallow
 * (`project: z.record(z.string(), z.unknown())`) because each collection has a validator owning
 * its deep contract, so what arrives here is unverified at the type level whatever it is declared
 * as. A structural shape states exactly the five fields this module reads and lets every one be
 * absent, which is the honest description of a `Record<string, unknown>` that has been cast.
 */
export interface ComposedProjectLike {
  requirements?: ReadonlyArray<FactoryRequirementLike> | null;
  source_blocks?: ReadonlyArray<FactorySourceBlockLike> | null;
  tasks?: ReadonlyArray<FactoryTaskLike> | null;
  processes?: ReadonlyArray<{ id: string }> | null;
  assignments?: ReadonlyArray<{ role_id: string; responsibility?: string | null }> | null;
}

export interface PersistComposedInput {
  projectId: string;
  kind: ProjectKind;
  admin: AdminIdentity | undefined;
  project: ComposedProjectLike;
  /** The document revision these records were read at, pinned into every ref. */
  documentVersion?: number | null;
  correlationId?: string | null;
}

/**
 * What happened, in a shape the route can return verbatim.
 *
 * `persisted: false` ALWAYS carries a `reason`. A boolean alone would leave the caller unable to
 * tell "this project has no lifecycle row" from "there was nothing to file", and those need
 * different actions - register the project versus capture some requirements. This programme has
 * already shipped one absence reported as a pass; a silent non-persist on a 200 response would be
 * the same shape.
 */
export type PersistComposedResult =
  | {
    persisted: true;
    manifestId: string;
    revision: number;
    /** False when this call found an existing row rather than inserting one. A replay. */
    created: boolean;
    contentSha256: string;
  }
  | { persisted: false; reason: 'no_lifecycle_row' | 'no_requirements' };

/** `student` projects are the SBP identity space; `delivery` is the Factory's. */
function originFor(kind: ProjectKind): RefOrigin {
  return kind === 'student' ? 'sbp' : 'factory';
}

/**
 * Build the ref set with the adapter that matches the project's identity space.
 *
 * ## Why both adapters, when the body is Factory-shaped for both kinds
 *
 * `BlueprintGenerationInput.project` is typed `FactoryProject` regardless of kind - the Factory
 * contract IS the blueprint vocabulary here. So the tempting shortcut is to run
 * `factoryToManifestRefs` for everything.
 *
 * That shortcut writes a WRONG POINTER, which is the one thing a ref set must not do. Its own
 * header: an adapter "returns pointers - ids plus the revision they were read at", and
 * `PinnedRef.source` is "the table or collection it lives in, for a reader tracing the pointer
 * back." A student project's requirements do not live in `contract_requirements`; they live in
 * `build_plans`. Labelling them `contract_requirements` makes every pointer in a student
 * manifest dangle, and a dangling pointer is worse than no manifest, because it looks resolvable.
 *
 * So the kind picks the adapter, each adapter keeps emitting the `source` it always has, and both
 * values are already in `REQUIREMENT_SOURCE_COLLECTIONS` so `requirementCount` measures either.
 *
 * ## What each kind gets, and the one asymmetry
 *
 * The delivery path passes `source_blocks` and `tasks`, so `coverage.uncitedRequirementBlocks` is
 * genuinely MEASURED. The student path cannot: SBP has no source-block or business-task layer, so
 * that adapter records `[]` - vacuously clean, documented as a limitation in
 * docs/project-lifecycle/backbone-adoption.md rather than presented as a passed check.
 */
async function buildRefs(input: PersistComposedInput): Promise<ManifestRefs> {
  const p = input.project;
  const requirements = Array.isArray(p.requirements) ? p.requirements : [];
  const rev = input.documentVersion ?? null;

  if (input.kind === 'student') {
    const { sbpToManifestRefs } = await import('./adapters/sbpAdapter');
    return sbpToManifestRefs({
      projectId: input.projectId,
      planVersion: rev,
      // `ContractRequirement` to `SbpRequirementLike`. `source_document` carries the provenance on
      // the way in and `source` is where the SBP adapter reads it from - the field names differ
      // and the meaning does not, which is exactly what an adapter boundary is for.
      requirements: requirements.map((r) => ({
        id: r.canonical_req_id,
        source: r.source_document ?? null,
        human_confirmed: r.human_confirmed ?? null,
      })),
    });
  }

  const { factoryToManifestRefs } = await import('./adapters/factoryAdapter');
  return factoryToManifestRefs({
    deliveryProjectId: input.projectId,
    documentVersion: rev,
    requirements,
    // PASSED ONLY WHEN PRESENT. `factoryToManifestRefs` distinguishes an absent `sourceBlocks`
    // (coverage unmeasurable, recorded `null`, prerequisite keeps blocking) from an empty one
    // (measured: no blocks, so none uncited). Passing `[]` for a body that omitted the field
    // would launder the first into the second.
    ...(Array.isArray(p.source_blocks) ? { sourceBlocks: p.source_blocks } : {}),
    tasks: Array.isArray(p.tasks) ? p.tasks : [],
    processes: Array.isArray(p.processes) ? p.processes : [],
    assignments: Array.isArray(p.assignments) ? p.assignments : [],
  });
}

/**
 * Persist a composed blueprint as a draft manifest, or say why it was not persisted.
 *
 * Authorization runs FIRST and through the same guard as every sibling service, so a compose for
 * another tenant's project cannot write a row. `loadAndAuthorize` throws `TenantAccessError` -
 * deliberately 404 rather than 403, so a refusal is not an existence oracle - and that throw is
 * allowed to propagate for the route to map, exactly as `requestTransition` does.
 *
 * Idempotent because `writeBlueprintManifest` is: the key is `(tenant, project, sha256(refs))`, so
 * composing the same blueprint twice returns the first row with `created: false`. That matters
 * here more than anywhere, because a reviewer re-submitting an unchanged blueprint is the normal
 * case rather than an edge one, and a new revision per click would make the revision number
 * meaningless.
 */
export async function persistComposedBlueprint(
  input: PersistComposedInput,
): Promise<PersistComposedResult> {
  const { loadAndAuthorize } = await import('./lifecycleStatus');
  const row = await loadAndAuthorize(input.projectId, input.kind, input.admin, 'write');

  // A project with no lifecycle row is the LEGACY case, not an error. 4 delivery and 62 student
  // projects predate their registration hooks, and the DRI decided on 2026-10-14 not to backfill
  // them. They may still compose and be validated; there is nowhere to file the manifest, and the
  // caller is told so rather than receiving a 200 that quietly wrote nothing.
  if (!row) return { persisted: false, reason: 'no_lifecycle_row' };

  const refs = await buildRefs(input);

  // DECLINED RATHER THAN WRITTEN. A manifest with no sources measures `requirementCount: 0`, which
  // is a MEASURED zero and refuses `requirements_ready` with `no_requirements`. Writing it would
  // burn a revision to record that nothing was captured, and because the idempotency key is the
  // refs hash, that empty row would then come back for every later empty compose while a real
  // blueprint takes the next revision. Nothing is lost by declining: the composition result the
  // caller already has is the useful half.
  if (refs.sources.length === 0) return { persisted: false, reason: 'no_requirements' };

  // REQUIRED by `WriteManifestInput`, and not defaulted there. Separation of duty cannot be
  // enforced without a proposer to compare the approver against, which is why
  // `proposer_unrecorded` blocks `awaiting_blueprint_approval`. `loadAndAuthorize` has already
  // refused an absent admin, so these fallbacks are for an identity that authenticated with no
  // email rather than for an anonymous caller.
  const proposedBy = input.admin?.email ?? input.admin?.id ?? 'unknown';

  const { writeBlueprintManifest } = await import('./manifestWriter');
  const out = await writeBlueprintManifest({
    tenantId: row.tenant_id,
    origin: originFor(input.kind),
    projectId: input.projectId,
    refs,
    proposedBy,
  });

  log({
    outcome: 'success',
    correlation_id: input.correlationId ?? null,
    project_id: input.projectId,
    kind: input.kind,
    manifest_id: out.manifestId,
    revision: out.revision,
    created: out.created,
    requirement_count: refs.sources.length,
    // Distinguishable in the log, because `[]` and `null` mean different things and the log is
    // where an operator asks why a project is still blocked at `requirements_ready`.
    coverage_measured: Array.isArray(refs.coverage.uncitedRequirementBlocks),
    uncited_requirement_blocks: refs.coverage.uncitedRequirementBlocks?.length ?? null,
  });

  return {
    persisted: true,
    manifestId: out.manifestId,
    revision: out.revision,
    created: out.created,
    contentSha256: out.contentSha256,
  };
}
