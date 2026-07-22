/**
 * mcp_server_spotlight — intel source: one Model Context Protocol server per run.
 *
 * collect() fetches the public MCP servers README from GitHub raw and parses its
 * markdown link list into seed items (name + repo url + description). It DEGRADES
 * GRACEFULLY: any fetch/parse failure — or a parse that yields zero entries —
 * returns a small authored fallback catalog of well-known servers instead. It
 * NEVER throws (fail-first per CLAUDE.md: keep prior state, let the next run retry).
 *
 * guid is `mcp:<slug-of-name>` so it is stable across runs whether the item came
 * from the live README or the fallback; the engine dedups and rotates on it.
 */
import { NormalizedIntelItem, registerIntelSource } from '../intelRegistry';
import { fetchWithTimeout } from '../intelHttp';
import { toSlug } from './idUtils';

const SLUG = 'mcp_server_spotlight';
const SOURCE = 'MCP Registry';
const README_URL = 'https://raw.githubusercontent.com/modelcontextprotocol/servers/main/README.md';
const REPO_TREE_BASE = 'https://github.com/modelcontextprotocol/servers/tree/main/';
const MAX_ITEMS = 60; // bound a huge README; the engine caps materialization anyway.

interface CuratedServer {
  name: string;
  url: string;
  what: string;
}

/** Authored fallback (constant, not user input) of ~12 well-known MCP servers. */
const FALLBACK: readonly CuratedServer[] = [
  { name: 'Filesystem', url: `${REPO_TREE_BASE}src/filesystem`, what: 'Secure file operations with configurable access controls.' },
  { name: 'Git', url: `${REPO_TREE_BASE}src/git`, what: 'Read, search, and manipulate Git repositories.' },
  { name: 'Fetch', url: `${REPO_TREE_BASE}src/fetch`, what: 'Web content fetching and conversion for efficient LLM usage.' },
  { name: 'Memory', url: `${REPO_TREE_BASE}src/memory`, what: 'Knowledge-graph-based persistent memory system.' },
  { name: 'Sequential Thinking', url: `${REPO_TREE_BASE}src/sequentialthinking`, what: 'Dynamic, reflective problem-solving through thought sequences.' },
  { name: 'Time', url: `${REPO_TREE_BASE}src/time`, what: 'Time and timezone conversion capabilities.' },
  { name: 'Everything', url: `${REPO_TREE_BASE}src/everything`, what: 'Reference server exercising prompts, tools, and resources.' },
  { name: 'GitHub', url: 'https://github.com/github/github-mcp-server', what: 'Official GitHub server for repos, issues, pull requests, and Actions.' },
  { name: 'Sentry', url: 'https://github.com/getsentry/sentry-mcp', what: 'Retrieve and analyze errors and issues from Sentry.' },
  { name: 'Cloudflare', url: 'https://github.com/cloudflare/mcp-server-cloudflare', what: 'Manage Cloudflare resources such as Workers, KV, R2, and D1.' },
  { name: 'Notion', url: 'https://github.com/makenotion/notion-mcp-server', what: 'Read and update Notion pages and databases.' },
  { name: 'Playwright', url: 'https://github.com/microsoft/playwright-mcp', what: 'Browser automation and web interaction via Playwright.' },
];

/** Collapse inline markdown to plain text for a clean excerpt. */
function stripMarkdown(raw: string): string {
  return raw
    .replace(/\[([^\]]+)\]\([^)]*\)/g, '$1') // [text](url) -> text
    .replace(/[`*_]+/g, '')
    .replace(/\s+/g, ' ')
    .trim();
}

/** Resolve a README link target to a full URL (relative repo paths -> tree URL). */
function resolveUrl(href: string): string {
  const h = href.trim();
  if (/^https?:\/\//i.test(h)) return h;
  return REPO_TREE_BASE + h.replace(/^\.?\//, '');
}

/**
 * Parse the servers README markdown into seed items. Matches list rows shaped like
 *   - **[Name](url)** - description
 * (hyphen, en/em dash, or colon separator; optional bold). Rows without a
 * description are skipped. Deterministic and dedup'd by guid; bounded by MAX_ITEMS.
 */
export function parseMcpReadme(markdown: string): NormalizedIntelItem[] {
  const rowRe = /^\s*[-*]\s+\*{0,2}\[([^\]]+)\]\(([^)]+)\)\*{0,2}\s*[-–—:]\s+(.+?)\s*$/;
  const seen = new Set<string>();
  const items: NormalizedIntelItem[] = [];
  for (const line of markdown.split(/\r?\n/)) {
    const m = line.match(rowRe);
    if (!m) continue;
    const name = stripMarkdown(m[1]);
    const description = stripMarkdown(m[3]);
    if (!name || !description) continue;
    const guid = `mcp:${toSlug(name)}`;
    if (seen.has(guid)) continue;
    seen.add(guid);
    const excerpt = description.length > 400 ? `${description.slice(0, 399)}…` : description;
    items.push({ guid, source: SOURCE, title: name, url: resolveUrl(m[2]), excerpt, publishedAt: null });
    if (items.length >= MAX_ITEMS) break;
  }
  return items;
}

/** Map the authored fallback to normalized items. Pure, always non-empty. */
function fallbackItems(): NormalizedIntelItem[] {
  return FALLBACK.map((s) => ({
    guid: `mcp:${toSlug(s.name)}`,
    source: SOURCE,
    title: s.name,
    url: s.url,
    excerpt: s.what,
    publishedAt: null,
  }));
}

/**
 * Fetch + parse the live README; degrade to the curated fallback on any failure or
 * an empty parse. Never throws.
 */
export async function collect(): Promise<NormalizedIntelItem[]> {
  try {
    const markdown = await fetchWithTimeout(README_URL, { timeoutMs: 15_000, attempts: 3 });
    const parsed = parseMcpReadme(markdown);
    if (parsed.length > 0) return parsed;
    console.warn('[intel] mcp_server_spotlight: README parsed 0 entries — using curated fallback');
    return fallbackItems();
  } catch (err) {
    const msg = err instanceof Error ? err.message.split('\n')[0] : String(err);
    console.warn('[intel] mcp_server_spotlight: fetch/parse failed, using curated fallback -', msg);
    return fallbackItems();
  }
}

registerIntelSource({
  slug: SLUG,
  label: 'MCP Server Spotlight',
  enableEnv: 'MCP_SERVER_SPOTLIGHT_INGEST_ENABLED',
  maxPerRunEnv: 'MCP_SERVER_SPOTLIGHT_MAX_PER_RUN',
  collect,
});
