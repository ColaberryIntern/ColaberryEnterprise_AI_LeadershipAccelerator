/**
 * marketIntelligenceSource — CURATED intel source: one AI industry market-intelligence
 * brief per run (funding rounds, market moves, compute/infrastructure dynamics,
 * enterprise adoption trends, valuations, and AI labor-market shifts).
 *
 * HISTORY: this adapter used to be a live fetch over an internal "Opportunity Pulse"
 * REST API (OPPORTUNITY_PULSE_URL), which is Colaberry's INTERNAL business-development
 * tool for tracking government contract bids (RFPs, set-asides, etc.) — content with no
 * relationship to "AI market intelligence" as a student-facing curriculum topic. That
 * URL was never configured in prod, so the adapter degraded dark (logged a skip line,
 * returned [], never threw) and produced nothing. The integration itself was the wrong
 * data source, not a missing env var, so rather than wire it to Opportunity Pulse this
 * adapter is now a CURATED source, following the exact same pattern already shipping
 * for ai_quote_of_the_day / ai_tool_of_the_day / claude_code_technique in this directory.
 *
 * collect() returns a static, authored set of market-intelligence briefs as seed items.
 * It does NOT fetch and NEVER throws. guid is `market:<slug-of-headline>` so it is
 * stable per brief regardless of array order — the engine dedups and rotates on it.
 *
 * Convention (matches the sibling adapters): title = the short headline, excerpt = the
 * one-line brief, url = a stable company/product page when one naturally exists, else
 * null (matches ai_quote_of_the_day's null-url pattern for facts with no single
 * canonical citation). The LLM expands each seed into the rendered card by slug.
 */
import { NormalizedIntelItem, registerIntelSource } from '../intelRegistry';
import { toSlug } from './idUtils';

export const SLUG = 'market_intelligence';
const SOURCE = 'Curated';

interface CuratedMarketItem {
  headline: string;
  summary: string;
  url: string | null;
}

/** Authored set (constant, not user input) of ~22 AI market-intelligence briefs:
 *  funding rounds, acquisitions/market moves, compute/infrastructure dynamics,
 *  valuations and IPOs, enterprise adoption trends, and AI labor-market shifts. */
