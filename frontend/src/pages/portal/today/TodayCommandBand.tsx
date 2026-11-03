import React from 'react';
import { levelFor, StreakView } from '../../../services/onboardingApi';
import { TimelineFeedCard } from '../../../components/timeline/TimelineCard';
import OpenOnPhone from './OpenOnPhone';
import { ExplorerKicker } from './ExplorerHomeBase';
import { useTodayNextStep } from './useTodayNextStep';
import TodayNextStepBanner from './TodayNextStepBanner';

/**
 * The top of the Today page: the command band (greeting, next step, the three meters) when the redesign flag is on,
 * the plain page header otherwise. Moved out of TodayShell (C101: the shell was 657 lines against a 500-line ceiling);
 * the markup is unchanged. Layout only: every value is computed by TodayShell and passed in.
 */
export interface TodayCommandBandProps {
  redesign: boolean;
  explorerHome: boolean;
  isExplorer: boolean;
  hydrated: boolean;
  firstName: string;
  email: string | null | undefined;
  nextStep: ReturnType<typeof useTodayNextStep>;
  total: number;
  onOpenCard: (card: TimelineFeedCard) => void;
  onScrollTo: (id: string) => () => void;
  lvl: ReturnType<typeof levelFor>;
  setupRemaining: number;
  setupPct: number;
  setupDone: number;
  setupTotal: number;
  readiness: number;
  streak: StreakView | null;
  streakCount: number;
  claimedToday: boolean;
  busy: boolean;
  doClaimStreak: () => void;
}

const TodayCommandBand: React.FC<TodayCommandBandProps> = (p) => (
  p.redesign ? (
    /* command band — greeting + primary next step + the three meters in one row */
    <div className="te-band">
      <div>
        {p.explorerHome ? <ExplorerKicker /> : <div className="crumb">◆ {p.isExplorer ? 'AI Preview' : 'Command Center'}</div>}
        <h2>
          {p.hydrated
            ? (p.firstName ? `Welcome back, ${p.firstName} 👋` : 'Welcome back 👋')
            : <><span className="te-skel te-skel-name" />&nbsp;</>}
        </h2>
        {/* The next-step line is the worst offender: pre-load it reads
            "0 points — you're all caught up in Classroom!", which is both
            wrong and demoralising for someone with 678 points. */}
        {p.hydrated ? (
          <TodayNextStepBanner
            nextStep={p.nextStep}
            total={p.total}
            onOpenCard={p.onOpenCard}
            onScrollTo={p.onScrollTo}
          />
        ) : (
          <div className="te-skel-lines" aria-hidden="true">
            <span className="te-skel te-skel-line" />
            <span className="te-skel te-skel-line short" />
          </div>
        )}
      </div>
      <div className="te-cluster">
        {/* Rings render as empty dials until the real figures land. The
            SETUP ring is omitted entirely rather than skeletoned, because
            whether it appears at all depends on setupRemaining — guessing
            would make the row reflow when the answer arrives. */}
        {p.hydrated ? (
          <>
            <div className="te-ringwrap lf">
              <div className="te-ring" style={{ '--p': p.lvl.pct, '--c': 'var(--leaf)' } as React.CSSProperties}><div className="v"><b>{p.total}</b><span>pts</span></div></div>
              <div className="cap">{p.lvl.name}</div>
            </div>
            {p.setupRemaining > 0 && (
              <div className="te-ringwrap">
                <div className="te-ring" style={{ '--p': p.setupPct, '--c': 'var(--berry)' } as React.CSSProperties}><div className="v"><b>{p.setupDone}/{p.setupTotal}</b><span>setup</span></div></div>
                <div className="cap">Setup</div>
              </div>
            )}
            <div className="te-ringwrap">
              <div className="te-ring" style={{ '--p': Math.max(2, p.readiness), '--c': 'var(--cherry)' } as React.CSSProperties}><div className="v"><b>{p.readiness}</b><span>/100</span></div></div>
              <div className="cap">Skill proficiency</div>
            </div>
          </>
        ) : (
          <>
            <div className="te-ringwrap lf" aria-hidden="true">
              <div className="te-ring te-ring-skel"><div className="v"><span className="te-skel te-skel-num" /></div></div>
              <div className="cap"><span className="te-skel te-skel-cap" /></div>
            </div>
            <div className="te-ringwrap" aria-hidden="true">
              <div className="te-ring te-ring-skel"><div className="v"><span className="te-skel te-skel-num" /></div></div>
              <div className="cap"><span className="te-skel te-skel-cap" /></div>
            </div>
          </>
        )}
        <div className="te-metacol">
          <span className="lab">Next tier</span>
          {/* Tier and streak both come from the same fetch; pre-load they
              read "Builder / 150 pts to go / 0-day streak" for someone who
              is actually mid-tier with a live streak. */}
          <span className="big">{p.hydrated ? (p.lvl.next ? p.lvl.next.name : 'Max level') : <span className="te-skel te-skel-tier" />}</span>
          <span className="to">{p.hydrated ? (p.lvl.next ? `${p.lvl.next.min - p.total} pts to go` : 'Top tier reached') : <span className="te-skel te-skel-sub" />}</span>
          <button className="te-bandflame" type="button" onClick={p.doClaimStreak} disabled={!p.hydrated || p.claimedToday || p.busy}>
            {p.hydrated
              ? <>🔥 {p.streakCount}-day streak · {p.claimedToday ? 'claimed' : `claim${p.streak ? ` +${p.streak.next_points}` : ''}`}</>
              : <span className="te-skel te-skel-streak" />}
          </button>
          <OpenOnPhone />
        </div>
      </div>
    </div>
  ) : (
    <div className="te-page-h">
      {p.explorerHome ? <ExplorerKicker /> : <div className="crumb">{p.isExplorer ? 'AI Preview' : 'Command Center'}</div>}
      <h1>Welcome{p.email ? `, ${p.email.split('@')[0]}` : ''}</h1>
      <div className="sub">{p.isExplorer
        ? "Explore AI, no card needed — watch, listen, learn, and try. Enroll when you're ready to build for real."
        : "Let's get you set up. A few quick steps unlock your first points and your seat."}</div>
    </div>
  )
);

export default TodayCommandBand;
