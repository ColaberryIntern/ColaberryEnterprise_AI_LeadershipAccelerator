/**
 * repoDependencySignatures — the second PURE half of the repository analyzer: it
 * turns manifest BODIES into facts (spec §11 "deterministically derive languages,
 * frameworks, dependencies, test frameworks, CI, Docker...").
 *
 * WHY IT IS SEPARATE FROM `repoFactExtractors.ts`. Together they would sit at
 * roughly 650 lines, well past CLAUDE.md's 500-line hard ceiling, and the split
 * falls on a real seam: that file answers "what does the SHAPE of the repository
 * prove", this one answers "what do the FILES it declares prove". It imports the
 * types and the sorting helper from there and nothing else, so the direction
 * stays one-way and acyclic.
 *
 * NO INFERENCE. A fact appears only because a machine-readable manifest declared
 * a dependency, or a Dockerfile/compose file named an image. Nothing here reads
 * prose, so "the README mentions Postgres" can never become `databases:
 * ['PostgreSQL']`. That is the line spec §11 draws between the deterministic
 * analyzer and the §12 AI drafting step, and it is drawn in code here.
 *
 * FAILURE POSTURE. A manifest that is not valid JSON is NOT an exception: it is
 * returned in `malformedManifests`, the analyzer classifies it `MalformedManifest`
 * (spec §29) and the sync continues on the remaining evidence. A repository does
 * not stop being a case study because one file has a trailing comma.
 */
import { basenameOf, sortUnique, MAX_DEPENDENCIES } from './repoFactExtractors';
import type { RepoContentFacts, RepoFactKind } from './repoFactExtractors';

/* ────────────────────────────────────────────────────── signature tables ──── */

/**
 * Exact dependency-name matches, grouped by what they prove. One token may prove
 * several things (`openai` is an SDK, a provider and an LLM clue) — that is why
 * the table is keyed by kind rather than by token.
 */
const EXACT_SIGNATURES: Readonly<Record<RepoFactKind, Readonly<Record<string, string>>>> = {
  framework: {
    react: 'React', 'react-dom': 'React', 'react-native': 'React Native', next: 'Next.js',
    express: 'Express', fastify: 'Fastify', koa: 'Koa', vue: 'Vue', svelte: 'Svelte',
    'solid-js': 'SolidJS', django: 'Django', flask: 'Flask', fastapi: 'FastAPI',
    streamlit: 'Streamlit', rails: 'Ruby on Rails', laravel: 'Laravel', sequelize: 'Sequelize',
    prisma: 'Prisma', typeorm: 'TypeORM', sqlalchemy: 'SQLAlchemy', alembic: 'Alembic',
    tailwindcss: 'Tailwind CSS', bootstrap: 'Bootstrap', vite: 'Vite', webpack: 'Webpack',
    'react-scripts': 'Create React App', electron: 'Electron', celery: 'Celery', bullmq: 'BullMQ',
  },
  database: {
    pg: 'PostgreSQL', postgres: 'PostgreSQL', postgresql: 'PostgreSQL', 'pg-promise': 'PostgreSQL',
    psycopg2: 'PostgreSQL', 'psycopg2-binary': 'PostgreSQL', psycopg: 'PostgreSQL',
    mysql: 'MySQL', mysql2: 'MySQL', mariadb: 'MariaDB', pymysql: 'MySQL',
    mongoose: 'MongoDB', mongodb: 'MongoDB', pymongo: 'MongoDB', mongo: 'MongoDB',
    redis: 'Redis', ioredis: 'Redis', sqlite3: 'SQLite', 'better-sqlite3': 'SQLite',
    mssql: 'SQL Server', tedious: 'SQL Server', pyodbc: 'SQL Server', 'snowflake-sdk': 'Snowflake',
    neo4j: 'Neo4j', 'neo4j-driver': 'Neo4j', chromadb: 'Chroma', 'faiss-cpu': 'FAISS',
    'qdrant-client': 'Qdrant', 'weaviate-client': 'Weaviate', 'pinecone-client': 'Pinecone',
    pinecone: 'Pinecone', elasticsearch: 'Elasticsearch', clickhouse: 'ClickHouse',
  },
  ai_sdk: {
    openai: 'OpenAI SDK', anthropic: 'Anthropic SDK', langchain: 'LangChain', langgraph: 'LangGraph',
    llamaindex: 'LlamaIndex', 'llama-index': 'LlamaIndex', transformers: 'Transformers',
    huggingface_hub: 'Hugging Face Hub', ollama: 'Ollama', cohere: 'Cohere SDK',
    'cohere-ai': 'Cohere SDK', mistralai: 'Mistral SDK', 'google-generativeai': 'Google Generative AI',
    ai: 'Vercel AI SDK', crewai: 'CrewAI', autogen: 'AutoGen', pyautogen: 'AutoGen',
    'semantic-kernel': 'Semantic Kernel', 'haystack-ai': 'Haystack', litellm: 'LiteLLM',
    instructor: 'Instructor', tiktoken: 'tiktoken',
  },
  ai_provider: {
    openai: 'OpenAI', anthropic: 'Anthropic', cohere: 'Cohere', 'cohere-ai': 'Cohere',
    mistralai: 'Mistral', 'google-generativeai': 'Google', ollama: 'Ollama',
    replicate: 'Replicate', groq: 'Groq', 'together-ai': 'Together', huggingface_hub: 'Hugging Face',
  },
  test_framework: {
    jest: 'Jest', 'ts-jest': 'Jest', vitest: 'Vitest', mocha: 'Mocha', chai: 'Chai',
    jasmine: 'Jasmine', playwright: 'Playwright', cypress: 'Cypress', pytest: 'pytest',
    'pytest-cov': 'pytest', supertest: 'Supertest', rspec: 'RSpec', nunit: 'NUnit',
    xunit: 'xUnit', junit: 'JUnit', selenium: 'Selenium',
  },
  agent_clue: {
    langchain: 'rag_framework', langgraph: 'agent_framework', llamaindex: 'rag_framework',
    'llama-index': 'rag_framework', crewai: 'agent_framework', autogen: 'agent_framework',
    pyautogen: 'agent_framework', chromadb: 'vector_store', 'qdrant-client': 'vector_store',
    'weaviate-client': 'vector_store', 'pinecone-client': 'vector_store', pinecone: 'vector_store',
    'faiss-cpu': 'vector_store', openai: 'llm_sdk', anthropic: 'llm_sdk', ollama: 'llm_sdk',
  },
};

