import React from 'react';
import DeskInboxesTab, { gmailLink } from '../DeskInboxesTab';
import { click, flush, inboxesOf, mountAt, q, unmount } from '../deskTestKit';

/**
 * CP11.1b (kit F9) inbox health: every learner's row; Send test shows the server's words (409 "Inbox tests are switched off"
 * included); "Mark confirmed" ONLY while a Gmail confirmation is pending (T31 PASS note d); "Open Gmail confirmation" gives
 * the staff member a Gmail link to open in a new tab, and the app never follows it.
 */
const mockLoad = jest.fn();
const mockTest = jest.fn();
const mockForwarding = jest.fn();
jest.mock('../careerDeskApi', () => ({
  ...jest.requireActual('../careerDeskApi'),
  loadInboxes: (...a: unknown[]) => mockLoad(...a), sendInboxTest: (...a: unknown[]) => mockTest(...a), forwarding: (...a: unknown[]) => mockForwarding(...a),
}));
const E = '11111111-1111-4111-8111-111111111111';
const mount = () => mountAt('/admin/placement/inboxes', <DeskInboxesTab />);
beforeEach(() => { [mockLoad, mockTest, mockForwarding].forEach((m) => m.mockReset()); });
afterEach(unmount);

describe('inbox health', () => {
  it('a row per learner: address, last forwarded in Central, 30-day count, status; the tests switch as the server reads it', async () => {
    mockLoad.mockResolvedValue(inboxesOf());
    const h = await mount();
    expect(q(h, `cdesk-in-row-${E}`)?.textContent).toBe('Ann Lee Prepann.lee.careers@gmail.comSat, Nov 21, 9:00 AM Central14HealthySend test');
    expect(q(h, 'cdesk-in-switch')?.textContent).toBe('Inbox tests: Off');
    expect(q(h, `cdesk-in-row-${E}`)?.querySelector('a')?.getAttribute('href')).toBe(`/admin/placement/students?student=${E}`);
  });

  it('"Mark confirmed" and "Open Gmail confirmation" show only while a confirmation is pending', async () => {
    mockLoad.mockResolvedValue(inboxesOf());
    let h = await mount();
    expect(q(h, `cdesk-in-confirm-${E}`)).toBeNull();
    expect(q(h, `cdesk-in-open-${E}`)).toBeNull();
    unmount();
    mockLoad.mockResolvedValue(inboxesOf({ confirmationPending: true }));
    h = await mount();
    expect(q(h, `cdesk-in-confirm-${E}`)?.textContent).toBe('Mark confirmed');
    expect(q(h, `cdesk-in-open-${E}`)?.textContent).toBe('Open Gmail confirmation');
  });

  it('Send test with the switch off shows the server words (no audit claim, nothing else)', async () => {
    mockLoad.mockResolvedValue(inboxesOf());
    mockTest.mockResolvedValue({ ok: false, message: 'Inbox tests are switched off' });
    const h = await mount();
    await click(q(h, `cdesk-in-test-${E}`));
    expect(mockTest).toHaveBeenCalledWith(E);
    expect(q(h, 'cdesk-in-answer-text')?.textContent).toBe('Inbox tests are switched off');
    expect(q(h, 'cdesk-in-answer-audit')).toBeNull();
  });

  it('Open Gmail confirmation shows the link (new tab, no opener) and the code; window.open is never called', async () => {
    mockLoad.mockResolvedValue(inboxesOf({ confirmationPending: true }));
    mockForwarding.mockResolvedValue({ ok: true, outcome: 'opened', message: 'Open the link (or use the code) in Gmail, then mark it confirmed.',
      link: 'https://mail-settings.google.com/mail/vf-abc', code: '123456789' });
    const opened = jest.spyOn(window, 'open').mockImplementation(() => null);
    const h = await mount();
    await click(q(h, `cdesk-in-open-${E}`));
    expect(mockForwarding).toHaveBeenCalledWith(E, 'open');
    const a = q(h, 'cdesk-in-confirm-link') as HTMLAnchorElement;
    expect(a.getAttribute('href')).toBe('https://mail-settings.google.com/mail/vf-abc');
    expect(a.getAttribute('target')).toBe('_blank');
    expect(a.getAttribute('rel')).toBe('noopener noreferrer');
    expect(q(h, 'cdesk-in-confirm-code')?.textContent).toBe('123456789');
    expect(opened).not.toHaveBeenCalled();
    opened.mockRestore();
  });

  it('a link that is not Gmail over https is never rendered', () => {
    expect(gmailLink('https://mail.google.com/x')).toBe('https://mail.google.com/x');
    expect(gmailLink('http://mail.google.com/x')).toBeNull();
    expect(gmailLink('https://evil.example/mail.google.com')).toBeNull();
    expect(gmailLink('javascript:alert(1)')).toBeNull();
    expect(gmailLink(null)).toBeNull();
  });

  it('Mark confirmed sends confirm once and shows the server message with the audit line', async () => {
    mockLoad.mockResolvedValue(inboxesOf({ confirmationPending: true }));
    mockForwarding.mockResolvedValue({ ok: true, outcome: 'confirmed', message: 'Forwarding marked confirmed.' });
    const h = await mount();
    const b = q(h, `cdesk-in-confirm-${E}`)!;
    b.click(); b.click();
    await flush();
    expect(mockForwarding).toHaveBeenCalledTimes(1);
    expect(mockForwarding).toHaveBeenCalledWith(E, 'confirm');
    expect(q(h, 'cdesk-in-answer-text')?.textContent).toBe('Forwarding marked confirmed.');
    expect(q(h, 'cdesk-in-answer-audit')?.textContent).toMatch(/Central\.$/);
  });

  it('no learner: says so; a failed load is an alert', async () => {
    mockLoad.mockResolvedValueOnce({ testsSwitch: 'unreadable', learners: [] });
    let h = await mount();
    expect(q(h, 'cdesk-in-empty')?.textContent).toBe('No learner is in Career Prep yet.');
    expect(q(h, 'cdesk-in-switch')?.textContent).toBe('Inbox tests: Could not be read (treated as off)');
    unmount();
    mockLoad.mockRejectedValueOnce(new Error('ContractViolation'));
    h = await mount();
    expect(q(h, 'cdesk-in-error')?.textContent).toContain('Could not load inbox health. Try again.');
  });
});
