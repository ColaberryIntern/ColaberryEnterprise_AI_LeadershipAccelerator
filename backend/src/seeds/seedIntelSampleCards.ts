/**
 * seedIntelSampleCards — one representative, hand-authored published Timeline card
 * for each of the 10 Intelligence Pipeline curriculum types.
 *
 * Purpose: (1) a deterministic way to validate the full path — render (light +
 * dark), classroom/Today feed, and knowledge-graph ingest — WITHOUT depending on
 * a live LLM or a network feed; (2) the "sample Timeline Cards" deliverable.
 *
 * Idempotent: keyed on metadata.sample_key === slug, program-wide (cohort_id
 * null), published. Re-running updates the card in place — never duplicates. This
 * is a MANUAL/dev validation seed (not wired into boot); the live pipeline
 * (aiNewsIngestionService) is the production source of these cards.
 *
 * Run: `node dist/seeds/seedIntelSampleCards.js` (or ts-node the .ts).
 */
import { sequelize } from '../config/database';
import TimelineCard from '../models/TimelineCard';

const INTEL_PROGRAM_ID = process.env.INTEL_PROGRAM_ID || '92b98a72-8681-4f04-8ba1-16a18334cd0b';

interface SampleFields {
  type: string;
  title: string;
  render_band: string;
  bucket: string;
  what_heading: string;
  what: string;
  why: string;
  architect: string;
  business: string;
  technical: string;
  enterprise: string;
  next_action: string;
  skills: string;
  technologies: string;
  curriculum: string;
  source: string;
  date: string;
  confidence: 'High' | 'Medium' | 'Low';
  reflection: string;
  discussion: string;
  video?: { url: string; title: string; presenter?: string };
}

/** Build the executive quality-standard body_html from structured fields. */
export function sampleBody(f: SampleFields): string {
  return [
    `<h3>${f.what_heading}</h3><p>${f.what}</p>`,
    `<h3>Why it matters</h3><p>${f.why}</p>`,
    `<h3>Why an AI Systems Architect should care</h3><p>${f.architect}</p>`,
    `<h3>Implications</h3><ul>`,
    `<li><strong>Business:</strong> ${f.business}</li>`,
    `<li><strong>Technical:</strong> ${f.technical}</li>`,
    `<li><strong>Enterprise:</strong> ${f.enterprise}</li></ul>`,
    `<h3>Recommended next action</h3><p>${f.next_action}</p>`,
    `<h3>Related</h3><ul>`,
    `<li><strong>Skills:</strong> ${f.skills}</li>`,
    `<li><strong>Technologies:</strong> ${f.technologies}</li>`,
    `<li><strong>Curriculum:</strong> ${f.curriculum}</li></ul>`,
    `<h3>Source</h3><p>Source: ${f.source} · ${f.date}. Confidence: ${f.confidence}</p>`,
  ].join('');
}

