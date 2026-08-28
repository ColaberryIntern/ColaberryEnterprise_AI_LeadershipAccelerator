import React from 'react';
import { SectionCard } from '../shell';
import CaseStudyOverrideField from './CaseStudyOverrideField';
import { CASE_STUDY_CONTROLS } from './caseStudyDesk';
import type { SnapshotView } from './caseStudySnapshotView';

/**
 * CaseStudyNarrativePanel — spec §18's Identity, Story, Build timeline,
 * Architecture and Taxonomy sections of the review editor.
 *
 * Everything on the left is what the SYNC produced. Everything applied on the
 * right is human editorial copy, written as a new snapshot version rather than
 * as an edit in place, so the two ownerships stay separable and a later sync
 * cannot quietly overwrite approved words (spec §34).
 *
 * A section with nothing in it says so. Spec §23 hides unsupported sections on
 * the public page, and the reviewer needs to see WHICH ones would disappear.
 */

interface Props {
  view: SnapshotView;
  busy: boolean;
  hasSnapshot: boolean;
  onApplyOverride: (path: string, value: string, note?: string) => void;
}

const Empty = ({ what }: { what: string }): React.ReactElement => (
  <p className="small text-muted mb-2">
    No {what} in this snapshot. The public page hides this section rather than rendering it blank.
  </p>
);

/**
 * Why the three override fields below go inert when there is no snapshot.
 *
 * This panel already warns, in an alert, that a candidate with no snapshot has
 * "nothing to review" — and then rendered three fully enabled Apply-override
 * buttons underneath it. Pressing one on production 2026-08-26 POSTed an
 * override against a record with no snapshot and came back 404, which the
 * client turned into "this override not found.". The panel had already said the
 * right thing; it simply did not act on it.
 */
const NO_SNAPSHOT_REASON = 'This candidate has no snapshot, so there is no field to override. '
  + 'Run a sync on the SOURCES tab to build one.';

export default function CaseStudyNarrativePanel({
  view, busy, hasSnapshot, onApplyOverride,
}: Props): React.ReactElement {
  return (
    <SectionCard title="Narrative" icon="article-line" className="mb-4">
      {!hasSnapshot && (
        <div className="alert alert-warning" data-testid="cs-narrative-no-snapshot">
          This candidate has no snapshot yet, so there is nothing to review. Run a sync to build
          one from its repositories.
        </div>
      )}

      <div className="row g-4">
        <div className="col-lg-6">
          <h3 className="h6">Identity</h3>
          <dl className="row small mb-3">
            <dt className="col-5">Title</dt>
            <dd className="col-7">{view.title || '—'}</dd>
            <dt className="col-5">Standfirst</dt>
            <dd className="col-7">{view.standfirst || '—'}</dd>
            <dt className="col-5">Organization</dt>
            <dd className="col-7">
              {view.organizationDisplayName || '—'} ({view.organizationIdentityMode || 'unset'})
            </dd>
            <dt className="col-5">Industry</dt>
            <dd className="col-7">{view.industry || '—'}</dd>
            <dt className="col-5">Primary capability</dt>
            <dd className="col-7">{view.primaryCapability || '—'}</dd>
          </dl>

          <h3 className="h6">Story</h3>
          {view.situationBody.length === 0 ? <Empty what="situation narrative" /> : (
            <>
              <p className="small fw-semibold mb-1">{view.situationHeading}</p>
              {view.situationBody.map((para, i) => (
                <p key={`${i}-${para.slice(0, 12)}`} className="small">{para}</p>
              ))}
            </>
          )}

          <h3 className="h6">Build timeline</h3>
          {view.timeline.length === 0 ? <Empty what="dated build steps" /> : (
            <ul className="small">
              {view.timeline.map((entry) => (
                <li key={`${entry.date}-${entry.label}`}>
                  <strong>{entry.date}</strong> {entry.label}
                  {entry.detail ? ` — ${entry.detail}` : ''}
                  <span className="text-muted"> ({entry.sourceKind})</span>
                </li>
              ))}
            </ul>
          )}

          <h3 className="h6">Architecture</h3>
          {view.stack.length === 0 && view.architectureNarrative.length === 0
            ? <Empty what="architecture facts" /> : (
              <>
                {view.architectureNarrative.map((para, i) => (
                  <p key={`arch-${i}`} className="small">{para}</p>
                ))}
                <p className="small mb-1"><strong>Stack:</strong> {view.stack.join(', ') || '—'}</p>
                <p className="small mb-1">
                  <strong>Capabilities:</strong> {view.capabilities.join(', ') || '—'}
                </p>
                <p className="small mb-1">
                  <strong>Integrations:</strong> {view.integrations.join(', ') || '—'}
                </p>
              </>
            )}

          <h3 className="h6">Roadmap</h3>
          {view.roadmap.length === 0 ? <Empty what="roadmap items" /> : (
            <ul className="small">
              {view.roadmap.map((item) => (
                <li key={item.label}>{item.label} — {item.status}</li>
              ))}
            </ul>
          )}
        </div>

        <div className="col-lg-6">
          <h3 className="h6">Human editorial copy</h3>
          <p className="small text-muted">
            An override becomes a new snapshot version and must be approved like any other. The
            generated value stays visible underneath.
          </p>
          <CaseStudyOverrideField
            label="Standfirst"
            path="identity.standfirst"
            generated={view.standfirst}
            testId={CASE_STUDY_CONTROLS['review/edit narrative']}
            busy={busy}
            onApply={onApplyOverride}
            disabledReason={hasSnapshot ? undefined : NO_SNAPSHOT_REASON}
            help="One sentence under the title on the public page."
          />
          <CaseStudyOverrideField
            label="Situation heading"
            path="situation.heading"
            generated={view.situationHeading}
            testId="cs-narrative-override-heading"
            busy={busy}
            onApply={onApplyOverride}
            disabledReason={hasSnapshot ? undefined : NO_SNAPSHOT_REASON}
          />
          <CaseStudyOverrideField
            label="Summary"
            path="identity.summary"
            generated={view.summary}
            testId="cs-narrative-override-summary"
            busy={busy}
            onApply={onApplyOverride}
            disabledReason={hasSnapshot ? undefined : NO_SNAPSHOT_REASON}
            rows={3}
          />
        </div>
      </div>
    </SectionCard>
  );
}
