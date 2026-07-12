import { getCourseLinkMap } from '../courseLinkService';
import CurriculumCourseLink from '../../models/CurriculumCourseLink';

jest.mock('../../models/CurriculumCourseLink');

const ROWS = [
  { module_number: 2, provider: 'skilljar', course_title: 'Introduction to Agent Skills', course_url: 'https://anthropic.skilljar.com/introduction-to-agent-skills', link_status: 'confirmed' },
  { module_number: 7, provider: 'skilljar', course_title: 'Introduction to Subagents', course_url: 'https://anthropic.skilljar.com/introduction-to-subagents', link_status: 'pending_confirmation' },
  { module_number: 4, provider: 'colaberry_original', course_title: 'Prompt Engineering (Colaberry-original)', course_url: null, link_status: 'not_applicable' },
];

describe('getCourseLinkMap', () => {
  beforeEach(() => jest.clearAllMocks());

  it('returns a map keyed by module_number (happy path)', async () => {
    (CurriculumCourseLink.findAll as jest.Mock).mockResolvedValue(ROWS);

    const map = await getCourseLinkMap();

    expect(map.size).toBe(3);
    expect(map.get(2)!.link_status).toBe('confirmed');
    expect(map.get(2)!.course_url).toContain('anthropic.skilljar.com');
    expect(map.get(7)!.link_status).toBe('pending_confirmation');
    expect(map.get(4)!.course_url).toBeNull();
  });

  it('returns an empty map when the catalog is empty (boundary)', async () => {
    (CurriculumCourseLink.findAll as jest.Mock).mockResolvedValue([]);

    const map = await getCourseLinkMap();

    expect(map.size).toBe(0);
  });

  it('fails soft: returns an empty map without throwing when the table is missing (failure path)', async () => {
    (CurriculumCourseLink.findAll as jest.Mock).mockRejectedValue(
      new Error('relation "curriculum_course_links" does not exist')
    );

    const map = await getCourseLinkMap();

    expect(map.size).toBe(0);
  });

  it('fails soft on a generic DB error too (failure path)', async () => {
    (CurriculumCourseLink.findAll as jest.Mock).mockRejectedValue(new Error('connection terminated'));

    await expect(getCourseLinkMap()).resolves.toBeInstanceOf(Map);
    const map = await getCourseLinkMap();
    expect(map.size).toBe(0);
  });
});
