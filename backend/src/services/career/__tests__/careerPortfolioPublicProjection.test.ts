/**
 * The public portfolio's boundary test.
 *
 * The most important case here is `leaks nothing`: it feeds a profile carrying EVERY
 * private field and asserts none of their values appear anywhere in the serialized
 * payload. It is written against the serialized string on purpose, so a field that
 * escapes through a nested object still trips it.
 */
import {
  projectPublicPortfolio,
  type PublicPortfolio,
} from '../careerPortfolioPublicProjection';

const AT = '2026-08-27T00:00:00.000Z';

/** A profile with every private field populated with a findable sentinel. */
const loadedProfile = () => ({
  identity: {
    full_name: 'Kesetebirhan Delele',
    email: 'SENTINEL_EMAIL@example.com',
    title: 'AI Systems Architect',
    company: 'SENTINEL_COMPANY',
    linkedin_url: 'https://linkedin.com/in/example',
    avatar_data_url: 'data:image/png;base64,AAA',
    cohort_name: 'Cohort July 2026',
    member_since: '2026-05-01',
    resume: { file_name: 'SENTINEL_RESUME_FILENAME.pdf', uploaded_at: '2026-06-01' },
  },
  capabilities: [
    {
      skill_id: 'systems_thinking',
      name: 'Systems thinking',
      evidence_level: 'delivery_verified',
      proficiency: 0.91,
      confidence: 0.77,
      bands: { claim: 1, knowledge: 0.8, application: 0.9, judgment: 0.2 },
      evidence_count: 7,
      last_demonstrated_at: '2026-08-01',
      source_breakdown: { SENTINEL_SOURCE: 3 },
    },
  ],
  github: {
    repos: [
      { name: 'portfolio', html_url: 'https://github.com/x/portfolio', private: false },
      { name: 'SENTINEL_PRIVATE_REPO', html_url: 'https://github.com/x/secret', private: true },
    ],
    activity: { commits_last_7d: 0, open_prs: 2, total_stars: 5, synced_at: AT },
  },
  readiness: {
    score: 0.4,
    requirements: [],
    met_count: 2,
    total_count: 5,
    meets_policy: false,
    blocking: ['SENTINEL_BLOCKING_upload a resume'],
  },
});

const project = (over: any = {}) =>
  projectPublicPortfolio({
    profile: { ...loadedProfile(), ...over },
    records: [{ slug: 'kd-repo2reputation', title: 'Repo2Reputation', published_at: AT }],
    generatedAt: AT,
  });

