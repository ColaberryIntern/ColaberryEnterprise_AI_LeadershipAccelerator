/**
 * AF2.3 — the five Agent Factory domain roles reach their own department and nothing else.
 *
 * ## What these roles are for
 *
 * An intern owns exactly ONE department and must be able to read AND update it. Before this, the
 * narrowest role reaching `campaigns`, `system` or `war_room` was `admin` — 13 of the 14 sections —
 * so scoping an intern to their own department could not be expressed, and the quick path was to
 * hand out Admin and call it scoped. The ticket named that trap explicitly.
 *
 * ## Why the assertions are written this way
 *
 * Each role is checked against EVERY section, not against a hand-picked few. A test that asserts
 * "marketing reaches campaigns" and stops cannot fail when marketing silently also reaches
 * `system`, which is the only failure anybody cares about. So the shape is: for every role, the
 * set of sections it reaches is compared to the set it should reach, exactly.
 *
 * `roleCanAccessSection` is the authoritative check — the same function the gate calls — rather
 * than reading `MGMT_ROLE_DEFS[role].sections` directly, which would just be re-reading the
 * fixture through a different name.
 */
import {
  ALL_SECTIONS, MGMT_ROLE_DEFS, MGMT_ROLES, roleCanAccessSection, sectionsForRole,
  type MgmtRole, type SectionKey,
} from '../mgmtRoles';

/** The five new roles and the exact sections each is supposed to reach. Hand-written on purpose. */
const DOMAIN_ROLES: ReadonlyArray<readonly [MgmtRole, SectionKey[], string]> = [
  ['marketing', ['dashboard', 'campaigns', 'brands'], 'Sarbjit - campaigns AND brands; brands is listed so the 16 Oct section split did not quietly take it away'],
  ['platform', ['dashboard', 'system'], 'Quincy — tickets, reports, settings, events, automation'],
  ['executive', ['dashboard', 'trust', 'war_room'], 'the executive surfaces'],
  ['lead_intake', ['dashboard', 'lead_ingestion'], 'Kalkidan — intake WITHOUT the internship queue'],
  ['internship_review', ['dashboard', 'internship'], 'Tashima - the queue WITHOUT lead intake'],
  ['product_experience', ['dashboard', 'brands'], 'Mihret - the websites, and NOT the campaign tooling around them'],
];

describe('AF2.3 Agent Factory domain roles', () => {
  it.each(DOMAIN_ROLES)('%s reaches exactly its own sections and no others', (role, expected) => {
    const reached = ALL_SECTIONS.filter((s) => roleCanAccessSection(role, s));
    expect([...reached].sort()).toEqual([...expected].sort());
  });

  it.each(DOMAIN_ROLES)('%s is a strict subset of admin', (role) => {
    // Every one of these exists to be NARROWER than admin. If one ever reaches something admin
    // does not, it has stopped being a scoped role and nobody would notice from its name.
    const adminSections = new Set(sectionsForRole('admin'));
    const extra = sectionsForRole(role).filter((s) => !adminSections.has(s));
    expect(extra).toEqual([]);
  });

  it('each domain role is strictly narrower than admin, not equal to it', () => {
    for (const [role] of DOMAIN_ROLES) {
      expect(sectionsForRole(role).length).toBeLessThan(sectionsForRole('admin').length);
    }
  });
});

describe('AF2.3 the admissions split actually separates the two interns', () => {
  // The whole point of adding two roles instead of narrowing one. If these two ever overlap
  // beyond the shared landing page, Kalkidan and Tashima are back to holding each other's domain.
  it('lead_intake does NOT reach the internship queue', () => {
    // The queue carries applicant resumes, phone numbers and interview transcripts.
    expect(roleCanAccessSection('lead_intake', 'internship')).toBe(false);
  });

  it('internship_review does NOT reach lead ingestion', () => {
    expect(roleCanAccessSection('internship_review', 'lead_ingestion')).toBe(false);
  });

  it('the two overlap on dashboard and nothing else', () => {
    const a = new Set(sectionsForRole('lead_intake'));
    const shared = sectionsForRole('internship_review').filter((s) => a.has(s));
    expect(shared).toEqual(['dashboard']);
  });

  it('the pre-existing admissions role is UNCHANGED', () => {
    // Dhee holds it and runs the internship end to end. Narrowing it would have been the obvious
    // fix and would have quietly taken a working surface from someone outside this change.
    expect([...sectionsForRole('admissions')].sort())
      .toEqual(['dashboard', 'internship', 'lead_ingestion']);
  });
});

describe('AF2.3 no existing role was widened', () => {
  /** The seven roles as they stood before AF2.3, transcribed from the definitions at the time. */
  const BEFORE: Record<string, SectionKey[]> = {
    owner: [...ALL_SECTIONS],
    admin: ALL_SECTIONS.filter((s) => s !== 'inbox_content'),
    curriculum: ['dashboard', 'program'],
    revenue: ['dashboard', 'revenue', 'leads'],
    admissions: ['dashboard', 'lead_ingestion', 'internship'],
    support: ['students'],
    community_organizer: ['dashboard'],
    mentor: ['dashboard', 'career_review'],
  };

  it.each(Object.keys(BEFORE))('%s grants exactly what it granted before', (role) => {
    // AF2.3's fourth acceptance criterion, asserted rather than left to `git diff` to prove.
    expect([...sectionsForRole(role)].sort()).toEqual([...BEFORE[role]].sort());
  });

  it('owner still sees everything and admin still lacks exactly inbox_content', () => {
    expect(sectionsForRole('owner').length).toBe(ALL_SECTIONS.length);
    const missing = ALL_SECTIONS.filter((s) => !roleCanAccessSection('admin', s));
    expect(missing).toEqual(['inbox_content']);
  });
});

describe('AF2.3 the role table stays coherent', () => {
  it('every declared role has a definition, a label and at least one section', () => {
    for (const role of MGMT_ROLES) {
      const def = MGMT_ROLE_DEFS[role];
      expect(def).toBeDefined();
      expect(def.role).toBe(role);
      expect(def.label.length).toBeGreaterThan(0);
      // A role with no sections is deny-everything, which is indistinguishable from a broken
      // account for whoever holds it.
      expect(def.sections.length).toBeGreaterThan(0);
    }
  });

  it('no definition references a section key that does not exist', () => {
    const known = new Set<string>(ALL_SECTIONS);
    for (const role of MGMT_ROLES) {
      const unknown = MGMT_ROLE_DEFS[role].sections.filter((s) => !known.has(s));
      expect(unknown).toEqual([]);
    }
  });

  it('every role name fits the VARCHAR(20) column it is stored in', () => {
    // `internship_review` is 17 and `community_organizer` is 19. A 21-character role would be
    // accepted by TypeScript, pass the CHECK constraint, and be truncated on write.
    for (const role of MGMT_ROLES) expect(role.length).toBeLessThanOrEqual(20);
  });

  it('unknown roles still get nothing', () => {
    expect(sectionsForRole('marketing_manager')).toEqual([]);
    expect(sectionsForRole(undefined)).toEqual([]);
    expect(roleCanAccessSection('Marketing', 'campaigns')).toBe(false); // case matters
  });
});
