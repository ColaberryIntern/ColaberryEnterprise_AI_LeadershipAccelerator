import React, { Suspense } from 'react';
import { act } from 'react-dom/test-utils';
import { createRoot, type Root } from 'react-dom/client';
import { MemoryRouter, Route, Routes } from 'react-router-dom';
import fs from 'fs';
import path from 'path';
import AdmissionsOpsLayout from '../AdmissionsOpsLayout';
import { admissionsOpsChildRoutes } from '../admissionsOpsRoutes';
import { SCREENS, screenHref, WORK_SECTIONS, TOOL_SECTIONS, OPS_BASE, type ScreenId } from '../screens';
import { currentScreen } from '../currentScreen';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let host: HTMLDivElement;
let root: Root;
beforeEach(() => { host = document.createElement('div'); document.body.appendChild(host); root = createRoot(host); });
afterEach(() => { act(() => root.unmount()); host.remove(); });

/** Render the route tree at a path and wait for the lazy layout to resolve. */
async function renderAt(path: string): Promise<void> {
  await act(async () => {
    root.render(
      // Keyed on the path: MemoryRouter ignores a changed initialEntries on re-render.
      <MemoryRouter key={path} initialEntries={[path]}>
        <Suspense fallback={<div data-testid="loading" />}>
          <Routes><Route path={OPS_BASE} element={<AdmissionsOpsLayout />}>{admissionsOpsChildRoutes()}</Route></Routes>
        </Suspense>
      </MemoryRouter>,
    );
  });
  for (let i = 0; i < 20 && host.querySelector('[data-testid="loading"]'); i++) {
    await act(async () => { await new Promise((r) => setTimeout(r, 10)); });
  }
}
const q = (testId: string) => host.querySelector(`[data-testid="${testId}"]`);
const sectionBar = () => host.querySelector('nav[aria-label="Admissions and Ops sections"]');
const urlFor = (id: ScreenId) => (id === 'student360' ? `${OPS_BASE}/students/sample-ref` : screenHref(id));

describe('AO1.4 the Admissions & Ops route tree', () => {
  it.each(SCREENS.map((s) => [s.id]))('resolves %s inside the layout, with the section bar', async (id) => {
    await renderAt(urlFor(id as ScreenId));
    expect(q(`ops-placeholder-${id}`)).not.toBeNull();
    expect(sectionBar()).not.toBeNull();
  });

  it('has 16 screens: 9 work sections, 4 tools and 3 opened from inside', () => {
    expect(SCREENS).toHaveLength(16);
    expect(WORK_SECTIONS.map((s) => s.title)).toEqual(['Today', 'Admissions', 'Students', 'Academics', 'Payments', 'Support', 'Communications', 'Compliance', 'Reports']);
    expect(TOOL_SECTIONS).toHaveLength(4);
    expect(SCREENS.filter((s) => s.place === 'inner').map((s) => s.id)).toEqual(['student360', 'tfcAudit', 'weeklyReport']);
  });

  it('highlights the owning section for screens opened from inside another', async () => {
    await renderAt(`${OPS_BASE}/payments/tfc-audit`);
    expect(q('ops-section-payments')?.getAttribute('aria-current')).toBe('page');
    expect(q('ops-section-today')?.getAttribute('aria-current')).toBeNull();
  });

  it('the active tab follows the URL, and only one tab is active', async () => {
    await renderAt(`${OPS_BASE}/students/abc`);
    expect(q('ops-placeholder-student360')).not.toBeNull();
    expect(q('ops-section-students')?.getAttribute('aria-current')).toBe('page');
    expect(host.querySelectorAll('[aria-current="page"]')).toHaveLength(1);
  });

  it('every screen is reachable by clicking: the rendered hrefs land on all 16 screens', async () => {
    const reached = new Set<string>();
    for (const s of SCREENS) {
      await renderAt(urlFor(s.id));
      for (const a of host.querySelectorAll('a[href]')) {
        const target = currentScreen(a.getAttribute('href') ?? '');
        if (target) reached.add(target.id);
      }
    }
    expect([...reached].sort()).toEqual(SCREENS.map((s) => s.id).sort());
  });

  it('the Student 360 cross-link opens an example record and says so', async () => {
    await renderAt(screenHref('students'));
    const a = q('ops-crosslink-student360');
    expect(a?.getAttribute('href')).toBe(`${OPS_BASE}/students/example`);
    expect(a?.textContent).toBe('Student 360 (example record)');
  });

  it('an unknown child path shows the not-found state inside the workspace', async () => {
    await renderAt(`${OPS_BASE}/nope`);
    expect(q('ops-not-found')).not.toBeNull();
    expect(sectionBar()).not.toBeNull();
  });

  it('no placeholder shows a figure of any kind', async () => {
    for (const s of SCREENS) {
      await renderAt(urlFor(s.id));
      // Screen names are not figures ("Student 360" is a name), nor is the ref this test put in the URL.
      let text = (q(`ops-placeholder-${s.id}`)?.textContent ?? '').replace(/sample-ref/g, '');
      for (const t of SCREENS.map((x) => x.title)) text = text.split(t).join('');
      expect({ id: s.id, empty: text.length === 0, digits: /\d/.test(text) }).toEqual({ id: s.id, empty: false, digits: false });
    }
  });

  it('cross-links point where the demo links', async () => {
    await renderAt(screenHref('today'));
    expect(q('ops-crosslink-tfcAudit')?.getAttribute('href')).toBe(`${OPS_BASE}/payments/tfc-audit`);
    expect(q('ops-crosslink-weeklyReport')?.getAttribute('href')).toBe(`${OPS_BASE}/reports/weekly-opportunity`);
  });
});

describe('the real admin route table wires the workspace the same way', () => {
  it('declares the layout route literally and mounts the child routes from this module', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', 'routes', 'adminRoutes.tsx'), 'utf8');
    expect(src).toContain('<Route path="/admin/admissions-ops" element={<AdmissionsOpsLayout />}>{admissionsOpsChildRoutes()}</Route>');
    expect(src.split('\n').length).toBeLessThanOrEqual(500);
  });
});

describe('currentScreen', () => {
  it('maps paths to screens, most specific first, tolerating a trailing slash', () => {
    expect(currentScreen(`${OPS_BASE}`)?.id).toBe('today');
    expect(currentScreen(`${OPS_BASE}/`)?.id).toBe('today');
    expect(currentScreen(`${OPS_BASE}/students`)?.id).toBe('students');
    expect(currentScreen(`${OPS_BASE}/students/x-1`)?.id).toBe('student360');
    expect(currentScreen(`${OPS_BASE}/reports/weekly-opportunity`)?.id).toBe('weeklyReport');
    expect(currentScreen(`${OPS_BASE}/unknown`)).toBeNull();
    expect(currentScreen('/admin/dashboard')).toBeNull();
  });
});
