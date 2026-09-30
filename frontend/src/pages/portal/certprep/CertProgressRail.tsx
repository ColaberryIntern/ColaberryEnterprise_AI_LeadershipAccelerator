import React from 'react';
import type { CertReadiness, CertDomain, CertTrackInfo } from '../../../services/certPrepApi';

/**
 * CertProgressRail — the sticky column a student tracks their progress in.
 *
 * It sits in the shell's shared `.te-side` slot (the same rail Projects, Today
 * and Classroom use), so it stays in view while the working area scrolls. That
 * is the whole point: the tabs below are where you DO things, and this is where
 * you watch the numbers move without scrolling back up.
 *
 * It deliberately does NOT repeat the hero's dial. The hero states where you
 * are; this counts what you have actually done, which is the part that changes
 * while you work.
 *
 * The honesty rules from the hero carry over unchanged, because a number that
 * lies is worse in a rail that is always on screen:
 *   - a readiness that was never computed reads "Not measured", never 0
 *   - a low sample is labelled provisional rather than presented as settled
 *   - a domain nobody has answered shows a dash, not 0%
 */

const LOW_CONFIDENCE = 0.6;

const STATE_LABEL: Record<string, string> = {
  sustained: 'Sustained',
  approaching: 'Approaching',
  building: 'Building',
  not_measured: 'Not measured',
};

export function domainsAttempted(readiness: CertReadiness | null): number {
  if (!readiness) return 0;
  return readiness.domain_breakdown.filter((d) => d.answered > 0).length;
}

export function evidenceVerified(readiness: CertReadiness | null): number {
  if (!readiness) return 0;
  return readiness.domain_breakdown.reduce((sum, d) => sum + (d.evidence_verified ?? 0), 0);
}

const Row: React.FC<{ label: string; value: React.ReactNode; hint?: string }> = ({ label, value, hint }) => (
  <div className="cp-rail-row">
    <span className="cp-rail-label">{label}</span>
    <span className="cp-rail-value">{value}</span>
    {hint && <span className="cp-rail-hint">{hint}</span>}
  </div>
);

interface Props {
  readiness: CertReadiness | null;
  domains: CertDomain[];
  track: CertTrackInfo | null;
  nextActionLabel: string;
  onNextAction: () => void;
}

const CertProgressRail: React.FC<Props> = ({ readiness, domains, track, nextActionLabel, onNextAction }) => {
  const state = readiness?.overall_state ?? 'not_measured';
  const unmeasured = state === 'not_measured' || readiness?.overall_scaled == null;
  const provisional = !unmeasured && (readiness?.sample_confidence ?? 0) < LOW_CONFIDENCE;
  const attempted = domainsAttempted(readiness);
  const verified = evidenceVerified(readiness);
  const target = track?.passing_scaled_score ?? 720;

  return (
    <>
      <div className="te-card cp-rail-card">
        <h3 className="cp-rail-h">Your progress</h3>

        <Row
          label="Readiness"
          value={unmeasured ? <span className="cp-rail-muted">Not measured</span> : readiness!.overall_scaled}
          hint={
            unmeasured
              ? 'Answer enough across enough domains and a number appears here.'
              : `Colaberry readiness estimate · target ${target}`
          }
        />
        {provisional && (
          <p className="cp-rail-note">
            This is <b>provisional</b> — breadth moves it more than volume.
          </p>
        )}

        <Row label="State" value={STATE_LABEL[state] ?? state} />
        <Row label="Questions answered" value={readiness?.answered_total ?? 0} />
        <Row
          label="Full sittings"
          value={readiness?.qualifying_sittings ?? 0}
          hint="Sustained needs more than one"
        />
        <Row
          label="Domains attempted"
          value={`${attempted} of ${domains.length || 5}`}
        />
        <Row
          label="Evidence verified"
          value={verified}
          hint={verified === 0 ? 'An instructor verifies what your builds prove' : undefined}
        />

        <button type="button" className="cp-btn cp-btn--primary cp-rail-cta" onClick={onNextAction}>
          {nextActionLabel}
        </button>
      </div>

      <div className="te-card cp-rail-card">
        <h3 className="cp-rail-h">By domain</h3>
        {domains.length === 0 ? (
          <p className="cp-rail-note">Domains load with the blueprint.</p>
        ) : (
          <ul className="cp-rail-domains">
            {domains.map((d) => {
              const row = readiness?.domain_breakdown.find((b) => b.domain_id === d.domain_id);
              const pct = row?.knowledge_pct;
              return (
                <li key={d.domain_id}>
                  <span className="cp-rail-dk">{d.domain_id}</span>
                  <span className="cp-rail-dbar" aria-hidden="true">
                    <span style={{ width: `${pct == null ? 0 : Math.round(pct * 100)}%` }} />
                  </span>
                  <span className="cp-rail-dpct">
                    {pct == null ? <span className="cp-rail-muted">—</span> : `${Math.round(pct * 100)}%`}
                  </span>
                </li>
              );
            })}
          </ul>
        )}
        <p className="cp-rail-note">A dash means not attempted yet, not zero.</p>
      </div>
    </>
  );
};

export default CertProgressRail;
