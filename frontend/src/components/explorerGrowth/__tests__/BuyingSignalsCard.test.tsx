import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import BuyingSignalsCard from '../BuyingSignalsCard';
import type { BuyingSignals } from '../../../services/explorerGrowthApi';

/**
 * C100: the learner drawer's buying signals. The assertion that matters is distinguishability: a signal that was
 * found, one that was looked for and not found, and one that could not be read must each render differently.
 */

const html = (s: BuyingSignals) => renderToStaticMarkup(<BuyingSignalsCard signals={s} />);
const cell = (markup: string, id: string) => {
  const m = markup.match(new RegExp(`data-testid="${id}">([\\s\\S]*?)</td>`));
  return m ? m[1].replace(/<[^>]+>/g, '') : '';
};

const NONE: BuyingSignals = {
  checkout_abandoned: { count: 0, last_at: null, plans: [] },
  enroll_link_click: { count: 0, last_at: null },
  unavailable: [],
};

describe('BuyingSignalsCard', () => {
  it('shows counts, the latest time in Central, and the plan of an abandoned checkout', () => {
    const m = html({
      checkout_abandoned: { count: 1, last_at: '2026-10-28T05:40:00.000Z', plans: ['annual'] },
      enroll_link_click: { count: 3, last_at: '2026-10-28T05:31:00.000Z' },
      unavailable: [],
    });
    expect(cell(m, 'buying-abandoned-checkout')).toBe('1, last Oct 28, 2026, 12:40 AM CT (annual plan)');
    expect(cell(m, 'buying-enroll-link-clicks')).toBe('3, last Oct 28, 2026, 12:31 AM CT');
  });

  it('nothing found reads "none"', () => {
    const m = html(NONE);
    expect(cell(m, 'buying-abandoned-checkout')).toBe('none');
    expect(cell(m, 'buying-enroll-link-clicks')).toBe('none');
  });

  it('a source that could not be read says so, and is never shown as "none"', () => {
    const m = html({ ...NONE, unavailable: ['enroll_link_click'] });
    expect(cell(m, 'buying-enroll-link-clicks')).toBe('could not be read');
    expect(cell(m, 'buying-abandoned-checkout')).toBe('none');
  });
});
