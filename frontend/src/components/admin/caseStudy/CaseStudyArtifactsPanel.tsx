import React from 'react';
import { SectionCard, StatusBadge } from '../shell';
import CaseStudyOverrideField from './CaseStudyOverrideField';
import { controlIdAt } from './caseStudyDesk';
import type { ArtifactView } from './caseStudySnapshotView';

/**
 * CaseStudyArtifactsPanel — spec §18's Artifacts section.
 *
 * The public contract has no `status` field on an artifact and no `private`
 * access variant, which means a `candidate` or a private artifact has no shape
 * to occupy on the visitor's page — it is dropped, not rendered as a dead
 * control (spec §23: do not create fake request/download links). So the two
 * columns that decide whether an artifact ever appears, `status` and
 * `visibility`, lead here.
 */

interface Props {
  artifacts: readonly ArtifactView[];
  busy: boolean;
  onApplyOverride: (path: string, value: string, note?: string) => void;
}

const STATUS_TONE: Record<string, 'success' | 'warning' | 'danger' | 'neutral'> = {
  approved: 'success',
  candidate: 'warning',
  rejected: 'danger',
};

export default function CaseStudyArtifactsPanel({
  artifacts, busy, onApplyOverride,
}: Props): React.ReactElement {
  const shown = artifacts.filter((a) => a.status === 'approved' && a.visibility !== 'private');

  return (
    <SectionCard title="Artifacts" icon="folder-image-line" className="mb-4">
      {artifacts.length === 0 ? (
        <p className="text-muted mb-0" data-testid="cs-artifacts-empty">
          No artifacts in this snapshot. The public page hides the artifacts section entirely
          rather than rendering an empty shelf.
        </p>
      ) : (
        <>
          <p className="small text-muted">
            {shown.length} of {artifacts.length} would reach a visitor. The rest are held back by
            their status or their visibility, and are not rendered as request links.
          </p>
          <div className="table-responsive mb-3">
            <table className="table table-sm align-middle mb-0">
              <thead>
                <tr>
                  <th>Title</th>
                  <th>Type</th>
                  <th>Source</th>
                  <th>Status</th>
                  <th>Visibility</th>
                  <th>Public</th>
                </tr>
              </thead>
              <tbody>
                {artifacts.map((artifact) => (
                  <tr key={artifact.path} data-testid={`cs-artifact-${artifact.path}`}>
                    <td>
                      <div className="fw-semibold">{artifact.title || '—'}</div>
                      {artifact.description && (
                        <div className="small text-muted">{artifact.description}</div>
                      )}
                    </td>
                    <td className="small">{artifact.artifactType || '—'}</td>
                    <td className="small">{artifact.sourceType || '—'}</td>
                    <td>
                      <StatusBadge
                        label={artifact.status || 'unknown'}
                        tone={STATUS_TONE[artifact.status] ?? 'neutral'}
                      />
                    </td>
                    <td className="small">{artifact.visibility || '—'}</td>
                    <td className="small">
                      {artifact.status === 'approved' && artifact.visibility !== 'private'
                        ? 'yes' : 'no'}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          <div className="row g-3">
            {artifacts.slice(0, 2).map((artifact, index) => (
              <div className="col-lg-6" key={`artifact-override-${artifact.path}`}>
                <CaseStudyOverrideField
                  label={`Title — ${artifact.title || artifact.path}`}
                  path={`${artifact.path}.title`}
                  generated={artifact.title}
                  testId={controlIdAt('artifacts', index)}
                  busy={busy}
                  onApply={onApplyOverride}
                  help="How the artifact is named on the public page."
                />
              </div>
            ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}
