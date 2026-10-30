/**
 * C82 (Campus HQ H4, option A): the extra-sections editor on Community Roles. The role's own sections are checked and locked, a
 * section the signed-in admin does not hold is disabled, and saving sends the whole list.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

let mockHeld: string[] = [];
jest.mock('../../../../contexts/AuthContext', () => ({ useAuth: () => ({ canSection: (s: string) => mockHeld.includes(s) }) }));

// eslint-disable-next-line import/first
import ExtraSectionsEditor from '../ExtraSectionsEditor';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement; let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });
const box = (k: string) => container.querySelector(`[data-testid="extra-${k}"]`) as HTMLInputElement;

it('role sections are checked and locked; a section I do not hold is disabled; saving sends the whole list', () => {
  mockHeld = ['dashboard', 'campaigns', 'brands', 'internship', 'students'];
  const saved: string[][] = [];
  act(() => { root.render(<ExtraSectionsEditor name="Sarbjit" roleSections={['dashboard', 'campaigns', 'brands']} extras={[]} saving={false} onSave={(s) => saved.push(s)} />); });
  expect(box('campaigns').checked).toBe(true);
  expect(box('campaigns').disabled).toBe(true);
  expect(box('inbox_content').disabled).toBe(true); // not held by the signed-in admin
  expect((container.querySelector('[data-testid="extra-save"]') as HTMLButtonElement).disabled).toBe(true); // nothing changed yet
  act(() => { box('internship').click(); });
  act(() => { (container.querySelector('[data-testid="extra-save"]') as HTMLButtonElement).click(); });
  expect(saved).toEqual([['internship']]);
});

it('the summary says how many extras the person has', () => {
  mockHeld = [];
  act(() => { root.render(<ExtraSectionsEditor name="Sarbjit" roleSections={['dashboard']} extras={['internship', 'students']} saving={false} onSave={() => undefined} />); });
  expect(container.querySelector('summary')!.textContent).toBe('+ 2 extra sections');
  expect(box('internship').checked).toBe(true);
});
