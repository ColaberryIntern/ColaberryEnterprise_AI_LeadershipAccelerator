/**
 * C5 staff desks: who sees which desk, decided from the SAME sources as the frontend's audience, and the on-duty rule.
 */
const mockEntitlement = { isStaff: false, explorer: false };
const mockEnv = { enableChat: false };
jest.mock('../../../config/env', () => ({ env: mockEnv }));
let mockManager = false;
jest.mock('../../access/contentEntitlement', () => ({
  resolveContentPageAccess: jest.fn(async () => ({ isStaff: mockEntitlement.isStaff, hasFullAccess: true })),
  isFreePreviewTier: jest.fn(async () => mockEntitlement.explorer),
}));
jest.mock('../../portalSettingsService', () => ({ isOrgManager: jest.fn(async () => mockManager) }));
let mockMgmt: boolean | 'throw' = false;
// C87: the badge's sections decide whether Dara (Program floor) is listed
let mockSections: string[] = [];
jest.mock('../../access/mgmtBridgeService', () => ({ getMgmtStatus: jest.fn(async () => { if (mockMgmt === 'throw') throw new TypeError('db down'); return { is_mgmt: mockMgmt, role: mockMgmt ? 'ops' : null, label: null, sections: mockSections }; }) }));
jest.mock('../../reese/reeseIdentitySeed', () => ({ isReeseEnabled: jest.fn(), getReeseEnrollmentId: jest.fn() }));
jest.mock('../../curriculum/daraIdentitySeed', () => ({ isDaraEnabled: jest.fn(), getDaraEnrollmentId: jest.fn() }));
jest.mock('../../mayaIdentitySeed', () => ({ getMayaEnrollmentId: jest.fn() }));
// M36: her desk follows the M37 switch. Off when chat is off (reason chat_off), as before; mockMayaMode overrides it.
const mockMayaMode: { value: null | 'shadow' | 'off' } = { value: null };
jest.mock('../../maya/mayaPromotion', () => ({
  resolveMayaMode: jest.fn(async () => (mockMayaMode.value === 'shadow' ? { mode: 'shadow', reason: 'not_promoted' }
    : mockMayaMode.value === 'off' ? { mode: 'off', reason: 'kill_switch' }
    : mockEnv.enableChat ? { mode: 'live', reason: 'default_live' } : { mode: 'off', reason: 'chat_off' })),
}));
// The thing NOT to use: a broader staff test (staff role OR mgmt_role). Mocked to say "yes" so a regression to it shows.
jest.mock('../../access/staffAccess', () => ({ isStaffOrMgmt: jest.fn(async () => true), isStaffEnrollment: jest.fn(async () => true) }));

import fs from 'fs';
import path from 'path';
import { isReeseEnabled, getReeseEnrollmentId } from '../../reese/reeseIdentitySeed';
import { isDaraEnabled, getDaraEnrollmentId } from '../../curriculum/daraIdentitySeed';
import { getMayaEnrollmentId } from '../../mayaIdentitySeed';
import { getStaffDesks, campusAudienceFor, mayaVisibleTo } from '../campusStaffDesks';

const set = (o: { staff?: boolean; manager?: boolean; explorer?: boolean; mgmt?: boolean | 'throw' }) => {
  mockEntitlement.isStaff = !!o.staff; mockEntitlement.explorer = !!o.explorer; mockManager = !!o.manager; mockMgmt = o.mgmt ?? false;
};
const ids = async () => (await getStaffDesks('enr-1')).desks.map((d) => d.id);

beforeEach(() => {
  jest.clearAllMocks();
  set({});
  mockSections = [];
  (isReeseEnabled as jest.Mock).mockResolvedValue(true);
  (getReeseEnrollmentId as jest.Mock).mockResolvedValue('reese-1');
  (isDaraEnabled as jest.Mock).mockResolvedValue(true);
  (getDaraEnrollmentId as jest.Mock).mockResolvedValue('dara-1');
  (getMayaEnrollmentId as jest.Mock).mockResolvedValue('maya-1');
});

