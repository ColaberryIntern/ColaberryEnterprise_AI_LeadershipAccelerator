/**
 * schoolSignals — the read layer of the AI Operations Center. Aggregates the
 * whole school by CONSUMING the frozen upstream systems (progression, runtime
 * readiness, timeline, composer) read-only. Produces one SchoolSignals object
 * the health score + AI Directors + briefing all analyze. Nothing here writes.
 */
import { Op } from 'sequelize';
import Enrollment from '../../models/Enrollment';
import StudentLevel from '../../models/StudentLevel';
import CurriculumBlueprint from '../../models/CurriculumBlueprint';
import { studentSignals } from '../runtime/runtimeService';
import { computeEmploymentReadiness } from '../runtime/employmentReadiness';
import { computeCertificationReadiness } from '../runtime/certificationReadiness';

export interface StudentRollup {
  id: string; name: string; cohort_id: string | null;
  employment: number; band: string; cert_pass: number; architect_readiness: number;
  builder_xp: number; portfolio: number; github_commits: number;
  attendance: number; at_risk: boolean; excelling: boolean;
}
export interface SchoolSignals {
  generated_at: string;
  students: { active: number; at_risk: number; excelling: number; architect_ready: number; employment_ready: number; certification_ready: number };
  revenue: { collected: number; paid: number; unpaid: number; collection_rate: number };
  learning: { avg_builder_xp: number; avg_attendance: number };
  employment: { avg_readiness: number; market_ready: number };
  certification: { avg_pass_prob: number; exam_ready: number };
  curriculum: { blueprints: number; avg_quality: number };
  portfolio: { total_artifacts: number };
  cohorts: Array<{ cohort_id: string | null; students: number; avg_employment: number }>;
  roster: StudentRollup[];
}

const avg = (xs: number[]) => (xs.length ? xs.reduce((a, b) => a + b, 0) / xs.length : 0);
const r1 = (n: number) => Math.round(n * 10) / 10;

/** Gather the school-wide signal vector. Capped roster for a responsive home;
 *  large schools should move this to a nightly snapshot (see PHASE_4.md). */
export async function gatherSignals(cap = 200): Promise<SchoolSignals> {
  const enrollments = await Enrollment.findAll({ where: { status: 'active' }, limit: cap });
  const levels = await StudentLevel.findAll();
  const levelByEnrollment = new Map(levels.map((l) => [l.enrollment_id, l.architect_readiness]));

  const roster: StudentRollup[] = [];
  for (const e of enrollments) {
    const sig = await studentSignals(e.id);
    const emp = computeEmploymentReadiness(sig);
    const cert = computeCertificationReadiness(sig);
    const architect = levelByEnrollment.get(e.id) ?? 0;
    const attendance = (e as any).attendance_score ?? 0;
    const at_risk = emp.overall < 30 || (attendance > 0 && attendance < 60);
    const excelling = emp.overall >= 70 || architect >= 0.7;
    roster.push({
      id: e.id, name: (e as any).full_name || (e as any).email || 'Student', cohort_id: e.cohort_id ?? null,
      employment: emp.overall, band: emp.band, cert_pass: cert.pass_probability, architect_readiness: architect,
      builder_xp: sig.xp.builder, portfolio: sig.portfolio.entries, github_commits: sig.github.commits,
      attendance, at_risk, excelling,
    });
  }

  const paidRows = await Enrollment.findAll({ where: { status: 'active', payment_status: { [Op.in]: ['paid', 'completed', 'active'] } } });
  const allActive = await Enrollment.count({ where: { status: 'active' } });
  const collected = enrollments.reduce((a, e) => a + (Number((e as any).amount_paid) || 0), 0);
  const paid = paidRows.length;

  const blueprints = await CurriculumBlueprint.findAll({ attributes: ['quality_score'] });

  const cohortMap = new Map<string | null, number[]>();
  roster.forEach((s) => { const arr = cohortMap.get(s.cohort_id) || []; arr.push(s.employment); cohortMap.set(s.cohort_id, arr); });

  return {
    generated_at: new Date().toISOString(),
    students: {
      active: allActive,
      at_risk: roster.filter((s) => s.at_risk).length,
      excelling: roster.filter((s) => s.excelling).length,
      architect_ready: roster.filter((s) => s.architect_readiness >= 0.7).length,
      employment_ready: roster.filter((s) => s.band === 'market-ready' || s.band === 'competitive').length,
      certification_ready: roster.filter((s) => s.cert_pass >= 0.6).length,
    },
    revenue: { collected: Math.round(collected), paid, unpaid: Math.max(0, allActive - paid), collection_rate: allActive ? r1((paid / allActive) * 100) : 0 },
    learning: { avg_builder_xp: Math.round(avg(roster.map((s) => s.builder_xp))), avg_attendance: r1(avg(roster.map((s) => s.attendance))) },
    employment: { avg_readiness: r1(avg(roster.map((s) => s.employment))), market_ready: roster.filter((s) => s.band === 'market-ready').length },
    certification: { avg_pass_prob: r1(avg(roster.map((s) => s.cert_pass)) * 100), exam_ready: roster.filter((s) => s.cert_pass >= 0.6).length },
    curriculum: { blueprints: blueprints.length, avg_quality: r1(avg(blueprints.map((b) => b.quality_score || 0))) },
    portfolio: { total_artifacts: roster.reduce((a, s) => a + s.portfolio, 0) },
    cohorts: Array.from(cohortMap.entries()).map(([cohort_id, emps]) => ({ cohort_id, students: emps.length, avg_employment: r1(avg(emps)) })),
    roster,
  };
}
