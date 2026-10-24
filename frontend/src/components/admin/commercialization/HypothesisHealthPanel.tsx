import React, { useEffect, useState } from 'react';
import api from '../../../utils/api';
import { SectionCard } from '../shell';

/**
 * C8.6 — which revenue hypotheses are gaining evidence, and which are dying.
 *
 * THE WHOLE JOB OF THIS PANEL IS THAT A DYING HYPOTHESIS CANNOT BE SCROLLED PAST.
 * The ticket asks for it in those terms, and the failure it names is "keeping a
 * hypothesis alive without evidence". So the ordering puts the worst first, a fired
 * tripwire is stated with its date, and the kill condition is always on screen rather
 * than hidden behind a disclosure.
 *
 * `uncountable` is rendered as its own state, not folded into "no evidence". C8.4
 * established that several funnel stages have no source yet, and a bet that the
 * instrument cannot see is not a bet that is failing.
 */

type Verdict = 'confirmed' | 'in_flight' | 'no_evidence' | 'past_deadline' | 'uncountable';

interface Tripwire {
  on: string;
  survivesIf: string;
  atLeast: number;
  due: boolean;
  observed: number | null;
  tripped: boolean;
}

interface Hypothesis {
  key: string;
  label: string;
  whoPays: string;
  evidenceRequired: string;
  killCondition: string;
  target: { stage: string; count: number; by: string };
  verdict: Verdict;
  evidence: number | null;
  inFlight: number | null;
  daysRemaining: number;
  tripwires: Tripwire[];
  note: string;
}

interface Report {
  asOf: string;
  hypotheses: Hypothesis[];
  summary: Partial<Record<Verdict, number>>;
  caveats: string[];
}

/** Worst first. A dying hypothesis at the bottom of a list is a hypothesis nobody kills. */
const SEVERITY: Record<Verdict, number> = {
  past_deadline: 0, no_evidence: 1, in_flight: 2, uncountable: 3, confirmed: 4,
};

const VERDICT: Record<Verdict, { label: string; color: string; bg: string }> = {
  past_deadline: { label: 'Past deadline', color: 'var(--status-danger)', bg: 'var(--status-danger-bg)' },
  no_evidence: { label: 'No evidence in flight', color: 'var(--status-danger)', bg: 'var(--status-danger-bg)' },
  in_flight: { label: 'In flight', color: 'var(--status-warning)', bg: 'var(--status-warning-bg)' },
  uncountable: { label: 'Not yet measurable', color: 'var(--text-muted)', bg: 'var(--surface-subtle)' },
  confirmed: { label: 'Confirmed', color: 'var(--status-success)', bg: 'var(--status-success-bg)' },
};

const DYING: Verdict[] = ['past_deadline', 'no_evidence'];

function Chip({ verdict }: { verdict: Verdict }) {
  const v = VERDICT[verdict];
  return (
    <span
      className="px-2 py-1 rounded-pill small fw-semibold"
      style={{ color: v.color, background: v.bg, border: `1px solid ${v.color}` }}
      data-testid={`verdict-${verdict}`}
    >
      {v.label}
    </span>
  );
}

export function HypothesisRow({ h }: { h: Hypothesis }) {
  const v = VERDICT[h.verdict];
  const dying = DYING.includes(h.verdict);
  const fired = h.tripwires.filter((t) => t.tripped);

  return (
    <div
      className="p-3 border-bottom"
      style={dying ? { borderLeft: `4px solid ${v.color}`, background: v.bg } : undefined}
      data-testid={`hypothesis-${h.key}`}
      data-verdict={h.verdict}
      data-dying={dying ? 'yes' : 'no'}
    >
      <div className="d-flex justify-content-between align-items-start gap-2">
        <div>
          <span className="fw-semibold" style={{ color: 'var(--text-primary)' }}>{h.label}</span>
          <span className="small text-muted ms-2">{h.whoPays}</span>
        </div>
        <Chip verdict={h.verdict} />
      </div>

      <div className="small mt-2" style={{ color: 'var(--text-secondary)' }}>
        <strong>Needs:</strong> {h.evidenceRequired}
        {h.evidence !== null && (
          <span className="ms-2" data-testid={`evidence-${h.key}`}>
            ({h.evidence} of {h.target.count} so far)
          </span>
        )}
        <span className="ms-2">
          {h.daysRemaining >= 0
            ? `${h.daysRemaining} days remaining`
            : `${Math.abs(h.daysRemaining)} days past the deadline`}
        </span>
      </div>

      <p className="small mt-2 mb-0" style={{ color: 'var(--text-secondary)' }}>{h.note}</p>

      {fired.length > 0 && (
        <p className="small mt-2 mb-0 fw-semibold" style={{ color: v.color }}
          data-testid={`tripwire-fired-${h.key}`}>
          <i className="ri-alarm-warning-line" aria-hidden="true" /> Tripwire fired on{' '}
          {fired[0].on}: needed {fired[0].survivesIf}, had {fired[0].observed}.
        </p>
      )}

      <p className="small mt-2 mb-0" style={{ color: 'var(--text-muted)' }}>
        <strong>Kill condition:</strong> {h.killCondition}
      </p>
    </div>
  );
}

export default function HypothesisHealthPanel() {
  const [report, setReport] = useState<Report | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    api.get('/api/admin/commercialization/hypotheses')
      .then((res) => {
        if (!alive) return;
        const data = res?.data?.data;
        // A shape we did not expect is a failed load, not an empty register.
        if (!data || !Array.isArray(data.hypotheses)) throw new Error('unexpected shape');
        setReport(data);
      })
      .catch((e) => {
        if (alive) setError(e?.response?.data?.error || 'Could not read hypothesis health.');
      });
    return () => { alive = false; };
  }, []);

  const ordered = report
    ? [...report.hypotheses].sort((a, b) => SEVERITY[a.verdict] - SEVERITY[b.verdict])
    : [];
  const dyingCount = ordered.filter((h) => DYING.includes(h.verdict)).length;

  return (
    <SectionCard
      title="Revenue hypotheses"
      subtitle="From the C0.1 register. Every count comes from the funnel, not from manual entry."
      icon="flask-line"
      className="mt-4"
      padded={false}
    >
      {error && (
        <div className="alert alert-warning m-3 mb-0 small" role="alert"
          data-testid="hypotheses-error">{error}</div>
      )}

      {report && dyingCount > 0 && (
        <div className="px-3 pt-3">
          <p className="mb-0 fw-semibold" style={{ color: 'var(--status-danger)' }}
            data-testid="dying-banner">
            {dyingCount} of {report.hypotheses.length} {dyingCount === 1 ? 'hypothesis has' : 'hypotheses have'}
            {' '}no evidence in flight. Retiring one is your call, not the dashboard&apos;s.
          </p>
        </div>
      )}

      {ordered.map((h) => <HypothesisRow key={h.key} h={h} />)}

      {report && report.caveats.length > 0 && (
        <div className="p-3">
          <p className="small text-muted mb-1"><strong>Why some read as not yet measurable:</strong></p>
          <ul className="small text-muted mb-0">
            {report.caveats.map((c) => <li key={c}>{c}</li>)}
          </ul>
        </div>
      )}
    </SectionCard>
  );
}
