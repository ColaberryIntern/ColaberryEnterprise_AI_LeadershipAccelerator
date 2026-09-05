import { LIFECYCLE_STAGES } from '../lifecycle';
import { MGMT_ROLE_DEFS } from '../../access/mgmtRoles';
import {
  canSeeStage,
  hasAnyPersonScope,
  needsPerRecordScope,
  sectionsWithPersonAccess,
  stagesForSection,
  visibleStagesForSections,
} from '../personScope';

const sectionsFor = (role: keyof typeof MGMT_ROLE_DEFS) =>
  MGMT_ROLE_DEFS[role].sections as readonly string[];

describe('person scope', () => {
  it('only names stages from the canonical vocabulary', () => {
    for (const section of ['leads', 'revenue', 'students', 'program', 'career_review']) {
      for (const stage of visibleStagesForSections([section])) {
        expect(LIFECYCLE_STAGES).toContain(stage);
      }
    }
  });

  it('denies person rows by default for an unknown or tooling-only section', () => {
    expect(visibleStagesForSections([])).toEqual([]);
    expect(visibleStagesForSections(['not_a_section'])).toEqual([]);
    // Tooling sections grant pages, not people.
    expect(hasAnyPersonScope(['dashboard'])).toBe(false);
    expect(hasAnyPersonScope(['system'])).toBe(false);
    expect(hasAnyPersonScope(['lead_ingestion'])).toBe(false);
    expect(hasAnyPersonScope(['campaigns'])).toBe(false);
  });

  // ── The case that forced this module to exist ─────────────────────────────

  it('never shows a support identity a lead or prospect', () => {
    // Support holds 'students' and nothing else. Opening People must not hand it
    // the acquisition database. The section check alone would have allowed it.
    const support = sectionsFor('support');
    expect(hasAnyPersonScope(support)).toBe(true);
    expect(canSeeStage(support, 'enrolled_student')).toBe(true);
    expect(canSeeStage(support, 'lead')).toBe(false);
    expect(canSeeStage(support, 'applicant')).toBe(false);
    expect(canSeeStage(support, 'anonymous_visitor')).toBe(false);
  });

  it('never shows a lead-queue identity an anonymous visitor it could not already see', () => {
    const revenue = sectionsFor('revenue');
    expect(canSeeStage(revenue, 'lead')).toBe(true);
    expect(canSeeStage(revenue, 'enrolled_student')).toBe(true);
  });

  it('grants every section a CONTIGUOUS run of stages', () => {
    // A gap means people vanish mid-journey and reappear later. Revenue had
    // exactly that: enrolled_student and graduate, but not the active_learner
    // stage between them, so anyone currently mid-programme dropped off a
    // revenue roster and came back on graduation. Nothing in the UI would show
    // it — the roster would just be quietly short.
    for (const section of sectionsWithPersonAccess()) {
      const indices = stagesForSection(section)
        .map((stage) => LIFECYCLE_STAGES.indexOf(stage))
        .sort((a, b) => a - b);
      expect(indices).not.toContain(-1);
      for (let i = 1; i < indices.length; i += 1) {
        expect(indices[i] - indices[i - 1]).toBe(1);
      }
    }
  });

  it('shows a mentor learners only, and flags that mentors need a second narrowing', () => {
    const mentor = sectionsFor('mentor');
    expect(canSeeStage(mentor, 'active_learner')).toBe(true);
    expect(canSeeStage(mentor, 'lead')).toBe(false);
    // The stage list is the CEILING for a mentor, not the answer — without the
    // per-mentor narrowing a mentor would see every learner on the platform.
    expect(needsPerRecordScope(mentor)).toContain('career_review');
  });

  it('gives a community organizer no person rows at all', () => {
    // Its only grant is a landing page; its real permission is feed moderation,
    // enforced elsewhere against mgmt_role.
    expect(hasAnyPersonScope(sectionsFor('community_organizer'))).toBe(false);
  });

  it('gives the owner every stage', () => {
    const owner = sectionsFor('owner');
    for (const stage of LIFECYCLE_STAGES) {
      expect(canSeeStage(owner, stage)).toBe(true);
    }
  });

  it('unions stages across sections rather than intersecting them', () => {
    const both = visibleStagesForSections(['leads', 'students']);
    expect(both).toContain('lead');
    expect(both).toContain('enrolled_student');
  });

  it('grants no stage that some single section did not already grant', () => {
    // Consolidation must not broaden access. Every stage an identity gets must
    // trace to one section it already holds.
    for (const role of Object.keys(MGMT_ROLE_DEFS) as Array<keyof typeof MGMT_ROLE_DEFS>) {
      const sections = sectionsFor(role);
      const combined = visibleStagesForSections(sections);
      const perSection = new Set(sections.flatMap((s) => visibleStagesForSections([s])));
      expect(combined.filter((s) => !perSection.has(s))).toEqual([]);
    }
  });
});
