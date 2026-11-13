import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import PortalShell from '../today/PortalShell';
import { PaywallScreen } from '../../../components/paywall/PageGate';
import { GATED_FEATURES } from '../../../components/paywall/gatedFeatures';
import { fetchShowcase, type ShowcaseList } from '../../../services/showcaseApi';
import type { WorkGroup } from '../../../services/myWorkApi';
import { GROUP_STYLE, chipsFor, matches, skillLabel } from '../portfolio/myWork/myWorkModel';
import ShowcaseCard, { NewThisWeek } from './ShowcaseCard';
import PresentationDemos from './PresentationDemos';
import '../portfolio/PortfolioPage.css';
import '../portfolio/myWork/MyWork.css';
import './Showcase.css';

/**
 * The Showcase (C138, phase 4 of the approved C127 design, Screen 5): work your classmates chose to share with your cohort, in
 * the same work cards as My work, each opening a read-only page.
 *
 * THE FILTERING FOR PRIVACY IS NOT HERE. The server returns only pieces shared by learners in the viewer's own cohort (Ali, 11 Nov
 * 2026), with the viewer's cohort read from enrollments; this page only narrows what it was given (kind, skill, search).
 *
 * Sharing is its own opt-in (C127 decision Q1 A), made on each piece's own page in My work; featuring on the public page does
 * not put anything here. "New this week" is the newest share of the last 7 days, picked by the server, never invented.
 *
 * Four states for the shared work: loading, error (with Try again; an error is never shown as empty), empty (how to share), loaded.
 * The staff-approved presentation demos keep their own section underneath.
 */
type Ui = 'loading' | 'error' | 'gated' | 'loaded';

const ShowcaseGalleryPage: React.FC = () => {
  const [ui, setUi] = useState<Ui>('loading');
  const [data, setData] = useState<ShowcaseList>({ items: [], newThisWeek: null });
  const [params, setParams] = useSearchParams();
  const kindParam = params.get('kind') as WorkGroup | null;
  const kind: WorkGroup | 'all' = kindParam && kindParam in GROUP_STYLE ? kindParam : 'all';
  const skill = params.get('skill') ?? '';
  const q = params.get('q') ?? '';

  const load = useCallback(() => {
    setUi('loading');
    fetchShowcase()
      .then((d) => { setData(d); setUi('loaded'); })
      .catch((err: { response?: { status?: number } }) => setUi(err?.response?.status === 402 ? 'gated' : 'error'));
  }, []);
  useEffect(load, [load]);

  const set = (key: string, value: string, fallback: string) => {
    const next = new URLSearchParams(params);
    if (!value || value === fallback) next.delete(key); else next.set(key, value);
    setParams(next, { replace: true });
  };

  const items = data.items;
  const chips = useMemo(() => chipsFor(items), [items]);
  const skills = useMemo(() => {
    const m = new Map<string, string>();
    for (const it of items) for (const sk of it.skills) m.set(skillLabel(sk).toLowerCase(), skillLabel(sk));
    return [...m.entries()].sort((a, b) => a[1].localeCompare(b[1]));
  }, [items]);
  const shown = useMemo(() => items.filter((it) => (kind === 'all' || it.group === kind)
    && (!skill || it.skills.some((sk) => skillLabel(sk).toLowerCase() === skill)) && matches(it, q)), [items, kind, skill, q]);

  const head = (
    <div className="te-page-h cp-head">
      <div>
        <div className="crumb">Showcase Gallery</div>
        <h1>Showcase</h1>
        <div className="sub">Work your classmates chose to share with your cohort.</div>
      </div>
      <span className="cp-privacy sc-pill" title="Only signed-in learners in your cohort see what is shared here">Your cohort</span>
    </div>
  );

  let body: React.ReactNode;
  if (ui === 'gated') body = <PaywallScreen copy={GATED_FEATURES.portfolio} />;
  else if (ui === 'loading') body = <div className="cp-skeleton" role="status" aria-live="polite" data-testid="sc-loading">Loading the Showcase...</div>;
  else if (ui === 'error') {
    body = (
      <div className="cp-error" role="alert" data-testid="sc-error">
        <h2>We couldn&apos;t load the Showcase</h2>
        <p>This does not mean it is empty. It was a problem reading it.</p>
        <button type="button" className="cp-btn cp-btn-primary" onClick={load}>Try again</button>
      </div>
    );
  } else if (items.length === 0) {
    body = (
      <div className="cp-card" data-testid="sc-empty">
        <h2>Nothing shared in your cohort yet</h2>
        <p className="cp-empty">Be the first: open any piece in <Link to="/portal/portfolio/work">My work</Link> and choose <b>Share with my cohort</b>. Only your cohort sees it, and you can stop sharing at any time.</p>
      </div>
    );
  } else {
    body = (
      <>
        {data.newThisWeek && <NewThisWeek it={data.newThisWeek} />}
        <div className="mw-tools sc-tools">
          <label className="mw-search">
            <span className="cp-sr">Search shared work</span>
            <i className="ri-search-line" aria-hidden="true" />
            <input type="search" value={q} placeholder="Search titles, people and skills" onChange={(e) => set('q', e.target.value, '')} data-testid="sc-search" />
          </label>
          {skills.length > 0 && (
            <label className="sc-skill">
              <span className="cp-sr">Skill</span>
              <select value={skill} onChange={(e) => set('skill', e.target.value, '')} data-testid="sc-skill">
                <option value="">Every skill</option>
                {skills.map(([k, label]) => <option key={k} value={k}>{label}</option>)}
              </select>
            </label>
          )}
        </div>
        <div className="mw-chips" role="group" aria-label="Show one kind of work">
          {chips.map((c) => (
            <button key={c.key} type="button" className={`mw-chip${kind === c.key ? ' on' : ''}`} aria-pressed={kind === c.key} onClick={() => set('kind', c.key, 'all')}>
              {c.label}<span className="mw-chip-n">{c.count}</span>
            </button>
          ))}
        </div>
        {shown.length === 0
          ? <p className="cp-empty" role="status">No shared pieces match. <button type="button" className="cp-link" onClick={() => setParams(new URLSearchParams(), { replace: true })}>Clear the filters</button></p>
          : <ul className="mw-grid sc-grid" data-testid="sc-grid">{shown.map((it) => <ShowcaseCard key={it.id} it={it} />)}</ul>}
      </>
    );
  }

  return (
    <PortalShell>
      {head}
      {body}
      <PresentationDemos />
    </PortalShell>
  );
};

export default ShowcaseGalleryPage;
