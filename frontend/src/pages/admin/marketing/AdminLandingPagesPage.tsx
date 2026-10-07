import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { PageHeader, SectionCard } from '../../../components/admin/shell';
import { useMarketingBrand } from './MarketingBrandContext';
import { ALL_BRANDS } from './brandScope';
import * as lp from '../../../services/landingPageApi';
import {
  briefIsUsable, draftWarnings, pageActions, publicUrl, slugProblem, statusLabel, suggestSlug,
} from './landingPageState';

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
  const [loading, setLoading] = useState(false);
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [notice, setNotice] = useState<{ tone: 'success' | 'danger' | 'info'; text: string } | null>(null);
  const [busy, setBusy] = useState(false);

  // Build form
  const [name, setName] = useState('');
  const [source, setSource] = useState('');

  // Selected-page working state
  const [slugDraft, setSlugDraft] = useState('');
  const [feedback, setFeedback] = useState('');
  const [draft, setDraft] = useState<lp.LandingPageDraft | null>(null);
  const [previewHtml, setPreviewHtml] = useState<string | null>(null);
  const [previewError, setPreviewError] = useState<string | null>(null);

  const say = (tone: 'success' | 'danger' | 'info', text: string) => setNotice({ tone, text });
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
  }, []);

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
      const result = await lp.reviseLandingPage(selected.id, feedback);
      const changed = JSON.stringify(result.content) !== before;

      setDraft(result);
      await load(brandId);
      await loadPreview(selected.id);

      if (changed) {
        setFeedback('');
        say('success', 'Revised. Read it again before publishing.');
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
                <input id="lp-name" className="form-control form-control-sm" value={name} maxLength={100} disabled={busy}
                  onChange={(e) => setName(e.target.value)} data-testid="lp-name" />
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

          <SectionCard title="2. This brand's pages" subtitle="Select one to read it, revise it, or publish it." icon="list-check-2">
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
                    <tr><th>Name</th><th>Status</th><th>URL</th><th className="text-end">&nbsp;</th></tr>
                  </thead>
                  <tbody>
                    {pages.map((p) => {
                      const badge = statusLabel(p);
                      const url = publicUrl(p);
                      return (
                        <tr key={p.id} className={p.id === selectedId ? 'table-active' : undefined} data-testid={`lp-row-${p.id}`}>
                          <td>{p.name}</td>
                          <td><span className={`badge bg-${badge.tone}`}>{badge.text}</span></td>
                          <td className="small">
                            {url
                              ? <a href={url} target="_blank" rel="noreferrer"><code>{url}</code></a>
                              : <span className="text-muted">{p.kind === 'hosted' ? 'not published' : (p.path ?? 'unknown')}</span>}
                          </td>
                          <td className="text-end">
                            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={busy}
                              onClick={() => setSelectedId(p.id)} data-testid={`lp-select-${p.id}`}>
                              {p.id === selectedId ? 'Selected' : 'Open'}
                            </button>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            )}
          </SectionCard>

          {selected && (
            <SectionCard
              title={`3. ${selected.name}`}
              subtitle="The preview below is the real page, rendered by the same code that serves it."
              icon="eye-line"
            >
              {warnings.length > 0 && (
                <div className="alert alert-warning py-2 small" data-testid="lp-warnings">
                  {warnings.map((w) => <div key={w}>{w}</div>)}
                </div>
              )}
              {actions.publishBlocker && selected.kind !== 'hosted' && (
                <p className="small text-muted" data-testid="lp-not-hosted">{actions.publishBlocker}</p>
              )}

              {selected.kind === 'hosted' && (
                <div className="row g-3">
                  <div className="col-12 col-xl-7">
                    {previewError && <div className="alert alert-danger py-2 small" data-testid="lp-preview-error">{previewError}</div>}
                    {!previewError && previewHtml === null && <p className="text-muted small mb-2">Rendering...</p>}
                    {previewHtml !== null && (
                      // sandbox="" - no scripts, no forms, no navigation. The preview carries no
                      // tracker by design, so nothing it needs is being withheld.
                      <iframe
                        title={`Preview of ${selected.name}`}
                        srcDoc={previewHtml}
                        sandbox=""
                        data-testid="lp-preview"
                        style={{ width: '100%', height: '32rem', border: '1px solid var(--bs-border-color, #dee2e6)', borderRadius: '.4rem', background: '#fff' }}
                      />
                    )}
                  </div>

                  <div className="col-12 col-xl-5">
                    <div className="mb-3">
                      <label className="form-label small mb-1" htmlFor="lp-feedback">What should change?</label>
                      <textarea id="lp-feedback" className="form-control form-control-sm" rows={4} value={feedback} disabled={busy}
                        placeholder="Make the headline about the mentor review, and drop the FAQ."
                        onChange={(e) => setFeedback(e.target.value)} data-testid="lp-feedback" />
                      <button type="button" className="btn btn-sm btn-outline-primary mt-2" data-testid="lp-revise"
                        disabled={busy || !actions.canRevise || feedback.trim().length < 3} onClick={revise}>
                        Apply the change
                      </button>
                    </div>

                    <div className="border-top pt-3">
                      <label className="form-label small mb-1" htmlFor="lp-slug">URL slug</label>
                      <div className="input-group input-group-sm">
                        <span className="input-group-text">/lp/{brand?.slug ?? 'brand'}/</span>
                        <input id="lp-slug" className="form-control" value={slugDraft} disabled={busy || selected.status === 'published'}
                          onChange={(e) => setSlugDraft(e.target.value)} data-testid="lp-slug" />
                      </div>
                      {slugDraft.trim() !== '' && slugProblem(slugDraft) && (
                        <div className="form-text small text-danger" data-testid="lp-slug-problem">{slugProblem(slugDraft)}</div>
                      )}
                      {selected.status === 'published' && (
                        <div className="form-text small">
                          Live pages keep their URL. Unpublish first if it has to change, and remember
                          anything already posted points here.
                        </div>
                      )}

                      <div className="d-flex flex-wrap gap-2 mt-2">
                        <button type="button" className="btn btn-sm btn-success" data-testid="lp-publish"
                          disabled={busy || !actions.canPublish} onClick={publish}>
                          Publish
                        </button>
                        <button type="button" className="btn btn-sm btn-outline-warning" data-testid="lp-unpublish"
                          disabled={busy || !actions.canUnpublish} onClick={unpublish}>
                          Unpublish
                        </button>
                      </div>
                      {actions.publishBlocker && selected.kind === 'hosted' && (
                        <div className="form-text small" data-testid="lp-publish-blocker">{actions.publishBlocker}</div>
                      )}
                    </div>
                  </div>
                </div>
              )}
            </SectionCard>
          )}
        </>
      )}
    </div>
  );
}
