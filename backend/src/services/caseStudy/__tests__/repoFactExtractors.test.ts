/**
 * repoFactExtractors + repoDependencySignatures — T005 acceptance tests for the
 * PURE half of the repository analyzer (plan.md AC3/AC4, spec §11).
 *
 * Every case is built from a string literal. These two modules do no I/O, hold
 * no state, import nothing outside each other and read no clock, so nothing is
 * mocked here at all — not the database, not `fetch`, not `console`. The suite
 * therefore passes with `DATABASE_URL` unset, which is the only environment CI
 * provides (`backend/jest.ci.config.ts`).
 *
 * The point of testing these directly rather than only through the analyzer:
 * `selectHighValueFiles()` is where the network cost of a 10,000-file repository
 * is decided, in arithmetic, before a request is made. If that bound is only
 * ever asserted end-to-end it can be quietly moved; asserted here it cannot.
 *
 * MALFORMED INPUT IS A FIRST-CLASS CASE. Spec §29 says a broken manifest is a
 * classified issue, not a crash, so every parser below is given rubbish as well
 * as truth and must answer "no fact" rather than throw.
 */
import {
  selectHighValueFiles, derivePathFacts, mergeRepoFacts, emptyContentFacts,
  sortUnique, truncateToBytes, looksBinary, basenameOf,
  MAX_CONTENT_FETCHES, MAX_FILE_BYTES, MAX_TREE_PATHS, MAX_DEPENDENCIES, MAX_LIST_ITEMS,
  DOCUMENT_RULES,
} from '../repoFactExtractors';
import {
  deriveContentFacts, normalizeDependencyToken, parsePackageJson, parseRequirementsTxt,
  parsePyprojectToml, parseGoMod, parseCargoToml, parseCsproj, parseContainerImages,
} from '../repoDependencySignatures';

const files = (entries: Record<string, string>): Map<string, string> =>
  new Map(Object.entries(entries));

/* ── selection: the bound that decides the network cost ───────────────────── */

describe('selectHighValueFiles', () => {
  it('picks the spec §11 high-value files and tags each with the rule that chose it', () => {
    const chosen = selectHighValueFiles([
      'README.md', 'CLAUDE.md', 'package.json', 'requirements.txt', 'pyproject.toml',
      'go.mod', 'Cargo.toml', 'Api.csproj', 'Dockerfile', 'docker-compose.yml',
      'case-study.json', '.colaberry/plan.json', '.colaberry/manifest.json',
      'docs/REQUIREMENTS.md', 'docs/ARCHITECTURE.md', 'docs/architecture/data.md',
      'docs/TRACEABILITY.md', 'docs/STORIES.md', '.github/workflows/ci.yml',
      'src/app.ts', 'src/deep/nested/thing.tsx', 'LICENSE',
    ]);

    expect(chosen.find((c) => c.path === 'package.json')?.rule).toBe('package_json');
    expect(chosen.find((c) => c.path === 'README.md')?.rule).toBe('readme');
    expect(chosen.find((c) => c.path === '.github/workflows/ci.yml')?.rule).toBe('ci_workflow');
    expect(chosen.map((c) => c.path)).not.toContain('src/app.ts');
    expect(chosen.map((c) => c.path)).not.toContain('LICENSE');
    // Prose rules are the ones whose bodies become drafting excerpts.
    expect(DOCUMENT_RULES).toContain('readme');
    expect(DOCUMENT_RULES).not.toContain('package_json');
  });

  it('never returns more than MAX_CONTENT_FETCHES however large the repository', () => {
    const paths: string[] = [];
    for (let i = 0; i < 5_000; i += 1) {
      paths.push(`apps/app${i}/package.json`, `svc/s${i}/requirements.txt`, `img/d${i}/Dockerfile`);
    }
    const chosen = selectHighValueFiles(paths);
    expect(chosen.length).toBeLessThanOrEqual(MAX_CONTENT_FETCHES);
    expect(new Set(chosen.map((c) => c.path)).size).toBe(chosen.length);
  });

  it('respects each rule\'s own limit as well as the global cap', () => {
    const chosen = selectHighValueFiles([
      'a/package.json', 'b/package.json', 'c/package.json', 'd/package.json', 'e/package.json',
    ]);
    expect(chosen).toHaveLength(3); // package_json's own limit
  });

  it('skips vendored manifests and blobs the tree already says are too big', () => {
    const sizes = new Map([['README.md', MAX_FILE_BYTES + 1], ['CLAUDE.md', 10]]);
    const chosen = selectHighValueFiles(
      ['node_modules/left-pad/package.json', 'README.md', 'CLAUDE.md'], sizes,
    );
    expect(chosen.map((c) => c.path)).toEqual(['CLAUDE.md']);
  });

  it('is identical whatever order the tree arrived in, shallowest path first', () => {
    const paths = ['apps/api/package.json', 'package.json', 'apps/web/package.json'];
    const forward = selectHighValueFiles(paths);
    const backward = selectHighValueFiles([...paths].reverse());
    expect(backward).toEqual(forward);
    expect(forward[0].path).toBe('package.json');
  });

  it('returns nothing for an empty tree, and never reads past MAX_TREE_PATHS', () => {
    expect(selectHighValueFiles([])).toEqual([]);
    const many = Array.from({ length: MAX_TREE_PATHS }, (_, i) => `src/f${i}.ts`);
    many.push('package.json'); // one past the horizon
    expect(selectHighValueFiles(many)).toEqual([]);
  });
});

