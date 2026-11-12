import React from 'react';
import HireStudio from '../HireStudio';
import * as api from '../../../../../services/hireStudioApi';
import * as listing from '../../../../../services/hireListingApi';
import * as H from '../../../../admin/__fixtures__/domHarness';
import type { CareerProfile } from '../../../../../services/careerApi';

/**
 * "My Hire profile": the strength meter and checklist counts, the menu badges, one section
 * failing without taking the studio down, and the request inbox (accept / decline / suggest).
 */
jest.mock('../../../../../services/hireStudioApi', () => ({
  ...jest.requireActual('../../../../../services/hireStudioApi'),
  fetchHireIntro: jest.fn(), fetchAvailability: jest.fn(), fetchCaseStudyOrder: jest.fn(), fetchHireInterviews: jest.fn(),
  actOnHireInterview: jest.fn(), saveHireIntro: jest.fn(), saveAvailability: jest.fn(), saveCaseStudyOrder: jest.fn(),
}));
jest.mock('../../../../../services/hireListingApi');
const m = api as jest.Mocked<typeof api>;

const PROFILE = { identity: { full_name: 'Kesetebirhan Delele', linkedin_url: null, avatar_data_url: null, resume: null } } as unknown as CareerProfile;
const REQ: api.HireInterview = {
  id: 'iv1', format: 'walkthrough', caseStudySlug: 'case-a', startsAt: '2026-11-16T15:00:00.000Z', minutes: 45, status: 'requested',
  employer: { name: 'Jane Roe', company: 'Acme', role: 'CTO', message: 'Loved the inbox one' }, extraInterviewers: 0, recordRequested: false, roomUrl: null, createdAt: '2026-11-12T00:00:00Z',
};
const AVAIL: api.InterviewAvailability = { enabled: true, tz: 'America/Chicago', blocks: ['Mon-morning', 'Wed-afternoon'], formats: ['intro'], maxPerWeek: 5, minNoticeHours: 24, autoConfirm: false };

beforeEach(() => {
  m.fetchHireIntro.mockResolvedValue({ headlineDraft: null, answers: [], roles: [], setups: [], location: null, earliestStart: null, workAuth: null, video: null });
  m.fetchAvailability.mockResolvedValue(AVAIL);
  m.fetchCaseStudyOrder.mockResolvedValue({ slugs: [], cases: [{ slug: 'case-a', title: 'A', coverImageUrl: null }], talentSlug: 'kesetebirhan-delele' });
  m.fetchHireInterviews.mockResolvedValue([REQ]);
  (listing.fetchHireListingSettings as jest.Mock).mockResolvedValue({ availability: null, spotlight: false });
});
afterEach(() => { H.unmount(); jest.clearAllMocks(); });

async function render(onJumpTab = jest.fn()): Promise<jest.Mock> {
  H.mount(<HireStudio profile={PROFILE} onJumpTab={onJumpTab} />, '/');
  await H.settle();
  return onJumpTab;
}

it('greets by first name, links the public profile, and counts strength from the checklist', async () => {
  await render();
  expect(H.text()).toContain('Hi Kesetebirhan. Let employers hear it from you.');
  expect(H.el('hs-preview').getAttribute('href')).toBe('https://hire.refactored.ai/talent/kesetebirhan-delele/');
  // Published case study + interview times = 2 of 7.
  expect(H.el('hs-strength').getAttribute('aria-valuenow')).toBe('2');
  expect(H.el('hs-check-case').className).toBe('done');
  expect(H.el('hs-check-about').className).toBe('');
});

it('badges the menu: requests in gold, open blocks, to-dos and the case-study count', async () => {
  await render();
  expect(H.el('hs-menu-overview').textContent).toContain('1 request');
  expect(H.el('hs-menu-times').textContent).toContain('2 open');
  expect(H.el('hs-menu-about').textContent).toContain('to do');
  expect(H.el('hs-menu-cases').textContent).toContain('1');
});

it('jumps from a checklist item to its section, and to Publishing for the case study', async () => {
  m.fetchCaseStudyOrder.mockResolvedValue({ slugs: [], cases: [], talentSlug: null });
  const jumpTab = await render();
  expect(H.query('hs-preview')).toBeNull(); // nothing on Hire yet, nothing to preview
  H.click('hs-check-go-about');
  expect(H.query('hs-about')).not.toBeNull();
  H.click('hs-menu-overview');
  H.click('hs-check-go-case');
  expect(jumpTab).toHaveBeenCalledWith('publishing');
});

it('shows a request in the candidate\'s zone, and accepting it marks it confirmed', async () => {
  m.actOnHireInterview.mockResolvedValue({ ...REQ, status: 'confirmed' });
  await render();
  expect(H.el('hs-req-iv1').textContent).toContain('Case study walkthrough · 45 min · Mon, Nov 16 · 9:00 AM CT · “A”');
  H.click('hs-accept');
  await H.settle();
  expect(m.actOnHireInterview).toHaveBeenCalledWith('iv1', 'confirm', undefined);
  expect(H.query('hs-confirmed')).not.toBeNull();
  expect(H.el('hs-menu-overview').textContent).not.toContain('request');
});

it('declines, and suggests a time read in the candidate\'s zone', async () => {
  m.actOnHireInterview.mockResolvedValue({ ...REQ, status: 'rescheduled' });
  await render();
  H.click('hs-suggest');
  H.click('hs-suggest-send');
  expect(H.text()).toContain('Pick a date and time first.');
  H.setValue('hs-suggest-when', '2026-11-18T10:30');
  H.click('hs-suggest-send');
  await H.settle();
  expect(m.actOnHireInterview).toHaveBeenCalledWith('iv1', 'propose', '2026-11-18T16:30:00.000Z');
  expect(H.text()).toContain('New time suggested');
});

it('says so, with a retry, when requests cannot be read, and the rest still works', async () => {
  m.fetchHireInterviews.mockRejectedValue(new Error('500'));
  await render();
  expect(H.text()).toContain('We couldn’t load your interview requests');
  expect(H.query('hs-check-case')).not.toBeNull();
});
