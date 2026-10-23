import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, SectionCard } from '../../../components/admin/shell';
import { useMarketingBrand } from './MarketingBrandContext';
import { ALL_BRANDS } from './brandScope';
import * as lp from '../../../services/landingPageApi';
import { previewFileName, OPEN_REVOKE_MS, DOWNLOAD_REVOKE_MS } from './landingPagePreviewFile';
import LandingPageDetails from './LandingPageDetails';
import { statsByPath, statsForPage, rowSummary } from './landingPageRowStats';
import {
  briefIsUsable, draftWarnings, pageActions, publicUrl, statusLabel, suggestSlug,
} from './landingPageState';

/** The window every number on this screen is measured over. */
const TRAFFIC_DAYS = 30;

/**
 * Landing pages: paste a brief, read the page, publish it.
 *
 * THE LOOP THIS IS. Ali's ask was to stop doing this in a chat window: "takes input like sohail
 * gave me... produced me the attached landing page. The user should be able to address things
 * that need to be updated... Once the image is approved, we will build the actual landing page
 * and save the link." So: brief in, generated page, preview the real thing, say what to change,
 * publish to /lp/:brand/:slug with tracking already wired.
 *
 * THE PREVIEW IS THE PAGE. It is the same renderer and the same row the public route serves, so
 * what gets approved is what gets served. It is fetched rather than framed by `src`, because
 * this app authenticates with a Bearer header that a browser will not attach to an iframe
 * navigation - see the header of `landingPageApi`. The iframe is sandboxed with no permissions:
 * the preview deliberately carries no tracker, so it needs no script to be exactly right.
 *
 * BRAND FIRST, ALWAYS. A landing page belongs to one brand and only shows for that brand, so
 * this screen refuses to do anything useful until the brand bar has one selected. Showing
 * "all brands" here would invite building a page without deciding whose it is.
 */

