import React, { useEffect, useState } from 'react';
import { fetchTemplateLesson, type TemplateLesson } from './presentationApi';

/**
 * The Learn stage: what this kind of presentation is for, what good and bad look
 * like, and how the time is meant to be spent.
 *
 * The lesson is authored content served from the backend, not written here — the
 * templates are the single source of truth and a second copy in the UI would drift
 * from the one the deck prompt is built from.
 *
 * THE WEAK EXAMPLE IS NOT FILLER. A strong example alone teaches imitation; the
 * counter-case plus its annotation is what teaches judgement, which is the thing an
 * architect is actually hired for. Both are rendered with equal weight, and both are
 * labelled as examples so neither can be mistaken for a real student's work.
 */

export interface LearnPanelProps {
  templateId: string;
}

type State =
  | { kind: 'loading' }
  | { kind: 'ready'; lesson: TemplateLesson }
  | { kind: 'error'; message: string };

const mins = (s: number) => (s % 60 === 0 ? `${s / 60} min` : `${s}s`);

export default function LearnPanel({ templateId }: LearnPanelProps) {
  const [state, setState] = useState<State>({ kind: 'loading' });

  useEffect(() => {
    let live = true;
    setState({ kind: 'loading' });
    fetchTemplateLesson(templateId)
      .then((lesson) => { if (live) setState({ kind: 'ready', lesson }); })
      .catch((err: any) => {
        if (!live) return;
        setState({
          kind: 'error',
          message: err?.response?.data?.error || 'Could not load the lesson for this presentation type.',
        });
      });
    return () => { live = false; };
  }, [templateId]);

  if (state.kind === 'loading') {
    return <p className="ps-note ps-note--soft" data-testid="ps-learn-loading">Loading the lesson&hellip;</p>;
  }
  if (state.kind === 'error') {
    return <p className="ps-note" role="alert" data-testid="ps-learn-error">{state.message}</p>;
  }

  const l = state.lesson;
  return (
    <div data-testid="ps-learn">
      <div className="ps-card">
        <h3>{l.label}</h3>
        <p className="ps-note"><strong>What you should be able to do:</strong> {l.outcome}</p>
        <p className="ps-note ps-note--soft" style={{ marginTop: 6 }}>
          {mins(l.defaultSeconds)} speaking
          {l.qaSeconds > 0 && <> &middot; {mins(l.qaSeconds)} Q&amp;A, held separately</>}
        </p>
        <p className="ps-note" style={{ marginTop: 10 }}>{l.preface}</p>
      </div>

      <div className="ps-card">
        <h3>What to hand in</h3>
        <p className="ps-note">{l.expectedOutput}</p>
      </div>

      <div className="ps-card">
        <h3>What good looks like</h3>
        <blockquote className="ps-eg ps-eg--good">{l.strongExample.text}</blockquote>
        <p className="ps-note ps-note--soft"><strong>Why it works:</strong> {l.strongExample.why}</p>
      </div>

      <div className="ps-card">
        <h3>And what to avoid</h3>
        <blockquote className="ps-eg ps-eg--bad">{l.weakExample.text}</blockquote>
        <p className="ps-note ps-note--soft"><strong>Why it fails:</strong> {l.weakExample.why}</p>
      </div>

      <div className="ps-card">
        <h3>How the time is spent</h3>
        <ol className="ps-outline" data-testid="ps-outline">
          {l.timedOutline.map((b) => (
            <li key={b.beat}>
              <span className="ps-beat">{b.beat}</span>
              <span className="ps-secs">{b.seconds}s</span>
              <span className="ps-say">{b.say}</span>
            </li>
          ))}
        </ol>
      </div>

      <div className="ps-card">
        <h3>Words your audience may not know</h3>
        <dl className="ps-facts">
          {l.vocabulary.map((v) => (
            <React.Fragment key={v.term}>
              <dt>{v.term}</dt>
              <dd>{v.plain}</dd>
            </React.Fragment>
          ))}
        </dl>
      </div>

      <div className="ps-card">
        <h3>Before you start</h3>
        <ul className="ps-check">
          {l.prepare.map((p) => <li key={p}><span>{p}</span></li>)}
        </ul>
      </div>

      <div className="ps-card">
        <h3>One drill worth doing</h3>
        <p className="ps-note">{l.practiceDrill}</p>
      </div>

      <div className="ps-card">
        <h3>How it will be assessed</h3>
        <dl className="ps-facts" data-testid="ps-rubric">
          {l.rubric.map((r) => (
            <React.Fragment key={r.dimension}>
              <dt>{r.dimension} · {r.weight}%</dt>
              <dd>{r.lookFor}</dd>
            </React.Fragment>
          ))}
        </dl>
      </div>
    </div>
  );
}
