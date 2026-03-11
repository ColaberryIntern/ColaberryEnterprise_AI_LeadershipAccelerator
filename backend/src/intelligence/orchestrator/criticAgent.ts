// ─── Critic Agent ─────────────────────────────────────────────────────────
// Validates specialist agent outputs before they reach the user or trigger
// autonomous execution. All checks are deterministic — no LLM calls.

import type { ExecutionPlan } from './plannerAgent';

// ─── Types ───────────────────────────────────────────────────────────────

export interface CriticIssue {
  agent: string;
  severity: 'info' | 'warning' | 'critical';
  message: string;
}

export interface CriticResult {
  approved: boolean;
  confidence: number; // 0-100
  issues: CriticIssue[];
  suggestions: string[];
}

// ─── Dangerous SQL Patterns ──────────────────────────────────────────────

const DANGEROUS_SQL = /\b(DROP|DELETE|TRUNCATE|ALTER|UPDATE|INSERT)\b/i;
const EXCESSIVE_ROW_LIMIT = 50000;

// ─── Validator ───────────────────────────────────────────────────────────

/**
 * Validate results from specialist agents against quality and safety rules.
 */
export async function validateResults(
  plan: ExecutionPlan,
  results: Map<string, any>,
  question: string,
): Promise<CriticResult> {
  const issues: CriticIssue[] = [];
  const suggestions: string[] = [];
  let totalConfidence = 100;

  // ── SQL Safety ──────────────────────────────────────────────────────
  const sqlResult = results.get('SQLAgent');
  if (sqlResult) {
    // Check for dangerous SQL in executed queries
    const queries: string[] = Array.isArray(sqlResult.queries) ? sqlResult.queries : [];
    for (const q of queries) {
      if (DANGEROUS_SQL.test(q)) {
        issues.push({
          agent: 'SQLAgent',
          severity: 'critical',
          message: `Dangerous SQL detected: ${q.slice(0, 100)}`,
        });
        totalConfidence -= 40;
      }
    }

    // Check for excessive result sizes
    const rows = Array.isArray(sqlResult.data) ? sqlResult.data : [];
    if (rows.length > EXCESSIVE_ROW_LIMIT) {
      issues.push({
        agent: 'SQLAgent',
        severity: 'warning',
        message: `Query returned ${rows.length} rows — consider narrowing scope`,
      });
      totalConfidence -= 10;
    }

    // Check for empty results
    if (rows.length === 0 && sqlResult.status === 'success') {
      issues.push({
        agent: 'SQLAgent',
        severity: 'info',
        message: 'SQL query returned no results — answer may be limited',
      });
      totalConfidence -= 5;
      suggestions.push('Try broadening the query scope or checking entity filters');
    }
  }

  // ── Data Quality ────────────────────────────────────────────────────
  const insightResult = results.get('InsightAgent');
  if (insightResult) {
    const insights = Array.isArray(insightResult.insights) ? insightResult.insights : [];
    if (insights.length === 0) {
      issues.push({
        agent: 'InsightAgent',
        severity: 'warning',
        message: 'No insights extracted from data — response may lack analysis depth',
      });
      totalConfidence -= 15;
    }
  }

  // ── ML Confidence ───────────────────────────────────────────────────
  const mlResult = results.get('MLAgent');
  if (mlResult && mlResult.status === 'success') {
    const predictions = Array.isArray(mlResult.data) ? mlResult.data : [];
    const lowConfidence = predictions.filter(
      (p: any) => typeof p.confidence === 'number' && p.confidence < 0.5,
    );
    if (lowConfidence.length > 0) {
      issues.push({
        agent: 'MLAgent',
        severity: 'warning',
        message: `${lowConfidence.length} ML prediction(s) below 50% confidence`,
      });
      totalConfidence -= 10;
    }
  }

  // ── Vector Search Quality ───────────────────────────────────────────
  const vectorResult = results.get('VectorSearchAgent');
  if (vectorResult && vectorResult.status === 'success') {
    const results_arr = Array.isArray(vectorResult.data) ? vectorResult.data : [];
    if (results_arr.length === 0) {
      issues.push({
        agent: 'VectorSearchAgent',
        severity: 'info',
        message: 'No semantic matches found in vector store',
      });
      totalConfidence -= 5;
    }
  }

  // ── Cross-check: question relevance ─────────────────────────────────
  // If the plan has multiple data agents but all returned empty, the question
  // may be outside the data scope.
  const dataAgents = ['SQLAgent', 'MLAgent', 'VectorSearchAgent'];
  const dataResults = dataAgents
    .map((a) => results.get(a))
    .filter((r) => r != null);
  const allEmpty = dataResults.length > 0 && dataResults.every(
    (r) => (Array.isArray(r.data) ? r.data.length === 0 : !r.data),
  );
  if (allEmpty) {
    issues.push({
      agent: 'CriticAgent',
      severity: 'warning',
      message: 'All data sources returned empty — question may be outside available data scope',
    });
    totalConfidence -= 20;
    suggestions.push('Verify the entity type and ensure relevant data exists in the system');
  }

  // Clamp confidence
  const confidence = Math.max(0, Math.min(100, totalConfidence));

  // Reject if confidence drops below 40
  const hasCritical = issues.some((i) => i.severity === 'critical');
  const approved = confidence >= 40 && !hasCritical;

  return { approved, confidence, issues, suggestions };
}
