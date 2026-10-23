import React from 'react';
import type { LandingPage, LandingPageTrafficRow, RevisionMode } from '../../../services/landingPageApi';
import { slugProblem, type PageActions } from './landingPageState';
import { AudienceDisclosure, Metric, when } from './LandingPageAudience';

/**
 * Everything about ONE landing page, opened from its row in the table.
 *
 * WHY IT IS HERE AND NOT ON THE PAGE. Ali, 2026-10-16: "Landing page details can be combined
 * with 2. The brand's page. Allow the stats to be on the line of the Landing page and allow the
 * user to drill down into the details." The screen used to list the same pages twice - once in a
 * traffic panel to be measured, once in a table to be worked on - and then repeat the selected
 * one a third time in a card below. One table, numbers on the row, detail on demand.
 *
 * It is a separate file because folding the detail card into the table would have pushed
 * `AdminLandingPagesPage` past the 500-line ceiling, and the next change to it would have had to
 * split it anyway.
 *
 * IT OWNS NO STATE AND FETCHES NOTHING except the audience, which is behind its own disclosure.
 * Publishing, revising and the preview all belong to the page, because they change the list the
 * page is holding.
 */

export interface LandingPageDetailsProps {
  page: LandingPage;
  brandSlug: string;
  /** Traffic for this page, or null when it has never been served. */
  stats: LandingPageTrafficRow | null;
  /** The window the stats were measured over, passed through to the audience lookup. */
  days: number;
  warnings: string[];
  actions: PageActions;
  busy: boolean;
  preview: { html: string | null; error: string | null; openFullScreen: () => void; download: () => void };
  revision: {
    feedback: string; setFeedback: (v: string) => void; apply: () => void;
    /** Adjust the page, or rebuild it. Adjust is the default and the old behaviour. */
    mode: RevisionMode; setMode: (m: RevisionMode) => void;
  };
  publishing: {
    slugDraft: string; setSlugDraft: (v: string) => void; publish: () => void; unpublish: () => void;
  };
}

/**
 * The numbers for this page, in the order that answers "did it work".
 *
 * Only drawn when the page has actually been served. A published page with no stats row and an
 * unpublished one are different states, and the row above already says which.
 */
function TrafficStrip({ stats, path, days }: { stats: LandingPageTrafficRow; path: string; days: number }) {
  return (
    <div className="border rounded p-2 mb-3 bg-light" data-testid="lp-detail-traffic">
      <div className="d-flex flex-wrap align-items-center">
        <Metric value={stats.visitors} label="visitors" />
        <Metric value={stats.engaged_visitors} label="read it" />
        <Metric value={stats.cta_clickers} label="clicked" />
        <Metric value={stats.identified_leads} label="known" />
        <Metric value={stats.ad_clicks} label="from ads" muted />
        <Metric value={stats.views} label="views" muted />
        <div className="ms-auto text-muted" style={{ fontSize: '.72rem' }}>
          last {days} days · last seen {when(stats.last_seen)} CT
        </div>
      </div>
      <AudienceDisclosure path={path} days={days} />
    </div>
  );
}

