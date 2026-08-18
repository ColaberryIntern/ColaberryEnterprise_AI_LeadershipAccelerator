/**
 * projectIdentity — WHICH ID IS THIS PROJECT, REALLY?
 *
 * The browser mints an optimistic id (`'p' + Date.now()`) the instant a student
 * starts a build, because the card has to appear before the server has finished
 * thinking. That id is a placeholder. The server's `projects.id` is a UUID, and
 * every `/api/portal/workspace/*` route validates `project_id` with a Zod
 * `.uuid()` — so the moment a pseudo id reaches one of those calls it is
 * rejected with a 400, and the message surfaces under whatever field the student
 * happened to be touching. (That is how a project-id rejection once read as
 * "your GitHub username is invalid".)
 *
 * The placeholder was only ever meant to live until the server answered. It
 * outlived that because `claimBackendProject` recorded the server id in the
 * side-car field `pipelineProjectId` and left `id` alone, and nothing else ever
 * re-keyed the row. This module is the single place that closes the gap:
 * `adoptServerIds` is applied both when a build claims its server id and on
 * every load, so an id already stale in a student's localStorage heals itself.
 *
 * PURE — no storage, no network. Lives in its own module so both projectsStore
 * and projectHydrate can use it without importing each other (that pair would
 * otherwise be a cycle).
 */

/** Backend ids are UUIDs; the browser mints `p<epoch>`; the seeded demo is `sample-salon`. */
export const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

export function isUuid(value: unknown): boolean {
  return typeof value === 'string' && UUID_RE.test(value);
}

/**
 * The minimum shape this module needs. Deliberately structural rather than
 * `StudentProject`, so importing it can never create a store <-> identity cycle.
 */
export interface ProjectIdentity {
  id: string;
  sample?: boolean;
  pipelineProjectId?: string | null;
  /** Pseudo ids this project used to be keyed by, kept so bookmarked URLs resolve. */
  legacyIds?: string[];
  [k: string]: unknown;
}

export interface AdoptResult<T extends ProjectIdentity> {
  list: T[];
  /** Every id that moved, so the caller can migrate id-keyed storage alongside it. */
  remapped: Array<{ from: string; to: string }>;
}

/**
 * Re-key any project that is standing in for a server project so its `id` IS the
 * server UUID.
 *
 * Rules, all failure-first:
 *  - the seeded demo is never touched (it is deliberately browser-only);
 *  - a build with no claim is never touched (there is no server id to adopt —
 *    inventing one would be worse than the placeholder);
 *  - a claim that is not a UUID is ignored rather than adopted, so junk can
 *    never reach the route and 400;
 *  - if a server-keyed row for the same UUID already exists, the two are the
 *    same project seen twice: the server-keyed row wins and absorbs the
 *    placeholder's alias, so the student sees one card, not two;
 *  - idempotent — running it again reports no remap and changes nothing, which
 *    is what makes it safe to call on every load.
 *
 * Does not mutate its input.
 */
export function adoptServerIds<T extends ProjectIdentity>(list: T[]): AdoptResult<T> {
  const remapped: Array<{ from: string; to: string }> = [];
  const out: T[] = [];
  const indexById = new Map<string, number>();

  for (const project of list) {
    const claim = project.pipelineProjectId;
    const adopt = !project.sample && isUuid(claim) && project.id !== claim;
    const targetId = adopt ? String(claim) : project.id;

    const existing = indexById.get(targetId);
    if (existing !== undefined) {
      // Same project seen twice. Keep the row already keyed by the server id and
      // fold in the placeholder's alias so its old URLs keep resolving.
      if (adopt) {
        const keep = out[existing];
        out[existing] = { ...keep, legacyIds: mergeAliases(keep.legacyIds, project.id) };
        remapped.push({ from: project.id, to: targetId });
      }
      continue;
    }

    if (adopt) {
      remapped.push({ from: project.id, to: targetId });
      out.push({ ...project, id: targetId, legacyIds: mergeAliases(project.legacyIds, project.id) });
    } else {
      out.push(project);
    }
    indexById.set(targetId, out.length - 1);
  }

  return { list: out, remapped };
}

function mergeAliases(existing: string[] | undefined, alias: string): string[] {
  const aliases = Array.isArray(existing) ? existing.filter((a) => typeof a === 'string' && a) : [];
  return aliases.includes(alias) ? aliases : [...aliases, alias];
}
