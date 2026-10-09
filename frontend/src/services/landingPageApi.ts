import api from '../utils/api';

/**
 * The landing-page authoring API (backend PR #2905).
 *
 * WHY THE PREVIEW IS FETCHED, NOT FRAMED. The obvious implementation is
 * `<iframe src="/api/admin/landing-pages/:id/preview">`, and it would 401 every time: this app
 * authenticates with a `Bearer` token that an axios interceptor attaches to each request, and a
 * browser does not put that header on an iframe navigation. So the HTML is fetched here, where
 * the interceptor runs, and handed to the iframe as `srcDoc`. Anyone changing this back to a
 * `src` will see an auth error that looks like a permissions bug and is not one.
 */

export type LandingPageKind = 'external_path' | 'hosted';
export type LandingPageStatus = 'draft' | 'published' | 'archived';

export interface LandingPage {
  id: string;
  name: string;
  kind: LandingPageKind;
  status: LandingPageStatus;
  slug: string | null;
  path: string | null;
  brand_id: string | null;
  site_slug: string | null;
  published_at: string | null;
  repo_path: string | null;
  repo_commit: string | null;
  updated_at: string;
}

/** What the generator produced, plus what it could not stand behind. */
export interface LandingPageDraft {
  page: LandingPage;
  content: unknown;
  /** Bracketed holes someone must fill before this is fit to publish. */
  placeholders: string[];
  /** Specifics the brief does not support. Reported, never silently removed. */
  unverifiedClaims: string[];
  model: string;
  /** The first generation failed validation and the repair attempt succeeded. */
  repaired: boolean;
  /**
   * Sections dropped because they would not validate. Non-empty means the page is usable but
   * INCOMPLETE - say so rather than letting it look finished.
   */
  droppedSections?: string[];
}

export interface CreateLandingPageInput {
  brand_id: string;
  /** The brief, in whatever shape it arrived. */
  source: string;
  name: string;
  slug?: string;
  site_slug?: string;
}

export async function listLandingPages(params: { brand_id?: string } = {}): Promise<LandingPage[]> {
  const res = await api.get('/api/admin/landing-pages', { params });
  return res.data.pages ?? [];
}

export async function createLandingPage(input: CreateLandingPageInput): Promise<LandingPageDraft> {
  const res = await api.post('/api/admin/landing-pages', input);
  return res.data;
}

/** Apply feedback as a new revision. The brief is re-sent so this is a change, not a rewrite. */
export async function reviseLandingPage(id: string, feedback: string, source?: string): Promise<LandingPageDraft> {
  const res = await api.post(`/api/admin/landing-pages/${id}/revise`, { feedback, ...(source ? { source } : {}) });
  return res.data;
}

export async function updateLandingPage(
  id: string,
  patch: { name?: string; slug?: string; site_slug?: string | null; content?: unknown },
): Promise<{ page: LandingPage }> {
  const res = await api.patch(`/api/admin/landing-pages/${id}`, patch);
  return res.data;
}

export async function publishLandingPage(id: string, slug?: string): Promise<{ page: LandingPage; url: string }> {
  const res = await api.post(`/api/admin/landing-pages/${id}/publish`, slug ? { slug } : {});
  return res.data;
}

export async function unpublishLandingPage(id: string): Promise<{ page: LandingPage }> {
  const res = await api.post(`/api/admin/landing-pages/${id}/unpublish`, {});
  return res.data;
}

/**
 * The rendered page, as HTML text.
 *
 * Returned as a string rather than pointed at, for the reason in the file header. A 422 means
 * the content does not match the page schema - the caller shows the reasons rather than an
 * empty frame.
 */
export async function previewLandingPage(id: string): Promise<string> {
  const res = await api.get(`/api/admin/landing-pages/${id}/preview`, { responseType: 'text' });
  return typeof res.data === 'string' ? res.data : String(res.data ?? '');
}

/**
 * A name for a page that does not exist yet, read off the brief already typed.
 *
 * Asked before creation on purpose - the name is required to build, and the brief below it
 * already contains the answer. A failure is surfaced beside the field and never blocks building:
 * the operator can always type one.
 */
export async function suggestLandingPageName(source: string): Promise<string> {
  const res = await api.post('/api/admin/landing-pages/suggest-name', { source });
  return String(res.data?.name ?? '');
}

/** The message a failed call should show, preferring the server's own wording. */
export function errorMessage(err: unknown, fallback: string): string {
  const e = err as { response?: { data?: { error?: string; details?: unknown } } };
  const server = e?.response?.data?.error;
  const details = e?.response?.data?.details;
  if (server && Array.isArray(details) && details.length > 0) {
    return `${server} ${details.slice(0, 3).join('; ')}`;
  }
  return server || fallback;
}
