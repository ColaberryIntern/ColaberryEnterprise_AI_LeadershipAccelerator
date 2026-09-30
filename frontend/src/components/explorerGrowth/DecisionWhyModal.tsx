import React from 'react';
import StatusBadge from '../admin/shell/StatusBadge';
import AsyncPanel from './AsyncPanel';
import { useExplorerData } from './useExplorerData';
import { getWhy, type ExplorerWhy, type ExplorerWhyScores } from '../../services/explorerGrowthApi';

/**
 * The Why drilldown — the reason this whole epic exists.
 *
 * Everything else on this page is a table. This is the part that answers *why
 * did this learner get this, and why did they not get the other things they
 * qualified for?*
 *
 * ── EVERY LOSER IS RENDERED. NEVER A COUNT, NEVER A TOP-N. ──────────────────
 *
 * `suppressed` is mapped in full. No `.slice()`, no "show more", no cap. The
 * backend deliberately returns the complete list — 142 of 153 decisions carry
 * at least one — and truncating it here would discard the payload's entire
 * point at the last step, while leaving a screen that looks finished.
 *
 * That failure would be silent, which is why the test asserts the rendered
 * loser count equals the payload's rather than merely that some losers render.
 *
 * ── SCORES AT THE DECISION, AND SCORES NOW, ARE DIFFERENT THINGS ────────────
 *
 * They are shown side by side and labelled. Showing today's scores as the basis
 * of a past decision answers "what would we decide now" while appearing to
 * answer "why did we decide that" — and a nightly recompute means the two
 * disagree most of the time.
 */

function ScoreRow({ label, s, muted }: { label: string; s: ExplorerWhyScores | null; muted?: boolean }) {
  if (!s) {
    return (
      <tr className={muted ? 'text-muted' : undefined}>
        <td>{label}</td>
        <td colSpan={5} className="text-muted small">
          No profile row — this learner has a decision but no current profile.
        </td>
      </tr>
    );
  }
  return (
    <tr className={muted ? 'text-muted' : undefined}>
      <td className="text-nowrap">{label}</td>
      <td className="text-end">{s.e_score ?? '—'}</td>
      <td className="text-end">{s.i_score ?? '—'}</td>
      <td className="text-end">{s.f_score ?? '—'}</td>
      <td>{s.primary_state ? s.primary_state.replace(/_/g, ' ') : '—'}</td>
      <td>
        {s.overlays.length === 0 ? (
          <span className="text-muted small">none</span>
        ) : (
          <div className="d-flex flex-wrap gap-1">
            {s.overlays.map((o) => (
              <StatusBadge key={o} label={o.replace(/_/g, ' ')} tone="neutral" />
            ))}
          </div>
        )}
      </td>
    </tr>
  );
}

/**
 * The payload rendered. Exported because it is PURE given a `ExplorerWhy`, which
 * is what makes the "every loser is rendered" guarantee testable with
 * `renderToStaticMarkup` — this repo's convention, and the one the spec's file
 * map named. Testing it through the async shell would only ever reach the
 * loading state.
 */