export const SAMPLES: SampleFields[] = [
  {
    type: 'ai_news_flash', title: 'Anthropic Ships Claude Opus 4.8 With 1M Context', render_band: 'intel', bucket: 'learn',
    what_heading: 'What happened',
    what: 'Anthropic released a new flagship model with a one-million-token context window and stronger agentic coding, positioning it for long-horizon enterprise workflows.',
    why: 'Larger context plus better tool use collapses multi-step retrieval pipelines into a single call, changing how teams design AI systems.',
    architect: 'It shifts the build-vs-retrieve tradeoff: an architect can now hold an entire codebase or policy corpus in-context rather than standing up a vector store for every task.',
    business: 'Lower integration cost and faster time-to-value for document-heavy workflows.',
    technical: 'Re-evaluate RAG boundaries; long-context changes chunking, caching, and cost math.',
    enterprise: 'Governance must cover what the larger context ingests — data residency and retention still apply.',
    next_action: 'Benchmark one existing RAG workflow against a long-context prompt and compare cost, latency, and answer quality.',
    skills: 'context engineering, cost modeling, evaluation',
    technologies: 'Claude, long-context LLMs, vector databases',
    curriculum: 'Intensive 1 — Foundations; the Context Engineering deep dives',
    source: 'Anthropic', date: '2026-07-19', confidence: 'High',
    reflection: 'Where in your current design could a larger context replace a retrieval step?',
    discussion: 'When does long context beat RAG for the enterprise, and when does it not?',
  },
  {
    type: 'ai_research_digest', title: 'Reflection Improves Agent Reliability', render_band: 'intel', bucket: 'learn',
    what_heading: 'The paper, in plain English',
    what: 'A study shows that letting an agent critique and revise its own output before finishing meaningfully cuts error rates on multi-step tasks, at a modest token cost.',
    why: 'Reliability, not raw capability, is the blocker for enterprise agent adoption; a cheap reliability lever is directly actionable.',
    architect: 'Self-critique is a design pattern you can add to an existing agent loop without new infrastructure — a verify step before commit.',
    business: 'Fewer wrong actions means less human review and lower operational risk.',
    technical: 'Add a verifier pass; budget the extra tokens; measure the reliability delta.',
    enterprise: 'A verify step is auditable evidence that the system checked itself before acting.',
    next_action: 'Add a single self-critique pass to one agent workflow and measure the change in error rate.',
    skills: 'agent design, evaluation, prompt engineering',
    technologies: 'agent frameworks, LLM-as-judge',
    curriculum: 'Intensive 2 — Building Agents; the Evaluation labs',
    source: 'arXiv', date: '2026-07-15', confidence: 'Medium',
    reflection: 'Which of your workflows would benefit most from a verify-before-commit step?',
    discussion: 'Is self-critique enough, or do enterprise agents need an independent verifier?',
  },
  {
    type: 'ai_tool_of_the_day', title: 'Claude Code — Agentic Coding in the Terminal', render_band: 'intel', bucket: 'learn',
    what_heading: 'The tool',
    what: 'Claude Code is an agentic coding tool that plans, edits, tests, and commits across a real repository from the terminal or IDE.',
    why: 'It moves AI from autocomplete to end-to-end task execution, which is the workflow enterprise teams actually need.',
    architect: 'It is a reference implementation of an agent with tools, permissions, and memory — worth studying as a pattern, not just using.',
    business: 'Pricing is subscription-based; the productivity lever is large for well-scoped tasks.',
    technical: 'Runs against your repo with hooks, subagents, and MCP servers; integrates with GitHub.',
    enterprise: 'Permissions and audit matter — scope what the agent can touch and log what it does.',
    next_action: 'Run one small, well-defined refactor through Claude Code and review the diff before merging.',
    skills: 'agentic workflows, code review, prompt engineering',
    technologies: 'Claude Code, MCP, GitHub',
    curriculum: 'Intensive 1 — Claude Code Foundations',
    source: 'Claude Code docs', date: '2026-07-18', confidence: 'High',
    reflection: 'Where would agentic coding fit into your team without lowering your review bar?',
    discussion: 'Build or buy: where does an agentic coding tool belong in the enterprise stack?',
  },
  {
    type: 'ai_video_stream', title: 'How Claude Code Works in Large Codebases', render_band: 'media', bucket: 'learn',
    what_heading: 'What the video covers',
    what: 'An engineering talk on running agentic coding at scale: splitting exploration from editing, using subagents, and keeping context lean.',
    why: 'The techniques generalize to any agent system that has to operate over a large, messy corpus.',
    architect: 'Read-only exploration subagents plus a main editing agent is a reusable pattern for any large-context problem.',
    business: 'Faster onboarding to unfamiliar codebases; less senior-engineer time spent spelunking.',
    technical: 'Subagent fan-out, context budgeting, and verify-before-commit are the load-bearing ideas.',
    enterprise: 'Isolation between exploration and mutation reduces blast radius on shared repos.',
    next_action: 'Try a read-only exploration subagent on your own codebase before your next big change.',
    skills: 'agent orchestration, context engineering',
    technologies: 'Claude Code, subagents',
    curriculum: 'Intensive 2 — Agent Orchestration',
    source: 'Conference talk', date: '2026-07-10', confidence: 'Medium',
    reflection: 'Which exploration task would you delegate to a read-only subagent first?',
    discussion: 'What is the right boundary between exploration and mutation in your agents?',
    video: { url: 'https://www.youtube.com/watch?v=aihgAvpirDU', title: 'How Claude Code Works in Large Codebases', presenter: 'Anthropic' },
  },
  {
    type: 'ai_quote_of_the_day', title: 'Trust Before Intelligence', render_band: 'intel', bucket: 'reflect',
    what_heading: 'The quote',
    what: '<blockquote>"Enterprises do not adopt intelligence they cannot trust."</blockquote><p>— an enterprise-AI leader, on why governance precedes capability. The point: reliability and auditability, not raw model power, gate real-world adoption.</p>',
    why: 'It reframes the enterprise AI problem from "smarter models" to "trustworthy systems".',
    architect: 'Your job is to make capability trustworthy: verification, observability, and governance are first-class design goals.',
    business: 'Trust shortens sales cycles and de-risks rollouts.',
    technical: 'Design for evidence — logs, evals, and correlation IDs — from day one.',
    enterprise: 'Trust is a compliance and brand asset, not an afterthought.',
    next_action: 'Name the single weakest trust link in a system you are building and write down how you would harden it.',
    skills: 'governance, observability, leadership',
    technologies: 'evaluation harnesses, audit logging',
    curriculum: 'Intensive 4 — Governance & Enterprise Fit',
    source: 'Industry keynote', date: '2026-07-12', confidence: 'Low',
    reflection: 'Do you agree that trust precedes intelligence for enterprise adoption? Why?',
    discussion: 'What is the fastest way to build trust in an AI system you ship?',
  },
  {
    type: 'ai_architecture_breakdown', title: 'Perplexity — Architecture Breakdown', render_band: 'intel', bucket: 'learn',
    what_heading: 'The system',
    what: 'An answer engine that combines live web retrieval with an LLM: query understanding, source retrieval and ranking, grounded generation with citations, and follow-up handling.',
    why: 'It is a clean, real example of retrieval-grounded generation done at consumer scale.',
    architect: 'The pattern — retrieve, rank, ground, cite — maps directly onto enterprise knowledge assistants.',
    business: 'Citations build user trust and reduce hallucination liability.',
    technical: 'Retrieval quality and ranking dominate answer quality; the LLM is the last mile.',
    enterprise: 'Grounding with citations is exactly what regulated enterprises need for defensibility.',
    next_action: 'Sketch how you would add inline citations to one of your own generation flows.',
    skills: 'RAG design, retrieval, systems design',
    technologies: 'vector databases, rerankers, LLMs',
    curriculum: 'Intensive 2 — Retrieval-Grounded Systems',
    source: 'Engineering write-ups', date: '2026-07-08', confidence: 'Medium',
    reflection: 'Where would grounded, cited answers most increase trust in your product?',
    discussion: 'What is the hardest part of retrieval-grounded generation to get right at scale?',
  },
  {
    type: 'build_breakdown', title: 'A Solo Dev Built a Full MCP-Powered Research Agent', render_band: 'intel', bucket: 'learn',
    what_heading: 'What was built',
    what: 'A developer shipped an autonomous research agent that fans out web searches, verifies claims, and writes a cited report — wired together with MCP servers and a small orchestration loop.',
    why: 'It shows how far a single builder can get with agents plus MCP, and where the sharp edges are.',
    architect: 'The orchestration-plus-tools pattern is directly reusable; the lessons on verification are the valuable part.',
    business: 'Demonstrates rapid prototyping of a real product surface with minimal team.',
    technical: 'Fan-out search, adversarial verification, and synthesis; MCP as the tool layer.',
    enterprise: 'Verification and source-tracking are what make such a build enterprise-credible.',
    next_action: 'Recreate one piece — the verify step — in a small repo and open a PR.',
    skills: 'agent orchestration, verification, prompt engineering',
    technologies: 'MCP, agent loops, web search tools',
    curriculum: 'Intensive 3 — Capstone Builds',
    source: 'GitHub + developer blog', date: '2026-07-14', confidence: 'Medium',
    reflection: 'What would you build first with an agent-plus-MCP stack?',
    discussion: 'Which technique from this build would you adopt, and which would you change?',
  },
  {
    type: 'mcp_server_spotlight', title: 'GitHub MCP Server — MCP Server', render_band: 'intel', bucket: 'learn',
    what_heading: 'The server',
    what: 'An MCP server that exposes GitHub — issues, PRs, code search, and file contents — as tools an AI agent can call directly.',
    why: 'It lets an agent operate on real project state instead of guessing, which is the difference between a demo and a workflow.',
    architect: 'MCP standardizes tool access, so the same agent can talk to GitHub, a database, and a search index through one protocol.',
    business: 'Automates routine repo triage and reporting.',
    technical: 'Install, authenticate, and register the server; the agent gets typed tools.',
    enterprise: 'Scope tokens tightly and audit tool calls — the server is a privileged surface.',
    next_action: 'Install the GitHub MCP server into a Claude Code project and have it summarize open PRs.',
    skills: 'MCP integration, tool design, security',
    technologies: 'MCP, GitHub API',
    curriculum: 'Intensive 2 — Tools & MCP',
    source: 'MCP registry + repo', date: '2026-07-11', confidence: 'High',
    reflection: 'Which of your systems would benefit most from MCP-standardized tools?',
    discussion: 'Where does an MCP server add the most leverage in your stack?',
  },
  {
    type: 'claude_code_technique', title: 'Split Exploration From Editing With Subagents', render_band: 'intel', bucket: 'practice',
    what_heading: 'The technique',
    what: 'Use read-only exploration subagents to map an unfamiliar subsystem and write findings to a file, then have the main agent make edits with the full picture — keeping the editing context lean.',
    why: 'It prevents context bloat and mistakes on large codebases, and it parallelizes research.',
    architect: 'It is a concrete instance of separation of concerns applied to agent context management.',
    business: 'Faster, safer changes in large or unfamiliar repositories.',
    technical: 'Steps: (1) fan out read-only Explore subagents, (2) collect findings, (3) edit with the main agent, (4) verify.',
    enterprise: 'Read-only exploration limits blast radius on shared, production repos.',
    next_action: 'On your next cross-cutting change, run an exploration subagent first and edit only after reading its map.',
    skills: 'agent orchestration, context engineering, planning',
    technologies: 'Claude Code, subagents',
    curriculum: 'Intensive 1 — Claude Code Foundations',
    source: 'Claude Code best practices', date: '2026-07-16', confidence: 'High',
    reflection: 'Where would splitting exploration from editing save you the most time?',
    discussion: 'What is your own variation on the explore-then-edit pattern?',
  },
  {
    type: 'market_intelligence', title: 'Enterprise AI Spend Shifts From Pilots to Platforms', render_band: 'intel', bucket: 'learn',
    what_heading: 'The signal',
    what: 'Buying is moving from scattered proofs-of-concept to consolidated AI platforms, with budget concentrating on governance, evaluation, and integration rather than raw model access.',
    why: 'It signals where demand — and jobs — are heading: the durable value is in the surrounding system, not the model.',
    architect: 'Platform-level thinking (governance, evals, integration) is exactly the AI Systems Architect remit.',
    business: 'Budget favors platforms and outcomes over experiments; position accordingly.',
    technical: 'Invest in evaluation harnesses, observability, and integration surfaces.',
    enterprise: 'Procurement now asks about audit, security, and reliability up front.',
    next_action: 'Map one of your initiatives to a platform capability buyers are funding (governance, evals, or integration).',
    skills: 'strategy, governance, systems design',
    technologies: 'AI platforms, evaluation tooling, observability',
    curriculum: 'Intensive 4 — Enterprise Strategy & Positioning',
    source: 'Opportunity Pulse + industry reports', date: '2026-07-17', confidence: 'Medium',
    reflection: 'How does this shift change your positioning or roadmap?',
    discussion: 'Which industry is the biggest enterprise-AI opportunity right now, and why?',
  },
];

