import React from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import type { OrgRosterMember } from '../../../services/orgApi';

/**
 * C23 WP-9: the Partner Office team panel. Rows are real roster members only (name, team, readiness, on campus from live
 * presence); the CSV is the roster as the server gave it; the invite sends real emails, each checked first.
 */
const mockRoster = jest.fn<Promise<OrgRosterMember[]>, []>();
const mockInvite = jest.fn();
jest.mock('../../../services/orgApi', () => ({ getOrgRoster: () => mockRoster(), inviteMembers: (b: unknown) => mockInvite(b) }));
jest.mock('../home/useCampusTeam', () => ({ ...jest.requireActual('../home/useCampusTeam'), useCampusTeam: () => ({ company: 'Acme Logistics', team_size: 3 }) }));

import PartnerTeam, { PARTNER_ROWS_SHOWN } from '../partner/PartnerTeam';
import { csvCell, csvFileName, onCampusIds, parseInviteEmails, partnerRows, rosterCsv } from '../partner/teamRoster';
import { parseCampusTeam } from '../home/useCampusTeam';

const m = (id: string, name: string, readiness: number, team: string | null = 'Ops'): OrgRosterMember =>
  ({ enrollment_id: id, name, team, level: 'builder', rank: 1, band_rung: 'AI Builder I', readiness, builder_xp_week: 5, streak: 2, total_points: 120 });
const ROSTER = [m('e1', 'Ana Ruiz', 40), m('e2', 'Ben Cole', 80, null), m('e3', 'Cy Diaz', 80)];
const PRESENCE = { library: { count: 2, people: [{ enrollment_id: 'e1', display_name: 'Ana Ruiz', avatar_url: null }, { anonymous: true as const }] }, quad: { count: 0, people: [] } };

describe('partnerTeam model', () => {
  it('on campus = every named person in any building or on the Quad', () => {
    expect(Array.from(onCampusIds(PRESENCE))).toEqual(['e1']);
    expect(onCampusIds(null).size).toBe(0);
  });
  it('rows: on campus first, then readiness, then name; no team reads Unassigned; readiness clamped', () => {
    const rows = partnerRows([...ROSTER, m('e4', 'Dee', 140)], onCampusIds(PRESENCE));
    expect(rows.map((r) => [r.name, r.onCampus, r.readiness, r.team])).toEqual([
      ['Ana Ruiz', true, 40, 'Ops'], ['Dee', false, 100, 'Ops'], ['Ben Cole', false, 80, 'Unassigned'], ['Cy Diaz', false, 80, 'Ops']]);
  });
  it('CSV: a header, one line per person, quoting and a guard against spreadsheet formulas', () => {
    const csv = rosterCsv([m('e1', 'Ruiz, Ana', 40), m('e2', '=HYPERLINK("x")', 10)], new Set(['e1']));
    const lines = csv.trim().split('\r\n');
    expect(lines[0]).toBe('Name,Team,Rung,Readiness %,Points,Streak (days),Builder XP this week,On campus now');
    expect(lines[1]).toBe('"Ruiz, Ana",Ops,AI Builder I,40,120,2,5,Yes');
    expect(lines[2].startsWith(`"'=HYPERLINK(""x"")"`)).toBe(true);
    expect(csvCell('-5')).toBe("'-5");
  });
  it('the file name is the company and the Central date', () => {
    expect(csvFileName('Acme Logistics, Inc.', new Date('2026-11-02T03:00:00Z'))).toBe('acme-logistics-inc-team-2026-11-01.csv');
    expect(csvFileName(null, new Date('2026-11-02T18:00:00Z'))).toBe('my-team-2026-11-02.csv');
  });
  it('invite emails: split on commas, spaces and lines, lower-cased, de-duplicated, bad ones named', () => {
    expect(parseInviteEmails('A@x.com, b@y.co\nA@x.com  nope')).toEqual({ emails: ['a@x.com', 'b@y.co'], bad: ['nope'] });
    expect(parseInviteEmails('   ')).toEqual({ emails: [], bad: [] });
  });
  it('the team response: anything odd is null (the plain lines stay)', () => {
    expect(parseCampusTeam({ company: ' Acme ', team_size: 4 })).toEqual({ company: 'Acme', team_size: 4 });
    expect(parseCampusTeam({ company: '', team_size: 0 })).toEqual({ company: null, team_size: 0 });
    expect(parseCampusTeam({ company: 'x', team_size: -1 })).toBeNull();
    expect(parseCampusTeam({ company: 'x', team_size: 1.5 })).toBeNull();
    expect(parseCampusTeam(null)).toBeNull();
  });
});

