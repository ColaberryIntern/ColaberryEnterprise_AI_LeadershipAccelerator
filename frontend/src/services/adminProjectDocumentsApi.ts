import api from '../utils/api';
import type { FileCardKind } from '../components/fileCards/FileCards';

/**
 * Admin client for a project's DOCUMENT + video pieces (the student's portfolio, resolved by the
 * project's enrollment) shown as typed cards on the project delivery panel. Mirrors the backend
 * routes on projectOverviewRoutes.ts. The list is small; the file fetch returns a Blob the card
 * viewer renders or saves.
 */

export interface AdminProjectDocument {
  id: string;
  name: string;
  title: string;
  from: string;
  kind: FileCardKind;
}

export async function listProjectDocuments(projectId: string): Promise<AdminProjectDocument[]> {
  const res = await api.get(`/api/admin/projects/${projectId}/documents`);
  return (res.data?.documents ?? []) as AdminProjectDocument[];
}

export async function fetchProjectDocumentFile(
  projectId: string, artifactId: string, opts?: { download?: boolean },
): Promise<Blob> {
  const res = await api.get(`/api/admin/projects/${projectId}/documents/${artifactId}/file`, {
    params: opts?.download ? { download: '1' } : undefined,
    responseType: 'blob',
  });
  return res.data as Blob;
}
