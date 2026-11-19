/**
 * OH1k: one front door. The controls card links the Open House countdown event rule to its campaign,
 * shows every switch, and never shows an unreadable value as "off".
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import { ControlsBody } from '../ControlsCard';
import type { ExplorerControls } from '../../../services/explorerGrowthApi';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

const base: ExplorerControls = {
  killSwitch: { active: false, readable: true },
  countdown: { campaignId: 'c1', status: 'active', adminUrl: '/admin/campaigns/c1', readable: true },
  switches: { explorerGrowthSend: false, mayaEmailAutoReply: false, ghlMirror: false, voiceCalls: false, openHouseAgentConfigured: false },
  shelves: { ai_fact: { servable: 0, draft: 2 }, build_prompt: { servable: 1, draft: 3 } },
};

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

function show(c: ExplorerControls) {
  act(() => root.render(<MemoryRouter><ControlsBody c={c} /></MemoryRouter>));
  return host;
}
const count = (el: HTMLElement, text: string) => Array.from(el.querySelectorAll('span')).filter((s) => s.textContent === text).length;

describe('ControlsBody (OH1k: one front door)', () => {
  it('links the Open House countdown event rule to its campaign and shows every switch off', () => {
    const el = show(base);
    const link = Array.from(el.querySelectorAll('a')).find((a) => /open its campaign/i.test(a.textContent || ''));
    expect(link?.getAttribute('href')).toBe('/admin/campaigns/c1');
    expect(count(el, 'off')).toBe(5); // kill switch + four switches (OH1o added Explorer Growth sending)
    expect(el.textContent).toContain('build prompt 1 live, 3 awaiting approval');
    expect(el.textContent).toContain('Explorer Growth sends as Maya (after your approval)');
  });
  it('OH1o: an older server without the Explorer send switch shows it unreadable, never off', () => {
    const { explorerGrowthSend, ...older } = base.switches;
    void explorerGrowthSend;
    const el = show({ ...base, switches: older });
    expect(count(el, 'unreadable')).toBe(1);
  });
  it('never shows an unreadable value as off', () => {
    const el = show({ ...base, killSwitch: { active: null, readable: false }, switches: { ...base.switches, ghlMirror: null } });
    expect(count(el, 'unreadable')).toBe(2);
  });
  it('flags a switch that is on', () => {
    const el = show({ ...base, switches: { ...base.switches, mayaEmailAutoReply: true } });
    expect(count(el, 'ON')).toBe(1);
  });
});
