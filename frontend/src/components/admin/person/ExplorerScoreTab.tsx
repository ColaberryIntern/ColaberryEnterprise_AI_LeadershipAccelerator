import React from 'react';
import { ExplorerScorePanel } from '../../../adminOs/personTypes';
import { EmptyPanel, Stat, fmtDate } from './primitives';

/**
 * Engagement / Intent / Fit, as the growth engine scored this person (T212).
 *
 * ── THE ONLY HARD RULE HERE: ABSENCE IS NOT ZERO ────────────────────────────
 *
 * `panel === null` means "permitted to see this, and there is no snapshot" —
 * which is most non-Explorers. It renders as a sentence saying so, never as
 * 0 / 0 / 0. Three zeroes are a REAL score: a person the engine has looked at
 * and found cold. If an unscored person rendered as zeroes, an operator could
 * not tell "we have no reading on them" from "we read them and they are cold",
 * and those two lead to opposite actions.
 *
 * `panel === undefined` never reaches this component: the tab is not built at
 * all, and `withheldPanels` names the panel on the page so the reader is told
 * what is being withheld rather than being shown a silent gap. That is the
 * distinction `personTypes` encodes and `personTabs` gates on.
 *
 * ── NO PERMISSION LOGIC LIVES HERE ──────────────────────────────────────────
 *
 * This component reads no role, no section and no flag. It renders what the
 * server chose to send. The authority is `personProfileService.mayReadPanel`,
 * and T212 deliberately introduced no second path — a frontend that decided for
 * itself who may see a score would be a second answer to a question the backend
 * already answers.
 *
 * ── WHY THE DATE IS NOT DECORATION ──────────────────────────────────────────
 *
 * `asOfDate` is the snapshot's own date, shown next to the numbers rather than
 * tucked away, because a score from six weeks ago read as current is worse than
 * no score: it is a stale number an operator will act on.
 */
export default function ExplorerScoreTab({ panel }: {
  panel: ExplorerScorePanel | null | undefined;
}) {
  if (!panel) {
    return (
      <EmptyPanel>
        No Explorer score has been recorded for this person yet — which is normal
        for anyone who is not on the learner programme. This is not a score of zero.
      </EmptyPanel>
    );
  }

  return (
    <div className="card border-0 shadow-sm mb-4">
      <div className="card-header bg-white d-flex justify-content-between align-items-center">
        <span className="fw-semibold">Explorer score</span>
        <span className="text-muted small">
          Snapshot of {fmtDate(panel.asOfDate) ?? panel.asOfDate}
        </span>
      </div>
      <div className="card-body">
        <div className="row">
          <Stat label="Engagement" value={panel.engagement} hint="What they have done" />
          <Stat label="Intent" value={panel.intent} hint="What they are signalling" />
          <Stat label="Fit" value={panel.fit} hint="How well the programme suits them" />
          <Stat label="State" value={panel.primaryState} />
        </div>
        {panel.overlays.length > 0 && (
          <div className="mt-2">
            <div
              className="text-muted text-uppercase mb-2"
              style={{ letterSpacing: '.05em', fontSize: '.7rem' }}
            >
              Overlays
            </div>
            <div className="d-flex gap-2 flex-wrap">
              {panel.overlays.map((o) => (
                <span key={o} className="badge bg-light text-dark border">{o}</span>
              ))}
            </div>
          </div>
        )}
        {panel.overlays.length === 0 && (
          <div className="text-muted small mt-2">No overlays on this snapshot.</div>
        )}
      </div>
    </div>
  );
}
