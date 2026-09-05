import React from 'react';
import { SectionCard, StatusBadge } from '../shell';
import { CASE_STUDY_CONTROLS, formatDate } from './caseStudyDesk';
import CaseStudySurfacePublishRows from './CaseStudySurfacePublishRows';
import type { CaseStudySurfaceKey } from '../../../config/caseStudySurfaces';
import type {
  CaseStudyPublicationSummary, CaseStudyPublishBlocker, CaseStudySnapshotSummary, CaseStudySummary,
} from '../../../services/caseStudyAdminTypes';

/**
 * CaseStudyPublishPanel — approve, publish, unpublish, archive (spec §15, §35).
 *
 * THE BUTTON IS NEVER DISABLED BY A SCORE. Readiness is advisory and is rendered
 * in its own panel; the only authority on whether this record may go live is the
 * server-side publish gate, which runs on EVERY publish call including a repeat
 * publish of something already live. Disabling the control on a client-side
 * guess would replace a checked answer with an unchecked one, and would teach
 * reviewers to trust a number that authorises nothing.
 *
 * EVERY BLOCKER IS RENDERED, NOT THE FIRST. The gate returns each refusal with a
 * `field`, a `message` naming the field and its value, and a `remedy`. An admin
 * told "cannot publish" cannot act; an admin told which metric is pending, and
 * what would close it, can — and one told about only the first of four reasons
 * fixes one thing and presses the button again. So the list below is complete,
 * verbatim, and shows the count.
 */

interface Props {
  record: CaseStudySummary;
  latestSnapshot: CaseStudySnapshotSummary | null;
  approvedSnapshot: CaseStudySnapshotSummary | null;
  publications: readonly CaseStudyPublicationSummary[];
  /** Verbatim from the gate: a refused publish, or the preview's decision. */
  blockers: readonly CaseStudyPublishBlocker[];
  blockerSource: 'publish' | 'preview' | null;
  busy: boolean;
  onApprove: () => void;
  onPublish: (surfaceKey: CaseStudySurfaceKey) => void;
  onUnpublish: (surfaceKey: CaseStudySurfaceKey) => void;
  onArchive: () => void;
}

export default function CaseStudyPublishPanel({
  record, latestSnapshot, approvedSnapshot, publications, blockers, blockerSource,
  busy, onApprove, onPublish, onUnpublish, onArchive,
}: Props): React.ReactElement {
  const enterprise = publications.find((p) => p.surfaceKey === 'enterprise') ?? null;
  /* ANY surface, not just enterprise. Archive is refused while a record is live
     ANYWHERE, so a note watching one brand would tell an operator archiving was
     available seconds before the server refused it. */
  const liveSomewhere = publications.some((p) => p.status === 'published');

  return (
    <SectionCard title="Approve and publish" icon="send-plane-line" className="mb-4">
      <div className="row g-3 mb-3 small">
        <div className="col-md-3">
          <div className="text-muted">Record status</div>
          <StatusBadge label={record.status} />
        </div>
        <div className="col-md-3">
          <div className="text-muted">Latest snapshot</div>
          <div>
            {latestSnapshot
              ? `v${latestSnapshot.version} (${latestSnapshot.status})`
              : 'none built yet'}
          </div>
        </div>
        <div className="col-md-3">
          <div className="text-muted">Approved snapshot</div>
          <div>
            {approvedSnapshot
              ? `v${approvedSnapshot.version} by ${approvedSnapshot.approvedBy ?? 'unknown'}`
              : 'none approved yet'}
          </div>
        </div>
        <div className="col-md-3">
          <div className="text-muted">Enterprise publication</div>
          <div data-testid="cs-publication-state">
            {enterprise
              ? `${enterprise.status} (${formatDate(enterprise.publishedAt, true)})`
              : 'never published'}
          </div>
        </div>
      </div>

      {/*
        THE OUTCOME OF THE LAST WRITE IS NOT RENDERED HERE ANY MORE, and that is
        the fix rather than an omission. `actionNote` and `actionError` used to
        live in this panel; once the page became seven tabs, this panel reached
        the screen on PUBLISH only, so a consent save on TRUTH or a repository
        attach on SOURCES reported into a component the operator could not see.
        Both lines now render in `CaseStudyActionBand`, above the tab strip, on
        every tab — the same placement, for the same reason, as the gate band.
      */}
      {blockers.length > 0 && (
        <div className="alert alert-danger" data-testid="cs-publish-blockers">
          <p className="fw-semibold mb-2">
            {blockerSource === 'publish'
              ? `Publication refused. ${blockers.length} reason${blockers.length === 1 ? '' : 's'}, all of them:`
              : `The gate would refuse this publish. ${blockers.length} reason${blockers.length === 1 ? '' : 's'}, all of them:`}
          </p>
          <ol className="mb-0">
            {blockers.map((blocker, index) => (
              <li
                key={`${blocker.code}-${blocker.field}-${index}`}
                data-testid={`cs-publish-blocker-${index}`}
                className="mb-2"
              >
                <div>{blocker.message}</div>
                <div className="small">
                  <span className="fw-semibold">Field:</span>{' '}
                  <code>{blocker.field}</code>
                </div>
                <div className="small">
                  <span className="fw-semibold">To fix:</span> {blocker.remedy}
                </div>
                <div className="small text-muted font-monospace">{blocker.code}</div>
              </li>
            ))}
          </ol>
        </div>
      )}

      <CaseStudySurfacePublishRows
        publications={publications}
        busy={busy}
        onPublish={onPublish}
        onUnpublish={onUnpublish}
      />

      <div className="d-flex flex-wrap gap-2">
        <button
          type="button" className="btn btn-sm btn-outline-danger"
          data-testid={CASE_STUDY_CONTROLS.approve} onClick={onApprove}
          disabled={busy || !latestSnapshot}
          title={latestSnapshot
            ? 'Approve the latest snapshot version'
            : 'There is no snapshot to approve; run a sync first'}
        >
          Approve latest snapshot
        </button>
        {/* Publish and unpublish moved into the per-site rows above: a record
            can be live on one brand and not another, and a single pair of
            buttons could not say which. Approve and Archive stay here because
            they act on the RECORD, not on a surface. */}
        <button
          type="button" className="btn btn-sm btn-outline-secondary"
          data-testid={CASE_STUDY_CONTROLS.archive} onClick={onArchive} disabled={busy}
          title="Soft archive. Nothing is deleted, and a live record must be unpublished first."
        >
          Archive
        </button>
      </div>

      <p className="small text-muted mt-3 mb-0">
        {liveSomewhere
          ? 'This record is live on at least one site. Unpublish everywhere before archiving; archiving a live record is refused.'
          : 'Publishing pins the approved snapshot version. A later draft never moves what is live.'}
      </p>
    </SectionCard>
  );
}
