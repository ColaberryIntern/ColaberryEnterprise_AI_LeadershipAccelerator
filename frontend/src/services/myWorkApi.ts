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
