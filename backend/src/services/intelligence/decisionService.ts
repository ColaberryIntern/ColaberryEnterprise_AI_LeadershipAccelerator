/**
 * decisionService — the Decision Engine. Every recommendation can become a
 * Decision with a lifecycle (proposed → reviewed → approved/rejected →
 * implemented → measured) and full traceability: reason, evidence (graph
 * references), alternatives, expected vs actual outcome, lessons. Each decision
 * is also written into the graph + the organizational timeline, so nothing the
 * platform decides is ever forgotten.
 */
import Decision from '../../models/Decision';
import OpsRecommendation from '../../models/OpsRecommendation';
import { upsertNode, relate, recordEvent, findNode } from './graphService';

const LIFECYCLE = ['proposed', 'reviewed', 'approved', 'rejected', 'implemented', 'measured'];

export async function fromRecommendation(rec_key: string, decided_by = 'chief_of_staff') {
  const rec = await OpsRecommendation.findOne({ where: { rec_key } });
  if (!rec) throw Object.assign(new Error('Recommendation not found'), { status: 404 });
  const evidence = [{ type: 'recommendation', rec_key, why: rec.why, confidence: rec.confidence }, ...(Array.isArray(rec.evidence) ? rec.evidence.map((e: any) => ({ type: 'signal', detail: e })) : [])];
  const decision = await Decision.create({
    title: rec.title, domain: rec.domain, reason: rec.why, evidence,
    alternatives: ['Defer to next cohort', 'Escalate to CEO', 'No action'],
    expected_outcome: rec.impact, status: 'proposed', source_rec_key: rec_key, decided_by,
  });
  const dn = await upsertNode('Decision', decision.id, decision.title, { domain: decision.domain, status: 'proposed' }, { owner: decided_by, trust_score: rec.confidence });
  const recNode = await findNode('Recommendation', rec_key);
  if (recNode) await relate(dn.id, recNode.id, 'DERIVED_FROM', { confidence: rec.confidence, evidence });
  await recordEvent(dn.id, 'decision', `Decision proposed: "${decision.title}" (${decision.domain})`, decided_by, rec_key);
  return decision.toJSON();
}

export async function listDecisions(status?: string) {
  const where = status ? { status } : {};
  const rows = await Decision.findAll({ where: where as any, order: [['updated_at', 'DESC']], limit: 200 });
  return rows.map((r) => r.toJSON());
}

export async function updateDecision(id: string, patch: { status?: string; actual_outcome?: string; lessons?: string }) {
  const d = await Decision.findByPk(id);
  if (!d) throw Object.assign(new Error('Decision not found'), { status: 404 });
  const clean: any = {};
  if (patch.status && LIFECYCLE.includes(patch.status)) clean.status = patch.status;
  if ('actual_outcome' in patch) clean.actual_outcome = patch.actual_outcome ?? null;
  if ('lessons' in patch) clean.lessons = patch.lessons ?? null;
  await d.update(clean);
  if (clean.status) {
    const dn = await findNode('Decision', id);
    if (dn) await dn.update({ metadata: { ...(dn.metadata || {}), status: clean.status } });
    await recordEvent(dn?.id ?? null, 'decision', `Decision "${d.title}" → ${clean.status}`, d.decided_by || 'system', d.source_rec_key || undefined);
  }
  return d.toJSON();
}

/** A decision + the evidence trail that justifies it. */
export async function traceDecision(id: string) {
  const d = await Decision.findByPk(id);
  if (!d) throw Object.assign(new Error('Decision not found'), { status: 404 });
  return { decision: d.toJSON(), traceable: true, evidence: d.evidence, source_rec_key: d.source_rec_key };
}
