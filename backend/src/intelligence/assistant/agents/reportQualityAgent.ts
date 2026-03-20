// ─── Report Quality Agent ───────────────────────────────────────────────────
// Final quality gate that validates narrative content, filters technical terms,
// ensures minimum insight count, and scores overall report quality.
// No LLM calls — pure functions, <2ms latency.

import { AssistantResponse, NarrativeSections } from '../queryEngine';
import { SqlResult } from '../sqlExecutor';
import { getBusinessLabel } from './dataAnalystAgent';

// ─── Technical Term Filters ─────────────────────────────────────────────────

const TECHNICAL_REPLACEMENTS: [RegExp, string][] = [
  // Raw metric/column references
  [/\bmetric\s*\d+\b/gi, ''],
  [/\bcolumn\s+\w+\b/gi, ''],
  [/\bfield\s+\w+\b/gi, ''],

  // Database/framework terms
  [/\bsql\s+query\b/gi, 'analysis'],
  [/\bsql\b/gi, ''],
  [/\bsequelize\b/gi, ''],
  [/\bpostgres(ql)?\b/gi, ''],
  [/\bdatabase\b/gi, 'system'],
  [/\btable\s+\w+\b/gi, ''],
  [/\bschema\b/gi, ''],

  // Programming terms
  [/\bnull\b/gi, 'no data'],
  [/\bundefined\b/gi, 'no data'],
  [/\bNaN\b/g, 'no data'],
  [/\bbigint\b/gi, ''],
  [/\binteger\b/gi, ''],
  [/\bvarchar\b/gi, ''],
  [/\bboolean\b/gi, ''],
  [/\btimestamp(tz)?\b/gi, ''],

  // Agent technical names (keep business framing)
  [/\bagent_?name\b/gi, 'automation process'],
  [/\berror_count\b/gi, 'errors'],
  [/\brun_count\b/gi, 'executions'],
  [/\bexecution_?result\b/gi, 'outcome'],
  [/\btrace_?id\b/gi, ''],
  [/\bstack_?trace\b/gi, ''],

  // Clean up artifacts
  [/\s{2,}/g, ' '],              // Multiple spaces → single
  [/,\s*,/g, ','],               // Double commas
  [/\.\s*\./g, '.'],             // Double periods
  [/^\s*[,;]\s*/gm, ''],         // Leading punctuation
];

// ─── Public API ─────────────────────────────────────────────────────────────

export function validateReport(
  response: AssistantResponse,
  sqlResults?: SqlResult[]
): AssistantResponse {
  try {
    const validated = { ...response };

    // Filter technical terms from narrative
    validated.narrative = filterTechnicalTerms(validated.narrative);

    // Filter technical terms from narrative sections
    if (validated.narrative_sections) {
      validated.narrative_sections = filterSections(validated.narrative_sections);
    }

    // Ensure minimum insights
    if (sqlResults) {
      validated.insights = ensureMinimumInsights(validated.insights, sqlResults);
    }

    // Validate recommendations
    validated.recommendations = validateRecommendations(validated.recommendations);

    // Filter technical terms from insight messages
    validated.insights = validated.insights.map((i) => ({
      ...i,
      message: filterTechnicalTerms(i.message),
    }));

    return validated;
  } catch {
    // Fail-safe: return unmodified response
    return response;
  }
}

/**
 * Score the report quality (0-100). Useful for monitoring.
 */
export function qualityScore(response: AssistantResponse): number {
  let score = 0;

  // Has narrative (20pts)
  if (response.narrative && response.narrative.length > 20) score += 20;

  // Has >= 2 charts with data (20pts)
  const chartsWithData = response.visualizations.filter(
    (v) => v.data && v.data.length > 0
  );
  if (chartsWithData.length >= 2) score += 20;
  else if (chartsWithData.length === 1) score += 10;

  // Has >= 3 insights (20pts)
  if (response.insights.length >= 3) score += 20;
  else if (response.insights.length >= 1) score += 10;

  // No technical terms in narrative (20pts)
  if (!hasTechnicalTerms(response.narrative)) score += 20;

  // Has >= 2 recommendations (20pts)
  if (response.recommendations.length >= 2) score += 20;
  else if (response.recommendations.length >= 1) score += 10;

  return score;
}

