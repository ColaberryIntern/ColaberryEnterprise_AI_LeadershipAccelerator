// SAFETY: This module only reads/writes localStorage. No DOM mutations.

import type { OrchestratedReport } from '../agents/agentOrchestrator';
import { HEALTH_WEIGHTS } from '../config/marketingBlueprint';

const STORAGE_KEY = 'cb_mktg_intel_reports';
const MAX_STORAGE_BYTES = 500_000;
const MAX_AGE_DAYS = 7;

export interface AuditSummary {
  totalPagesScanned: number;
  overallScore: number;
  perPage: Array<{ route: string; score: number; lastScanned: string }>;
  perCategory: Record<string, number>;
  topSuggestions: Array<{ ruleId: string; route: string; details: string; severity: string }>;
  trend: 'improving' | 'declining' | 'stable';
}

function loadReports(): OrchestratedReport[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : [];
  } catch {
    return [];
  }
}

function saveReports(reports: OrchestratedReport[]): void {
  const json = JSON.stringify(reports);
  if (json.length > MAX_STORAGE_BYTES) {
    // Keep only the most recent reports per route
    const byRoute = new Map<string, OrchestratedReport>();
    for (const r of reports.sort((a, b) => b.timestamp.localeCompare(a.timestamp))) {
      if (!byRoute.has(r.route)) byRoute.set(r.route, r);
    }
    localStorage.setItem(STORAGE_KEY, JSON.stringify([...byRoute.values()]));
  } else {
    localStorage.setItem(STORAGE_KEY, json);
  }
}

export function storeReport(report: OrchestratedReport): void {
  const reports = loadReports();
  reports.push(report);
  pruneOldReports(reports);
  saveReports(reports);
}

export function getReports(filter?: { route?: string; since?: string }): OrchestratedReport[] {
  let reports = loadReports();
  if (filter?.route) {
    reports = reports.filter(r => r.route === filter.route);
  }
  if (filter?.since) {
    const since = filter.since;
    reports = reports.filter(r => r.timestamp >= since);
  }
  return reports.sort((a, b) => b.timestamp.localeCompare(a.timestamp));
}

export function getLatestPerRoute(): Map<string, OrchestratedReport> {
  const reports = loadReports().sort((a, b) => b.timestamp.localeCompare(a.timestamp));
  const latest = new Map<string, OrchestratedReport>();
  for (const r of reports) {
    if (!latest.has(r.route)) latest.set(r.route, r);
  }
  return latest;
}

export function getHealthScore(): number {
  const latest = getLatestPerRoute();
  if (latest.size === 0) return 0;

  // Group results by health category
  const categoryScores: Record<string, number[]> = {};
  for (const [, report] of latest) {
    for (const agent of report.agents) {
      for (const result of agent.results) {
        const cat = mapRuleToHealthCategory(result.ruleId);
        if (!categoryScores[cat]) categoryScores[cat] = [];
        categoryScores[cat].push(result.passed ? 100 : 0);
      }
    }
  }

  let totalWeight = 0;
  let weightedScore = 0;
  for (const [cat, weight] of Object.entries(HEALTH_WEIGHTS)) {
    const scores = categoryScores[cat];
    if (scores && scores.length > 0) {
      const avg = scores.reduce((a, b) => a + b, 0) / scores.length;
      weightedScore += avg * weight;
      totalWeight += weight;
    }
  }

  return totalWeight > 0 ? Math.round(weightedScore / totalWeight) : 0;
}

function mapRuleToHealthCategory(ruleId: string): string {
  const prefix = ruleId.split('-')[0];
  const map: Record<string, string> = {
    pos: 'positioning',
    aud: 'positioning',
    cc: 'claude_code_visibility',
    art: 'artifact_emphasis',
    lm: 'lead_magnets',
    cta: 'cta_clarity',
    trk: 'tracking_coverage',
    scar: 'positioning',
    trust: 'positioning',
    auth: 'positioning',
    seo: 'seo',
    a11y: 'accessibility',
    ux: 'cta_clarity',
    conv: 'funnel_integrity',
  };
  return map[prefix] || 'positioning';
}

