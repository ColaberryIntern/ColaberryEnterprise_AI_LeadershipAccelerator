import React from 'react';
import { GROUP_STYLE } from '../../pages/portal/portfolio/myWork/myWorkModel';
import type { WorkGroup } from '../../services/myWorkApi';

/**
 * Featured work (C130, phase 3 of the approved C127 design): the pieces the learner chose to show, on their portfolio page. The
 * backend already decided which pieces those are (on the public page, only ones a reviewer approved; on Preview, the learner's live
 * choice), so this renders what it is given and nothing else. No pieces, no section.
 *
 * `hrefFor` says where a card opens: the public read-only work page for strangers, the learner's own work page on Preview. Without
 * it the cards are not links.
 */
export interface FeaturedWorkItem { id: string; group: WorkGroup; title: string; from: string; created_at: string }

const day = (iso: string): string =>
  new Date(iso).toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric', timeZone: 'America/Chicago' });

export default function FeaturedWorkSection({ items, hrefFor }: { items: FeaturedWorkItem[]; hrefFor?: (id: string) => string }): React.ReactElement | null {
  if (!items.length) return null;
  return (
    <section id="featured-work" className="pf-card" aria-labelledby="pf-featured-work-h">
      <h2 id="pf-featured-work-h" className="pf-fw-h">{items.length === 1 ? 'Featured work' : `Featured work (${items.length})`}</h2>
      <p className="pf-fw-sub">Chosen by them from the work they made in the program.</p>
      <ul className="pf-fw-grid">
        {items.map((it) => {
          const s = GROUP_STYLE[it.group] ?? GROUP_STYLE.file;
          const inner = (
            <>
              <span className="pf-fw-badge" style={{ background: s.color }}>{s.one}</span>
              <span className="pf-fw-title">{it.title || 'Untitled piece'}</span>
              <span className="pf-fw-meta">{it.from} · {day(it.created_at)}</span>
            </>
          );
          return <li key={it.id}>{hrefFor ? <a className="pf-fw-card" href={hrefFor(it.id)}>{inner}</a> : <div className="pf-fw-card">{inner}</div>}</li>;
        })}
      </ul>
    </section>
  );
}
