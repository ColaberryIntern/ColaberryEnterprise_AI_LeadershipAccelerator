import React from 'react';
import { Link } from 'react-router-dom';
import type { TimelineFeedCard } from '../../../components/timeline/TimelineCard';
import type { countdown } from './shellUtils';

type Countdown = ReturnType<typeof countdown>;

type Props = {
  /** C91: the Explorer has not finished a first lesson yet (explorerFirstWin.needsFirstWin). */
  firstWinPending: boolean;
  /** The lesson to start with (findFirstLessonCard); null hides the button. */
  firstLesson: TimelineFeedCard | null;
  onStartLesson: (card: TimelineFeedCard) => void;
  /** C102: scroll to "Your timeline" below the fold. */
  onSeeTimeline: () => void;
  fcCd: Countdown;
  ohCd: Countdown;
  ohTitle: string | null;
  showRsvp: boolean;
  rsvped: boolean;
  busy: boolean;
  onRsvp: () => void;
};

const STYLE = {
  card: { background: 'linear-gradient(135deg,#2E6A86,#367895)', color: '#fff', padding: '20px 22px', marginBottom: 18, border: 'none' },
  eyebrow: { display: 'flex', alignItems: 'center', gap: 8, fontSize: 11.5, fontWeight: 700, letterSpacing: '.05em', textTransform: 'uppercase' as const, opacity: 0.9 },
  h2: { margin: '8px 0 6px', fontSize: 22, color: '#fff' },
  p: { margin: '0 0 14px', opacity: 0.92, maxWidth: '54ch' },
  scroll: { margin: '-6px 0 14px', padding: '9px 12px', background: 'rgba(255,255,255,.12)', borderRadius: 8, maxWidth: '62ch', fontSize: 14.5 },
  cds: { display: 'flex', gap: 24, flexWrap: 'wrap' as const, margin: '2px 0 16px' },
  cdLab: { fontSize: 11, opacity: 0.82 },
  cdVal: { fontFamily: 'ui-monospace,Menlo,monospace', fontWeight: 700, fontSize: 15 },
  ctas: { display: 'flex', gap: 10, flexWrap: 'wrap' as const },
  ghost: { color: '#fff', border: '1px solid rgba(255,255,255,.6)', background: 'rgba(255,255,255,.14)' },
};

/**
 * The Explorer's banner at the top of Today, extracted out of TodayShell.tsx (over the 500-line ceiling) for C91.
 *
 * C91 (ad audit, Oct 2026): this banner's "Enroll to unlock" was the most-clicked thing in the whole portal for new ad signups (99
 * of 308), on their first page, before any lesson, and it led to a Settings tab where none of them paid. So until the first win the
 * banner asks for one thing, the first lesson, with the event RSVP beside it; the enroll ask comes back once they have learned
 * something. Copy never says "free" (TWC; "no card needed" is the house phrase).
 *
 * C102 (Ali, 2026-10-31): the timeline sits below the fold and nothing said so, so Explorers could miss that the lessons and
 * assignments are there at all. Both versions now say it and offer a button that scrolls to it. "More loads as you go", not
 * "unlimited": the feed pages and does have an end.
 */
const ExplorerPreviewBanner: React.FC<Props> = (p) => {
  const pending = p.firstWinPending;
  return (
    <div className="te-card" style={STYLE.card} data-testid="te-explorer-banner" data-first-win={pending ? 'pending' : 'done'}>
      <div style={STYLE.eyebrow}>
        <svg width="14" height="14" viewBox="0 0 24 24" fill="none"><path d="M4 8h16v8H4zM4 8l2-3h12l2 3M9 12h6" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
        Explorer · no card needed
      </div>
      {pending ? (
        <>
          <h2 style={STYLE.h2}>Start with your first lesson</h2>
          <p style={STYLE.p}>{p.firstLesson ? <>Your first lesson is ready: <b>{p.firstLesson.title}</b>. Finish it and the rest of the program opens up from there.</> : 'Lessons, live events and the community are open to you. Pick anything below to start.'}</p>
        </>
      ) : (
        <>
          <h2 style={STYLE.h2}>You&rsquo;re exploring AI, no card needed</h2>
          <p style={STYLE.p}>Enroll in the AI Systems Architect Accelerator to unlock all 12 weeks, the live build classes, the community, and your certification.</p>
        </>
      )}
      <p style={STYLE.scroll} data-testid="te-banner-scroll-hint">
        <b>Your timeline is right below this box.</b> Scroll down to watch, read and start your assignments. More loads as you go.
      </p>
      {(p.fcCd || p.ohCd) && (
        <div style={STYLE.cds}>
          {p.fcCd && <div><div style={STYLE.cdLab}>Next class starts in</div><div style={STYLE.cdVal}>{p.fcCd.d}d {p.fcCd.h}h {p.fcCd.m}m {p.fcCd.s}s</div></div>}
          {p.ohTitle && p.ohCd && <div><div style={STYLE.cdLab}>{p.ohTitle} in</div><div style={STYLE.cdVal}>{p.ohCd.d}d {p.ohCd.h}h {p.ohCd.m}m {p.ohCd.s}s</div></div>}
        </div>
      )}
      <div style={STYLE.ctas}>
        {pending
          ? p.firstLesson && <button type="button" className="te-btn cherry" onClick={() => p.onStartLesson(p.firstLesson!)} data-testid="te-banner-first-lesson">Start your first lesson →</button>
          : <Link className="te-btn cherry" to="/portal/settings?tab=subscription" data-testid="te-banner-enroll">Enroll to unlock →</Link>}
        <button type="button" className="te-btn" style={STYLE.ghost} onClick={p.onSeeTimeline} data-testid="te-banner-see-timeline">See your timeline ↓</button>
        {p.showRsvp && <button type="button" className="te-btn" style={STYLE.ghost} onClick={p.onRsvp} disabled={p.busy || p.rsvped}>{p.rsvped ? "RSVP'd for the event" : 'RSVP for the event'}</button>}
      </div>
    </div>
  );
};

export default ExplorerPreviewBanner;
