/**
 * opsService — the AI Operations Center orchestrator. Builds the one executive
 * home payload (briefing + health + directors + alerts + priorities + work
 * queue) from the read-only school signals, and persists Director
 * recommendations as trackable Work Queue items (upsert by key, status
 * preserved). Also the Work Queue mutations, a Digital-Twin passthrough, and a
 * lightweight global search over the roster.
 */
import { Op } from 'sequelize';
import OpsRecommendation from '../../models/OpsRecommendation';
import { gatherSignals, SchoolSignals, StudentRollup } from './schoolSignals';
import { computeSchoolHealth } from './schoolHealth';
import { runDirectors, rankRecommendations, Director } from './directors';
import { generateBriefing } from './executiveBriefing';

/** Upsert each live recommendation into the Work Queue, preserving status. */
async function persistRecommendations(directors: Director[]) {
  const recs = rankRecommendations(directors);
  for (const r of recs) {
    const [row, created] = await OpsRecommendation.findOrCreate({
      where: { rec_key: r.key },
      defaults: { rec_key: r.key, domain: r.domain, title: r.title, why: r.why, evidence: r.evidence, impact: r.impact, confidence: r.confidence, action_type: r.action_type, severity: r.severity, status: 'open' },
    });
    if (!created) await row.update({ domain: r.domain, title: r.title, why: r.why, evidence: r.evidence, impact: r.impact, confidence: r.confidence, action_type: r.action_type, severity: r.severity });
  }
  // Return open/assigned items (the actionable queue), newest-impact first.
  const open = await OpsRecommendation.findAll({ where: { status: { [Op.in]: ['open', 'approved', 'assigned'] } }, order: [['severity', 'ASC'], ['confidence', 'DESC']] });
  return open.map((o) => o.toJSON());
}

function alertsFrom(signals: SchoolSignals, directors: Director[]) {
  return rankRecommendations(directors).filter((r) => r.severity === 'high').map((r) => ({ domain: r.domain, title: r.title, why: r.why }));
}

/** The single executive home page payload — answers what happened / why / what
 *  needs attention / what AI recommends / what actions. */
export async function homePayload() {
  const signals = await gatherSignals();
  const health = computeSchoolHealth(signals);
  const directors = runDirectors(signals);
  const [briefing, work_queue] = await Promise.all([
    generateBriefing(signals, health, directors),
    persistRecommendations(directors),
  ]);
  return {
    generated_at: signals.generated_at,
    briefing,
    health,
    directors: directors.map((d) => ({ domain: d.domain, title: d.title, headline: d.headline, metrics: d.metrics, top: d.recommendations[0] || null })),
    alerts: alertsFrom(signals, directors),
    priorities: briefing.priorities,
    work_queue,
    students: { active: signals.students.active, at_risk: signals.students.at_risk, excelling: signals.students.excelling, roster: signals.roster.slice(0, 12) },
  };
}

export async function getHealth() {
  const signals = await gatherSignals();
  return { health: computeSchoolHealth(signals), signals: { students: signals.students, revenue: signals.revenue, employment: signals.employment, certification: signals.certification } };
}

export async function getDirectors() {
  const signals = await gatherSignals();
  return { directors: runDirectors(signals) };
}

export async function listWorkQueue(status?: string) {
  const where = status ? { status } : {};
  const rows = await OpsRecommendation.findAll({ where: where as any, order: [['updated_at', 'DESC']], limit: 200 });
  return rows.map((r) => r.toJSON());
}

export async function updateRecommendation(id: string, patch: { status?: string; assigned_to?: string | null }) {
  const row = await OpsRecommendation.findByPk(id);
  if (!row) throw Object.assign(new Error('Recommendation not found'), { status: 404 });
  const clean: any = {};
  if (patch.status && ['open', 'approved', 'rejected', 'assigned', 'done'].includes(patch.status)) clean.status = patch.status;
  if ('assigned_to' in patch) { clean.assigned_to = patch.assigned_to || null; if (patch.assigned_to) clean.status = 'assigned'; }
  await row.update(clean);
  return row.toJSON();
}

/** Lightweight global search over the live roster (v1). */
export async function search(q: string) {
  const query = (q || '').toLowerCase().trim();
  const signals = await gatherSignals();
  let results: StudentRollup[] = signals.roster;
  if (/architect|ready/.test(query)) results = results.filter((s) => s.architect_readiness >= 0.6 || s.band === 'market-ready');
  else if (/risk|strugg|drop/.test(query)) results = results.filter((s) => s.at_risk);
  else if (/github|commit/.test(query)) results = results.filter((s) => s.github_commits === 0);
  else if (/employ/.test(query)) results = [...results].sort((a, b) => b.employment - a.employment);
  else if (query) results = results.filter((s) => s.name.toLowerCase().includes(query));
  return { query, count: results.length, students: results.slice(0, 25) };
}
