import React from 'react';
import type { PlanSignal, PlanTopic } from '../../../../services/weeklyLivePlanApi';
import { FACTORS, TEACH, tone } from './planModel';

interface Props { topic: PlanTopic; signals: PlanSignal[]; chosen: boolean; canChoose: boolean; busy: boolean; confirming: string | null; onChoose: (override: boolean) => void; onCancel: () => void }

/** One scored topic: everything needed to say yes or no without opening anything else. */
export default function TopicCard({ topic: t, signals, chosen, canChoose, busy, confirming, onChoose, onCancel }: Props): React.ReactElement {
  const used = t.signals_used.flatMap((id) => signals.find((s) => s.id === id) || []);
  return (
    <article className={`cls-card clp-topic clp-${tone(t.topic_score)}`} data-testid={`topic-${t.rank}`} aria-labelledby={`topic-title-${t.id}`}>
      <header className="clp-topic-head">
        <div>
          <div className="clp-chips">
            {t.recommended && <span className="clp-chip clp-chip-strong">Recommended</span>}
            {chosen && <span className="clp-chip clp-chip-strong">Chosen</span>}
            <span className="clp-chip">Week {t.week}</span>
            {t.factors.map((f) => <span key={f} className="clp-chip">{FACTORS[f]}</span>)}
          </div>
          <h3 className="clp-topic-title" id={`topic-title-${t.id}`}>{t.title}</h3>
        </div>
        <p className="clp-score"><strong>{t.topic_score.toFixed(1)}</strong><span>Topic score</span></p>
      </header>
      {t.spin && <p>{t.spin}</p>}
      <dl className="clp-trio">
        {([['Teach', t.teach], ['Viral', t.viral], ['Convert', t.convert]] as const).map(([k, v]) => <div key={k}><dt>{k}</dt><dd>{v.toFixed(0)}</dd></div>)}
      </dl>
      <div className="clp-cols">
        <div>
          <h4>Opening hooks</h4>
          <ol className="clp-hooks">{t.hooks.map((h) => <li key={h.text}><span>{h.text}</span> <strong>{h.viral.toFixed(0)}</strong></li>)}</ol>
          {t.parody && <><h4>Parody</h4><p>{t.parody}</p></>}
        </div>
        <div>
          <h4>Signals used</h4>
          {used.length ? <ul>{used.map((s) => <li key={s.id}><a className="cls-link" href={s.url} target="_blank" rel="noopener noreferrer">{s.headline}</a></li>)}</ul> : <p className="cls-hint">None</p>}
          <h4>Package and marketing</h4>
          <ul>
            {Object.entries(t.package).map(([k, v]) => <li key={k}><strong>{k.replace(/_/g, ' ')}:</strong> {v}</li>)}
            {Object.entries(t.marketing).map(([k, v]) => <li key={k}><strong>{k.replace(/_/g, ' ')}:</strong> {v}</li>)}
          </ul>
        </div>
      </div>
      {t.warnings.length > 0 && <div className="cls-note cls-note-warn"><strong>Watch</strong><ul>{t.warnings.map((w) => <li key={w.code}>{w.message}</li>)}</ul></div>}
      <details className="clp-details">
        <summary>Teach score, line by line</summary>
        <dl className="clp-teach">
          {TEACH.map(([k, label]) => { const l = t.teach_lines[k]; return l ? <div key={k}><dt>{label} <strong>{l.score}/5</strong></dt><dd>{l.why}</dd></div> : null; })}
        </dl>
      </details>
      {confirming ? (
        <div className="cls-note cls-note-warn" role="alert">
          <p>{confirming}</p>
          <button type="button" className="cls-btn cls-btn-ghost" disabled={busy} onClick={() => onChoose(true)} data-testid={`choose-anyway-${t.rank}`}>Choose it anyway</button>{' '}
          <button type="button" className="cls-btn cls-btn-ghost" disabled={busy} onClick={onCancel}>Cancel</button>
        </div>
      ) : (
        <button type="button" className="cls-btn cls-btn-primary clp-choose" disabled={busy || !canChoose || chosen} onClick={() => onChoose(false)} data-testid={`choose-${t.rank}`}>
          {chosen ? 'Chosen' : 'Choose this topic'}<span className="visually-hidden">: {t.title}</span>
        </button>
      )}
    </article>
  );
}
