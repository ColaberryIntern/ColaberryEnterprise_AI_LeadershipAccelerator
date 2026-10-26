/**
 * C48 (Ali, 2026-10-25): "the right pane should show the continuation of the tour at the top ... We should not have to make them scroll
 * down to the bottom." In the arrival card the tour's Next / Back follow the stop card at the top, before the ways in, the main
 * action, the rooms and the building's own rows.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import { MemoryRouter } from 'react-router-dom';
import BuildingCard from '../BuildingCard';
import { CAMPUS_BUILDINGS } from '../campusMap';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); });

it('the tour controls sit right under the tour stop, above everything else in the card', () => {
  const lecture = CAMPUS_BUILDINGS.find((x) => x.id === 'lecture')!;
  act(() => {
    root.render(<MemoryRouter><BuildingCard building={lecture} access="open" workplaceNames={false} onClose={() => undefined} onNavigate={() => undefined}
      tourTop={<div data-testid="t-stop" />} tourNav={<div data-testid="t-nav" />} ways={<div data-testid="t-ways" />} children={<div data-testid="t-rows" />} /></MemoryRouter>);
  });
  const order = Array.from(container.querySelectorAll('[data-testid^="t-"], .cm-rooms')).map((el) => el.getAttribute('data-testid') ?? 'rooms');
  expect(order).toEqual(['t-stop', 't-nav', 't-ways', 'rooms', 't-rows']);
});
