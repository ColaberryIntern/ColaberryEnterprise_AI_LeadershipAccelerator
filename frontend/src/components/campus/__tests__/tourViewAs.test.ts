/**
 * Ali, 2026-10-26: viewing a learner who had never had the campus showed "Tour in progress, stop 5 of 8": tour progress lives in the
 * browser, so a staff member's own earlier tour leaked into the learner's view. While "Viewing as" (a tab-scoped session), progress
 * lives in sessionStorage: this browser's tours are not shown, and what is clicked there is not kept.
 */
import { readTour, tourKey } from '../useCampusTour';
import { VIEW_AS_TOKEN_KEY } from '../../../utils/participantToken';

const PAUSED = { paused: 4, toured: false, pausedAt: Date.now() };
afterEach(() => { window.localStorage.clear(); window.sessionStorage.clear(); });

it('normally the tour progress is this browser\'s own', () => {
  window.localStorage.setItem(tourKey(), JSON.stringify(PAUSED));
  expect(readTour().paused).toBe(4);
});

it('while viewing as a learner, this browser\'s tours are not shown, and the view-as session keeps its own', () => {
  window.localStorage.setItem(tourKey(), JSON.stringify(PAUSED));
  window.sessionStorage.setItem(VIEW_AS_TOKEN_KEY, 'x.e30.y'); // a token with an empty payload
  expect(readTour()).toEqual({ paused: null, toured: false });
  window.sessionStorage.setItem(tourKey(), JSON.stringify({ ...PAUSED, paused: 1 }));
  expect(readTour().paused).toBe(1);
  expect(JSON.parse(window.localStorage.getItem(tourKey())!).paused).toBe(4); // the browser's own is untouched
});
