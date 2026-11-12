import { commitRepoKey, repoKey, restrictToHireCaseStudies } from '../hireCaseStudyOnly';

/**
 * Ali, 2026-11-11: Hire shows only approved case studies, never a project that is in progress or
 * was never converted. The fixtures mirror the live pages that broke the rule that day.
 */
const portfolio = () => ({
  identity: { full_name: 'Obi Example', email: null },
  about: ['kept as is'],
  projects: [
    { title: 'Selective Service System Modernization', case_study_slug: 'the-exemption-was-denied', repo_url: 'https://github.com/Obi/SSS-Demo' },
    { title: 'Crash Records Information System', case_study_slug: null, repo_url: 'https://github.com/Obi/cris-enhancement' },
    { title: 'Draft case study only', case_study_slug: 'still-a-draft', repo_url: 'https://github.com/Obi/draft-repo' },
  ],
  records: [
    { slug: 'r1', title: 'Written up, published', case_study_slug: 'the-exemption-was-denied' },
    { slug: 'r2', title: 'Written up, not a case study', case_study_slug: null },
  ],
  verified_commits: [
    { title: 'STORY-001', commit_url: 'https://github.com/obi/sss-demo/commit/abc123' },
    { title: 'STORY-007', commit_url: 'https://github.com/Obi/cris-enhancement/commit/a0fb8ce' },
    { title: 'no url', commit_url: null },
  ],
  repositories: [{ name: 'SSS-Demo', url: 'https://github.com/Obi/SSS-Demo.git' }, { name: 'cris', url: 'https://github.com/Obi/cris-enhancement' }],
  featured: { name: 'cris', repo_url: 'https://github.com/Obi/cris-enhancement' },
  private_repository_count: 2,
});
const HIRE = new Set(['the-exemption-was-denied']);

describe('restrictToHireCaseStudies', () => {
  it('keeps only projects whose case study is published on Hire', () => {
    const out = restrictToHireCaseStudies(portfolio(), HIRE);
    expect(out.projects.map((p) => p.title)).toEqual(['Selective Service System Modernization']);
  });

  it('drops a project linked to a case study that is not published on Hire', () => {
    const out = restrictToHireCaseStudies(portfolio(), HIRE);
    expect(out.projects.some((p) => p.case_study_slug === 'still-a-draft')).toBe(false);
  });

  it('keeps commits, repositories and the featured capstone only inside case-study repositories', () => {
    const out = restrictToHireCaseStudies(portfolio(), HIRE);
    expect(out.verified_commits.map((c) => c.title)).toEqual(['STORY-001']);
    expect(out.repositories.map((r) => r.name)).toEqual(['SSS-Demo']);
    expect(out.featured).toBeNull();
  });

  it('keeps only records written up as a published case study', () => {
    expect(restrictToHireCaseStudies(portfolio(), HIRE).records.map((r) => r.slug)).toEqual(['r1']);
  });

  it('leaves fields that name no project untouched', () => {
    const out = restrictToHireCaseStudies(portfolio(), HIRE);
    expect(out.about).toEqual(['kept as is']);
    expect(out.private_repository_count).toBe(2);
    expect(out.identity.full_name).toBe('Obi Example');
  });

  it('with no published case study, shows no project, record, commit or repository', () => {
    const out = restrictToHireCaseStudies(portfolio(), new Set());
    expect([out.projects, out.records, out.verified_commits, out.repositories]).toEqual([[], [], [], []]);
    expect(out.featured).toBeNull();
  });

  it('tolerates missing arrays', () => {
    const out = restrictToHireCaseStudies({ identity: { full_name: 'x' } } as never, HIRE) as unknown as Record<string, unknown>;
    expect(out.projects).toEqual([]);
    expect(out.verified_commits).toEqual([]);
  });

  it('is idempotent', () => {
    const once = restrictToHireCaseStudies(portfolio(), HIRE);
    expect(restrictToHireCaseStudies(once, HIRE)).toEqual(once);
  });
});

describe('repository keys', () => {
  it('treat case, a trailing slash and .git as the same repository', () => {
    expect(repoKey('https://github.com/Obi/SSS-Demo.git/')).toBe(repoKey('https://github.com/obi/sss-demo'));
  });
  it('read the repository out of a commit URL, and refuse anything else', () => {
    expect(commitRepoKey('https://github.com/Obi/x/commit/abc')).toBe('https://github.com/obi/x');
    expect(commitRepoKey('https://github.com/Obi/x')).toBe('');
    expect(commitRepoKey(null)).toBe('');
  });
});
