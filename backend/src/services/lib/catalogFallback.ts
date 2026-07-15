/**
 * Last-known-good Anthropic course catalog.
 *
 * Used as fallback when the scraper cannot reach https://www.anthropic.com/learn.
 * Outlines reflect course structure as of 2026-06-30; update when the scraper
 * confirms new modules or URLs from Anthropic.
 *
 * Also exports URL normalization utilities used by the scraper to compare
 * incoming URLs against stored ones regardless of trailing slashes, casing, etc.
 */

export interface KnownCourse {
  title: string;
  url: string;
  outline: string; // newline-separated module/section titles
}

export const KNOWN_CATALOG: readonly KnownCourse[] = [
  {
    title: 'Claude Code 101',
    url: 'https://anthropic.skilljar.com/claude-code-101',
    outline: [
      'Introduction to Claude Code',
      'Installing and configuring Claude Code',
      'Basic commands and workflows',
      'Code generation and editing',
      'Prompt techniques for coding tasks',
    ].join('\n'),
  },
  {
    title: 'Claude Code in Action',
    url: 'https://anthropic.skilljar.com/claude-code-in-action',
    outline: [
      'Building real projects with Claude Code',
      'Multi-file editing workflows',
      'Test-driven development with AI',
      'Debugging and refactoring with Claude',
      'Advanced Claude Code patterns',
    ].join('\n'),
  },
  {
    title: 'Introduction to Agent Skills',
    url: 'https://anthropic.skilljar.com/introduction-to-agent-skills',
    outline: [
      'What are AI agents?',
      'Tool use and function calling',
      'Building agentic pipelines',
      'Safety and reliability in agents',
      'Production agent patterns',
    ].join('\n'),
  },
  {
    title: 'Claude with the Anthropic API',
    url: 'https://anthropic.skilljar.com/claude-with-the-anthropic-api',
    outline: [
      'Anthropic API fundamentals',
      'Authentication and rate limits',
      'Prompt engineering with the API',
      'Streaming and async patterns',
      'Cost optimization and model selection',
    ].join('\n'),
  },
  {
    title: 'Introduction to Model Context Protocol',
    url: 'https://anthropic.skilljar.com/introduction-to-model-context-protocol',
    outline: [
      'What is MCP?',
      'MCP architecture and components',
      'Building MCP servers',
      'Connecting Claude to external tools via MCP',
      'MCP security and best practices',
    ].join('\n'),
  },
  {
    title: 'Model Context Protocol: Advanced Topics',
    url: 'https://anthropic.skilljar.com/model-context-protocol-advanced-topics',
    outline: [
      'Advanced MCP server patterns',
      'MCP resource management',
      'Multi-server orchestration',
      'MCP in production environments',
      'Debugging and observability for MCP',
    ].join('\n'),
  },
  {
    title: 'Introduction to Subagents',
    url: 'https://anthropic.skilljar.com/introduction-to-subagents',
    outline: [
      'What are subagents?',
      'Designing multi-agent architectures',
      'Delegation and coordination patterns',
      'State management across subagents',
      'Safety and reliability in multi-agent systems',
    ].join('\n'),
  },
];

/**
 * Normalize a course URL to a stable comparison key: `host/path`, lowercased,
 * with protocol, query, hash, and any trailing slash removed. Falls back to a
 * best-effort lowercased/trimmed string for non-absolute URLs.
 */
export function normalizeCourseUrl(raw: string | null | undefined): string {
  if (!raw) return '';
  const trimmed = raw.trim();
  if (!trimmed) return '';
  try {
    const u = new URL(trimmed);
    const host = u.host.toLowerCase();
    const path = u.pathname.replace(/\/+$/, '').toLowerCase();
    return `${host}${path}`;
  } catch {
    return trimmed
      .toLowerCase()
      .replace(/[?#].*$/, '')
      .replace(/\/+$/, '');
  }
}

const KNOWN_NORMALIZED = new Set(KNOWN_CATALOG.map((c) => normalizeCourseUrl(c.url)));

export function isKnownCourseUrl(courseUrl: string | null | undefined): boolean {
  const key = normalizeCourseUrl(courseUrl);
  return key !== '' && KNOWN_NORMALIZED.has(key);
}
