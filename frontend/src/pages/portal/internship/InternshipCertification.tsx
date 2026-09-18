import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { InternshipCertificationView, fetchInternshipCertification } from '../../../services/internshipApi';

/**
 * The certification headline on the dashboard.
 *
 * Two cards, deliberately apart: practice READINESS (a Colaberry estimate, never
 * an Anthropic score) and the official CLAIM (a certificate the student uploaded
 * and a staff member approved — not an external verification). They are never
 * merged into one figure. The full practice/mock/domain detail lives on the Cert
 * Prep page, which this links to; this is the summary, not a rebuild.
 */

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e5e8ed', borderRadius: 12, padding: 18 };
const label: React.CSSProperties = { fontSize: 10, letterSpacing: '.09em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 700 };

const READINESS: Record<string, { text: string; fg: string; bg: string }> = {
  sustained: { text: 'Exam-ready (sustained)', fg: '#167b61', bg: '#e7f5ef' },
  approaching: { text: 'Approaching ready', fg: '#2b6cb0', bg: '#eef4fb' },
  building: { text: 'Building', fg: '#986109', bg: '#fdf3e2' },
  not_measured: { text: 'Not measured yet', fg: '#5a6878', bg: '#eef1f5' },
};

const OFFICIAL: Record<string, { text: string; fg: string; bg: string; detail: string }> = {
  approved: { text: 'Approved', fg: '#167b61', bg: '#e7f5ef', detail: 'A staff member approved your uploaded certificate.' },
  pending: { text: 'Under review', fg: '#986109', bg: '#fdf3e2', detail: 'You uploaded a certificate; a staff member is reviewing it.' },
  rejected: { text: 'Needs another submission', fg: '#b22d42', bg: '#fee9ec', detail: 'Your last upload was not accepted. You can submit again on the Cert Prep page.' },
  none: { text: 'Not claimed yet', fg: '#5a6878', bg: '#eef1f5', detail: 'Once you pass the exam, upload your certificate on the Cert Prep page for staff to approve.' },
};

const InternshipCertification: React.FC = () => {
  const [d, setD] = useState<InternshipCertificationView | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchInternshipCertification()
      .then((v) => { if (alive) setD(v); })
      .catch(() => { if (alive) setError('We could not load your certification status. Please refresh.'); });
    return () => { alive = false; };
  }, []);

  if (error) return <section style={cardStyle}><div className="ip-alert" role="alert">{error}</div></section>;
  if (!d) return <section style={cardStyle}><p className="ip-muted" style={{ margin: 0 }}>Loading your certification…</p></section>;

  const r = d.readiness;
  const rs = READINESS[r.state] ?? READINESS.not_measured;
  const os = OFFICIAL[d.official.status] ?? OFFICIAL.none;

  return (
    <section style={{ background: 'transparent', border: 0, padding: 0 }}>
      <div className="d-flex justify-content-between align-items-baseline" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Certification</h2>
        <Link to="/portal/cert-prep" className="te-btn ghost sm">Open Cert Prep →</Link>
      </div>

      <div className="d-flex flex-wrap" style={{ gap: 12 }}>
        {/* Practice readiness — an estimate, never an exam score. */}
        <div style={{ ...cardStyle, flex: '1 1 280px' }}>
          <div className="d-flex justify-content-between align-items-center" style={{ gap: 8 }}>
            <div style={label}>Practice readiness</div>
            <span className="badge" style={{ background: rs.bg, color: rs.fg, fontWeight: 600 }}>{rs.text}</span>
          </div>
          {r.overall_scaled != null ? (
            <>
              <div style={{ fontSize: 26, fontWeight: 700, letterSpacing: '-.5px', margin: '6px 0 0' }}>
                {r.overall_scaled}<span style={{ fontSize: 13, color: '#6b7280', fontWeight: 400 }}> / 1000</span>
              </div>
              <div className="ip-muted" style={{ fontSize: 11.5 }}>a Colaberry practice estimate, not an Anthropic exam score</div>
              <div className="d-flex flex-wrap" style={{ gap: 16, marginTop: 10 }}>
                {r.knowledge_scaled != null && (
                  <div><div style={label}>Knowledge</div><div style={{ fontSize: 15, fontWeight: 700 }}>{r.knowledge_scaled}</div></div>
                )}
                {r.evidence_coverage_pct != null && (
                  <div><div style={label}>Evidence coverage</div><div style={{ fontSize: 15, fontWeight: 700 }}>{Math.round(r.evidence_coverage_pct)}%</div></div>
                )}
              </div>
              {!r.weights_available && (
                <p className="ip-muted" style={{ fontSize: 11, margin: '10px 0 0' }}>
                  Shown without exam weighting yet — treat this as a coverage estimate, not a weighted score.
                </p>
              )}
            </>
          ) : (
            <p className="ip-muted" style={{ fontSize: 13.5, margin: '8px 0 0' }}>
              You&apos;ll see a readiness estimate once you start practice on the Cert Prep page.
            </p>
          )}
        </div>

        {/* Official claim — self-reported, staff-approved. Separate from the estimate. */}
        <div style={{ ...cardStyle, flex: '1 1 280px' }}>
          <div className="d-flex justify-content-between align-items-center" style={{ gap: 8 }}>
            <div style={label}>Official certificate</div>
            <span className="badge" style={{ background: os.bg, color: os.fg, fontWeight: 600 }}>{os.text}</span>
          </div>
          <p className="ip-muted" style={{ fontSize: 13, margin: '8px 0 0' }}>{os.detail}</p>
          {d.official.status === 'approved' && d.official.passed_on && (
            <div className="ip-muted" style={{ fontSize: 12.5, marginTop: 8 }}>Passed {new Date(d.official.passed_on).toLocaleDateString()}</div>
          )}
          <p className="ip-muted" style={{ fontSize: 11, margin: '10px 0 0' }}>
            Self-reported and approved by staff — separate from your practice estimate.
          </p>
        </div>
      </div>
    </section>
  );
};

export default InternshipCertification;
