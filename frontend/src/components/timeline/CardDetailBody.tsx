import React, { useCallback, useEffect, useState } from 'react';
import portalApi from '../../utils/portalApi';
import { TimelineFeedCard } from './TimelineCard';
import VideoEmbed from './VideoEmbed';
import { parseVideoUrl } from '../../utils/videoEmbed';

/**
 * CardDetailBody — the SINGLE source of truth for "what the student sees" for a
 * card. Rendered by the student drawer (CardDetailDrawer), the Experience Studio
 * preview, and the Timeline editor preview — so those can never diverge again.
 *
 * `preview` (admin contexts) disables the live-only actions: the video-augment
 * call, auto-complete, and Enter-workspace navigation. Everything visual is
 * identical to what a student sees, by construction.
 */

export function totalPoints(p: TimelineFeedCard['points']): number {
  return (p.learning || 0) + (p.builder || 0) + (p.community || 0);
}

/** Wrap AI body_html in a minimal styled doc for a SANDBOXED iframe (no scripts run → inert/safe). */
export function lessonDoc(bodyHtml: string): string {
  return `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><style>
    body{font-family:Roboto,system-ui,sans-serif;margin:0;padding:2px;color:#1A1A1A;font-size:14.5px;line-height:1.62}
    h1,h2,h3{line-height:1.3;margin:14px 0 6px} h1{font-size:18px} h2{font-size:16px} h3{font-size:14.5px}
    p{margin:0 0 10px} ul,ol{padding-left:20px;margin:0 0 10px} li{margin-bottom:4px} a{color:#367895} img{max-width:100%}
    pre,code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12.5px;background:#F5F5F5;border-radius:6px}
    pre{padding:10px;overflow:auto} code{padding:1px 4px}
  </style>${bodyHtml}`;
}

interface Props {
  card: TimelineFeedCard;
  preview?: boolean;                       // admin: disable live calls + nav
  onComplete?: () => Promise<void> | void; // real drawer: mark complete (also on video end)
  onEnterWorkspace?: () => void;           // real drawer: navigate to the runtime
  onClose?: () => void;                    // real drawer: the header × button
}

