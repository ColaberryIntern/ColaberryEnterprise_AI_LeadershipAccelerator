import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PortalShell from '../../today/PortalShell';
import { PaywallScreen } from '../../../../components/paywall/PageGate';
import { GATED_FEATURES } from '../../../../components/paywall/gatedFeatures';
import { fetchMyWork, type WorkGroup, type WorkItem } from '../../../../services/myWorkApi';
import { GROUP_BY, GROUP_STYLE, chipsFor, filterItems, orderOf, sectionsFor, shortDate, skillLabel, type GroupBy } from './myWorkModel';
import { saveOrder } from './workOrder';
import '../PortfolioPage.css';
import './MyWork.css';

/**
 * My work (C128, phase 1 of the approved C127 design): every piece of work the learner made in the
 * program, in one place, each card opening that piece's own viewer page. Private: only the learner and
 * their coaches can see it, and nothing here publishes anything.
 *
 * The kind, grouping and search live in the URL (?kind=sheet&by=project&q=mcp) so Back restores them and
 * the Gallery's Dashboard (phase 2) can land a learner here already filtered.
 */
type Ui = 'loading' | 'error' | 'gated' | 'loaded';
const BY_KEYS = new Set<GroupBy>(['week', 'project', 'skill', 'kind']);

export function WorkCard({ it }: { it: WorkItem }): React.ReactElement {
  const s = GROUP_STYLE[it.group];
  return (
    <li className="mw-card">
      <Link to={`/portal/portfolio/work/${encodeURIComponent(it.id)}`} className="mw-card-link">
        <span className="mw-badge" style={{ background: s.color }}>
          <i className={`ri-${s.icon}`} aria-hidden="true" />{s.one}
        </span>
        <span className="mw-card-title">{it.title || 'Untitled piece'}</span>
        <span className="mw-card-meta">{shortDate(it.createdAt)} · {it.from}</span>
        {it.skills.length > 0 && (
          <span className="mw-tags">{it.skills.slice(0, 2).map((sk) => <span key={sk} className="mw-tag">{skillLabel(sk)}</span>)}</span>
        )}
        <span className="mw-card-state">{it.state}</span>
      </Link>
    </li>
  );
}

const MyWorkPage: React.FC = () => {
  const [ui, setUi] = useState<Ui>('loading');
  const [items, setItems] = useState<WorkItem[]>([]);
  const [params, setParams] = useSearchParams();
  const kindParam = params.get('kind') as WorkGroup | null;
  const kind: WorkGroup | 'all' = kindParam && kindParam in GROUP_STYLE ? kindParam : 'all';
  const byParam = params.get('by') as GroupBy | null;
  const by: GroupBy = byParam && BY_KEYS.has(byParam) ? byParam : 'week';
  const q = params.get('q') ?? '';

  const load = useCallback(() => {
    setUi('loading');
    fetchMyWork()
      .then((list) => { setItems(list); setUi('loaded'); })
      .catch((err: { response?: { status?: number } }) => setUi(err?.response?.status === 402 ? 'gated' : 'error'));
  }, []);
  useEffect(load, [load]);

  const set = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === fallback) next.delete(key); else next.set(key, value);
    setParams(next, { replace: true });
  };

  const chips = useMemo(() => chipsFor(items), [items]);
  const shown = useMemo(() => filterItems(items, kind, q), [items, kind, q]);
  const sections = useMemo(() => sectionsFor(shown, by), [shown, by]);
  useEffect(() => { if (ui === 'loaded') saveOrder(orderOf(sections)); }, [sections, ui]);

  if (ui === 'gated') return <PortalShell><PaywallScreen copy={GATED_FEATURES.portfolio} /></PortalShell>;

  const head = (
    <div className="te-page-h cp-head">
      <div>
        <div className="crumb">Showcase Gallery</div>
        <h1>My work</h1>
        <div className="sub">
          {ui === 'loaded' && items.length > 0
            ? `${items.length} piece${items.length === 1 ? '' : 's'} of work from the program. Open any of them.`
            : 'Every piece of work you make in the program, in one place.'}
        </div>
      </div>
      <span className="cp-privacy" title="Only you and your coaches can see this">Private</span>
    </div>
  );

  if (ui === 'loading') {
    return <PortalShell>{head}<div className="cp-skeleton" role="status" aria-live="polite">Loading your work...</div></PortalShell>;
  }
  if (ui === 'error') {
    return (
      <PortalShell>
        {head}
        <div className="cp-error" role="alert">
          <h2>We couldn&apos;t load your work</h2>
          <p>Nothing was lost. Your work is safe; this was a problem reading it.</p>
          <button type="button" className="cp-btn cp-btn-primary" onClick={load}>Try again</button>
        </div>
      </PortalShell>
    );
  }

  return (
    <PortalShell>
      {head}
      {items.length === 0 ? (
        <div className="cp-card">
          <h2>Nothing here yet</h2>
          <p className="cp-empty">Completing a lab, a build task, a field guide or a reflection adds a piece here automatically. You never have to file anything by hand.</p>
        </div>
      ) : (
        <>
          <div className="mw-tools">
            <label className="mw-search">
              <span className="cp-sr">Search your work</span>
              <i className="ri-search-line" aria-hidden="true" />
              <input type="search" value={q} placeholder="Search titles, lessons and skills" onChange={(e) => set('q', e.target.value, '')} />
            </label>
          </div>
          <div className="mw-chips" role="group" aria-label="Show one kind of work">
            {chips.map((c) => (
              <button key={c.key} type="button" className={`mw-chip${kind === c.key ? ' on' : ''}`} aria-pressed={kind === c.key}
                onClick={() => set('kind', c.key, 'all')}>
                {c.label}<span className="mw-chip-n">{c.count}</span>
              </button>
            ))}
          </div>
          <div className="mw-groupby" role="group" aria-label="Group by">
            <span className="mw-groupby-l">Group by</span>
            {GROUP_BY.map((g) => (
              <button key={g.key} type="button" className={`mw-chip sm${by === g.key ? ' on' : ''}`} aria-pressed={by === g.key}
                onClick={() => set('by', g.key, 'week')}>{g.label}</button>
            ))}
            <span className="mw-groupby-r">Newest first</span>
          </div>
          {shown.length === 0 ? (
            <p className="cp-empty" role="status">No pieces match. <button type="button" className="cp-link" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear the filters</button></p>
          ) : sections.map((s) => (
            <section key={s.key} className="mw-section" aria-labelledby={`mw-h-${s.key}`}>
              <h2 id={`mw-h-${s.key}`} className="mw-section-h">{s.label} <span>· {s.items.length} piece{s.items.length === 1 ? '' : 's'}</span></h2>
              <ul className="mw-grid">{s.items.map((it) => <WorkCard key={`${s.key}-${it.id}`} it={it} />)}</ul>
            </section>
          ))}
        </>
      )}
    </PortalShell>
  );
};

export default MyWorkPage;
