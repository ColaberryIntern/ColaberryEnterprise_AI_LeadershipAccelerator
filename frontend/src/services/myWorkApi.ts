/**
 * myWorkApi - the learner's own pieces of work (C128). Mirrors backend/src/services/myWork/myWorkModel.ts
 * (WorkItem, WrittenBody, LinkBody, RecordingBody) and myWorkService.ts (MyWorkPiece). Keep in sync by hand,
 * the same convention as careerApi.ts.
 *
 * Every call is authenticated as the learner (portalApi); the server only ever answers for the caller's own
 * pieces, so there is no id here that could reach anyone else's.
 */
import portalApi from '../utils/portalApi';
import type { ArtifactFile, ArtifactSource } from './artifactViewerTypes';

export type WorkGroup = 'written' | 'guide' | 'link' | 'recording' | 'pdf' | 'sheet' | 'word' | 'slides' | 'image' | 'notes' | 'file';

export interface WorkItem {
  id: string;
  kind: string;
  group: WorkGroup;
  title: string;
  from: string;
  createdAt: string;
  week: number | null;
  project: string | null;
  skills: string[];
  state: string;
  /** C130: in the learner's LIVE featured set (shows on Preview; public only after review). */
  featured?: boolean;
  /** C138: shared with the learner's own cohort in the Showcase. Independent of `featured`. */
  shared?: boolean;
}

export type WrittenBody =
  | { form: 'sections'; sections: Array<{ heading: string; body: string }> }
  | { form: 'decision'; fields: Array<{ label: string; value: string }>; receipt: { counts: Array<{ label: string; value: string }>; note: string | null } | null };

export interface LinkBody { url: string | null; reflection: string | null; stages: string[]; aiDisclosure: string | null; projectProofUrl: string | null }
export interface RecordingBody { durationSeconds: number | null; projectName: string | null; mode: string | null }

export interface MyWorkPiece extends WorkItem {
  html: string | null;
  externalUrl: string | null;
  file: ArtifactFile | null;
  data: Record<string, unknown>;
  written: WrittenBody | null;
  link: LinkBody | null;
  recording: RecordingBody | null;
  /** C130: featured now, and on the public page right now (approved, content unchanged). */
  feature?: { featured: boolean; onPublicPage: boolean };
  /** C138: shared with the learner's cohort in the Showcase right now. */
  share?: { shared: boolean };
}

const P = '/api/portal/career/work';
const one = (id: string): string => `${P}/${encodeURIComponent(id)}`;

export async function fetchMyWork(): Promise<WorkItem[]> {
  const { data } = await portalApi.get<{ items: WorkItem[] }>(P);
  return data.items;
}

export async function fetchMyWorkPiece(id: string): Promise<MyWorkPiece> {
  const { data } = await portalApi.get<MyWorkPiece>(one(id));
  return data;
}

/** Feature or unfeature one of the learner's own pieces (C130). Idempotent. 409 past the cap. */
export async function setMyWorkFeatured(id: string, featured: boolean): Promise<{ featured: boolean; count: number; onPublicPage: boolean }> {
  const { data } = await portalApi.put<{ featured: boolean; count: number; onPublicPage: boolean }>(`${one(id)}/feature`, { featured });
  return data;
}

/** Share or unshare one of the learner's own pieces with their cohort in the Showcase (C138). Idempotent. Never features it. */
export async function setMyWorkShared(id: string, shared: boolean): Promise<{ shared: boolean; count: number }> {
  const { data } = await portalApi.put<{ shared: boolean; count: number }>(`${one(id)}/share`, { shared });
  return data;
}

/** The learner's byte source, for the shared ArtifactFileViewer. */
export const myWorkSource: ArtifactSource = {
  async file(id, as) {
    const { data } = await portalApi.get<Blob>(`${one(id)}/file`, { responseType: 'blob' });
    return as ? new Blob([data], { type: as }) : data;
  },
  async preview(id) {
    const { data } = await portalApi.get<{ html: string }>(`${one(id)}/preview`);
    return data.html;
  },
  async xlsx(id) {
    const { data } = await portalApi.get<Blob>(`${one(id)}/xlsx`, { responseType: 'blob' });
    return data;
  },
};
