/**
 * AF2.7 item 1 — the campus Staff Office's admin rooms, under a view-as session.
 *
 * AdminLink is the second way into the Management Portal bridge (the portal sidebar is the
 * first), and it is the less obvious one: four components render it, so the rule has to live in
 * the leaf rather than in each caller.
 *
 * What makes the leak possible is `target="_blank"`. A new tab carries none of this tab's
 * sessionStorage view-as token, so it resolves the admin's OWN localStorage token and bridges as
 * the admin — successfully, silently, as the wrong person. These tests therefore assert on the
 * ANCHOR, not on the label: the thing that must not exist is a clickable new-tab link.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { VIEW_AS_TOKEN_KEY, PARTICIPANT_TOKEN_KEY } from '../../../utils/participantToken';
import { MGMT_BRIDGE_BLOCKED_REASON } from '../../../pages/portal/mgmtBridgeGate';
import AdminLink from '../AdminLink';

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

const tok = (claims: Record<string, unknown>): string => `h.${btoa(JSON.stringify(claims))}.s`;

let container: HTMLDivElement;
let root: Root;
beforeEach(() => {
  localStorage.clear();
  sessionStorage.clear();
  container = document.createElement('div');
  document.body.appendChild(container);
});
afterEach(() => { act(() => { root.unmount(); }); document.body.removeChild(container); });

async function mount(ui: React.ReactElement) {
  await act(async () => { root = createRoot(container); root.render(ui); });
}

const link = () => (
  <AdminLink label="Open the Management Portal" route="/portal/mgmt-enter" className="cm-btn" isMgmt />
);

const anchors = () => Array.from(container.querySelectorAll('a'));

describe('an admin room during a read-only view-as session', () => {
  beforeEach(() => {
    localStorage.setItem(PARTICIPANT_TOKEN_KEY, tok({ sub: 'admin-sub' }));
    sessionStorage.setItem(VIEW_AS_TOKEN_KEY, tok({ sub: 'member-sub', read_only: true }));
  });

  it('renders NO link at all, so there is nothing to click into the wrong portal', async () => {
    await mount(link());
    expect(anchors()).toEqual([]);
    expect(container.querySelector('[href]')).toBeNull();
  });

  it('says why, rather than vanishing or looking merely broken', async () => {
    await mount(link());
    const el = container.querySelector('[data-admin-blocked="view-as"]') as HTMLElement;
    expect(el).toBeTruthy();
    expect(el.getAttribute('aria-disabled')).toBe('true');
    expect(el.getAttribute('title')).toBe(MGMT_BRIDGE_BLOCKED_REASON);
    expect(el.getAttribute('aria-label')).toContain(MGMT_BRIDGE_BLOCKED_REASON);
    // The room is still named, so the page does not develop a hole where it used to be.
    expect(el.textContent).toContain('Open the Management Portal');
  });
});

/**
 * THE CONTROL, and it is the point of this file. Without it, an AdminLink that rendered a
 * disabled span unconditionally would pass every assertion above while removing the Staff Office
 * from every employee's campus.
 */
describe('the same room in the employee\'s own session', () => {
  beforeEach(() => {
    localStorage.setItem(PARTICIPANT_TOKEN_KEY, tok({ sub: 'admin-sub' }));
  });

  it('still opens the bridge in a new tab', async () => {
    await mount(link());
    const a = anchors();
    expect(a).toHaveLength(1);
    expect(a[0].getAttribute('href')).toBe('/portal/mgmt-enter');
    expect(a[0].getAttribute('target')).toBe('_blank');
    expect(container.querySelector('[data-admin-blocked]')).toBeNull();
  });

  it('and is still disabled for someone with no management access', async () => {
    await mount(
      <AdminLink label="Open the Management Portal" route="/portal/mgmt-enter" className="cm-btn" isMgmt={false} />,
    );
    expect(anchors()).toEqual([]);
    // Disabled for lack of access is NOT the view-as refusal, and must not borrow its reason.
    expect(container.querySelector('[data-admin-blocked]')).toBeNull();
  });
});