/* ── what a path list alone proves ────────────────────────────────────────── */

describe('derivePathFacts', () => {
  it('derives languages from extensions', () => {
    const facts = derivePathFacts([
      'src/app.ts', 'src/App.tsx', 'web/main.js', 'etl/run.py', 'cmd/main.go',
      'core/lib.rs', 'svc/Program.cs', 'db/schema.sql', 'bin/deploy.sh', 'notes.md',
    ]);
    expect(facts.languages).toEqual([
      'C#', 'Go', 'JavaScript', 'Python', 'Rust', 'SQL', 'Shell', 'TypeScript',
    ]);
  });

  it('derives every CI provider it knows, from directories and from basenames', () => {
    const facts = derivePathFacts([
      '.github/workflows/ci.yml', '.circleci/config.yml', '.gitlab-ci.yml',
      'azure-pipelines.yml', 'Jenkinsfile', '.travis.yml', 'bitbucket-pipelines.yml',
    ]);
    expect(facts.ciProviders).toEqual([
      'azure_pipelines', 'bitbucket_pipelines', 'circleci', 'github_actions',
      'gitlab_ci', 'jenkins', 'travis',
    ]);
    expect(facts.hasCi).toBe(true);
    expect(derivePathFacts(['src/app.ts']).hasCi).toBe(false);
  });

  it('derives Docker, and treats a compose file as Docker too', () => {
    expect(derivePathFacts(['Dockerfile']).hasDocker).toBe(true);
    expect(derivePathFacts(['Dockerfile.prod']).hasDocker).toBe(true);
    const compose = derivePathFacts(['docker-compose.production.yml']);
    expect(compose.hasDockerCompose).toBe(true);
    expect(compose.hasDocker).toBe(true);
    expect(derivePathFacts(['compose.yaml']).hasDockerCompose).toBe(true);
    expect(derivePathFacts(['src/app.ts']).hasDocker).toBe(false);
  });

  it('counts README and CLAUDE.md only at the repository root', () => {
    expect(derivePathFacts(['README.md']).hasReadme).toBe(true);
    expect(derivePathFacts(['readme.rst']).hasReadme).toBe(true);
    expect(derivePathFacts(['docs/README.md']).hasReadme).toBe(false);
    expect(derivePathFacts(['CLAUDE.md']).hasClaudeMd).toBe(true);
    expect(derivePathFacts(['backend/CLAUDE.md']).hasClaudeMd).toBe(false);
  });

  it('detects tests by directory and by filename convention', () => {
    const facts = derivePathFacts([
      'src/__tests__/app.test.ts', 'tests/test_pipeline.py', 'spec/models_spec.rb',
      'e2e/checkout.ts', 'pkg/handler_test.go', 'test_root.py', 'src/app.ts',
    ]);
    expect(facts.hasTests).toBe(true);
    expect(facts.testFileCount).toBe(6);
    expect(derivePathFacts(['src/app.ts']).hasTests).toBe(false);
    expect(derivePathFacts(['src/app.ts']).testFileCount).toBe(0);
  });

  it('derives MCP, RAG and agent clues from directory segments and basenames', () => {
    const facts = derivePathFacts([
      'backend/agents/planner.ts', 'mcp/server.ts', 'prompts/system.md', 'evals/suite.json',
      '.claude/settings.json', 'rag/retriever.py', 'ml/embeddings/store.py', 'src/mcp-server.ts',
    ]);
    expect(facts.agentClues).toEqual([
      'agent_directory', 'claude_code_config', 'evaluation_suite', 'mcp_surface',
      'prompt_library', 'rag_surface',
    ]);
    expect(derivePathFacts(['src/app.ts']).agentClues).toEqual([]);
  });

  it('derives architecture, requirements, traceability and stories doc presence', () => {
    const facts = derivePathFacts([
      'docs/REQUIREMENTS.md', 'docs/ARCHITECTURE.md', 'docs/architecture/runtime.md',
      'docs/TRACEABILITY.md', 'docs/STORIES.md',
    ]);
    expect(facts.hasRequirementsDoc).toBe(true);
    expect(facts.hasArchitectureDoc).toBe(true);
    expect(facts.hasTraceabilityDoc).toBe(true);
    expect(facts.hasStoriesDoc).toBe(true);

    const none = derivePathFacts(['docs/misc/notes.md', 'ARCHITECTURE.md']);
    expect(none.hasArchitectureDoc).toBe(false); // only under docs/, spec §11's list
    expect(none.hasRequirementsDoc).toBe(false);
  });

  it('lists manifest files, preserving their real casing', () => {
    const facts = derivePathFacts([
      'package.json', 'requirements.txt', 'pyproject.toml', 'go.mod', 'Cargo.toml',
      'Gemfile', 'pom.xml', 'build.gradle', 'composer.json', 'Pipfile', 'src/Api.csproj',
      'src/app.ts',
    ]);
    expect(facts.manifestFiles).toContain('Cargo.toml');
    expect(facts.manifestFiles).toContain('src/Api.csproj');
    expect(facts.manifestFiles).not.toContain('src/app.ts');
    expect(facts.manifestFiles).toHaveLength(11);
  });

  it('survives an empty tree and entries that are not strings at all', () => {
    const empty = derivePathFacts([]);
    expect(empty.scannedPathCount).toBe(0);
    expect(empty.languages).toEqual([]);
    expect(empty.hasReadme).toBe(false);

    const junk = [null, undefined, '', 42, {}, 'README.md'] as unknown as string[];
    expect(() => derivePathFacts(junk)).not.toThrow();
    expect(derivePathFacts(junk).hasReadme).toBe(true);
  });

  it('scans at most MAX_TREE_PATHS entries', () => {
    const many = Array.from({ length: MAX_TREE_PATHS + 1 }, (_, i) => `src/f${i}.ts`);
    many[MAX_TREE_PATHS] = 'package.json'; // the entry past the horizon
    const facts = derivePathFacts(many);
    expect(facts.scannedPathCount).toBe(MAX_TREE_PATHS);
    expect(facts.manifestFiles).toEqual([]);
  });
});

