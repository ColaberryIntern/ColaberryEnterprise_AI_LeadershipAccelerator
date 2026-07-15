import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalShell from '../today/PortalShell';
import { fetchPointsDrilldown, DrilldownView, levelFor } from '../../../services/onboardingApi';
import { fmtCentralDate } from '../today/shellUtils';
import './PointsPage.css';

/**
 * PointsPage — the points drill-down. Three lenses make "where you are / where
 * you're headed" legible across the three independent progress systems:
 *
 *   1. Engagement — your points score + daily streak (what you've earned).
 *   2. Skill XP   — learning / builder / community XP from finishing curriculum.
 *   3. Readiness  — Architect Readiness %, your Builder level, and exactly
 *                   what's left to reach the next one.
 *
 * Data: GET /api/portal/points/drilldown. Lenses 2 and 3 gracefully show a
 * "not started yet" state before the curriculum begins.
 */

/** Humanize a points-ledger event type for the activity feed. */
function humanize(t: string): string {
  const OVERRIDES: Record<string, string> = {
    open_house_rsvp: 'Open House RSVP',
    daily_streak: 'Daily streak',
    profile_completed: 'Profile completed',
    open_house_attended: 'Attended the Open House',
    project_dna_completed: 'Project DNA completed',
    first_task_complete: 'First task completed',
    account_created: 'Account created',
  };
  if (OVERRIDES[t]) return OVERRIDES[t];
  const s = (t || 'Points').replace(/[_:]+/g, ' ').trim();
  return s.charAt(0).toUpperCase() + s.slice(1);
}

const RING_R = 34;
const RING_CIRC = 2 * Math.PI * RING_R;

const ReadinessRing: React.FC<{ pct: number }> = ({ pct }) => (
  <svg width="92" height="92" viewBox="0 0 92 92" className="pts-ring">
    <circle cx="46" cy="46" r={RING_R} fill="none" stroke="#EDEDEB" strokeWidth="9" />
    <circle
      cx="46" cy="46" r={RING_R} fill="none" stroke="#5BA63C" strokeWidth="9" strokeLinecap="round"
      strokeDasharray={RING_CIRC} strokeDashoffset={RING_CIRC * (1 - Math.max(0, Math.min(100, pct)) / 100)}
      transform="rotate(-90 46 46)"
    />
    <text x="46" y="52" textAnchor="middle" fontSize="20" fontWeight="800" fill="#1A1A1A" fontFamily="Roboto Mono,monospace">{pct}%</text>
  </svg>
);

const XpBar: React.FC<{ label: string; value: number; max: number; color: string }> = ({ label, value, max, color }) => (
  <div className="pts-xprow">
    <div className="pts-xplab"><span>{label}</span><b>{value.toLocaleString()} XP</b></div>
    <div className="pts-track"><i style={{ width: `${max > 0 ? Math.max(3, Math.round((value / max) * 100)) : 3}%`, background: color }} /></div>
  </div>
);

