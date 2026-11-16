/**
 * THE GATE STOPS MEASURING WHAT IT WAS HANDED: source coverage is read from the STORED
 * decomposition document, never from the compose request body. L7.6 blocker B2.
 *
 * ## The defect this closes
 *
 * `blueprintPersistence.buildRefs` built the ref set out of `input.project`, which is the HTTP
 * body. The compose route's Zod schema is deliberately shallow (`z.record(z.string(),
 * z.unknown())`), so nothing validated it deeper. `factoryToManifestRefs` then honoured an
 * explicitly empty `source_blocks: []` as a MEASUREMENT - "there are no requirement blocks, so
 * none are uncited" - and that measurement satisfies the `source_block_uncited` prerequisite at
 * `requirements_ready`.
 *
 * So a caller could clear a governance gate for a project whose stored document holds requirement
 * blocks that no task cites, by posting two characters. Nothing compared the posted blocks against
 * `contract_process_documents`. The caller must already be a trusted program-section admin, so
 * this is control integrity rather than privilege escalation - but a gate that reads its own
 * evidence from the request is not a gate.
 *
 * ## The fix was already half-built, and that is the point
 *
 * `gatherCompositionInput.loadFactoryProject` already reads the stored document, and already
 * carries a `sourceBlocksPresent` flag whose own comment says it is "Passed to
 * `persistComposedBlueprint` only when true". `PersistComposedInput` has no such field. The flag
 * was a producer with no consumer - the same shape as the three producers B2's own ticket was
 * opened about.
 *
 * It is consumed HERE rather than threaded through the route as a parameter, deliberately. A
 * parameter can be omitted, mis-set, or simply forgotten by the next caller, and the value it
 * carries is exactly the claim a caller must not be trusted to make. The persister loads the
 * document itself, so there is no argument through which a false claim can arrive.
 *
 * ## Both halves, because one half would not close it
 *
 * The coverage rule is "every source block of kind `requirement` appears in at least one task's
 * `source_evidence`". Taking the BLOCKS from storage while leaving the TASKS in the body would
 * leave the gate satisfiable by posting a task that cites everything. So both halves come from
 * the stored document, and neither is read from the body any more.
 *
 * ## What this does NOT do, measured rather than guessed (production, 2026-11-16, read-only)
 *
 * REQUIREMENTS still come from the body. `loadFactoryProject` returns them too, so sourcing them
 * from storage would have been a one-line extension - and it would block almost every delivery
 * project at the same gate on a different rule:
 *
 *   | Stored `contract_requirements` rows | 1,264 |
 *   | Rows with NO `source_document` (provenance) | 1,241 |
 *   | Delivery projects with a lifecycle row | 11 |
 *   | ...that would then be BLOCKED on `requirement_without_provenance` | 10 of 11 |
 *   | ...including the live client build `80b35be2` (56 of 56 rows unprovenanced) | yes |
 *
 * That is a different decision with a client cost attached, and CLAUDE.md's scope lock says to
 * log it rather than fold it in. It is recorded in docs/sessions/CC-20261112-p4q7-b2.md for the
 * DRI. The STUDENT path is also unchanged: `sbpToManifestRefs` records coverage `[]` vacuously
 * because SBP has no source-block layer at all, which its own comment documents as a limitation
 * rather than a pass.
 */
import type {
  FactorySourceBlockLike, FactoryTaskLike,
} from './adapters/factoryAdapter';

/**
 * Where the coverage measurement came from, for the log and for the caller's own record.
 *
 * `unreadable` is kept apart from `absent` on purpose. They produce the same refs - coverage
 * unmeasurable, so the prerequisite keeps blocking - and they are different operational facts:
 * one is a project that has not been decomposed yet, the other is a database that could not be
 * read. Collapsing them would make a transient outage look like a project state.
 */
export type CoverageSource =
  | 'stored_document'
  | 'no_stored_document'
  | 'stored_document_unreadable';

export interface StoredCoverageInputs {
  /**
   * ABSENT MEANS UNMEASURABLE. Omitted entirely when the document does not exist, could not be
   * read, or stored no `source_blocks` key - because `factoryToManifestRefs` distinguishes an
   * absent `sourceBlocks` (coverage `null`, prerequisite keeps blocking) from an empty one
   * (measured: no blocks, so none uncited). Writing `[]` here would launder the first into the
   * second, which is the defect this module exists to close.
   */
  sourceBlocks?: ReadonlyArray<FactorySourceBlockLike>;
  /** The other half of the coverage rule. `[]` when there is no document to read tasks from. */
  tasks: ReadonlyArray<FactoryTaskLike>;
  /**
   * The stored document's version, FOR THE LOG ONLY.
   *
   * Deliberately not used to pin the refs. `factoryToManifestRefs` takes ONE `documentVersion`
   * and applies it to every collection, including the requirement refs that still come from the
   * body - so pinning the document's version there would stamp a revision onto records that were
   * not read at it. A false pin is worse than an unrecorded one, which is what `null` already
   * says.
   */
  documentVersion: number | null;
  source: CoverageSource;
}

function log(fields: Record<string, unknown>): void {
  // eslint-disable-next-line no-console
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: fields.outcome === 'failure' ? 'error' : 'info',
    service: 'backend',
    event: 'lifecycle_coverage_source_resolved',
    ...fields,
  }));
}

