import React from 'react';
import { Link } from 'react-router-dom';
import type { ShowcaseWork } from '../../../services/showcaseApi';
import { GROUP_STYLE, shortDate, skillLabel } from '../portfolio/myWork/myWorkModel';

/** A shared piece's path: the read-only Showcase page, never the owner's own work page. */
export const showcaseHref = (id: string): string => `/portal/showcase/work/${encodeURIComponent(id)}`;
const by = (it: ShowcaseWork): string => (it.mine ? 'You' : it.author);

/** One shared piece, in the same work card as My work (C127 Screen 5), with the classmate who shared it in place of the status. */
export default function ShowcaseCard({ it }: { it: ShowcaseWork }): React.ReactElement {
  const s = GROUP_STYLE[it.group];
  return (
    <li className="mw-card">
      <Link to={showcaseHref(it.id)} className="mw-card-link">
        <span className="mw-badge" style={{ background: s.color }}><i className={`ri-${s.icon}`} aria-hidden="true" />{s.one}</span>
        <span className="mw-card-title">{it.title || 'Untitled piece'}</span>
        <span className="mw-card-meta">{shortDate(it.createdAt)} · {it.from}</span>
        {it.skills.length > 0 && (
          <span className="mw-tags">{it.skills.slice(0, 2).map((sk) => <span key={sk} className="mw-tag">{skillLabel(sk)}</span>)}</span>
        )}
        <span className="mw-card-state sc-by">Shared by <b>{by(it)}</b></span>
      </Link>
    </li>
  );
}

/** The New this week card: the newest share of the last 7 days (the server picks it; there is no curator). */
export function NewThisWeek({ it }: { it: ShowcaseWork }): React.ReactElement {
  const s = GROUP_STYLE[it.group];
  return (
    <Link to={showcaseHref(it.id)} className="cp-card sc-hero" data-testid="sc-new-week">
      <span className="sc-hero-art" style={{ background: `${s.color}1A` }}>
        <span className="mw-badge lg" style={{ background: s.color }}><i className={`ri-${s.icon}`} aria-hidden="true" />{s.one}</span>
      </span>
      <span className="sc-hero-body">
        <span className="sc-hero-k">New this week</span>
        <span className="sc-hero-t">{it.title || 'Untitled piece'}</span>
        <span className="mw-card-meta">Shared by {by(it)} · {it.from}{it.skills.length ? ` · ${it.skills.length} skill${it.skills.length === 1 ? '' : 's'}` : ''}</span>
      </span>
    </Link>
  );
}
