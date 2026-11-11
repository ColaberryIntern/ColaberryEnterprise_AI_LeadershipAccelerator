import api from '../utils/api';
import { saveBlob, type ArtifactFile, type ArtifactFileKind, type ArtifactSource } from './artifactViewerTypes';

export { saveBlob };
export type { ArtifactFileKind };

/** Mirrors backend/src/services/internship/internArtifactViewer.ts InternArtifactView. */
export interface InternArtifactView {
  id: string;
  kind: string;
  title: string;
  createdAt: string;
  intern: string;
  html: string | null;
  externalUrl: string | null;
  file: ArtifactFile | null;
  data: Record<string, unknown>;
}

const base = (id: string): string => `/api/admin/internship/artifacts/${encodeURIComponent(id)}`;

export async function fetchInternArtifact(id: string): Promise<InternArtifactView> {
  const res = await api.get<InternArtifactView>(base(id));
  return res.data;
}

/**
 * The uploaded file as a Blob (the API needs the admin Bearer token, so a plain <a href> or
 * <iframe src> to the API would arrive unauthenticated). `as` forces the Blob type, so a PDF is
 * always handed to the browser's PDF viewer as a PDF.
 */
export async function fetchArtifactFile(id: string, as?: string): Promise<Blob> {
  const res = await api.get<Blob>(`${base(id)}/file`, { responseType: 'blob' });
  return as ? new Blob([res.data], { type: as }) : res.data;
}

/** A Word / PowerPoint artifact rendered as a self-contained HTML page. */
export async function fetchArtifactPreview(id: string): Promise<string> {
  const res = await api.get<{ html: string }>(`${base(id)}/preview`);
  return res.data.html;
}

/** A CSV artifact as a formatted Excel workbook. */
export async function fetchArtifactXlsx(id: string): Promise<Blob> {
  const res = await api.get<Blob>(`${base(id)}/xlsx`, { responseType: 'blob' });
  return res.data;
}

/** The admin viewer's byte source, for the shared ArtifactFileViewer. */
export const adminArtifactSource: ArtifactSource = { file: fetchArtifactFile, preview: fetchArtifactPreview, xlsx: fetchArtifactXlsx };
