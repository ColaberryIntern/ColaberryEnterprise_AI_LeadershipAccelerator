import React from 'react';
import type { MyProgress } from './myProgressApi';
import { useResumeUpload } from './ResumeUpload';
import { backgroundChips, backgroundLine, cheerLine, ringPct, statusLine, STORY_POINTS, storyState, winLine } from './myProgressView';
import './myProgress.css';

/**
 * C120 (Ali approved 2026-11-06, C120_1_ONE_PAGE): the My Progress room's back-wall screen is a celebration of the learner. Hero
 * ("<First name>, this is your progress.", the week ring, cohort, level, points, cards done this week), the three XP tiles, this
 * week's win, the milestones earned and the next one, then the story card: "Where you came from / Where you are going" from the
 * resume, or before an upload, "Tell us your story" with the upload button (+25 pts, the existing setup reward).
 *
 * Only the signed-in viewer's own data (the endpoint is bound to the token). The C117 fit rules hold: each tile and chip is a
 * data-fit-box and the screen's fit pass shrinks the board until nothing overflows or breaks mid-word.
 */
const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

function Story({ p }: { p: MyProgress }): React.ReactElement {
  const up = useResumeUpload('cm-mp-file-screen');
  if (storyState(p) === 'upload') {
    return (
      <div className="cm-mp-story" data-testid="cm-mp-story-upload">
        <b className="h">Tell us your story</b>
        <span className="t">Upload your resume or LinkedIn PDF and this screen fills in your background, your skills and your goal. +{STORY_POINTS} pts.</span>
        <div className="cm-mp-chips is-ghost" aria-hidden="true">{['Your role', 'Your industry', 'Your skills', 'Your goal'].map((c) => <span key={c} className="c" data-fit-box="">{c}</span>)}</div>
        <div className="row">
          <button type="button" className="b red" onClick={stop(up.pick)} disabled={up.busy} data-testid="cm-mp-upload">{up.busy ? 'Uploading…' : 'Upload resume or LinkedIn PDF'}</button>
        </div>
        {up.note && <span className="t" role="status" data-testid="cm-mp-note">{up.note}</span>}
        {up.input}
      </div>
    );
  }
  const bg = p.background;
  const line = bg ? backgroundLine(bg) : null;
  const chips = bg ? backgroundChips(bg) : [];
  return (
    <div className="cm-mp-story" data-testid="cm-mp-story-background">
      <b className="h">Where you came from <span className="tag">from your resume</span></b>
      {line ? <span className="t" data-testid="cm-mp-background">{line}</span> : <span className="t">Your resume is on file; we could not read a background from it yet.</span>}
      {chips.length > 0 && <div className="cm-mp-chips">{chips.map((c) => <span key={c} className="c" data-fit-box="">{c}</span>)}</div>}
      {p.goal && <span className="t" data-testid="cm-mp-goal"><b>Where you are going:</b> {p.goal}</span>}
    </div>
  );
}

export default function MyProgressScreen({ p }: { p: MyProgress }): React.ReactElement {
  const pct = ringPct(p.week);
  return (
    <div className="cm-mp" data-testid="cm-board-progress">
      <div className="k">Look how far you have come</div>
      <div className="cm-mp-cheer" data-testid="cm-board-title">{cheerLine(p.firstName)}</div>
      <div className="cm-mp-hero">
        {p.week && (
          <div className="cm-mp-ring" style={{ ['--p' as string]: `${pct}%` }} role="img" aria-label={`Week ${p.week.current} of ${p.week.total}`} data-testid="cm-mp-ring">
            <span><b>W{p.week.current}</b><small>of {p.week.total}</small></span>
          </div>
        )}
        <div className="cm-mp-hero-t">
          <b className="w" data-testid="cm-mp-week">{p.week ? `Week ${p.week.current}${p.week.cohortName ? ` · ${p.week.cohortName}` : ''}` : 'Your progress'}</b>
          <span className="s" data-testid="cm-mp-status">{statusLine(p)}</span>
        </div>
      </div>
      <div className="cm-mp-tiles">
        {([['Builder XP', p.points.builder], ['Learning XP', p.points.learning], ['Community XP', p.points.community]] as const).map(([l, v]) => (
          <div key={l} className="tile" data-fit-box=""><b>{v.toLocaleString('en-US')}</b><span>{l}</span></div>
        ))}
      </div>
      <div className="cm-mp-win" data-testid="cm-mp-win"><b>This week&rsquo;s win:</b> {winLine(p.latestWin)}</div>
      <div className="cm-mp-miles" data-testid="cm-mp-milestones">
        <b>Milestones:</b>
        {p.milestones.earned.map((m) => <span key={m.key} className="c is-won" data-fit-box="">&#9733; {m.label}</span>)}
        {p.milestones.next ? <span className="c" data-fit-box="" title={p.milestones.next.detail}>Next: {p.milestones.next.label}</span>
          : <span className="c is-won" data-fit-box="">All program milestones earned</span>}
      </div>
      <Story p={p} />
    </div>
  );
}
