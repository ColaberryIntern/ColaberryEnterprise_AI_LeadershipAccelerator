import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { InternDashboard, Week3Handoff, fetchInternshipDashboard } from '../../../services/internshipApi';
import InternshipProjects from './InternshipProjects';

/**
 * The student "My Internship" dashboard (Phase 2 shell): the single next action,
 * an attention queue split by whose turn it is, and a read-only summary of the
 * work that's already tracked (weeks 1-3, attendance, project, certification).
 *
 * Read-only by construction — it never mutates status. Every number states its
 * denominator; "waiting on Colaberry" is shown as ours to do, never as the
 * student's lateness. Deep drill-downs (project delivery, cert attempts, case
 * studies) come in later phases; this is the spine.
 */
const label: React.CSSProperties = { fontSize: 10, letterSpacing: '.09em', textTransform: 'uppercase', color: 'var(--text-muted, #6b7280)', fontWeight: 700 };
const cardStyle: React.CSSProperties = { background: '#fff', border: '1px solid #e5e8ed', borderRadius: 12, padding: 18 };

function Stat({ head, value, sub, tone }: { head: string; value: React.ReactNode; sub?: string; tone?: 'green' | 'amber' | 'neutral' }) {
  const bar = tone === 'green' ? '#167b61' : tone === 'amber' ? '#986109' : '#5a6878';
  return (
    <div style={{ ...cardStyle, borderTop: `3px solid ${bar}`, flex: '1 1 150px' }}>
      <div style={label}>{head}</div>
      <div style={{ fontSize: 24, fontWeight: 700, letterSpacing: '-.5px', margin: '4px 0 2px' }}>{value}</div>
      {sub && <div style={{ fontSize: 12, color: '#6b7280' }}>{sub}</div>}
    </div>
  );
}

// The Week-3 handoff card. Tone follows whose move it is: an intern-actionable
// phase is affirmative green; a Colaberry-owned phase is calm blue and carries a
// "we're on it" tag, never a warning; before-week-3 / unknown are neutral.
function HandoffCard({ h }: { h: Week3Handoff }) {
  const intern = h.owner === 'intern' && h.actionable;
  const colaberry = h.owner === 'colaberry' && h.phase !== 'unknown';
  const accent = intern ? '#167b61' : colaberry ? '#2b6cb0' : '#5a6878';
  const bg = intern ? '#f0f8f4' : colaberry ? '#f0f5fb' : '#f6f7f9';
  return (
    <section style={{ ...cardStyle, borderLeft: `4px solid ${accent}`, background: bg }}>
      <div className="d-flex align-items-center" style={{ gap: 8, flexWrap: 'wrap' }}>
        <div style={{ ...label, color: accent }}>Your first project</div>
        {colaberry && <span className="badge" style={{ background: '#e4edf9', color: '#2b6cb0', fontWeight: 600 }}>waiting on Colaberry</span>}
      </div>
      <h2 style={{ fontSize: 16.5, margin: '4px 0 4px' }}>{h.title}</h2>
      <p className="ip-muted" style={{ margin: 0, fontSize: 13.5, maxWidth: 640 }}>{h.detail}</p>
    </section>
  );
}

