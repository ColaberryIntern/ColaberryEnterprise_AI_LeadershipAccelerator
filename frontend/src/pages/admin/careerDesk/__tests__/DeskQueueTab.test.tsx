import React from 'react';
import DeskQueueTab from '../DeskQueueTab';
import { click, flush, inboxesOf, lowItem, mountAt, noContact, q, queueOf, typeInto, unmatched, unmount } from '../deskTestKit';

/**
 * CP11.1b (kit F9) review queue: each item's actions exactly as the server lists them, one send per click however fast the
 * clicks, the server's message with the audit line, the employer email asked for first when there is none, a learner picked
 * before Match and send, held links with the server's note, and honest empty and error states.
 */
const mockLoadQueue = jest.fn();
const mockLoadInboxes = jest.fn();
const mockQueueAction = jest.fn();
const mockSendHeld = jest.fn();
jest.mock('../careerDeskApi', () => ({
  ...jest.requireActual('../careerDeskApi'),
  loadQueue: (...a: unknown[]) => mockLoadQueue(...a), loadInboxes: (...a: unknown[]) => mockLoadInboxes(...a),
  queueAction: (...a: unknown[]) => mockQueueAction(...a), sendHeldLink: (...a: unknown[]) => mockSendHeld(...a),
}));

const mount = () => mountAt('/admin/placement/queue', <DeskQueueTab />);
beforeEach(() => { [mockLoadQueue, mockLoadInboxes, mockQueueAction, mockSendHeld].forEach((m) => m.mockReset()); mockLoadInboxes.mockResolvedValue(inboxesOf()); });
afterEach(unmount);

