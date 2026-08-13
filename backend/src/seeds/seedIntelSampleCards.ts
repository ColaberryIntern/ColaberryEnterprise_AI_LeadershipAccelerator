/**
 * seedIntelSampleCards — one representative, hand-authored published Timeline card
 * for each of the 10 Intelligence Pipeline curriculum types, using the DISTINCT
 * per-type visual format from intelCardFormats.ts.
 *
 * Purpose: (1) a deterministic way to validate the full path — render (light +
 * dark), classroom/Today feed, and knowledge-graph ingest — WITHOUT depending on
 * a live LLM or a network feed; (2) the "sample Timeline Cards" deliverable.
 *
 * Idempotent: keyed on metadata.sample_key === slug, program-wide (cohort_id
 * null), published. Re-running updates the card in place — never duplicates.
 * MANUAL/dev validation seed (not wired into boot); the live pipeline is the
 * production source. Run: `node dist/seeds/seedIntelSampleCards.js`.
 */
import { sequelize } from '../config/database';
import TimelineCard from '../models/TimelineCard';
import { INTEL_FORMATS, sampleBodyFor } from './intelCardFormats';

const INTEL_PROGRAM_ID = process.env.INTEL_PROGRAM_ID || '92b98a72-8681-4f04-8ba1-16a18334cd0b';

interface SampleMeta { title: string; summary: string; reflection: string; discussion: string; bucket: string; render_band: string; video?: { url: string; title: string; presenter?: string } }

export const META: Record<string, SampleMeta> = {
  ai_news_flash: {
    title: 'Anthropic Ships Claude Opus 4.8 With 1M Context', render_band: 'intel', bucket: 'learn',
    summary: 'A new flagship model with a 1M-token context window reshapes the build-vs-retrieve tradeoff.',
    reflection: 'Where in your current design could a larger context replace a retrieval step?',
    discussion: 'When does long context beat RAG for the enterprise, and when does it not?',
  },
  ai_research_digest: {
    title: 'Self-Reflection Improves Agent Reliability', render_band: 'intel', bucket: 'learn',
    summary: 'A verify-before-commit pass cuts agent error rates at modest token cost.',
    reflection: 'Which of your workflows would benefit most from a verify-before-commit step?',
    discussion: 'Is self-critique enough, or do enterprise agents need an independent verifier?',
  },
  ai_tool_of_the_day: {
    title: 'Claude Code — Agentic Coding in the Terminal', render_band: 'intel', bucket: 'learn',
    summary: 'Agentic coding that plans, edits, tests, and commits across a real repo.',
    reflection: 'Where would agentic coding fit into your team without lowering your review bar?',
    discussion: 'Build or buy: where does an agentic coding tool belong in the enterprise stack?',
  },
  ai_video_stream: {
    title: 'How Claude Code Works in Large Codebases', render_band: 'media', bucket: 'learn',
    summary: 'Splitting exploration from editing, using subagents, and keeping context lean.',
    reflection: 'Which exploration task would you delegate to a read-only subagent first?',
    discussion: 'What is the right boundary between exploration and mutation in your agents?',
    // Was aihgAvpirDU, which was removed from YouTube (oEmbed 404) and left 145
    // students with a dead player. Fixed in the DB on 2026-08-12 and silently
    // reverted hours later by this seed, which re-asserts all 10 sample cards on
    // every boot — so the seed is the only durable place to fix it. Replacement
    // verified via oEmbed author_name: channel "Claude", 170s.
    video: { url: 'https://www.youtube.com/watch?v=6bs5b4FltCU', title: 'How Claude Code Works', presenter: 'Claude' },
  },
  ai_quote_of_the_day: {
    title: 'Trust Before Intelligence', render_band: 'intel', bucket: 'reflect',
    summary: 'Governance precedes capability — trustworthy systems, not smarter models, gate adoption.',
    reflection: 'Do you agree that trust precedes intelligence for enterprise adoption? Why?',
    discussion: 'What is the fastest way to build trust in an AI system you ship?',
  },
  ai_architecture_breakdown: {
    title: 'Perplexity — Architecture Breakdown', render_band: 'intel', bucket: 'learn',
    summary: 'Retrieve → rank → ground → cite: retrieval-grounded generation at scale.',
    reflection: 'Where would grounded, cited answers most increase trust in your product?',
    discussion: 'What is the hardest part of retrieval-grounded generation to get right at scale?',
  },
  build_breakdown: {
    title: 'A Solo Dev Built an MCP-Powered Research Agent', render_band: 'intel', bucket: 'learn',
    summary: 'Fan-out search, verification, and synthesis wired together with MCP.',
    reflection: 'What would you build first with an agent-plus-MCP stack?',
    discussion: 'Which technique from this build would you adopt, and which would you change?',
  },
  mcp_server_spotlight: {
    title: 'GitHub MCP Server', render_band: 'intel', bucket: 'learn',
    summary: 'GitHub issues, PRs, and code search exposed as agent-callable tools.',
    reflection: 'Which of your projects could this server plug into?',
    discussion: 'Where does an MCP server like this add the most leverage in your stack?',
  },
  claude_code_technique: {
    title: 'Split Exploration From Editing With Subagents', render_band: 'intel', bucket: 'practice',
    summary: 'Read-only exploration subagents map the code; the main agent edits with the full picture.',
    reflection: 'Where would this technique save you the most time?',
    discussion: 'What is your own variation on the explore-then-edit pattern?',
  },
  market_intelligence: {
    title: 'Enterprise AI Spend Shifts From Pilots to Platforms', render_band: 'intel', bucket: 'learn',
    summary: 'Budget concentrates on governance, evaluation, and integration — not model access.',
    reflection: 'How does this shift change your positioning or roadmap?',
    discussion: 'Which industry is the biggest enterprise-AI opportunity right now, and why?',
  },
};

