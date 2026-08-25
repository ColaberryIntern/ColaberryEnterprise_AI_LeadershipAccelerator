import React from 'react';
import { StatCard } from '../shell';
import { CASE_STUDY_CONTROLS, SCAN_LIMIT, needsConsent } from './caseStudyDesk';
import type { CaseStudyScanRow } from './caseStudyDesk';
import type { CaseStudySummary } from '../../../services/caseStudyAdminTypes';

/**
 * CaseStudyDashboard — spec §18's indicator row.
 *
 * WHY HALF OF IT NEEDS A SCAN. Of the EIGHT cards rendered below, four
 * (candidates, ready for review, published, needs consent) are answerable from
 * `CaseStudySummary`, which the list endpoint returns. The other four (connected
 * repos, needs evidence, needs media, sync failures) are not: repositories,
 * readiness and snapshots live on the RECORD, and reading them means one request
 * each. (An earlier version of this comment said "seven … the other three" and
 * then listed four — the count was wrong, the argument was not.)
 *
 * So this component never guesses. Until the scan has run those cards read
 * "Not scanned" rather than "0" — a zero is a claim about the database, and the
 * whole reason this desk exists is that a Case Study must not assert anything it
 * has not checked. The scan is explicit, bounded to `SCAN_LIMIT` records, and
 * reports how many records it could not read instead of dropping them.
 */

interface Props {
  scope: readonly CaseStudySummary[];
  scopeTotal: number;
  scan: ReadonlyMap<string, CaseStudyScanRow>;
  scanned: boolean;
  scanning: boolean;
  /** Records the scan asked for and could not read. Shown, never hidden. */
  scanFailures: number;
  onScan: () => void;
  activeState: string;
  onSelectState: (key: string) => void;
}

const countBy = (rows: readonly CaseStudySummary[], status: string): number =>
  rows.filter((r) => r.status === status).length;

export default function CaseStudyDashboard({
  scope, scopeTotal, scan, scanned, scanning, scanFailures, onScan, activeState, onSelectState,
}: Props): React.ReactElement {
  const scanRows = Array.from(scan.values());
  const measured = (value: number): React.ReactNode => (scanned ? value : 'Not scanned');
  const scanHint = scanned
    ? `across ${scanRows.length} scanned record${scanRows.length === 1 ? '' : 's'}`
    : 'run the scan to measure this';

  const sum = (pick: (row: CaseStudyScanRow) => number): number =>
    scanRows.reduce((n, row) => n + pick(row), 0);
  const count = (pick: (row: CaseStudyScanRow) => boolean): number =>
    scanRows.filter(pick).length;

  return (
    <section data-testid={CASE_STUDY_CONTROLS.dashboard} className="mb-4">
      <div className="row g-3">
        <div className="col-6 col-lg-3">
          <StatCard
            label="CONNECTED REPOS" value={measured(sum((r) => r.connectedRepos))}
            icon="git-repository-line" tone="info" hint={scanHint}
          />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard
            label="CANDIDATES" value={countBy(scope, 'draft')} icon="draft-line" tone="neutral"
            hint="drafts not yet in review" onClick={() => onSelectState('candidates')}
            active={activeState === 'candidates'}
          />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard
            label="READY FOR REVIEW" value={countBy(scope, 'review')} icon="eye-line" tone="warning"
            hint="waiting on a human" onClick={() => onSelectState('ready-for-review')}
            active={activeState === 'ready-for-review'}
          />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard
            label="PUBLISHED" value={countBy(scope, 'published')} icon="global-line" tone="success"
            hint="live on a public surface" onClick={() => onSelectState('published')}
            active={activeState === 'published'}
          />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard
            label="NEEDS EVIDENCE" value={measured(count((r) => r.needsEvidence))}
            icon="search-eye-line" tone="danger" hint={scanHint}
            onClick={() => onSelectState('needs-evidence')}
            active={activeState === 'needs-evidence'}
          />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard
            label="NEEDS MEDIA" value={measured(count((r) => r.needsMedia))}
            icon="image-line" tone="warning" hint={scanHint}
          />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard
            label="SYNC FAILURES" value={measured(count((r) => r.syncIssue))}
            icon="error-warning-line" tone="danger" hint={scanHint}
            onClick={() => onSelectState('sync-issues')}
            active={activeState === 'sync-issues'}
          />
        </div>
        <div className="col-6 col-lg-3">
          <StatCard
            label="NEEDS CONSENT" value={scope.filter(needsConsent).length}
            icon="shield-user-line" tone="danger" hint="named without recorded consent"
            onClick={() => onSelectState('needs-consent')}
            active={activeState === 'needs-consent'}
          />
        </div>
      </div>

      <div className="d-flex flex-wrap align-items-center gap-2 mt-2">
        <button
          type="button" className="btn btn-sm btn-outline-secondary"
          data-testid="cs-dashboard-scan" onClick={onScan} disabled={scanning}
        >
          {scanning ? 'Reading records...' : `Scan the ${Math.min(scope.length, SCAN_LIMIT)} most recent records`}
        </button>
        <span className="small text-muted">
          Status counts cover the {scope.length} most recent of {scopeTotal} record
          {scopeTotal === 1 ? '' : 's'}. Repositories, evidence, media and sync state are read one
          record at a time, so they are measured only after a scan.
        </span>
        {scanFailures > 0 && (
          <span className="small text-danger">
            {scanFailures} record{scanFailures === 1 ? '' : 's'} could not be read during the scan
            and {scanFailures === 1 ? 'is' : 'are'} not counted above.
          </span>
        )}
      </div>
    </section>
  );
}
