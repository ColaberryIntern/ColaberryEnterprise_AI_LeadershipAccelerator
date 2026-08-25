import React from 'react';
import { SectionCard, StatusBadge } from '../shell';
import { CASE_STUDY_CONTROLS, formatDate } from './caseStudyDesk';
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
  actionError: string | null;
  actionNote: string | null;
  busy: boolean;
  onApprove: () => void;
  onPublish: () => void;
  onUnpublish: () => void;
  onArchive: () => void;
}

export default function CaseStudyPublishPanel({
  record, latestSnapshot, approvedSnapshot, publications, blockers, blockerSource,
  actionError, actionNote, busy, onApprove, onPublish, onUnpublish, onArchive,
}: Props): React.ReactElement {
  const enterprise = publications.find((p) => p.surfaceKey === 'enterprise') ?? null;
  const isLive = enterprise?.status === 'published';

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

      {actionError && (
        <div className="alert alert-danger" data-testid="cs-action-error">{actionError}</div>
      )}
      {actionNote && (
        <div className="alert alert-success" data-testid="cs-action-note">{actionNote}</div>
      )}

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
        {/* Not disabled by readiness, by a band, or by any client-side opinion.
            The gate answers this, on the server, on every call. */}
        <button
          type="button" className="btn btn-sm btn-danger"
          data-testid={CASE_STUDY_CONTROLS.publish} onClick={onPublish} disabled={busy}
        >
          Publish to enterprise
        </button>
        <button
          type="button" className="btn btn-sm btn-outline-secondary"
          data-testid={CASE_STUDY_CONTROLS.unpublish} onClick={onUnpublish} disabled={busy}
          title="Removes public visibility. Snapshots, evidence and history are kept."
        >
          Unpublish
        </button>
        <button
          type="button" className="btn btn-sm btn-outline-secondary"
          data-testid={CASE_STUDY_CONTROLS.archive} onClick={onArchive} disabled={busy}
          title="Soft archive. Nothing is deleted, and a live record must be unpublished first."
        >
          Archive
        </button>
      </div>

      <p className="small text-muted mt-3 mb-0">
        {isLive
          ? 'This record is live on the enterprise surface. Unpublish before archiving; archiving a live record is refused.'
          : 'Publishing pins the approved snapshot version. A later draft never moves what is live.'}
      </p>
    </SectionCard>
  );
}
