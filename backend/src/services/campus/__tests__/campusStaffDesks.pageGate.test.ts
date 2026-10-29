/**
 * C5 audience with the REAL resolveContentPageAccess: while CONTENT_PAGE_GATE_ENABLED is off, nobody is staff on the
 * frontend (is_staff false), so nobody may be staff for the desks either, even someone the broader staff test accepts.
 * Kept in its own file because campusStaffDesks.test.ts mocks contentEntitlement entirely.
 */
// databaseUrl only lets the models module construct Sequelize; nothing connects (the gate-off branch returns first).
jest.mock('../../../config/env', () => ({ env: { contentPageGateEnabled: false, databaseUrl: 'postgres://u:p@localhost:5432/none', nodeEnv: 'test' } })); // gitleaks:allow (placeholder, no server)
jest.mock('../../access/contentEntitlement', () => ({
  ...jest.requireActual('../../access/contentEntitlement'),
  isFreePreviewTier: jest.fn(async () => false),
}));
jest.mock('../../portalSettingsService', () => ({ isOrgManager: jest.fn(async () => false) }));
jest.mock('../../access/mgmtBridgeService', () => ({ getMgmtStatus: jest.fn(async () => ({ is_mgmt: false, role: null, label: null })) }));
jest.mock('../../access/staffAccess', () => ({ isStaffOrMgmt: jest.fn(async () => true), isStaffEnrollment: jest.fn(async () => true) }));
jest.mock('../../reese/reeseIdentitySeed', () => ({ isReeseEnabled: jest.fn(async () => true), getReeseEnrollmentId: jest.fn(async () => 'reese-1') }));
jest.mock('../../curriculum/daraIdentitySeed', () => ({ isDaraEnabled: jest.fn(async () => true), getDaraEnrollmentId: jest.fn(async () => 'dara-1') }));

import { campusAudienceFor, getStaffDesks } from '../campusStaffDesks';

describe('page gate off', () => {
  it('a staff-role enrollment is a member for the campus (Maya, C21: listed for every audience)', async () => {
    await expect(campusAudienceFor('staff-enr')).resolves.toBe('member');
    expect((await getStaffDesks('staff-enr')).desks.map((d) => d.id)).toEqual(['reese', 'maya']); // C87: Dara needs the Program floor
  });
});
