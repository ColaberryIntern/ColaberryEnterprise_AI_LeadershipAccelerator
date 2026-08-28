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
      'records', 'repositories',
    ]);
  });

  it('drops unverified capabilities entirely', () => {
    const out = project({
      capabilities: [
        { name: 'Nothing behind it', evidence_level: 'none', evidence_count: 0 },
        { name: 'Only a resume claim', evidence_level: 'resume', evidence_count: 4 },
        { name: 'Real', evidence_level: 'colaberry_verified', evidence_count: 2 },
      ],
    });
    expect(out.capabilities.map((c) => c.name)).toEqual(['Real']);
  });

  it('drops a verified capability with no evidence behind it', () => {
    // "Verified - 0 pieces of evidence" is a contradiction, not a selling point.
    const out = project({
      capabilities: [{ name: 'Hollow', evidence_level: 'delivery_verified', evidence_count: 0 }],
    });
    expect(out.capabilities).toHaveLength(0);
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

  it('is pure: same input, same output, and no clock of its own', () => {
    expect(project()).toEqual(project());
    expect(project().generated_at).toBe(AT);
  });
});
