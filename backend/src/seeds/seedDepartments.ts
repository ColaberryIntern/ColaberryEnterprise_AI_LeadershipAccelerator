import Department from '../models/Department';
import Initiative from '../models/Initiative';
import DepartmentEvent from '../models/DepartmentEvent';

const DEPARTMENTS = [
  {
    name: 'Intelligence',
    slug: 'intelligence',
    mission: 'Transform raw data into actionable business intelligence through AI-powered discovery, analysis, and autonomous decision-making.',
    color: '#1a365d',
    bg_light: '#ebf8ff',
    team_size: 4,
    health_score: 88,
    innovation_score: 92,
    strategic_objectives: [
      { title: 'Achieve 95% autonomous decision accuracy', progress: 78 },
      { title: 'Real-time anomaly detection across all data streams', progress: 65 },
    ],
    kpis: [
      { name: 'Query Accuracy', value: 94, unit: '%', trend: 'up' },
      { name: 'Insights Generated', value: 1247, unit: '/mo', trend: 'up' },
      { name: 'Data Coverage', value: 87, unit: '%', trend: 'stable' },
    ],
  },
  {
    name: 'Operations',
    slug: 'operations',
    mission: 'Ensure reliable, scalable, and cost-efficient delivery of all platform services and infrastructure.',
    color: '#2b6cb0',
    bg_light: '#ebf4ff',
    team_size: 3,
    health_score: 82,
    innovation_score: 68,
    strategic_objectives: [
      { title: '99.9% platform uptime', progress: 96 },
      { title: 'Reduce operational costs by 20%', progress: 45 },
    ],
    kpis: [
      { name: 'Uptime', value: 99.8, unit: '%', trend: 'stable' },
      { name: 'Avg Response Time', value: 245, unit: 'ms', trend: 'down' },
      { name: 'Error Rate', value: 0.3, unit: '%', trend: 'down' },
    ],
  },
  {
    name: 'Growth',
    slug: 'growth',
    mission: 'Drive sustainable business growth through lead generation, conversion optimization, and strategic partnerships.',
    color: '#38a169',
    bg_light: '#f0fff4',
    team_size: 5,
    health_score: 75,
    innovation_score: 81,
    strategic_objectives: [
      { title: 'Increase qualified lead volume by 40%', progress: 62 },
      { title: 'Improve lead-to-enrollment conversion by 25%', progress: 38 },
    ],
    kpis: [
      { name: 'New Leads', value: 342, unit: '/mo', trend: 'up' },
      { name: 'Conversion Rate', value: 12.4, unit: '%', trend: 'up' },
      { name: 'CAC', value: 185, unit: '$', trend: 'down' },
    ],
  },
  {
    name: 'Marketing',
    slug: 'marketing',
    mission: 'Build brand awareness and demand through intelligent, data-driven campaigns and content strategies.',
    color: '#e53e3e',
    bg_light: '#fff5f5',
    team_size: 3,
    health_score: 79,
    innovation_score: 74,
    strategic_objectives: [
      { title: 'Launch AI-personalized campaign sequences', progress: 55 },
      { title: 'Achieve 30% email open rate across campaigns', progress: 72 },
    ],
    kpis: [
      { name: 'Email Open Rate', value: 28.5, unit: '%', trend: 'up' },
      { name: 'Content Engagement', value: 4.2, unit: 'min avg', trend: 'stable' },
      { name: 'Campaign ROI', value: 3.8, unit: 'x', trend: 'up' },
    ],
  },
  {
    name: 'Finance',
    slug: 'finance',
    mission: 'Maximize revenue capture, optimize costs, and provide financial intelligence for strategic decisions.',
    color: '#d69e2e',
    bg_light: '#fffff0',
    team_size: 2,
    health_score: 91,
    innovation_score: 55,
    strategic_objectives: [
      { title: 'Automate 80% of financial reporting', progress: 40 },
      { title: 'Reduce revenue leakage to under 2%', progress: 85 },
    ],
    kpis: [
      { name: 'MRR', value: 48500, unit: '$', trend: 'up' },
      { name: 'Gross Margin', value: 72, unit: '%', trend: 'stable' },
      { name: 'Collection Rate', value: 96, unit: '%', trend: 'up' },
    ],
  },
  {
    name: 'Infrastructure',
    slug: 'infrastructure',
    mission: 'Build and maintain the technical foundation that powers all platform capabilities.',
    color: '#718096',
    bg_light: '#f7fafc',
    team_size: 3,
    health_score: 85,
    innovation_score: 72,
    strategic_objectives: [
      { title: 'Complete cloud migration and auto-scaling', progress: 70 },
      { title: 'Implement zero-trust security architecture', progress: 30 },
    ],
    kpis: [
      { name: 'Deploy Frequency', value: 12, unit: '/wk', trend: 'up' },
      { name: 'MTTR', value: 18, unit: 'min', trend: 'down' },
      { name: 'Security Score', value: 88, unit: '/100', trend: 'up' },
    ],
  },
  {
    name: 'Education',
    slug: 'education',
    mission: 'Deliver transformative learning experiences that accelerate student outcomes and career advancement.',
    color: '#805ad5',
    bg_light: '#faf5ff',
    team_size: 6,
    health_score: 87,
    innovation_score: 83,
    strategic_objectives: [
      { title: 'AI-adaptive curriculum for every student', progress: 48 },
      { title: '90% student satisfaction score', progress: 82 },
    ],
    kpis: [
      { name: 'Completion Rate', value: 78, unit: '%', trend: 'up' },
      { name: 'Student Satisfaction', value: 87, unit: '%', trend: 'up' },
      { name: 'Job Placement', value: 72, unit: '%', trend: 'stable' },
    ],
  },
  {
    name: 'Orchestration',
    slug: 'orchestration',
    mission: 'Coordinate AI agents, workflows, and cross-department processes for maximum system efficiency.',
    color: '#319795',
    bg_light: '#e6fffa',
    team_size: 2,
    health_score: 80,
    innovation_score: 90,
    strategic_objectives: [
      { title: 'Full autonomous agent orchestration', progress: 58 },
      { title: 'Cross-department workflow automation', progress: 42 },
    ],
    kpis: [
      { name: 'Agent Success Rate', value: 96, unit: '%', trend: 'up' },
      { name: 'Orchestration Cycles', value: 1840, unit: '/day', trend: 'up' },
      { name: 'Auto-Resolution', value: 73, unit: '%', trend: 'up' },
    ],
  },
];

