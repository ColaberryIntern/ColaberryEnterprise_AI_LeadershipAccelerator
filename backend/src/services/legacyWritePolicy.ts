/**
 * legacyWritePolicy — what the THREE legacy writers may put in a student's repo.
 *
 * `claudeMdService.pushClaudeMdToRepo` and `projectScaffoldService.generateAndPushScaffold`
 * predate the SBP pipeline. Both full-replaced every file they touched, including
 * files the student wrote, and neither asked whether the platform had push access
 * first. The SBP writer (`sbp/repoWriter`) solved all of this behind an allowlist
 * and a managed-block splice; these two never got the same treatment, so an
 * `autoSync` through either of them wiped the SBP managed block out of CLAUDE.md
 * and took anything the student had written beside it.
 *
 * This module is the missing half: which paths a legacy writer may touch AT ALL,
 * and for each one, HOW it is allowed to touch it. Pure — no I/O, no models — so
 * the rules are testable without a repo, which is the property that made
 * `managedBlock` and `renderDocs.isAllowedPath` trustworthy.
 *
 * The allowlist is deliberately NOT `renderDocs.PATH_ALLOWLIST`. That one governs
 * the SBP document set (`CLAUDE.md`, `docs/**`, `.colaberry/**`); the legacy
 * scaffold writes a different, older set, and reusing the SBP list would have
 * silently blocked all of it rather than bounding it. Two writers with genuinely
 * different outputs get two explicit lists, and neither may write outside its own.
 */

/**
 * How a legacy writer is permitted to write one path.
 *
 * - `managed_block` — the student owns the file; we own a delimited block inside
 *   it and nothing else. Spliced via `sbp/managedBlock`.
 * - `platform_owned` — a pure projection of database state that carries no
 *   student authorship, so replacing it loses nothing.
 * - `seed_once` — written only when absent. The student authors these after we
 *   create them, and a refresh would overwrite prose we never wrote.
 */
export type LegacyWriteMode = 'managed_block' | 'platform_owned' | 'seed_once';

/**
 * The ONLY paths a legacy writer may touch, each with the mode that governs it.
 *
 * Every pattern is fully anchored. That is what stops `getContractFolders` —
 * which derives folder names from LLM-authored contract JSON — from turning a
 * `folder: "../../.github/workflows"` into a write outside the intended tree.
 * An unanchored or directory-prefix match would have allowed exactly that.
 */
export const LEGACY_WRITE_POLICY: ReadonlyArray<{ readonly re: RegExp; readonly mode: LegacyWriteMode }> = [
  // Theirs. We get a block inside it, never the whole file.
  { re: /^CLAUDE\.md$/, mode: 'managed_block' },
  // Machine state, rendered wholly from the DB on every run.
  { re: /^PROJECT_STATE\.json$/, mode: 'platform_owned' },
  // A projection of the requirements table. `[^/]+` keeps it one level deep.
  { re: /^requirements\/[^/]+\.md$/, mode: 'platform_owned' },
  // We create these once; from then on they are the student's to edit.
  { re: /^README\.md$/, mode: 'seed_once' },
  { re: /^\.gitignore$/, mode: 'seed_once' },
];

/**
 * The mode governing `path`, or null when no legacy writer may touch it.
 *
 * Rejects traversal and absolute paths before the patterns are consulted. The
 * anchored patterns already exclude them, but failing on the shape first means a
 * future pattern cannot accidentally re-admit one.
 */
export function legacyWriteMode(path: string): LegacyWriteMode | null {
  if (!path || path.includes('..') || path.startsWith('/') || path.includes('\\')) return null;
  return LEGACY_WRITE_POLICY.find((p) => p.re.test(path))?.mode ?? null;
}

/** May a legacy writer touch this path at all? */
export function isAllowedLegacyPath(path: string): boolean {
  return legacyWriteMode(path) !== null;
}

/**
 * Thrown before any network call when a writer is asked to do something the
 * policy forbids. A distinct class so the caller can tell "this is a bug in our
 * scaffold" from "GitHub refused us".
 */
export class LegacyWriteRefused extends Error {
  constructor(
    public readonly error_class: 'AllowlistViolation' | 'NoWriteAccess',
    message: string,
  ) {
    super(message);
    this.name = 'LegacyWriteRefused';
  }
}
