/**
 * Lead Intelligence + Deal Probability Scoring Engine
 *
 * Two scoring dimensions for cold_outbound campaigns:
 * 1. Intelligence Score (0-150) — ICP fit quality
 * 2. Deal Probability Score (0-100) — conversion likelihood
 *
 * Combined Rank = (intelligence × 0.6) + (deal_probability × 0.4)
 *
 * Operates on raw ApolloPersonResult data (pre-import).
 */

import type { ApolloPersonResult } from './apolloService';

// ── Interfaces ──────────────────────────────────────────────────────────

export interface IntelligenceBreakdown {
  industry_fit: number;     // 0-20
  company_size: number;     // 0-20
  authority: number;        // 0-40
  ai_signal: number;        // 0-20
  intent_signal: number;    // 0-20
  tech_stack: number;       // 0-10
  engagement: number;       // 0-10
  corporate_email: number;  // 0-10
  total: number;            // 0-150
}

export interface DealProbabilityBreakdown {
  authority: number;              // 0-25
  company_power: number;          // 0-20
  ai_maturity: number;            // 0-20
  intent_strength: number;        // 0-20
  technology_alignment: number;   // 0-10
  industry_conversion: number;    // 0-10
  total: number;                  // 0-100
  tier: 'A' | 'B' | 'C' | 'D';
}

export interface CombinedLeadScore {
  person: ApolloPersonResult;
  intelligence: IntelligenceBreakdown;
  deal_probability: DealProbabilityBreakdown;
  combined_rank: number;
}

export interface IntelligenceSummary {
  total_scored: number;
  total_imported: number;
  avg_intelligence_score: number;
  avg_deal_probability: number;
  tier_distribution: { tier: string; count: number; pct: number }[];
  top_industries: { name: string; count: number }[];
  authority_distribution: { level: string; count: number }[];
  ai_signal_count: number;
  ai_signal_pct: number;
}

// ── Constants ───────────────────────────────────────────────────────────

const HIGH_VALUE_INDUSTRIES = [
  'financial services', 'healthcare', 'insurance', 'technology',
  'manufacturing', 'consulting', 'retail', 'logistics',
];

const HIGH_CONVERSION_INDUSTRIES = [
  'financial services', 'insurance', 'healthcare', 'technology',
];

const AI_TITLE_PATTERNS = /\b(ai|artificial\s*intelligence|machine\s*learning|ml|data\s*science|analytics|deep\s*learning|nlp|computer\s*vision)\b/i;

const AI_LEADERSHIP_PATTERNS = /\b(ai\s+(?:officer|leader|director|head|chief|strategy|governance|transformation))|(?:(?:chief|head\s+of|vp|director)\s+.*(?:ai|artificial\s*intelligence|data|analytics|machine\s*learning))\b/i;

const C_SUITE_PATTERN = /\b(chief\s+\w+\s+officer|c[a-z]o\b|ceo|cto|cio|cdo|cfo|coo|caio|cdao)\b/i;
const VP_PATTERN = /\b(vp|vice\s*president|svp|evp|head\s+of)\b/i;
const DIRECTOR_PATTERN = /\b(director)\b/i;

const AI_INTENT_TOOLS = [
  'openai', 'anthropic', 'tensorflow', 'pytorch', 'hugging face',
  'langchain', 'vertex ai', 'azure ai', 'aws sagemaker', 'bedrock',
  'databricks ml', 'mlflow', 'wandb', 'cohere',
];

const TECH_ALIGNMENT_TOOLS = [
  'azure', 'aws', 'snowflake', 'databricks', 'openai', 'anthropic',
];

const FREE_EMAIL_PROVIDERS = [
  'gmail.com', 'yahoo.com', 'outlook.com', 'hotmail.com',
  'aol.com', 'icloud.com', 'mail.com', 'protonmail.com',
];

// ── Intelligence Score (0-150) ──────────────────────────────────────────

