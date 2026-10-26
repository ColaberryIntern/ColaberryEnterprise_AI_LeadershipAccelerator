import React from 'react';
import { Link } from 'react-router-dom';
import type { levelFor } from '../../../services/onboardingApi';

/**
 * "Your day" in the Today rail: points and level, setup progress and skill proficiency as ribbons. Shown only when the command-band
 * redesign flag is off (the band carries the same meters as rings). Extracted from TodayShell unchanged (C54: the shell was over the
 * 500-line ceiling, so it gives up a block before it takes the Explorer additions).
 */
export interface TodayDayCardProps {
  lvl: ReturnType<typeof levelFor>;
  total: number;
  setupDone: number;
  setupTotal: number;
  setupPct: number;
  readiness: number;
}

export default function TodayDayCard({ lvl, total, setupDone, setupTotal, setupPct, readiness }: TodayDayCardProps): React.ReactElement {
  return (
    <div className="te-card te-scard accent-leaf">
      <h3><svg viewBox="0 0 24 24" fill="none"><path d="M12 2l2.6 7.4H22l-6.2 4.6 2.4 7.4L12 16.9 5.8 21.4l2.4-7.4L2 9.4h7.4z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg> Your day</h3>
      <div className="te-stat"><span className="lab">{lvl.name}</span><span className="num">{total.toLocaleString()} pts</span></div>
      <div className="te-ribbon"><i style={{ width: `${lvl.pct}%`, background: 'var(--leaf)' }} /></div>
      <div className="te-muted" style={{ margin: '-4px 0 12px' }}>{lvl.next ? `${lvl.next.min - total} pts to ${lvl.next.name}` : 'Max level reached'}</div>
      <div className="te-stat"><span className="lab">Setup progress</span><span className="num">{setupDone}/{setupTotal}</span></div>
      <div className="te-ribbon"><i style={{ width: `${setupPct}%`, background: 'var(--berry)' }} /></div>
      <div className="te-stat"><span className="lab">Skill proficiency</span><span className="num">{readiness}/100</span></div>
      <div className="te-ribbon" style={{ marginBottom: 4 }}><i style={{ width: `${Math.max(2, readiness)}%`, background: 'var(--cherry)' }} /></div>
      <div className="te-muted" style={{ fontSize: 12 }}>Grows as you build once the program starts.</div>
      <Link className="te-btn ghost sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} to="/portal/points">Break down my points</Link>
      <Link className="te-btn ghost sm" style={{ width: '100%', justifyContent: 'center', marginTop: 8 }} to="/portal/path">See your path</Link>
      <div className="te-chip guest" style={{ marginTop: 12 }}>Free preview account</div>
    </div>
  );
}