describe('audience: the frontend\'s sources, the frontend\'s precedence', () => {
  it.each([
    ['member', {}, 'member'],
    ['someone with only a management role (isStaffOrMgmt would say yes): still a member', {}, 'member'],
    ['org manager', { manager: true }, 'business'],
    ['Explorer', { explorer: true }, 'explorer'],
    ['org manager on an Explorer account', { manager: true, explorer: true }, 'business'],
    ['staff', { staff: true }, 'staff'],
    ['staff who also manages an org', { staff: true, manager: true }, 'staff'],
  ])('%s', async (_n, o, want) => {
    set(o);
    await expect(campusAudienceFor('enr-1')).resolves.toBe(want);
  });

  it('C6: a Management Portal user (staff role + mgmt_role) is staff even while the page gate says nobody is staff', async () => {
    set({ mgmt: true });
    await expect(campusAudienceFor('enr-1')).resolves.toBe('staff');
    set({ mgmt: true, manager: true, explorer: true });
    await expect(campusAudienceFor('enr-1')).resolves.toBe('staff');
  });

  it('C6: a failed management-status read is not staff (fail closed) and is logged', async () => {
    set({ mgmt: 'throw', manager: true });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    await expect(campusAudienceFor('enr-1')).resolves.toBe('business');
    expect(JSON.parse(String(warn.mock.calls[0][0]))).toMatchObject({ event: 'campus_mgmt_status_failed', error_class: 'TypeError' });
    warn.mockRestore();
  });

  it('C6: pins the frontend staff signal (page staff OR management), so both sides use the same pair', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'frontend', 'src', 'components', 'campus', 'useCampusAudience.ts'), 'utf8');
    expect(src).toContain('const isStaff = pageStaff || isMgmt;');
  });

  it('pins the frontend precedence line, so a change on either side fails here', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'frontend', 'src', 'components', 'campus', 'campusAudience.ts'), 'utf8');
    expect(src).toContain("s.isStaff ? 'staff' : s.isOrgManager ? 'business' : s.isExplorer ? 'explorer' : 'member'");
  });
});

describe('Maya: every audience (C21, v6 D3; it replaced the C6 rule of staff and Explorers only)', () => {
  it.each([
    [{}, ['reese', 'maya']],
    [{ manager: true }, ['reese', 'maya']],
    [{ manager: true, explorer: true }, ['reese', 'maya']],
    [{ explorer: true }, ['reese', 'maya']],
    [{ staff: true }, ['reese', 'maya']], // C87: no Program floor on the badge = no Dara
  ])('%j -> %j', async (o, want) => {
    set(o);
    expect(await ids()).toEqual(want);
  });

  it('mayaVisibleTo is every audience', () => {
    expect(['staff', 'business', 'explorer', 'member'].filter((a) => mayaVisibleTo(a as never))).toEqual(['staff', 'business', 'explorer', 'member']);
  });

  it('C6: with the site chat OFF her desk is not open (opens soon), with no prompts and no enrollment', async () => {
    set({ explorer: true }); mockEnv.enableChat = false;
    const maya = (await getStaffDesks('enr-1')).desks.find((d) => d.id === 'maya')!;
    expect(maya).toMatchObject({ building: 'admissions', title: 'Welcome desk', ai: true, on_duty: false, opens: 'site_chat_off', enrollment_id: null, prompts: [] });
  });

  it('C121: with the site chat ON (ENABLE_CHAT) she is on duty in the shared chat: her enrollment id and her three questions', async () => {
    set({ explorer: true }); mockEnv.enableChat = true;
    const maya = (await getStaffDesks('enr-1')).desks.find((d) => d.id === 'maya')!;
    expect(maya).toMatchObject({ on_duty: true, opens: null, enrollment_id: 'maya-1' });
    expect(maya.prompts).toEqual(['Compare the plans for me', 'Book a call with admissions', 'Have someone call me']);
    mockEnv.enableChat = false;
  });

  it('C121: flag on but her identity is not seeded: off duty, no enrollment, no prompts (nothing to answer as)', async () => {
    mockEnv.enableChat = true;
    (getMayaEnrollmentId as jest.Mock).mockResolvedValue(null);
    const maya = (await getStaffDesks('enr-1')).desks.find((d) => d.id === 'maya')!;
    expect(maya).toMatchObject({ on_duty: false, enrollment_id: null, prompts: [] });
    mockEnv.enableChat = false;
  });

  it('C121: a failing Maya lookup leaves her desk off duty and the other desks intact (logged, never thrown)', async () => {
    mockEnv.enableChat = true;
    (getMayaEnrollmentId as jest.Mock).mockRejectedValue(new TypeError('db down'));
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    const { desks } = await getStaffDesks('enr-1');
    expect(desks.find((d) => d.id === 'maya')).toMatchObject({ on_duty: false, enrollment_id: null });
    expect(desks.find((d) => d.id === 'reese')).toMatchObject({ on_duty: true });
    expect(warn.mock.calls.map((c) => JSON.parse(String(c[0])).event)).toContain('maya_enrollment_lookup_failed');
    warn.mockRestore();
    mockEnv.enableChat = false;
  });

  it.each([['shadow' as const], ['off' as const]])(
    'M36: chat on but her DM reply %s on the M37 switch: desk off duty, "back soon" (maya_paused), not an error',
    async (mode) => {
      set({ explorer: true }); mockEnv.enableChat = true; mockMayaMode.value = mode;
      const maya = (await getStaffDesks('enr-1')).desks.find((d) => d.id === 'maya')!;
      expect(maya).toMatchObject({ on_duty: false, opens: 'maya_paused', enrollment_id: null, prompts: [] });
      mockMayaMode.value = null; mockEnv.enableChat = false;
    },
  );
});

