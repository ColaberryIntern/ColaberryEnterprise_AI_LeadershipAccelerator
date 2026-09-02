/**
 * capabilityRepoReader — resolve the capability inventory against what is
 * actually in a student's repository.
 *
 * ## The gap this closes
 *
 * The Capstone Record's artifact band is built from UPLOADED artifacts that the
 * platform mirrored into `artifacts/`, and the mirror only handles `.md`, `.txt`
 * and `.csv` (`TEXT_EXTENSIONS`); everything else is held platform-side. The
 * compiler then drops any artifact with no repo path, because "a row that cannot
 * point at a file is not evidence."
 *
 * Meanwhile the rebuilt labs have students BUILD in their own repo and commit it
 * themselves — an MCP server, three subagents, a reliability module, a recording.
 * So a student can do everything right and see a nearly empty portfolio page,
 * because the portfolio reads the upload mirror rather than the repository.
 *
 * This reads the repository.
 *
 * ## It needs no GitHub calls
 *
 * `github_connections.file_tree_json` already holds the tree, refreshed by the
 * existing connect and sync paths. Measured 2026-08-28: 25 of 30 connections have
 * one, the largest 555 entries, and seven students already have `.claude/skills/`
 * populated with 18 to 32 entries that no surface currently shows them credit for.
 *
 * ## Counting a collection means counting THINGS, not files
 *
 * `.claude/skills/` with 32 entries is not 32 skills — it is a handful of skills
 * each with several files. A capability whose floor is 3 would be satisfied by one
 * skill that happened to contain three files, which is exactly the kind of inflated
 * number that makes a portfolio untrustworthy. So a collection counts DISTINCT
 * IMMEDIATE CHILDREN of the evidence prefix, which is one skill folder or one agent
 * file either way.
 *
 * PURE. No I/O, no clock. The shell that loads a connection is at the bottom and is
 * the only part that touches a model.
 */
import { CAPABILITIES, CapabilityEntry, Inventory } from './capabilityInventory';

/** One entry from a stored GitHub tree. `type` is 'blob' or 'tree'. */
export interface TreeEntry {
  path: string;
  type?: string;
}

