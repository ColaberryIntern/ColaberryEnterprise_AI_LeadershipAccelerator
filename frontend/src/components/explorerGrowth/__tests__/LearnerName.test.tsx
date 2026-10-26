/**
 * Every learner in Explorer Growth links to their 360 (Explorer tab), and the orange GHL icon opens their contact in GoHighLevel, only
 * when the server resolved a URL (2026-10-26). Clicking either never opens the row's drawer.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import LearnerName from '../LearnerName';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
const ID = '0b3a5c1e-2d4f-4a6b-8c9d-0e1f2a3b4c5d';
const GHL = 'https://app.gohighlevel.com/v2/location/LOC12345/contacts/detail/CONTACT123';
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const show = (el: React.ReactElement) => act(() => { root.render(<MemoryRouter>{el}</MemoryRouter>); });

it('the name opens the 360 on its Explorer tab, and the icon opens GHL in a new tab', () => {
  show(<LearnerName enrollmentId={ID} email="pat@example.com" name="Pat Lee" ghlUrl={GHL} />);
  const links = Array.from(container.querySelectorAll('a'));
  expect(links[0].textContent).toBe('Pat Lee');
  expect(links[0].getAttribute('href')).toBe('/admin/people/pat%40example.com?tab=explorer');
  const ghl = container.querySelector('[data-testid="eg-ghl-link"]')!;
  expect(ghl.getAttribute('href')).toBe(GHL);
  expect(ghl.getAttribute('target')).toBe('_blank');
  expect(ghl.getAttribute('aria-label')).toBe('Open this contact in GoHighLevel');
});

it('no email: the 360 link uses the enrollment; no GHL URL: no icon', () => {
  show(<LearnerName enrollmentId={ID} email={null} name="Pat Lee" ghlUrl={null} />);
  expect(container.querySelector('a')!.getAttribute('href')).toBe(`/admin/people/${encodeURIComponent(`enrollment:${ID}`)}?tab=explorer`);
  expect(container.querySelector('[data-testid="eg-ghl-link"]')).toBeNull();
});

it('clicking either link does not reach the row (no drawer)', () => {
  const onRow = jest.fn();
  act(() => { root.render(<MemoryRouter><div onClick={onRow}><LearnerName enrollmentId={ID} email="pat@example.com" ghlUrl={GHL} /></div></MemoryRouter>); });
  act(() => { (container.querySelector('[data-testid="eg-ghl-link"]') as HTMLAnchorElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
  act(() => { (container.querySelector('a') as HTMLAnchorElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true })); });
  expect(onRow).not.toHaveBeenCalled();
});
