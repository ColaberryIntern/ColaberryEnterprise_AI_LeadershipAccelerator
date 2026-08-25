/**
 * Tests for what the Intern Delivery Command Center is allowed to show.
 *
 * The report harvests two whole Basecamp buckets, so the scope rule is the only
 * thing standing between "every intern project" and "every todo list Colaberry
 * has ever made". The invariants pinned here are the ones that would quietly
 * put an onboarding checklist, a staff workstream, or Ali's own list back on an
 * intern report, which is exactly the state this module was written to end.
 */
// eslint-disable-next-line @typescript-eslint/no-var-requires
const { classifyList, isInternPerson, isStaffPerson, isExcludedPerson } = require('../internDeliveryScope');

const INTERN = 48161826; // Harpreet Kaur
const INTERN_2 = 52003305; // Meera Hussain
const STAFF = 47335940; // Sohail Syed
const ALI = 17454835;

function list(over: Record<string, unknown> = {}) {
  return {
    projectId: 999999999,
    name: 'Some Project - BUILD (story-driven)',
    assigneeIds: [INTERN],
    deliveryTaskCount: 40,
    releaseCount: 10,
    ...over,
  };
}

describe('classifyList', () => {
  it('keeps a story-driven intern build', () => {
    expect(classifyList(list())).toMatchObject({ inScope: true, category: 'intern_project' });
  });

  it('keeps a short proposal list that has no releases but real tasks', () => {
    expect(classifyList(list({ name: 'Fairfax - PROPOSAL', releaseCount: 0, deliveryTaskCount: 7 })))
      .toMatchObject({ inScope: true });
  });

  // The four Gov Contracts interns Ali named, each holding a BUILD and a
  // PROPOSAL. All eight lists must survive the filter.
  it.each([
    [10068241172, 'Selective Service Modernization - BUILD (story-driven)', 48, 12],
    [10068253482, 'Selective Service Modernization - PROPOSAL', 11, 0],
    [10068130382, 'Detroit Voter Education - BUILD (story-driven)', 33, 8],
    [10067424410, 'Detroit Voter Education - PROPOSAL', 13, 0],
    [10068242125, 'VA ERP Integration - BUILD (story-driven)', 42, 11],
    [10068253407, 'VA ERP Integration - PROPOSAL', 11, 0],
    [10068243185, 'Fairfax Learning & Talent - BUILD (story-driven)', 53, 13],
    [10068253550, 'Fairfax Learning & Talent - PROPOSAL', 7, 0],
  ])('keeps Gov Contracts list %i (%s)', (projectId, name, tasks, releases) => {
    expect(classifyList(list({ projectId, name, deliveryTaskCount: tasks, releaseCount: releases })).inScope).toBe(true);
  });

  it('drops the onboarding checklist by id', () => {
    const v = classifyList(list({ projectId: 9538503852, name: 'Colaberry Internship Build System', deliveryTaskCount: 31, releaseCount: 0 }));
    expect(v.inScope).toBe(false);
    expect(v.category).toBe('program_admin');
    expect(v.reason).toMatch(/onboarding/i);
  });

  it('drops staff workstreams sitting in the Gov Contracts bucket', () => {
    expect(classifyList(list({ projectId: 10072806331, name: 'Gov Contracting Eligibility' })).category).toBe('staff');
    expect(classifyList(list({ projectId: 10081765998, name: 'Data Flotation -> Set-Aside Entity' })).category).toBe('staff');
  });

  // The safety net. Next year's onboarding list will have a new id, and nobody
  // will remember to deny it by hand.
  it.each([
    'New Internship Onboarding 2027',
    'Cohort 12 Orientation',
    'Internship Build System v2',
    'General housekeeping',
  ])('drops "%s" on the name pattern even with an unknown id', (name) => {
    expect(classifyList(list({ name, projectId: 123456 })).category).toBe('program_admin');
  });

  it('drops a list nobody but Ali holds tasks on', () => {
    const v = classifyList(list({ assigneeIds: [ALI] }));
    expect(v.inScope).toBe(false);
    expect(v.category).toBe('no_intern');
  });

  it('drops a list held only by staff', () => {
    expect(classifyList(list({ assigneeIds: [STAFF] })).category).toBe('no_intern');
  });

  it('keeps a list where an intern works alongside staff and Ali', () => {
    expect(classifyList(list({ assigneeIds: [ALI, STAFF, INTERN] })).inScope).toBe(true);
  });

  it('drops one-todo legacy stubs with no release structure', () => {
    expect(classifyList(list({ name: 'AZURE VM', deliveryTaskCount: 1, releaseCount: 0 })).category).toBe('stub');
    expect(classifyList(list({ name: 'Author AI', deliveryTaskCount: 2, releaseCount: 0 })).category).toBe('stub');
  });

  it('keeps a small list that has release structure, because that is a real build', () => {
    expect(classifyList(list({ deliveryTaskCount: 2, releaseCount: 3 })).inScope).toBe(true);
  });

  // Autonomous: 4 todos, three people, no releases. It is the shared list the
  // whole ownership change exists for, and it must stay on the report.
  it('keeps the Autonomous shared list', () => {
    expect(classifyList(list({
      projectId: 9688707052, name: 'Autonomous', deliveryTaskCount: 4, releaseCount: 0,
      assigneeIds: [INTERN, INTERN_2, 45962714],
    })).inScope).toBe(true);
  });

  it('gives a reason for every exclusion', () => {
    const dropped = [
      classifyList(list({ projectId: 9538503852 })),
      classifyList(list({ name: 'Onboarding' })),
      classifyList(list({ assigneeIds: [ALI] })),
      classifyList(list({ deliveryTaskCount: 1, releaseCount: 0 })),
    ];
    for (const v of dropped) {
      expect(v.inScope).toBe(false);
      expect(typeof v.reason).toBe('string');
      expect(v.reason.length).toBeGreaterThan(10);
    }
  });
});