export function calculateIntelligenceScore(
  person: ApolloPersonResult,
  icpIndustries?: string[],
): IntelligenceBreakdown {
  const title = (person.title || '').toLowerCase();
  const org = person.organization;
  const industry = (org?.industry || '').toLowerCase();
  const employees = org?.estimated_num_employees || 0;
  const techStack = (org?.technology_names || []).map((t) => t.toLowerCase());

  // Industry fit (+20)
  const allTargetIndustries = [
    ...HIGH_VALUE_INDUSTRIES,
    ...(icpIndustries || []).map((i) => i.toLowerCase()),
  ];
  const industry_fit = allTargetIndustries.some((i) => industry.includes(i)) ? 20 : 0;

  // Company size (+20)
  let company_size = 0;
  if (employees >= 2000) company_size = 20;
  else if (employees >= 500) company_size = 15;
  else if (employees >= 200) company_size = 10;

  // Authority (+40)
  let authority = 0;
  if (C_SUITE_PATTERN.test(person.title || '')) authority = 40;
  else if (VP_PATTERN.test(person.title || '')) authority = 35;
  else if (DIRECTOR_PATTERN.test(person.title || '')) authority = 30;

  // AI signal (+20) — title contains AI/ML/Data keywords
  const ai_signal = AI_TITLE_PATTERNS.test(person.title || '') ? 20 : 0;

  // Intent signal (+20) — org tech stack contains AI tools
  const hasAiTools = techStack.some((t) =>
    AI_INTENT_TOOLS.some((tool) => t.includes(tool))
  );
  const intent_signal = hasAiTools ? 20 : 0;

  // Tech stack alignment (+10)
  const hasTechAlignment = techStack.some((t) =>
    TECH_ALIGNMENT_TOOLS.some((tool) => t.includes(tool))
  );
  const tech_stack = hasTechAlignment ? 10 : 0;

  // Engagement signals (+10) — phone +5, linkedin +5
  let engagement = 0;
  if (person.phone_numbers?.some((p) => p.raw_number?.trim())) engagement += 5;
  if (person.linkedin_url) engagement += 5;

  // Corporate email (+10)
  let corporate_email = 0;
  if (person.email) {
    const domain = person.email.split('@')[1]?.toLowerCase() || '';
    if (domain && !FREE_EMAIL_PROVIDERS.includes(domain)) corporate_email = 10;
  }

  const total = industry_fit + company_size + authority + ai_signal +
    intent_signal + tech_stack + engagement + corporate_email;

  return {
    industry_fit, company_size, authority, ai_signal,
    intent_signal, tech_stack, engagement, corporate_email,
    total: Math.min(total, 150),
  };
}

// ── Deal Probability Score (0-100) ──────────────────────────────────────

export function calculateDealProbability(
  person: ApolloPersonResult,
): DealProbabilityBreakdown {
  const org = person.organization;
  const employees = org?.estimated_num_employees || 0;
  const industry = (org?.industry || '').toLowerCase();
  const techStack = (org?.technology_names || []).map((t) => t.toLowerCase());

  // Authority (+25)
  let authority = 0;
  if (C_SUITE_PATTERN.test(person.title || '')) authority = 25;
  else if (VP_PATTERN.test(person.title || '')) authority = 20;
  else if (DIRECTOR_PATTERN.test(person.title || '')) authority = 15;

  // Company power (+20)
  let company_power = 0;
  if (employees >= 2000) company_power = 20;
  else if (employees >= 500) company_power = 15;
  else if (employees >= 200) company_power = 10;

  // AI maturity (+20) — AI leadership/strategy/governance roles
  const ai_maturity = AI_LEADERSHIP_PATTERNS.test(person.title || '') ? 20 : 0;

  // Intent strength (+20) — AI tools in tech stack
  const hasAiIntent = techStack.some((t) =>
    AI_INTENT_TOOLS.some((tool) => t.includes(tool))
  );
  const intent_strength = hasAiIntent ? 20 : 0;

  // Technology alignment (+10)
  const hasTechAlign = techStack.some((t) =>
    TECH_ALIGNMENT_TOOLS.some((tool) => t.includes(tool))
  );
  const technology_alignment = hasTechAlign ? 10 : 0;

  // Industry conversion (+10)
  const industry_conversion = HIGH_CONVERSION_INDUSTRIES.some((i) => industry.includes(i)) ? 10 : 0;

  const total = authority + company_power + ai_maturity +
    intent_strength + technology_alignment + industry_conversion;

  let tier: 'A' | 'B' | 'C' | 'D';
  if (total >= 80) tier = 'A';
  else if (total >= 60) tier = 'B';
  else if (total >= 40) tier = 'C';
  else tier = 'D';

  return {
    authority, company_power, ai_maturity,
    intent_strength, technology_alignment, industry_conversion,
    total: Math.min(total, 100),
    tier,
  };
}

