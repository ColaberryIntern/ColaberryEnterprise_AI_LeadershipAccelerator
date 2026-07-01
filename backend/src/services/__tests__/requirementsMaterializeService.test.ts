import {
  sectionToClusterCode, toKeyedRequirements, materializeRequirementsFromDocument,
} from '../requirementsMaterializeService';
import RequirementsMap from '../../models/RequirementsMap';

jest.mock('../../models/RequirementsMap', () => ({ __esModule: true, default: { findOrCreate: jest.fn() } }));

describe('requirementsMaterializeService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('sectionToClusterCode (pure)', () => {
    it('maps known sections to short codes (non-functional before functional)', () => {
      expect(sectionToClusterCode('Functional Requirements')).toBe('FUNC');
      expect(sectionToClusterCode('Non-Functional Requirements')).toBe('NFR');
      expect(sectionToClusterCode('Security & Compliance')).toBe('SEC');
      expect(sectionToClusterCode('System Architecture')).toBe('ARCH');
      expect(sectionToClusterCode('Observability')).toBe('OBS');
    });
    it('falls back to a first-word code for unknown sections', () => {
      expect(sectionToClusterCode('Billing Rules')).toBe('BILLING');
      expect(sectionToClusterCode('Requirements')).toBe('GEN');
    });
  });

  describe('toKeyedRequirements (pure)', () => {
    it('produces CLUSTER.NNN keys, numbering within a cluster across sections', () => {
      const parsed = {
        total_requirements: 3,
        flat: [],
        sections: [
          { name: 'Functional Requirements', requirements: [
            { key: 'REQ-001', text: 'Users can log in', section: 'Functional Requirements' },
            { key: 'REQ-002', text: 'Users can reset password', section: 'Functional Requirements' },
          ] },
          { name: 'Security', requirements: [
            { key: 'REQ-003', text: 'All input is validated', section: 'Security' },
          ] },
        ],
      } as any;
      const rows = toKeyedRequirements(parsed);
      expect(rows.map(r => r.requirement_key)).toEqual(['FUNC.001', 'FUNC.002', 'SEC.001']);
      expect(rows[0].cluster).toBe('FUNC');
      expect(rows[2].requirement_text).toBe('All input is validated');
    });
  });

  describe('materializeRequirementsFromDocument', () => {
    it('parses a doc into keyed rows and idempotently upserts each (CLUSTER.NNN keys)', async () => {
      (RequirementsMap.findOrCreate as jest.Mock).mockResolvedValue([{}, true]);
      const doc = [
        '## Functional Requirements',
        '- Users can search the pantry for ingredients',
        '- The system suggests three recipes from available items',
        '## Security',
        '- All user input is validated before use',
      ].join('\n');

      const count = await materializeRequirementsFromDocument('proj-1', doc);

      expect(count).toBe(3);
      expect(RequirementsMap.findOrCreate).toHaveBeenCalledTimes(3);
      const keys = (RequirementsMap.findOrCreate as jest.Mock).mock.calls.map(c => c[0].where.requirement_key);
      expect(keys).toEqual(['FUNC.001', 'FUNC.002', 'SEC.001']);
      const firstDefaults = (RequirementsMap.findOrCreate as jest.Mock).mock.calls[0][0].defaults;
      expect(firstDefaults.project_id).toBe('proj-1');
      expect(firstDefaults.is_active).toBe(true);
    });

    it('is a no-op for an empty document', async () => {
      expect(await materializeRequirementsFromDocument('proj-1', '')).toBe(0);
      expect(RequirementsMap.findOrCreate).not.toHaveBeenCalled();
    });
  });
});