describe('person classification', () => {
  it('treats the four Gov Contracts interns as interns', () => {
    // Obi, Omolola, Akiwam, Samrawit. All @colaberry.com or gmail, none staff.
    for (const id of [45500404, 40450956, 45962715, 44163449]) {
      expect(isStaffPerson(id)).toBe(false);
    }
  });

  it('excludes Ali and Ram from being interns without dropping staff twice', () => {
    expect(isInternPerson(ALI)).toBe(false);
    expect(isInternPerson(STAFF)).toBe(false);
    expect(isInternPerson(INTERN)).toBe(true);
  });

  // Staff must survive the harvest so their names still render on tasks they
  // hold; they are filtered later, at the roster.
  it('keeps staff in the harvest but off the intern roster', () => {
    expect(isExcludedPerson({ id: STAFF, name: 'Sohail Syed', email_address: 'sohail@colaberry.com' })).toBe(false);
    expect(isStaffPerson(STAFF)).toBe(true);
  });

  it('drops the audience and the bot twins from the harvest entirely', () => {
    expect(isExcludedPerson({ id: ALI, name: 'Ali Muwwakkil', email_address: 'ali@colaberry.com' })).toBe(true);
    expect(isExcludedPerson({ id: 999, name: 'Akiwam AI', email_address: 'akiwam+ai@gmail.com' })).toBe(true);
    expect(isExcludedPerson({ id: 998, name: 'CB System', email_address: 'ali+999@colaberry.com' })).toBe(true);
    expect(isExcludedPerson({ id: 997, name: 'Omolola Makinde AI', email_address: null })).toBe(true);
  });

  it('does not drop a real intern who happens to work at colaberry.com', () => {
    expect(isExcludedPerson({ id: 45500404, name: 'OBI, ANAMELECHI KINGSLEY', email_address: 'obi@colaberry.com' })).toBe(false);
  });
});