const PointsPage: React.FC = () => {
  const [data, setData] = useState<DrilldownView | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let alive = true;
    fetchPointsDrilldown()
      .then((d) => { if (alive) setData(d); })
      .catch(() => { /* keep null → empty state */ })
      .finally(() => { if (alive) setLoading(false); });
    return () => { alive = false; };
  }, []);

  const total = data?.engagement.total ?? 0;
  const lvl = levelFor(total);
  const xp = data?.skill_xp ?? null;
  const xpMax = xp ? Math.max(xp.learning, xp.builder, xp.community, 1) : 1;
  const readiness = data?.readiness ?? null;

  return (
    <PortalShell>
      <div className="te-page-h">
        <div className="crumb">Your progress</div>
        <h1>Your points, broken down</h1>
        <div className="sub">Three ways you grow here. Together they tell you where you are and exactly what moves you forward.</div>
      </div>

      <div className="points-root">
        {loading ? (
          <div className="pts-empty">Loading your progress…</div>
        ) : (
          <>
            {/* Where you are → where you're headed */}
            <div className="pts-hero">
              <div className="pts-hero-now">
                <span className="k">Where you are</span>
                <div className="v"><b>{lvl.name}</b> · {total.toLocaleString()} pts</div>
              </div>
              <svg className="pts-hero-arrow" viewBox="0 0 24 24" fill="none" aria-hidden><path d="M4 12h15M13 6l6 6-6 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /></svg>
              <div className="pts-hero-next">
                <span className="k">Where you're headed</span>
                <div className="v">
                  {lvl.next ? <><b>{lvl.next.name}</b> · {(lvl.next.min - total).toLocaleString()} pts to go</> : <b>Top level reached</b>}
                </div>
              </div>
            </div>

            <div className="pts-lenses">
              {/* Lens 1 — Engagement */}
              <div className="pts-lens accent-berry">
                <div className="pts-lens-h"><span className="tag">1 · Engagement</span><h3>Your points</h3></div>
                <div className="pts-big">{total.toLocaleString()}<span> pts</span></div>
                <div className="pts-levelrow">
                  <span className="pts-chip">{lvl.name}</span>
                  <span className="pts-mut">{lvl.next ? `${(lvl.next.min - total).toLocaleString()} to ${lvl.next.name}` : 'Max level'}</span>
                </div>
                <div className="pts-track"><i style={{ width: `${lvl.pct}%`, background: '#FB2832' }} /></div>
                <div className="pts-streak">
                  <svg viewBox="0 0 24 24" fill="none"><path d="M12 2c1 3-1 4.5-2.5 6.5C8 10.5 7 12 7 14a5 5 0 0 0 10 0c0-2-1-3.4-2-5" stroke="#E8920C" strokeWidth="2" strokeLinejoin="round" /></svg>
                  <b>{data?.engagement.streak_days ?? 0}</b> day streak
                  <span className="pts-mut">· {(data?.engagement.streak_points ?? 0).toLocaleString()} streak pts earned</span>
                </div>
              </div>

              {/* Lens 2 — Skill XP */}
              <div className="pts-lens accent-blue">
                <div className="pts-lens-h"><span className="tag">2 · Skill XP</span><h3>Skill you're building</h3></div>
                {xp ? (
                  <>
                    <div className="pts-big">{xp.total.toLocaleString()}<span> XP</span></div>
                    <div className="pts-xps">
                      <XpBar label="Learning" value={xp.learning} max={xpMax} color="#367895" />
                      <XpBar label="Builder" value={xp.builder} max={xpMax} color="#FB2832" />
                      <XpBar label="Community" value={xp.community} max={xpMax} color="#E8920C" />
                    </div>
                    <div className="pts-mut">Earned by finishing lessons, shipping builds, and helping peers.</div>
                  </>
                ) : (
                  <div className="pts-lens-empty">
                    <div className="pts-big pts-dim">0<span> XP</span></div>
                    <p>Skill XP starts flowing once your curriculum begins — Learning from lessons, Builder from shipping, Community from helping others.</p>
                    <Link className="te-btn ghost sm" to="/portal/classroom">Explore the curriculum</Link>
                  </div>
                )}
              </div>

              {/* Lens 3 — Architect Readiness */}
              <div className="pts-lens accent-leaf">
                <div className="pts-lens-h"><span className="tag">3 · Readiness</span><h3>Architect Readiness</h3></div>
                <div className="pts-readi">
                  <ReadinessRing pct={readiness?.pct ?? 0} />
                  <div className="pts-readi-meta">
                    <div className="lvl">{readiness ? `Level ${readiness.level}` : 'Not started'}</div>
                    <div className="pts-mut">
                      {readiness?.at_max ? 'You\'ve reached the top Builder level.'
                        : readiness?.next_level ? `Next: ${readiness.next_level}`
                        : 'Grows as you demonstrate competency.'}
                    </div>
                  </div>
                </div>
                {readiness && !readiness.at_max && (
                  <div className="pts-gaps">
                    <span className="pts-gaps-h">{readiness.gaps.length ? `What's left to ${readiness.next_level}` : 'Gate cleared — promotion pending'}</span>
                    {readiness.gaps.length
                      ? <ul>{readiness.gaps.map((g, i) => <li key={i}>{g}</li>)}</ul>
                      : <div className="pts-mut">You meet every requirement for the next level.</div>}
                  </div>
                )}
                {!readiness && (
                  <div className="pts-mut">Readiness measures demonstrated competency across the architecture domains. It fills in as you complete graded work.</div>
                )}
              </div>
            </div>

            {/* Recent activity */}
            <div className="pts-recent">
              <div className="pts-recent-h">Recent points</div>
              {data && data.engagement.recent.length ? (
                <div className="pts-recent-list">
                  {data.engagement.recent.map((e, i) => (
                    <div key={i} className="pts-recent-row">
                      <span className="pts-recent-pts">+{e.points}</span>
                      <span className="pts-recent-lab">{humanize(e.event_type)}</span>
                      <span className="pts-recent-date">{fmtCentralDate(e.created_at)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="pts-mut">No points yet — RSVP to the Open House and complete your setup to get started.</div>
              )}
              <Link className="te-btn ghost sm" style={{ marginTop: 12 }} to="/portal/schedule">See your full points history on the schedule</Link>
            </div>
          </>
        )}
      </div>
    </PortalShell>
  );
};

export default PointsPage;