/* ── what manifest bodies prove ───────────────────────────────────────────── */

describe('deriveContentFacts', () => {
  it('derives frameworks, databases, AI SDKs, providers and test frameworks from package.json', () => {
    const facts = deriveContentFacts(files({
      'package.json': JSON.stringify({
        dependencies: { express: '^4', react: '^18', pg: '^8', openai: '^4', '@langchain/core': '^0.2' },
        devDependencies: { jest: '^29', '@playwright/test': '^1' },
      }),
    }));

    expect(facts.frameworks).toEqual(['Express', 'React']);
    expect(facts.databases).toEqual(['PostgreSQL']);
    expect(facts.aiSdks).toEqual(['LangChain', 'OpenAI SDK']);
    expect(facts.aiProviders).toEqual(['OpenAI']);
    expect(facts.testFrameworks).toEqual(['Jest', 'Playwright']);
    expect(facts.agentClues).toEqual(['llm_sdk', 'rag_framework']);
    expect(facts.dependencies).toContain('@langchain/core');
    expect(facts.malformedManifests).toEqual([]);
  });

  it('derives MCP, vector-store and agent-framework clues from scoped packages', () => {
    const facts = deriveContentFacts(files({
      'package.json': JSON.stringify({
        dependencies: {
          '@modelcontextprotocol/sdk': '^1', '@anthropic-ai/sdk': '^0.2',
          '@pinecone-database/pinecone': '^2',
        },
      }),
    }));
    expect(facts.agentClues).toEqual(['llm_sdk', 'mcp_sdk', 'vector_store']);
    expect(facts.aiSdks).toEqual(['Anthropic SDK', 'MCP SDK']);
    expect(facts.aiProviders).toEqual(['Anthropic']);
    expect(facts.databases).toEqual(['Pinecone']);
  });

  it('reads requirements.txt, pyproject.toml (both shapes), go.mod, Cargo.toml and .csproj', () => {
    const facts = deriveContentFacts(files({
      'requirements.txt': '# runtime\nfastapi==0.110.0\npsycopg2-binary>=2.9\nuvicorn[standard]\n-e .\n',
      'pyproject.toml': '[project]\nname = "atlas"\ndependencies = [\n  "crewai>=0.30",\n  "chromadb",\n]\n\n'
        + '[tool.poetry.dependencies]\npython = "^3.11"\npytest = "^8.0"\n',
      'go.mod': 'module example.com/atlas\n\ngo 1.22\n\nrequire (\n\tgithub.com/gin-gonic/gin v1.9.1\n'
        + '\tgithub.com/stretchr/testify v1.9.0\n)\n',
      'Cargo.toml': '[package]\nname = "atlas"\n\n[dependencies]\nredis = "0.25"\n',
      'src/Api.csproj': '<Project><ItemGroup>\n<PackageReference Include="Npgsql" Version="8.0.0" />\n'
        + '<PackageReference Include="xunit" Version="2.6.0" />\n</ItemGroup></Project>',
    }));

    expect(facts.frameworks).toEqual(expect.arrayContaining(['FastAPI', 'Gin']));
    expect(facts.databases).toEqual(expect.arrayContaining(['Chroma', 'PostgreSQL', 'Redis']));
    expect(facts.aiSdks).toContain('CrewAI');
    expect(facts.agentClues).toEqual(expect.arrayContaining(['agent_framework', 'vector_store']));
    expect(facts.testFrameworks).toEqual(expect.arrayContaining(['Testify', 'pytest', 'xUnit']));
    expect(facts.dependencies).toContain('uvicorn');
    expect(facts.dependencies).not.toContain('python'); // Poetry's interpreter pin is not a dependency
    expect(facts.malformedManifests).toEqual([]);
  });

  it('derives databases from container images, never from prose', () => {
    const facts = deriveContentFacts(files({
      Dockerfile: '# syntax=docker/dockerfile:1\nFROM node:20-alpine AS build\nFROM postgres:16\n',
      'docker-compose.yml': 'services:\n  cache:\n    image: redis:7-alpine\n  search:\n'
        + '    image: "docker.elastic.co/elasticsearch/elasticsearch:8.13.0"\n',
      'README.md': 'We run everything on MongoDB and Neo4j and Snowflake.',
    }));
    expect(facts.databases).toEqual(['Elasticsearch', 'PostgreSQL', 'Redis']);
    expect(facts.databases).not.toContain('MongoDB'); // the README said so; that is not evidence
  });

  it('classifies a broken manifest instead of throwing, and keeps the rest of the evidence', () => {
    const facts = deriveContentFacts(files({
      'package.json': '{"dependencies": {,}',
      'apps/api/package.json': JSON.stringify({ dependencies: { fastify: '^4' } }),
      '.colaberry/plan.json': '{ this is not json',
    }));
    expect(facts.malformedManifests).toEqual(['.colaberry/plan.json', 'package.json']);
    expect(facts.frameworks).toEqual(['Fastify']); // the manifest that DID parse still counts
  });

  it('treats a package.json that is JSON but not an object as malformed', () => {
    expect(parsePackageJson('[1,2,3]')).toBeNull();
    expect(parsePackageJson('"a string"')).toBeNull();
    expect(parsePackageJson('null')).toBeNull();
    expect(deriveContentFacts(files({ 'package.json': '[]' })).malformedManifests).toEqual(['package.json']);
  });

  it('degrades to no fact — never an exception — on empty and truncated manifests', () => {
    const truncated = files({
      'go.mod': '',
      'requirements.txt': '',
      'pyproject.toml': '[project]\ndependencies = [\n  "fastapi>=0.1",',   // cut mid-array
      'Cargo.toml': '[dependencies',                                        // cut mid-header
      'src/Api.csproj': '<Project><ItemGroup><PackageReference Include="Npg',
      Dockerfile: '',
      'docker-compose.yml': 'services:\n  api:\n    imag',
      'package.json': '{}',
    });
    let facts!: ReturnType<typeof deriveContentFacts>;
    expect(() => { facts = deriveContentFacts(truncated); }).not.toThrow();

    expect(facts.malformedManifests).toEqual([]); // truncation is not invalid JSON
    expect(facts.databases).toEqual([]);
    expect(facts.testFrameworks).toEqual([]);
    expect(facts.dependencies).toEqual(['fastapi']); // only what was actually declared
  });

  it('is empty for an empty file set, and caps the dependency list', () => {
    expect(deriveContentFacts(new Map())).toEqual(emptyContentFacts());

    const dependencies: Record<string, string> = {};
    for (let i = 0; i < 500; i += 1) dependencies[`pkg-${String(i).padStart(3, '0')}`] = '^1';
    const facts = deriveContentFacts(files({ 'package.json': JSON.stringify({ dependencies }) }));
    expect(facts.dependencies).toHaveLength(MAX_DEPENDENCIES);
  });
});