const CardDetailBody: React.FC<Props> = ({ card, preview, onComplete, onEnterWorkspace, onClose }) => {
  const [augment, setAugment] = useState<any>(null);
  const [augBusy, setAugBusy] = useState(false);
  useEffect(() => { setAugment(null); setAugBusy(false); }, [card.id]);

  const makeInteractive = useCallback(async () => {
    if (preview) return; // no portal API in the admin preview
    setAugBusy(true);
    try {
      const r = await portalApi.post(`/api/portal/runtime/cards/${card.id}/video-augment`, {});
      setAugment(r.data?.augment ?? r.data ?? null);
    } catch { /* leave the button available to retry */ }
    finally { setAugBusy(false); }
  }, [card.id, preview]);

  const source = parseVideoUrl(card.video?.url);
  const isVideo = ['media', 'live_class', 'video_feedback'].includes(card.render_band);
  const done = card.status === 'completed';
  const pts = totalPoints(card.points);
  const presenter = card.video?.presenter || null;
  const duration = card.estimated_time ? `${card.estimated_time} min` : null;
  const content = card.content || null;

  return (
    <>
      <div className="tld-head">
        <div className="tld-crumbs">{card.student_label}{card.week != null ? ` · Week ${card.week}` : ''}</div>
        {onClose && (
          <button type="button" className="tld-close" onClick={onClose} aria-label="Close">
            <svg viewBox="0 0 24 24" fill="none"><path d="M6 6l12 12M18 6L6 18" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>
          </button>
        )}
      </div>

      <div className="tld-body">
        <div className="tld-chiprow">
          <span className="tl-chip learning"><span className="sw" />{card.student_label}</span>
          {pts > 0 && <span className={`tl-ptbadge${done ? ' earned' : ''}`}>+{pts} pts</span>}
          {done && <span className="pip done" style={{ fontSize: 13 }}><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg> Completed</span>}
        </div>

        <h2 className="tld-title">{card.title}</h2>

        <div className="tld-meta">
          {presenter && <span><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="8" r="4" stroke="currentColor" strokeWidth="2" /><path d="M4 20c0-4 4-6 8-6s8 2 8 6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>{presenter}</span>}
          {duration && <span><svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="9" stroke="currentColor" strokeWidth="2" /><path d="M12 7v5l3 2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg>{duration}</span>}
          <span className="tld-diff">{card.difficulty}</span>
        </div>

        {isVideo && (
          <div className="tld-player">
            <VideoEmbed source={source} title={card.title} poster={card.video?.poster || null} onEnded={done || preview ? undefined : onComplete} />
          </div>
        )}

        <div className="tld-about">
          {isVideo && <div className="tld-lab">About this {source ? 'video' : 'activity'}</div>}
          {card.description
            ? <p className="tld-desc">{card.description}</p>
            : <p className="tld-desc muted">No description yet.</p>}
          <div className="tld-facts">
            {presenter && <span><b>Presenter</b>{presenter}</span>}
            {duration && <span><b>Length</b>{duration}</span>}
            {pts > 0 && <span><b>Points</b>+{pts} pts</span>}
            {card.difficulty && <span><b>Level</b>{card.difficulty}</span>}
          </div>
        </div>

        {content && (content.summary || content.body_html || (content.questions && content.questions.length > 0) || content.reflection) && (
          <div className="tld-lesson">
            <div className="tld-lab">{isVideo ? 'Lesson notes' : 'Lesson'}</div>
            {content.summary && <p className="tld-desc">{content.summary}</p>}
            {content.body_html && <iframe className="tld-lessonframe" title="Lesson content" sandbox="" srcDoc={lessonDoc(content.body_html)} />}
            {Array.isArray(content.questions) && content.questions.length > 0 && (
              <><div className="tld-sublab">Questions to consider</div>
                <ul className="tld-alist">{content.questions.map((q, i) => <li key={i}>{q}</li>)}</ul></>
            )}
            {content.reflection && (
              <><div className="tld-sublab">Reflect</div>
                <p className="tld-desc">{content.reflection}</p></>
            )}
          </div>
        )}

        {isVideo && source && (
          <div className="tld-augment">
            <div className="tld-lab">Interactive notes</div>
            {!augment ? (
              <>
                <p className="tld-desc muted" style={{ margin: '0 0 10px', fontSize: 13.5 }}>Get an AI summary, the key moments, flashcards, and a quick self-check for this video.</p>
                <button type="button" className="tl-btn primary sm" disabled={augBusy || preview} onClick={makeInteractive} title={preview ? 'Live for students' : undefined}>{augBusy ? 'Generating…' : '✦ Make it interactive'}</button>
                {preview && <span className="tld-note" style={{ display: 'inline-block', marginLeft: 8, padding: '4px 8px' }}>live for students</span>}
              </>
            ) : (
              <>
                {augment.summary && <p className="tld-desc" style={{ marginBottom: 12 }}>{augment.summary}</p>}
                {Array.isArray(augment.chapters) && augment.chapters.length > 0 && (
                  <><div className="tld-sublab">Key moments</div>
                    <ul className="tld-alist">{augment.chapters.map((c: any, i: number) => <li key={i}><b>{c.t}</b> {c.title}</li>)}</ul></>
                )}
                {Array.isArray(augment.flashcards) && augment.flashcards.length > 0 && (
                  <><div className="tld-sublab">Flashcards</div>
                    <ul className="tld-alist">{augment.flashcards.map((f: any, i: number) => <li key={i}><b>{typeof f === 'string' ? f : f.front}</b>{f && f.back ? ` — ${f.back}` : ''}</li>)}</ul></>
                )}
                {Array.isArray(augment.quiz) && augment.quiz.length > 0 && (
                  <><div className="tld-sublab">Check yourself</div>
                    <ul className="tld-alist">{augment.quiz.map((q: any, i: number) => <li key={i}>{typeof q === 'string' ? q : q.q}</li>)}</ul></>
                )}
                {Array.isArray(augment.reflection) && augment.reflection.length > 0 && (
                  <><div className="tld-sublab">Reflect</div>
                    <ul className="tld-alist">{augment.reflection.map((r: any, i: number) => <li key={i}>{typeof r === 'string' ? r : r.q || r.prompt}</li>)}</ul></>
                )}
              </>
            )}
          </div>
        )}

        {isVideo && (
          <div className="tld-note">
            {source
              ? 'Watch the video, use “Make it interactive” for notes, then mark it complete to earn your points.'
              : 'No video link is attached to this card yet. An admin can add one from Orchestration → Timeline.'}
          </div>
        )}
      </div>

      <div className="tld-foot">
        {done
          ? <span className="pip done" style={{ fontSize: 14 }}><svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" /></svg> Completed · +{pts} pts earned</span>
          : preview
            ? <span className="tld-note" style={{ padding: '8px 12px' }}>For students, this footer has <b>Close</b> and <b>Enter workspace →</b> (the full activity + AI Mentor).</span>
            : (
              <>
                {onClose && <button type="button" className="tl-btn ghost" onClick={onClose}>Close</button>}
                {onEnterWorkspace && <button type="button" className="tl-btn primary" onClick={onEnterWorkspace}>Enter workspace →</button>}
              </>
            )}
      </div>
    </>
  );
};

export default CardDetailBody;