// ─── Internal Functions ─────────────────────────────────────────────────────

/**
 * Filter technical terms from text, replacing with business-friendly alternatives.
 */
function filterTechnicalTerms(text: string): string {
  if (!text) return text;
  let cleaned = text;
  for (const [pattern, replacement] of TECHNICAL_REPLACEMENTS) {
    cleaned = cleaned.replace(pattern, replacement);
  }
  return cleaned.trim();
}

/**
 * Filter technical terms from all narrative sections.
 */
function filterSections(sections: NarrativeSections): NarrativeSections {
  return {
    executive_summary: filterTechnicalTerms(sections.executive_summary),
    key_findings: sections.key_findings.map(filterTechnicalTerms).filter(Boolean),
    risk_assessment: filterTechnicalTerms(sections.risk_assessment),
    recommended_actions: sections.recommended_actions.map(filterTechnicalTerms).filter(Boolean),
    follow_up_areas: sections.follow_up_areas.map(filterTechnicalTerms).filter(Boolean),
  };
}

/**
 * Ensure at least 3 insights exist. Generate from SQL if needed.
 */
function ensureMinimumInsights(
  insights: Array<{ type: string; severity: string; message: string; metric?: string; value?: number }>,
  sqlResults: SqlResult[]
): Array<{ type: string; severity: string; message: string; metric?: string; value?: number }> {
  if (insights.length >= 3) return insights;

  const result = [...insights];

  for (const sr of sqlResults) {
    if (result.length >= 5) break;

    if (sr.rows.length === 1) {
      // Single-row aggregate → KPI insight
      const row = sr.rows[0];
      for (const [key, val] of Object.entries(row)) {
        if (key.endsWith('_at') || key.endsWith('_id')) continue;
        const num = Number(val);
        if (!isNaN(num) && num > 0 && isFinite(num)) {
          const label = getBusinessLabel(key);
          const exists = result.some((i) => i.metric === key || i.message.includes(label));
          if (!exists) {
            result.push({
              type: 'metric',
              severity: 'info' as const,
              message: `${label}: ${num.toLocaleString()}`,
              metric: label,
              value: num,
            });
          }
        }
        if (result.length >= 5) break;
      }
    } else if (sr.rows.length >= 2) {
      // Multi-row → highlight max value
      const keys = Object.keys(sr.rows[0]);
      const numKey = keys.find((k) => typeof sr.rows[0][k] === 'number' && sr.rows[0][k] > 0);
      const strKey = keys.find((k) => typeof sr.rows[0][k] === 'string');
      if (numKey && strKey) {
        const sorted = [...sr.rows].sort((a, b) => (Number(b[numKey]) || 0) - (Number(a[numKey]) || 0));
        const top = sorted[0];
        const label = getBusinessLabel(numKey);
        const exists = result.some((i) => i.message.includes(String(top[strKey])));
        if (!exists) {
          result.push({
            type: 'highlight',
            severity: 'info' as const,
            message: `Top ${getBusinessLabel(strKey)}: ${top[strKey]} with ${Number(top[numKey]).toLocaleString()} ${label}`,
          });
        }
      }
    }
  }

  return result;
}

/**
 * Validate recommendations are business-relevant, not technical.
 */
function validateRecommendations(recommendations: string[]): string[] {
  if (recommendations.length === 0) {
    return [
      'Review current pipeline metrics and identify conversion bottlenecks',
      'Analyze campaign performance to optimize outreach strategy',
    ];
  }

  return recommendations
    .map(filterTechnicalTerms)
    .filter((r) => r.length > 10); // Remove empty/too-short after filtering
}

/**
 * Check if text contains obvious technical terms.
 */
function hasTechnicalTerms(text: string): boolean {
  if (!text) return false;
  const technicalPatterns = [
    /\bmetric\s*\d+\b/i,
    /\bsql\b/i,
    /\bsequelize\b/i,
    /\bpostgres\b/i,
    /\bnull\b/i,
    /\bundefined\b/i,
    /\bNaN\b/,
    /\btrace_?id\b/i,
    /\bstack_?trace\b/i,
  ];
  return technicalPatterns.some((p) => p.test(text));
}
