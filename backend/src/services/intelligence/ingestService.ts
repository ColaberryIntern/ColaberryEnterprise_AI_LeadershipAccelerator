/**
 * ingestService — projects every module into the Enterprise Memory Graph so the
 * platform is one connected system: Orchestration (Composer blueprints) →
 * Experience Studio (approved components) → Timeline (cards) → Students →
 * Portfolio → the AI Organization (employees, meetings, recommendations). Every
 * entity becomes a node; every connection becomes a first-class edge. Idempotent
 * (upsert), read-only against the source systems.
 */
import { Op } from 'sequelize';
import Enrollment from '../../models/Enrollment';
import Cohort from '../../models/Cohort';
import CurriculumBlueprint from '../../models/CurriculumBlueprint';
import CurriculumTypeDefinition from '../../models/CurriculumTypeDefinition';
import TimelineCard from '../../models/TimelineCard';
import PortfolioArtifact from '../../models/PortfolioArtifact';
import OpsRecommendation from '../../models/OpsRecommendation';
import WorkforceMeeting from '../../models/WorkforceMeeting';
import { AI_ORG } from '../workforce/orgRegistry';
import { upsertNode, relate, recordEvent } from './graphService';

export async function ingestGraph(): Promise<{ nodes: number; edges: number }> {
  let nodes = 0; let edges = 0;
  const N = async (...a: Parameters<typeof upsertNode>) => { const n = await upsertNode(...a); nodes += 1; return n; };
  const R = async (...a: Parameters<typeof relate>) => { const e = await relate(...a); if (e) edges += 1; return e; };

  // ── AI Organization (employees + hierarchy) ──
  const empNode = new Map<string, string>();
  for (const e of AI_ORG) {
    const n = await N('AIEmployee', e.slug, e.name, { role: e.role, department: e.department, mission: e.mission }, { owner: 'workforce', trust_score: 0.9 });
    empNode.set(e.slug, n.id);
  }
  for (const e of AI_ORG) if (e.supervisor && empNode.get(e.supervisor)) await R(empNode.get(e.slug)!, empNode.get(e.supervisor)!, 'REPORTS_TO', { confidence: 1 });

  // ── Experience Studio components (approved link to the Composer) ──
  const comps = await CurriculumTypeDefinition.findAll({ attributes: ['slug', 'label', 'approved', 'status', 'render_band'] });
  const compNode = new Map<string, string>();
  for (const c of comps) {
    const n = await N('Component', c.slug, c.label || c.slug, { approved: !!(c as any).approved, status: (c as any).status, render_band: (c as any).render_band }, { owner: 'experience_studio', trust_score: (c as any).approved ? 0.9 : 0.5 });
    compNode.set(c.slug, n.id);
  }

  // ── Curriculum Composer blueprints ──
  const blueprints = await CurriculumBlueprint.findAll();
  for (const b of blueprints) {
    const bn = await N('Curriculum', b.id, b.title, { week: b.week, quality: b.quality_score, status: b.status }, { owner: 'curriculum_composer', trust_score: Math.min(1, (b.quality_score || 50) / 100) });
    if (empNode.get('curriculum')) await R(bn.id, empNode.get('curriculum')!, 'GENERATED_BY', { confidence: 0.9 });
    // Curriculum USES the approved component types from its plan.
    const plan = b.generated_plan as any;
    if (plan?.cards) for (const t of new Set(plan.cards.map((c: any) => c.type))) if (compNode.get(t as string)) await R(bn.id, compNode.get(t as string)!, 'USES', { confidence: 0.85 });
  }

  // ── Cohorts + Students ──
  const cohorts = await Cohort.findAll().catch(() => [] as any[]);
  const cohortNode = new Map<string, string>();
  for (const c of cohorts) { const n = await N('Cohort', c.id, (c as any).name || 'Cohort', {}, { owner: 'admissions' }); cohortNode.set(c.id, n.id); }

  const students = await Enrollment.findAll({ where: { status: 'active' }, limit: 300 });
  const studentNode = new Map<string, string>();
  for (const s of students) {
    const n = await N('Student', s.id, (s as any).full_name || (s as any).email || 'Student', { cohort_id: s.cohort_id, payment: (s as any).payment_status }, { owner: 'student_success' });
    studentNode.set(s.id, n.id);
    if (s.cohort_id && cohortNode.get(s.cohort_id)) await R(n.id, cohortNode.get(s.cohort_id)!, 'BELONGS_TO', { confidence: 1 });
  }

  // ── Published Timeline cards (Composer → Timeline; Timeline USES component) ──
  const cards = await TimelineCard.findAll({ where: { cohort_id: null, visibility: 'published' } });
  for (const c of cards) {
    const cn = await N('TimelineCard', c.id, c.title, { type: c.type, week: c.week, bucket: c.bucket }, { owner: 'timeline' });
    if (compNode.get(c.type)) await R(cn.id, compNode.get(c.type)!, 'USES', { confidence: 0.9 });
  }

  // ── Portfolio artifacts (Runtime → Student portfolio) ──
  const artifacts = await PortfolioArtifact.findAll({ limit: 500 });
  for (const a of artifacts) {
    const an = await N('Artifact', a.id, a.title, { kind: a.kind }, { owner: 'learning_runtime', trust_score: 0.7 });
    if (a.card_id) await R(an.id, (await upsertNode('TimelineCard', a.card_id, a.title)).id, 'DERIVED_FROM', { confidence: 0.7 });
    const sn = studentNode.get(a.enrollment_id);
    if (sn) await R(an.id, sn, 'OWNED_BY', { confidence: 1 });
  }

  // ── Operations recommendations (Directors generate recommendations) ──
  const recs = await OpsRecommendation.findAll({ limit: 200 });
  for (const r of recs) {
    const rn = await N('Recommendation', r.rec_key, r.title, { severity: r.severity, status: r.status, confidence: r.confidence }, { owner: r.domain, trust_score: r.confidence });
    if (empNode.get(r.domain)) await R(rn.id, empNode.get(r.domain)!, 'GENERATED_BY', { confidence: r.confidence, evidence: r.evidence });
  }

  // ── Leadership meetings (Meeting discusses the org) ──
  const meetings = await WorkforceMeeting.findAll({ order: [['meeting_date', 'DESC']], limit: 30 });
  for (const m of meetings) {
    const mn = await N('Meeting', m.meeting_date, `Daily Leadership Meeting ${m.meeting_date}`, { participants: (m.participants || []).length, actions: (m.action_items || []).length }, { owner: 'chief_of_staff' });
    for (const p of (m.participants || []) as string[]) if (empNode.get(p)) await R(mn.id, empNode.get(p)!, 'DISCUSSES', { confidence: 0.8 });
  }

  await recordEvent(null, 'ingest', `Memory Graph refreshed: ${nodes} nodes, ${edges} edges across every module.`, 'intelligence_layer');
  return { nodes, edges };
}