/* ── the individual parsers and helpers ───────────────────────────────────── */

describe('parsers and helpers', () => {
  it('normalizes a dependency token, or refuses it', () => {
    expect(normalizeDependencyToken('  FastAPI>=0.110 ')).toBe('fastapi');
    expect(normalizeDependencyToken('@langchain/core')).toBe('@langchain/core');
    expect(normalizeDependencyToken('@langchain/core@^0.2')).toBe('@langchain/core@'); // spec stripped
    expect(normalizeDependencyToken('# a comment')).toBe('');
    expect(normalizeDependencyToken('-e git+https://example.com/x')).toBe('');
    expect(normalizeDependencyToken('')).toBe('');
    expect(normalizeDependencyToken(undefined as unknown as string)).toBe('');
  });

  it('parses each manifest shape from a literal', () => {
    expect(parsePackageJson('{"dependencies":{"react":"^18"}}')).toEqual(['react']);
    expect(parseRequirementsTxt('flask==3\n\n# note\nboto3\n')).toEqual(['flask', 'boto3']);
    expect(parsePyprojectToml('[tool.poetry.dependencies]\ndjango = "^5"\n')).toEqual(['django']);
    expect(parseGoMod('require github.com/labstack/echo/v4 v4.11.0\n'))
      .toEqual(['github.com/labstack/echo/v4']);
    expect(parseCargoToml('[dev-dependencies]\ntokio = "1"\n')).toEqual(['tokio']);
    expect(parseCsproj('<PackageReference Include="Serilog" />')).toEqual(['serilog']);
    expect(parseContainerImages('FROM mysql:8.0\n', 'dockerfile')).toEqual(['mysql']);
    expect(parseContainerImages('    image: mongo:7\n', 'compose')).toEqual(['mongo']);
  });

  it('sorts, de-duplicates, trims and caps every emitted list', () => {
    expect(sortUnique(['b', 'a', 'a', '  ', ' c '])).toEqual(['a', 'b', 'c']);
    expect(sortUnique(Array.from({ length: 200 }, (_, i) => `v${i}`))).toHaveLength(MAX_LIST_ITEMS);
    expect(sortUnique(['a', 'b', 'c'], 2)).toEqual(['a', 'b']);
    expect(sortUnique([])).toEqual([]);
  });

  it('truncates by BYTES, not by characters', () => {
    expect(truncateToBytes('abc', 100)).toBe('abc');
    const multibyte = 'é'.repeat(0) + 'é'.repeat(10); // 10 x 2-byte characters
    const cut = truncateToBytes(multibyte, 6);
    expect(Buffer.byteLength(cut, 'utf8')).toBe(6);
    expect(cut.length).toBe(3); // character-slicing would have kept 6 and blown the cap
    expect(truncateToBytes('', 10)).toBe('');
  });

  it('recognises a binary blob without calling a repository with a PNG in it broken', () => {
    expect(looksBinary(`${String.fromCharCode(0)}PNG`)).toBe(true);
    expect(looksBinary(String.fromCharCode(0xfffd).repeat(10) + 'a'.repeat(100))).toBe(true);
    expect(looksBinary('# A perfectly ordinary readme')).toBe(false);
    expect(looksBinary('')).toBe(false);
  });

  it('takes a basename from either a nested or a bare path', () => {
    expect(basenameOf('a/b/c.ts')).toBe('c.ts');
    expect(basenameOf('c.ts')).toBe('c.ts');
    expect(basenameOf('')).toBe('');
  });
});

