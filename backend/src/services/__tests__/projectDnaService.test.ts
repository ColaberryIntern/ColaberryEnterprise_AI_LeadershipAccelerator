import { saveProjectDna, getProjectDna, ProjectDnaInput } from '../projectDnaService';
import ProjectDna from '../../models/ProjectDna';
import { sequelize } from '../../config/database';

jest.mock('../../models/ProjectDna');
jest.mock('../../config/database', () => ({
  sequelize: { query: jest.fn() },
}));

const VALID_INPUT: ProjectDnaInput = {
  businessProblem: 'Support team spends 4 hours/day on repetitive questions',
  targetUser: 'Internal support agents',
  industry: 'technology',
  orientation: 'internal',
  focus: 'operational',
  projectTypes: ['agent'],
  dataSources: ['database'],
  aiComponents: ['claude', 'agents'],
  industryTrack: 'AI for Enterprise Operations',
};

const ENROLLMENT_ID = 'enrollment-uuid-1234';

const DB_ROW = {
  id: 'dna-uuid-5678',
  enrollment_id: ENROLLMENT_ID,
  business_problem: VALID_INPUT.businessProblem,
  target_user: VALID_INPUT.targetUser,
  industry: VALID_INPUT.industry,
  orientation: VALID_INPUT.orientation,
  focus: VALID_INPUT.focus,
  project_types: VALID_INPUT.projectTypes,
  data_sources: VALID_INPUT.dataSources,
  ai_components: VALID_INPUT.aiComponents,
  industry_track: VALID_INPUT.industryTrack,
  created_at: new Date('2026-06-08T00:00:00Z'),
  updated_at: new Date('2026-06-08T00:00:00Z'),
};

describe('projectDnaService', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('saveProjectDna', () => {
    it('upserts and returns the saved row', async () => {
      (sequelize.query as jest.Mock).mockResolvedValue([[], 1]);
      (ProjectDna.findOne as jest.Mock).mockResolvedValue(DB_ROW);

      const result = await saveProjectDna(ENROLLMENT_ID, VALID_INPUT);

      expect(sequelize.query).toHaveBeenCalledTimes(1);
      const [sql] = (sequelize.query as jest.Mock).mock.calls[0];
      expect(sql).toContain('ON CONFLICT (enrollment_id) DO UPDATE SET');
      expect(ProjectDna.findOne).toHaveBeenCalledWith({ where: { enrollment_id: ENROLLMENT_ID } });
      expect(result.enrollment_id).toBe(ENROLLMENT_ID);
      expect(result.industry_track).toBe(VALID_INPUT.industryTrack);
    });

    it('throws when the row is not found after upsert', async () => {
      (sequelize.query as jest.Mock).mockResolvedValue([[], 1]);
      (ProjectDna.findOne as jest.Mock).mockResolvedValue(null);

      await expect(saveProjectDna(ENROLLMENT_ID, VALID_INPUT)).rejects.toThrow(
        'ProjectDna upsert succeeded but row not found'
      );
    });

    it('is idempotent: calling twice with same data does not throw', async () => {
      (sequelize.query as jest.Mock).mockResolvedValue([[], 1]);
      (ProjectDna.findOne as jest.Mock).mockResolvedValue(DB_ROW);

      await saveProjectDna(ENROLLMENT_ID, VALID_INPUT);
      await saveProjectDna(ENROLLMENT_ID, VALID_INPUT);

      expect(sequelize.query).toHaveBeenCalledTimes(2);
    });
  });

  describe('getProjectDna', () => {
    it('returns the row for a known enrollment', async () => {
      (ProjectDna.findOne as jest.Mock).mockResolvedValue(DB_ROW);

      const result = await getProjectDna(ENROLLMENT_ID);

      expect(result).not.toBeNull();
      expect(result!.enrollment_id).toBe(ENROLLMENT_ID);
    });

    it('returns null when no row exists', async () => {
      (ProjectDna.findOne as jest.Mock).mockResolvedValue(null);

      const result = await getProjectDna(ENROLLMENT_ID);

      expect(result).toBeNull();
    });
  });
});