describe('the review queue', () => {
  it('lists items oldest first as served, with the kit pill, learner, company, subject and confidence; the card shows the API actions and labels', async () => {
    mockLoadQueue.mockResolvedValue(queueOf([lowItem, unmatched]));
    const h = await mount();
    const row = q(h, 'cdesk-q-row-item-41')!;
    expect(row.textContent).toBe('Low confidenceAnn LeeCedar Credit UnionQuick chat this week?78%');
    expect(q(h, 'cdesk-q-row-item-43')?.textContent).toContain('No learner yet');
    expect(q(h, 'cdesk-q-title')?.textContent).toBe('Low confidence: is this an interview?');
    expect([...q(h, 'cdesk-q-actions')!.querySelectorAll('button')].map((b) => b.textContent)).toEqual(['Send booking link', 'Not an interview']);
    expect(q(h, 'cdesk-q-detail')?.textContent).toContain('Waiting since Sat, Nov 21, 9:00 AM Central');
  });

  it('a double click on Send booking link sends ONE action, then shows the server message and the audit line, and reads the queue again', async () => {
    mockLoadQueue.mockResolvedValueOnce(queueOf([lowItem])).mockResolvedValue(queueOf([]));
    let release: (v: unknown) => void = () => undefined;
    mockQueueAction.mockReturnValue(new Promise((r) => { release = r; }));
    const h = await mount();
    const btn = q(h, 'cdesk-q-act-make_interview')!;
    btn.click(); btn.click();
    await flush();
    expect(q(h, 'cdesk-q-act-make_interview')?.textContent).toBe('Working...');
    expect((q(h, 'cdesk-q-act-dismiss') as HTMLButtonElement).disabled).toBe(true);
    release({ ok: true, outcome: 'made', message: 'Interview made.' });
    await flush();
    expect(mockQueueAction).toHaveBeenCalledTimes(1);
    expect(mockQueueAction).toHaveBeenCalledWith(lowItem, 'make_interview', {});
    expect(q(h, 'cdesk-q-answer-text')?.textContent).toBe('Interview made.');
    expect(q(h, 'cdesk-q-answer-audit')?.textContent).toMatch(/^Saved to the audit log at \d{1,2}:\d\d (AM|PM) Central\.$/);
    expect(q(h, 'cdesk-q-answer')?.getAttribute('role')).toBe('status');
    expect(mockLoadQueue).toHaveBeenCalledTimes(2);
    expect(q(h, 'cdesk-q-empty')?.textContent).toContain('All clear.');
  });

  it('a refusal shows the server words and no audit line', async () => {
    mockLoadQueue.mockResolvedValue(queueOf([lowItem]));
    mockQueueAction.mockResolvedValue({ ok: false, message: 'This interview just changed (someone else acted on it). Refresh the queue.' });
    const h = await mount();
    await click(q(h, 'cdesk-q-act-dismiss'));
    expect(q(h, 'cdesk-q-answer-text')?.textContent).toBe('This interview just changed (someone else acted on it). Refresh the queue.');
    expect(q(h, 'cdesk-q-answer-audit')).toBeNull();
  });

  it('no employer email: Send booking link waits for a valid email, then sends it', async () => {
    mockLoadQueue.mockResolvedValue(queueOf([noContact]));
    mockQueueAction.mockResolvedValue({ ok: true, outcome: 'sent', message: 'Booking link sent to the employer.' });
    const h = await mount();
    const send = () => q(h, 'cdesk-q-act-send_link') as HTMLButtonElement;
    expect(send().disabled).toBe(true);
    await typeInto(q(h, 'cdesk-q-email'), 'not-an-email');
    expect(send().disabled).toBe(true);
    await typeInto(q(h, 'cdesk-q-email'), ' Pat@Harbor.example ');
    expect(send().disabled).toBe(false);
    await click(send());
    expect(mockQueueAction).toHaveBeenCalledWith(noContact, 'send_link', { contactEmail: 'Pat@Harbor.example' });
  });

  it('Match and send waits for a learner from the Career Prep list and sends the enrollment id', async () => {
    mockLoadQueue.mockResolvedValue(queueOf([unmatched]));
    mockQueueAction.mockResolvedValue({ ok: true, outcome: 'resolved', message: 'Done.' });
    const h = await mount();
    expect((q(h, 'cdesk-q-act-match') as HTMLButtonElement).disabled).toBe(true);
    expect([...(q(h, 'cdesk-q-learner') as HTMLSelectElement).options].map((o) => o.textContent)).toEqual(['Pick a learner', 'Ann Lee (ann.lee.careers@gmail.com)']);
    await typeInto(q(h, 'cdesk-q-learner'), '11111111-1111-4111-8111-111111111111');
    await click(q(h, 'cdesk-q-act-match'));
    expect(mockQueueAction).toHaveBeenCalledWith(unmatched, 'match', { enrollmentId: '11111111-1111-4111-8111-111111111111' });
  });

  it('held booking links show the server note and send once with the employer email when none is on file', async () => {
    const held = { interviewId: 'aaaaaaaa-0000-4000-8000-000000000001', learner: 'Ann Lee', enrollmentId: lowItem.enrollmentId!, company: 'Meridian Freight', position: 'Analyst',
      hasContact: false, heldAt: '2026-11-20T15:00:00.000Z', heldLabel: 'Fri, Nov 20, 9:00 AM', action: { action: 'send_link', label: 'Send booking link' } };
    mockLoadQueue.mockResolvedValue(queueOf([], [held]));
    mockSendHeld.mockResolvedValue({ ok: true, outcome: 'held', message: 'Held: employer email is switched off. Nothing was sent; it waits in Held booking links.' });
    const h = await mount();
    expect(q(h, 'cdesk-held-note')?.textContent).toBe('A booking link is held when employer email was switched off when it was due.');
    expect(q(h, `cdesk-held-${held.interviewId}`)?.textContent).toContain('held Fri, Nov 20, 9:00 AM Central');
    expect((q(h, `cdesk-held-send-${held.interviewId}`) as HTMLButtonElement).disabled).toBe(true);
    await typeInto(h.querySelector(`#cdesk-held-email-${held.interviewId}`), 'pat@meridian.example');
    await click(q(h, `cdesk-held-send-${held.interviewId}`));
    expect(mockSendHeld).toHaveBeenCalledWith(held.interviewId, 'pat@meridian.example');
    expect(q(h, 'cdesk-q-answer-text')?.textContent).toContain('Nothing was sent');
  });

  it('empty: "All clear" and "No booking link is held"; a failed load is an alert with Try again, never an empty queue', async () => {
    mockLoadQueue.mockResolvedValueOnce(queueOf([]));
    let h = await mount();
    expect(q(h, 'cdesk-q-empty')).not.toBeNull();
    expect(q(h, 'cdesk-held-empty')?.textContent).toBe('No booking link is held.');
    unmount();
    mockLoadQueue.mockRejectedValueOnce({ response: { status: 500 } }).mockResolvedValueOnce(queueOf([lowItem]));
    h = await mount();
    expect(q(h, 'cdesk-q-error')?.getAttribute('role')).toBe('alert');
    expect(q(h, 'cdesk-q-error')?.textContent).toContain('Could not load the review queue. Try again.');
    expect(q(h, 'cdesk-q-empty')).toBeNull();
    await click(q(h, 'cdesk-q-error')!.querySelector('button'));
    expect(q(h, 'cdesk-q-row-item-41')).not.toBeNull();
  });

  it('a 403 says the staff member has no Placement access', async () => {
    mockLoadQueue.mockRejectedValue({ response: { status: 403 } });
    const h = await mount();
    expect(q(h, 'cdesk-q-error')?.textContent).toContain('You do not have access to Placement.');
  });
});
