/**
 * The launch gate: a curriculum type may be hand-placed on the timeline only if
 * it carries the Studio's "✓ Approved for curriculum" flag (same gate as the
 * Composer) and hasn't been deactivated. Covers both the Add-picker flag
 * (listTimeline.types[].launched) and the server-side enforcement (createCard).
 */
import { createCard, listTimeline } from '../timelineAdminService';
import TimelineCard from '../../../models/TimelineCard';
import CurriculumTypeDefinition from '../../../models/CurriculumTypeDefinition';

jest.mock('../../../models/TimelineCard', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findByPk: jest.fn(), create: jest.fn(), max: jest.fn() },
}));
jest.mock('../../../models/TimelineCardProgress', () => ({ __esModule: true, default: {} }));
jest.mock('../../../models/TimelineSectionRule', () => ({ __esModule: true, default: { findAll: jest.fn().mockResolvedValue([]) } }));
jest.mock('../../../models/CurriculumTypeDefinition', () => ({
  __esModule: true,
  default: { findAll: jest.fn(), findOne: jest.fn() },
}));
jest.mock('../../../config/database', () => ({ sequelize: { getQueryInterface: jest.fn(), transaction: jest.fn() } }));
jest.mock('../timelineService', () => ({ normalizeCapabilities: (c: any) => (Array.isArray(c) ? c : []) }));

const COHORT = '11111111-1111-1111-1111-111111111111';

describe('type launch gate', () => {
  beforeEach(() => jest.clearAllMocks());

  describe('createCard enforcement', () => {
    it('rejects a type that is not approved for curriculum', async () => {
      (CurriculumTypeDefinition.findOne as jest.Mock).mockResolvedValue({ slug: 'video', approved: false, is_active: true });
      await expect(createCard({ cohort_id: COHORT, type: 'video' })).rejects.toThrow(/not approved for curriculum/);
      expect(TimelineCard.create).not.toHaveBeenCalled();
    });

    it('rejects an approved type that has been deactivated', async () => {
      (CurriculumTypeDefinition.findOne as jest.Mock).mockResolvedValue({ slug: 'video', approved: true, is_active: false });
      await expect(createCard({ cohort_id: COHORT, type: 'video' })).rejects.toThrow(/not approved for curriculum/);
    });

    it('rejects a type with no Studio definition at all', async () => {
      (CurriculumTypeDefinition.findOne as jest.Mock).mockResolvedValue(null);
      await expect(createCard({ cohort_id: COHORT, type: 'video' })).rejects.toThrow(/not approved for curriculum/);
    });

    it('creates when the type is approved + active', async () => {
      (CurriculumTypeDefinition.findOne as jest.Mock).mockResolvedValue({ slug: 'video', approved: true, is_active: true });
      (TimelineCard.max as jest.Mock).mockResolvedValue(2);
      (TimelineCard.create as jest.Mock).mockResolvedValue({ id: 'card-1' });
      const card = await createCard({ cohort_id: COHORT, type: 'video' });
      expect(card).toEqual({ id: 'card-1' });
      expect(TimelineCard.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('listTimeline launched flag', () => {
    it('marks only approved+active types as launched', async () => {
      (TimelineCard.findAll as jest.Mock).mockResolvedValue([]);
      (CurriculumTypeDefinition.findAll as jest.Mock).mockResolvedValue([
        { slug: 'video', capabilities: [], approved: true, is_active: true },
        { slug: 'podcast', capabilities: [], approved: false, is_active: true },
        { slug: 'testimonial', capabilities: [], approved: true, is_active: false },
      ]);
      const board = await listTimeline();
      const by = (s: string) => board.types.find((t: any) => t.slug === s) as any;
      expect(by('video').launched).toBe(true);        // approved + active
      expect(by('podcast').launched).toBe(false);     // not approved
      expect(by('testimonial').launched).toBe(false); // approved but deactivated
      expect(by('blog').launched).toBe(false);        // no Studio row at all
      // ALL types are still returned so existing cards keep their labels/bands.
      expect(board.types.length).toBeGreaterThan(3);
    });
  });
});