describe('careerPortfolioPublicProjection', () => {
  it('leaks nothing private, checked against the whole serialized payload', () => {
    const serialized = JSON.stringify(project());
    for (const sentinel of [
      'SENTINEL_EMAIL',
      'SENTINEL_COMPANY',
      'SENTINEL_RESUME_FILENAME',
      'SENTINEL_SOURCE',
      'SENTINEL_BLOCKING',
      'SENTINEL_PRIVATE_REPO',
    ]) {
      expect(serialized).not.toContain(sentinel);
    }
    // And the structural internals, by key name.
    for (const key of ['bands', 'confidence', 'proficiency', 'source_breakdown',
      'readiness', 'blocking', 'email', 'resume', 'activity', 'commits_last_7d']) {
      expect(serialized).not.toContain(`"${key}"`);
    }
  });

  it('publishes exactly the agreed top-level keys and no others', () => {
    // If someone adds a field to the payload, this fails until they consider it here.
    expect(Object.keys(project()).sort()).toEqual([
      'capabilities', 'generated_at', 'identity', 'private_repository_count',
      'projects', 'records', 'repositories',
    ]);
  });

  describe('capabilities come from the REPO, never from curriculum consumption', () => {
    const withCaps = (capabilities: any) =>
      projectPublicPortfolio({ profile: loadedProfile(), capabilities, records: [], generatedAt: AT })
        .capabilities;

    it('publishes what was committed', () => {
      expect(withCaps([{ id: 'skills', label: 'Agent Skills', present: true, count: 5 }]))
        .toEqual([{ name: 'Agent Skills', count: 5 }]);
    });

    it('gates on `present`, so a single artefact survives and an absent one does not', () => {
      expect(withCaps([{ id: 'workspace', label: 'Workspace', present: true, count: 1 }]))
        .toHaveLength(1);
      expect(withCaps([{ id: 'workspace', label: 'Workspace', present: false, count: 0 }]))
        .toHaveLength(0);
    });

    it('emits `proven` and `on_sample` only when true', () => {
      const built = withCaps([{ id: 'mcp', label: 'MCP', present: true, count: 1 }])[0];
      expect(built).not.toHaveProperty('proven');
      expect(built).not.toHaveProperty('on_sample');
      const shown = withCaps([{ id: 'mcp', label: 'MCP', present: true, count: 1, proven: true, onSample: true }])[0];
      expect(shown.proven).toBe(true);
      expect(shown.on_sample).toBe(true);
    });

    it('CANNOT publish an assessment evidence count, whatever the profile holds', () => {
      // The profile carries `capabilities` with evidence_level and evidence_count sourced
      // from student_architecture_skill. Audited 2026-08-31: all 8,895 rows are
      // source='timeline' -- curriculum opened, one row PER BAND -- with a constant
      // proficiency of 60 and confidence of 1.0. It rendered as
      // "Verified by Colaberry - 240 pieces of evidence" on a page built for recruiters.
      // It must never reach the payload again, and the profile is no longer even read.
      const out = projectPublicPortfolio({
        profile: loadedProfile(),   // its capabilities carry evidence_count: 7
        capabilities: [],
        records: [],
        generatedAt: AT,
      });
      expect(out.capabilities).toEqual([]);
      const serialized = JSON.stringify(out);
      expect(serialized).not.toContain('evidence_count');
      expect(serialized).not.toContain('evidence_level');
      expect(serialized).not.toContain('colaberry_verified');
      expect(serialized).not.toContain('delivery_verified');
    });

    it('treats junk as no capabilities rather than throwing', () => {
      for (const bad of [undefined, null, 'nope', 42, [null], [{}]]) {
        expect(() => withCaps(bad as any)).not.toThrow();
      }
    });
  });

  it('counts a private repo without naming or linking it', () => {
    const out = project();
    expect(out.private_repository_count).toBe(1);
    expect(out.repositories).toEqual([
      { name: 'portfolio', url: 'https://github.com/x/portfolio' },
    ]);
  });

  it('refuses a non-http URL rather than rendering it', () => {
    const out = project({
      identity: { ...loadedProfile().identity, linkedin_url: 'javascript:alert(1)' },
    });
    expect(out.identity.linkedin_url).toBeNull();
  });

  it('degrades to a shorter page instead of throwing on junk', () => {
    const shapes: any[] = [null, undefined, {}, { capabilities: 'not-an-array' },
      { identity: null }, { github: { repos: 'nope' } }];
    for (const profile of shapes) {
      let out: PublicPortfolio | undefined;
      expect(() => { out = projectPublicPortfolio({ profile, records: null, generatedAt: AT }); })
        .not.toThrow();
      expect(out!.capabilities).toEqual([]);
      expect(out!.identity.full_name).toBe('Unnamed');
    }
  });

  describe('record titles never render a slug', () => {
    // ali-muwwakkil appeared as a PROJECT TITLE on Ali's own live page, because
    // project_name was null and the fallback was the slug.
    const withRecords = (records: any) =>
      projectPublicPortfolio({ profile: loadedProfile(), records, generatedAt: AT }).records;

    it('prefers the compiled project_name', () => {
      expect(withRecords([{ slug: 'x', project_name: 'LandJet Growth Engine' }])[0].title)
        .toBe('LandJet Growth Engine');
    });

    it("falls back to the descriptor's own first heading, not the slug", () => {
      const out = withRecords([{
        slug: 'ali-muwwakkil',
        project_name: null,
        descriptor: '# Enterprise AI Strategy\n\n**Organization:** Colaberry\n',
      }]);
      expect(out[0].title).toBe('Enterprise AI Strategy');
      expect(out[0].title).not.toBe('ali-muwwakkil');
    });

    it('strips emphasis from a heading rather than printing the markup', () => {
      expect(withRecords([{ slug: 'x', descriptor: '## **Bold** Title' }])[0].title)
        .toBe('Bold Title');
    });

    it('says "Untitled record" when there is nothing real to use', () => {
      expect(withRecords([{ slug: 'ali-muwwakkil' }])[0].title).toBe('Untitled record');
      expect(withRecords([{ slug: 'x', descriptor: 'no heading here' }])[0].title)
        .toBe('Untitled record');
    });

    it('still links the record, whatever the title', () => {
      expect(withRecords([{ slug: 'ali-muwwakkil' }])[0].slug).toBe('ali-muwwakkil');
    });
  });

  describe('projects carry the substance and refuse the internals', () => {
    // A row as `projects` actually stores it, internals included.
    const row = {
      name: null,
      selected_use_case: 'AI-Powered Curriculum Orchestration System',
      organization_name: 'Colaberry Enterprise AI Accelerator',
      industry: 'Education Technology / AI Training',
      primary_business_problem: 'Scaling personalized AI leadership training',
      automation_goal: 'Automate content personalization',
      project_stage: 'implementation',
      github_repo_url: 'https://github.com/x/y',
      portfolio_url: 'https://enterprise.colaberry.ai',
      // Everything below must never reach a reader.
      share_token: 'SENTINEL_SHARE_TOKEN',
      maturity_score: 20,
      health_score: 41,
      velocity_score: 3,
      stability_score: 9,
      claude_md_content: 'SENTINEL_CLAUDE_MD',
      requirements_document: 'SENTINEL_REQUIREMENTS',
      project_variables: { SENTINEL_VAR: 1 },
      data_sources: ['SENTINEL_DATA_SOURCE'],
      executive_summary: 'SENTINEL_EXEC_SUMMARY',
    };
    const withProjects = (projects: any) =>
      projectPublicPortfolio({ profile: loadedProfile(), projects, records: [], generatedAt: AT });

    it('publishes the substance a reader needs', () => {
      expect(withProjects([row]).projects[0]).toEqual({
        title: 'AI-Powered Curriculum Orchestration System',
        organization: 'Colaberry Enterprise AI Accelerator',
        industry: 'Education Technology / AI Training',
        problem: 'Scaling personalized AI leadership training',
        automation_goal: 'Automate content personalization',
        stage: 'implementation',
        repo_url: 'https://github.com/x/y',
        demo_url: 'https://enterprise.colaberry.ai/',
      });
    });

    it('never leaks a share token or an internal score', () => {
      const serialized = JSON.stringify(withProjects([row]));
      for (const s of ['SENTINEL_SHARE_TOKEN', 'SENTINEL_CLAUDE_MD', 'SENTINEL_REQUIREMENTS',
        'SENTINEL_VAR', 'SENTINEL_DATA_SOURCE', 'SENTINEL_EXEC_SUMMARY']) {
        expect(serialized).not.toContain(s);
      }
      for (const k of ['share_token', 'maturity_score', 'health_score', 'velocity_score',
        'stability_score', 'claude_md_content', 'requirements_document']) {
        expect(serialized).not.toContain(`"${k}"`);
      }
    });

    it('prefers an explicit name over the use case', () => {
      expect(withProjects([{ ...row, name: 'PropertyPulse AI' }]).projects[0].title)
        .toBe('PropertyPulse AI');
    });

    it('drops a row that cannot title itself, rather than printing a blank card', () => {
      // An abandoned intake is not a portfolio entry.
      expect(withProjects([{ organization_name: 'X', project_stage: 'discovery' }]).projects)
        .toHaveLength(0);
    });

    it('keeps a sparse project honest instead of padding it', () => {
      expect(withProjects([{ name: 'PropertyPulse AI', project_stage: 'discovery' }]).projects[0])
        .toEqual({
          title: 'PropertyPulse AI', organization: null, industry: null, problem: null,
          automation_goal: null, stage: 'discovery', repo_url: null, demo_url: null,
        });
    });

    it('refuses a non-http repo or demo url', () => {
      const out = withProjects([{ ...row, github_repo_url: 'javascript:alert(1)', portfolio_url: 'ftp://x' }]);
      expect(out.projects[0].repo_url).toBeNull();
      expect(out.projects[0].demo_url).toBeNull();
    });

    it('treats a missing or malformed projects input as no projects', () => {
      for (const bad of [undefined, null, 'nope', 42, {}]) {
        expect(withProjects(bad as any).projects).toEqual([]);
      }
    });
  });

  it('is pure: same input, same output, and no clock of its own', () => {
    expect(project()).toEqual(project());
    expect(project().generated_at).toBe(AT);
  });
});