const InternshipDashboard: React.FC = () => {
  const [d, setD] = useState<InternDashboard | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    fetchInternshipDashboard()
      .then((v) => { if (alive) setD(v); })
      .catch(() => { if (alive) setError('We could not load your dashboard. Please refresh.'); });
    return () => { alive = false; };
  }, []);

  if (error) return <div className="ip-alert" role="alert">{error}</div>;
  if (!d) return <p className="ip-muted">Loading your dashboard…</p>;

  const t = d.activity.training;
  const p = d.activity.project;
  const cert = d.activity.cert_prep;

  return (
    <div className="d-flex flex-column" style={{ gap: 18 }}>
      {/* Next action — the loudest thing. */}
      <section style={{ ...cardStyle, background: '#292630', color: '#fff', border: 0 }}>
        <div style={{ ...label, color: '#ac9daf' }}>Your next step{d.week ? ` · Week ${d.week}` : ''}</div>
        {d.next_action ? (
          <>
            <h2 style={{ fontSize: 21, margin: '6px 0 6px', letterSpacing: '-.5px' }}>{d.next_action.label}</h2>
            <p style={{ color: '#c9c3d0', margin: 0, maxWidth: 640 }}>{d.next_action.detail}</p>
          </>
        ) : (
          <>
            <h2 style={{ fontSize: 20, margin: '6px 0 6px', letterSpacing: '-.5px' }}>You&apos;re all set for now.</h2>
            <p style={{ color: '#c9c3d0', margin: 0 }}>Nothing needs your action right now — keep moving through your training and project.</p>
          </>
        )}
      </section>

      {/* Read-only summary — each number states its denominator. */}
      <div className="d-flex flex-wrap" style={{ gap: 12 }}>
        <Stat
          head="Training · weeks 1-3"
          value={t ? `${t.first_three_weeks.done}/${t.first_three_weeks.total}` : '—'}
          sub={t ? (t.first_three_weeks.ready ? 'ready for a project' : 'weeks done') : 'no training data yet'}
          tone={t?.first_three_weeks.ready ? 'green' : 'amber'}
        />
        <Stat
          head="Sessions attended"
          value={d.activity.attendance.total}
          sub={d.activity.attendance.last_attended_at ? `last ${new Date(d.activity.attendance.last_attended_at).toLocaleDateString()}` : 'none yet'}
          tone={d.activity.attendance.total > 0 ? 'green' : 'neutral'}
        />
        <Stat
          head="Project"
          value={p ? (p.stage ?? 'assigned') : 'none yet'}
          sub={p ? `${p.verified_stories}/${p.total_stories} stories verified` : 'assigned after your first 3 weeks'}
          tone="neutral"
        />
        <Stat
          head="Cert readiness"
          value={cert ? (cert.overall_scaled ?? cert.state.replace(/_/g, ' ')) : 'not measured'}
          sub="practice estimate, not an exam result"
          tone="neutral"
        />
      </div>

      {/* Journey: the Week-3 "your first Colaberry project" handoff. Colaberry-owned
          phases are shown as ours, never as the intern being behind. */}
      <HandoffCard h={d.handoff} />

      {/* Attention, split by whose turn it is. */}
      <div className="d-flex flex-wrap" style={{ gap: 18 }}>
        <section style={{ ...cardStyle, flex: '1 1 300px' }}>
          <div className="d-flex justify-content-between align-items-center">
            <h2 style={{ fontSize: 16, margin: 0 }}>Your turn</h2>
            <span className="badge" style={{ background: d.attention.your_turn.length ? '#ed3349' : '#eef1f5', color: d.attention.your_turn.length ? '#fff' : '#5a6878' }}>{d.attention.your_turn.length}</span>
          </div>
          {d.attention.your_turn.length === 0
            ? <p className="ip-muted" style={{ margin: '8px 0 0', fontSize: 13.5 }}>Nothing for you to do right now.</p>
            : d.attention.your_turn.map((i) => (
              <div key={i.key} style={{ padding: '10px 0', borderBottom: '1px solid #eef0f4' }}>
                <strong style={{ fontSize: 14 }}>{i.label}</strong>
                {i.blocking && <span className="badge ms-2" style={{ background: '#fee9ec', color: '#b22d42' }}>needed to start</span>}
                <div className="ip-muted" style={{ fontSize: 12.5 }}>{i.detail}</div>
              </div>
            ))}
        </section>
        <section style={{ ...cardStyle, flex: '1 1 260px' }}>
          <h2 style={{ fontSize: 16, margin: 0 }}>Waiting on Colaberry</h2>
          <p className="ip-muted" style={{ margin: '2px 0 0', fontSize: 12 }}>Ours to do — not counted as your lateness.</p>
          {d.attention.waiting_on_colaberry.length === 0
            ? <p className="ip-muted" style={{ margin: '8px 0 0', fontSize: 13.5 }}>Nothing pending on our side.</p>
            : d.attention.waiting_on_colaberry.map((i) => (
              <div key={i.key} style={{ padding: '10px 0', borderBottom: '1px solid #eef0f4' }}>
                <strong style={{ fontSize: 14 }}>{i.label}</strong>
                <div className="ip-muted" style={{ fontSize: 12.5 }}>{i.waiting_on || i.detail}</div>
              </div>
            ))}
        </section>
      </div>

      {/* The project portfolio — owned projects, verified vs self-reported, readiness. */}
      <InternshipProjects />

      {/* Training direction + meetings. */}
      <section style={{ ...cardStyle }}>
        <h2 style={{ fontSize: 16, margin: 0 }}>Your first three weeks</h2>
        <p className="ip-muted" style={{ fontSize: 13.5, margin: '4px 0 10px' }}>
          Work through weeks 1-3 in the Classroom. Your manager assigns your first project once you finish.
        </p>
        {t && (
          <div className="d-flex flex-column" style={{ gap: 6, marginBottom: 12 }}>
            {t.weeks.filter((w) => w.week >= 1 && w.week <= 3).map((w) => (
              <div key={w.week} className="d-flex align-items-center" style={{ gap: 8, fontSize: 13.5 }}>
                <span aria-hidden="true" style={{ width: 10, height: 10, borderRadius: '50%', background: w.done ? '#167b61' : '#cbd5e0', flex: 'none' }} />
                <span style={{ minWidth: 56 }}>Week {w.week}</span>
                <div style={{ flex: '1 1 auto', maxWidth: 200, height: 6, background: '#eef1f4', borderRadius: 3, overflow: 'hidden' }}>
                  <div style={{ width: `${Math.min(100, Math.max(0, w.completed_pct))}%`, height: '100%', background: w.done ? '#167b61' : '#986109' }} />
                </div>
                <span className="ip-muted" style={{ whiteSpace: 'nowrap' }}>{w.completed}/{w.published} ({w.completed_pct}%)</span>
              </div>
            ))}
          </div>
        )}
        <Link to="/portal/classroom" className="te-btn berry sm">Go to the Classroom</Link>
      </section>

      {d.required_meetings.length > 0 && (
        <section style={{ ...cardStyle }}>
          <h2 style={{ fontSize: 16, margin: '0 0 8px' }}>Your required meetings</h2>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'flex', flexDirection: 'column', gap: 6 }}>
            {d.required_meetings.map((m, i) => (
              <li key={i} style={{ display: 'flex', alignItems: 'baseline', gap: 8, flexWrap: 'wrap', fontSize: 13.5 }}>
                <span style={{ fontWeight: 600, minWidth: 128 }}>{m.day}{m.time ? ` · ${m.time}${m.timezone ? ` ${m.timezone}` : ''}` : ''}</span>
                <span>{m.title || m.kind}</span>
                {m.audience === 'interns_only' && <span className="ip-tag">interns only</span>}
                {m.room_name && <span className="ip-muted" style={{ fontSize: 12.5 }}>in the <strong>{m.room_name}</strong> room</span>}
                {m.room_slug && <Link to={m.room_id ? `/portal/rooms/${m.room_id}` : '/portal/rooms'} className="te-btn ghost sm">Open{m.room_name ? ` ${m.room_name}` : ' in Rooms'}</Link>}
              </li>
            ))}
          </ul>
        </section>
      )}
    </div>
  );
};

export default InternshipDashboard;
