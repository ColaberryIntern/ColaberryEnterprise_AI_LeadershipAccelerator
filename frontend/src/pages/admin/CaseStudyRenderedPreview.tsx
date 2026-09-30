import React from 'react';
import { SectionCard, StatusBadge } from '../../components/admin/shell';
import { CaseStudyPreviewPanel } from '../../components/admin/caseStudy';
import StoryDetailArticle from '../publicV2/StoryDetailArticle';
import CaseStudySurfaceTabs from './CaseStudySurfaceTabs';
import { SURFACE_LENS_TABS } from './caseStudySurfaceLabModel';
import type { CaseStudyPreviewLens } from './useCaseStudyPreviewLens';
import './caseStudyRenderedPreview.css';

/**
 * CaseStudyRenderedPreview — the Story Studio's PREVIEW tab.
 *
 * WHAT IT REPLACES, AND WHY THAT WAS THE WRONG FRONT DOOR. This tab used to open
 * on two columns of JSON: the raw snapshot beside the public projection. That is
 * a genuinely useful comparison — it is the only place an operator can see what
 * the projection WITHHELD — and it is not a preview. The tab is called PREVIEW
 * and it showed a payload, so the product owner's report of it was exact: "not
 * sure what it's showing now."
 *
 * THE RENDERED PAGE IS THE DEFAULT VIEW. The JSON is one button away, under
 * "Show payload", and both halves of it survive intact.
 *
 * IT MOUNTS THE PAGE. `StoryDetailArticle` is the same component `/stories/:slug`
 * renders, given the same `PublicCaseStudyDetail` the public API serves —
 * `GET /api/admin/case-studies/:id/preview` returns precisely that shape. A
 * preview drawn by its own code would drift from the page it claims to preview,
 * one commit at a time, and the first person to notice would be whoever approved
 * a publish against it.
 *
 * NOTHING IS WIRED UP INSIDE THE FRAME, AND THAT IS THE READ-ONLY GUARANTEE.
 * `StoryDetailArticle` takes its tracking observer and its copy-link handler as
 * optional props. This panel passes NEITHER, so rendering a record here emits no
 * analytics row and touches no clipboard. It is not a flag that could be set
 * wrong; it is an argument that is not passed. The caption says so, because a
 * control that renders and does nothing should say which it is.
 *
 * SWITCHING A SURFACE IS A READ. `useCaseStudyPreviewLens` imports exactly one
 * API function and it is a GET. There is no publish path on this panel — not a
 * disabled one, not a confirm-guarded one, none. Publishing stays in
 * `CaseStudyPublishPanel`, bound to `PUBLISH_SURFACE` explicitly.
 *
 * THE SURFACE IS THIS TAB'S OWN. It used to be `desk.lensSurface`, shared with
 * the SURFACES tab, so moving one moved the other. See
 * `useCaseStudyPreviewLens`.
 *
 * WHY A CONTAINER AND NOT AN IFRAME. Both isolate; they fail differently. An
 * iframe isolates styles completely, and then owes you a height protocol, a
 * second React root or a serialised document, and a testing story in which
 * nothing inside the frame is reachable from jsdom. Worse, its stylesheets have
 * to be ASSEMBLED by preview-specific code — and preview-specific code that
 * decides how the page looks is the exact failure this tab exists to remove. The
 * container costs one risk instead: bleed. That risk is measured rather than
 * assumed — every selector in all seven stylesheets the story leans on is inside
 * the `cbv2-` namespace, the admin shell assigns no `cbv2-` class anywhere, and
 * `caseStudyRenderedPreview.test.tsx` reads the stylesheets and fails if a
 * non-`cbv2-` selector ever appears in one. See `caseStudyRenderedPreview.css`.
 */

export interface CaseStudyRenderedPreviewProps {
  lens: CaseStudyPreviewLens;
  /** Whether the JSON payload panel is open. Held by the page, so it survives a tab change. */
  payloadOpen: boolean;
  onTogglePayload: (open: boolean) => void;
}

/** What the operator is looking at, in the record's own words. */
function sourceLabel(source: 'approved_snapshot' | 'latest_draft' | 'none'): string {
  if (source === 'approved_snapshot') return 'the approved snapshot';
  if (source === 'latest_draft') return 'the latest draft';
  return 'nothing — no snapshot exists';
}

