import React, { useEffect, useState } from 'react';
import { InternProject, InternProjectPortfolio, fetchInternshipProjects } from '../../../services/internshipApi';

/**
 * The intern's project portfolio on the dashboard.
 *
 * ── WHAT IT REFUSES TO CONFLATE ─────────────────────────────────────────────
 *
 * Two numbers that platforms love to merge are kept apart here: stories the
 * student MARKED complete (self-reported, and what the readiness percentage is
 * built from) and stories the platform VERIFIED. Verified is always the smaller,
 * honest number, shown beside the claim, never in place of it.
 *
 * Readiness is a case-study RANKING, not an approval — the copy says so, and the
 * gaps list names exactly what stands between the project and a case study.
 *
 * An "owned" project that is not the active pointer is a legitimate second build,
 * not an abandoned one; an "archived" project is history, shown read-only. Neither
 * is framed as the student being behind.
 */

const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e5e8ed', borderRadius: 12, padding: 18 };
const label: React.CSSProperties = { fontSize: 10, letterSpacing: '.09em', textTransform: 'uppercase', color: '#6b7280', fontWeight: 700 };

function roleBadge(role: InternProject['role']) {
  const map = {
    active: { text: 'Active', bg: '#e7f5ef', fg: '#167b61' },
    owned: { text: 'Also yours', bg: '#eef1f5', fg: '#4a5768' },
    archived: { text: 'Archived', bg: '#f3f0f0', fg: '#8a7f7f' },
  } as const;
  const s = map[role];
  return <span className="badge" style={{ background: s.bg, color: s.fg, fontWeight: 600 }}>{s.text}</span>;
}

// Risk state → tone. Names come from the shared projectRiskModel; a spare/dormant
// project is neutral, never alarming.
function riskTone(state: string): { fg: string; bg: string } {
  if (state === 'on_track' || state === 'shipped') return { fg: '#167b61', bg: '#e7f5ef' };
  if (state === 'stalled' || state === 'behind') return { fg: '#b22d42', bg: '#fee9ec' };
  if (state === 'no_plan') return { fg: '#986109', bg: '#fdf3e2' };
  return { fg: '#4a5768', bg: '#eef1f5' }; // dormant / anything else
}

function prettyStage(stage: string): string {
  return stage ? stage.charAt(0).toUpperCase() + stage.slice(1) : '—';
}

