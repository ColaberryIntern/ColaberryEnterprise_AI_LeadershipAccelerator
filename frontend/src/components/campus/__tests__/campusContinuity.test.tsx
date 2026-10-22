/**
 * WP-1 continuity in the campus state: ending a tour early pauses it at that stop (Resume picks it up), finishing it marks it taken,
 * both saved per account; the building you are at survives a remount (a page visit), so you never restart at the gate; a map request
 * carries how to arrive (walk, or stand inside after Step outside) and is acknowledged without ending a tour.
 */
import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';

jest.mock('../campusApi', () => ({ fetchCampusFlags: () => Promise.resolve({ campus: true }), CAMPUS_FLAGS_TIMEOUT_MS: 10000,
  fetchCampusPresence: () => Promise.resolve({}), postCampusHere: () => Promise.resolve(), isReadOnlySession: () => false }));
jest.mock('../campusPeopleApi', () => ({ fetchStaffDesks: () => Promise.resolve([]), fetchConversationsQuiet: () => Promise.resolve([]), postWave: () => Promise.resolve({ sent: true, reason: 'sent' }) }));

// eslint-disable-next-line import/first
import { CampusProvider, useCampus, tourKey, HERE_KEY } from '../CampusContext';

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let campus: ReturnType<typeof useCampus>;
function Grab(): null { campus = useCampus(); return null; }
let container: HTMLDivElement;
let root: Root;
const mount = () => act(() => { root = createRoot(container); root.render(<CampusProvider><Grab /></CampusProvider>); });
beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); });
afterEach(() => { act(() => root.unmount()); container.remove(); window.localStorage.clear(); window.sessionStorage.clear(); });

describe('the tour remembers where you stopped', () => {
  it('End tour at stop 4 pauses there (saved); Resume starts at stop 4', () => {
    mount();
    act(() => campus.startTour());
    act(() => campus.setTourIndex(3));
    act(() => campus.endTour());
    expect(campus.tourIndex).toBeNull();
    expect(campus.tourProgress).toEqual({ paused: 3, toured: false });
    expect(JSON.parse(window.localStorage.getItem(tourKey())!)).toEqual({ paused: 3, toured: false });
    act(() => campus.resumeTour(campus.tourProgress.paused!));
    expect(campus.tourIndex).toBe(3);
    expect(campus.layer).toBe('map');
  });

  it('finishing marks it taken and clears the pause; a new provider (a reload) still knows', () => {
    mount();
    act(() => campus.startTour());
    act(() => campus.finishTour());
    expect(campus.tourProgress).toEqual({ paused: null, toured: true });
    act(() => root.unmount());
    mount();
    expect(campus.tourProgress).toEqual({ paused: null, toured: true });
  });

  it('closing the layers mid-tour pauses it rather than forgetting it', () => {
    mount();
    act(() => campus.startTour());
    act(() => campus.setTourIndex(5));
    act(() => campus.closeLayer());
    expect(campus.tourProgress.paused).toBe(5);
  });
});

describe('where you are survives a page visit', () => {
  it('setHere is kept for the browser session and read back by a new provider', () => {
    mount();
    act(() => campus.setHere('library'));
    expect(window.sessionStorage.getItem(HERE_KEY)).toBe('library');
    act(() => root.unmount());
    mount();
    expect(campus.here).toBe('library');
  });
});

describe('map requests', () => {
  it('carry how to arrive; ackMap clears the request but keeps a running tour', () => {
    mount();
    act(() => campus.openMap('commons', 'inside'));
    expect([campus.layer, campus.mapFocus, campus.mapHow]).toEqual(['map', 'commons', 'inside']);
    act(() => campus.ackMap());
    expect([campus.layer, campus.mapFocus]).toEqual(['none', null]);
    act(() => campus.startTour());
    act(() => campus.ackMap());
    expect(campus.tourIndex).toBe(0);
  });
});
