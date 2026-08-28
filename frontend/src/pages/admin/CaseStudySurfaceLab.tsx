import React from 'react';
import { SectionCard, StatusBadge } from '../../components/admin/shell';
import CaseStudySurfaceTabs from './CaseStudySurfaceTabs';
import {
  LIVE_SURFACE_KEY, SURFACE_LENS_TABS, bandSummary, canonicalFacts, draftState,
  lensComposition, publicationState,
} from './caseStudySurfaceLabModel';
import type { CaseStudyDetail, CaseStudySurfaceKey, CaseStudySurfacePreview } from '../../services/caseStudyAdminTypes';

/**
 * CaseStudySurfaceLab — the admin-only four-lens preview.
 *
 * ONE RECORD, FOUR ORDERS. The tabs do not switch between four stories. They
 * switch between four orders over one snapshot, and the panel is laid out to
 * make that legible: the canonical facts are printed FIRST and are read off the
 * projection, so an operator watching them not move while the band list
 * reshuffles is watching the lens model hold.
 *
 * SEGMENTED TABS, NOT A SLIDER — and the control itself now lives in
 * `CaseStudySurfaceTabs`, shared with the PREVIEW tab, which acquired a surface
 * selector of its own. Four audiences are not a continuum, and a slider would
 * imply an interpolated surface halfway between Training and Refactored, which
 * is meaningless. `role="tablist"` is the correct pattern because the tabs
 * select which view of ONE object is shown.
 *
 * THIS TAB AND PREVIEW NO LONGER SHARE A SURFACE. Until 2026-08-27 both read
 * `desk.lensSurface`, so "the lens I am inspecting" and "the surface I am
 * previewing" were one piece of state and moving either moved both. They are two
 * questions. This panel keeps the desk's lens; PREVIEW owns its own.
 *
 * SWITCHING A TAB WRITES NOTHING. It refires the preview GET, which is a read
 * endpoint that persists nothing. This component has no publish path at all —
 * not a disabled one, not a confirm-guarded one, none. The publish surface lives
 * in `CaseStudyPublishPanel` and is bound to `enterprise` explicitly. An operator
 * idly exploring the Training lens being one click from publishing to it is the
 * one genuinely dangerous version of this feature, and the way it is prevented
 * is that the button is not here.
 *
 * AUTHORIZATION IS SERVER-SIDE. The tabs are drawn for every admin; the server
 * decides. A non-allowlisted admin who presses one gets a 403, which arrives
 * here as `error` and is rendered as a sentence naming the environment variable.
 * Hiding the control in CSS would not be authorization, and drawing it and
 * letting the server refuse is honest about where the boundary actually is.
 *
 * NO DRAFT CHANGE COUNT. See `draftState` in the model for why a number here
 * would be a fabrication.
 */

interface Props {
  recordTitle: string;
  activeSurface: CaseStudySurfaceKey;
  onSelectSurface: (surfaceKey: CaseStudySurfaceKey) => void;
  detail: CaseStudyDetail | null;
  preview: CaseStudySurfacePreview | null;
  loading: boolean;
  error: string | null;
}

