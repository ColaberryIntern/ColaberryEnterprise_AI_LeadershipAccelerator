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
  { dept: 'intelligence', title: 'Autonomous Anomaly Detection Engine', description: 'Build real-time anomaly detection that identifies data outliers and business risks without human intervention.', status: 'active', priority: 'high', progress: 72, owner: 'AI Team', start_date: '2025-11-01', target_date: '2026-04-30', revenue_impact: 15000, risk_level: 'medium', metadata: { story: { rationale: 'Manual monitoring missed 3 critical data anomalies in Q3 2025, costing $12K in delayed responses. The executive team identified automated anomaly detection as a strategic priority to prevent future blind spots and enable proactive risk management.', approval: { approved_by: 'CTO + VP Intelligence', approved_date: '2025-10-15', process: 'Technical feasibility review → Cost-benefit analysis → CTO approval → Budget allocation from Q4 AI fund' }, team: [{ name: 'Sarah Chen', role: 'Lead ML Engineer' }, { name: 'Marcus Reid', role: 'Data Engineer' }, { name: 'Lisa Park', role: 'Backend Developer' }], milestones: [{ title: 'Research & algorithm selection', date: '2025-11-15', completed: true }, { title: 'Training pipeline built', date: '2025-12-20', completed: true }, { title: 'MVP deployed to staging', date: '2026-02-01', completed: true }, { title: 'Production rollout', date: '2026-03-15', completed: false }, { title: 'Full autonomous mode', date: '2026-04-30', completed: false }] } } },
  { dept: 'intelligence', title: 'Natural Language Query Interface', description: 'Enable executives to query business data using plain English questions.', status: 'active', priority: 'critical', progress: 85, owner: 'AI Team', start_date: '2025-09-15', target_date: '2026-03-31', revenue_impact: 25000, risk_level: 'low', metadata: { story: { rationale: 'CEO identified that executives spend an average of 2 hours/day requesting reports from analysts. A natural language interface would democratize data access and free analyst bandwidth for strategic work.', approval: { approved_by: 'CEO + CTO', approved_date: '2025-09-01', process: 'CEO vision proposal → Board demo → CTO technical sign-off → Priority escalation to critical' }, team: [{ name: 'David Kim', role: 'NLP Engineer' }, { name: 'Sarah Chen', role: 'ML Engineer' }, { name: 'Alex Turner', role: 'Full-Stack Developer' }, { name: 'Rachel Morrison', role: 'UX Designer' }], milestones: [{ title: 'Intent classification model trained', date: '2025-10-15', completed: true }, { title: 'SQL generation pipeline', date: '2025-11-30', completed: true }, { title: 'Natural language response layer', date: '2026-01-15', completed: true }, { title: 'Executive beta program', date: '2026-02-15', completed: true }, { title: 'General availability', date: '2026-03-31', completed: false }] } } },
  { dept: 'intelligence', title: 'Predictive Revenue Forecasting', description: 'ML-based revenue prediction using historical enrollment and lead patterns.', status: 'planned', priority: 'high', progress: 10, owner: 'Data Science', start_date: '2026-04-01', target_date: '2026-08-31', revenue_impact: 30000, risk_level: 'medium', metadata: { story: { rationale: 'Finance department currently relies on spreadsheet-based forecasting with 60% accuracy. ML-based prediction using 18 months of enrollment data could improve accuracy to 85%+ and enable proactive resource allocation.', approval: { approved_by: 'CFO + VP Intelligence', approved_date: '2026-02-20', process: 'Data audit → Finance team requirements gathering → CFO sign-off → Scheduled for Q2 sprint' }, team: [{ name: 'Marcus Reid', role: 'Data Scientist (Lead)' }, { name: 'Emily Zhao', role: 'Data Analyst' }], milestones: [{ title: 'Historical data audit & cleaning', date: '2026-04-15', completed: false }, { title: 'Model selection & training', date: '2026-06-01', completed: false }, { title: 'Backtesting validation', date: '2026-07-15', completed: false }, { title: 'Production deployment', date: '2026-08-31', completed: false }] } } },
  // Operations
  { dept: 'operations', title: 'Self-Healing Infrastructure', description: 'Automated detection and remediation of system failures.', status: 'active', priority: 'high', progress: 55, owner: 'DevOps', start_date: '2025-12-01', target_date: '2026-05-31', revenue_impact: 8000, risk_level: 'high', metadata: { story: { rationale: 'Platform experienced 4 outages in Q3 2025, each requiring 30-60 min manual intervention. Self-healing would reduce MTTR from 45 min to under 5 min and eliminate 3am pages for on-call engineers.', approval: { approved_by: 'CTO + VP Operations', approved_date: '2025-11-15', process: 'Incident post-mortem analysis → Architecture review board → CTO priority approval → Dedicated sprint allocation' }, team: [{ name: 'James Liu', role: 'Senior DevOps Engineer' }, { name: 'Priya Sharma', role: 'SRE Lead' }, { name: 'Tom Baker', role: 'Infrastructure Engineer' }], milestones: [{ title: 'Health check framework built', date: '2025-12-20', completed: true }, { title: 'Auto-restart for stateless services', date: '2026-01-31', completed: true }, { title: 'Database failover automation', date: '2026-03-15', completed: false }, { title: 'Full self-healing pipeline', date: '2026-05-31', completed: false }] } } },
  { dept: 'operations', title: 'Cost Optimization Dashboard', description: 'Real-time visibility into infrastructure costs with optimization recommendations.', status: 'completed', priority: 'medium', progress: 100, owner: 'DevOps', start_date: '2025-08-01', target_date: '2026-01-15', completed_date: '2026-01-10', revenue_impact: 12000, risk_level: 'low', metadata: { story: { rationale: 'Cloud spend grew 40% YoY without corresponding usage growth. CFO requested visibility into cost drivers. Dashboard identified $12K/year in savings from right-sizing and reserved instances.', approval: { approved_by: 'CFO + CTO', approved_date: '2025-07-20', process: 'CFO budget review flagged overspend → Joint CTO/CFO approval → Fast-tracked as cost-saving initiative' }, team: [{ name: 'James Liu', role: 'DevOps Engineer' }, { name: 'Emily Zhao', role: 'Data Analyst' }], milestones: [{ title: 'Cost data pipeline from AWS/GCP', date: '2025-09-01', completed: true }, { title: 'Dashboard MVP with daily metrics', date: '2025-10-15', completed: true }, { title: 'Optimization recommendations engine', date: '2025-12-01', completed: true }, { title: 'Executive reporting integration', date: '2026-01-10', completed: true }] } } },
  // Growth
  { dept: 'growth', title: 'AI-Powered Lead Scoring 2.0', description: 'Next-generation lead scoring combining behavioral signals, intent data, and predictive analytics.', status: 'active', priority: 'critical', progress: 68, owner: 'Growth Team', start_date: '2025-10-15', target_date: '2026-04-15', revenue_impact: 45000, risk_level: 'medium', metadata: { story: { rationale: 'Legacy rule-based lead scoring had 55% accuracy. Sales team was wasting 40% of their time on low-quality leads. AI-powered scoring using behavioral + intent signals projected to improve accuracy to 82% and increase conversion by 25%.', approval: { approved_by: 'VP Growth + VP Sales + CEO', approved_date: '2025-10-01', process: 'Growth team proposal → Sales team validation → Joint VP review → CEO strategic approval → Elevated to critical priority' }, team: [{ name: 'Jordan Rivera', role: 'Growth Lead' }, { name: 'Sarah Chen', role: 'ML Engineer' }, { name: 'Mike Torres', role: 'Data Engineer' }, { name: 'Anna Kim', role: 'Sales Operations' }], milestones: [{ title: 'Historical lead data analysis', date: '2025-11-01', completed: true }, { title: 'Feature engineering (50+ signals)', date: '2025-12-15', completed: true }, { title: 'Model training & A/B test design', date: '2026-01-31', completed: true }, { title: 'Beta with 200-lead cohort', date: '2026-03-01', completed: true }, { title: 'Full production rollout', date: '2026-04-15', completed: false }] } } },
  { dept: 'growth', title: 'Partnership Channel Automation', description: 'Automated partner onboarding and lead sharing workflows.', status: 'planned', priority: 'medium', progress: 5, owner: 'Partnerships', start_date: '2026-05-01', target_date: '2026-09-30', revenue_impact: 20000, risk_level: 'medium', metadata: { story: { rationale: 'Current partner onboarding takes 3 weeks of manual work per partner. 8 potential partners in pipeline blocked by capacity. Automation would reduce onboarding to 3 days and enable 3x partner volume.', approval: { approved_by: 'VP Growth + CEO', approved_date: '2026-03-01', process: 'Partnership team bottleneck report → Growth strategy review → CEO approval → Scheduled for Q2' }, team: [{ name: 'Jordan Rivera', role: 'Growth Lead' }, { name: 'Chris Lee', role: 'Partnerships Manager' }], milestones: [{ title: 'Requirements & workflow mapping', date: '2026-05-15', completed: false }, { title: 'API integration framework', date: '2026-07-01', completed: false }, { title: 'Partner portal MVP', date: '2026-08-31', completed: false }, { title: 'First automated partner onboard', date: '2026-09-30', completed: false }] } } },
  // Marketing
  { dept: 'marketing', title: 'Hyper-Personalized Campaign Engine', description: 'AI-generated email content tailored to individual lead profiles and behavioral patterns.', status: 'active', priority: 'high', progress: 45, owner: 'Marketing', start_date: '2026-01-01', target_date: '2026-06-30', revenue_impact: 35000, risk_level: 'medium', metadata: { story: { rationale: 'Generic email campaigns achieving only 18% open rate. Industry benchmarks show personalized AI content drives 35%+ open rates. Estimated $35K revenue uplift from improved engagement-to-enrollment funnel.', approval: { approved_by: 'VP Marketing + CTO', approved_date: '2025-12-15', process: 'Marketing analytics review → AI feasibility assessment by CTO → Joint approval → Q1 kickoff' }, team: [{ name: 'Natalie Brooks', role: 'Marketing Lead' }, { name: 'David Kim', role: 'NLP Engineer' }, { name: 'Sofia Garcia', role: 'Content Strategist' }], milestones: [{ title: 'Lead profile enrichment pipeline', date: '2026-01-31', completed: true }, { title: 'AI content generation model fine-tuned', date: '2026-03-01', completed: true }, { title: 'Pilot campaign (50 leads)', date: '2026-03-15', completed: false }, { title: 'A/B test results & iteration', date: '2026-05-15', completed: false }, { title: 'Full rollout to all campaigns', date: '2026-06-30', completed: false }] } } },
  { dept: 'marketing', title: 'Content Intelligence Platform', description: 'Track content performance and automatically optimize distribution.', status: 'active', priority: 'medium', progress: 30, owner: 'Content Team', start_date: '2026-02-01', target_date: '2026-07-31', revenue_impact: 10000, risk_level: 'low', metadata: { story: { rationale: 'Marketing team produces 20+ content pieces/month with no visibility into which drives enrollment. Content Intelligence will attribute revenue to specific content, enabling data-driven editorial decisions.', approval: { approved_by: 'VP Marketing', approved_date: '2026-01-20', process: 'Content team proposal → Marketing leadership review → VP approval within department budget' }, team: [{ name: 'Sofia Garcia', role: 'Content Strategist' }, { name: 'Alex Turner', role: 'Full-Stack Developer' }], milestones: [{ title: 'Content tagging & tracking setup', date: '2026-02-28', completed: true }, { title: 'Attribution model design', date: '2026-04-15', completed: false }, { title: 'Dashboard & reporting', date: '2026-06-15', completed: false }, { title: 'Auto-optimization engine', date: '2026-07-31', completed: false }] } } },
  // Finance
  { dept: 'finance', title: 'Automated Financial Reporting', description: 'Auto-generate monthly P&L, cash flow, and cohort revenue reports.', status: 'active', priority: 'high', progress: 40, owner: 'Finance', start_date: '2026-01-15', target_date: '2026-06-30', revenue_impact: 5000, risk_level: 'low', metadata: { story: { rationale: 'Finance team spends 5 days each month manually compiling reports. Automation would free 60 hours/month for strategic analysis and reduce human error in financial data.', approval: { approved_by: 'CFO', approved_date: '2026-01-05', process: 'CFO internal priority → Budget pre-approved as operational efficiency → Immediate start' }, team: [{ name: 'Robert Chang', role: 'Finance Director' }, { name: 'Emily Zhao', role: 'Data Analyst' }], milestones: [{ title: 'Data source mapping & ETL', date: '2026-02-15', completed: true }, { title: 'P&L auto-generation', date: '2026-03-31', completed: true }, { title: 'Cash flow reporting', date: '2026-05-15', completed: false }, { title: 'Cohort revenue analysis', date: '2026-06-30', completed: false }] } } },
  { dept: 'finance', title: 'Revenue Attribution Model', description: 'Multi-touch attribution connecting marketing spend to enrollment revenue.', status: 'planned', priority: 'high', progress: 0, owner: 'Finance + Growth', start_date: '2026-06-01', target_date: '2026-10-31', revenue_impact: 20000, risk_level: 'medium', metadata: { story: { rationale: 'Cannot answer "which marketing dollar drives the most enrollment." CFO and VP Marketing jointly identified this as critical for 2027 budget planning. Expected to redirect $20K from low-performing to high-performing channels.', approval: { approved_by: 'CFO + VP Marketing + CEO', approved_date: '2026-03-05', process: 'Joint CFO/Marketing proposal → CEO strategic review → Cross-department budget allocation → Q3 start' }, team: [{ name: 'Robert Chang', role: 'Finance Director' }, { name: 'Natalie Brooks', role: 'Marketing Lead' }, { name: 'Marcus Reid', role: 'Data Scientist' }], milestones: [{ title: 'Attribution methodology selection', date: '2026-06-30', completed: false }, { title: 'Data pipeline (touchpoint tracking)', date: '2026-08-15', completed: false }, { title: 'Model training & validation', date: '2026-09-30', completed: false }, { title: 'Dashboard & reporting', date: '2026-10-31', completed: false }] } } },
  // Infrastructure
  { dept: 'infrastructure', title: 'Auto-Scaling Architecture', description: 'Dynamic resource allocation based on real-time demand patterns.', status: 'active', priority: 'high', progress: 65, owner: 'Platform Team', start_date: '2025-11-15', target_date: '2026-05-15', revenue_impact: 10000, risk_level: 'high', metadata: { story: { rationale: 'Platform crashed twice during enrollment peaks (500+ concurrent users). Static provisioning wastes $800/mo during off-peak. Auto-scaling solves both: handles peaks and saves costs.', approval: { approved_by: 'CTO', approved_date: '2025-11-01', process: 'Post-incident review → CTO immediate approval → Emergency budget allocation' }, team: [{ name: 'Priya Sharma', role: 'SRE Lead' }, { name: 'Tom Baker', role: 'Infrastructure Engineer' }, { name: 'James Liu', role: 'DevOps Engineer' }], milestones: [{ title: 'Load testing & capacity modeling', date: '2025-12-15', completed: true }, { title: 'Horizontal scaling for API layer', date: '2026-01-31', completed: true }, { title: 'Database read replicas', date: '2026-03-15', completed: true }, { title: 'Full auto-scaling with cost controls', date: '2026-05-15', completed: false }] } } },
  { dept: 'infrastructure', title: 'Zero-Trust Security Framework', description: 'Implement comprehensive zero-trust security across all services.', status: 'planned', priority: 'critical', progress: 15, owner: 'Security', start_date: '2026-03-01', target_date: '2026-09-30', revenue_impact: 0, risk_level: 'critical', metadata: { story: { rationale: 'Security audit revealed 3 medium-severity vulnerabilities in inter-service communication. Compliance requirements for enterprise clients mandate zero-trust architecture. Critical for landing $200K+ enterprise deals.', approval: { approved_by: 'CEO + CTO + Legal', approved_date: '2026-02-15', process: 'Security audit report → Legal compliance review → Board briefing → CEO/CTO joint approval → Critical priority designation' }, team: [{ name: 'Priya Sharma', role: 'SRE Lead' }, { name: 'External Security Consultant', role: 'Security Architect' }], milestones: [{ title: 'Security audit & gap analysis', date: '2026-03-31', completed: false }, { title: 'Service mesh implementation', date: '2026-05-31', completed: false }, { title: 'Identity & access management', date: '2026-07-31', completed: false }, { title: 'Penetration testing & certification', date: '2026-09-30', completed: false }] } } },
  // Education
  { dept: 'education', title: 'Adaptive Learning Paths', description: 'AI-driven curriculum that adjusts to individual student pace and comprehension.', status: 'active', priority: 'critical', progress: 48, owner: 'Education Team', start_date: '2025-10-01', target_date: '2026-06-30', revenue_impact: 40000, risk_level: 'medium', metadata: { story: { rationale: 'Student completion rate stuck at 72%. Analysis showed 28% drop-offs happen when material is too fast or too slow. Adaptive paths personalize difficulty, projected to improve completion to 85%+ and add $40K in retained revenue.', approval: { approved_by: 'CEO + VP Education', approved_date: '2025-09-15', process: 'Student outcome analysis → Education team proposal → CEO strategic review → Designated flagship initiative' }, team: [{ name: 'Dr. Michelle Wong', role: 'VP Education' }, { name: 'David Kim', role: 'ML Engineer' }, { name: 'Jessica Patel', role: 'Curriculum Designer' }, { name: 'Alex Turner', role: 'Full-Stack Developer' }, { name: 'Carlos Mendez', role: 'Learning Analyst' }], milestones: [{ title: 'Student learning pattern analysis', date: '2025-11-15', completed: true }, { title: 'Adaptive algorithm design', date: '2026-01-15', completed: true }, { title: 'Pilot with 30 students', date: '2026-03-01', completed: true }, { title: 'Expanded pilot (100 students)', date: '2026-05-01', completed: false }, { title: 'Full curriculum rollout', date: '2026-06-30', completed: false }] } } },
  { dept: 'education', title: 'AI Mentor Companion', description: 'Always-available AI tutor providing personalized guidance and code reviews.', status: 'active', priority: 'high', progress: 62, owner: 'AI + Education', start_date: '2025-11-01', target_date: '2026-05-31', revenue_impact: 25000, risk_level: 'low', metadata: { story: { rationale: 'Students report #1 frustration is waiting for instructor help during off-hours. AI Mentor provides 24/7 code review and concept explanations, improving student experience and reducing instructor load by 30%.', approval: { approved_by: 'VP Education + CTO', approved_date: '2025-10-20', process: 'Student survey analysis → Joint Education/Tech review → VP + CTO approval → High priority' }, team: [{ name: 'David Kim', role: 'NLP Engineer' }, { name: 'Jessica Patel', role: 'Curriculum Advisor' }, { name: 'Lisa Park', role: 'Backend Developer' }], milestones: [{ title: 'Knowledge base creation (500+ Q&As)', date: '2025-12-15', completed: true }, { title: 'Code review engine', date: '2026-01-31', completed: true }, { title: 'Concept explanation model', date: '2026-03-15', completed: true }, { title: 'Student feedback integration', date: '2026-04-30', completed: false }, { title: 'Full 24/7 deployment', date: '2026-05-31', completed: false }] } } },
  { dept: 'education', title: 'Skills Assessment Engine', description: 'Automated skill evaluation with industry-aligned competency mapping.', status: 'planned', priority: 'medium', progress: 8, owner: 'Education Team', start_date: '2026-05-01', target_date: '2026-10-31', revenue_impact: 15000, risk_level: 'low', metadata: { story: { rationale: 'Employers request verified skill assessments for graduates. Current manual evaluation is inconsistent. Automated assessments aligned to industry frameworks would improve job placement rate and justify premium pricing.', approval: { approved_by: 'VP Education + VP Growth', approved_date: '2026-02-28', process: 'Employer feedback analysis → Joint Education/Growth proposal → Dual VP approval → Q2 planning' }, team: [{ name: 'Carlos Mendez', role: 'Learning Analyst' }, { name: 'Dr. Michelle Wong', role: 'Education Advisor' }], milestones: [{ title: 'Competency framework mapping', date: '2026-05-31', completed: false }, { title: 'Assessment question bank', date: '2026-07-15', completed: false }, { title: 'Automated grading engine', date: '2026-09-15', completed: false }, { title: 'Employer portal integration', date: '2026-10-31', completed: false }] } } },
  // Orchestration
  { dept: 'orchestration', title: 'Cross-Department Workflow Engine', description: 'Automated workflows that span multiple departments with intelligent routing.', status: 'active', priority: 'high', progress: 42, owner: 'Orchestration', start_date: '2026-01-01', target_date: '2026-07-31', revenue_impact: 18000, risk_level: 'high', metadata: { story: { rationale: 'Cross-department handoffs (e.g., lead → enrollment → onboarding) lose an average of 2 days per handoff due to manual coordination. Automated workflows would eliminate delays and ensure no leads fall through cracks.', approval: { approved_by: 'CTO + All Department VPs', approved_date: '2025-12-15', process: 'Operational efficiency audit → Cross-department workshop → All-VP consensus → CTO technical approval' }, team: [{ name: 'Wei Zhang', role: 'Orchestration Lead' }, { name: 'Alex Turner', role: 'Full-Stack Developer' }, { name: 'Priya Sharma', role: 'Infrastructure Advisor' }], milestones: [{ title: 'Workflow mapping across 8 departments', date: '2026-02-01', completed: true }, { title: 'Event bus architecture', date: '2026-03-15', completed: true }, { title: 'First automated workflow (Lead → Enrollment)', date: '2026-05-01', completed: false }, { title: 'All department workflows live', date: '2026-07-31', completed: false }] } } },
  { dept: 'orchestration', title: 'Agent Performance Optimizer', description: 'Self-tuning AI agents that improve their own effectiveness over time.', status: 'active', priority: 'critical', progress: 58, owner: 'AI Ops', start_date: '2025-12-01', target_date: '2026-05-31', revenue_impact: 22000, risk_level: 'medium', metadata: { story: { rationale: 'AI agents handle 1,840 orchestration cycles/day but success rate plateaued at 73%. Self-tuning optimization using reinforcement learning projected to push success rate to 90%+ and reduce human escalations by 60%.', approval: { approved_by: 'CTO + CEO', approved_date: '2025-11-20', process: 'AI performance review → CTO technical assessment → CEO strategic alignment → Critical priority' }, team: [{ name: 'Wei Zhang', role: 'Orchestration Lead' }, { name: 'Sarah Chen', role: 'ML Engineer' }, { name: 'Marcus Reid', role: 'Data Scientist' }], milestones: [{ title: 'Agent performance telemetry', date: '2025-12-31', completed: true }, { title: 'Reinforcement learning framework', date: '2026-02-15', completed: true }, { title: 'Self-tuning pilot (3 agents)', date: '2026-03-31', completed: true }, { title: 'Full fleet optimization', date: '2026-05-31', completed: false }] } } },
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
      // Check if initiatives have story metadata; if not, reseed initiatives
      const sampleInit = await Initiative.findOne({ where: {} });
      const hasStory = sampleInit && (sampleInit as any).metadata?.story;
      if (hasStory) {
        console.log(`[seed] Departments already seeded (${existing} found) with story data, skipping.`);
        return;
      }
      // Reseed initiatives with story metadata
      console.log('[seed] Reseeding initiatives with story metadata...');
      const depts = await Department.findAll();
      const deptMap: Record<string, DeptRecord> = {};
      for (const d of depts) deptMap[d.slug] = { id: d.id, slug: d.slug };

      await DepartmentEvent.destroy({ where: {} });
      await Initiative.destroy({ where: {} });

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
          metadata: init.metadata || {},
        });
        initiativeMap[init.title] = record.id;
      }

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

      console.log(`[seed] Reseeded ${INITIATIVES_TEMPLATE.length} initiatives with story data and ${EVENTS_TEMPLATE.length} events.`);
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
        metadata: init.metadata || {},
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