export default function CaseStudyRenderedPreview({
  lens, payloadOpen, onTogglePayload,
}: CaseStudyRenderedPreviewProps): React.ReactElement {
  const { surface, preview, loading, error } = lens;
  const activeTab = SURFACE_LENS_TABS.find((t) => t.key === surface) ?? SURFACE_LENS_TABS[0];
  const projection = preview?.projection ?? null;
  const surfaceView = preview?.surface ?? null;

  return (
    <>
      <SectionCard
        title="Preview" icon="eye-2-line" className="mb-4"
        subtitle={'The page a visitor would receive, rendered by the same components the public '
          + 'site uses. Switching a surface reads; it never writes, publishes or changes the record.'}
        actions={
          <button
            type="button"
            className="btn btn-sm btn-outline-secondary"
            data-testid="cs-preview-payload-toggle"
            aria-expanded={payloadOpen}
            aria-controls="cs-preview-payload"
            onClick={() => onTogglePayload(!payloadOpen)}
          >
            {payloadOpen ? 'Hide payload' : 'Show payload'}
          </button>
        }
      >
        {/* PREVIEW's own selector. It does not read, and cannot write, the
            SURFACES tab's lens. */}
        <CaseStudySurfaceTabs
          activeSurface={surface}
          onSelectSurface={lens.selectSurface}
          loading={loading}
          idPrefix="cs-preview-surface-"
          tablistTestId="cs-preview-surface-tablist"
          panelId="cs-preview-render-panel"
          ariaLabel="Preview surface"
        />

        {error && (
          <div className="alert alert-danger" data-testid="cs-preview-render-error">{error}</div>
        )}

        <div
          id="cs-preview-render-panel"
          role="tabpanel"
          aria-labelledby={`cs-preview-surface-tab-${activeTab.key}`}
        >
          <p className="small mb-2 cs-story-preview-caption" data-testid="cs-preview-render-caption">
            <span className="fw-semibold">{activeTab.label}</span>
            {surfaceView ? ` · ${surfaceView.brandLabel}` : ''}
            {preview ? ` · rendering ${sourceLabel(preview.source)}` : ''}
            {preview?.snapshot ? ` (v${preview.snapshot.version})` : ''}
            {preview && (
              <>
                {' · '}
                <StatusBadge
                  label={preview.decision.allowed ? 'gate: would publish' : 'gate: would refuse'}
                  tone={preview.decision.allowed ? 'success' : 'danger'}
                />
              </>
            )}
            <span className="d-block mt-1">
              {activeTab.readerQuestion}
            </span>
            <span className="d-block mt-1">
              Links and buttons inside the frame are inert: this preview is wired to nothing, so it
              cannot record a visit, copy a link or change the record.
            </span>
          </p>

          {loading && (
            <p className="text-muted mb-0" data-testid="cs-preview-render-loading">
              Rendering this surface...
            </p>
          )}

          {!loading && !projection && !error && (
            <p className="text-muted mb-0" data-testid="cs-preview-render-none">
              Nothing renders on this surface: there is no snapshot to project, so a visitor would
              receive nothing at all.
            </p>
          )}

          {!loading && projection && surfaceView && (
            /* THE FRAME. See `caseStudyRenderedPreview.css` for why this is a
               container and not an iframe. */
            <div className="cs-story-preview" data-testid="cs-preview-render-frame">
              <StoryDetailArticle record={projection} surface={surfaceView} />
            </div>
          )}
        </div>
      </SectionCard>

      {payloadOpen && (
        <div id="cs-preview-payload" data-testid="cs-preview-payload">
          {/* THE COMPARISON IS STILL HERE, IN FULL. Raw snapshot beside public
              projection, plus the delta that names what was withheld. It is
              behind a button rather than gone, because it answers a question the
              rendered page cannot: what a visitor will NEVER see. */}
          <CaseStudyPreviewPanel
            preview={preview}
            loading={loading}
            error={error}
            surfaceKey={surface}
            onPreview={lens.refresh}
          />
        </div>
      )}
    </>
  );
}
