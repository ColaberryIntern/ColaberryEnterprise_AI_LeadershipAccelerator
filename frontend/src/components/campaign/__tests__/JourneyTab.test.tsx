import fs from 'fs';
import path from 'path';
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

/**
 * The Journey tab REUSES the existing journey component and passes it the campaign scope.
 *
 * Two assertions, and they are different kinds:
 *
 *   1. STRUCTURAL - the tab imports OutreachJourneyFlow from its existing location and defines
 *      no journey rendering of its own. Checked against the source, because a reimplementation
 *      would pass every behavioural test while being exactly the duplicate the plan forbids.
 *
 *   2. BEHAVIOURAL - the campaign id the tab receives is the one the journey component gets.
 *      The component is mocked so the assertion is about the handoff, not about the Sankey.
 */

// `mock` prefix: jest only lets a hoisted mock factory reference variables named that way.
const mockReceived: Array<Record<string, unknown>> = [];

jest.mock('../../admin/campaigns/journey/OutreachJourneyFlow', () => ({
  __esModule: true,
  default: (props: Record<string, unknown>) => {
    mockReceived.push(props);
    // Required inside the factory: the hoisted mock cannot see the file-level React import.
    const R = require('react');
    return R.createElement('div', { 'data-testid': 'journey-mock' }, 'journey');
  },
}));

import JourneyTab from '../JourneyTab';

describe('JourneyTab is a reuse, not a reimplementation', () => {
  const src = fs.readFileSync(path.join(__dirname, '..', 'JourneyTab.tsx'), 'utf8');

  it('imports the existing OutreachJourneyFlow', () => {
    expect(src).toMatch(/from '\.\.\/admin\/campaigns\/journey\/OutreachJourneyFlow'/);
  });

  it('defines no journey rendering of its own', () => {
    // If any of these appear, someone has started rebuilding the Sankey in this file. The
    // journey module owns them; this tab does not get to.
    for (const forbidden of ['JourneySankeyChart', 'sankey', 'd3', 'buildGraphFromPaths', 'getCampaignGraph(']) {
      expect(src).not.toContain(forbidden);
    }
  });

  it('is small - a shell, not a surface', () => {
    // A tab that grows past this has started to do the journey component's job.
    const codeLines = src.split('\n').filter((l) => l.trim() && !l.trim().startsWith('*') && !l.trim().startsWith('/*') && !l.trim().startsWith('//'));
    expect(codeLines.length).toBeLessThan(15);
  });
});

describe('JourneyTab passes the campaign scope through', () => {
  let container: HTMLDivElement;
  let root: Root;

  beforeEach(() => {
    mockReceived.length = 0;
    container = document.createElement('div');
    document.body.appendChild(container);
    root = createRoot(container);
  });

  afterEach(() => {
    act(() => { root.unmount(); });
    container.remove();
  });

  it('hands the journey component the exact campaign id it was given', () => {
    act(() => { root.render(<JourneyTab campaignId="c0000000-0000-4000-8000-0000000000aa" />); });
    expect(mockReceived).toHaveLength(1);
    expect(mockReceived[0].campaignId).toBe('c0000000-0000-4000-8000-0000000000aa');
  });

  it('renders the journey component rather than something of its own', () => {
    act(() => { root.render(<JourneyTab campaignId="c0000000-0000-4000-8000-0000000000aa" />); });
    expect(container.querySelector('[data-testid="journey-mock"]')).not.toBeNull();
  });
});
