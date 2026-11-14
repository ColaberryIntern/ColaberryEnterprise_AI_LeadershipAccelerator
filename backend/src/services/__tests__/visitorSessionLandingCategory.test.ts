const create = jest.fn();
jest.mock('../../models', () => ({
  Visitor: { increment: jest.fn(() => Promise.resolve()) },
  VisitorSession: { create: (...a: unknown[]) => create(...a) },
  PageEvent: { findOne: jest.fn(() => Promise.resolve(null)) },
  Lead: {},
  Activity: {},
  EventLedger: {},
}));
jest.mock('../../config/env', () => ({ env: { visitorSessionTimeoutMinutes: 30 } }));

import { getOrCreateSession } from '../visitorTrackingService';

/**
 * A new session's `landing_page_category` must use the same brand map as the events in it.
 * It was computed without the brand, so a brand site's landing page used Colaberry's map:
 * on production on 2026-11-13 every one of 283 sessions that landed on a Hire profile was
 * `other`, even where its events were categorised.
 */
beforeEach(() => {
  create.mockReset();
  create.mockResolvedValue({ id: 'session-1' });
});

const landing = (): string => create.mock.calls[0][0].landing_page_category;

it('categorises the landing page under the resolved brand', async () => {
  await getOrCreateSession('visitor-1', {
    page_url: 'https://hire.refactored.ai/talent/ann-lee/',
    brand_slug: 'refactored',
  });
  expect(landing()).toBe('case_studies');
});

it('a booking landing is contact, not a profile view', async () => {
  await getOrCreateSession('visitor-1', {
    page_url: 'https://hire.refactored.ai/talent/ann-lee/schedule/?utm_source=x',
    brand_slug: 'refactored',
  });
  expect(landing()).toBe('contact');
});

it('with no brand resolved, the legacy map answers exactly as before', async () => {
  await getOrCreateSession('visitor-1', { page_url: 'https://enterprise.colaberry.ai/stories/x' });
  expect(landing()).toBe('case_studies');
  create.mockClear();
  await getOrCreateSession('visitor-1', { page_url: 'https://hire.refactored.ai/talent/ann-lee/', brand_slug: null });
  expect(landing()).toBe('other');
});
