import React from 'react';
import { SectionCard, StatusBadge } from '../shell';
import { CASE_STUDY_CONTROLS } from './caseStudyDesk';
import { readSnapshot } from './caseStudySnapshotView';
import type { CaseStudySurfacePreview } from '../../../services/caseStudyAdminTypes';
import type { PublicCaseStudyDetail } from '../../../services/caseStudyPublicTypes';
import type { SnapshotView } from './caseStudySnapshotView';

/**
 * CaseStudyPreviewPanel — spec §34's admin preview, and the two views that make
 * it worth having.
 *
 * ONE RENDERER, NOT TWO. The right-hand column is the SAME projection the public
 * API serves, computed by the backend; this panel does not build a second view of
 * the snapshot. If the preview rendered its own, an admin could approve something
 * subtly different from what ships, and the human review step — the entire
 * justification for a person being in this loop — would be reviewing the wrong
 * artifact.
 *
 * THE CONTRAST IS THE POINT. The left column is the raw snapshot as the admin
 * holds it, including things a visitor will never see: pending metrics, private
 * repositories, anonymous contributors, unapproved artifacts. The projection is
 * where those are dropped. Showing only one of the two would hide either what is
 * being published or what is being withheld, and the delta beneath names every
 * difference in counts so neither has to be spotted by eye.
 */

interface Props {
  preview: CaseStudySurfacePreview | null;
  loading: boolean;
  error: string | null;
  /**
   * Which lens this panel is rendering. It exists so the button names the
   * surface it will actually fetch: the surface lab above can move the preview
   * onto Training, and a button that still said "enterprise" would be describing
   * a request nobody is making.
   */
  surfaceKey: string;
  onPreview: () => void;
}

/** Every count the projection changed, said out loud. */
function projectionDelta(raw: SnapshotView, projection: PublicCaseStudyDetail): string[] {
  const notes: string[] = [];
  const rawMetrics = raw.heroMetrics.length + raw.measurementMetrics.length;
  const shownMetrics = projection.heroMetrics.length;
  if (rawMetrics !== shownMetrics) {
    notes.push(
      `${rawMetrics - shownMetrics} of ${rawMetrics} metrics are not shown publicly. A metric that `
      + 'is not publishable, or whose verification is still pending, has no public shape at all.',
    );
  }
  if (raw.repositories.length !== projection.repositories.length) {
    notes.push(
      `${raw.repositories.length - projection.repositories.length} of ${raw.repositories.length} `
      + `repositories are not linked publicly (${projection.privateRepositoryCount} counted as `
      + 'private). A private repository is dropped, never rendered without its link.',
    );
  }
  if (raw.contributors.length !== projection.contributors.length) {
    notes.push(
      `${raw.contributors.length - projection.contributors.length} of ${raw.contributors.length} `
      + `contributors are not credited by name (${projection.anonymousContributorCount} anonymous).`,
    );
  }
  if (raw.artifacts.length !== projection.artifacts.length) {
    notes.push(
      `${raw.artifacts.length - projection.artifacts.length} of ${raw.artifacts.length} artifacts `
      + 'are withheld by their status or visibility, and are not offered as request links.',
    );
  }
  if (raw.organizationDisplayName && !projection.organizationLabel) {
    notes.push('The organization is named on the record but not on the public page.');
  } else if (raw.organizationDisplayName
    && projection.organizationLabel !== raw.organizationDisplayName) {
    notes.push(
      `The organization reads as "${projection.organizationLabel}" publicly, not `
      + `"${raw.organizationDisplayName}".`,
    );
  }
  if (notes.length === 0) {
    notes.push('The projection withheld nothing: every metric, repository, contributor and '
      + 'artifact in this snapshot reaches the public page.');
  }
  return notes;
}

