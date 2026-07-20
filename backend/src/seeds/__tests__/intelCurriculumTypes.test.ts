/**
 * Contract tests for the 10 Intelligence Pipeline curriculum types: each is
 * registered, authored, approved, published, carries a dual-mode generation
 * prompt that emits the executive quality standard, and maps onto a rendered
 * band. These are the acceptance criteria for "the types appear and work".
 */
import { COMPONENT_AUTHORING } from '../seedComponentAuthoring';
import { CARD_TYPES } from '../../services/timeline/typeRegistry';

const INTEL_SLUGS = [
  'ai_news_flash', 'ai_research_digest', 'ai_tool_of_the_day', 'ai_video_stream',
  'ai_quote_of_the_day', 'ai_architecture_breakdown', 'build_breakdown',
  'mcp_server_spotlight', 'claude_code_technique', 'market_intelligence',
];

const registryBySlug = new Map(CARD_TYPES.map((t) => [t.slug, t]));

describe('intelligence pipeline curriculum types', () => {
  it('registers all 10 types in the registry', () => {
    const missing = INTEL_SLUGS.filter((s) => !registryBySlug.has(s));
    expect(missing).toEqual([]);
  });

  it('renders over a band that has a frontend visual (intel or media)', () => {
    for (const slug of INTEL_SLUGS) {
      const band = registryBySlug.get(slug)!.render_band;
      expect(['intel', 'media']).toContain(band);
    }
  });

  it('surfaces into the Today feed (today-homed, anchored, today_eligible)', () => {
    for (const slug of INTEL_SLUGS) {
      const t = registryBySlug.get(slug)!;
      expect(t.home_surface).toBe('today');
      expect(t.feed_mode).toBe('anchored');
      expect(t.today_eligible).toBe(true);
    }
  });

  it('authors, approves and publishes each type with a generation prompt', () => {
    for (const slug of INTEL_SLUGS) {
      const a = COMPONENT_AUTHORING[slug];
      expect(a).toBeTruthy();
      expect(a.approved).toBe(true);
      expect(a.status).toBe('published');
      expect(typeof a.generation_prompt).toBe('string');
      expect((a.generation_prompt as string).length).toBeGreaterThan(400);
      expect(a.category).toBe('Intelligence');
      expect(Array.isArray(a.capabilities)).toBe(true);
      expect((a.capabilities as string[]).length).toBeGreaterThan(0);
    }
  });

  it('every generation prompt is DUAL-MODE (item vars + WEEK CONTEXT fallback) and emits the quality standard', () => {
    for (const slug of INTEL_SLUGS) {
      const p = COMPONENT_AUTHORING[slug].generation_prompt as string;
      // dual-mode: references the ITEM variables and the week-context fallback
      expect(p).toContain('{{item_title}}');
      expect(p).toContain('WEEK CONTEXT');
      // executive quality standard sections
      expect(p).toContain('Why it matters');
      expect(p).toContain('Why an AI Systems Architect should care');
      expect(p).toContain('Implications');
      expect(p).toContain('Recommended next action');
      // fixed 9-key schema hygiene
      expect(p).toContain('reflection');
      expect(p).toContain('discussion_prompt');
    }
  });

  it('exposes the ingest item variables so a pipeline can drive them', () => {
    for (const slug of INTEL_SLUGS) {
      const vars = (COMPONENT_AUTHORING[slug].variable_keys as string[]) || [];
      for (const v of ['item_title', 'item_source', 'item_url', 'item_excerpt', 'item_date']) {
        expect(vars).toContain(v);
      }
    }
  });
});
