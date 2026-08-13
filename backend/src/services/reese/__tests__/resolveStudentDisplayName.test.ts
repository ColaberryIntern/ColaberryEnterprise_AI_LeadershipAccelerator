/**
 * Pins the real name resolution + fallback used to fix a real defect Ali found
 * live: ticket titles/descriptions used to embed the raw enrollment UUID
 * ("Reese autonomous outreach — inactivity (d6a4b017-...)") instead of the
 * student's name. The fallback path matters as much as the happy path — falling
 * back to printing the UUID would silently recreate the exact defect this
 * function exists to fix.
 */
jest.mock('../../../models/Enrollment', () => ({ findByPk: jest.fn() }));

import Enrollment from '../../../models/Enrollment';
import { resolveStudentDisplayName } from '../resolveStudentDisplayName';

const mockFindByPk = Enrollment.findByPk as unknown as jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
});

describe('resolveStudentDisplayName', () => {
  it('happy path: returns the enrollment\'s real full_name', async () => {
    mockFindByPk.mockResolvedValue({ full_name: 'Jordan Rivera' });

    const name = await resolveStudentDisplayName('d6a4b017-6716-4673-96b5-ab3074b70191');

    expect(name).toBe('Jordan Rivera');
    expect(mockFindByPk).toHaveBeenCalledWith('d6a4b017-6716-4673-96b5-ab3074b70191', { attributes: ['full_name'] });
  });

  it('failure path: no matching enrollment falls back to a generic, non-UUID phrase rather than throwing', async () => {
    mockFindByPk.mockResolvedValue(null);

    const name = await resolveStudentDisplayName('d6a4b017-6716-4673-96b5-ab3074b70191');

    expect(name).toBe('a student');
    expect(name).not.toMatch(/[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/i);
  });

  it('boundary: an enrollment row with a falsy full_name still falls back rather than returning an empty string', async () => {
    mockFindByPk.mockResolvedValue({ full_name: '' });

    const name = await resolveStudentDisplayName('some-id');

    expect(name).toBe('a student');
  });

  it('propagates a real DB error rather than masking it as a silent fallback', async () => {
    mockFindByPk.mockRejectedValue(new Error('connection reset'));

    await expect(resolveStudentDisplayName('some-id')).rejects.toThrow('connection reset');
  });
});
