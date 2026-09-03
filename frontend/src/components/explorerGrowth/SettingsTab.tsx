import React from 'react';
import SectionCard from '../admin/shell/SectionCard';
import StatusBadge from '../admin/shell/StatusBadge';
import AsyncPanel, { type AsyncState } from './AsyncPanel';
import type { ExplorerSummary } from '../../services/explorerGrowthApi';

/**
 * Settings — the operating mode, and an honest account of what is not here.
 *
 * ── THIS TAB IS MOSTLY A STATEMENT, ON PURPOSE ──────────────────────────────
 *
 * §26's mockup puts a mode dropdown, a Recalculate button and a PAUSE control in
 * the page header. None of them exist yet, and the tab says so rather than
 * leaving a reader waiting for a panel that is not coming.
 *
 * Two independent reasons, both worth stating on the page itself:
 *
 * 1. Every one of §27's seven write routes is unbuilt. A control wired to a
 *    route that 404s is worse than no control — and a kill switch that looks
 *    clickable but does nothing is the worst of them, because someone will
 *    believe they have stopped the system.
 *
 * 2. The mode control is a governance boundary rather than a widget. Its upper
 *    values (`pilot`, `limited`, `full`) are what would let this system begin
 *    sending email to real learners. That is a decision to be taken
 *    deliberately, with its own approval, not delivered as a side effect of
 *    building a page.
 */

const NON_SENDING_MODES = ['off', 'observe', 'shadow'];

/**
 * ── WHY THIS TAKES THE STATE AND NOT THE DATA ───────────────────────────────
 *
 * The first version of this component took `summary: ExplorerSummary | null` and
 * was **the only tab that did not route through `AsyncPanel`**. Verification
 * caught it, correctly: with `null` meaning both "still loading" and "the
 * request failed", it rendered *"No run has recorded a mode yet"* for all three
 * cases — a sentence that is true of exactly one of them.
 *
 * That is the failure this programme has now shipped twice and that every other
 * tab in this same change was built to eliminate: an outage and an empty result
 * rendering identically, with the calm reading the one a reader takes away. On
 * the tab whose entire job is telling someone whether the system is running, it
 * was the worst possible place for it.
 *
 * So it takes the whole `AsyncState` and lets `AsyncPanel` draw the three states
 * apart, like everything else here.
 */
export default function SettingsTab({ state }: { state: AsyncState<ExplorerSummary> }) {
  return (
    <AsyncPanel
      state={state}
      isEmpty={(s) => s.modes.length === 0}
      emptyMessage="No run has recorded a mode yet."
      emptyHint="That is not the same as the system being off — it means the nightly recompute has not written a decision. This request succeeded."
    >
      {(summary) => <Body summary={summary} />}
    </AsyncPanel>
  );
}

/** Pure given a summary, so the mode logic is testable without an async shell. */
export function Body({ summary }: { summary: ExplorerSummary }) {
  const modes = summary.modes;
  const sending = modes.some((m) => !NON_SENDING_MODES.includes(m));

  return (
    <div className="row g-3">
      <div className="col-12 col-xl-6">
        <SectionCard title="Operating mode" icon="toggle-line">
          <>
              <div className="d-flex align-items-center gap-2 mb-3">
                {modes.map((m) => (
                  <StatusBadge key={m} label={m} tone={NON_SENDING_MODES.includes(m) ? 'neutral' : 'danger'} />
                ))}
                {modes.length > 1 && (
                  <span className="text-muted small">
                    more than one mode in a single run — the mode changed mid-run
                  </span>
                )}
              </div>

              {sending ? (
                <div className="alert alert-danger py-2 px-3 small mb-0">
                  <i className="ri-alarm-warning-line me-1" aria-hidden="true" />
                  This mode can execute actions. Decisions here may result in real messages.
                </div>
              ) : (
                <div className="alert alert-success py-2 px-3 small mb-0">
                  <i className="ri-shield-check-line me-1" aria-hidden="true" />
                  Nothing sends in this mode. Decisions are recorded and nothing is executed
                  — {summary.executed} executed on the latest run.
                </div>
              )}
          </>
        </SectionCard>
      </div>

      <div className="col-12 col-xl-6">
        <SectionCard title="What this tab does not show" icon="information-line">
          <p className="small mb-2">
            Flags, caps and thresholds are <strong>not served by any read endpoint</strong>. They
            are not hidden or still loading — no route returns them, and none will until the
            controls that set them are built.
          </p>
          <ul className="small mb-3">
            <li>
              <strong>Mode switch</strong> — deliberately absent. Its upper values are what would
              let this system start sending to real learners, so it is a decision with its own
              approval rather than a control that ships with a page.
            </li>
            <li>
              <strong>Pause / kill switch</strong> — absent because the backend route does not
              exist. A switch that looks like it stops the system, and does not, is worse than
              none.
            </li>
            <li>
              <strong>Recalculate</strong> — absent for the same reason.
            </li>
          </ul>
          <div className="alert alert-secondary py-2 px-3 small mb-0">
            Phase A shipped twelve read endpoints and no write path. This page reads. Any control
            that changes the system arrives with its own backend and its own decision.
          </div>
        </SectionCard>
      </div>
    </div>
  );
}
