import React from 'react';
import VideoEmbed, { WatchBeatPayload } from '../../../components/timeline/VideoEmbed';
import { parseVideoUrl, videoThumbnail } from '../../../utils/videoEmbed';
import type { PromptEval, Readiness, RtOpen } from './runtimeApi';

/**
 * Self-contained pieces of the lesson workspace's centre and status bar, lifted out of RuntimeWorkspace unchanged when the page
 * passed the 500-line ceiling (Campus C19). Each only draws what the page hands it; the page keeps every piece of state.
 */
type Card = RtOpen['card'];

/** Hero — the type's picture with the lesson title ON the image. */
export function RuntimeHero({ src, title }: { src: string; title: string }): React.ReactElement {
  return (
    <div style={{ position: 'relative', borderRadius: 12, overflow: 'hidden', marginBottom: 14 }}>
      <img src={src} alt="" style={{ width: '100%', display: 'block', maxHeight: 240, objectFit: 'cover' }} />
      <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(180deg, rgba(4,25,29,0) 42%, rgba(4,25,29,.74) 100%)' }} />
      <div style={{ position: 'absolute', left: 16, right: 16, bottom: 12, color: '#fff', fontWeight: 800, fontSize: 20, lineHeight: 1.25, textShadow: '0 1px 3px rgba(0,0,0,.45)' }}>{title}</div>
    </div>
  );
}

type Watch = { watched_pct: number; required_pct: number | null; met: boolean } | null;

/** The player for video bands, with the watch-gate line while not yet completed. */
export function RuntimeVideo({ card, completed, watch, onWatchBeat }: {
  card: Card; completed: boolean; watch: Watch; onWatchBeat: ((beat: WatchBeatPayload) => void) | undefined;
}): React.ReactElement {
  return (
    <>
      <VideoEmbed
        source={parseVideoUrl(card.video?.url)}
        title={card.video?.title || card.title}
        poster={card.video?.poster || videoThumbnail(parseVideoUrl(card.video?.url))}
        badge={card.type === 'testimonial' ? 'Testimonial' : card.type === 'podcast' ? 'Podcast' : null}
        onWatchBeat={onWatchBeat}
        fallbackDurationS={card.video?.duration_seconds || (card.estimated_time ? card.estimated_time * 60 : null)}
      />
      {!completed && card.video?.url && (
        <div className="tlv-watch">
          <div className="tlv-watchbar"><i style={{ width: `${Math.min(100, watch?.watched_pct ?? 0)}%` }} /></div>
          <span className="tlv-watchpct">
            {watch?.required_pct != null
              ? (watch.met ? '✓ Watched — points unlocked' : `Watched ${watch?.watched_pct ?? 0}% · reach ${watch.required_pct}% to collect your points`)
              : `Watched ${watch?.watched_pct ?? 0}%`}
          </span>
        </div>
      )}
    </>
  );
}

/** The prompt lab: write, run and evaluate, with the improved version one click away. */
export function PromptLabPanel({ prompt, onPrompt, busy, onRun, evalResult }: {
  prompt: string; onPrompt: (v: string) => void; busy: boolean; onRun: () => void; evalResult: PromptEval | null;
}): React.ReactElement {
  return (
    <div>
      <div className="rt-lab">Your prompt</div>
      <textarea className="rt-in mono" style={{ minHeight: 150 }} value={prompt} onChange={(e) => onPrompt(e.target.value)} placeholder="Write your prompt. The mentor won't hand you the answer — draft, run, iterate." />
      <div className="rt-row"><button className="rt-btn pri" disabled={busy || !prompt.trim()} onClick={onRun}>{busy ? 'Evaluating…' : '▶ Run & evaluate'}</button>{evalResult && <button className="rt-btn" onClick={() => onPrompt(evalResult.better_prompt)}>Use improved version</button>}</div>
      {evalResult && (
        <div className="rt-card">
          <div className="rt-scores"><div><b>{evalResult.score}</b><span>craft</span></div><div><b>{evalResult.architect_score}</b><span>architect</span></div></div>
          {evalResult.strengths.length > 0 && <><div className="rt-lab">Strengths</div><ul className="rt-list ok">{evalResult.strengths.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
          {evalResult.gaps.length > 0 && <><div className="rt-lab">Gaps</div><ul className="rt-list warn">{evalResult.gaps.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
          {evalResult.suggestions.length > 0 && <><div className="rt-lab">Suggestions</div><ul className="rt-list">{evalResult.suggestions.map((s, i) => <li key={i}>{s}</li>)}</ul></>}
        </div>
      )}
    </div>
  );
}

/** BOTTOM — Evidence & Readiness: the status bar's stats. */
export function RuntimeReadinessStats({ readiness }: { readiness: Readiness | null }): React.ReactElement {
  const emp = readiness?.employment; const cert = readiness?.certification; const jr = readiness?.journey; const evd = readiness?.evidence;
  return (
    <>
      {emp && <div className="rt-stat"><span className="l">Employment</span><span className="v">{emp.overall}<small>/100 · {emp.band}</small></span></div>}
      {cert && <div className="rt-stat"><span className="l">Cert pass prob.</span><span className="v">{Math.round(cert.pass_probability * 100)}%</span></div>}
      {jr && <div className="rt-stat"><span className="l">Architect stage</span><span className="v sm">{jr.focus_stage}</span></div>}
      {evd && <div className="rt-stat"><span className="l">GitHub</span><span className="v">{evd.github.commits}<small> commits</small></span></div>}
      {evd && <div className="rt-stat"><span className="l">Portfolio</span><span className="v">{evd.portfolio.entries}</span></div>}
      {readiness && <div className="rt-stat"><span className="l">Builder XP</span><span className="v">{readiness.progression.xp.builder}</span></div>}
      {emp && emp.employer_gaps[0] && <div className="rt-gap">Employers still want: <b>{emp.employer_gaps[0].need}</b></div>}
    </>
  );
}