export default function AdminLandingPagesPage() {
  const { brandId, brand } = useMarketingBrand();
  const scoped = brandId !== ALL_BRANDS;

  const [pages, setPages] = useState<lp.LandingPage[]>([]);
  // Traffic for every hosted page across all brands; joined to these rows by public path.
  // A failure here must not take the table with it - the pages are still workable unmeasured.
  const [traffic, setTraffic] = useState<lp.LandingPageTrafficRow[]>([]);
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Build form
  const [name, setName] = useState('');
  const [source, setSource] = useState('');
  const [naming, setNaming] = useState(false);

  // Selected-page working state
  const [slugDraft, setSlugDraft] = useState('');
  const [feedback, setFeedback] = useState('');
  const [mode, setMode] = useState<lp.RevisionMode>('tweak');
  const [draft, setDraft] = useState<lp.LandingPageDraft | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const say = (tone: 'success' | 'danger' | 'info', text: string) => setNotice({ tone, text });

  /**
   * Name the page from the brief that is already typed.
   *
   * It OVERWRITES whatever is in the field, which is the point - it is asked for explicitly by
   * pressing the button, and a suggestion that refused to replace a name would do nothing on the
   * second press. The field stays editable, so the answer is a starting point rather than a
   * verdict.
   */
  /**
   * Show the page at the size it will actually be read at.
   *
   * Served from a blob rather than by opening the preview URL: that endpoint needs a Bearer
   * header an axios interceptor attaches, and a new tab would carry none and 401.
   */
  const openFullScreen = () => {
    if (previewHtml === null) return;
    const url = URL.createObjectURL(new Blob([previewHtml], { type: 'text/html' }));
    window.open(url, '_blank', 'noopener');
    // Not revoked immediately: the tab has not finished loading from it yet.
    window.setTimeout(() => URL.revokeObjectURL(url), OPEN_REVOKE_MS);
  };

  const downloadPreview = () => {
    if (previewHtml === null) return;
    const url = URL.createObjectURL(new Blob([previewHtml], { type: 'text/html' }));
    const a = document.createElement('a');
    a.href = url;
    a.download = previewFileName(selected?.name ?? name, selected?.slug ?? null);
    document.body.appendChild(a);
    a.click();
    a.remove();
    window.setTimeout(() => URL.revokeObjectURL(url), DOWNLOAD_REVOKE_MS);
  };

  const suggestName = async () => {
    setNaming(true);
    try {
      const suggested = await lp.suggestLandingPageName(source);
      setName(suggested);
    } catch (err) {
      say('danger', lp.errorMessage(err, 'A name could not be suggested. Type one in instead.'));
    } finally {
      setNaming(false);
    }
  };
  const fail = (err: unknown, fallback: string) => say('danger', lp.errorMessage(err, fallback));

  const selected = useMemo(() => pages.find((p) => p.id === selectedId) ?? null, [pages, selectedId]);
  const actions = pageActions(selected, slugDraft);

  const load = useCallback(async (bid: string) => {
    setLoading(true);
    try {
      setPages(await lp.listLandingPages({ brand_id: bid }));
    } catch (err) {
      // A failed list is not an empty one, and the difference matters to whoever reads it.
      setPages([]);
      fail(err, 'The landing pages could not be loaded.');
    } finally { setLoading(false); }

    // Deliberately after the list and deliberately swallowed: numbers are an enrichment of the
    // table, and a traffic outage should cost the operator their stats, not their pages.
    try {
      setTraffic((await lp.fetchLandingPageTraffic(TRAFFIC_DAYS)).traffic);
    } catch { setTraffic([]); }
  }, []);

  const byPath = useMemo(() => statsByPath(traffic), [traffic]);

  useEffect(() => {
    if (!scoped) { setPages([]); setSelectedId(null); return; }
    load(brandId);
    // Switching brand must drop the selection: it belongs to the brand that is no longer chosen.
    setSelectedId(null);
    setPreviewHtml(null);
    setDraft(null);
  }, [brandId, scoped, load]);

  /** The rendered page for whatever is selected. Refetched on selection, and after every change. */
  const loadPreview = useCallback(async (id: string) => {
    setPreviewHtml(null);
    setPreviewError(null);
    try {
      setPreviewHtml(await lp.previewLandingPage(id));
    } catch (err) {
      setPreviewError(lp.errorMessage(err, 'The preview could not be rendered.'));
    }
  }, []);

  useEffect(() => {
    if (!selected || selected.kind !== 'hosted') { setPreviewHtml(null); setPreviewError(null); return; }
    loadPreview(selected.id);
    setSlugDraft(selected.slug ?? '');
    setFeedback('');
  }, [selected, loadPreview]);

  const build = async () => {
    setBusy(true);
    try {
      const result = await lp.createLandingPage({
        brand_id: brandId,
        name: name.trim(),
        source,
        ...(suggestSlug(name) ? { slug: suggestSlug(name) } : {}),
      });
      setDraft(result);
      await load(brandId);
      setSelectedId(result.page.id);
      setName('');
      setSource('');
      say(
        result.unverifiedClaims.length > 0 ? 'info' : 'success',
        result.unverifiedClaims.length > 0
          ? 'Page built. Check the flagged specifics before publishing.'
          : 'Page built. Read it below, then publish when it is right.',
      );
    } catch (err) { fail(err, 'The page could not be built.'); } finally { setBusy(false); }
  };

  const revise = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      /**
       * Say whether anything actually changed.
       *
       * Ali, 2026-10-07: "I told it to fix the picture links. It came back with no comment and
       * nothing changed." Both halves were true - this said "Revised" unconditionally and wiped
       * the box, so a model that returned the same page was indistinguishable from one that had
       * done the work. The feedback is kept on a no-op so it can be reworded rather than retyped.
       */
      const before = JSON.stringify(draft?.content ?? null);
      const result = await lp.reviseLandingPage(selected.id, feedback, undefined, mode);
      const changed = JSON.stringify(result.content) !== before;

      setDraft(result);
      await load(brandId);
      await loadPreview(selected.id);

      if (changed) {
        setFeedback('');
        // The notice outranks "Revised": it explains why a rebuild-shaped request produced a
        // small change, which is the question the operator is about to ask.
        say(result.modeNotice ? 'info' : 'success',
          result.modeNotice ?? 'Revised. Read it again before publishing.');
      } else if (result.modeNotice) {
        say('info', result.modeNotice);
      } else {
        say('info', 'The model returned the same page - nothing changed. Name the section and '
          + 'what it should say instead. (Images are not something it can add: a human adds those.)');
      }
    } catch (err) { fail(err, 'The revision could not be applied.'); } finally { setBusy(false); }
  };

  const publish = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      const { url } = await lp.publishLandingPage(selected.id, slugDraft.trim() || undefined);
      await load(brandId);
      say('success', `Live at ${url}.`);
    } catch (err) { fail(err, 'The page could not be published.'); } finally { setBusy(false); }
  };

  const unpublish = async () => {
    if (!selected) return;
    setBusy(true);
    try {
      await lp.unpublishLandingPage(selected.id);
      await load(brandId);
      say('info', 'Taken off the internet. The page and its content are kept.');
    } catch (err) { fail(err, 'The page could not be unpublished.'); } finally { setBusy(false); }
  };

  const warnings = draftWarnings(draft);
  const nameProblem = name.trim() === '' ? 'Give the page a name.' : null;
  const briefProblem = briefIsUsable(source) ? null : 'Paste the brief you want the page built from.';

  return (
    <div className="admin-page">
      <PageHeader
        title="Landing pages"
        subtitle="Paste a brief, read the page it produces, publish it with tracking already wired."
        icon="layout-masonry-line"
        breadcrumb={[{ label: 'Marketing', to: '/admin/marketing' }, { label: 'Landing pages' }]}
        trust={{
          level: scoped ? 'live' : 'unverified',
          source: 'content',
          updatedAt: null,
          summary: scoped ? `${pages.length} page${pages.length === 1 ? '' : 's'} for ${brand?.name ?? 'this brand'}` : 'Choose a brand',
        }}
      />

      {notice && <div className={`alert alert-${notice.tone} py-2 small`} role="status">{notice.text}</div>}

      {!scoped && (
        <SectionCard title="Choose a brand" icon="price-tag-3-line">
          <p className="text-muted mb-0" data-testid="needs-brand">
            A landing page belongs to one brand and only ever shows for that brand. Pick one in the
            bar above to see its pages or build a new one.
          </p>
        </SectionCard>
      )}

      {scoped && (
        <>
          <SectionCard title="1. Build a page from a brief" subtitle="The input can be prose, bullets, or a pasted email." icon="magic-line">
            <div className="row g-3">
              <div className="col-md-5">
                <label className="form-label small mb-1" htmlFor="lp-name">Name</label>
                <div className="d-flex gap-2">
                  <input id="lp-name" className="form-control form-control-sm" value={name} maxLength={100} disabled={busy || naming}
                    onChange={(e) => setName(e.target.value)} data-testid="lp-name" />
                  {/* Disabled until the brief is long enough to name anything from - the service
                      refuses a short one, and a button that always 400s is worse than a quiet one. */}
                  <button
                    type="button" className="btn btn-sm btn-outline-primary text-nowrap"
                    disabled={busy || naming || source.trim().length < 20}
                    onClick={suggestName}
                    data-testid="lp-suggest-name"
                    title="Read the brief below and suggest a name"
                  >
                    {naming ? 'Naming…' : 'Suggest'}
                  </button>
                </div>
                <div className="form-text small">
                  Internal. The URL comes from the slug, which you can change before publishing.
                  {suggestSlug(name) && <> Suggested: <code>/lp/{brand?.slug ?? 'brand'}/{suggestSlug(name)}</code></>}
                </div>
              </div>
              <div className="col-12">
                <label className="form-label small mb-1" htmlFor="lp-source">The brief</label>
                <textarea id="lp-source" className="form-control form-control-sm" rows={8} value={source} disabled={busy}
                  placeholder="Paste what you were sent. Whatever it says is all the page may claim."
                  onChange={(e) => setSource(e.target.value)} data-testid="lp-source" />
                <div className="form-text small">
                  Nothing is invented: no date, price, duration or statistic that is not in here. Where
                  the page needs one it writes a visible placeholder for you to fill.
                </div>
              </div>
              <div className="col-12 d-flex flex-wrap align-items-center gap-2">
                <button type="button" className="btn btn-sm btn-primary" data-testid="lp-build"
                  disabled={busy || Boolean(nameProblem) || Boolean(briefProblem)} onClick={build}>
                  Build the page
                </button>
                {/* The reason the button is off, next to the button. */}
                {(nameProblem || briefProblem) && (
                  <span className="small text-muted" data-testid="lp-build-blocker">{nameProblem ?? briefProblem}</span>
                )}
              </div>
            </div>
          </SectionCard>

          <SectionCard
            title="2. This brand's pages"
            subtitle={`How each one is doing over the last ${TRAFFIC_DAYS} days. Open a row to read it, revise it, or publish it.`}
            icon="list-check-2"
          >
            {loading && pages.length === 0 && <p className="text-muted mb-0">Loading...</p>}
            {!loading && pages.length === 0 && (
              <p className="text-muted mb-0" data-testid="lp-empty">
                No landing pages for this brand yet. Build the first one above.
              </p>
            )}
            {pages.length > 0 && (
              <div className="table-responsive">
                <table className="table table-hover mb-0 align-middle">
                  <thead className="table-light">
                    <tr>
                      <th>Name</th><th>Status</th><th>URL</th>
                      {/* People, then the people who did something. Views is in the detail, not
                          here: it counts refreshes and would be the biggest number in every row. */}
                      <th className="text-end">Visitors</th>
                      <th className="text-end">Read it</th>
                      <th className="text-end">Clicked</th>
                      <th className="text-end">Known</th>
                      <th className="text-end">&nbsp;</th>
                    </tr>
                  </thead>
                  <tbody>
                    {pages.map((p) => {
                      const badge = statusLabel(p);
                      const url = publicUrl(p);
                      const stats = statsForPage(p, byPath);
                      const open = p.id === selectedId;
                      // A dash, never a zero, when the page has never been served: a 0 is a
                      // measurement and would read as "nobody came" for a page nobody could reach.
                      const n = (v: number | undefined) => (stats ? (v ?? 0).toLocaleString() : '—');
                      return (
                        <React.Fragment key={p.id}>
                          <tr className={open ? 'table-active' : undefined} data-testid={`lp-row-${p.id}`}>
                            <td>
                              <div>{p.name}</div>
                              <div className="text-muted" style={{ fontSize: '.72rem' }} data-testid={`lp-row-summary-${p.id}`}>
                                {rowSummary(stats)}
                              </div>
                            </td>
                            <td><span className={`badge bg-${badge.tone}`}>{badge.text}</span></td>
                            <td className="small">
                              {url
                                ? <a href={url} target="_blank" rel="noreferrer"><code>{url}</code></a>
                                : <span className="text-muted">{p.kind === 'hosted' ? 'not published' : (p.path ?? 'unknown')}</span>}
                            </td>
                            <td className="text-end fw-semibold" data-testid={`lp-visitors-${p.id}`}>{n(stats?.visitors)}</td>
                            <td className="text-end">{n(stats?.engaged_visitors)}</td>
                            <td className="text-end">{n(stats?.cta_clickers)}</td>
                            <td className="text-end">{n(stats?.identified_leads)}</td>
                            <td className="text-end">
                              <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy}
                                aria-expanded={open} onClick={() => setSelectedId(open ? null : p.id)}
                                data-testid={`lp-select-${p.id}`}>
                                {open ? 'Close' : 'Open'}
                              </button>
                            </td>
                          </tr>
                          {open && (
                            <tr className="table-active">
                              <td colSpan={8} className="p-0">
                                <LandingPageDetails
                                  page={p}
                                  brandSlug={brand?.slug ?? 'brand'}
                                  stats={stats}
                                  days={TRAFFIC_DAYS}
                                  warnings={warnings}
                                  actions={actions}
                                  busy={busy}
                                  preview={{ html: previewHtml, error: previewError, openFullScreen, download: downloadPreview }}
                                  revision={{ feedback, setFeedback, apply: revise, mode, setMode }}
                                  publishing={{ slugDraft, setSlugDraft, publish, unpublish }}
                                />
                              </td>
                            </tr>
                          )}
                        </React.Fragment>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>
        </>
      )}
    </div>
  );
}
