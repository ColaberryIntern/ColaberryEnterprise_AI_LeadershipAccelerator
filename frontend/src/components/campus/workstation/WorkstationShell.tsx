import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useCampus } from '../CampusContext';
import { CAMPUS_HOME } from '../CampusLayers';
import { useHomeFacts } from '../home/useHomeFacts';
import { runtimeCss } from '../../../pages/portal/runtime/runtimeKit';
import WorkstationDesk from './WorkstationDesk';
import DeskTools from './DeskTools';
import type { BenchTicket, WorkstationPlace } from './workstationModel';
import './workstation.css';

/**
 * The workstation (Campus round 3 §2.3 + v6 D1, Basecamp C19; the prototype's #ws): one shell for a story and a lesson. A warm
 * dark desk: the trail "‹spot› · ‹card›" with "📺 All of ‹section›" and "← Stand up", the cork bench "Pinned above your desk",
 * two monitors (left angled: the repo terminal or the notebook; right: the card itself), the desk surface, Cory on the right and
 * the status bar. It only ARRANGES: each page keeps every piece of its own logic (Cory, the repo, Done means from
 * .colaberry/progress.json, completion) and hands the shell the nodes it already renders in the classic layout.
 *
 * Stand up returns you to the room: the same "stand inside it" request every map entry uses (openMap(building, 'inside')), so
 * the home opens the room the workstation belongs to.
 *
 * C40 (Ali, 2026-10-25: "I'm more concerned with getting the content on the screen comfortably"): the frame gets out of the way.
 * A slim pinned strip, thin bezels with no stands, the desk props only from 1200 px, a one-line status bar, Cory in a 300 px column,
 * and below 1200 px Cory becomes a drawer (the Cory button in the top bar; Esc closes it) so the card takes the full width. Learners
 * on a Claude Code task run the terminal on one half of the screen and this on the other (950-1100 px).
 */
export interface WorkstationShellProps {
  theme: 'light' | 'dark';
  place: WorkstationPlace;
  cardTitle: string;
  /** The page's own state pill ("✓ Completed" / "In progress"). */
  pill: React.ReactNode;
  /** The page's own header links (the Command Center), placed before the pill. */
  actions?: React.ReactNode;
  bench: BenchTicket[];
  /** The left monitor (RepoTerminal / LessonNotebook). */
  left: React.ReactNode;
  /** The right, main monitor: the page's centre column, unchanged. */
  children: React.ReactNode;
  /** Cory's rail (MentorRail). */
  mentor: React.ReactNode;
  /** The status bar's stats (the page's own .rt-stat nodes). */
  status: React.ReactNode;
  /** Extra classes for the main monitor's scroll area (the runtime's reader layouts). */
  mainClass?: string;
  /** The card's kicker and title at the top of the main monitor (the classic page carries them in its own header). */
  heading?: { kicker: string; title: string };
}

function nameCardOf(full: string, first: string): string {
  const parts = full.trim().split(/\s+/).filter(Boolean);
  if (parts.length > 1) return `${parts[0]} ${parts[parts.length - 1][0]}.`.toUpperCase();
  return (first || 'YOUR DESK').toUpperCase();
}

export default function WorkstationShell(p: WorkstationShellProps): React.ReactElement {
  const navigate = useNavigate();
  const { openMap, presence } = useCampus();
  const facts = useHomeFacts(false);
  const standUp = () => { openMap(p.place.buildingId, 'inside'); navigate(CAMPUS_HOME); };
  const goSection = () => navigate(p.place.sectionRoute);
  const [coryOpen, setCoryOpen] = useState(false);
  useEffect(() => {
    if (!coryOpen) return undefined;
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setCoryOpen(false); };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [coryOpen]);

  return (
    <div className="rt cm-ws" data-theme={p.theme} data-testid="cm-ws">
      <style>{runtimeCss}</style>
      <header className="cm-ws-top">
        <nav className="cm-ws-trail" aria-label="Where you are">
          <button type="button" className="b" onClick={standUp} data-testid="cm-ws-crumb-building"><span className="sq" aria-hidden="true" />{p.place.section}</button>
          <span aria-hidden="true" className="chev">›</span>
          <span data-testid="cm-ws-trail"><span className="sp">{p.place.spot}</span><span aria-hidden="true"> · </span><span className="cm-ws-cardt">{p.cardTitle}</span></span>
        </nav>
        {p.actions}
        <span className="cm-ws-pill">{p.pill}</span>
        <button type="button" className="cm-ws-btn" onClick={goSection} data-testid="cm-ws-section">
          <span aria-hidden="true">📺</span> All of {p.place.section}
        </button>
        <button type="button" className="cm-ws-btn cm-ws-cory-toggle" onClick={() => setCoryOpen((o) => !o)} aria-expanded={coryOpen} aria-controls="cm-ws-cory" data-testid="cm-ws-cory-toggle">
          <span aria-hidden="true">💬</span> Cory
        </button>
        <button type="button" className="cm-ws-btn" onClick={standUp} data-testid="cm-ws-standup">
          <span aria-hidden="true">←</span> Stand up
        </button>
      </header>
      <div className="cm-ws-body">
        <section className="cm-ws-bench" aria-label="Pinned above your desk" data-testid="cm-ws-bench">
          <div className="bl"><small>PINNED ABOVE</small><b>your desk</b></div>
          <div className="cm-ws-tickets">
          {p.bench.length === 0 && <div className="cm-ws-ticket is-active"><span className="st">ON YOUR DESK</span><b>{p.cardTitle}</b></div>}
          {p.bench.map((t) => {
            const body = <><span className="st">{t.tag}</span><b>{t.title}</b><small>{t.note}</small></>;
            const cls = `cm-ws-ticket is-${t.state}`;
            return t.route
              ? <button key={t.key} type="button" className={cls} onClick={() => navigate(t.route as string, { state: { from: p.place.sectionRoute } })} data-testid="cm-ws-ticket">{body}</button>
              : <div key={t.key} className={cls} aria-current="step" data-testid="cm-ws-ticket">{body}</div>;
          })}
          </div>
          <DeskTools here={presence?.[p.place.buildingId] ?? null} />
        </section>
        <div className="cm-ws-deskarea">
          <div className="cm-ws-monitors">
            <div className="cm-ws-mon side">
              <div className="cm-ws-bezel">{p.left}</div>
            </div>
            <div className="cm-ws-mon main">
              <div className="cm-ws-bezel"><main className={`rt-mid cm-ws-screen${p.mainClass ? ` ${p.mainClass}` : ''}`}>
                {p.heading && <div className="cm-ws-head" data-testid="cm-ws-head"><div className="k">{p.heading.kicker}</div><h2>{p.heading.title}</h2></div>}
                {p.children}
              </main></div>
            </div>
          </div>
          <WorkstationDesk nameCard={nameCardOf(facts.fullName, facts.firstName)} />
        </div>
        <div className={`cm-ws-cory${coryOpen ? ' is-open' : ''}`} id="cm-ws-cory" data-testid="cm-ws-cory">{p.mentor}</div>
      </div>
      <footer className="rt-bar cm-ws-status" data-testid="cm-ws-status">{p.status}</footer>
    </div>
  );
}