export async function seedIntelSampleCards(): Promise<{ created: string[]; updated: string[] }> {
  const created: string[] = [];
  const updated: string[] = [];

  for (const f of SAMPLES) {
    const content: any = {
      title: f.title,
      summary: f.why,
      body_html: sampleBody(f),
      questions: [],
      reflection: f.reflection,
      discussion_prompt: f.discussion,
      content_at: new Date().toISOString(),
    };
    const metadata: any = {
      content,
      content_at: new Date().toISOString(),
      sample_key: f.type,
      source: 'intel_sample_seed',
    };
    if (f.video) metadata.video = f.video;

    // Idempotency: one sample card per type, keyed on metadata.sample_key.
    const [rows]: any = await sequelize.query(
      `SELECT id FROM timeline_cards WHERE type = :type AND metadata->>'sample_key' = :key LIMIT 1`,
      { replacements: { type: f.type, key: f.type } },
    );
    const existingId = Array.isArray(rows) && rows[0] ? rows[0].id : null;

    if (existingId) {
      const card = await TimelineCard.findByPk(existingId);
      if (card) {
        await card.update({ title: f.title, description: f.why, metadata, visibility: 'published', status: 'active' });
        updated.push(f.type);
      }
    } else {
      await TimelineCard.create({
        type: f.type,
        title: f.title,
        description: f.why,
        week: null,
        bucket: f.bucket as any,
        visibility: 'published',
        status: 'active',
        estimated_time: 8,
        difficulty: 'intro',
        points: { learning: 5 },
        cohort_id: null,
        program_id: INTEL_PROGRAM_ID,
        release_date: new Date(f.date),
        metadata,
      } as any);
      created.push(f.type);
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