interface DeptRecord { id: string; slug: string }

const INITIATIVES_TEMPLATE = [
  // Intelligence
  { dept: 'intelligence', title: 'Autonomous Anomaly Detection Engine', description: 'Build real-time anomaly detection that identifies data outliers and business risks without human intervention.', status: 'active', priority: 'high', progress: 72, owner: 'AI Team', start_date: '2025-11-01', target_date: '2026-04-30', revenue_impact: 15000, risk_level: 'medium' },
  { dept: 'intelligence', title: 'Natural Language Query Interface', description: 'Enable executives to query business data using plain English questions.', status: 'active', priority: 'critical', progress: 85, owner: 'AI Team', start_date: '2025-09-15', target_date: '2026-03-31', revenue_impact: 25000, risk_level: 'low' },
  { dept: 'intelligence', title: 'Predictive Revenue Forecasting', description: 'ML-based revenue prediction using historical enrollment and lead patterns.', status: 'planned', priority: 'high', progress: 10, owner: 'Data Science', start_date: '2026-04-01', target_date: '2026-08-31', revenue_impact: 30000, risk_level: 'medium' },
  // Operations
  { dept: 'operations', title: 'Self-Healing Infrastructure', description: 'Automated detection and remediation of system failures.', status: 'active', priority: 'high', progress: 55, owner: 'DevOps', start_date: '2025-12-01', target_date: '2026-05-31', revenue_impact: 8000, risk_level: 'high' },
  { dept: 'operations', title: 'Cost Optimization Dashboard', description: 'Real-time visibility into infrastructure costs with optimization recommendations.', status: 'completed', priority: 'medium', progress: 100, owner: 'DevOps', start_date: '2025-08-01', target_date: '2026-01-15', completed_date: '2026-01-10', revenue_impact: 12000, risk_level: 'low' },
  // Growth
  { dept: 'growth', title: 'AI-Powered Lead Scoring 2.0', description: 'Next-generation lead scoring combining behavioral signals, intent data, and predictive analytics.', status: 'active', priority: 'critical', progress: 68, owner: 'Growth Team', start_date: '2025-10-15', target_date: '2026-04-15', revenue_impact: 45000, risk_level: 'medium' },
  { dept: 'growth', title: 'Partnership Channel Automation', description: 'Automated partner onboarding and lead sharing workflows.', status: 'planned', priority: 'medium', progress: 5, owner: 'Partnerships', start_date: '2026-05-01', target_date: '2026-09-30', revenue_impact: 20000, risk_level: 'medium' },
  // Marketing
  { dept: 'marketing', title: 'Hyper-Personalized Campaign Engine', description: 'AI-generated email content tailored to individual lead profiles and behavioral patterns.', status: 'active', priority: 'high', progress: 45, owner: 'Marketing', start_date: '2026-01-01', target_date: '2026-06-30', revenue_impact: 35000, risk_level: 'medium' },
  { dept: 'marketing', title: 'Content Intelligence Platform', description: 'Track content performance and automatically optimize distribution.', status: 'active', priority: 'medium', progress: 30, owner: 'Content Team', start_date: '2026-02-01', target_date: '2026-07-31', revenue_impact: 10000, risk_level: 'low' },
  // Finance
  { dept: 'finance', title: 'Automated Financial Reporting', description: 'Auto-generate monthly P&L, cash flow, and cohort revenue reports.', status: 'active', priority: 'high', progress: 40, owner: 'Finance', start_date: '2026-01-15', target_date: '2026-06-30', revenue_impact: 5000, risk_level: 'low' },
  { dept: 'finance', title: 'Revenue Attribution Model', description: 'Multi-touch attribution connecting marketing spend to enrollment revenue.', status: 'planned', priority: 'high', progress: 0, owner: 'Finance + Growth', start_date: '2026-06-01', target_date: '2026-10-31', revenue_impact: 20000, risk_level: 'medium' },
  // Infrastructure
  { dept: 'infrastructure', title: 'Auto-Scaling Architecture', description: 'Dynamic resource allocation based on real-time demand patterns.', status: 'active', priority: 'high', progress: 65, owner: 'Platform Team', start_date: '2025-11-15', target_date: '2026-05-15', revenue_impact: 10000, risk_level: 'high' },
  { dept: 'infrastructure', title: 'Zero-Trust Security Framework', description: 'Implement comprehensive zero-trust security across all services.', status: 'planned', priority: 'critical', progress: 15, owner: 'Security', start_date: '2026-03-01', target_date: '2026-09-30', revenue_impact: 0, risk_level: 'critical' },
  // Education
  { dept: 'education', title: 'Adaptive Learning Paths', description: 'AI-driven curriculum that adjusts to individual student pace and comprehension.', status: 'active', priority: 'critical', progress: 48, owner: 'Education Team', start_date: '2025-10-01', target_date: '2026-06-30', revenue_impact: 40000, risk_level: 'medium' },
  { dept: 'education', title: 'AI Mentor Companion', description: 'Always-available AI tutor providing personalized guidance and code reviews.', status: 'active', priority: 'high', progress: 62, owner: 'AI + Education', start_date: '2025-11-01', target_date: '2026-05-31', revenue_impact: 25000, risk_level: 'low' },
  { dept: 'education', title: 'Skills Assessment Engine', description: 'Automated skill evaluation with industry-aligned competency mapping.', status: 'planned', priority: 'medium', progress: 8, owner: 'Education Team', start_date: '2026-05-01', target_date: '2026-10-31', revenue_impact: 15000, risk_level: 'low' },
  // Orchestration
  { dept: 'orchestration', title: 'Cross-Department Workflow Engine', description: 'Automated workflows that span multiple departments with intelligent routing.', status: 'active', priority: 'high', progress: 42, owner: 'Orchestration', start_date: '2026-01-01', target_date: '2026-07-31', revenue_impact: 18000, risk_level: 'high' },
  { dept: 'orchestration', title: 'Agent Performance Optimizer', description: 'Self-tuning AI agents that improve their own effectiveness over time.', status: 'active', priority: 'critical', progress: 58, owner: 'AI Ops', start_date: '2025-12-01', target_date: '2026-05-31', revenue_impact: 22000, risk_level: 'medium' },
];

