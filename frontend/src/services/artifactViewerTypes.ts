/**
 * Shared by the admin artifact viewer and the learner's own My work page (C128): the file kinds the
 * viewers know, the file part of a piece, and WHERE a viewer fetches the bytes from.
 *
 * Mirrors backend/src/services/internship/internArtifactViewer.ts (ArtifactFileKind, InternArtifactView.file).
 */
export type ArtifactFileKind = 'pdf' | 'csv' | 'word' | 'slides' | 'spreadsheet' | 'image' | 'text' | 'other';

export interface ArtifactFile {
  name: string;
  kind: ArtifactFileKind;
  available: boolean;
  text: string | null;
  table: string[][] | null;
  note: string | null;
}

/**
 * Where a viewer reads one piece's bytes. The admin viewer reads /api/admin/internship/artifacts with the
 * admin token; My work reads /api/portal/career/work with the learner's own token. Each needs a bearer, so
 * the viewers fetch Blobs rather than pointing an <iframe src> or <a href> at the API.
 */
export interface ArtifactSource {
  /** The uploaded file. `as` forces the Blob type (a PDF must reach the browser's viewer as a PDF). */
  file(id: string, as?: string): Promise<Blob>;
  /** A Word / PowerPoint file rendered as a self-contained HTML page. */
  preview(id: string): Promise<string>;
  /** A CSV piece as an Excel workbook. */
  xlsx(id: string): Promise<Blob>;
}

/** Save a Blob under a file name (Excel, Word and PowerPoint open it from the download). */
export function saveBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
