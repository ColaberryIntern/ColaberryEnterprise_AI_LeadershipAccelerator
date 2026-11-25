jest.mock('../../../../models/GovQualification', () => ({ __esModule: true, default: { findOne: jest.fn() } }));
jest.mock('../govCompanyLibrary', () => ({
  approvedGroundingFacts: jest.fn(),
  approvedReferences: jest.fn(),
  approvedPersonnel: jest.fn(),
}));

import { getGovDossier, tenantForDeliveryProject } from '../govDossier';
import GovQualification from '../../../../models/GovQualification';
import { approvedGroundingFacts, approvedReferences, approvedPersonnel } from '../govCompanyLibrary';

const mock = <T>(fn: T) => fn as unknown as jest.Mock;

describe('govDossier (M4-T2)', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    mock(approvedGroundingFacts).mockResolvedValue([]);
    mock(approvedReferences).mockResolvedValue([]);
    mock(approvedPersonnel).mockResolvedValue([]);
  });

  it('resolves the tenant and returns the tenant-wide approved library', async () => {
    mock(GovQualification.findOne).mockResolvedValue({ tenant_id: 'tenant-1' });
    mock(approvedGroundingFacts).mockResolvedValue(['DUNS is 12-345-6789', 'Cage code is 1AB23']);
    mock(approvedReferences).mockResolvedValue([{ client: 'TxDOT', scope: 'claims', contractValue: null, dates: null, contact: null, subject: null }]);

    const d = await getGovDossier('dp-A');
    expect(d.tenantId).toBe('tenant-1');
    expect(d.facts).toContain('DUNS is 12-345-6789');
    expect(d.references[0].client).toBe('TxDOT');
  });

  it('CROSS-PROJECT: an answer in the tenant library reads back from a DIFFERENT gov project of the same tenant', async () => {
    // Both projects belong to the same company (tenant), so both resolve to the same library.
    mock(GovQualification.findOne).mockResolvedValue({ tenant_id: 'tenant-1' });
    mock(approvedGroundingFacts).mockResolvedValue(['Security posture: FedRAMP Moderate']);

    const fromA = await getGovDossier('dp-A'); // where the fact was answered
    const fromB = await getGovDossier('dp-B'); // a different bid, same company

    expect(fromA.tenantId).toBe('tenant-1');
    expect(fromB.tenantId).toBe('tenant-1');
    expect(fromB.facts).toEqual(fromA.facts);
    expect(fromB.facts).toContain('Security posture: FedRAMP Moderate'); // read back on another project
  });

  it('returns an empty dossier (not an error) when the project has no tenant', async () => {
    mock(GovQualification.findOne).mockResolvedValue(null);
    const d = await getGovDossier('dp-x');
    expect(d).toEqual({ tenantId: null, facts: [], references: [], personnel: [] });
    expect(mock(approvedGroundingFacts)).not.toHaveBeenCalled();
  });

  it('is fail-soft: a library read failure yields an empty section, not a throw', async () => {
    mock(GovQualification.findOne).mockResolvedValue({ tenant_id: 'tenant-1' });
    mock(approvedReferences).mockRejectedValue(new Error('db down'));
    mock(approvedGroundingFacts).mockResolvedValue(['a fact']);
    const d = await getGovDossier('dp-A');
    expect(d.facts).toEqual(['a fact']);
    expect(d.references).toEqual([]);
  });

  it('tenantForDeliveryProject returns null for a blank id without hitting the db', async () => {
    expect(await tenantForDeliveryProject('')).toBeNull();
    expect(mock(GovQualification.findOne)).not.toHaveBeenCalled();
  });
});
