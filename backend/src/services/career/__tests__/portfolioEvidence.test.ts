import {
  normalizeCompetencies, normalizeEvidenceSources, countCompetencyDomains,
  composeFeatured, humanise,
} from '../portfolioEvidence';

/**
 * These bands publish a SCORE beside somebody's name, which this page refused to do for
 * years. The refusal was right about `student_skill_evidence` and is wrong about
 * `evidence_records`; the tests below hold the line that makes the difference real -
 * nothing renders unless it is a positive, parseable score, and a capped list says so.
 */
describe('humanise', () => {
  it('turns a domain id into a label without inventing a synonym', () => {
    expect(humanise('decision_making')).toBe('Decision making');
    expect(humanise('ai_governance')).toBe('Ai governance');
    expect(humanise('architecture')).toBe('Architecture');
  });

  it('is empty for junk rather than guessing', () => {
    expect(humanise('')).toBe('');
    expect(humanise(null)).toBe('');
    expect(humanise(7)).toBe('');
  });
});

describe('normalizeCompetencies', () => {
  const real = [
    { domain: 'architecture', score: 34 },
    { domain: 'decision_making', score: 14 },
    { domain: 'ai_governance', score: 13 },
  ];

  it('sorts strongest first and labels each domain', () => {
    const out = normalizeCompetencies([...real].reverse());
    expect(out.map((c) => c.domain)).toEqual(['architecture', 'decision_making', 'ai_governance']);
    expect(out[0].label).toBe('Architecture');
    expect(out[0].score).toBe(34);
  });

  it('drops a zero or negative score rather than drawing an empty bar', () => {
    const out = normalizeCompetencies([
      { domain: 'a', score: 0 }, { domain: 'b', score: -3 }, { domain: 'c', score: 2 },
    ]);
    expect(out.map((c) => c.domain)).toEqual(['c']);
  });

  it('drops rows with no domain, and unparseable scores', () => {
    expect(normalizeCompetencies([
      { score: 9 }, { domain: '  ', score: 9 }, { domain: 'x', score: 'lots' },
    ])).toEqual([]);
  });

  it('caps the list so nineteen bars do not become a wall', () => {
    const many = Array.from({ length: 19 }, (_, i) => ({ domain: 'd' + i, score: 19 - i }));
    expect(normalizeCompetencies(many)).toHaveLength(12);
  });

  it('breaks ties deterministically', () => {
    const tied = [{ domain: 'zeta', score: 5 }, { domain: 'alpha', score: 5 }];
    expect(normalizeCompetencies(tied).map((c) => c.domain)).toEqual(['alpha', 'zeta']);
    expect(normalizeCompetencies([...tied].reverse()).map((c) => c.domain)).toEqual(['alpha', 'zeta']);
  });

  it('returns [] for every not-an-array input', () => {
    expect(normalizeCompetencies(null)).toEqual([]);
    expect(normalizeCompetencies({ domain: 'a', score: 1 })).toEqual([]);
  });
});

describe('countCompetencyDomains', () => {
  it('counts by the same rule the list filters by, so the two cannot disagree', () => {
    const rows = [
      { domain: 'a', score: 3 }, { domain: 'b', score: 0 },
      { domain: 'c', score: 1 }, { domain: 'c', score: 2 }, { score: 5 },
    ];
    // 'b' scores zero and is excluded; 'c' appears twice and counts once.
    expect(countCompetencyDomains(rows)).toBe(2);
    expect(countCompetencyDomains(null)).toBe(0);
  });
});

describe('normalizeEvidenceSources', () => {
  it('labels the known source types in plain words, largest first', () => {
    const out = normalizeEvidenceSources([
      { source_type: 'github_commit', count: 9 },
      { source_type: 'deliverable', count: 18 },
    ]);
    expect(out[0]).toEqual({ source_type: 'deliverable', label: 'Deliverables submitted', count: 18 });
    expect(out[1].label).toBe('Commits');
  });

  it('names an unknown source type honestly instead of dropping or mislabelling it', () => {
    const out = normalizeEvidenceSources([{ source_type: 'peer_critique', count: 4 }]);
    expect(out[0].label).toBe('Peer critique');
  });

  it('drops empty counts and malformed rows', () => {
    expect(normalizeEvidenceSources([
      { source_type: 'deliverable', count: 0 }, { count: 5 }, 'nope',
    ])).toEqual([]);
  });
});

describe('composeFeatured', () => {
  it('carries the repository figures through', () => {
    expect(composeFeatured({
      name: 'AI Support Workflow Assistant',
      repoUrl: 'https://github.com/fbeig2020-cloud/ai-support-workflow-assistant',
      files: 102, topLevelAreas: 13, capabilities: 7, languages: 3,
    })).toEqual({
      name: 'AI Support Workflow Assistant',
      repo_url: 'https://github.com/fbeig2020-cloud/ai-support-workflow-assistant',
      files: 102, top_level_areas: 13, capabilities: 7, languages: 3,
    });
  });

  it('is null without a name, because counts that cannot name themselves are not a project', () => {
    expect(composeFeatured({ files: 102, capabilities: 7 })).toBeNull();
    expect(composeFeatured({ name: '   ' })).toBeNull();
  });

  it('nulls each figure independently, so a thinner project simply says less', () => {
    const out = composeFeatured({ name: 'Thing', files: 0, languages: 2 });
    expect(out).toEqual({
      name: 'Thing', repo_url: null, files: null,
      top_level_areas: null, capabilities: null, languages: 2,
    });
  });

  it('refuses a repo link that is not an https github URL', () => {
    expect(composeFeatured({ name: 'T', repoUrl: 'javascript:alert(1)' })?.repo_url).toBeNull();
    expect(composeFeatured({ name: 'T', repoUrl: 'http://github.com/o/r' })?.repo_url).toBeNull();
    expect(composeFeatured({ name: 'T', repoUrl: 'https://evil.com/o/r' })?.repo_url).toBeNull();
  });
});