/* ── merging the two halves ───────────────────────────────────────────────── */

describe('mergeRepoFacts', () => {
  it('unions the extension languages with the ones GitHub reported', () => {
    const merged = mergeRepoFacts(
      derivePathFacts(['src/app.ts', 'etl/run.py']), emptyContentFacts(),
      { apiLanguages: ['Go', 'TypeScript'] },
    );
    expect(merged.languages).toEqual(['Go', 'Python', 'TypeScript']);
  });

  it('takes the deployment URL from the declared homepage and nowhere else', () => {
    const path = derivePathFacts(['README.md']);
    expect(mergeRepoFacts(path, emptyContentFacts(), { homepage: '  https://atlas.example.com  ' })
      .deploymentUrl).toBe('https://atlas.example.com');
    expect(mergeRepoFacts(path, emptyContentFacts(), { homepage: '   ' }).deploymentUrl).toBeNull();
    expect(mergeRepoFacts(path, emptyContentFacts(), { homepage: null }).deploymentUrl).toBeNull();
    expect(mergeRepoFacts(path, emptyContentFacts()).deploymentUrl).toBeNull();
  });

  it('counts a declared test framework as evidence of tests even with no test files', () => {
    const merged = mergeRepoFacts(
      derivePathFacts(['src/app.ts']),
      { ...emptyContentFacts(), testFrameworks: ['Jest'] },
    );
    expect(merged.hasTests).toBe(true);
    expect(merged.testFileCount).toBe(0);
    expect(mergeRepoFacts(derivePathFacts(['src/app.ts']), emptyContentFacts()).hasTests).toBe(false);
  });

  it('produces a fully empty, still well-formed fact set for an unreadable repository', () => {
    const merged = mergeRepoFacts(derivePathFacts([]), emptyContentFacts());
    expect(merged).toEqual({
      languages: [], frameworks: [], dependencies: [], databases: [], aiSdks: [], aiProviders: [],
      agentClues: [], testFrameworks: [], ciProviders: [], manifestFiles: [],
      hasReadme: false, hasClaudeMd: false, hasTests: false, testFileCount: 0, hasCi: false,
      hasDocker: false, hasDockerCompose: false, hasArchitectureDoc: false,
      hasRequirementsDoc: false, hasTraceabilityDoc: false, hasStoriesDoc: false,
      deploymentUrl: null,
    });
  });
});