const BRIEFS: readonly CuratedMarketItem[] = [
  { headline: 'OpenAI valuation reaches ~$300B', summary: 'A 2025 tender/funding round led by Thrive Capital valued OpenAI at roughly $300B, among the largest private-company valuations on record.', url: 'https://openai.com' },
  { headline: 'Anthropic raises $13B Series F', summary: 'Anthropic closed a $13B Series F in September 2025 at a $183B valuation, led by ICONIQ with Fidelity, GIC, and others participating.', url: 'https://www.anthropic.com' },
  { headline: 'Amazon commits up to $8B to Anthropic', summary: 'Amazon expanded its total committed investment in Anthropic to up to $8B (2024), pairing capital with an AWS/Trainium compute partnership.', url: 'https://www.anthropic.com' },
  { headline: 'Microsoft’s cumulative OpenAI investment near $13B', summary: 'Microsoft’s investment in OpenAI across multiple rounds since 2019 totals roughly $13B, tying Azure capacity closely to OpenAI’s model roadmap.', url: 'https://www.microsoft.com/en-us/ai' },
  { headline: 'Nvidia crosses $4 trillion market cap', summary: 'Nvidia became the first company to reach a $3T market cap in 2024, then a $4T market cap in 2025, driven almost entirely by AI-accelerator demand.', url: 'https://www.nvidia.com' },
  { headline: 'Stargate: up to $500B AI infrastructure push', summary: 'OpenAI, Oracle, and SoftBank announced the Stargate initiative in January 2025, a planned buildout of U.S. AI data-center capacity of up to $500B over four years.', url: 'https://openai.com/index/announcing-the-stargate-project/' },
  { headline: 'CoreWeave completes AI-cloud IPO', summary: 'CoreWeave, the Nvidia-backed AI cloud/GPU compute provider, completed its Nasdaq IPO in March 2025, one of the largest AI-infrastructure public listings to date.', url: 'https://www.coreweave.com' },
  { headline: 'Databricks closes $10B Series J', summary: 'Databricks closed a $10B Series J in December 2024 at a $62B valuation, one of the largest private financing rounds ever for a data/AI company.', url: 'https://www.databricks.com' },
  { headline: 'xAI merges with X, valuation climbs past $100B', summary: 'Elon Musk’s xAI merged with X (formerly Twitter) in 2025 and raised billions in new equity, with reported valuations climbing past $100B later in the year.', url: 'https://x.ai' },
  { headline: 'Meta takes 49% stake in Scale AI for $14.3B', summary: 'Meta paid roughly $14.3B for a 49% stake in Scale AI in 2025 and brought on Scale’s CEO to help lead a new internal "Superintelligence Labs" effort.', url: 'https://scale.com' },
  { headline: 'AI talent war: nine-figure pay packages', summary: 'Meta reportedly offered nine-figure compensation packages in 2025 to recruit senior AI researchers away from OpenAI and other labs, intensifying industry-wide competition for scarce talent.', url: null },
  { headline: 'Mistral AI valued near $14B', summary: 'Paris-based open-weight model lab Mistral AI raised a large 2025 round led by ASML, valuing the company at roughly $14B.', url: 'https://mistral.ai' },
  { headline: 'Perplexity AI valuation jumps to ~$9B', summary: 'AI-search startup Perplexity raised funding at a valuation reported around $9B in 2025, up sharply from roughly $1B about a year earlier.', url: 'https://www.perplexity.ai' },
  { headline: 'Cohere raises $500M+ enterprise-AI round', summary: 'Enterprise-focused LLM company Cohere raised a round of more than $500M in 2024, with backers including Nvidia, Salesforce, and Oracle.', url: 'https://cohere.com' },
  { headline: 'Hugging Face reaches ~$4.5B valuation', summary: 'Open-source model hub Hugging Face reached a roughly $4.5B valuation in its 2023 Series D, cementing its role as the default hosting layer for open models.', url: 'https://huggingface.co' },
  { headline: 'Google’s licensing deal with Character.AI', summary: 'Google struck a licensing and talent arrangement with Character.AI in 2024, echoing its earlier Inflection AI deal — a structure that became a recurring pattern for absorbing AI startups without a formal acquisition.', url: null },
  { headline: 'U.S. tightens AI chip export controls', summary: 'The U.S. tightened export restrictions on advanced Nvidia AI chips to China across 2024-2025, reshaping both Nvidia’s China revenue and the broader global AI hardware market.', url: null },
  { headline: 'Hyperscaler AI capex tops $200B for 2025', summary: 'Microsoft, Google, Amazon, and Meta collectively guided to well over $200B in AI-related capital expenditure for 2025, chiefly data centers and accelerators.', url: null },
  { headline: 'Majority of enterprises now piloting gen AI', summary: 'McKinsey’s global surveys through 2024-2025 found a majority of large enterprises piloting generative AI in at least one business function, though far fewer reported it running at enterprise-wide scale.', url: null },
  { headline: 'AI/ML engineer job postings surge', summary: 'Hiring data through 2025 showed sharp growth in "AI/ML engineer" and "AI agent" role postings, alongside fast-emerging demand for prompt- and context-engineering skills.', url: null },
  { headline: 'SoftBank’s Vision Fund pivots to AI', summary: 'SoftBank’s Vision Fund shifted heavily toward AI bets, including a multi-billion-dollar commitment to OpenAI’s 2025 funding round as part of a stated ambition to fund "artificial superintelligence."', url: null },
  { headline: 'Frontier AI companies push combined value past $1T', summary: 'Combined, the leading frontier AI labs and infrastructure companies — OpenAI, Anthropic, xAI, Databricks, and CoreWeave — pushed private AI-sector valuations past the trillion-dollar mark collectively by 2025.', url: null },
];

/** Curated: return the authored briefs as normalized seed items. Never throws. */
export async function collect(): Promise<NormalizedIntelItem[]> {
  try {
    const seen = new Set<string>();
    const items: NormalizedIntelItem[] = [];
    for (const b of BRIEFS) {
      const guid = `market:${toSlug(b.headline)}`;
      if (seen.has(guid)) continue; // guard against an accidental duplicate headline
      seen.add(guid);
      items.push({ guid, source: SOURCE, title: b.headline, url: b.url, excerpt: b.summary, publishedAt: null });
    }
    return items;
  } catch {
    // Curated data can't realistically throw, but the contract is absolute:
    // collect() never throws. Worst case is an empty run, never a crash.
    return [];
  }
}

// Self-register at module load (last-write-wins; idempotent under re-import).
registerIntelSource({
  slug: SLUG,
  label: 'Market Intelligence',
  enableEnv: 'MARKET_INTELLIGENCE_INGEST_ENABLED',
  maxPerRunEnv: 'MARKET_INTELLIGENCE_MAX_PER_RUN',
  collect,
});