describe('<PartnerTeam>', () => {
  let container: HTMLDivElement; let root: Root;
  const q = (s: string) => container.querySelector(s);
  const flush = () => act(async () => { await Promise.resolve(); await Promise.resolve(); });
  beforeEach(() => { container = document.createElement('div'); document.body.appendChild(container); root = createRoot(container); mockRoster.mockReset(); mockInvite.mockReset(); });
  afterEach(() => { act(() => root.unmount()); container.remove(); });
  const mount = async (onOpen = jest.fn()) => { act(() => { root.render(<PartnerTeam presence={PRESENCE} onOpen={onOpen} />); }); await flush(); return onOpen; };

  it('lists the team with readiness and an On campus / Away pill, the privacy note, and opens the company page', async () => {
    mockRoster.mockResolvedValue(ROSTER);
    const onOpen = await mount();
    expect(q('.cm-sec')!.textContent).toBe('Your team · 3 people · 1 on campus now');
    const rows = Array.from(container.querySelectorAll('[data-testid="cm-pt-row"]'));
    expect(rows.map((r) => r.querySelector('[data-testid="cm-pt-pill"]')!.textContent)).toEqual(['On campus', 'Away', 'Away']);
    expect(rows[0].textContent).toContain('40%');
    expect(q('[data-testid="cm-pt-privacy"]')!.textContent).toContain('only your company');
    act(() => { (q('[data-testid="cm-pt-company"]') as HTMLButtonElement).click(); });
    expect(onOpen).toHaveBeenCalledWith('/portal/company');
    expect(container.textContent).not.toMatch(/seats|\bfree\b/i);
  });

  it('Workplace names: Training Room and at HQ, never Classroom or campus', async () => {
    mockRoster.mockResolvedValue(ROSTER);
    act(() => { root.render(<PartnerTeam presence={PRESENCE} onOpen={jest.fn()} workplace />); });
    await flush();
    expect(container.textContent).toContain('Training Room');
    expect(container.textContent).not.toMatch(/Classroom|campus/);
    expect(q('[data-testid="cm-pt-pill"]')!.textContent).toBe('At HQ');
  });

  it(`shows at most ${PARTNER_ROWS_SHOWN} rows and says how many more`, async () => {
    mockRoster.mockResolvedValue(Array.from({ length: 11 }, (_, i) => m(`x${i}`, `P${i}`, i)));
    await mount();
    expect(container.querySelectorAll('[data-testid="cm-pt-row"]')).toHaveLength(PARTNER_ROWS_SHOWN);
    expect(container.textContent).toContain('and 3 more on your company page');
  });

  it('nobody yet: says so, and the CSV button waits for a roster', async () => {
    mockRoster.mockResolvedValue([]);
    await mount();
    expect(q('[data-testid="cm-pt-empty"]')).not.toBeNull();
    expect((q('[data-testid="cm-pt-csv"]') as HTMLButtonElement).disabled).toBe(true);
  });

  it('the roster fails: an error with Try again, which reloads', async () => {
    mockRoster.mockRejectedValueOnce(new Error('403')).mockResolvedValueOnce(ROSTER);
    await mount();
    expect(q('[data-testid="cm-pt-error"]')).not.toBeNull();
    act(() => { (q('[data-testid="cm-pt-error"] button') as HTMLButtonElement).click(); });
    await flush();
    expect(container.querySelectorAll('[data-testid="cm-pt-row"]')).toHaveLength(3);
  });

  it('invite: a bad address is named and nothing is sent; good ones are sent once and the roster reloads', async () => {
    mockRoster.mockResolvedValue(ROSTER);
    mockInvite.mockResolvedValue([]);
    await mount();
    act(() => { (q('[data-testid="cm-pt-invite-toggle"]') as HTMLButtonElement).click(); });
    const type = (sel: string, v: string) => act(() => {
      const el = q(sel) as HTMLTextAreaElement | HTMLInputElement;
      const set = Object.getOwnPropertyDescriptor(Object.getPrototypeOf(el), 'value')!.set!;
      set.call(el, v); el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    type('[data-testid="cm-pt-emails"]', 'ok@acme.com, nope');
    act(() => { (q('[data-testid="cm-pt-send"]') as HTMLButtonElement).click(); });
    expect(q('[data-testid="cm-pt-msg"]')!.textContent).toContain('nope');
    expect(mockInvite).not.toHaveBeenCalled();
    type('[data-testid="cm-pt-emails"]', 'ok@acme.com, two@acme.com');
    type('[data-testid="cm-pt-team"]', 'Ops');
    act(() => { (q('[data-testid="cm-pt-send"]') as HTMLButtonElement).click(); });
    await flush();
    expect(mockInvite).toHaveBeenCalledTimes(1);
    expect(mockInvite).toHaveBeenCalledWith({ emails: ['ok@acme.com', 'two@acme.com'], team: 'Ops' });
    expect(q('[data-testid="cm-pt-msg"]')!.textContent).toBe('Invite sent to 2 people.');
    expect(mockRoster).toHaveBeenCalledTimes(2);
  });

  it('invite fails: an error, the emails stay typed', async () => {
    mockRoster.mockResolvedValue(ROSTER);
    mockInvite.mockRejectedValue(new Error('500'));
    await mount();
    act(() => { (q('[data-testid="cm-pt-invite-toggle"]') as HTMLButtonElement).click(); });
    act(() => {
      const el = q('[data-testid="cm-pt-emails"]') as HTMLTextAreaElement;
      Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, 'value')!.set!.call(el, 'ok@acme.com');
      el.dispatchEvent(new Event('input', { bubbles: true }));
    });
    act(() => { (q('[data-testid="cm-pt-send"]') as HTMLButtonElement).click(); });
    await flush();
    expect(q('[data-testid="cm-pt-msg"]')!.textContent).toBe('Could not send the invite. Please try again.');
    expect((q('[data-testid="cm-pt-emails"]') as HTMLTextAreaElement).value).toBe('ok@acme.com');
  });
});