/** Scoped npm packages, Go module paths and NuGet ids, matched by prefix. */
const PREFIX_SIGNATURES: readonly (readonly [string, RepoFactKind, string])[] = [
  ['@nestjs/', 'framework', 'NestJS'],
  ['@angular/', 'framework', 'Angular'],
  ['@sveltejs/', 'framework', 'Svelte'],
  ['@remix-run/', 'framework', 'Remix'],
  ['@prisma/', 'framework', 'Prisma'],
  ['github.com/gin-gonic/', 'framework', 'Gin'],
  ['github.com/labstack/echo', 'framework', 'Echo'],
  ['microsoft.entityframeworkcore', 'framework', 'Entity Framework Core'],
  ['@anthropic-ai/', 'ai_sdk', 'Anthropic SDK'],
  ['@anthropic-ai/', 'ai_provider', 'Anthropic'],
  ['@anthropic-ai/', 'agent_clue', 'llm_sdk'],
  ['@google/generative-ai', 'ai_sdk', 'Google Generative AI'],
  ['@google/generative-ai', 'ai_provider', 'Google'],
  ['@modelcontextprotocol/', 'ai_sdk', 'MCP SDK'],
  ['@modelcontextprotocol/', 'agent_clue', 'mcp_sdk'],
  ['@langchain/', 'ai_sdk', 'LangChain'],
  ['@langchain/', 'agent_clue', 'rag_framework'],
  ['@pinecone-database/', 'database', 'Pinecone'],
  ['@pinecone-database/', 'agent_clue', 'vector_store'],
  ['@supabase/', 'database', 'Supabase'],
  ['@aws-sdk/client-dynamodb', 'database', 'DynamoDB'],
  ['@elastic/elasticsearch', 'database', 'Elasticsearch'],
  ['npgsql', 'database', 'PostgreSQL'],
  ['@playwright/', 'test_framework', 'Playwright'],
  ['@testing-library/', 'test_framework', 'Testing Library'],
  ['github.com/stretchr/testify', 'test_framework', 'Testify'],
  ['xunit', 'test_framework', 'xUnit'],
];

