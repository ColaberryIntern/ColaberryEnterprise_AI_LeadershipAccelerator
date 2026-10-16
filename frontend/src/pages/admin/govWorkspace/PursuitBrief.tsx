import React from 'react';

/**
 * PursuitBrief — the right-rail running brief (2026-10 redesign). One section per step 1–6:
 *  - past steps: "Known" with a few one-line facts;
 *  - the current step: "Adding now" (outlined);
 *  - future steps: dashed, "Unlocks at step N".
 * It replaces the scattered right-rail cards; the existing dossier / key-dates / amendments cards
 * are passed as `children` and render (collapsed) below the brief.
 *
 * Presentational only — the page computes each section's facts and state from `ws`.
 */
export type BriefState = 'known' | 'adding' | 'future';

export interface BriefSection {
  n: number;
  label: string;
  state: BriefState;
  /** One-line facts (past = what was learned; current = what is being added). */
  facts?: string[];
}

export function PursuitBrief({ sections, children }: {
  sections: BriefSection[];
  children?: React.ReactNode;
}): React.ReactElement {
  return (
    <div className="gov-pursuit-brief">
      <div className="card shadow-sm mb-3">
        <div className="card-body">
          <h2 className="h6 fw-semibold mb-1"><i className="ri-booklet-line me-1" aria-hidden="true" />Pursuit brief</h2>
          <p className="small text-secondary mb-3">Grows one section per step.</p>
          <div className="d-flex flex-column gap-2">
            {sections.map((s) => {
              const adding = s.state === 'adding';
              const future = s.state === 'future';
              const cls = adding
                ? 'border border-primary-subtle bg-primary-subtle bg-opacity-10'
                : future
                  ? 'border border-dashed'
                  : 'border';
              return (
                <div key={s.n} className={`rounded-3 p-2 ${cls}`} style={future ? { borderStyle: 'dashed' } : undefined}>
                  <div className="d-flex justify-content-between align-items-center">
                    <span className={`small fw-semibold ${future ? 'text-secondary' : ''}`}>{s.n} · {s.label}</span>
                    {adding ? <span className="badge bg-primary-subtle text-primary-emphasis">Adding now</span> : null}
                    {future ? <span className="badge bg-body-secondary text-secondary">Unlocks at step {s.n}</span> : null}
                  </div>
                  {!future && s.facts && s.facts.length > 0 ? (
                    <ul className="small text-secondary mb-0 mt-1 ps-3">
                      {s.facts.map((f, i) => <li key={i}>{f}</li>)}
                    </ul>
                  ) : null}
                </div>
              );
            })}
          </div>
        </div>
      </div>
      {children}
    </div>
  );
}