export default function CaseStudyPreviewPanel({
  preview, loading, error, surfaceKey, onPreview,
}: Props): React.ReactElement {
  const raw = readSnapshot(preview?.snapshot?.content ?? null);
  const projection = preview?.projection ?? null;

  return (
    <SectionCard
      title="Preview" icon="eye-2-line" className="mb-4"
      actions={
        <button
          type="button" className="btn btn-sm btn-outline-danger"
          data-testid={CASE_STUDY_CONTROLS.preview} onClick={onPreview} disabled={loading}
        >
          {loading ? 'Rendering...' : `Preview ${surfaceKey} surface`}
        </button>
      }
    >
      {error && <div className="alert alert-danger" data-testid="cs-preview-error">{error}</div>}

      {!preview ? (
        <p className="text-muted mb-0" data-testid="cs-preview-idle">
          Not previewed yet. The preview writes nothing and shows both the raw snapshot and the
          projection a visitor would actually receive.
        </p>
      ) : (
        <>
          <div className="d-flex flex-wrap gap-3 align-items-center mb-3 small">
            <span>
              Previewing{' '}
              <strong>
                {preview.source === 'approved_snapshot' ? 'the approved snapshot'
                  : preview.source === 'latest_draft' ? 'the latest draft'
                    : 'nothing — no snapshot exists'}
              </strong>
              {preview.snapshot ? ` (v${preview.snapshot.version})` : ''}
            </span>
            <StatusBadge
              label={preview.decision.allowed ? 'gate: would publish' : 'gate: would refuse'}
              tone={preview.decision.allowed ? 'success' : 'danger'}
            />
            <span className="text-muted">
              This is the real gate decision, not a second opinion. Its named reasons are listed in
              the publish panel.
            </span>
          </div>

          <div className="row g-3">
            <div className="col-lg-6">
              <h3 className="h6" data-testid="cs-preview-raw-heading">
                Raw snapshot — admin only
              </h3>
              <p className="small text-muted">
                Everything the record holds, including what will never be published.
              </p>
              <dl className="row small">
                <dt className="col-6">Title</dt><dd className="col-6">{raw.title || '—'}</dd>
                <dt className="col-6">Organization</dt>
                <dd className="col-6">{raw.organizationDisplayName || '—'}</dd>
                <dt className="col-6">Metrics</dt>
                <dd className="col-6">{raw.heroMetrics.length + raw.measurementMetrics.length}</dd>
                <dt className="col-6">Repositories</dt>
                <dd className="col-6">{raw.repositories.length}</dd>
                <dt className="col-6">Contributors</dt>
                <dd className="col-6">{raw.contributors.length}</dd>
                <dt className="col-6">Artifacts</dt><dd className="col-6">{raw.artifacts.length}</dd>
              </dl>
              <pre
                className="small p-2 mb-0"
                style={{
                  background: 'var(--surface-sunken)', color: 'var(--text-body)',
                  maxHeight: '18rem', overflow: 'auto',
                  // MEASURED, not guessed. Without these two declarations the
                  // JSON's longest line pushed this <pre> to 3686px inside a
                  // .col-lg-6 whose min-width is auto, and the whole admin page's
                  // scrollWidth became 7745px against a 1440px viewport - a 6305px
                  // horizontal overflow on every other panel too. 'overflow: auto'
                  // alone does not stop it: the box has to be prevented from
                  // WIDENING before it can be asked to scroll. Injecting exactly
                  // these two into the live page took scrollWidth back to 1440.
                  whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                }}
                data-testid="cs-preview-raw-json"
              >
                {JSON.stringify(preview.snapshot?.content ?? {}, null, 2)}
              </pre>
            </div>

            <div className="col-lg-6">
              <h3 className="h6" data-testid="cs-preview-projection-heading">
                Public projection — what a visitor sees
              </h3>
              <p className="small text-muted">
                Produced by the same projection the public API serves. Already sanitised.
              </p>
              {!projection ? (
                <p className="text-muted" data-testid="cs-preview-no-projection">
                  Nothing projects: there is no snapshot to render, so a visitor would receive
                  nothing at all.
                </p>
              ) : (
                <>
                  <dl className="row small">
                    <dt className="col-6">Title</dt>
                    <dd className="col-6">{projection.title || '—'}</dd>
                    <dt className="col-6">Organization</dt>
                    <dd className="col-6">{projection.organizationLabel || 'not named'}</dd>
                    <dt className="col-6">Metrics</dt>
                    <dd className="col-6">{projection.heroMetrics.length}</dd>
                    <dt className="col-6">Repositories</dt>
                    <dd className="col-6">{projection.repositories.length}</dd>
                    <dt className="col-6">Contributors</dt>
                    <dd className="col-6">{projection.contributors.length}</dd>
                    <dt className="col-6">Artifacts</dt>
                    <dd className="col-6">{projection.artifacts.length}</dd>
                  </dl>
                  <pre
                    className="small p-2 mb-0"
                    style={{
                      background: 'var(--surface-sunken)', color: 'var(--text-body)',
                      maxHeight: '18rem', overflow: 'auto',
                  // MEASURED, not guessed. Without these two declarations the
                  // JSON's longest line pushed this <pre> to 3686px inside a
                  // .col-lg-6 whose min-width is auto, and the whole admin page's
                  // scrollWidth became 7745px against a 1440px viewport - a 6305px
                  // horizontal overflow on every other panel too. 'overflow: auto'
                  // alone does not stop it: the box has to be prevented from
                  // WIDENING before it can be asked to scroll. Injecting exactly
                  // these two into the live page took scrollWidth back to 1440.
                  whiteSpace: 'pre-wrap', overflowWrap: 'anywhere',
                    }}
                    data-testid="cs-preview-projection-json"
                  >
                    {JSON.stringify(projection, null, 2)}
                  </pre>
                </>
              )}
            </div>
          </div>

          {projection && (
            <div className="mt-3" data-testid="cs-preview-delta">
              <h3 className="h6">What the projection withheld</h3>
              <ul className="small mb-0">
                {projectionDelta(raw, projection).map((note) => <li key={note}>{note}</li>)}
              </ul>
            </div>
          )}
        </>
      )}
    </SectionCard>
  );
}