describe('on duty', () => {
  it('Reese and Dara on duty: their places (C87), enrollment ids and their questions (Reese 4; Dara 2)', async () => {
    mockSections = ['dashboard', 'program'];
    const { desks } = (await getStaffDesks('enr-1'));
    expect(desks.filter((d) => d.id !== 'maya').map((d) => [d.id, d.building, d.on_duty, d.enrollment_id, d.prompts.length])).toEqual([
      ['reese', 'lecture', true, 'reese-1', 4], ['dara', 'career', true, 'dara-1', 2],
    ]);
    expect(desks.every((d) => d.ai === true)).toBe(true);
  });

  it('C88: Dara\'s desk asks only what her staff tools answer; Reese\'s desk takes the lesson question learners used to ask Dara', async () => {
    mockSections = ['dashboard', 'program'];
    const { desks } = (await getStaffDesks('enr-1'));
    const dara = desks.find((d) => d.id === 'dara')!;
    const reese = desks.find((d) => d.id === 'reese')!;
    expect(dara.prompts).toEqual(['Which lessons are students stalling on this week?', 'Who is falling behind the schedule?']);
    expect(reese.prompts[0]).toBe('What does this week\'s lesson cover?');
  });

  it('a disabled Reese is off duty, with no enrollment id and no questions', async () => {
    (isReeseEnabled as jest.Mock).mockResolvedValue(false);
    const reese = (await getStaffDesks('enr-1')).desks.find((d) => d.id === 'reese')!;
    expect(reese).toMatchObject({ on_duty: false, enrollment_id: null, prompts: [] });
  });

  it('an unseeded Dara (no identity) is off duty even when enabled', async () => {
    mockSections = ['program'];
    (getDaraEnrollmentId as jest.Mock).mockResolvedValue(null);
    const dara = (await getStaffDesks('enr-1')).desks.find((d) => d.id === 'dara')!;
    expect(dara).toMatchObject({ on_duty: false, enrollment_id: null });
  });

  it('a failing lookup rejects (the route answers 500; the UI hides desks)', async () => {
    (isDaraEnabled as jest.Mock).mockRejectedValue(new TypeError('db down'));
    await expect(getStaffDesks('enr-1')).rejects.toThrow('db down');
  });
});

describe('C87: every agent has one place; Dara only for a badge that opens the Program floor', () => {
  const dara = async () => (await getStaffDesks('enr-1')).desks.find((d) => d.id === 'dara');
  it('Reese is in the Classroom, Maya in Admissions, for everyone', async () => {
    const { desks } = await getStaffDesks('enr-1');
    expect(desks.find((d) => d.id === 'reese')).toMatchObject({ building: 'lecture', floor: null, office: null });
    expect(desks.find((d) => d.id === 'maya')).toMatchObject({ building: 'admissions', floor: null, office: null });
  });
  it('a badge with the Program floor (the curriculum role) sees Dara in the Staff Office at Curriculum', async () => {
    set({ mgmt: true }); mockSections = ['dashboard', 'program'];
    expect(await dara()).toMatchObject({ building: 'career', floor: 'program', office: '/admin/orchestration', enrollment_id: 'dara-1' });
  });
  it.each([['a member', {}, []], ['a marketing badge', { mgmt: true }, ['dashboard', 'campaigns']], ['staff without a badge', { staff: true }, []]])('%s never sees Dara', async (_n, o, sections) => {
    set(o); mockSections = sections as string[];
    expect(await dara()).toBeUndefined();
  });
  it('a failed badge lookup hides Dara (fail closed) and is logged', async () => {
    set({ mgmt: 'throw' });
    const warn = jest.spyOn(console, 'warn').mockImplementation(() => undefined);
    expect(await dara()).toBeUndefined();
    expect(warn.mock.calls.map((c) => JSON.parse(String(c[0])).event)).toContain('agent_floor_lookup_failed');
    warn.mockRestore();
  });
});

describe('C87: the places match the admin menu the tower is built from', () => {
  it('the office of Dara is the Curriculum page, inside the Program group (section program) of adminNav.ts', () => {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const { AGENT_PLACES } = require('../agentPlaces');
    const src = fs.readFileSync(path.join(__dirname, '..', '..', '..', '..', '..', 'frontend', 'src', 'components', 'Layout', 'adminNav.ts'), 'utf8');
    const start = src.indexOf("{ label: 'Program', section: 'program'");
    expect(start).toBeGreaterThan(-1);
    const end = src.indexOf("{ label: '", start + 10);
    expect(src.slice(start, end)).toContain(`path: '${AGENT_PLACES.dara.office}', label: 'Curriculum'`);
    expect(AGENT_PLACES.dara.floor).toBe('program');
  });
});