export default function CaseStudySurfaceLab({
  recordTitle, activeSurface, onSelectSurface, detail, preview, loading, error,
}: Props): React.ReactElement {
  const activeTab = SURFACE_LENS_TABS.find((t) => t.key === activeSurface) ?? SURFACE_LENS_TABS[0];
  const projection = preview?.projection ?? null;
  const surface = preview?.surface ?? null;
  const facts = canonicalFacts(projection);
  const drafts = draftState(detail, activeSurface);
  const publication = publicationState(detail, preview, activeSurface);
  const composition = lensComposition(projection, surface);

  return (
    <SectionCard
      title="Preview story as" icon="layout-grid-line" className="mb-4"
      subtitle="Four audience lenses over one verified record. Switching a lens reads; it never writes, publishes or changes the record."
    >
      {/* The segmented control moved to `CaseStudySurfaceTabs` when PREVIEW
          acquired one of its own. Two copies of four tabs would agree on the day
          they were written and diverge afterwards. */}
      <CaseStudySurfaceTabs
        activeSurface={activeSurface}
        onSelectSurface={onSelectSurface}
        loading={loading}
        idPrefix="cs-lens-"
        tablistTestId="cs-surface-lab-tablist"
        panelId="cs-lens-panel"
        ariaLabel="Surface lens"
      />

      {error && (
        <div className="alert alert-danger" data-testid="cs-surface-lab-error">{error}</div>
      )}

      <div
        id="cs-lens-panel"
        role="tabpanel"
        aria-labelledby={`cs-lens-tab-${activeTab.key}`}
        aria-live="polite"
      >
        <dl className="row small mb-3" data-testid="cs-surface-lab-status">
          <dt className="col-sm-3 col-lg-2">Canonical truth</dt>
          <dd className="col-sm-9 col-lg-10" data-testid="cs-surface-lab-canonical">
            <span className="fw-semibold">{recordTitle}</span>
            {facts.length === 0 ? (
              <span className="text-muted"> · nothing projected yet</span>
            ) : facts.map((fact) => (
              <span key={fact.term} className="text-muted">
                {` · ${fact.term}: ${fact.value}`}
              </span>
            ))}
            <span className="d-block text-muted mt-1">
              Read from the snapshot, not the profile. These five values must be identical on all
              four tabs; if a lens moves one of them, the lens has reached past framing into fact.
            </span>
          </dd>

          <dt className="col-sm-3 col-lg-2">Surface lens</dt>
          <dd className="col-sm-9 col-lg-10" data-testid="cs-surface-lab-lens">
            <span className="fw-semibold">{activeTab.label}</span>
            {surface && <span className="text-muted">{` · ${surface.brandLabel}`}</span>}
            <span className="d-block text-muted fst-italic mt-1">{activeTab.readerQuestion}</span>
          </dd>

          <dt className="col-sm-3 col-lg-2">Publication</dt>
          <dd className="col-sm-9 col-lg-10" data-testid="cs-surface-lab-publication">
            {publication.label}
            {' · '}
            <StatusBadge
              label={publication.gateLabel}
              tone={publication.gateAllows ? 'success' : 'danger'}
            />
            {publication.blockerCodes.length > 0 && (
              <span className="text-muted">{` (${publication.blockerCodes.join(', ')})`}</span>
            )}
          </dd>

          <dt className="col-sm-3 col-lg-2">Draft state</dt>
          <dd className="col-sm-9 col-lg-10" data-testid="cs-surface-lab-draft">
            {drafts.label}
            <span className="d-block text-muted mt-1">
              A state, not a count. Snapshots are content-hashed wholes, so nothing in this system
              can honestly say how many fields differ.
            </span>
          </dd>
        </dl>

        {!preview ? (
          <p className="text-muted mb-0" data-testid="cs-surface-lab-idle">
            {loading ? 'Rendering this lens...' : 'Pick a lens to render it.'}
          </p>
        ) : (
          <>
            <h3 className="h6" data-testid="cs-surface-lab-order-heading">
              {`Reading order on ${activeTab.label}`}
            </h3>
            <p className="small text-muted">
              The bands this record would render on this surface, in this lens&apos;s order,
              computed by the same function the public page uses. A lens reorders. It does not
              drop.
            </p>
            <ol className="list-group list-group-numbered mb-3" data-testid="cs-surface-lab-bands">
              {composition.bands.map((band) => (
                <li
                  className="list-group-item d-flex justify-content-between align-items-start"
                  key={band.key}
                  data-testid={`cs-lens-band-${band.key}`}
                >
                  <div className="ms-2 me-auto">
                    <div className="fw-semibold">{band.heading}</div>
                    <div className="small text-muted">
                      {band.key}
                      {bandSummary(projection, band.key) && ` · ${bandSummary(projection, band.key)}`}
                    </div>
                  </div>
                  {band.required && (
                    <span
                      className="badge bg-secondary rounded-pill"
                      data-testid={`cs-lens-required-${band.key}`}
                      title="On the attribution floor: no lens can hide this band."
                    >
                      required
                    </span>
                  )}
                </li>
              ))}
            </ol>

            {composition.bands.length === 0 && (
              <p className="text-muted" data-testid="cs-surface-lab-no-bands">
                This record renders no bands at all on this lens — there is no snapshot to project.
              </p>
            )}

            {composition.unsupported.length > 0 && (
              <p className="small text-muted" data-testid="cs-surface-lab-unsupported">
                {`Not rendered because the RECORD is silent, not because this lens hid them: `}
                {composition.unsupported.join(', ')}
                {'. A lens constrains framing; it never constrains what the record carries.'}
              </p>
            )}

            {composition.floorOverrides.length > 0 && (
              <p className="small" data-testid="cs-surface-lab-floor-overrides">
                {`This surface asked to hide ${composition.floorOverrides.join(', ')} and could not: `}
                {'those bands are on the attribution floor.'}
              </p>
            )}

            <p className="small text-muted mb-0" data-testid="cs-surface-lab-publish-note">
              Publishing is not on this panel. It stays bound to the
              {` ${LIVE_SURFACE_KEY} `}
              surface in the Publish panel above, chosen explicitly, so exploring a lens can never
              become publishing to one.
            </p>
          </>
        )}
      </div>
    </SectionCard>
  );
}
