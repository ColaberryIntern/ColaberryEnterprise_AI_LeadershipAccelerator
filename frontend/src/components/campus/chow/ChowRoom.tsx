import React from 'react';
import { CRAVINGS, DEFAULT_CRAVING, foodLead, mealAt } from './deliveryApps';
import { openOrderSheet } from './OrderSheet';
import type { Condition } from '../weather/weatherModel';
import './chow.css';

/**
 * Chow Hall's walls (Campus v11 C2). The back-wall screen asks "WHAT ARE YOU CRAVING?" over a 4 x 2 grid of craving tiles (a tile
 * opens the order sheet with that craving) and an "Order food ↗" button; the left wall's chalkboard, "TODAY'S CRAVINGS", is the
 * room's one card: the meal-time lead line (foodLead, from the window's weather) and the craving for this time of day. Every action
 * opens the order sheet; nothing here takes an order.
 */
export function CravingScreen({ now, condition }: { now: Date; condition: Condition | null }): React.ReactElement {
  return (
    <div className="cm-crave" data-testid="cm-crave-screen">
      <div className="t">WHAT ARE YOU CRAVING?</div>
      <div className="cm-crave-grid">
        {CRAVINGS.map((c) => (
          <button key={c.id} type="button" onClick={() => openOrderSheet(c.id)} title={c.label} data-testid={`cm-crave-tile-${c.id}`}>{c.emoji} {c.label}</button>
        ))}
      </div>
      <small>{foodLead(now, condition)}</small>
      <button type="button" className="cm-btn-red" onClick={() => openOrderSheet()} data-testid="cm-crave-order">Order food ↗</button>
    </div>
  );
}

export function Chalkboard({ now, condition }: { now: Date; condition: Condition | null }): React.ReactElement {
  const pick = CRAVINGS.find((c) => c.id === DEFAULT_CRAVING[mealAt(now)]) ?? CRAVINGS[0];
  return (
    <button type="button" className="cm-chalk" onClick={() => openOrderSheet(pick.id)} data-testid="cm-chalkboard">
      <span className="t">TODAY&rsquo;S CRAVINGS</span>
      <span>{foodLead(now, condition)}</span>
      <span>{pick.emoji} {pick.label} &rarr;</span>
    </button>
  );
}
