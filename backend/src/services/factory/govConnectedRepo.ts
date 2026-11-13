/**
 * govConnectedRepo — resolve the connected build repo for a gov delivery project: the `solution_build`
 * track's student project's GitHub connection, shaped read-only (owner/name/url + blob paths + the
 * classified deliverable documents).
 *
 * Why this is its own module: it is called from TWO places that must agree — the full student-safe
 * projection (govProjectProjection, which folds it into connectedRepo) AND the per-file content endpoint
 * (which uses `deliverables` as the allowlist of what it will fetch). Keeping one resolver means the
 * cards the UI shows and the files the endpoint will serve can never drift apart.
 *
 * It is LIGHTWEIGHT and SIDE-EFFECT-FREE on purpose: no document sync, no plan publish, no live GitHub
 * call (it reads the already-synced tree). That makes it safe to call on every file open. Carries NO
 * token, secret, or identity — only owner/name/url and paths.
 */
import { deliverablesFromTree, type RepoDeliverable } from './repoDeliverables';

export interface ConnectedRepoView {
  owner: string;
  name: string;
  url: string;
  /** All blob paths in the synced tree (capped). The content endpoint uses this to tell "exists but is
   *  not a deliverable" (403) from "not in the repo" (404). */
  files: string[];
  fileCount: number;
  syncedAt: string | null;
  /** The subset that are deliverable DOCUMENTS, classified for the card + per-type viewer. */
  deliverables: RepoDeliverable[];
}

/**
 * The connected repo for a gov delivery project, or null when no repo is linked (no `solution_build`
 * track, or a connection row with no repo set). `preloadedTracks` lets a caller that already has the
 * project's ContractTrack rows avoid a second query; the endpoint passes nothing and the resolver loads
 * them itself.
 */
export async function resolveConnectedRepo(
  deliveryProjectId: string, preloadedTracks?: any[],
): Promise<ConnectedRepoView | null> {
  let tracks = preloadedTracks;
  if (!Array.isArray(tracks)) {
    const { default: ContractTrack } = await import('../../models/ContractTrack');
    tracks = await ContractTrack.findAll({ where: { delivery_project_id: deliveryProjectId } });
  }
  const buildTrack = (Array.isArray(tracks) ? tracks : []).find(
    (t) => String(t?.track_type ?? '') === 'solution_build' && t?.solution_student_project_id,
  );
  const studentProjectId = buildTrack ? String(buildTrack.solution_student_project_id) : null;
  if (!studentProjectId) return null;

  const { default: GitHubConnection } = await import('../../models/GitHubConnection');
  const conn: any = await GitHubConnection.findOne({ where: { project_id: studentProjectId } });
  if (!conn || !conn.repo_owner || !conn.repo_name) return null;

  // Deliverable files/paths come from the synced tree only (never a live GitHub call). A malformed/absent
  // tree yields empty lists rather than throwing.
  let files: string[] = [];
  try {
    const tree = conn.file_tree_json?.tree;
    if (Array.isArray(tree)) {
      files = tree.filter((t: any) => t?.type === 'blob' && t?.path).map((t: any) => String(t.path)).slice(0, 300);
    }
  } catch { files = []; }
  const fileCount = typeof conn.file_count === 'number' ? conn.file_count : files.length;
  const syncedAt = conn.last_sync_at ? new Date(conn.last_sync_at).toISOString() : null;
  let deliverables: RepoDeliverable[] = [];
  try { deliverables = deliverablesFromTree(conn.file_tree_json?.tree); } catch { deliverables = []; }

  return {
    owner: String(conn.repo_owner),
    name: String(conn.repo_name),
    url: String(conn.repo_url ?? ''),
    files, fileCount, syncedAt, deliverables,
  };
}