/** Nothing measurable, in the one shape every refusal branch returns. */
function unmeasurable(source: CoverageSource): StoredCoverageInputs {
  return { tasks: [], documentVersion: null, source };
}

/**
 * A collection read out of JSONB that the coverage rule can actually walk.
 *
 * `doc_json` is `DataTypes.JSONB` typed `any`, validated by `factoryValidate` at write time and
 * by NOTHING at read time, and `reconstructFactoryProject` does `tasks: d.tasks ?? []` with no
 * `Array.isArray`. Until this change those collections arrived in a request body; now they come
 * from that column, so its malformed shapes are newly reachable.
 *
 * MEASURED RATHER THAN IMAGINED. All four of these were run against the shipped adapter
 * (2026-11-16): `tasks` as an object threw `tasks is not iterable`, as a string threw
 * `.map is not a function`, and a single `null` element threw on `.source_evidence` and on
 * `.kind`. Each one is a 500 from compose with nothing persisted.
 *
 * One unreadable ELEMENT makes the whole collection unreadable, matching `readableSources` in
 * `lifecycleEvidence`: measuring the remainder would publish a SHORTER uncited list, and a
 * shorter gap list reads as better news.
 */
function readableCollection(value: unknown): value is ReadonlyArray<Record<string, unknown>> {
  return Array.isArray(value)
    && value.every((x) => x !== null && typeof x === 'object' && !Array.isArray(x));
}

/**
 * Read the coverage rule's two halves from the stored decomposition document.
 *
 * Returns the UNMEASURABLE shape - no `sourceBlocks`, no tasks - when the project has no stored
 * document or when the read fails. Fail closed: "I could not read the authority" must never
 * resolve wider than "the authority says no", which here means coverage stays `null` and
 * `source_block_uncited` keeps refusing.
 *
 * It does not throw. A compose that cannot read the document should still file an honest manifest
 * that records the gap, rather than returning a 500 and persisting nothing - the composition
 * result the caller already has is the useful half, and a manifest whose coverage is `null` is a
 * true statement about an unreadable document.
 */
export async function storedCoverageInputs(
  deliveryProjectId: string,
  correlationId?: string | null,
): Promise<StoredCoverageInputs> {
  let loaded;
  try {
    const { loadFactoryProject } = await import('./generation/gatherCompositionInput');
    loaded = await loadFactoryProject(deliveryProjectId);
  } catch (err: unknown) {
    log({
      outcome: 'failure',
      correlation_id: correlationId ?? null,
      delivery_project_id: deliveryProjectId,
      coverage_source: 'stored_document_unreadable',
      // The CLASS, never the message: a driver error can carry the connection string.
      error_class: (err as { name?: string })?.name ?? 'UnclassifiedError',
    });
    return unmeasurable('stored_document_unreadable');
  }

  if (!loaded.ok) {
    log({
      outcome: 'success',
      correlation_id: correlationId ?? null,
      delivery_project_id: deliveryProjectId,
      coverage_source: 'no_stored_document',
      reason: loaded.reason,
    });
    return unmeasurable('no_stored_document');
  }

  // THE JSONB BOUNDARY, GUARDED. See `readableCollection`: a malformed `doc_json` otherwise
  // throws a TypeError inside the coverage rule, which is a 500 from compose with nothing
  // persisted. Unmeasurable instead, which is the honest answer and the narrow one.
  const malformed = [
    ...(readableCollection(loaded.project.tasks) ? [] : ['tasks']),
    ...(loaded.sourceBlocksPresent && !readableCollection(loaded.project.source_blocks)
      ? ['source_blocks'] : []),
  ];
  if (malformed.length > 0) {
    log({
      outcome: 'failure',
      correlation_id: correlationId ?? null,
      delivery_project_id: deliveryProjectId,
      coverage_source: 'stored_document_unreadable',
      error_class: 'ContractViolation',
      document_version: loaded.documentVersion,
      // WHICH collection, so an operator can go and look at the row. Never the contents.
      malformed_collections: malformed,
    });
    return unmeasurable('stored_document_unreadable');
  }

  const tasks = loaded.project.tasks as ReadonlyArray<FactoryTaskLike>;
  log({
    outcome: 'success',
    correlation_id: correlationId ?? null,
    delivery_project_id: deliveryProjectId,
    coverage_source: 'stored_document',
    document_version: loaded.documentVersion,
    track_type: loaded.trackType,
    source_blocks_present: loaded.sourceBlocksPresent,
    stored_source_blocks: loaded.sourceBlocksPresent ? loaded.project.source_blocks.length : null,
    stored_tasks: tasks.length,
  });

  return {
    // READ FROM THE FLAG, NOT FROM THE ARRAY. `reconstructFactoryProject` does
    // `source_blocks: d.source_blocks ?? []`, so by the time the project exists the absent and
    // empty cases are the same array and only this flag still tells them apart.
    ...(loaded.sourceBlocksPresent
      ? { sourceBlocks: loaded.project.source_blocks as ReadonlyArray<FactorySourceBlockLike> }
      : {}),
    tasks,
    documentVersion: loaded.documentVersion,
    source: 'stored_document',
  };
}
