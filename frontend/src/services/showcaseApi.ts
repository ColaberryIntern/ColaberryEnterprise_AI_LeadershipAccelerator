/**
 * showcaseApi - the Showcase (C138): work the learner's CLASSMATES shared with their cohort, and each shared piece read-only.
 * Mirrors backend/src/services/career/sharedWork.ts (ShowcaseWork, ShowcasePiece). Keep in sync by hand, like myWorkApi.ts.
 *
 * Who sees what is decided on the server (own cohort only, Ali 11 Nov 2026); this file never filters for privacy. Anything the
 * learner may not see answers 404, the same for every reason.
 */
import portalApi from '../utils/portalApi';
import type { ArtifactSource } from './artifactViewerTypes';
import type { MyWorkPiece, WorkGroup } from './myWorkApi';

export interface ShowcaseWork {
  id: string;
  group: WorkGroup;
  title: string;
  from: string;
  createdAt: string;
  week: number | null;
  project: string | null;
  skills: string[];
  author: string;
  sharedAt: string;
  /** The viewer's own piece. */
  mine: boolean;
}

export type ShowcasePiece = Omit<MyWorkPiece, 'state' | 'data' | 'kind' | 'feature' | 'share' | 'featured' | 'shared'> & {
  author: string; sharedAt: string; mine: boolean;
};

export interface ShowcaseList { items: ShowcaseWork[]; newThisWeek: ShowcaseWork | null }

const P = '/api/portal/career/showcase';
const one = (id: string): string => `${P}/${encodeURIComponent(id)}`;

export async function fetchShowcase(): Promise<ShowcaseList> {
  const { data } = await portalApi.get<ShowcaseList>(P);
  return { items: Array.isArray(data?.items) ? data.items : [], newThisWeek: data?.newThisWeek ?? null };
}

export async function fetchShowcasePiece(id: string): Promise<ShowcasePiece> {
  const { data } = await portalApi.get<{ piece: ShowcasePiece }>(one(id));
  return data.piece;
}

/** The byte source for a shared piece, for the shared ArtifactFileViewer. */
export const showcaseSource: ArtifactSource = {
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
