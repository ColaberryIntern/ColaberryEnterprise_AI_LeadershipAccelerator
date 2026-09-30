import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import ActivityTimeline, { LiveAgentTimelineEvent } from '../ActivityTimeline';

/**
 * ActivityTimeline — Org Chart v4 (2026-08-20). Pure presentational
 * component unit tests: per-kind dot color, per-kind label text, new-tab
 * open behavior, honest empty state. No @testing-library/react (not
 * installed in this repo) — same react-dom/client + act convention as every
 * other test file in this directory.
 */

function makeEvent(overrides: Partial<LiveAgentTimelineEvent> = {}): LiveAgentTimelineEvent {
  return {
    id: 'activity-1',
    ticket_id: 'ticket-1',
    ticket_number: 42,
    ticket_title: 'Some ticket',
    kind: 'created',
    action: 'created',
    from_value: null,
    to_value: 'backlog',
    actor_display_name: 'Cory Engine — Autonomous Operations',
    occurred_at: '2026-08-20T12:00:00.000Z',
    ...overrides,
  };
}

let container: HTMLDivElement;
let root: Root;

function render(events: LiveAgentTimelineEvent[]) {
  act(() => { root.render(<ActivityTimeline events={events} />); });
}

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
});

afterEach(() => {
  act(() => { root.unmount(); });
  container.remove();
});

describe('ActivityTimeline', () => {
  it('boundary: an empty events array renders the honest "No activity yet." message, not a broken empty shell', () => {
    render([]);
    expect(container.textContent).toContain('No activity yet.');
    expect(container.querySelector('.wf-tl')).toBeFalsy();
  });

  it('happy path: a "created" event gets the created dot color and "Ticket created" label', () => {
    render([makeEvent({ kind: 'created' })]);
    expect(container.querySelector('.wf-tl-dot.created')).toBeTruthy();
    expect(container.querySelector('.wf-tl-label.created')?.textContent).toBe('Ticket created');
  });

  it('happy path: a "status_change" event gets the status_change dot color and a "Status: X → Y" label', () => {
    render([makeEvent({ kind: 'status_change', from_value: 'todo', to_value: 'in_progress' })]);
    expect(container.querySelector('.wf-tl-dot.status_change')).toBeTruthy();
    expect(container.querySelector('.wf-tl-label.status_change')?.textContent).toBe('Status: todo → in_progress');
  });

  it('happy path: a "closed" event gets the closed dot color and a "Closed" label', () => {
    render([makeEvent({ kind: 'closed', from_value: 'in_review', to_value: 'done' })]);
    expect(container.querySelector('.wf-tl-dot.closed')).toBeTruthy();
    expect(container.querySelector('.wf-tl-label.closed')?.textContent).toBe('Closed (was: in_review)');
  });

  it('the 3 event kinds render 3 visually distinct dot classes on the same page at once', () => {
    render([
      makeEvent({ id: 'a', kind: 'created' }),
      makeEvent({ id: 'b', kind: 'status_change', from_value: 'todo', to_value: 'in_progress' }),
      makeEvent({ id: 'c', kind: 'closed', to_value: 'done' }),
    ]);
    const dotClasses = Array.from(container.querySelectorAll('.wf-tl-dot')).map((el) => el.className);
    expect(new Set(dotClasses).size).toBe(3);
  });

  it('clicking the new-tab open button calls window.open with the ?open=<ticketId> URL, new tab, noopener', () => {
    const spy = jest.spyOn(window, 'open').mockImplementation(() => null);
    render([makeEvent({ ticket_id: 'ticket-42' })]);

    const openBtn = container.querySelector('.wf-tl-open') as HTMLButtonElement;
    act(() => { openBtn.dispatchEvent(new MouseEvent('click', { bubbles: true })); });

    expect(spy).toHaveBeenCalledWith('/admin/tickets?open=ticket-42', '_blank', 'noopener,noreferrer');
    spy.mockRestore();
  });

  it('failure/boundary: a null occurred_at and a null ticket_number render without crashing', () => {
    expect(() => render([makeEvent({ occurred_at: null, ticket_number: null })])).not.toThrow();
    expect(container.textContent).toContain('TK-—');
  });
});
