/**
 * pagesUrlService — find out where a student's Command Center is actually
 * hosted, and record it once it answers.
 *
 * ── THE RULE THIS MODULE EXISTS UNDER ────────────────────────────────────────
 *
 * STORY VERIFICATION MUST NEVER DEPEND ON ANY OF THIS.
 *
 * A first Pages build takes a minute or more. Custom domains exist. Students
 * decline hosting. Pages on a private repo needs a paid plan. If any of those
 * could block the latch, we would have rebuilt the permanently-stuck story that
 * the STORY-000 spec fix just removed — same bug, different hat.
 *
 * So: nothing here is called by `buildVerificationService`, nothing here can
 * throw into a verification path, and no function here returns a value that any
 * completion decision reads. Verification stays on the commit and
 * `.colaberry/progress.json`. The URL is a bonus that arrives when it arrives,
 * and "never" is an acceptable answer.
 *
 * ── WHY WE ASK GITHUB RATHER THAN COMPUTE ────────────────────────────────────
 *
 * The URL looks deterministic — `https://<owner>.github.io/<repo>/` — and for
 * most repos it is. Two common shapes break the formula:
 *
 *   1. A repo literally named `<owner>.github.io` serves at the DOMAIN ROOT.
 *      The derived path form (`/<owner>.github.io/`) 404s forever.
 *   2. A CNAME points a custom domain at the site. Pages is live, the derived
 *      URL is simply wrong, and it may not even redirect.
 *
 * GitHub's Pages API reports the real `html_url` for both. So we ASK, and only
 * fall back to deriving when the API cannot be reached — and even then the
 * derived URL has to answer before it is recorded.
 */
import { setTimeout as delay } from 'timers/promises';
import Project from '../../../models/Project';

const GITHUB_API = 'https://api.github.com';

/** Long enough for a cold Pages edge, short enough not to hold a webhook open. */
const PROBE_TIMEOUT_MS = 8000;
const API_TIMEOUT_MS = 8000;

export type PagesOutcome =
  | 'recorded'        // the site answered and the URL is now on the project
  | 'already_set'     // a URL was already there; we never overwrite
  | 'not_live_yet'    // resolved a URL, nothing answered — try again on a later push
  | 'not_enabled'     // Pages is off, or refused (private repo on a free plan)
  | 'no_project'
  | 'error';

export interface PagesResult {
  outcome: PagesOutcome;
  url: string | null;
  /** True when GitHub told us the URL, false when we had to derive it. */
  from_api: boolean;
}

function log(event: string, outcome: string, ctx: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: outcome === 'failure' ? 'error' : 'info',
    service: 'sbp-pages',
    event,
    outcome,
    context: ctx,
  }));
}

/**
 * The URL a repo's Pages site would have if GitHub used the plain formula.
 *
 * `<owner>.github.io` is special-cased because that repo IS the user site: it
 * serves at the domain root, and appending its own name produces a path that
 * can never resolve. Compared case-insensitively because GitHub logins and repo
 * names differ in case freely while the hostname does not.
 */
export function derivePagesUrl(owner: string, repo: string): string {
  const host = `${owner.toLowerCase()}.github.io`;
  if (repo.toLowerCase() === host) return `https://${host}/`;
  return `https://${host}/${repo}/`;
}

/**
 * Ask GitHub where the site is. Null means "not enabled, or we could not ask" —
 * the caller treats both the same way, because neither is a state the student
 * needs to hear about differently.
 */
export async function fetchPagesUrl(
  owner: string, repo: string, fetchImpl: typeof fetch = fetch,
): Promise<string | null> {
  const token = process.env.GITHUB_TOKEN;
  if (!token) return null;

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), API_TIMEOUT_MS);
  try {
    const res = await fetchImpl(`${GITHUB_API}/repos/${owner}/${repo}/pages`, {
      headers: { Accept: 'application/vnd.github.v3+json', Authorization: `Bearer ${token}` },
      signal: controller.signal,
    });
    // 404 is the ordinary "Pages is not turned on" answer, not an error.
    if (!res.ok) return null;
    const body = await res.json() as { html_url?: unknown; cname?: unknown };
    return typeof body?.html_url === 'string' && body.html_url.startsWith('https://')
      ? body.html_url
      : null;
  } catch {
    return null;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Does anything actually answer at this URL?
 *
 * A GET rather than a HEAD: Pages serves HEAD inconsistently behind its CDN, and
 * a false negative here costs a student their link. Redirects are followed so a
 * CNAME that redirects still counts as live.
 *
 * ONLY A 2xx COUNTS. GitHub serves a styled 404 page for a repo whose Pages
 * build has not finished, and that page is a perfectly good HTTP response —
 * recording it would put a link in the portal that shows the student a 404.
 */
export async function pagesResponds(url: string, fetchImpl: typeof fetch = fetch): Promise<boolean> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), PROBE_TIMEOUT_MS);
  try {
    const res = await fetchImpl(url, { method: 'GET', redirect: 'follow', signal: controller.signal });
    return res.ok;
  } catch {
    return false;
  } finally {
    clearTimeout(timer);
  }
}

