import React from 'react';
import { SectionCard } from '../shell';
import { CASE_STUDY_CONTROLS } from './caseStudyDesk';
import type { ProvenanceRow } from './caseStudySnapshotView';

/**
 * CaseStudyProvenancePanel — spec §9 and §18's "show provenance for
 * generated/inferred fields".
 *
 * WHY IT IS VERSION-AWARE. The record read returns provenance for the latest
 * draft; the version that is LIVE may be an older approved one. Reviewing the
 * draft's sources and assuming they describe what a visitor is reading is the
 * exact mistake this panel exists to prevent, so choosing another version fetches
 * that version rather than re-labelling the one already on screen.
 *
 * A field with no provenance entry is reported as unknown rather than assumed to
 * be human-authored. `unknown_provenance_fields` is a sync warning for the same
 * reason: an unattributed claim is the thing the publish gate refuses.
 */

export interface ProvenanceVersionOption {
  /** `null` selects the latest draft already loaded with the record. */
  readonly snapshotId: string | null;
  readonly label: string;
}

interface Props {
  rows: readonly ProvenanceRow[];
  versions: readonly ProvenanceVersionOption[];
  /** '' means the latest draft. */
  selectedSnapshotId: string;
  onSelectVersion: (snapshotId: string) => void;
  loading: boolean;
  error: string | null;
}

export default function CaseStudyProvenancePanel({
  rows, versions, selectedSnapshotId, onSelectVersion, loading, error,
}: Props): React.ReactElement {
  return (
    <SectionCard
      title="Provenance" icon="git-commit-line" className="mb-4"
      actions={
        <select
          className="form-select form-select-sm"
          data-testid={CASE_STUDY_CONTROLS['inspect provenance']}
          aria-label="Snapshot version to inspect"
          value={selectedSnapshotId} disabled={loading}
          onChange={(e) => onSelectVersion(e.target.value)}
        >
          {versions.map((version) => (
            <option key={version.snapshotId ?? 'latest'} value={version.snapshotId ?? ''}>
              {version.label}
            </option>
          ))}
        </select>
      }
    >
      {error && <div className="alert alert-danger" data-testid="cs-provenance-error">{error}</div>}

      {loading ? (
        <p className="text-muted mb-0">Reading that snapshot version...</p>
      ) : rows.length === 0 ? (
        <p className="text-muted mb-0" data-testid="cs-provenance-empty">
          This snapshot records no provenance. Every generated field is therefore unattributed,
          which the sync reports as a warning and the publish gate treats as an unverified claim.
        </p>
      ) : (
        <div className="table-responsive">
          <table className="table table-sm mb-0">
            <thead>
              <tr>
                <th>Field</th>
                <th>Source</th>
                <th>Detail</th>
              </tr>
            </thead>
            <tbody>
              {rows.map((row) => (
                <tr key={row.field} data-testid={`cs-provenance-${row.field}`}>
                  <td className="font-monospace small">{row.field}</td>
                  <td className="small">{row.source}</td>
                  <td className="small text-muted">{row.detail || '—'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </SectionCard>
  );
}
