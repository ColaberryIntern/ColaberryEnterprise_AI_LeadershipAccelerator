import { AI_ORG, findEmployee, directors, chiefOfStaff } from '../orgRegistry';

const OPS_DOMAINS = ['student_success', 'career', 'certification', 'curriculum', 'finance', 'operations', 'community'];

describe('AI organization registry', () => {
  it('has a CEO with no supervisor and a Chief of Staff reporting to the CEO', () => {
    const ceo = findEmployee('ceo')!;
    expect(ceo.supervisor).toBeNull();
    expect(chiefOfStaff().supervisor).toBe('ceo');
  });

  it('every director reports to the Chief of Staff', () => {
    const ds = directors();
    expect(ds.length).toBeGreaterThanOrEqual(8);
    ds.forEach((d) => expect(d.supervisor).toBe('chief_of_staff'));
  });

  it('every ops_domain maps to a real Operations-Center director domain', () => {
    AI_ORG.filter((e) => e.ops_domain).forEach((e) => expect(OPS_DOMAINS).toContain(e.ops_domain));
  });

  it('every employee has a mission, responsibilities and KPIs', () => {
    AI_ORG.forEach((e) => {
      expect(e.name).toBeTruthy();
      expect(e.mission.length).toBeGreaterThan(10);
      expect(e.responsibilities.length).toBeGreaterThan(0);
      expect(e.kpis.length).toBeGreaterThan(0);
    });
  });

  it('slugs are unique', () => {
    const slugs = AI_ORG.map((e) => e.slug);
    expect(new Set(slugs).size).toBe(slugs.length);
  });
});