/**
 * Resolve and record the Command Center URL for one project, if it is live.
 *
 * NEVER THROWS. It is called fire-and-forget from a webhook and from the Sync
 * route, and an exception escaping either would be an unhandled rejection
 * attached to a feature nobody asked for.
 *
 * Order of preference is deliberate: GitHub's reported URL beats the derived
 * one, because GitHub knows about custom domains and user-site repos and the
 * formula does not. The derived URL is only a fallback for when the API could
 * not be reached at all, and it still has to answer before it is trusted.
 */
export async function recordPagesUrlIfLive(
  projectId: string,
  owner: string,
  repo: string,
  opts: { fetchImpl?: typeof fetch; correlationId?: string } = {},
): Promise<PagesResult> {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const base = { project_id: projectId, repo: `${owner}/${repo}`, correlation_id: opts.correlationId ?? null };

  try {
    const project: any = await Project.findByPk(projectId);
    if (!project) return { outcome: 'no_project', url: null, from_api: false };

    // NEVER OVERWRITE. Somebody may have set this by hand, or pointed it at a
    // host that is not Pages at all. A later automatic guess must not win an
    // argument against a human.
    const existing = (project.project_variables || {}).command_center_url;
    if (typeof existing === 'string' && existing.trim()) {
      return { outcome: 'already_set', url: existing, from_api: false };
    }

    const reported = await fetchPagesUrl(owner, repo, fetchImpl);
    const url = reported ?? derivePagesUrl(owner, repo);
    const fromApi = reported !== null;

    // When GitHub says Pages is off AND the derived guess does not answer, this
    // is simply a project without hosting. Not an error, and not worth a retry
    // schedule — the next push asks again for free.
    if (!await pagesResponds(url, fetchImpl)) {
      log('sbp_pages_not_live', 'partial', { ...base, url, from_api: fromApi, reported: reported !== null });
      return { outcome: reported ? 'not_live_yet' : 'not_enabled', url, from_api: fromApi };
    }

    // Narrow write: merge one key into project_variables. Deliberately not
    // `setCommandCenterUrl`, which re-reads the whole owned project tree to
    // return it — a webhook has no use for that tree and should not pay for it.
    project.project_variables = { ...(project.project_variables || {}), command_center_url: url };
    project.changed('project_variables', true);
    await project.save();

    log('sbp_pages_recorded', 'success', { ...base, url, from_api: fromApi });
    return { outcome: 'recorded', url, from_api: fromApi };
  } catch (err: unknown) {
    log('sbp_pages_check_failed', 'failure', {
      ...base,
      error_class: (err as { name?: string })?.name ?? 'Error',
      message: (err as { message?: string })?.message,
    });
    return { outcome: 'error', url: null, from_api: false };
  }
}

/**
 * The same check, given a moment for a first build to finish.
 *
 * A push that enables Pages, or the first push after enabling it, lands here
 * while GitHub is still building — so an immediate probe reliably 404s on a repo
 * that is about to be perfectly fine. One short delayed retry converts a good
 * proportion of those into a recorded URL on the SAME push, rather than leaving
 * the student without a link until they happen to push again.
 *
 * Deliberately ONE retry and a small delay. This runs detached from a webhook
 * that has already answered 200; it is not somewhere to build a retry schedule,
 * and every later push re-checks for free anyway.
 */
export async function recordPagesUrlWithGrace(
  projectId: string,
  owner: string,
  repo: string,
  opts: { fetchImpl?: typeof fetch; correlationId?: string; graceMs?: number } = {},
): Promise<PagesResult> {
  const first = await recordPagesUrlIfLive(projectId, owner, repo, opts);
  if (first.outcome !== 'not_live_yet') return first;

  await delay(opts.graceMs ?? 45_000);
  return recordPagesUrlIfLive(projectId, owner, repo, opts);
}
