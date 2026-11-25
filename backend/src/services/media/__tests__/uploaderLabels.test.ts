/**
 * The cases here are the ones production actually produced on 2026-11-25: an admin, an
 * enrollment, a synthetic batch actor, and a null. A test that only covered the admin
 * would have passed against the bug this module exists to fix.
 */
jest.mock('../../../models', () => ({
  AdminUser: { findAll: jest.fn() },
  Enrollment: { findAll: jest.fn() },
}));

import { AdminUser, Enrollment } from '../../../models';
import {
  adminLabel,
  memberLabel,
  NOT_RECORDED,
  resolveUploaders,
  shortId,
  SYSTEM_ACTORS,
  systemActorLabel,
  unknownLabel,
} from '../uploaderLabels';

const ADMIN_ID = '7b9de398-8bf0-48eb-8e0d-57ef37e3a110';
const MEMBER_ID = '4d3f1df8-cd0a-4b27-a27f-ec334cf42488';
const STUDIO_ID = '00000000-0000-4000-8000-c0ffee000084';

const mockAdmins = AdminUser.findAll as unknown as jest.Mock;
const mockMembers = Enrollment.findAll as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  mockAdmins.mockResolvedValue([]);
  mockMembers.mockResolvedValue([]);
});

describe('pure labelling', () => {
  it('names the thumbnail studio rather than calling it unknown', () => {
    expect(systemActorLabel(STUDIO_ID)).toEqual({
      id: STUDIO_ID,
      label: SYSTEM_ACTORS[STUDIO_ID],
      source: 'system',
    });
  });

  it('treats an unnamed id in the synthetic namespace as a machine, not a mystery', () => {
    const other = '00000000-0000-4000-8000-abcdef123456';
    expect(systemActorLabel(other)).toEqual({
      id: other,
      label: 'Automated process (00000000)',
      source: 'system',
    });
  });

  it('does not mistake a real uuid for a machine', () => {
    expect(systemActorLabel(ADMIN_ID)).toBeNull();
    expect(systemActorLabel(MEMBER_ID)).toBeNull();
  });

  it('falls back to email when an admin has no display name', () => {
    // Measured: 50 admin rows, only 36 carry a display_name.
    expect(adminLabel({ id: ADMIN_ID, display_name: null, email: 'admin@colaberry.com' }).label)
      .toBe('admin@colaberry.com');
  });

  it('prefers the display name when there is one', () => {
    expect(adminLabel({ id: ADMIN_ID, display_name: 'Ali M', email: 'a@b.com' }).label).toBe('Ali M');
  });

  it('never produces an empty label, even with nothing to go on', () => {
    expect(adminLabel({ id: ADMIN_ID, display_name: '  ', email: '' }).label).toBe('Admin (7b9de398)');
    expect(memberLabel({ id: MEMBER_ID, full_name: null }).label).toBe('Member (4d3f1df8)');
    expect(unknownLabel(ADMIN_ID).label).toBe('Unknown (7b9de398)');
    expect(NOT_RECORDED.label).toBe('Not recorded');
  });

  it('cites a uuid the way a human does', () => {
    expect(shortId(ADMIN_ID)).toBe('7b9de398');
  });
});

describe('resolveUploaders', () => {
  it('resolves an admin, an enrollment and a machine in one pass', async () => {
    mockAdmins.mockResolvedValue([{ id: ADMIN_ID, display_name: null, email: 'admin@colaberry.com' }]);
    mockMembers.mockResolvedValue([{ id: MEMBER_ID, full_name: 'Sohail Syed' }]);

    const got = await resolveUploaders([ADMIN_ID, MEMBER_ID, STUDIO_ID, null]);

    expect(got.get(ADMIN_ID)).toMatchObject({ label: 'admin@colaberry.com', source: 'admin' });
    expect(got.get(MEMBER_ID)).toMatchObject({ label: 'Sohail Syed', source: 'member' });
    expect(got.get(STUDIO_ID)).toMatchObject({ source: 'system' });
    expect(got.has('null')).toBe(false);
  });

  it('never asks the database about a machine id', async () => {
    await resolveUploaders([STUDIO_ID]);
    expect(mockAdmins).not.toHaveBeenCalled();
    expect(mockMembers).not.toHaveBeenCalled();
  });

  it('only asks enrollments about ids the admin table did not claim', async () => {
    mockAdmins.mockResolvedValue([{ id: ADMIN_ID, display_name: 'Admin', email: null }]);
    await resolveUploaders([ADMIN_ID, MEMBER_ID]);
    expect(mockMembers).toHaveBeenCalledTimes(1);
    expect(mockMembers.mock.calls[0][0].where.id).toEqual([MEMBER_ID]);
  });

  it('batches: one query per table however many ids there are', async () => {
    await resolveUploaders([ADMIN_ID, MEMBER_ID, ADMIN_ID, MEMBER_ID]);
    expect(mockAdmins).toHaveBeenCalledTimes(1);
    expect(mockMembers).toHaveBeenCalledTimes(1);
    // Deduped, so the same uploader is asked about once.
    expect(mockAdmins.mock.calls[0][0].where.id).toEqual([ADMIN_ID, MEMBER_ID]);
  });

  it('reports an id that resolves nowhere as unknown, not as blank', async () => {
    const got = await resolveUploaders([ADMIN_ID]);
    expect(got.get(ADMIN_ID)).toEqual({ id: ADMIN_ID, label: 'Unknown (7b9de398)', source: 'unknown' });
  });

  it('degrades to unknown when a lookup throws rather than failing the grid', async () => {
    mockAdmins.mockRejectedValue(new Error('connection reset'));
    mockMembers.mockRejectedValue(new Error('connection reset'));
    const got = await resolveUploaders([ADMIN_ID]);
    expect(got.get(ADMIN_ID)).toMatchObject({ source: 'unknown' });
  });

  it('does nothing at all for an empty or all-null input', async () => {
    expect((await resolveUploaders([])).size).toBe(0);
    expect((await resolveUploaders([null, undefined, ''])).size).toBe(0);
    expect(mockAdmins).not.toHaveBeenCalled();
  });

  it('is idempotent: the same input twice gives the same answer', async () => {
    mockAdmins.mockResolvedValue([{ id: ADMIN_ID, display_name: 'Ali M', email: null }]);
    const first = await resolveUploaders([ADMIN_ID, STUDIO_ID]);
    const second = await resolveUploaders([ADMIN_ID, STUDIO_ID]);
    expect(Array.from(second.entries())).toEqual(Array.from(first.entries()));
  });
});
