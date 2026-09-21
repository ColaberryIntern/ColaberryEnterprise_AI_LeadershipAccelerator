import React from 'react';
import type { StreakView } from '../../../services/onboardingApi';

/**
 * The Daily-streak card of the Today sidebar, moved out of TodayShell.tsx
 * verbatim (Growth Journey OS Phase 5, T521 fix cycle 1). The shell stood at
 * 655 lines, over the 500-line ceiling, and the rule is that an oversize file
 * is split before a line is added to it - the journey-nudge mount that follows
 * needed its line. The JSX below is the shell's own, unchanged; the six
 * bindings it read from the shell's scope arrive as props under the same
 * names, so what the learner sees is what the shell rendered.
 * TodayStreakCard.test.tsx pins the DOM and that the block is gone from the shell.
 */

interface Props {
  streak: StreakView | null;
  streakCount: number;
  streakWeek: StreakView['week'];
  claimedToday: boolean;
  busy: boolean;
  doClaimStreak: () => void | Promise<void>;
}

export default function TodayStreakCard({ streak, streakCount, streakWeek, claimedToday, busy, doClaimStreak }: Props) {
  return (
    <div className="te-card te-scard te-streak accent-amber">
      <h3><svg viewBox="0 0 24 24" fill="none"><path d="M12 2c1 3-1 4.5-2.5 6.5C8 10.5 7 12 7 14a5 5 0 0 0 10 0c0-2-1-3.4-2-5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg> Daily streak</h3>
      <div className="te-streak-top">
        <span className="fl"><svg viewBox="0 0 24 24" fill="none"><path d="M12 2c1 3-1 4.5-2.5 6.5C8 10.5 7 12 7 14a5 5 0 0 0 10 0c0-2-1-3.4-2-5 .5 1 .5 2 .2 2.8C16.8 9.4 15 8 14.5 5.5 14 3.5 13 2.6 12 2z" fill="#E8920C" /><path d="M12 21a3 3 0 0 0 3-3c0-1.6-1.3-2.6-2-4-.7 1.4-2 2-2 4a1 1 0 0 0 1 3z" fill="#FB2832" /></svg></span>
        <div className="ct"><b>{streakCount}</b><span>day{streakCount === 1 ? '' : 's'} streak</span></div>
      </div>
      <div className="te-streak-week">
        {streakWeek.map((d) => (
          <div key={d.date} className={`sd${d.hit ? ' hit' : ''}${d.is_today ? ' today' : ''}`}>
            <span className="dot"><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg></span>
            <span className="lbl">{d.label}</span>
          </div>
        ))}
      </div>
      <button className="te-btn leaf sm" style={{ width: '100%', justifyContent: 'center', marginTop: 12 }} onClick={doClaimStreak} disabled={claimedToday || busy}>
        {claimedToday ? 'Claimed today' : streak ? `Claim today · +${streak.next_points} pts` : 'Claim today'}
      </button>
    </div>
  );
}