/* ─────────────────────────────────────────────────────── manifest parsers ── */

/** Lowercased, version-stripped dependency name, or `''` if the line declares none. */
export function normalizeDependencyToken(raw: string): string {
  const cleaned = String(raw ?? '').trim().toLowerCase();
  if (!cleaned || cleaned.startsWith('#') || cleaned.startsWith('-')) return '';
  const stopAt = cleaned.search(/[\s<>=!~^;,()[\]"']/);
  const token = (stopAt === -1 ? cleaned : cleaned.slice(0, stopAt)).replace(/[,;]+$/, '');
  return /^[a-z0-9@._/+-]+$/.test(token) ? token : '';
}

/** `null` means the JSON did not parse — the caller records `MalformedManifest`. */
export function parsePackageJson(text: string): string[] | null {
  let data: unknown;
  try {
    data = JSON.parse(text);
  } catch {
    return null;
  }
  if (!data || typeof data !== 'object' || Array.isArray(data)) return null;
  const record = data as Record<string, unknown>;
  const tokens: string[] = [];
  for (const field of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
    const block = record[field];
    if (block && typeof block === 'object' && !Array.isArray(block)) {
      for (const name of Object.keys(block as Record<string, unknown>)) {
        const token = normalizeDependencyToken(name);
        if (token) tokens.push(token);
      }
    }
  }
  return tokens;
}

export function parseRequirementsTxt(text: string): string[] {
  const tokens: string[] = [];
  for (const line of text.split(/\r?\n/)) {
    const token = normalizeDependencyToken(line);
    if (token) tokens.push(token.split('[')[0]);
  }
  return tokens;
}

/**
 * PEP 621 `dependencies = [...]` arrays and Poetry `[tool.poetry.dependencies]`
 * tables. Deliberately a line scan, not a TOML parser: adding a parser
 * dependency for two shapes would be a drive-by `npm install`, which CLAUDE.md
 * forbids, and the two shapes are the only ones that carry dependency names.
 */
export function parsePyprojectToml(text: string): string[] {
  const tokens: string[] = [];
  let inDependencyArray = false;
  let section = '';
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const header = /^\[([^\]]+)\]$/.exec(trimmed);
    if (header) { section = header[1].toLowerCase(); inDependencyArray = false; continue; }
    if (/^(dependencies|dev-dependencies)\s*=\s*\[/.test(trimmed)) inDependencyArray = true;
    if (inDependencyArray) {
      for (const quoted of trimmed.match(/"[^"]+"|'[^']+'/g) ?? []) {
        const token = normalizeDependencyToken(quoted.slice(1, -1));
        if (token) tokens.push(token.split('[')[0]);
      }
      if (trimmed.includes(']')) inDependencyArray = false;
      continue;
    }
    if (section.endsWith('dependencies') && trimmed.includes('=')) {
      const token = normalizeDependencyToken(trimmed.split('=')[0]);
      if (token && token !== 'python') tokens.push(token);
    }
  }
  return tokens;
}

export function parseGoMod(text: string): string[] {
  const tokens: string[] = [];
  let inRequireBlock = false;
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    if (/^require\s*\($/.test(trimmed)) { inRequireBlock = true; continue; }
    if (inRequireBlock && trimmed === ')') { inRequireBlock = false; continue; }
    const candidate = inRequireBlock ? trimmed : /^require\s+(.+)$/.exec(trimmed)?.[1] ?? '';
    const token = normalizeDependencyToken(candidate);
    if (token && token.includes('/')) tokens.push(token);
  }
  return tokens;
}

export function parseCargoToml(text: string): string[] {
  const tokens: string[] = [];
  let section = '';
  for (const line of text.split(/\r?\n/)) {
    const trimmed = line.trim();
    const header = /^\[([^\]]+)\]$/.exec(trimmed);
    if (header) { section = header[1].toLowerCase(); continue; }
    if (!/dependencies$/.test(section) || !trimmed.includes('=')) continue;
    const token = normalizeDependencyToken(trimmed.split('=')[0]);
    if (token) tokens.push(token);
  }
  return tokens;
}

