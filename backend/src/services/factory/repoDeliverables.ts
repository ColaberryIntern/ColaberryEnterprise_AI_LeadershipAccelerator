/**
 * repoDeliverables — classify a connected repo's synced file tree into the DELIVERABLE DOCUMENTS
 * worth showing as cards in the gov Build Evidence screen, reusing the portfolio's file-kind
 * taxonomy so the same per-type viewers apply.
 *
 * Why this exists: the gov cockpit's Build Evidence used to list every repo blob path as flat text.
 * Ali asked for the portfolio's card + per-type viewer treatment. The portfolio only ever cards
 * uploaded DELIVERABLE documents, not source files — so we filter the repo tree to a document/media
 * allowlist and classify each by `fileKind`. Source files (.js/.ts/.env/...) are intentionally
 * excluded: they are not deliverables, and excluding them also keeps secrets/source off this
 * read-only surface.
 *
 * Scope (Ali, 2026-11-13): STRUCTURED documents and video only — pdf, Word, Excel, PowerPoint, RTF,
 * CSV, and video. Markup/plain-text files (html/htm, md, txt) are deliberately NOT deliverables here:
 * they are not structured documents, so they never become cards.
 *
 * Pure + I/O-free: operates on an already-synced `file_tree_json.tree`, never a live GitHub call.
 */
import { fileKind, ArtifactFileKind } from '../internship/internArtifactViewer';

/** video is its own kind (an inline <video> player), on top of the uploaded-document kinds
 *  `fileKind` already knows (pdf/csv/word/slides/spreadsheet/other). */
export type DeliverableKind = ArtifactFileKind | 'video';

/** Deliverable DOCUMENT extensions shown as cards: structured documents only
 *  (pdf/docx/doc/pptx/ppt/xlsx/xls/rtf/csv). Deliberately NOT source code and NOT html/md/txt. */
const DELIVERABLE_EXT = new Set<string>([
  'pdf', 'docx', 'doc', 'pptx', 'ppt', 'xlsx', 'xls', 'rtf', 'csv',
]);

/** Video deliverable extensions, classified as the `video` kind (inline player). */
const VIDEO_EXT = new Set<string>(['mp4', 'mov', 'webm', 'm4v']);

export interface RepoDeliverable {
  /** Full repo-relative blob path (the key the content endpoint validates + fetches). */
  path: string;
  /** Basename, for the card title. */
  name: string;
  /** Which viewer the card opens. */
  kind: DeliverableKind;
}

/** The deliverable kind for a filename, or null when the extension is not a deliverable document/video. */
export function deliverableKind(name: string): DeliverableKind | null {
  const ext = /\.([a-z0-9]+)$/i.exec(name)?.[1]?.toLowerCase() ?? '';
  if (VIDEO_EXT.has(ext)) return 'video';
  if (!DELIVERABLE_EXT.has(ext)) return null;
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
