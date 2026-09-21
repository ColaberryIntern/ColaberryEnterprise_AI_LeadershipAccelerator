/**
 * The two project id spaces must not be crossable. The compile-time guard is validated by tsc
 * (the @ts-expect-error directives below fail the typecheck if crossing ever becomes legal);
 * the runtime resolution goes only through the DeliveryProjectSourceLink bridge and returns
 * null when unlinked (never a guess).
 */
const findOne = jest.fn();
jest.mock('../../../models/DeliveryProjectSourceLink', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => findOne(...a) },
}));

import {
  resolveStudentProject, resolveDeliveryProject, asDeliveryProjectId, asStudentProjectId,
} from '../projectIdentityMap';

// Type-level only — never executed; tsc validates the @ts-expect-error directives. If crossing
// the id spaces ever compiles, the "unused directive" error fails the typecheck here.
async function _typeGuards(): Promise<void> {
  const student = asStudentProjectId('sp');
  const delivery = asDeliveryProjectId('dp');
  // @ts-expect-error a StudentProjectId is not a DeliveryProjectId
  await resolveStudentProject(student);
  // @ts-expect-error a DeliveryProjectId is not a StudentProjectId
  await resolveDeliveryProject(delivery);
  // The correct pairings DO compile:
  await resolveStudentProject(delivery);
  await resolveDeliveryProject(student);
}
void _typeGuards;

beforeEach(() => jest.clearAllMocks());

describe('projectIdentityMap resolves only through the bridge', () => {
  it('resolves the linked student build for a delivery project', async () => {
    findOne.mockResolvedValue({ student_project_id: 'sp-1', delivery_project_id: 'dp-1' });
    expect(await resolveStudentProject(asDeliveryProjectId('dp-1'))).toBe('sp-1');
    expect(findOne).toHaveBeenCalledWith({ where: { delivery_project_id: 'dp-1' } });
  });

  it('resolves the delivery parent for a student build', async () => {
    findOne.mockResolvedValue({ student_project_id: 'sp-1', delivery_project_id: 'dp-1' });
    expect(await resolveDeliveryProject(asStudentProjectId('sp-1'))).toBe('dp-1');
    expect(findOne).toHaveBeenCalledWith({ where: { student_project_id: 'sp-1' } });
  });

  it('returns null (never a guess) when there is no link', async () => {
    findOne.mockResolvedValue(null);
    expect(await resolveStudentProject(asDeliveryProjectId('dp-x'))).toBeNull();
    expect(await resolveDeliveryProject(asStudentProjectId('sp-x'))).toBeNull();
  });
});
