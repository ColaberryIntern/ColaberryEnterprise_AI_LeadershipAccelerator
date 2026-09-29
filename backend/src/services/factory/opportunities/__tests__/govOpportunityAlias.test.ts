/**
 * The alias link is idempotent, existence-checked, tenant-scoped, and never renames or qualifies the project.
 * One opportunity maps to one project: a second target for the same canonical id is a conflict, not a second row.
 */
const projFindByPk = jest.fn();
const aliasFindOne = jest.fn();
const aliasCreate = jest.fn();
jest.mock('../../../../models/DeliveryProject', () => ({ __esModule: true, default: { findByPk: (...a: any[]) => projFindByPk(...a) } }));
jest.mock('../../../../models/GovOpportunityAlias', () => ({
  __esModule: true,
  default: { findOne: (...a: any[]) => aliasFindOne(...a), create: (...a: any[]) => aliasCreate(...a) },
}));

import {
  linkGovOpportunity, AliasProjectNotFoundError, AliasProjectNotGovernmentError, AliasConflictError,
} from '../govOpportunityAlias';
import { CLEAN_CANONICAL } from '../govOpportunityFixtures';

const govProject = { id: 'gov-dp-1', tenant_id: 'ten-1', project_class: 'government_public_sector' };
const input = (over: any = {}) => ({ tenantId: 'ten-1', deliveryProjectId: 'gov-dp-1', canonicalOpportunityId: CLEAN_CANONICAL, linkReason: 'matched by solicitation number', ...over });

beforeEach(() => { projFindByPk.mockReset(); aliasFindOne.mockReset(); aliasCreate.mockReset(); });

it('creates the alias when the gov project exists in-tenant and no link yet exists', async () => {
  projFindByPk.mockResolvedValue(govProject);
  aliasFindOne.mockResolvedValue(null);
  aliasCreate.mockResolvedValue({ id: 'al-1', delivery_project_id: 'gov-dp-1', canonical_opportunity_id: CLEAN_CANONICAL });
  const out = await linkGovOpportunity(input());
  expect(out.created).toBe(true);
  expect(out.deliveryProjectId).toBe('gov-dp-1');
  expect(aliasCreate).toHaveBeenCalledTimes(1);
});

it('is idempotent: an identical existing link returns created:false and writes nothing', async () => {
  projFindByPk.mockResolvedValue(govProject);
  aliasFindOne.mockResolvedValue({ id: 'al-1', delivery_project_id: 'gov-dp-1', canonical_opportunity_id: CLEAN_CANONICAL });
  const out = await linkGovOpportunity(input());
  expect(out.created).toBe(false);
  expect(aliasCreate).not.toHaveBeenCalled();
});

it('refuses when the canonical id is already linked to a DIFFERENT project (one opportunity, one project)', async () => {
  projFindByPk.mockResolvedValue(govProject);
  aliasFindOne.mockResolvedValue({ id: 'al-9', delivery_project_id: 'other-dp', canonical_opportunity_id: CLEAN_CANONICAL });
  await expect(linkGovOpportunity(input())).rejects.toBeInstanceOf(AliasConflictError);
  expect(aliasCreate).not.toHaveBeenCalled();
});

it('treats a project in another tenant as not found (no cross-tenant enumeration)', async () => {
  projFindByPk.mockResolvedValue({ ...govProject, tenant_id: 'ten-2' });
  await expect(linkGovOpportunity(input())).rejects.toBeInstanceOf(AliasProjectNotFoundError);
  expect(aliasCreate).not.toHaveBeenCalled();
});

it('refuses to alias a non-government project', async () => {
  projFindByPk.mockResolvedValue({ ...govProject, project_class: 'commercial_client' });
  await expect(linkGovOpportunity(input())).rejects.toBeInstanceOf(AliasProjectNotGovernmentError);
  expect(aliasCreate).not.toHaveBeenCalled();
});

it('refuses when the project does not exist (never creates one)', async () => {
  projFindByPk.mockResolvedValue(null);
  await expect(linkGovOpportunity(input())).rejects.toBeInstanceOf(AliasProjectNotFoundError);
  expect(aliasCreate).not.toHaveBeenCalled();
});
