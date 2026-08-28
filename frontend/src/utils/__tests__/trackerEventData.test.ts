/**
 * `trackEvent` must send `event_data` where the ingest reads it (T019 AC3,
 * defect D-2).
 *
 * THE BUG. `push()` spread the caller's properties at the TOP LEVEL of the
 * request body. The ingest reads `req.body.event_data` for a single event and
 * `event.event_data` for each element of a batch. Nothing ever built that key -
 * `grep event_data frontend/src` returned zero hits before this change - so
 * `page_events.event_data` was written null for every client event ever
 * recorded, and every consumer of the column silently took its fallback branch.
 * It never threw and it never logged; it just quietly produced a table with a
 * permanently empty column.
 *
 * These tests assert on the REQUEST BODY, because that is the boundary the bug
 * lived at. Asserting that `trackEvent` was called with the right arguments
 * would have passed for the entire life of the defect.
 */

// Create React App's jest config sets `resetMocks: true`, which strips the
// implementation off every mock before each test. The implementation is
// therefore re-installed in `beforeEach` rather than at construction, or
// `fetch()` returns undefined and the tracker's `.catch` throws.
const fetchMock = jest.fn();

function lastRequestBody(): any {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as unknown as [string, RequestInit];
  return JSON.parse(call[1].body as string);
}

function lastRequestUrl(): string {
  const call = fetchMock.mock.calls[fetchMock.mock.calls.length - 1] as unknown as [string, RequestInit];
  return call[0];
}

async function loadTracker() {
  jest.resetModules();
  return import('../tracker');
}

beforeEach(() => {
  jest.useFakeTimers();
  fetchMock.mockReset();
  fetchMock.mockImplementation(() => Promise.resolve({ ok: true }));
  (global as any).fetch = fetchMock;
  localStorage.clear();
});

afterEach(() => {
  jest.useRealTimers();
});

describe('single-event flush -> /api/t/event (AC3)', () => {
  it('puts the caller payload in event_data, populated', async () => {
    const { initTracker, trackEvent } = await loadTracker();
    initTracker();
    // Drain the automatic pageview so the next flush carries exactly one event,
    // which is what routes it to the single-event endpoint.
    jest.advanceTimersByTime(5000);
    fetchMock.mockClear();

    trackEvent('case_study_view', { slug: 'claims-triage-copilot', industry: 'Insurance', result_count: 4 });
    jest.advanceTimersByTime(5000);

    expect(lastRequestUrl()).toContain('/api/t/event');
    const body = lastRequestBody();
    expect(body.event_data).toBeDefined();
    expect(Object.keys(body.event_data).length).toBeGreaterThan(0);
    expect(body.event_data).toEqual({
      slug: 'claims-triage-copilot',
      industry: 'Insurance',
      result_count: 4,
    });
  });

  it('still sends the fields the ingest reads from the body root', async () => {
    // The top-level spread is kept on purpose: campaign_id, timestamp,
    // site_slug and the browser fields are destructured from the root.
    const { initTracker, trackEvent } = await loadTracker();
    initTracker();
    jest.advanceTimersByTime(5000);
    fetchMock.mockClear();

    trackEvent('case_study_share', { slug: 'a', channel: 'linkedin' });
    jest.advanceTimersByTime(5000);

    const body = lastRequestBody();
    expect(body.event_type).toBe('case_study_share');
    expect(body.page_path).toBeDefined();
    expect(body.page_url).toBeDefined();
    expect(body.fingerprint).toBeTruthy();
    expect(body.channel).toBe('linkedin');
  });

  it('omits event_data entirely for a payload-free event rather than sending {}', async () => {
    // `recordPageEvent` stores `event_data || null`. An empty object would write
    // `{}` where every historical row holds NULL and would read as truthy.
    const { initTracker, trackEvent } = await loadTracker();
    initTracker();
    jest.advanceTimersByTime(5000);
    fetchMock.mockClear();

    trackEvent('case_study_view');
    jest.advanceTimersByTime(5000);

    expect(lastRequestBody()).not.toHaveProperty('event_data');
  });
});

describe('batched flush -> /api/t/batch (AC3)', () => {
  it('gives every element its own populated event_data', async () => {
    const { initTracker, trackEvent } = await loadTracker();
    initTracker();
    jest.advanceTimersByTime(5000);
    fetchMock.mockClear();

    trackEvent('case_study_view', { slug: 'a' });
    trackEvent('case_study_cta_click', { slug: 'a', cta: 'enterprise' });
    jest.advanceTimersByTime(5000);

    expect(lastRequestUrl()).toContain('/api/t/batch');
    const body = lastRequestBody();
    expect(body.events).toHaveLength(2);
    expect(body.events[0].event_data).toEqual({ slug: 'a' });
    expect(body.events[1].event_data).toEqual({ slug: 'a', cta: 'enterprise' });
  });
});

describe('attribution is not leaked into event_data', () => {
  it('campaign_id stays at the body root where the ingest reads it', async () => {
    localStorage.setItem(
      'cb_campaign_id',
      JSON.stringify({ campaignId: 'camp-1', storedAt: new Date().toISOString() }),
    );

    const { initTracker, trackEvent } = await loadTracker();
    initTracker();
    jest.advanceTimersByTime(5000);
    fetchMock.mockClear();

    trackEvent('case_study_view', { slug: 'a' });
    jest.advanceTimersByTime(5000);

    const body = lastRequestBody();
    expect(body.campaign_id).toBe('camp-1');
    // event_data is a snapshot of what the CALL SITE passed, so a reader of the
    // column sees the component's payload and not the tracker's bookkeeping.
    expect(body.event_data).toEqual({ slug: 'a' });
  });
});

describe('scroll depth reaches both server consumers', () => {
  it('emits depth and depth_percent for the same threshold', async () => {
    const { initTracker } = await loadTracker();
    initTracker();
    jest.advanceTimersByTime(5000);
    fetchMock.mockClear();

    // jsdom reports zero-height documents, so drive the handler through a real
    // scrollable geometry rather than faking the event payload.
    Object.defineProperty(document.documentElement, 'scrollHeight', { value: 2000, configurable: true });
    Object.defineProperty(document.documentElement, 'clientHeight', { value: 1000, configurable: true });
    Object.defineProperty(window, 'scrollY', { value: 1000, configurable: true });
    window.dispatchEvent(new Event('scroll'));
    jest.advanceTimersByTime(5000);

    const body = lastRequestBody();
    const events = body.events ?? [body];
    const scroll = events.find((e: any) => e.event_type === 'scroll');
    expect(scroll).toBeDefined();
    // behavioralSignalService reads depth_percent for the >= 75 test behind the
    // strength-20 deep_scroll_case_study signal; journeyTimelineService reads
    // depth for the timeline label. Both are now populated.
    expect(scroll.event_data.depth).toBe(scroll.event_data.depth_percent);
    expect(scroll.event_data.depth_percent).toBeGreaterThanOrEqual(25);
  });
});