const norm = (p: string): string => p.replace(/^\.\//, '').replace(/^\/+/, '');

/**
 * How many distinct things live directly under `prefix`.
 *
 * `.claude/skills/foo/SKILL.md` and `.claude/skills/foo/README.md` are ONE thing.
 * `.claude/agents/reviewer.md` is also one. Both collapse to their first path
 * segment after the prefix, so a folder-per-item layout and a file-per-item layout
 * count the same way without either being special-cased.
 */
export function countImmediateChildren(paths: string[], prefix: string): number {
  const p = norm(prefix).replace(/\/+$/, '') + '/';
  const seen = new Set<string>();
  for (const raw of paths) {
    const path = norm(raw);
    if (!path.startsWith(p)) continue;
    const rest = path.slice(p.length);
    if (!rest) continue;                       // the prefix directory itself
    seen.add(rest.split('/')[0]);
  }
  return seen.size;
}

/**
 * Extensions that can carry proof a thing RAN.
 *
 * A service is only complete when the student showed it working, and the labs ask
 * for a screen recording committed to `artifacts/week-NN/`. That folder is also
 * where the platform mirrors uploaded documents, so "any file is here" is not the
 * same claim at all.
 *
 * Found the hard way on the first production run: Quincy's `artifacts/week-05/`
 * contains `mcp-server-configuration.csv`, a mirrored document, and the reader
 * scored his MCP server as PROVEN on the strength of it. A portfolio that says a
 * server was demonstrated when a spreadsheet was uploaded is worse than one that
 * says nothing.
 */
const RUN_EVIDENCE_EXTENSIONS = ['.mp4', '.mov', '.webm', '.gif', '.mp3', '.m4a', '.wav'];

/** Is there something under `prefix` that could actually show a run? */
export function hasRunEvidence(paths: string[], prefix: string): boolean {
  const p = norm(prefix).replace(/\/+$/, '') + '/';
  return paths.some((raw) => {
    const path = norm(raw).toLowerCase();
    if (!path.startsWith(p.toLowerCase())) return false;
    return RUN_EVIDENCE_EXTENSIONS.some((ext) => path.endsWith(ext));
  });
}

/** Does anything in the tree sit at, or under, this path? */
export function pathPresent(paths: string[], target: string): boolean {
  const t = norm(target).replace(/\/+$/, '');
  const asDir = t + '/';
  return paths.some((raw) => {
    const path = norm(raw);
    return path === t || path.startsWith(asDir);
  });
}

/**
 * Observe every capability against one repo tree. PURE.
 *
 * A capability the tree says nothing about is returned ABSENT rather than omitted,
 * so the merge has something to ratchet from and a caller can render "not yet"
 * without inferring it from a missing key.
 *
 * `CAPSTONE` is composite and is skipped: it is derived from the other ten by
 * `capstoneProgress`, and observing it directly would invent a fact.
 */
export function observeCapabilities(enrollmentId: string, tree: TreeEntry[]): Inventory {
  const paths = tree.map((t) => t.path).filter((p): p is string => typeof p === 'string' && p.length > 0);

  const entries: CapabilityEntry[] = [];
  for (const def of CAPABILITIES) {
    if (def.shape === 'composite') continue;

    const present = def.evidence.some((e) => pathPresent(paths, e));

    let count = present ? 1 : 0;
    if (def.shape === 'collection') {
      // Sum across evidence prefixes rather than taking the first: a capability
      // may legitimately live in more than one place.
      count = def.evidence.reduce((n, e) => n + countImmediateChildren(paths, e), 0);
    }

    const entry: CapabilityEntry = { id: def.id, present, count };

    // A service has to be shown RUNNING, and a static tree cannot show that. What
    // it can show is that the student committed a RECORDING to the folder the lab
    // told them to use, which is the whole reason step 7 of those labs exists.
    // Deliberately not `pathPresent`: that folder also receives the platform's
    // mirrored uploads, so any-file-present would score a spreadsheet as a demo.
    if (def.shape === 'service') entry.proven = def.runEvidence ? hasRunEvidence(paths, def.runEvidence) : false;

    entries.push(entry);
  }

  return { enrollmentId, entries };
}

/**
 * Read a student's repositories and observe their capabilities across ALL of them.
 *
 * ## Why all, and not one
 *
 * A few enrollments have more than one `github_connections` row, and `getConnection`
 * is a `findOne` with no ordering — so which repository got read was decided by whatever
 * order Postgres happened to return. Quincy Nkwain Ninying has `qninying/ambit` at 134
 * files and `qninying/ai-operations-center` at 329, and he could be scored off either.
 * Reading one arbitrarily is not a smaller answer, it is a RANDOM one.
 *
 * Merging is also the honest reading of the evidence: a student who built their skills in
 * one repository and their MCP server in another has built both. `mergeInventory`
 * ratchets, so combining observations can only ever add.
 *
 * Degrades to an empty observation rather than throwing: a student with no connection, or
 * whose trees have never been fetched, has nothing to observe — a fact, not an error.
 */
export async function readCapabilitiesFromRepo(enrollmentId: string): Promise<Inventory> {
  try {
    const { default: GitHubConnection } = await import('../../models/GitHubConnection');
    const { mergeInventory } = await import('./capabilityInventory');

    const conns: any[] = await GitHubConnection.findAll({ where: { enrollment_id: enrollmentId } });

    let merged: Inventory | null = null;
    for (const conn of conns) {
      const tree: TreeEntry[] = conn?.file_tree_json?.tree;
      if (!Array.isArray(tree) || tree.length === 0) continue;
      merged = mergeInventory(merged, observeCapabilities(enrollmentId, tree));
    }

    return merged ?? { enrollmentId, entries: [] };
  } catch (err: any) {
    console.warn('[capability] repo tree unreadable:', err?.message);
    return { enrollmentId, entries: [] };
  }
}
