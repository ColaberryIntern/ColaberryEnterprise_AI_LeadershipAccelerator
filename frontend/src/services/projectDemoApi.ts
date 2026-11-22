/**
 * projectDemoApi - the admin read of every project's Connected Demo link.
 *
 * A thin typed wrapper over the shared axios client, which attaches `admin_token` and bounces to
 * /admin/login on a 401. Its own file rather than an addition to `factoryApi.ts`, because that
 * module is the delivery-contract Command Center and these are student projects: one module, one
 * subject.
 *
 * The types mirror `backend/src/services/sbp/demoLinkDirectory.ts`. The frontend cannot import
 * backend types across the workspace boundary, so they are restated here, and the one thing worth
 * restating in a comment is that `url` is NULL unless the demo is actually published. The backend
 * withholds the token in SQL for an unpublished demo, so there is no token here to build a link
 * out of even by accident.
 */
import api from '../utils/api';

export type DemoLinkState = 'published' | 'generated' | 'none';

export interface DemoLinkRow {
  project_id: string;
  name: string | null;
  enrollment_id: string | null;
  state: DemoLinkState;
  /** Present only for `published`. Never render a link from anything else. */
  url: string | null;
  event_count: number;
}

export interface DemoLinkDirectory {
  rows: DemoLinkRow[];
  counts: Record<DemoLinkState, number>;
  /** The list was cut off at the cap, so the panel must say so rather than imply completeness. */
  truncated: boolean;
}

export async function listProjectDemoLinks(limit?: number): Promise<DemoLinkDirectory> {
  const res = await api.get('/api/admin/projects/demos', { params: limit ? { limit } : undefined });
  return res.data as DemoLinkDirectory;
}
