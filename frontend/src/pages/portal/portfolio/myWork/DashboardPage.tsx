import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import PortalShell from '../../today/PortalShell';
import { PaywallScreen } from '../../../../components/paywall/PageGate';
import { GATED_FEATURES } from '../../../../components/paywall/gatedFeatures';
import { fetchMyWork, type WorkItem } from '../../../../services/myWorkApi';
import { GROUP_STYLE } from './myWorkModel';
import { dayShort, myWorkLink, summarize } from './workSummary';
import '../PortfolioPage.css';
import './MyWork.css';

/**
 * Dashboard (C129, phase 2 of the approved C127 design): the Showcase Gallery's landing room. Answers "what have I built?" in
 * one look, from the learner's own pieces: how many, of what kind, when, which skills, and the newest five. Every bar and tile
 * opens My work already filtered. Private, like My work; nothing here publishes.
 */
type Ui = 'loading' | 'error' | 'gated' | 'loaded';

function Bar({ to, label, n, max, color, icon }: { to: string; label: string; n: number; max: number; color: string; icon?: string }): React.ReactElement {
  return (
    <li>
      <Link to={to} className="db-bar" aria-label={`${label}: ${n}`}>
        <span className="db-bar-l">{icon && <i className={`ri-${icon}`} aria-hidden="true" style={{ color }} />}{label}</span>
        <span className="db-bar-track" aria-hidden="true"><i style={{ width: `${max ? Math.max(4, (n / max) * 100) : 0}%`, background: color }} /></span>
        <b>{n}</b>
      </Link>
    </li>
  );
}

const DashboardPage: React.FC = () => {
  const [ui, setUi] = useState<Ui>('loading');
  const [items, setItems] = useState<WorkItem[]>([]);
  const load = useCallback(() => {
    setUi('loading');
    fetchMyWork()
      .then((l) => { setItems(l); setUi('loaded'); })
      .catch((err: { response?: { status?: number } }) => setUi(err?.response?.status === 402 ? 'gated' : 'error'));
  }, []);
  useEffect(load, [load]);
  const s = useMemo(() => summarize(items), [items]);

  if (ui === 'gated') return <PortalShell><PaywallScreen copy={GATED_FEATURES.portfolio} /></PortalShell>;

  const head = (
    <div className="te-page-h cp-head">
      <div>
        <div className="crumb">Showcase Gallery</div>
        <h1>Your body of work</h1>
        <div className="sub">
          {ui === 'loaded' && s.total > 0 && s.first && s.last
            ? `${s.total} piece${s.total === 1 ? '' : 's'} of work from ${dayShort(s.first)} to ${dayShort(s.last)}. Everything you made in the program, in one place.`
            : 'Everything you make in the program, in one place.'}
        </div>
      </div>
      <div className="db-actions">
        <Link className="cp-btn" to="/portal/portfolio/preview">Preview public page</Link>
        <Link className="cp-btn cp-btn-primary" to="/portal/portfolio/work">Open My work →</Link>
      </div>
    </div>
  );

  if (ui === 'loading') return <PortalShell>{head}<div className="cp-skeleton" role="status" aria-live="polite">Loading your work...</div></PortalShell>;
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
  if (s.total === 0) {
    return (
      <PortalShell>
        {head}
        <div className="cp-card">
          <h2>Nothing here yet</h2>
          <p className="cp-empty">Completing a lab, a build task, a field guide or a reflection adds a piece automatically, and this page fills in.</p>
        </div>
      </PortalShell>
    );
  }

  const maxKind = Math.max(...s.kinds.map((k) => k.n));
  const maxWeek = Math.max(...s.weeks.map((w) => w.n), 1);
  const maxSkill = Math.max(...s.skills.map((k) => k.n), 1);
  const kpis: Array<[number, string, string]> = [
    [s.total, s.total === 1 ? 'piece of work' : 'pieces of work', myWorkLink()],
    [s.kinds.length, s.kinds.length === 1 ? 'kind of work' : 'kinds of work', myWorkLink({ by: 'kind' })],
    [s.activeWeeks, s.activeWeeks === 1 ? 'week with work' : 'weeks with work', myWorkLink()],
    [s.projects, s.projects === 1 ? 'project in your work' : 'projects in your work', myWorkLink({ by: 'project' })],
  ];
  return (
    <PortalShell>
      {head}
      <ul className="db-kpis" aria-label="Your work in numbers">
        {kpis.map(([v, l, to]) => <li key={l}><Link to={to} className="cp-stat"><span className="cp-stat-n">{v}</span><span className="cp-stat-l">{l}</span></Link></li>)}
      </ul>
      <div className="cp-two">
        <section className="cp-card" aria-labelledby="db-kind-h">
          <h2 id="db-kind-h">What you have made</h2>
          <p className="cp-muted">Open a kind to see those pieces.</p>
          <ul className="db-bars">{s.kinds.map((k) => <Bar key={k.group} to={myWorkLink({ kind: k.group })} label={k.label} n={k.n} max={maxKind} color={k.color} icon={GROUP_STYLE[k.group].icon} />)}</ul>
        </section>
        <section className="cp-card" aria-labelledby="db-week-h">
          <h2 id="db-week-h">When you made it</h2>
          <p className="cp-muted">Pieces added per week{s.weeks.length > 1 ? `, the last ${s.weeks.length} weeks` : ''}.</p>
          <ol className="db-weeks">
            {s.weeks.map((w) => (
              <li key={w.key} aria-label={`Week of ${w.label}: ${w.n}`}>
                <b>{w.n || ''}</b>
                <span className="db-col" style={{ height: `${(w.n / maxWeek) * 96}px` }} aria-hidden="true" />
                <span className="db-wk">{w.label}</span>
              </li>
            ))}
          </ol>
        </section>
      </div>
      <div className="cp-two">
        <section className="cp-card" aria-labelledby="db-skill-h">
          <h2 id="db-skill-h">Where your evidence is strongest</h2>
          {s.skills.length ? (
            <><p className="cp-muted">Pieces tagged with each skill.</p>
              <ul className="db-bars">{s.skills.map((k) => <Bar key={k.label} to={myWorkLink({ by: 'skill', q: k.label })} label={k.label} n={k.n} max={maxSkill} color="var(--leaf, #77BB4A)" />)}</ul></>
          ) : <p className="cp-empty">None of your pieces is tagged with a skill yet.</p>}
        </section>
        <section className="cp-card" aria-labelledby="db-new-h">
          <h2 id="db-new-h">Recently added</h2>
          <ul className="mw-mini db-new">
            {s.newest.map((it) => (
              <li key={it.id}>
                <Link to={`/portal/portfolio/work/${encodeURIComponent(it.id)}`}>
                  <span className="mw-dot" style={{ background: GROUP_STYLE[it.group].color }} aria-hidden="true" />
                  <span className="db-new-t">{it.title || 'Untitled piece'}</span>
                  <span className="db-new-d">{dayShort(it.createdAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
          <p className="cp-ok"><Link className="cp-link" to="/portal/portfolio/work">See all {s.total}</Link></p>
        </section>
      </div>
    </PortalShell>
  );
};

export default DashboardPage;