export function WhyBody({ w }: { w: ExplorerWhy }) {
  return (
    <>
      {/* ── The winner ───────────────────────────────────────────────────── */}
      <div className="mb-4">
        <h6 className="text-uppercase text-muted small mb-2">What was decided</h6>
        <div className="d-flex align-items-center gap-2 flex-wrap mb-2">
          <StatusBadge label={w.outcome.selected_action ?? 'no action'} tone="success" />
          {w.outcome.channel && <span className="text-muted small">via {w.outcome.channel}</span>}
          {/* "not executed" is the expected state while every flag is off, so it
              reads neutral. An executed decision is the surprising one. */}
          <StatusBadge
            label={w.outcome.executed ? 'executed' : 'not executed'}
            tone={w.outcome.executed ? 'danger' : 'neutral'}
          />
          <span className="text-muted small ms-auto font-monospace">{w.decision_date}</span>
        </div>
        <div className="small bg-light border rounded p-2">{w.outcome.reason}</div>
      </div>

      {/* ── Every loser. The point. ──────────────────────────────────────── */}
      <div className="mb-4">
        <h6 className="text-uppercase text-muted small mb-2">
          Why not the others{' '}
          <span className="badge bg-secondary" data-testid="suppressed-count">
            {w.suppressed.length}
          </span>
        </h6>
        {w.suppressed.length === 0 ? (
          <div className="text-muted small">
            Nothing else qualified for this learner on this date. That is a real answer, not a
            missing one.
          </div>
        ) : (
          <div className="table-responsive">
            <table className="table table-sm mb-0" data-testid="suppressed-table">
              <thead className="table-light">
                <tr>
                  <th>Candidate</th>
                  <th>Campaign</th>
                  <th>Why it lost</th>
                </tr>
              </thead>
              <tbody>
                {/* No slice. No cap. Every one. */}
                {w.suppressed.map((s, i) => (
                  <tr key={`${s.action_type}-${s.campaign_key ?? i}`} data-testid="suppressed-row">
                    <td className="text-nowrap">{s.action_type}</td>
                    <td className="text-muted small">{s.campaign_key ?? '—'}</td>
                    <td className="small">{s.reason}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ── Candidates considered ────────────────────────────────────────── */}
      {w.candidates.length > 0 && (
        <div className="mb-4">
          <h6 className="text-uppercase text-muted small mb-2">Everything considered, in rank order</h6>
          <div className="table-responsive">
            <table className="table table-sm mb-0">
              <thead className="table-light">
                <tr>
                  <th>Action</th>
                  <th>Campaign</th>
                  <th className="text-end">Tier</th>
                  <th className="text-end">Score</th>
                  <th>Rationale</th>
                </tr>
              </thead>
              <tbody>
                {w.candidates.map((c, i) => (
                  <tr key={`${c.action_type}-${i}`}>
                    <td className="text-nowrap">{c.action_type}</td>
                    <td className="text-muted small">{c.campaign_key ?? '—'}</td>
                    <td className="text-end">{c.priority_tier}</td>
                    <td className="text-end">{c.intra_tier_score}</td>
                    <td className="small text-muted">{(c.rationale ?? []).join(' · ')}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
          <div className="form-text">Lower tier wins. Score breaks a tie inside a tier.</div>
        </div>
      )}

      {/* ── Scores then vs now ───────────────────────────────────────────── */}
      <div className="mb-4">
        <h6 className="text-uppercase text-muted small mb-2">The basis</h6>
        <div className="table-responsive">
          <table className="table table-sm mb-2">
            <thead className="table-light">
              <tr>
                <th></th>
                <th className="text-end">E</th>
                <th className="text-end">I</th>
                <th className="text-end">F</th>
                <th>State</th>
                <th>Overlays</th>
              </tr>
            </thead>
            <tbody>
              <ScoreRow label="At the decision" s={w.scores_at_decision} />
              <ScoreRow label="Now" s={w.scores_now} muted />
            </tbody>
          </table>
        </div>
        {(w.drift.scores_changed || w.drift.state_changed) && (
          <div className="alert alert-info py-2 px-3 small mb-0">
            <i className="ri-information-line me-1" aria-hidden="true" />
            This learner has moved since the decision
            {w.drift.state_changed && <> — their state changed</>}
            {w.drift.scores_changed && <> — their scores changed</>}. The decision above was made on
            the earlier values, which is what it was actually based on.
          </div>
        )}
      </div>

      {/* ── Content, or the named gap ────────────────────────────────────── */}
      <div className="mb-4">
        <h6 className="text-uppercase text-muted small mb-2">Content</h6>
        {w.content.gap ? (
          <div className="alert alert-warning py-2 px-3 small mb-0">
            <div className="fw-semibold mb-1">{w.content.gap}</div>
            {w.content.named_gaps.length > 0 && (
              <div className="font-monospace">{w.content.named_gaps.join(', ')}</div>
            )}
          </div>
        ) : w.content.assets.length === 0 ? (
          <div className="text-muted small">
            No content was needed for this action.
          </div>
        ) : (
          <ul className="list-unstyled mb-0 small">
            {w.content.assets.map((a, i) => (
              <li key={i}>
                <i className="ri-file-text-line me-1" aria-hidden="true" />
                {String(a.title ?? a.id ?? 'asset')}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="text-muted small border-top pt-2">
        <span className="me-3">
          Mode: <strong>{w.mode}</strong>
        </span>
        <span className="me-3">
          Ruleset: <strong>{w.ruleset_version}</strong>
        </span>
        <span className="font-monospace">{w.decision_id}</span>
      </div>
    </>
  );
}

interface Props {
  decisionId: string;
  onClose: () => void;
}

export default function DecisionWhyModal({ decisionId, onClose }: Props) {
  const why = useExplorerData(() => getWhy(decisionId), `why:${decisionId}`);

  return (
    <div
      className="modal show d-block"
      style={{ backgroundColor: 'rgba(0,0,0,0.5)' }}
      role="dialog"
      aria-modal="true"
      aria-label="Why this decision was made"
      onClick={onClose}
    >
      <div className="modal-dialog modal-lg modal-dialog-scrollable" onClick={(e) => e.stopPropagation()}>
        <div className="modal-content">
          <div className="modal-header">
            <h5 className="modal-title">
              <i className="ri-question-answer-line me-2" aria-hidden="true" />
              Why?
            </h5>
            <button type="button" className="btn-close" onClick={onClose} aria-label="Close" />
          </div>
          <div className="modal-body">
            <AsyncPanel state={why} onRetry={why.reload}>
              {(w) => <WhyBody w={w} />}
            </AsyncPanel>
          </div>
        </div>
      </div>
    </div>
  );
}
