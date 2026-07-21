import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { fetchPointsDrilldown, fetchPoints, DrilldownView, Band, levelFor } from '../../../services/onboardingApi';
import { fmtCentralDate } from '../today/shellUtils';
import './PointsPage.css';

/**
 * PointsDrilldown — the three-lens points breakdown, self-contained so it can be
 * rendered both on the dedicated /portal/points page AND inside the Settings
 * "Points" tab. Data: GET /api/portal/points/drilldown.
 */

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

const PointsDrilldown: React.FC<{ showHistoryLink?: boolean }> = ({ showHistoryLink = true }) => {
  const [data, setData] = useState<DrilldownView | null>(null);
  const [loading, setLoading] = useState(true);
  // 5-band re-skin: the canonical band + runtime flag ride the points payload.
  // Used only for the free-ceiling "Become an AI Builder" card below; the rest of
  // the drill-down is unchanged whether the flag is on or off.
  const [band, setBand] = useState<Band | null>(null);
  const [fiveBand, setFiveBand] = useState(false);

  useEffect(() => {
    let alive = true;
    fetchPointsDrilldown()
      .then((d) => { if (alive) setData(d); })
      .catch(() => { /* keep null → empty state */ })
      .finally(() => { if (alive) setLoading(false); });
    fetchPoints()
      .then((p) => { if (alive) { setBand(p.band ?? null); setFiveBand(!!p.fiveBandUiEnabled); } })
      .catch(() => { /* card stays hidden on error */ });
    return () => { alive = false; };
  }, []);

  // Locked-door conversion card: shown only to a free account that has reached the
  // AI Enabled band on points alone (its ceiling). Advancing past it needs paid
  // build evidence, so this is the one honest place to invite the upgrade.
  const showUpgrade = fiveBand && !!band && band.cappedByPointsOnly && band.bandSlug === 'enabled';

  const total = data?.engagement.total ?? 0;
  const lvl = levelFor(total);
  const xp = data?.skill_xp ?? null;
  const xpMax = xp ? Math.max(xp.learning, xp.builder, xp.community, 1) : 1;
  const readiness = data?.readiness ?? null;

  if (loading) return <div className="points-root"><div className="pts-empty">Loading your progress…</div></div>;

  return (
    <div className="points-root">
      {/* Locked-door upgrade card — free AI Enabled ceiling → "Become an AI Builder".
          Calm, executive tone: one accent edge, a padlock, and a single CTA to the
          in-portal upgrade path (Settings → Subscription). */}
      {showUpgrade && (
        <div className="pts-upgrade" role="note" aria-label="Become an AI Builder">
          <span className="pts-upgrade-lock" aria-hidden="true">
            <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="10.5" width="16" height="10" rx="2.2" stroke="currentColor" strokeWidth="2" /><path d="M8 10.5V8a4 4 0 0 1 8 0v2.5" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /><circle cx="12" cy="15.5" r="1.4" fill="currentColor" /></svg>
          </span>
          <div className="pts-upgrade-body">
            <span className="pts-upgrade-k">Next step</span>
            <h3 className="pts-upgrade-h">Become an AI Builder</h3>
            <p className="pts-upgrade-p">Building starts inside the program. Join to unlock AI Builder and the path to AI Architect.</p>
          </div>
          <Link className="te-btn cherry" to="/portal/settings?tab=subscription">Unlock AI Builder</Link>
        </div>
      )}

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
        {showHistoryLink && (
          <Link className="te-btn ghost sm" style={{ marginTop: 12 }} to="/portal/schedule">See your full points history on the schedule</Link>
        )}
      </div>
    </div>
  );
};

export default PointsDrilldown;
