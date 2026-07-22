/**
 * Unit tests for the intel source adapters — pure, no DB, no real network.
 *
 * Importing each adapter self-registers it, so we also assert the registry now
 * carries a well-formed IntelSourceConfig (slug + cost-gate env names). For every
 * adapter: collect() returns a non-empty array of well-formed NormalizedIntelItems
 * with unique, correctly-namespaced guids that are STABLE across runs (the property
 * the engine's (pipeline, guid) dedup + rotation depend on). For the MCP adapter we
 * additionally prove it degrades to the non-empty curated fallback when the fetch
 * rejects and when it parses zero rows, and that it parses a real README shape.
 */
import { getIntelSource, NormalizedIntelItem } from '../../intelRegistry';

// Side-effect imports: registering the four adapters.
import { collect as collectTool } from '../ai_tool_of_the_day';
import { collect as collectQuote } from '../ai_quote_of_the_day';
import { collect as collectTechnique } from '../claude_code_technique';
import { collect as collectMcp, parseMcpReadme } from '../mcp_server_spotlight';

type Collector = () => Promise<NormalizedIntelItem[]>;

function assertWellFormed(items: NormalizedIntelItem[], guidPrefix: string): void {
  expect(Array.isArray(items)).toBe(true);
  expect(items.length).toBeGreaterThan(0);
  const guids = new Set<string>();
  for (const it of items) {
    expect(typeof it.guid).toBe('string');
    expect(it.guid.startsWith(guidPrefix)).toBe(true);
    expect(it.guid.length).toBeGreaterThan(guidPrefix.length);
    expect(typeof it.source).toBe('string');
    expect(it.source.length).toBeGreaterThan(0);
    expect(typeof it.title).toBe('string');
    expect(it.title.trim().length).toBeGreaterThan(0);
    expect(it.url === null || typeof it.url === 'string').toBe(true);
    expect(it.excerpt === null || typeof it.excerpt === 'string').toBe(true);
    expect(it.publishedAt === null || it.publishedAt instanceof Date).toBe(true);
    guids.add(it.guid);
  }
  expect(guids.size).toBe(items.length); // guids are unique
}

async function assertStable(collect: Collector): Promise<void> {
  const a = await collect();
  const b = await collect();
  expect(a.map((i) => i.guid)).toEqual(b.map((i) => i.guid)); // stable across runs
}

const CURATED: ReadonlyArray<{ slug: string; enableEnv: string; maxPerRunEnv: string; prefix: string; collect: Collector }> = [
  { slug: 'ai_tool_of_the_day', enableEnv: 'AI_TOOL_OF_THE_DAY_INGEST_ENABLED', maxPerRunEnv: 'AI_TOOL_OF_THE_DAY_MAX_PER_RUN', prefix: 'tool:', collect: collectTool },
  { slug: 'ai_quote_of_the_day', enableEnv: 'AI_QUOTE_OF_THE_DAY_INGEST_ENABLED', maxPerRunEnv: 'AI_QUOTE_OF_THE_DAY_MAX_PER_RUN', prefix: 'quote:', collect: collectQuote },
  { slug: 'claude_code_technique', enableEnv: 'CLAUDE_CODE_TECHNIQUE_INGEST_ENABLED', maxPerRunEnv: 'CLAUDE_CODE_TECHNIQUE_MAX_PER_RUN', prefix: 'cctech:', collect: collectTechnique },
];

describe('curated intel source adapters', () => {
  for (const s of CURATED) {
    describe(s.slug, () => {
      it('self-registers a well-formed config on import', () => {
        const cfg = getIntelSource(s.slug);
        expect(cfg).toBeDefined();
        expect(cfg?.slug).toBe(s.slug);
        expect(cfg?.enableEnv).toBe(s.enableEnv);
        expect(cfg?.maxPerRunEnv).toBe(s.maxPerRunEnv);
        expect(typeof cfg?.collect).toBe('function');
      });

      it('collect() returns a non-empty array of well-formed, uniquely-keyed items', async () => {
        assertWellFormed(await s.collect(), s.prefix);
      });

      it('produces stable guids across runs (dedup/rotation safe)', async () => {
        await assertStable(s.collect);
      });
    });
  }
});

describe('mcp_server_spotlight', () => {
  const origFetch = global.fetch;
  afterEach(() => {
    global.fetch = origFetch;
    jest.restoreAllMocks();
  });

  it('self-registers a well-formed config on import', () => {
    const cfg = getIntelSource('mcp_server_spotlight');
    expect(cfg?.slug).toBe('mcp_server_spotlight');
    expect(cfg?.enableEnv).toBe('MCP_SERVER_SPOTLIGHT_INGEST_ENABLED');
    expect(cfg?.maxPerRunEnv).toBe('MCP_SERVER_SPOTLIGHT_MAX_PER_RUN');
  });

  it('degrades to a non-empty curated fallback when the fetch rejects', async () => {
    global.fetch = jest.fn().mockRejectedValue(new Error('network down')) as unknown as typeof fetch;
    const items = await collectMcp();
    assertWellFormed(items, 'mcp:');
    expect(items.length).toBeGreaterThanOrEqual(12);
  });

  it('degrades to the fallback when the README parses zero rows', async () => {
    global.fetch = jest.fn().mockResolvedValue({
      ok: true, status: 200, text: async () => '# MCP Servers\n\nNo list here.\n',
    }) as unknown as typeof fetch;
    const items = await collectMcp();
    assertWellFormed(items, 'mcp:');
    expect(items.length).toBeGreaterThanOrEqual(12);
  });

  it('parses live-README-shaped markdown into normalized items', () => {
    const md = [
      '### Reference Servers',
      '- **[Filesystem](src/filesystem)** - Secure file operations with configurable access controls.',
      '- **[Git](src/git)** - Tools to read, search, and manipulate Git repositories.',
      '- **[GitHub](https://github.com/github/github-mcp-server)** — Official GitHub server for repos and issues.',
      'Some prose that is not a list row.',
      '- **[Filesystem](src/filesystem)** - duplicate name, should be deduped.',
    ].join('\n');
    const items = parseMcpReadme(md);
    assertWellFormed(items, 'mcp:');
    expect(items).toHaveLength(3); // duplicate name collapsed
    const byGuid = Object.fromEntries(items.map((i) => [i.guid, i]));
    expect(byGuid['mcp:filesystem'].url).toBe('https://github.com/modelcontextprotocol/servers/tree/main/src/filesystem');
    expect(byGuid['mcp:github'].url).toBe('https://github.com/github/github-mcp-server'); // absolute url preserved
  });
});
