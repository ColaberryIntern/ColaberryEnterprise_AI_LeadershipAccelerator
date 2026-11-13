import React from 'react';
import type { WrittenBody } from '../../../../services/myWorkApi';

/**
 * The in-app reader for written work (C128): case studies, prompt labs, architecture docs and decision
 * records have no file, their text lives in the platform, so they get a reading page instead of a
 * download. Plain text only, rendered through React (escaped); paragraphs split on blank lines.
 */
const paras = (text: string): string[] => text.split(/\n\s*\n/).map((p) => p.trim()).filter(Boolean);

export default function WrittenWorkReader({ title, body }: { title: string; body: WrittenBody }): React.ReactElement {
  return (
    <article className="mw-reader" aria-label={title}>
      {body.form === 'sections' && body.sections.map((s, i) => (
        <section key={i} className="mw-reader-sec">
          {s.heading && <h3>{s.heading}</h3>}
          {paras(s.body).map((p, j) => <p key={j}>{p}</p>)}
        </section>
      ))}
      {body.form === 'decision' && (
        <>
          <dl className="mw-reader-dl">
            {body.fields.map((f) => (
              <div key={f.label} className="mw-reader-row">
                <dt>{f.label}</dt>
                <dd>{paras(f.value).map((p, j) => <p key={j}>{p}</p>)}</dd>
              </div>
            ))}
          </dl>
          {body.receipt && (
            <aside className="mw-receipt" aria-label="Scenario receipt">
              {body.receipt.counts.length > 0 && (
                <ul>{body.receipt.counts.map((c) => <li key={c.label}><b>{c.value}</b> {c.label}</li>)}</ul>
              )}
              {body.receipt.note && <p>{body.receipt.note}</p>}
            </aside>
          )}
        </>
      )}
    </article>
  );
}