function ProjectCard({ p }: { p: InternProject }) {
  const archived = p.role === 'archived';
  const rt = riskTone(p.risk_state);
  const s = p.stories;
  return (
    <div style={{ ...cardStyle, opacity: archived ? 0.72 : 1 }}>
      <div className="d-flex justify-content-between align-items-start" style={{ gap: 10, flexWrap: 'wrap' }}>
        <div>
          <div className="d-flex align-items-center" style={{ gap: 8, flexWrap: 'wrap' }}>
            <strong style={{ fontSize: 15.5 }}>{p.name || 'Untitled project'}</strong>
            {roleBadge(p.role)}
            {p.already_case_study && <span className="badge" style={{ background: '#eef1f5', color: '#4a5768' }}>case study</span>}
          </div>
          <div className="ip-muted" style={{ fontSize: 12.5, marginTop: 2 }}>Stage: {prettyStage(p.stage)}</div>
        </div>
        {/* Case-study readiness — a ranking, not an approval. */}
        <div style={{ textAlign: 'right', minWidth: 96 }}>
          <div style={label}>Readiness</div>
          <div style={{ fontSize: 22, fontWeight: 700, letterSpacing: '-.5px' }}>{p.readiness.score}<span style={{ fontSize: 13, color: '#6b7280' }}>/100</span></div>
          <div className="ip-muted" style={{ fontSize: 10.5 }}>ranking, not approval</div>
        </div>
      </div>

      {/* Stories: the claim and the check, side by side and clearly distinct. */}
      <div className="d-flex flex-wrap" style={{ gap: 16, marginTop: 12 }}>
        <div>
          <div style={label}>Marked complete</div>
          <div style={{ fontSize: 16, fontWeight: 700 }}>{s.self_reported_complete}<span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}> / {s.total}</span></div>
          <div className="ip-muted" style={{ fontSize: 10.5 }}>self-reported</div>
        </div>
        <div>
          <div style={label}>Verified</div>
          <div style={{ fontSize: 16, fontWeight: 700, color: '#167b61' }}>{s.verified}<span style={{ fontSize: 12, color: '#6b7280', fontWeight: 400 }}> / {s.total}</span></div>
          <div className="ip-muted" style={{ fontSize: 10.5 }}>confirmed by us</div>
        </div>
        {s.awaiting_verification > 0 && (
          <div>
            <div style={label}>Awaiting check</div>
            <div style={{ fontSize: 16, fontWeight: 700, color: '#986109' }}>{s.awaiting_verification}</div>
            <div className="ip-muted" style={{ fontSize: 10.5 }}>complete, not yet verified</div>
          </div>
        )}
        <div>
          <div style={label}>Risk</div>
          <span className="badge" style={{ background: rt.bg, color: rt.fg, fontWeight: 600 }}>{p.risk_state.replace(/_/g, ' ')}</span>
        </div>
      </div>

      {/* What stands between this project and a case study. */}
      {p.readiness.gaps.length > 0 && (
        <div style={{ marginTop: 12 }}>
          <div style={label}>To become a case study</div>
          <div className="d-flex flex-wrap" style={{ gap: 6, marginTop: 4 }}>
            {p.readiness.gaps.map((g, i) => (
              <span key={i} className="badge" style={{ background: '#fbf1f2', color: '#9a3040', fontWeight: 500 }}>{g}</span>
            ))}
          </div>
        </div>
      )}

      {p.risk_reason && <div className="ip-muted" style={{ fontSize: 12.5, marginTop: 10 }}>{p.risk_reason}</div>}

      {!archived && (
        <div className="d-flex flex-wrap" style={{ gap: 8, marginTop: 12 }}>
          {p.repo_url && <a href={p.repo_url} target="_blank" rel="noopener noreferrer" className="te-btn ghost sm">Repository</a>}
          {p.command_center_url && <a href={p.command_center_url} target="_blank" rel="noopener noreferrer" className="te-btn ghost sm">Command Center</a>}
        </div>
      )}
    </div>
  );
}

const InternshipProjects: React.FC = () => {
  const [data, setData] = useState<InternProjectPortfolio | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchInternshipProjects()
      .then((v) => { if (alive) setData(v); })
      .catch(() => { if (alive) setError('We could not load your projects. Please refresh.'); });
    return () => { alive = false; };
  }, []);

  if (error) return <section style={cardStyle}><div className="ip-alert" role="alert">{error}</div></section>;
  if (!data) return <section style={cardStyle}><p className="ip-muted" style={{ margin: 0 }}>Loading your projects…</p></section>;

  return (
    <section style={{ ...cardStyle, background: 'transparent', border: 0, padding: 0 }}>
      <div className="d-flex justify-content-between align-items-baseline" style={{ marginBottom: 10, flexWrap: 'wrap', gap: 8 }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Your projects</h2>
        {data.active_count === 0 && data.has_live_project && (
          <span className="ip-muted" style={{ fontSize: 12.5 }}>None set as active</span>
        )}
      </div>

      {data.projects.length === 0 ? (
        <div style={cardStyle}>
          <p className="ip-muted" style={{ margin: 0, fontSize: 13.5 }}>
            No project yet. Your first project is assigned after you finish your first three weeks.
          </p>
        </div>
      ) : (
        <div className="d-flex flex-column" style={{ gap: 12 }}>
          {data.projects.map((p) => <ProjectCard key={p.project_id} p={p} />)}
          <p className="ip-muted" style={{ fontSize: 11.5, margin: '2px 0 0' }}>
            &ldquo;Marked complete&rdquo; is what you reported; &ldquo;verified&rdquo; is what we confirmed. Readiness ranks how close a
            project is to a case study, it is not an approval.
          </p>
        </div>
      )}
    </section>
  );
};

export default InternshipProjects;
