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

/**
 * Authored fallback (constant, not user input) of well-known MCP servers, grown
 * from ~12 to ~35 (2026-08-10, content-supply fix) — the live README parse
 * apparently isn't turning up enough NEW unique entries to outpace
 * MCP_SERVER_SPOTLIGHT_MAX_PER_RUN=2/day (confirmed: production has fully carded
 * its entire known pool and gone quiet for 11+ days). Deepening the fallback
 * catalog is the direct fix available without debugging the live parser itself.
 */
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
  { name: 'Slack', url: 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/slack', what: 'Send messages and read channel history in Slack workspaces.' },
  { name: 'Google Drive', url: 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/gdrive', what: 'Search and read files from Google Drive.' },
  { name: 'PostgreSQL', url: 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/postgres', what: 'Read-only access to query and inspect a Postgres database schema.' },
  { name: 'SQLite', url: 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/sqlite', what: 'Query and inspect a local SQLite database file.' },
  { name: 'Puppeteer', url: 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/puppeteer', what: 'Browser automation and web scraping via headless Chrome.' },
  { name: 'Brave Search', url: 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/brave-search', what: 'Web and local search results through the Brave Search API.' },
  { name: 'Google Maps', url: 'https://github.com/modelcontextprotocol/servers-archived/tree/main/src/google-maps', what: 'Location search, directions, and place details via Google Maps.' },
  { name: 'AWS', url: 'https://github.com/awslabs/mcp', what: "AWS Labs' official collection of servers for AWS service integration." },
  { name: 'Stripe', url: 'https://github.com/stripe/agent-toolkit', what: 'Create payments, manage customers, and query Stripe data.' },
  { name: 'Linear', url: 'https://github.com/tacticlaunch/mcp-linear', what: 'Read and manage Linear issues, projects, and cycles.' },
  { name: 'Jira/Confluence', url: 'https://github.com/sooperset/mcp-atlassian', what: 'Read and update Jira issues and Confluence pages.' },
  { name: 'Docker', url: 'https://github.com/docker/mcp-servers', what: "Docker's official collection of containerized MCP servers." },
  { name: 'HubSpot', url: 'https://github.com/HubSpot/hubspot-mcp-server', what: 'Manage HubSpot CRM contacts, deals, and marketing objects.' },
  { name: 'Figma', url: 'https://github.com/GLips/Figma-Context-MCP', what: 'Pull design context and layout data directly from Figma files.' },
  { name: 'Zapier', url: 'https://zapier.com/mcp', what: "Connect an agent to Zapier's thousands of app integrations." },
  { name: 'Perplexity', url: 'https://github.com/ppl-ai/modelcontextprotocol', what: 'Real-time web search and question-answering via Perplexity.' },
  { name: 'Redis', url: 'https://github.com/redis/mcp-redis', what: 'Read and write Redis keys, streams, and data structures.' },
  { name: 'MongoDB', url: 'https://github.com/mongodb-js/mongodb-mcp-server', what: 'Query and manage MongoDB databases and collections.' },
  { name: 'Grafana', url: 'https://github.com/grafana/mcp-grafana', what: 'Query dashboards, alerts, and datasources in Grafana.' },
  { name: 'Terraform', url: 'https://github.com/hashicorp/terraform-mcp-server', what: 'Look up Terraform provider docs and module registry data.' },
  { name: 'Kubernetes', url: 'https://github.com/Flux159/mcp-server-kubernetes', what: 'Inspect and manage Kubernetes cluster resources.' },
  { name: 'Airtable', url: 'https://github.com/domdomegg/airtable-mcp-server', what: 'Read and update Airtable bases, tables, and records.' },
  { name: 'Context7', url: 'https://github.com/upstash/context7', what: 'Fetch up-to-date, version-specific library documentation into context.' },
  { name: 'DeepWiki', url: 'https://github.com/regenrek/deepwiki-mcp', what: 'Query AI-generated documentation and Q&A for open-source GitHub repos.' },
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
