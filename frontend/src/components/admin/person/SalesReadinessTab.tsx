import React from 'react';
import {
  SalesReadinessScore, SalesReadinessFreshness, SalesReadinessFactor,
} from '../../../adminOs/personTypes';
import { EmptyPanel, Stat, fmtDateTime } from './primitives';

/**
 * The Sales Readiness Score, on the person it describes (M26).
 *
 * ── THE NUMBER IS NOT THE POINT; THE REASONS ARE ────────────────────────────
 *
 * A rep cannot act on "61". They can act on "started an enrolment, replied to a human, last seen
 * two days ago". So the factor breakdown is the body of this panel and the total is its heading,
 * not the other way round. A score a human cannot argue with is a score they will ignore.
 *
 * ── ABSENCE IS NOT ZERO, AND BOTH ARE SHOWN ─────────────────────────────────
 *
 * `points === null` with `state === 'absent'` means there was no evidence to score: the factor
 * prints its reason, not a nought. `points === 0` with `state === 'scored'` means we looked and
 * found nothing, which is a real measurement and prints as 0. Those two lead to opposite actions
 * - go and find out, versus stop chasing - so they must never render alike. This is the same rule
 * `ExplorerScoreTab` states, and the failure M24.1 to M24.3 removed from the evidence beneath it.
 *
 * ── OUT OF WHAT ─────────────────────────────────────────────────────────────
 *
 * The total is shown against `scoreableMax`, the most THIS person could have scored given which
 * factors had evidence, and `coverage` says how much of the ruleset that was. Showing it against
 * the ruleset maximum would make a well-evidenced 60 and a barely-known 60 look identical, when
 * the second is a guess wearing the first one's clothes.
 *
 * ── NO PERMISSION LOGIC LIVES HERE ──────────────────────────────────────────
 *
 * This component reads no role, no section and no flag. It renders what the server sent. The
 * score is composed from panels the caller was already permitted, so it cannot show anything the
 * profile would not.
 */

const BAND_LABEL: Record<SalesReadinessFactor['band'], string> = {
  commitment: 'Commitment',
  context: 'Context',
  passive: 'Browsing',
};

const FRESHNESS_TONE: Record<SalesReadinessFreshness['state'], 'good' | 'warn' | 'bad' | undefined> = {
  fresh: 'good',
  aging: 'warn',
  stale: 'bad',
  unknown: 'warn',
};

function FactorRow({ f }: { f: SalesReadinessFactor }) {
  const absent = f.state === 'absent';
  const pct = f.max > 0 && f.points !== null ? Math.round((f.points / f.max) * 100) : 0;
  return (
    <tr>
      <td>
        <div className="fw-medium">{f.label}</div>
        <div className="text-muted small">
          {BAND_LABEL[f.band]} &middot; from <code>{f.evidenceGroup}</code>
        </div>
      </td>
      <td style={{ width: '38%' }}>
        {absent ? (
          <span className="text-muted small fst-italic">{f.reason}</span>
        ) : (
          <div className="progress" style={{ height: 8 }} role="img"
            aria-label={`${f.points} of ${f.max} points`}>
            <div
              className={`progress-bar ${f.points === 0 ? 'bg-secondary' : 'bg-success'}`}
              style={{ width: `${f.max === 0 ? 0 : pct}%` }}
            />
          </div>
        )}
      </td>
      <td className="text-end" style={{ whiteSpace: 'nowrap' }}>
        {absent
          ? <span className="badge bg-light text-muted border">No evidence</span>
          : <span className="fw-semibold">{f.points} <span className="text-muted fw-normal">/ {f.max}</span></span>}
      </td>
    </tr>
  );
}

export default function SalesReadinessTab({ score, freshness }: {
  score: SalesReadinessScore | undefined;
  freshness: SalesReadinessFreshness | undefined;
}) {
  if (!score) {
    return (
      <EmptyPanel>
        No readiness score was computed for this person. This is not a score of zero.
      </EmptyPanel>
    );
  }

  const scored = score.factors.filter((f) => f.state === 'scored');
  const absent = score.factors.filter((f) => f.state === 'absent');

  return (
    <div>
      <div className="row g-3 mb-3">
        <div className="col-6 col-md-3">
          <Stat label="Readiness" value={`${score.total} / ${score.scoreableMax}`}
            hint="out of what this person's evidence allowed" />
        </div>
        <div className="col-6 col-md-3">
          <Stat label="Evidence coverage" value={`${Math.round(score.coverage * 100)}%`}
            tone={score.coverage < 0.5 ? 'warn' : undefined}
            hint={`${scored.length} of ${score.factors.length} factors had evidence`} />
        </div>
        <div className="col-6 col-md-3">
          <Stat label="Payment friction" value={score.frictionFlag ? 'Yes' : 'No'}
            tone={score.frictionFlag ? 'warn' : undefined}
            hint="never lowers the score; it changes the next action" />
        </div>
        <div className="col-6 col-md-3">
          <Stat label="Score age" value={freshness?.ageHours != null ? `${Math.round(freshness.ageHours)}h` : 'Unknown'}
            tone={freshness ? FRESHNESS_TONE[freshness.state] : 'warn'}
            hint={freshness?.boundBy === 'evidence' ? 'bounded by its oldest evidence' : undefined} />
        </div>
      </div>

      {freshness && freshness.state !== 'fresh' && (
        <div className={`alert ${freshness.state === 'stale' ? 'alert-danger' : 'alert-warning'} py-2 small`}>
          {freshness.label}
        </div>
      )}

      <div className="table-responsive">
        <table className="table table-sm align-middle mb-0">
          <thead className="table-light">
            <tr>
              <th>Factor</th>
              <th>Contribution</th>
              <th className="text-end">Points</th>
            </tr>
          </thead>
          <tbody>
            {scored.map((f) => <FactorRow key={f.key} f={f} />)}
            {absent.length > 0 && (
              <tr>
                <td colSpan={3} className="bg-light text-muted small fw-semibold">
                  No evidence for these &mdash; not scored as zero
                </td>
              </tr>
            )}
            {absent.map((f) => <FactorRow key={f.key} f={f} />)}
          </tbody>
        </table>
      </div>

      <p className="text-muted small mt-3 mb-0">
        Ruleset <code>{score.rulesetVersion}</code>, computed {fmtDateTime(score.computedAt)}.
        The weights are <strong>provisional</strong> and are not calibrated against conversion
        data; the ordering they produce is meaningful, the absolute number is not a probability.
      </p>
    </div>
  );
}
