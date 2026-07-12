/**
 * executiveBriefing — the CEO's "Good Morning" briefing. Synthesizes the school
 * signals + health + the Directors' top recommendations into a tight executive
 * narrative (yesterday, today's priorities, risks, wins). LLM-written with a
 * deterministic fallback so the briefing always renders.
 */
import { chatJson } from '../runtime/runtimeAi';
import { SchoolSignals } from './schoolSignals';
import { SchoolHealth } from './schoolHealth';
import { Director, rankRecommendations } from './directors';

export interface Briefing {
  good_morning: string; yesterday: string; priorities: string[]; risks: string[]; wins: string[]; cost_usd?: number;
}

export async function generateBriefing(signals: SchoolSignals, health: SchoolHealth, directors: Director[]): Promise<Briefing> {
  const top = rankRecommendations(directors).slice(0, 5).map((r) => r.title);
  const system = 'You are the Chief of Staff writing the CEO\'s morning briefing for an AI Systems Architect school. Be warm, sharp, and executive — no fluff. Return STRICT json.';
  const user =
    `School Health ${health.overall}/100 (${health.band}).\n` +
    `Signals: ${JSON.stringify({ students: signals.students, employment: signals.employment, certification: signals.certification, revenue: signals.revenue, curriculum: signals.curriculum })}\n` +
    `Top director recommendations: ${JSON.stringify(top)}\n` +
    `Return json { "good_morning": string (one warm line), "yesterday": string (1-2 sentences on what moved), ` +
    `"priorities": string[] (3-5, the day's must-dos), "risks": string[] (2-3), "wins": string[] (1-3) }.`;
  try {
    const r = await chatJson('ops_briefing', system, user, undefined, 900);
    if (r.parsed?.good_morning) {
      return {
        good_morning: String(r.parsed.good_morning), yesterday: String(r.parsed.yesterday || ''),
        priorities: arr(r.parsed.priorities, top), risks: arr(r.parsed.risks, []), wins: arr(r.parsed.wins, []), cost_usd: r.cost_usd,
      };
    }
  } catch { /* fall through */ }
  return deterministic(signals, health, directors);
}

function arr(v: any, fallback: string[]): string[] { return Array.isArray(v) && v.length ? v.map(String) : fallback; }

function deterministic(s: SchoolSignals, h: SchoolHealth, directors: Director[]): Briefing {
  const top = rankRecommendations(directors);
  const priorities = top.slice(0, 5).map((r) => r.title);
  const risks: string[] = [];
  if (s.students.at_risk > 0) risks.push(`${s.students.at_risk} students at risk of dropout`);
  if (s.revenue.unpaid > 0) risks.push(`${s.revenue.unpaid} unpaid tuitions`);
  if (s.employment.avg_readiness < 45) risks.push(`Employment readiness below the hiring bar (${s.employment.avg_readiness}/100)`);
  const wins: string[] = [];
  if (s.students.excelling > 0) wins.push(`${s.students.excelling} students excelling`);
  if (s.students.architect_ready > 0) wins.push(`${s.students.architect_ready} architect-ready`);
  if (s.portfolio.total_artifacts > 0) wins.push(`${s.portfolio.total_artifacts} portfolio artifacts produced`);
  return {
    good_morning: `Good morning. School health is ${h.overall}/100 — ${h.band}.`,
    yesterday: `${s.students.active} active students; ${s.employment.market_ready} market-ready; $${s.revenue.collected.toLocaleString()} collected.`,
    priorities: priorities.length ? priorities : ['No urgent actions — steady state. Review excelling students for stretch work.'],
    risks: risks.length ? risks : ['No critical risks flagged.'],
    wins: wins.length ? wins : ['Baseline established.'],
  };
}
