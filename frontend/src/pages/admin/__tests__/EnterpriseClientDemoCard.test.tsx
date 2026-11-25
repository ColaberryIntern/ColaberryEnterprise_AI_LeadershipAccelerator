import React from 'react';
import { renderToStaticMarkup } from 'react-dom/server';
import EnterpriseClientDemoCard, { ClientDemo } from '../EnterpriseClientDemoCard';

const base: ClientDemo = { state: 'waiting', message: 'Plain words here.', commandCenterUrl: null, demoUrl: null, linkExpiresAt: null };
const html = (over: Partial<ClientDemo>) => renderToStaticMarkup(<EnterpriseClientDemoCard demo={{ ...base, ...over }} />);

describe('EnterpriseClientDemoCard', () => {
  it.each([
    ['no_interview', 'Waiting for the interview'],
    ['waiting', 'Not started yet'],
    ['refused', 'Not started'],
    ['planning', 'Planning'],
    ['building', 'Building'],
    ['failed', 'Failed'],
    ['unknown', 'Unknown'],
  ] as Array<[ClientDemo['state'], string]>)('%s shows "%s", the reason, and no buttons', (state, label) => {
    const h = html({ state });
    expect(h).toContain(label);
    expect(h).toContain('Plain words here.');
    expect(h).not.toContain('<a ');
  });

  it('ready shows both buttons and when the links stop working', () => {
    const h = html({ state: 'ready', commandCenterUrl: 'https://x.test/cc/', demoUrl: 'https://x.test/cc/demo/', linkExpiresAt: '2026-11-26T02:00:00Z' });
    expect(h).toContain('href="https://x.test/cc/"');
    expect(h).toContain('href="https://x.test/cc/demo/"');
    expect(h).toContain('Open Command Center');
    expect(h).toContain('Open demo');
    expect(h).toContain('rel="noopener noreferrer"');
    expect(h).toContain('Nov 25, 8:00 PM CT');
  });

  it('a Command Center without a demo shows one button', () => {
    expect(html({ state: 'ready', commandCenterUrl: 'https://x.test/cc/' })).not.toContain('Open demo');
  });

  it('renders nothing without demo data', () => {
    expect(renderToStaticMarkup(<EnterpriseClientDemoCard demo={null} />)).toBe('');
  });
});