export async function seedIntelSampleCards(): Promise<{ created: string[]; updated: string[] }> {
  const created: string[] = [];
  const updated: string[] = [];

  for (const slug of Object.keys(INTEL_FORMATS)) {
    const m = META[slug];
    if (!m) continue;
    const content: any = {
      title: m.title,
      summary: m.summary,
      body_html: sampleBodyFor(slug),
      questions: [],
      reflection: m.reflection,
      discussion_prompt: m.discussion,
      content_at: new Date().toISOString(),
    };
    const metadata: any = {
      content,
      content_at: new Date().toISOString(),
      sample_key: slug,
      source: 'intel_sample_seed',
    };
    if (m.video) metadata.video = m.video;

    // Idempotency: one sample card per type, keyed on metadata.sample_key.
    const [rows]: any = await sequelize.query(
      `SELECT id FROM timeline_cards WHERE type = :type AND metadata->>'sample_key' = :key LIMIT 1`,
      { replacements: { type: slug, key: slug } },
    );
    const existingId = Array.isArray(rows) && rows[0] ? rows[0].id : null;

    if (existingId) {
      const card = await TimelineCard.findByPk(existingId);
      if (card) {
        await card.update({ title: m.title, description: m.summary, metadata, visibility: 'published', status: 'active' });
        updated.push(slug);
      }
    } else {
      await TimelineCard.create({
        type: slug,
        title: m.title,
        description: m.summary,
        week: null,
        bucket: m.bucket as any,
        visibility: 'published',
        status: 'active',
        estimated_time: 8,
        difficulty: 'intro',
        points: { learning: 5 },
        cohort_id: null,
        program_id: INTEL_PROGRAM_ID,
        release_date: new Date(),
        metadata,
      } as any);
      created.push(slug);
    }
  }
  return { created, updated };
}

if (require.main === module) {
  (async () => {
    await sequelize.authenticate();
    const r = await seedIntelSampleCards();
    console.log(`[seedIntelSampleCards] created=${JSON.stringify(r.created)} updated=${JSON.stringify(r.updated)}`);
    await sequelize.close();
    process.exit(0);
  })().catch((e) => { console.error('[seedIntelSampleCards] ERROR', e?.message || e); process.exit(1); });
}

export default seedIntelSampleCards;
