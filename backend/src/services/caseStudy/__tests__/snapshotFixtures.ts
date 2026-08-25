/**
 * Fixtures for the snapshot builder and store suites.
 *
 * NOT A TEST FILE — jest's `testMatch` is `**\/__tests__/**\/*.test.ts`, so this
 * is imported, never collected (the same arrangement as `githubFetchFake.ts`).
 *
 * Every import is `import type`, so nothing here pulls the analyzer, the GitHub
 * client or a Sequelize model into a suite that has no database.
 */
import type { CaseStudyRepoFacts } from '../caseStudyRepoAnalyzer';
import type { CaseStudyRepoMetadataFacts } from '../caseStudyRepoReader';
import type { SnapshotPlatformFacts, SnapshotRepoInput } from '../caseStudySnapshotInput';

type Derived = CaseStudyRepoFacts['derived'];

export const SHA_A = 'a'.repeat(40);
export const SHA_B = 'b'.repeat(40);

/** A clock that never moves — the default for suites that are not testing time. */
export const fixedClock = (iso = '2026-08-22T10:00:00.000Z') => () => new Date(iso);

export function makeMetadata(over: Partial<CaseStudyRepoMetadataFacts> = {}): CaseStudyRepoMetadataFacts {
  return {
    owner: 'colaberry',
    name: 'accelerator',
    fullName: 'colaberry/accelerator',
    description: 'An enterprise accelerator',
    homepage: null,
    visibility: 'public',
    defaultBranch: 'main',
    topics: ['ai'],
    languageBytes: [{ name: 'TypeScript', bytes: 1000 }],
    primaryLanguage: 'TypeScript',
    createdAt: '2026-01-05T09:00:00.000Z',
    updatedAt: '2026-08-01T09:00:00.000Z',
    pushedAt: '2026-08-20T09:00:00.000Z',
    license: null,
    latestCommitSha: SHA_A,
    isFork: false,
    isArchived: false,
    ...over,
  };
}

export function makeDerived(over: Partial<Derived> = {}): Derived {
  return {
    languages: ['TypeScript'],
    frameworks: ['express', 'react'],
    dependencies: ['express', 'react', 'zod'],
    databases: ['postgres'],
    aiSdks: ['openai'],
    aiProviders: ['openai'],
    agentClues: ['agent_directory'],
    testFrameworks: ['jest'],
    ciProviders: ['github_actions'],
    manifestFiles: ['package.json'],
    hasReadme: true,
    hasClaudeMd: true,
    hasTests: true,
    testFileCount: 12,
    hasCi: true,
    hasDocker: true,
    hasDockerCompose: false,
    hasArchitectureDoc: true,
    hasRequirementsDoc: false,
    hasTraceabilityDoc: false,
    hasStoriesDoc: false,
    deploymentUrl: null,
    ...over,
  };
}

export type RepoFactsOverrides =
  Partial<Omit<CaseStudyRepoFacts, 'metadata' | 'derived'>>
  & { metadata?: Partial<CaseStudyRepoMetadataFacts>; derived?: Partial<Derived> };

export function makeRepoFacts(over: RepoFactsOverrides = {}): CaseStudyRepoFacts {
  const metadata = makeMetadata(over.metadata);
  const derived = makeDerived(over.derived);
  return {
    repoOwner: metadata.owner,
    repoName: metadata.name,
    repoUrl: `https://github.com/${metadata.owner}/${metadata.name}`,
    documents: [],
    filesRead: ['README.md'],
    fileCount: 120,
    treeTruncated: false,
    treeSource: 'github',
    accessStatus: 'connected',
    ...over,
    // Re-applied last: a caller's partial must extend the defaults, not replace them.
    metadata,
    derived,
  };
}

export function makeRepo(over: Partial<SnapshotRepoInput> = {}): SnapshotRepoInput {
  return {
    facts: makeRepoFacts(),
    role: 'primary',
    allowPublicRepoLink: true,
    ...over,
  };
}

export function makePlatform(over: Partial<SnapshotPlatformFacts> = {}): SnapshotPlatformFacts {
  return {
    slug: 'bottling-line-copilot',
    title: 'Bottling line copilot',
    organizationIdentityMode: 'anonymized',
    organizationNamingConsent: false,
    builderIdentityMode: 'role_only',
    builderNamingConsent: false,
    ...over,
  };
}