export function parseCsproj(text: string): string[] {
  const tokens: string[] = [];
  for (const match of text.matchAll(/PackageReference\s+Include\s*=\s*"([^"]+)"/gi)) {
    const token = normalizeDependencyToken(match[1]);
    if (token) tokens.push(token);
  }
  return tokens;
}

/** Base image names from a Dockerfile (`FROM x`) or a compose file (`image: x`). */
export function parseContainerImages(text: string, kind: 'dockerfile' | 'compose'): string[] {
  const pattern = kind === 'dockerfile' ? /^\s*FROM\s+(\S+)/gim : /^\s*image:\s*["']?([^"'\s]+)/gim;
  const images: string[] = [];
  for (const match of text.matchAll(pattern)) {
    const withoutTag = match[1].split('@')[0].split(':')[0].toLowerCase();
    const name = withoutTag.split('/').pop() ?? '';
    if (name && /^[a-z0-9._-]+$/.test(name)) images.push(name);
  }
  return images;
}

/* ───────────────────────────────────────────────────────── fact derivation ── */

const COMPOSE_BASENAME_RE = /^(docker-compose|compose)(\.[a-z0-9_.-]+)?\.ya?ml$/;

function classify(token: string, buckets: Record<RepoFactKind, Set<string>>): void {
  for (const kind of Object.keys(EXACT_SIGNATURES) as RepoFactKind[]) {
    const value = EXACT_SIGNATURES[kind][token];
    if (value) buckets[kind].add(value);
  }
  for (const [prefix, kind, value] of PREFIX_SIGNATURES) {
    if (token.startsWith(prefix)) buckets[kind].add(value);
  }
}

function emptyBuckets(): Record<RepoFactKind, Set<string>> {
  return {
    framework: new Set(), database: new Set(), ai_sdk: new Set(),
    ai_provider: new Set(), test_framework: new Set(), agent_clue: new Set(),
  };
}

/**
 * Derive every content-proved fact from the bounded set of file bodies the
 * analyzer actually fetched. Pure: same map in, byte-identical facts out. Paths
 * are visited in sorted order so two different fetch orders cannot diverge.
 */
export function deriveContentFacts(files: ReadonlyMap<string, string>): RepoContentFacts {
  const dependencies = new Set<string>();
  const images = new Set<string>();
  const malformed: string[] = [];
  const buckets = emptyBuckets();

  for (const path of [...files.keys()].sort()) {
    const text = files.get(path) ?? '';
    const base = basenameOf(path.toLowerCase());
    let tokens: string[] | null = [];

    if (base === 'package.json') tokens = parsePackageJson(text);
    else if (base === 'requirements.txt') tokens = parseRequirementsTxt(text);
    else if (base === 'pyproject.toml') tokens = parsePyprojectToml(text);
    else if (base === 'go.mod') tokens = parseGoMod(text);
    else if (base === 'cargo.toml') tokens = parseCargoToml(text);
    else if (base.endsWith('.csproj')) tokens = parseCsproj(text);
    else if (base === 'dockerfile' || base.startsWith('dockerfile.')) {
      for (const image of parseContainerImages(text, 'dockerfile')) images.add(image);
    } else if (COMPOSE_BASENAME_RE.test(base)) {
      for (const image of parseContainerImages(text, 'compose')) images.add(image);
    } else if (base.endsWith('.json')) {
      // A declarative JSON file the analyzer does not read for facts (a manifest
      // belongs to the manifest reader). Its VALIDITY is still a fact worth
      // classifying, so a broken one surfaces as MalformedManifest.
      try { JSON.parse(text); } catch { malformed.push(path); }
    }

    if (tokens === null) malformed.push(path);
    else for (const token of tokens) dependencies.add(token);
  }

  for (const token of dependencies) classify(token, buckets);
  for (const image of images) classify(image, buckets);

  return {
    dependencies: sortUnique(dependencies, MAX_DEPENDENCIES),
    frameworks: sortUnique(buckets.framework),
    databases: sortUnique(buckets.database),
    aiSdks: sortUnique(buckets.ai_sdk),
    aiProviders: sortUnique(buckets.ai_provider),
    testFrameworks: sortUnique(buckets.test_framework),
    agentClues: sortUnique(buckets.agent_clue),
    malformedManifests: sortUnique(malformed),
  };
}
