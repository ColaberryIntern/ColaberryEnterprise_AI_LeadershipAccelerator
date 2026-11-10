import api from '../utils/api';

/** Mirrors backend/src/services/internship/internArtifactViewer.ts InternArtifactView. */
export interface InternArtifactView {
  id: string;
  kind: string;
  title: string;
  createdAt: string;
  intern: string;
  html: string | null;
  externalUrl: string | null;
  file: { name: string; text: string | null; note: string | null } | null;
  data: Record<string, unknown>;
}

export async function fetchInternArtifact(id: string): Promise<InternArtifactView> {
  const res = await api.get<InternArtifactView>(`/api/admin/internship/artifacts/${encodeURIComponent(id)}`);
  return res.data;
}