const EVENTS_TEMPLATE = [
  { dept: 'intelligence', event_type: 'achievement', title: 'Query accuracy reached 94%', description: 'Natural language query engine exceeded accuracy target.', severity: null, days_ago: 2 },
  { dept: 'intelligence', event_type: 'milestone', title: 'Anomaly detection MVP deployed', description: 'First version of autonomous anomaly detection is live in staging.', severity: null, days_ago: 5 },
  { dept: 'operations', event_type: 'risk', title: 'Database connection pool near capacity', description: 'Connection pool utilization reached 85% during peak hours.', severity: 'warning', days_ago: 1 },
  { dept: 'operations', event_type: 'achievement', title: 'Cost optimization dashboard shipped', description: 'Real-time cost visibility now available to all departments.', severity: null, days_ago: 8 },
  { dept: 'growth', event_type: 'milestone', title: 'Lead scoring 2.0 beta launch', description: 'Beta version deployed with 200 leads in test cohort.', severity: null, days_ago: 3 },
  { dept: 'growth', event_type: 'update', title: 'Conversion funnel redesign started', description: 'UX team began redesigning the enrollment conversion flow.', severity: null, days_ago: 6 },
  { dept: 'marketing', event_type: 'launch', title: 'Hyper-personalized sequences pilot', description: 'First AI-generated personalized campaign launched to 50 leads.', severity: null, days_ago: 4 },
  { dept: 'marketing', event_type: 'risk', title: 'Email deliverability drop', description: 'Deliverability dropped to 91% — investigating DNS configuration.', severity: 'warning', days_ago: 1 },
  { dept: 'finance', event_type: 'milestone', title: 'Automated P&L report v1', description: 'First automated monthly P&L report generated successfully.', severity: null, days_ago: 7 },
  { dept: 'infrastructure', event_type: 'achievement', title: 'Auto-scaling deployed to production', description: 'Dynamic scaling now handles traffic spikes automatically.', severity: null, days_ago: 10 },
  { dept: 'infrastructure', event_type: 'risk', title: 'SSL certificate expiring in 14 days', description: 'Production SSL certificate needs renewal.', severity: 'critical', days_ago: 0 },
  { dept: 'education', event_type: 'achievement', title: 'Student satisfaction hit 87%', description: 'Latest NPS survey shows highest satisfaction score to date.', severity: null, days_ago: 3 },
  { dept: 'education', event_type: 'milestone', title: 'AI Mentor handles 500 sessions', description: 'AI Mentor companion reached 500 successful tutoring sessions.', severity: null, days_ago: 6 },
  { dept: 'orchestration', event_type: 'milestone', title: 'Agent auto-resolution rate 73%', description: 'AI agents now resolve 73% of issues without human intervention.', severity: null, days_ago: 2 },
  { dept: 'orchestration', event_type: 'update', title: 'Cross-department workflows in design', description: 'Architecture review completed for multi-department workflow engine.', severity: null, days_ago: 9 },
];

