/**
 * Per-department strategy configuration for the Strategy Architect agents.
 * Each department has focus areas, KPI thresholds, and cross-department keywords
 * used to identify collaboration opportunities.
 */

export interface DeptStrategyConfig {
  slug: string;
  label: string;
  focus_areas: string[];
  kpi_thresholds: { health_min: number; innovation_min: number };
  cross_dept_keywords: string[];
  max_initiatives_per_cycle: number;
}

export const STRATEGY_CONFIGS: Record<string, DeptStrategyConfig> = {
  executive: {
    slug: 'executive',
    label: 'Executive Office',
    focus_areas: ['organizational_health', 'strategic_alignment', 'leadership_effectiveness', 'cross_dept_coordination'],
    kpi_thresholds: { health_min: 80, innovation_min: 60 },
    cross_dept_keywords: ['strategy', 'governance', 'executive', 'leadership', 'organization'],
    max_initiatives_per_cycle: 2,
  },
  governance: {
    slug: 'governance',
    label: 'Governance & Compliance',
    focus_areas: ['compliance', 'risk_management', 'audit', 'policy_enforcement', 'safety'],
    kpi_thresholds: { health_min: 85, innovation_min: 40 },
    cross_dept_keywords: ['compliance', 'risk', 'governance', 'policy', 'audit', 'safety'],
    max_initiatives_per_cycle: 2,
  },
  strategy: {
    slug: 'strategy',
    label: 'Strategy & Analytics',
    focus_areas: ['data_analytics', 'forecasting', 'strategic_planning', 'market_intelligence'],
    kpi_thresholds: { health_min: 75, innovation_min: 65 },
    cross_dept_keywords: ['analytics', 'strategy', 'planning', 'forecast', 'intelligence', 'data'],
    max_initiatives_per_cycle: 3,
  },
  finance: {
    slug: 'finance',
    label: 'Finance',
    focus_areas: ['cost_optimization', 'revenue_forecasting', 'scholarship_allocation', 'budget_management'],
    kpi_thresholds: { health_min: 80, innovation_min: 50 },
    cross_dept_keywords: ['finance', 'revenue', 'cost', 'budget', 'scholarship', 'pricing'],
    max_initiatives_per_cycle: 2,
  },
  operations: {
    slug: 'operations',
    label: 'Operations',
    focus_areas: ['workflow_optimization', 'quality_assurance', 'process_improvement', 'task_management'],
    kpi_thresholds: { health_min: 80, innovation_min: 50 },
    cross_dept_keywords: ['operations', 'workflow', 'process', 'quality', 'efficiency'],
    max_initiatives_per_cycle: 2,
  },
  orchestration: {
    slug: 'orchestration',
    label: 'Orchestration',
    focus_areas: ['agent_fleet_coordination', 'system_performance', 'decision_simulation', 'agent_hiring'],
    kpi_thresholds: { health_min: 85, innovation_min: 70 },
    cross_dept_keywords: ['orchestration', 'agent', 'fleet', 'coordination', 'automation'],
    max_initiatives_per_cycle: 2,
  },
  intelligence: {
    slug: 'intelligence',
    label: 'Intelligence & AI Ops',
    focus_areas: ['anomaly_detection', 'trend_analysis', 'insight_generation', 'autonomous_operations'],
    kpi_thresholds: { health_min: 75, innovation_min: 70 },
    cross_dept_keywords: ['intelligence', 'ai', 'detection', 'insight', 'trend', 'anomaly'],
    max_initiatives_per_cycle: 3,
  },
  partnerships: {
    slug: 'partnerships',
    label: 'Partnerships & Business Dev',
    focus_areas: ['corporate_training', 'employer_relationships', 'institutional_alliances', 'enterprise_sales'],
    kpi_thresholds: { health_min: 70, innovation_min: 60 },
    cross_dept_keywords: ['partnership', 'enterprise', 'corporate', 'employer', 'alliance'],
    max_initiatives_per_cycle: 2,
  },
  growth: {
    slug: 'growth',
    label: 'Growth',
    focus_areas: ['growth_experiments', 'opportunity_scanning', 'partnership_development', 'expansion'],
    kpi_thresholds: { health_min: 70, innovation_min: 70 },
    cross_dept_keywords: ['growth', 'experiment', 'expansion', 'opportunity', 'scale'],
    max_initiatives_per_cycle: 3,
  },
  marketing: {
    slug: 'marketing',
    label: 'Marketing & Growth',
    focus_areas: ['lead_generation', 'content_marketing', 'campaign_optimization', 'brand_awareness'],
    kpi_thresholds: { health_min: 70, innovation_min: 65 },
    cross_dept_keywords: ['marketing', 'campaign', 'lead', 'content', 'brand', 'conversion'],
    max_initiatives_per_cycle: 3,
  },
  admissions: {
    slug: 'admissions',
    label: 'Admissions & Enrollment',
    focus_areas: ['enrollment_pipeline', 'student_recruitment', 'qualification', 'conversion_optimization'],
    kpi_thresholds: { health_min: 80, innovation_min: 60 },
    cross_dept_keywords: ['admissions', 'enrollment', 'recruitment', 'student', 'conversion', 'application'],
    max_initiatives_per_cycle: 2,
  },
  infrastructure: {
    slug: 'infrastructure',
    label: 'Infrastructure',
    focus_areas: ['system_health', 'security_monitoring', 'ai_model_performance', 'reliability'],
    kpi_thresholds: { health_min: 90, innovation_min: 50 },
    cross_dept_keywords: ['infrastructure', 'security', 'performance', 'reliability', 'deployment'],
    max_initiatives_per_cycle: 2,
  },
  platform: {
    slug: 'platform',
    label: 'Platform & Infrastructure',
    focus_areas: ['ux_optimization', 'deployment', 'performance_monitoring', 'system_reliability'],
    kpi_thresholds: { health_min: 85, innovation_min: 55 },
    cross_dept_keywords: ['platform', 'ux', 'deployment', 'performance', 'website'],
    max_initiatives_per_cycle: 2,
  },
  education: {
    slug: 'education',
    label: 'Education & Curriculum',
    focus_areas: ['curriculum_design', 'content_generation', 'program_quality', 'learning_outcomes'],
    kpi_thresholds: { health_min: 80, innovation_min: 65 },
    cross_dept_keywords: ['education', 'curriculum', 'learning', 'course', 'program', 'content'],
    max_initiatives_per_cycle: 3,
  },
  student_success: {
    slug: 'student_success',
    label: 'Student Success',
    focus_areas: ['retention', 'mentoring', 'learning_outcomes', 'student_experience'],
    kpi_thresholds: { health_min: 80, innovation_min: 60 },
    cross_dept_keywords: ['student', 'retention', 'mentoring', 'success', 'experience', 'outcome'],
    max_initiatives_per_cycle: 2,
  },
  alumni: {
    slug: 'alumni',
    label: 'Alumni Relations',
    focus_areas: ['post_graduation_engagement', 'community_building', 'referrals', 'career_support'],
    kpi_thresholds: { health_min: 70, innovation_min: 55 },
    cross_dept_keywords: ['alumni', 'referral', 'community', 'career', 'graduate', 'network'],
    max_initiatives_per_cycle: 2,
  },
};

export const ALL_DEPARTMENT_SLUGS = Object.keys(STRATEGY_CONFIGS);
