/**
 * repoDeliverables — classify a connected repo's synced file tree into the DELIVERABLE DOCUMENTS
 * worth showing as cards in the gov Build Evidence screen, reusing the portfolio's file-kind
 * taxonomy so the same per-type viewers apply.
 *
 * Why this exists: the gov cockpit's Build Evidence used to list every repo blob path as flat text.
 * Ali asked for the portfolio's card + per-type viewer treatment ("html, word, excel, pdf..."). The
 * portfolio only ever cards uploaded DELIVERABLE documents, not source files — so we filter the repo
 * tree to the same document allowlist (the Build Artifact Lab's ACCEPT_EXT, plus html) and classify
 * each by `fileKind`. Source files (.js/.ts/.env/...) are intentionally excluded: they are not
 * deliverables, and excluding them also keeps secrets/source off this read-only surface.
 *
 * Pure + I/O-free: operates on an already-synced `file_tree_json.tree`, never a live GitHub call.
 */
import { fileKind, ArtifactFileKind } from '../internship/internArtifactViewer';

/** html is its own kind (rendered in a sandboxed iframe, like the portfolio's field-guide body),
 *  on top of the uploaded-document kinds `fileKind` already knows. */
export type DeliverableKind = ArtifactFileKind | 'html';

/** Deliverable DOCUMENT extensions shown as cards. Mirrors buildArtifactService.ACCEPT_EXT
 *  (pdf/docx/doc/pptx/ppt/xlsx/xls/rtf/txt/md/csv) plus html/htm. Deliberately NOT source code. */
const DELIVERABLE_EXT = new Set<string>([
  'pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'rtf', 'txt', 'md', 'csv', 'html', 'htm',
]);

export interface RepoDeliverable {
  /** Full repo-relative blob path (the key the content endpoint validates + fetches). */
  path: string;
  /** Basename, for the card title. */
  name: string;
  /** Which viewer the card opens. */
  kind: DeliverableKind;
}

/** The deliverable kind for a filename, or null when the extension is not a deliverable document. */
export function deliverableKind(name: string): DeliverableKind | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  if (!DELIVERABLE_EXT.has(ext)) return null;
  if (ext === 'html' || ext === 'htm') return 'html';
  return fileKind(name);
}

/**
 * Deliverables from a synced file tree: blob paths whose extension is a deliverable document,
 * classified and capped. A malformed/absent tree yields an empty list (never throws).
 */
export function deliverablesFromTree(tree: unknown, cap = 300): RepoDeliverable[] {
  if (!Array.isArray(tree)) return [];
  const out: RepoDeliverable[] = [];
  for (const t of tree as any[]) {
    if (!t || t.type !== 'blob' || typeof t.path !== 'string' || !t.path) continue;
    const kind = deliverableKind(t.path);
    if (!kind) continue;
    const name = t.path.split('/').pop() || t.path;
    out.push({ path: t.path, name, kind });
    if (out.length >= cap) break;
  }
  return out;
}
