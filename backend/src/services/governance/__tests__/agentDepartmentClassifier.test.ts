import { classifyAgentDepartment, DEPARTMENT_SLUGS } from '../agentDepartmentClassifier';

describe('classifyAgentDepartment', () => {
  it('auto-classifies a straightforward category to its real department, with confidence "auto"', () => {
    const result = classifyAgentDepartment('AdmissionsReportingAgent', 'admissions');

    expect(result).toEqual({
      department: 'admissions',
      confidence: 'auto',
      reason: expect.stringContaining('category "admissions"'),
    });
  });

  it.each([
    ['accelerator', 'education'],
    ['curriculum', 'education'],
    ['openclaw', 'marketing'],
    ['outbound', 'marketing'],
    ['skool', 'marketing'],
    ['executive', 'executive'],
    ['behavioral', 'intelligence'],
    ['autonomous', 'intelligence'],
    ['ai_ops', 'intelligence'],
    ['meta', 'intelligence'],
    ['memory', 'intelligence'],
    ['operations', 'operations'],
    ['maintenance', 'platform'],
    ['admissions_ops', 'admissions'],
    ['strategic', 'strategy'],
    ['student_success', 'student_success'],
    ['security_ops', 'security'],
    ['governance_ops', 'governance'],
    ['reporting', 'reporting'],
  ])('category "%s" auto-classifies to department "%s"', (category, expectedDept) => {
    const result = classifyAgentDepartment('SomeAgentName', category);
    expect(result.department).toBe(expectedDept);
    expect(result.confidence).toBe('auto');
    expect(DEPARTMENT_SLUGS).toContain(expectedDept as any);
  });

  it('a per-agent override wins even when a category mapping would also apply', () => {
    // AdmissionsSuperAgent carries category 'dept_super', which has no
    // category-level mapping — proves the override path is what fires, not
    // a coincidental category match.
    const result = classifyAgentDepartment('AdmissionsSuperAgent', 'dept_super');

    expect(result.department).toBe('admissions');
    expect(result.confidence).toBe('needs_review'); // per-agent overrides are always flagged for review
  });

  it.each([
    'AnalyticsEngineSuperAgent',
    'CampaignOpsSuperAgent',
    'ContentEngineSuperAgent',
    'LeadIntelligenceSuperAgent',
    'SystemResilienceSuperAgent',
    'WorkforceCareerDirector',
    'WorkforceCertificationDirector',
    'WorkforceCommunityDirector',
    'WorkforceCurriculumDirector',
    'WorkforceFinanceDirector',
    'WorkforceMarketingDirector',
    'WorkforceOperationsDirector',
    'WorkforceResearchDirector',
    'WorkforceStudentSuccessDirector',
    'WorkforceTechnologyDirector',
  ])('cross-cutting agent %s gets a real department slug from its per-agent override, never a category guess', (agentName) => {
    const result = classifyAgentDepartment(agentName, 'dept_super');
    expect(result.department).not.toBeNull();
    expect(DEPARTMENT_SLUGS).toContain(result.department as any);
    expect(result.confidence).toBe('needs_review');
  });

  it('honesty path: a genuinely company-wide agent (WorkforceIntelligence) gets department:null, never a forced single department', () => {
    const result = classifyAgentDepartment('WorkforceIntelligence', 'company');

    expect(result.department).toBeNull();
    expect(result.confidence).toBe('needs_review');
    expect(result.reason).toContain('company-wide');
  });

  it('boundary: an unrecognized category with no known mapping returns null, disclosed honestly, never a fabricated guess', () => {
    const result = classifyAgentDepartment('SomeFutureAgent', 'a_brand_new_category_nobody_has_seen');

    expect(result.department).toBeNull();
    expect(result.confidence).toBe('needs_review');
    expect(result.reason).toContain('a_brand_new_category_nobody_has_seen');
  });

  it('boundary: a null category (no category at all) returns null, never a fabricated guess', () => {
    const result = classifyAgentDepartment('SomeAgentWithNoCategory', null);

    expect(result.department).toBeNull();
    expect(result.confidence).toBe('needs_review');
    expect(result.reason).toBe('agent has no category to classify from');
  });

  it('DEPARTMENT_SLUGS matches the real, live departments table exactly (18 slugs) — a regression guard if the table ever changes', () => {
    expect(DEPARTMENT_SLUGS).toHaveLength(18);
    expect(DEPARTMENT_SLUGS).toEqual(
      expect.arrayContaining([
        'admissions', 'alumni', 'education', 'executive', 'finance', 'governance',
        'growth', 'infrastructure', 'intelligence', 'marketing', 'operations',
        'orchestration', 'partnerships', 'platform', 'reporting', 'security',
        'strategy', 'student_success',
      ]),
    );
  });
});
