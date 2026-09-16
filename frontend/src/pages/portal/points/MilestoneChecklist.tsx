import React from 'react';
import { Link } from 'react-router-dom';
import type { MilestoneLens } from '../../../services/onboardingApi';
import { milestoneRows, milestonesHeld, PROJECT_SLOTS } from './milestoneRows';
import { rungTone } from '../../../services/onboardingApi';
import '../../../styles/rungTones.css';

/**
 * MilestoneChecklist — lens 2 on the Points tab once the milestone ladder is
 * on (docs/POINTS_LADDER_DECISIONS.md, D7: this replaces Skill XP in position
 * two; XP moves below it). Leads with "N of 4", then the five rows a student
 * can act on. Every unfinished row is a link to the place the work happens.
 */

const Mark: React.FC<{ state: 'done' | 'progress' | 'todo' }> = ({ state }) => (
  <span className={`pts-ms-mark is-${state}`} aria-hidden="true">
    {state === 'done'
      ? <svg viewBox="0 0 24 24" fill="none"><path d="M5 12l4 4L19 6" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round" /></svg>
      : state === 'progress'
        ? <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2.5" /><path d="M12 4a8 8 0 0 1 8 8h-8z" fill="currentColor" /></svg>
        : <svg viewBox="0 0 24 24" fill="none"><circle cx="12" cy="12" r="8" stroke="currentColor" strokeWidth="2.5" /></svg>}
  </span>
);

const MilestoneChecklist: React.FC<{ milestones: MilestoneLens }> = ({ milestones }) => {
  const held = milestonesHeld(milestones);
  const rows = milestoneRows(milestones);
  const rung = milestones.rung_name || 'Not building yet';
  const headline = milestones.at_max
    ? 'Top of the ladder'
    : milestones.next_rung_name
      ? `Next: ${milestones.next_rung_name}`
      : '';
  return (
    <>
      <div className="pts-big">{held}<span> of {PROJECT_SLOTS + 1} milestones</span></div>
      <div className="pts-levelrow">
        <span className={`pts-chip${milestones.rung_name ? ` rung-pill rung-${rungTone(milestones.rung_name)}` : ''}`}>{rung}</span>
        {headline && <span className="pts-mut">{headline}</span>}
      </div>
      <ol className="pts-ms-list" aria-label="Program milestones">
        {rows.map((r) => {
          const body = (
            <>
              <Mark state={r.state} />
              <span className="pts-ms-text">
                <span className="pts-ms-label">{r.label}</span>
                <span className="pts-ms-detail">{r.detail}</span>
              </span>
            </>
          );
          return (
            <li key={r.key} className={`pts-ms-row is-${r.state}`}>
              {r.to ? <Link to={r.to} className="pts-ms-link">{body}</Link> : <span className="pts-ms-link">{body}</span>}
            </li>
          );
        })}
      </ol>
      <div className="pts-mut">Curriculum and three verified builds make you a Program Graduate; an approved certification makes you an AI Architect.</div>
    </>
  );
};

export default MilestoneChecklist;
