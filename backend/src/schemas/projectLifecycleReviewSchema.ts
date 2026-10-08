/**
 * Zod schemas for the blueprint REVIEW routes: compare two revisions, request changes to one.
 *
 * A separate module because `projectLifecycleSchema.ts` reached CLAUDE.md's hard ceiling of 12
 * public symbols with these four added, and the rule is that the change which crosses the ceiling
 * splits the file rather than deferring it. The split is along a real seam: these two schemas
 * belong to the review surface, the others to status, transition and approval.
 *
 * `projectKind` is IMPORTED rather than redeclared. A second `z.enum(['student', 'delivery'])`
 * would be a second definition of the vocabulary, free to drift from the first — which is the
 * exact error class this phase has already corrected three times.
 *
 * No `.strict()` on the body, for the reason given in the sibling module's header: a `.strict()`
 * route 400s on an unknown key, which breaks a frontend deployed ahead of its backend, and this
 * repo has shipped that failure.
 */
import { z } from 'zod';
import { projectKind } from './projectLifecycleSchema';

/**
 * Which two revisions to compare.
 *
 * Both are OPTIONAL TOGETHER: with neither, the service compares the newest two, which is the
 * question a reviewer is actually asking. Supplying only one is accepted by the schema and
 * REFUSED by the service, which reports which revisions exist — a 400 here would say only
 * "invalid" and leave the caller guessing what it should have asked for.
 */
export const compareQuery = z.object({
  kind: projectKind,
  from: z.coerce.number().int().min(1).optional(),
  to: z.coerce.number().int().min(1).optional(),
});

/**
 * A request for changes to one exact revision.
 *
 * `text` has `min(1)` AFTER the trim, so whitespace is not a change request. An empty request
 * would park the project on `awaiting_input` with nothing for its author to act on, and the
 * author would have no way to tell it from a bug.
 *
 * `revision` is required with no default, for the same reason `approveBody.expectedRevision` is:
 * a default records the request against whatever is newest, so a reviewer reading r3 would file
 * against r4 without being told.
 */
export const changeRequestBody = z.object({
  kind: projectKind,
  revision: z.coerce.number().int().min(1),
  text: z.string().trim().min(1, 'text is required').max(2000),
});


export type CompareQuery = z.infer<typeof compareQuery>;
export type ChangeRequestBody = z.infer<typeof changeRequestBody>;
