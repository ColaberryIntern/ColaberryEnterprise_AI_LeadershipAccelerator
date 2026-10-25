import React from 'react';
import type { CampusAudience } from '../campusMap';
import { useCampus } from '../CampusContext';
import { openStaffCard } from '../staffCard';
import { openBookCall } from './admissionsCallApi';
import './campusBook.css';
import { isSubscribed, useAccountFacts } from './accountFacts';
import { serviceRows, type PlanAction } from './plansModel';

/**
 * The Admissions arrival card's own block (C21, v6 D3), under the tiles:
 *  1. "Sign up or change a service": the rows that apply to this viewer, each acting through a flow that already exists;
 *  2. "Maya · always here" with Message (her staff card), and Ali's ask (2026-10-23): a tour straight from Admissions, where
 *     Maya walks you around (the campus tour), and a real person on a call (the C20 booking sheet).
 * Real data only: "✓ Active" only when Settings' Subscription source says so.
 */
export function ActionButton({ a, onNavigate, testId }: { a: PlanAction; onNavigate: (to: string) => void; testId?: string }): React.ReactElement | null {
  if (!a) return null;
  if (a.kind === 'current') return <span className="cm-adm-current" data-testid={testId}>{a.label}</span>;
  if (a.kind === 'book') return <button type="button" className="cm-btn-line" onClick={() => openBookCall()} data-testid={testId}>{a.label}</button>;
  return <button type="button" className="cm-btn-line" onClick={() => onNavigate(a.to)} data-testid={testId}>{a.label}</button>;
}

export default function AdmissionsServices({ audience, onNavigate }: { audience: CampusAudience; onNavigate: (to: string) => void }): React.ReactElement {
  const { startTour } = useCampus();
  const facts = useAccountFacts(true);
  const rows = serviceRows({ audience, subscribed: facts ? isSubscribed(facts) : false });
  return (
    <div className="cm-adm" data-testid="cm-adm-services">
      <div className="cm-sec">Sign up or change a service</div>
      <ul className="cm-adm-rows">
        {rows.map((r) => (
          <li key={r.id} data-testid={`cm-adm-row-${r.id}`}>
            <span>{r.label}</span>
            <ActionButton a={r.action} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>
      <div className="cm-adm-maya" data-testid="cm-adm-maya">
        <span className="cm-sav is-maya" aria-hidden="true">MA</span>
        <span><b>Maya</b> · always here<small>Ask about plans, enrolling or the program</small></span>
        <button type="button" className="cm-btn-line" onClick={() => openStaffCard('maya')}>Message</button>
      </div>
      {audience !== 'staff' && (
        <button type="button" className="cm-btn-red cm-adm-tour" onClick={() => startTour()} data-testid="cm-adm-tour">Take the tour with Maya &rarr;</button>
      )}
    </div>
  );
}