export async function seedDepartments() {
  try {
    const existing = await Department.count();
    if (existing > 0) {
      console.log(`[seed] Departments already seeded (${existing} found), skipping.`);
      return;
    }

    console.log('[seed] Seeding departments...');

    // Create departments
    const deptMap: Record<string, DeptRecord> = {};
    for (const d of DEPARTMENTS) {
      const dept = await Department.create(d as any);
      deptMap[d.slug] = { id: dept.id, slug: d.slug };
    }

    // Create initiatives
    const initiativeMap: Record<string, string> = {};
    for (const init of INITIATIVES_TEMPLATE) {
      const dept = deptMap[init.dept];
      if (!dept) continue;
      const record = await Initiative.create({
        department_id: dept.id,
        title: init.title,
        description: init.description,
        status: init.status as any,
        priority: init.priority as any,
        progress: init.progress,
        owner: init.owner,
        start_date: new Date(init.start_date),
        target_date: new Date(init.target_date),
        completed_date: (init as any).completed_date ? new Date((init as any).completed_date) : undefined,
        revenue_impact: init.revenue_impact,
        risk_level: init.risk_level as any,
      });
      initiativeMap[init.title] = record.id;
    }

    // Create events
    for (const evt of EVENTS_TEMPLATE) {
      const dept = deptMap[evt.dept];
      if (!dept) continue;
      const createdAt = new Date(Date.now() - evt.days_ago * 86400000);
      await DepartmentEvent.create({
        department_id: dept.id,
        event_type: evt.event_type as any,
        title: evt.title,
        description: evt.description,
        severity: evt.severity || undefined,
        created_at: createdAt,
      });
    }

    console.log(`[seed] Seeded ${DEPARTMENTS.length} departments, ${INITIATIVES_TEMPLATE.length} initiatives, ${EVENTS_TEMPLATE.length} events.`);
  } catch (err: any) {
    console.error('[seed] Department seeding error:', err.message);
  }
}
