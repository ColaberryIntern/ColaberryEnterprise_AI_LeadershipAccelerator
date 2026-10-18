import React from 'react';
import { Link } from 'react-router-dom';
import type { ExplorerPathModel } from './campusPath';

/**
 * "Your path to enrolling" in the Main Gate card, for Explorers (Colaberry Campus C6). Every line is a real link or a real
 * fact for this viewer (see campusPath.ts); nothing is ticked off because there is no per-step completion data.
 */
export default function ExplorerPath({ model, onNavigate }: { model: ExplorerPathModel; onNavigate: () => void }): React.ReactElement {
  return (
    <section className="cm-path" aria-label="Your path to enrolling" data-testid="cm-explorer-path">
      <h3 className="cm-card-h">Your path to enrolling</h3>
      {model.steps.length > 0 && (
        <ol className="cm-path-steps">
          {model.steps.map((s) => <li key={s.route}><Link to={s.route} onClick={onNavigate}>{s.label}</Link></li>)}
        </ol>
      )}
      {model.opens.length > 0 && (
        <p className="cm-who-note" data-testid="cm-path-opens">Enrolling opens everything in: {model.opens.join(', ')}.</p>
      )}
      <Link className="cm-btn" to={model.cta.to} onClick={onNavigate} data-testid="cm-path-cta">{model.cta.label}</Link>
      {model.askMaya && <p className="cm-who-note" data-testid="cm-path-maya">Questions first? Ask Maya at her desk below.</p>}
    </section>
  );
}