// ── Combined Scoring ────────────────────────────────────────────────────

export function scoreLeadForColdCampaign(
  person: ApolloPersonResult,
  icpIndustries?: string[],
): CombinedLeadScore {
  const intelligence = calculateIntelligenceScore(person, icpIndustries);
  const deal_probability = calculateDealProbability(person);
  const combined_rank = (intelligence.total * 0.6) + (deal_probability.total * 0.4);

  return { person, intelligence, deal_probability, combined_rank };
}

// ── Intelligence Summary ────────────────────────────────────────────────

export function buildIntelligenceSummary(
  scores: CombinedLeadScore[],
  importedCount: number,
): IntelligenceSummary {
  if (scores.length === 0) {
    return {
      total_scored: 0, total_imported: 0,
      avg_intelligence_score: 0, avg_deal_probability: 0,
      tier_distribution: [], top_industries: [],
      authority_distribution: [], ai_signal_count: 0, ai_signal_pct: 0,
    };
  }

  const totalScored = scores.length;

  // Averages
  const avgIntel = Math.round(
    scores.reduce((sum, s) => sum + s.intelligence.total, 0) / totalScored
  );
  const avgDeal = Math.round(
    scores.reduce((sum, s) => sum + s.deal_probability.total, 0) / totalScored
  );

  // Tier distribution
  const tierCounts: Record<string, number> = { A: 0, B: 0, C: 0, D: 0 };
  for (const s of scores) tierCounts[s.deal_probability.tier]++;
  const tier_distribution = ['A', 'B', 'C', 'D'].map((tier) => ({
    tier,
    count: tierCounts[tier],
    pct: Math.round((tierCounts[tier] / totalScored) * 100),
  }));

  // Top industries
  const industryCounts: Record<string, number> = {};
  for (const s of scores) {
    const ind = s.person.organization?.industry || 'Unknown';
    industryCounts[ind] = (industryCounts[ind] || 0) + 1;
  }
  const top_industries = Object.entries(industryCounts)
    .sort((a, b) => b[1] - a[1])
    .slice(0, 8)
    .map(([name, count]) => ({ name, count }));

  // Authority distribution
  const authLevels: Record<string, number> = { 'C-Suite': 0, 'VP': 0, 'Director': 0, 'Other': 0 };
  for (const s of scores) {
    const title = s.person.title || '';
    if (C_SUITE_PATTERN.test(title)) authLevels['C-Suite']++;
    else if (VP_PATTERN.test(title)) authLevels['VP']++;
    else if (DIRECTOR_PATTERN.test(title)) authLevels['Director']++;
    else authLevels['Other']++;
  }
  const authority_distribution = Object.entries(authLevels)
    .filter(([, count]) => count > 0)
    .map(([level, count]) => ({ level, count }));

  // AI signal density
  const ai_signal_count = scores.filter((s) => s.intelligence.ai_signal > 0).length;

  return {
    total_scored: totalScored,
    total_imported: importedCount,
    avg_intelligence_score: avgIntel,
    avg_deal_probability: avgDeal,
    tier_distribution,
    top_industries,
    authority_distribution,
    ai_signal_count,
    ai_signal_pct: Math.round((ai_signal_count / totalScored) * 100),
  };
}
