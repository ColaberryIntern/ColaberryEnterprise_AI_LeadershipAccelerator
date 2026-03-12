// ─── Department Seed ────────────────────────────────────────────────────────
// Seeds 11 departments for the AI organization. Idempotent — uses findOrCreate by slug.

import Department from '../models/Department';

const DEPARTMENTS = [
  { slug: 'executive', name: 'Executive Office', color: '#1a365d', bg_light: '#ebf4ff', mission: 'Strategic oversight, CEO operations, and organizational health monitoring.' },
  { slug: 'strategy', name: 'Strategy & Analytics', color: '#2b6cb0', bg_light: '#bee3f8', mission: 'Data-driven planning, forecasting, and strategic initiative management.' },
  { slug: 'marketing', name: 'Marketing & Growth', color: '#805ad5', bg_light: '#e9d8fd', mission: 'Lead generation, brand awareness, content marketing, and campaign optimization.' },
  { slug: 'admissions', name: 'Admissions & Enrollment', color: '#38a169', bg_light: '#c6f6d5', mission: 'Student recruitment, qualification, enrollment pipeline, and admissions intelligence.' },
  { slug: 'alumni', name: 'Alumni Relations', color: '#d69e2e', bg_light: '#fefcbf', mission: 'Post-graduation engagement, community building, referrals, and career support.' },
  { slug: 'partnerships', name: 'Partnerships & Business Dev', color: '#dd6b20', bg_light: '#feebc8', mission: 'Corporate training partnerships, employer relationships, and institutional alliances.' },
  { slug: 'education', name: 'Education & Curriculum', color: '#3182ce', bg_light: '#bee3f8', mission: 'Program design, curriculum architecture, content generation, and academic quality.' },
  { slug: 'student_success', name: 'Student Success', color: '#319795', bg_light: '#b2f5ea', mission: 'Retention, mentoring, learning outcomes, and student experience optimization.' },
  { slug: 'platform', name: 'Platform & Infrastructure', color: '#718096', bg_light: '#e2e8f0', mission: 'System reliability, performance monitoring, UX optimization, and deployment.' },
  { slug: 'intelligence', name: 'Intelligence & AI Ops', color: '#e53e3e', bg_light: '#fed7d7', mission: 'Agent fleet operations, data intelligence, trend detection, and autonomous operations.' },
  { slug: 'governance', name: 'Governance & Compliance', color: '#1a365d', bg_light: '#ebf4ff', mission: 'Safety, audit, policy enforcement, risk management, and approval workflows.' },
  { slug: 'finance', name: 'Finance', color: '#d69e2e', bg_light: '#fefcbf', mission: 'Financial planning, cost optimization, revenue forecasting, and scholarship allocation.' },
  { slug: 'operations', name: 'Operations', color: '#718096', bg_light: '#e2e8f0', mission: 'Workflow optimization, quality assurance, task assignment, and process improvement.' },
  { slug: 'orchestration', name: 'Orchestration', color: '#3182ce', bg_light: '#bee3f8', mission: 'Agent fleet coordination, system performance, decision simulation, and hiring.' },
  { slug: 'growth', name: 'Growth', color: '#805ad5', bg_light: '#e9d8fd', mission: 'Growth experiments, opportunity scanning, partnership development, and expansion.' },
  { slug: 'infrastructure', name: 'Infrastructure', color: '#718096', bg_light: '#e2e8f0', mission: 'AI model performance, security monitoring, system health, and reliability.' },
  { slug: 'security', name: 'Security Operations', color: '#c53030', bg_light: '#fff5f5', mission: 'Threat detection, vulnerability management, secret scanning, runtime protection, and AI safety monitoring.' },
];

export async function seedDepartments(): Promise<void> {
  for (const dept of DEPARTMENTS) {
    const [record, created] = await Department.findOrCreate({
      where: { slug: dept.slug },
      defaults: {
        name: dept.name,
        slug: dept.slug,
        mission: dept.mission,
        color: dept.color,
        bg_light: dept.bg_light,
        team_size: 0,
        health_score: 100,
        innovation_score: 50,
        strategic_objectives: [],
        kpis: [],
        metadata: {},
      },
    });

    if (!created) {
      await record.update({
        name: dept.name,
        mission: dept.mission,
        color: dept.color,
        bg_light: dept.bg_light,
      });
    }
  }

  console.log(`[DepartmentSeed] Seeded ${DEPARTMENTS.length} departments`);
}
