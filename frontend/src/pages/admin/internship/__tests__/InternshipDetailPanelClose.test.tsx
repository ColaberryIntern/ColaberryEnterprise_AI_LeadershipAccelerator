import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import InternshipDetailPanel from '../InternshipDetailPanel';
import { ReviewProvider, ReviewApi } from '../reviewContext';
import { ApplicationDetail } from '../../../../services/adminInternshipApi';

/**
 * Closing an open applicant.
 *
 * Ali, 2026-09-28: "Once i've selected an applicant, I want the opp to close it
 * out and go back to default screen." The control existed but `.aint-back` is
 * `display:none` above 960px, so on a desktop there was no way out of an open
 * file at all.
 *
 * The Escape guard is the test that matters. A reviewer types the message the
 * applicant reads verbatim, and Escape inside a textarea must not throw that
 * away. Browsers deliver Escape from inside a field like any other key, so the
 * guard is the only thing standing between a half-written rejection and an
 * empty pane.
 */

const DETAIL = {
  application: {
    id: 'app-1', state: 'under_review', interview_channel: 'form',
    submitted_at: '2026-09-21T00:00:00.000Z', decided_at: null, created_at: '2026-09-21T00:00:00.000Z',
    attests_not_employed_fulltime: true, commitment_acknowledged_at: '2026-09-21T00:00:00.000Z',
    converted_from_existing_intern: false,
  },
  person: { full_name: 'Mihret Netsereab', email: 'mihretnetsereab@gmail.com' },
  intake: null,
  summary: [],
  progress: { total: 21, resolved: 21, remaining: 0, complete: true },
  sessions: [],
  recommendation: {
    suggested_action: 'human_follow_up_suggested',
    factors: [],
    completeness: { total: 21, resolved: 21, unresolved_keys: [] },
    excluded_signals: [],
    requires_human_decision: true,
  },
  signals: [],
  decisions: [],
  timeline: [],
  reason_options: [],
} as unknown as ApplicationDetail;

function stubReview(over: Partial<ReviewApi> = {}): ReviewApi {
  return {
    bucket: 'in_review', selected: 'app-1', detail: DETAIL, detailError: null, detailLoading: false,
    loadDetail: jest.fn(), loadQueue: jest.fn(),
    ...over,
  } as unknown as ReviewApi;
}

let container: HTMLDivElement;
let root: Root;

const render = (onBack: () => void, review: ReviewApi = stubReview()) => {
  act(() => {
    root.render(
      <ReviewProvider value={review}>
        <InternshipDetailPanel onBack={onBack} />
      </ReviewProvider>,
    );
  });
};

const pressEscape = (target: EventTarget = window) => {
  act(() => {
    target.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });
};

beforeEach(() => {
  (global as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { root = createRoot(container); });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the close control', () => {
  it('is rendered on the desktop layout, not only the mobile back button', () => {
    render(jest.fn());
    const close = container.querySelector('.aint-close') as HTMLButtonElement | null;
    expect(close).not.toBeNull();
    expect(close!.getAttribute('aria-label')).toBe('Close this applicant');
    // The mobile control still exists; CSS decides which one is visible.
    expect(container.querySelector('.aint-back')).not.toBeNull();
  });

  it('closes the applicant when clicked', () => {
    const onBack = jest.fn();
    render(onBack);
    act(() => { (container.querySelector('.aint-close') as HTMLButtonElement).click(); });
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('shows the empty pane once nothing is selected', () => {
    render(jest.fn(), stubReview({ selected: null, detail: null }));
    expect(container.querySelector('.aint-empty')).not.toBeNull();
    expect(container.textContent).toContain('Pick an applicant on the left');
  });
});

describe('Escape', () => {
  it('closes the open applicant', () => {
    const onBack = jest.fn();
    render(onBack);
    pressEscape();
    expect(onBack).toHaveBeenCalledTimes(1);
  });

  it('does NOT close while the reviewer is typing in a textarea', () => {
    const onBack = jest.fn();
    render(onBack);
    const textarea = document.createElement('textarea');
    container.appendChild(textarea);
    pressEscape(textarea);
    expect(onBack).not.toHaveBeenCalled();
  });

  it('does NOT close from inside an input or a select', () => {
    const onBack = jest.fn();
    render(onBack);
    for (const tag of ['input', 'select'] as const) {
      const el = document.createElement(tag);
      container.appendChild(el);
      pressEscape(el);
    }
    expect(onBack).not.toHaveBeenCalled();
  });

  it('is inert when no applicant is open, so it cannot fire twice', () => {
    const onBack = jest.fn();
    render(onBack, stubReview({ selected: null, detail: null }));
    pressEscape();
    expect(onBack).not.toHaveBeenCalled();
  });

  it('stops listening once the panel unmounts', () => {
    const onBack = jest.fn();
    render(onBack);
    act(() => root.unmount());
    pressEscape();
    expect(onBack).not.toHaveBeenCalled();
    act(() => { root = createRoot(container); });
  });
});