export default function LandingPageDetails({
  page, brandSlug, stats, days, warnings, actions, busy, preview, revision, publishing,
}: LandingPageDetailsProps) {
  return (
    <div className="p-3 border-top" data-testid={`lp-details-${page.id}`}>
      {warnings.length > 0 && (
        <div className="alert alert-warning py-2 small" data-testid="lp-warnings">
          {warnings.map((w) => <div key={w}>{w}</div>)}
        </div>
      )}
      {actions.publishBlocker && page.kind !== 'hosted' && (
        <p className="small text-muted" data-testid="lp-not-hosted">{actions.publishBlocker}</p>
      )}

      {stats && page.path && <TrafficStrip stats={stats} path={page.path} days={days} />}

      {page.kind === 'hosted' && (
        <div className="row g-3">
          <div className="col-12 col-xl-7">
            {preview.error && <div className="alert alert-danger py-2 small" data-testid="lp-preview-error">{preview.error}</div>}
            {!preview.error && preview.html === null && <p className="text-muted small mb-2">Rendering...</p>}
            {preview.html !== null && (
              <div className="d-flex flex-wrap gap-2 mb-2" data-testid="lp-preview-actions">
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={preview.openFullScreen} data-testid="lp-full-screen">
                  Open full screen
                </button>
                <button type="button" className="btn btn-sm btn-outline-secondary" onClick={preview.download} data-testid="lp-download">
                  Download
                </button>
                <span className="form-text small align-self-center mb-0">A real page is hard to judge in a column this wide.</span>
              </div>
            )}
            {preview.html !== null && (
              // sandbox="" - no scripts, no forms, no navigation. The preview carries no
              // tracker by design, so nothing it needs is being withheld.
              <iframe
                title={`Preview of ${page.name}`}
                srcDoc={preview.html}
                sandbox=""
                data-testid="lp-preview"
                style={{ width: '100%', height: '32rem', border: '1px solid var(--bs-border-color, #dee2e6)', borderRadius: '.4rem', background: '#fff' }}
              />
            )}
          </div>

          <div className="col-12 col-xl-5">
            <div className="mb-3">
              <label className="form-label small mb-1" htmlFor="lp-feedback">What should change?</label>
              <textarea id="lp-feedback" className="form-control form-control-sm" rows={4} value={revision.feedback} disabled={busy}
                placeholder="Make the headline about the mentor review, and drop the FAQ."
                onChange={(e) => revision.setFeedback(e.target.value)} data-testid="lp-feedback" />

              {/* Explicit, not inferred. A rebuild discards a page somebody may have spent an
                  hour revising, so it is the operator's choice - but until this existed, asking
                  for one in the box produced an adjustment and almost no visible change. */}
              <div className="btn-group btn-group-sm mt-2 d-flex" role="group" aria-label="Revision mode">
                <button
                  type="button"
                  className={`btn ${revision.mode === 'tweak' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                  onClick={() => revision.setMode('tweak')}
                  aria-pressed={revision.mode === 'tweak'}
                  disabled={busy}
                  data-testid="lp-mode-tweak"
                >
                  Adjust
                </button>
                <button
                  type="button"
                  className={`btn ${revision.mode === 'redesign' ? 'btn-secondary' : 'btn-outline-secondary'}`}
                  onClick={() => revision.setMode('redesign')}
                  aria-pressed={revision.mode === 'redesign'}
                  disabled={busy}
                  data-testid="lp-mode-redesign"
                >
                  Rebuild
                </button>
              </div>
              <div className="form-text small" data-testid="lp-mode-hint">
                {revision.mode === 'tweak'
                  ? 'Changes only what you ask for and leaves the rest of the page alone.'
                  : 'Rewrites the page from the same brief. Structure and wording can change; the facts cannot.'}
              </div>

              <button type="button" className="btn btn-sm btn-outline-primary mt-2" data-testid="lp-revise"
                disabled={busy || !actions.canRevise || revision.feedback.trim().length < 3} onClick={revision.apply}>
                {revision.mode === 'redesign' ? 'Rebuild the page' : 'Apply the change'}
              </button>
            </div>

            <div className="border-top pt-3">
              <label className="form-label small mb-1" htmlFor="lp-slug">URL slug</label>
              <div className="input-group input-group-sm">
                <span className="input-group-text">/lp/{brandSlug}/</span>
                <input id="lp-slug" className="form-control" value={publishing.slugDraft} disabled={busy || page.status === 'published'}
                  onChange={(e) => publishing.setSlugDraft(e.target.value)} data-testid="lp-slug" />
              </div>
              {publishing.slugDraft.trim() !== '' && slugProblem(publishing.slugDraft) && (
                <div className="form-text small text-danger" data-testid="lp-slug-problem">{slugProblem(publishing.slugDraft)}</div>
              )}
              {page.status === 'published' && (
                <div className="form-text small">
                  Live pages keep their URL. Unpublish first if it has to change, and remember
                  anything already posted points here.
                </div>
              )}

              <div className="d-flex flex-wrap gap-2 mt-2">
                <button type="button" className="btn btn-sm btn-success" data-testid="lp-publish"
                  disabled={busy || !actions.canPublish} onClick={publishing.publish}>
                  Publish
                </button>
                <button type="button" className="btn btn-sm btn-outline-warning" data-testid="lp-unpublish"
                  disabled={busy || !actions.canUnpublish} onClick={publishing.unpublish}>
                  Unpublish
                </button>
              </div>
              {actions.publishBlocker && page.kind === 'hosted' && (
                <div className="form-text small" data-testid="lp-publish-blocker">{actions.publishBlocker}</div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
