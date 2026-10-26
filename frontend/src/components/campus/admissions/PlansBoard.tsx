import React from 'react';
import { Claim } from '../../publicV2/Claim';
import { PLAN_CARDS } from './plansModel';
import { openBookCall } from './admissionsCallApi';
import './campusBook.css';

/**
 * The Admissions room's back-wall board (C21, v6 D3): "PLANS & PRICING" as four tiles, "Compare plans →" (the plans page) and
 * "📅 Talk to a person" (the C20 booking sheet). Every price renders through <Claim> for the campus route, so a price the claims
 * registry has not approved there renders nothing; month-to-month is never on the wall (annual first).
 */
export const CAMPUS_ROUTE = '/portal/campus';
const stop = (fn: () => void) => (e: React.MouseEvent) => { e.stopPropagation(); fn(); };

export default function PlansBoard({ onSection }: { onSection: () => void }): React.ReactElement {
  return (
    <>
      <div className="k">Admissions</div>
      <h3 className="cm-plans-h" data-testid="cm-board-title">Plans &amp; pricing</h3>
      <div className="cm-plans-tiles" data-testid="cm-board-plans">
        {PLAN_CARDS.map((c) => (
          <div key={c.id} className={`t${c.featured ? ' is-featured' : ''}`} data-testid={`cm-board-plan-${c.id}`}>
            <b>{c.name}</b>
            <span className="pr">{c.priceClaim ? <Claim claimKey={c.priceClaim} route={CAMPUS_ROUTE} /> : c.priceText}</span>
            {c.unit && <small>{c.unit}</small>}
          </div>
        ))}
      </div>
      <div className="row">
        <button type="button" className="b red" onClick={stop(onSection)} data-testid="cm-board-primary">Compare plans &rarr;</button>
        <button type="button" className="b" onClick={stop(() => openBookCall())} data-testid="cm-board-talk">📅 Talk to a person</button>
        <button type="button" className="b" onClick={stop(onSection)} data-testid="cm-board-section">See all of Admissions</button>
      </div>
    </>
  );
}