export function getAuditSummary(): AuditSummary {
  const latest = getLatestPerRoute();
  const allReports = getReports();

  const perPage = [...latest.entries()].map(([route, report]) => ({
    route,
    score: report.overallScore,
    lastScanned: report.timestamp,
  }));

  const categoryScores: Record<string, number[]> = {};
  const suggestions: AuditSummary['topSuggestions'] = [];

  for (const [route, report] of latest) {
    for (const agent of report.agents) {
      for (const result of agent.results) {
        const cat = mapRuleToHealthCategory(result.ruleId);
        if (!categoryScores[cat]) categoryScores[cat] = [];
        categoryScores[cat].push(result.passed ? 100 : 0);

        if (!result.passed && result.suggestion) {
          suggestions.push({
            ruleId: result.ruleId,
            route,
            details: result.suggestion,
            severity: result.severity,
          });
        }
      }
    }
  }

  const perCategory: Record<string, number> = {};
  for (const [cat, scores] of Object.entries(categoryScores)) {
    perCategory[cat] = Math.round(scores.reduce((a, b) => a + b, 0) / scores.length);
  }

  // Trend: compare latest scores vs previous
  let trend: 'improving' | 'declining' | 'stable' = 'stable';
  if (allReports.length >= 4) {
    const half = Math.floor(allReports.length / 2);
    const recentAvg = allReports.slice(0, half).reduce((s, r) => s + r.overallScore, 0) / half;
    const olderAvg = allReports.slice(half).reduce((s, r) => s + r.overallScore, 0) / (allReports.length - half);
    if (recentAvg > olderAvg + 5) trend = 'improving';
    else if (recentAvg < olderAvg - 5) trend = 'declining';
  }

  return {
    totalPagesScanned: latest.size,
    overallScore: getHealthScore(),
    perPage,
    perCategory,
    topSuggestions: suggestions
      .sort((a, b) => {
        const sevOrder = { critical: 0, warning: 1, info: 2 };
        return (sevOrder[a.severity as keyof typeof sevOrder] || 2) - (sevOrder[b.severity as keyof typeof sevOrder] || 2);
      })
      .slice(0, 10),
    trend,
  };
}

export function exportAuditMarkdown(): string {
  const summary = getAuditSummary();
  const lines: string[] = [
    '# Marketing Audit Report',
    `Generated: ${new Date().toISOString()}`,
    '',
    `## Marketing Health Score: ${summary.overallScore}/100`,
    `Trend: ${summary.trend}`,
    `Pages Scanned: ${summary.totalPagesScanned}`,
    '',
    '## Per-Page Scores',
    '',
    '| Route | Score | Last Scanned |',
    '|-------|-------|--------------|',
  ];

  for (const p of summary.perPage) {
    lines.push(`| ${p.route} | ${p.score}/100 | ${new Date(p.lastScanned).toLocaleString()} |`);
  }

  lines.push('', '## Category Scores', '');
  for (const [cat, score] of Object.entries(summary.perCategory)) {
    lines.push(`- **${cat.replace(/_/g, ' ')}**: ${score}/100`);
  }

  if (summary.topSuggestions.length > 0) {
    lines.push('', '## Top Suggestions', '');
    for (const s of summary.topSuggestions) {
      lines.push(`- [${s.severity.toUpperCase()}] ${s.route}: ${s.details} (${s.ruleId})`);
    }
  }

  return lines.join('\n');
}

function pruneOldReports(reports: OrchestratedReport[]): void {
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - MAX_AGE_DAYS);
  const cutoffStr = cutoff.toISOString();

  let i = reports.length;
  while (i--) {
    if (reports[i].timestamp < cutoffStr) {
      reports.splice(i, 1);
    }
  }
}

export function clearReports(): void {
  localStorage.removeItem(STORAGE_KEY);
}
