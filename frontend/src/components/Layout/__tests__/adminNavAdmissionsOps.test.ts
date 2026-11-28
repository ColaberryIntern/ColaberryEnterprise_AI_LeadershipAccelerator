import { PINNED_LINKS, ALL_LINKS, sectionForPath } from '../adminNav';
import { SECTION_LABEL } from '../../../pages/admin/communityRoles/ExtraSectionsEditor';
import { SCREENS, OPS_BASE } from '../../../pages/admin/admissionsOps/screens';

/**
 * AO1.3 Admissions & Ops in the sidebar: one pinned entry under the admissions_ops section. Its 16 screens are
 * child paths of that one link, so ProtectedRoute resolves every one of them by prefix (sectionForPath), and the
 * same key gates the API (backend mgmtSectionGate.admissionsOps.test.ts). AdminLayout shows a pinned link when
 * canSection(link.section) is true, which is the rule asserted here.
 */
const entry = () => PINNED_LINKS.find((l) => l.path === OPS_BASE);
const visiblePinned = (held: string[]) => PINNED_LINKS.filter((l) => held.includes(l.section as string)).map((l) => l.label);

describe('AO1.3 Admissions & Ops nav entry', () => {
  it('is exactly one pinned link at /admin/admissions-ops under admissions_ops, in the jump list too', () => {
    expect(PINNED_LINKS.filter((l) => l.section === 'admissions_ops')).toHaveLength(1);
    expect(entry()).toMatchObject({ label: 'Admissions & Ops', section: 'admissions_ops' });
    expect(entry()!.newTab).toBeFalsy();
    expect(ALL_LINKS.some((l) => l.path === OPS_BASE)).toBe(true);
  });

  it('sits right after Trust Center, as in the demo', () => {
    const labels = PINNED_LINKS.map((l) => l.label);
    expect(labels.indexOf('Admissions & Ops')).toBe(labels.indexOf('Trust Center') + 1);
  });

  it('resolves every one of the 16 screen paths to admissions_ops', () => {
    for (const s of SCREENS) {
      const p = s.path ? `${OPS_BASE}/${s.path.replace(':ref', 'abc-123')}` : OPS_BASE;
      expect({ path: p, section: sectionForPath(p) }).toEqual({ path: p, section: 'admissions_ops' });
    }
  });

  it('does not capture lookalikes or Dhee\'s admissions surfaces', () => {
    expect(sectionForPath('/admin/admissions-opsx')).not.toBe('admissions_ops');
    expect(sectionForPath('/admin/admissions')).not.toBe('admissions_ops');
  });

  it('shows for a holder of the section and not for anyone without it', () => {
    expect(visiblePinned(['dashboard', 'admissions_ops'])).toContain('Admissions & Ops');
    expect(visiblePinned(['dashboard', 'lead_ingestion', 'internship'])).not.toContain('Admissions & Ops');
    expect(visiblePinned(['dashboard', 'students', 'revenue', 'leads'])).not.toContain('Admissions & Ops');
  });

  it('is offered as an extra section with its sidebar name', () => {
    expect(SECTION_LABEL.admissions_ops).toBe('Admissions & Ops');
  });
});
