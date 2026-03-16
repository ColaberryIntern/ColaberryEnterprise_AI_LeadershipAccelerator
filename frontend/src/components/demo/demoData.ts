export interface DemoDepartment {
  id: string;
  name: string;
  icon: string;
  color: string;
  bgLight: string;
  agents: number;
  agentNames: string[];
  activity: string[];
  findings: string[];
  recommendations: string[];
  impact: string;
  impactValue: string;
  opportunityScore: number;
  radarData: { metric: string; current: number; potential: number }[];
  pipelineData?: { stage: string; value: number }[];
}

export interface AskCoryResponse {
  keywords: string[];
  response: string;
}

export const DEMO_DEPARTMENTS: DemoDepartment[] = [
  {
    id: 'strategy',
    name: 'Strategy',
    icon: '\u{1F3AF}',
    color: '#1a365d',
    bgLight: '#ebf8ff',
    agents: 8,
    agentNames: [
      'Market Intelligence Scanner',
      'Competitive Analysis Agent',
      'Strategic Planning Optimizer',
      'Risk Assessment Monitor',
      'Growth Opportunity Mapper',
      'Executive Decision Support',
    ],
    activity: [
      'Competitive landscape analysis completed',
      'Market opportunity scoring updated',
      'Strategic risk assessment refreshed',
    ],
    findings: [
      'Three untapped market segments identified with $12M combined TAM',
      'Competitor AI adoption rate accelerating — 40% gap closing in 6 months',
      'Current strategic initiatives underweight in automation investment',
    ],
    recommendations: [
      'Prioritize AI deployment in customer-facing operations',
      'Allocate 15% of innovation budget to AI infrastructure',
      'Establish cross-department AI governance council',
    ],
    impact: '+28% strategic initiative completion rate',
    impactValue: '+$1.8M annual strategic value captured',
    opportunityScore: 87,
    radarData: [
      { metric: 'Vision', current: 72, potential: 95 },
      { metric: 'Execution', current: 58, potential: 88 },
      { metric: 'Innovation', current: 45, potential: 85 },
      { metric: 'Alignment', current: 65, potential: 90 },
      { metric: 'Agility', current: 50, potential: 82 },
    ],
    pipelineData: [
      { stage: 'Initiatives Identified', value: 24 },
      { stage: 'Under Review', value: 18 },
      { stage: 'Approved', value: 12 },
      { stage: 'In Progress', value: 8 },
      { stage: 'Completed', value: 5 },
    ],
  },
  {
    id: 'marketing',
    name: 'Marketing',
    icon: '\u{1F4E3}',
    color: '#e53e3e',
    bgLight: '#fff5f5',
    agents: 16,
    agentNames: [
      'Campaign Performance Analyzer',
      'Lead Attribution Agent',
      'Content Strategy Agent',
      'Conversion Optimization Monitor',
      'Audience Segmentation Agent',
      'Budget Allocation Model',
    ],
    activity: [
      'Campaign performance analysis completed',
      'Lead conversion modeling updated',
      'Content strategy optimization refreshed',
    ],
    findings: [
      'LinkedIn campaigns outperform email by 38%',
      'Highest engagement occurs Tuesday\u2013Thursday mornings',
      'Messaging underutilizes AI automation narrative',
    ],
    recommendations: [
      'Shift 25% ad spend toward LinkedIn',
      'Launch automated webinar funnel',
      'Deploy AI content calendar system',
    ],
    impact: '+32% projected lead generation',
    impactValue: '+$240K annual pipeline increase',
    opportunityScore: 82,
    radarData: [
      { metric: 'Content', current: 55, potential: 88 },
      { metric: 'Leads', current: 62, potential: 90 },
      { metric: 'Conversion', current: 48, potential: 82 },
      { metric: 'Engagement', current: 71, potential: 93 },
      { metric: 'Attribution', current: 40, potential: 78 },
    ],
    pipelineData: [
      { stage: 'New Lead', value: 342 },
      { stage: 'Contacted', value: 218 },
      { stage: 'Meeting Scheduled', value: 87 },
      { stage: 'Proposal Sent', value: 41 },
      { stage: 'Closed', value: 19 },
    ],
  },
  {
    id: 'operations',
    name: 'Operations',
    icon: '\u2699\uFE0F',
    color: '#38a169',
    bgLight: '#f0fff4',
    agents: 12,
    agentNames: [
      'Process Efficiency Analyzer',
      'Resource Allocation Agent',
      'Quality Assurance Monitor',
      'Supply Chain Optimizer',
      'Workflow Automation Engine',
      'Capacity Planning Model',
    ],
    activity: [
      'Process bottleneck analysis completed',
      'Resource utilization report generated',
      'Quality metrics dashboard updated',
    ],
    findings: [
      'Manual approval workflows consume 340 hours/month across teams',
      'Three critical processes lack automated fallback mechanisms',
      'Resource allocation 23% suboptimal during peak periods',
    ],
    recommendations: [
      'Automate top 5 approval workflows (est. 280 hours/month saved)',
      'Deploy predictive capacity planning for Q3 demand surge',
      'Implement real-time resource rebalancing system',
    ],
    impact: '+41% operational efficiency',
    impactValue: '+$520K annual cost reduction',
    opportunityScore: 91,
    radarData: [
      { metric: 'Efficiency', current: 52, potential: 90 },
      { metric: 'Quality', current: 68, potential: 92 },
      { metric: 'Speed', current: 45, potential: 85 },
      { metric: 'Cost', current: 60, potential: 88 },
      { metric: 'Reliability', current: 75, potential: 95 },
    ],
    pipelineData: [
      { stage: 'Identified', value: 48 },
      { stage: 'Assessed', value: 35 },
      { stage: 'Automated', value: 22 },
      { stage: 'Monitored', value: 18 },
      { stage: 'Optimized', value: 12 },
    ],
  },
  {
    id: 'sales',
    name: 'Sales',
    icon: '\u{1F4BC}',
    color: '#805ad5',
    bgLight: '#faf5ff',
    agents: 14,
    agentNames: [
      'Pipeline Velocity Analyzer',
      'Deal Scoring Agent',
      'Forecasting Model',
      'Territory Optimization Agent',
      'Competitive Win/Loss Analyzer',
      'Account Expansion Monitor',
    ],
    activity: [
      'Pipeline velocity analysis completed',
      'Deal scoring model recalibrated',
      'Territory performance review generated',
    ],
    findings: [
      'Average deal cycle 18 days longer than industry benchmark',
      'Top 20% of reps close 4.2x more using data-driven outreach',
      'Enterprise segment underperforming mid-market by 35% on close rate',
    ],
    recommendations: [
      'Deploy AI-powered lead scoring to prioritize high-intent prospects',
      'Implement automated follow-up sequences for stalled deals',
      'Launch account expansion playbook for existing enterprise clients',
    ],
    impact: '+26% pipeline conversion rate',
    impactValue: '+$1.2M annual revenue increase',
    opportunityScore: 78,
    radarData: [
      { metric: 'Pipeline', current: 58, potential: 85 },
      { metric: 'Conversion', current: 42, potential: 78 },
      { metric: 'Forecast', current: 55, potential: 88 },
      { metric: 'Velocity', current: 48, potential: 80 },
      { metric: 'Retention', current: 72, potential: 92 },
    ],
    pipelineData: [
      { stage: 'Prospect', value: 285 },
      { stage: 'Qualified', value: 164 },
      { stage: 'Proposal', value: 72 },
      { stage: 'Negotiation', value: 38 },
      { stage: 'Won', value: 21 },
    ],
  },
  {
    id: 'finance',
    name: 'Finance',
    icon: '\u{1F4B0}',
    color: '#d69e2e',
    bgLight: '#fffff0',
    agents: 10,
    agentNames: [
      'Budget Variance Analyzer',
      'Cash Flow Prediction Agent',
      'Compliance Monitoring Agent',
      'Expense Pattern Detector',
      'Revenue Forecasting Model',
      'Audit Trail Validator',
    ],
    activity: [
      'Monthly variance analysis completed',
      'Cash flow projections updated',
      'Compliance audit scan finished',
    ],
    findings: [
      'Invoice processing time averaging 4.2 days vs. 1-day benchmark',
      'Three budget categories consistently over-allocated by 15-20%',
      'Cash flow prediction accuracy at 72% \u2014 industry leaders achieve 91%',
    ],
    recommendations: [
      'Deploy automated invoice processing (target: same-day)',
      'Implement AI-driven budget reallocation recommendations',
      'Upgrade forecasting model with ML-based seasonality detection',
    ],
    impact: '+$380K annual savings from process automation',
    impactValue: '+$380K annual cost savings',
    opportunityScore: 74,
    radarData: [
      { metric: 'Accuracy', current: 65, potential: 92 },
      { metric: 'Speed', current: 42, potential: 85 },
      { metric: 'Compliance', current: 78, potential: 95 },
      { metric: 'Visibility', current: 55, potential: 88 },
      { metric: 'Planning', current: 50, potential: 82 },
    ],
    pipelineData: [
      { stage: 'Invoices Pending', value: 156 },
      { stage: 'Under Review', value: 82 },
      { stage: 'Approved', value: 64 },
      { stage: 'Processed', value: 48 },
      { stage: 'Reconciled', value: 41 },
    ],
  },
  {
    id: 'customer-success',
    name: 'Customer Success',
    icon: '\u{1F91D}',
    color: '#319795',
    bgLight: '#e6fffa',
    agents: 11,
    agentNames: [
      'Churn Risk Predictor',
      'Satisfaction Score Analyzer',
      'Onboarding Optimization Agent',
      'Health Score Calculator',
      'Escalation Pattern Detector',
      'Renewal Forecasting Model',
    ],
    activity: [
      'Customer health scores recalculated',
      'Churn risk predictions updated',
      'Onboarding funnel analysis completed',
    ],
    findings: [
      '12% of accounts showing early churn signals — intervention window: 30 days',
      'Onboarding completion rate 67% \u2014 drops correlate with 3x churn risk',
      'NPS detractors share 4 common product experience patterns',
    ],
    recommendations: [
      'Deploy proactive outreach for at-risk accounts (12% flagged)',
      'Redesign onboarding flow with AI-guided milestones',
      'Implement automated health score alerts for CSM team',
    ],
    impact: '-18% projected churn reduction',
    impactValue: '+$890K annual retained revenue',
    opportunityScore: 85,
    radarData: [
      { metric: 'Retention', current: 62, potential: 90 },
      { metric: 'Satisfaction', current: 58, potential: 85 },
      { metric: 'Onboarding', current: 45, potential: 82 },
      { metric: 'Health', current: 55, potential: 88 },
      { metric: 'Expansion', current: 40, potential: 78 },
    ],
    pipelineData: [
      { stage: 'Onboarding', value: 45 },
      { stage: 'Adoption', value: 38 },
      { stage: 'Healthy', value: 124 },
      { stage: 'At Risk', value: 18 },
      { stage: 'Churned', value: 7 },
    ],
  },
];

export const ASK_CORY_RESPONSES: AskCoryResponse[] = [
  {
    keywords: ['cost', 'save', 'budget', 'roi', 'money', 'expense'],
    response:
      'Based on the analysis across all 6 departments, AI deployment could drive $3.2M+ in annual value through cost reduction, revenue growth, and efficiency gains. The highest-impact area is Operations, with $520K in projected annual savings from workflow automation alone.',
  },
  {
    keywords: ['risk', 'churn', 'retain', 'customer', 'satisfaction'],
    response:
      'The Customer Success analysis flagged 12% of accounts with early churn signals. Deploying proactive outreach and AI-guided onboarding could reduce churn by 18%, retaining an estimated $890K in annual revenue.',
  },
  {
    keywords: ['sales', 'pipeline', 'revenue', 'deal', 'conversion'],
    response:
      'Sales pipeline analysis shows deal cycles running 18 days longer than benchmarks. AI-powered lead scoring and automated follow-up sequences could increase conversion rates by 26%, adding $1.2M in annual revenue.',
  },
  {
    keywords: ['marketing', 'lead', 'campaign', 'content', 'engagement'],
    response:
      'Marketing intelligence shows LinkedIn campaigns outperforming email by 38%. Shifting ad spend and deploying an AI content calendar could increase lead generation by 32%, adding $240K to your annual pipeline.',
  },
  {
    keywords: ['operations', 'efficiency', 'process', 'automate', 'workflow'],
    response:
      'Operations analysis identified 340 hours/month consumed by manual approval workflows. Automating the top 5 workflows could save 280 hours/month and drive $520K in annual cost reduction.',
  },
  {
    keywords: ['strategy', 'compete', 'market', 'growth', 'plan'],
    response:
      'Strategic analysis identified three untapped market segments with $12M combined TAM. Competitor AI adoption is accelerating \u2014 prioritizing AI deployment in customer-facing operations would help close the gap within 6 months.',
  },
];

export const DEFAULT_CORY_RESPONSE =
  'Cory analyzes your entire organization \u2014 every department, every process, every opportunity. In the accelerator, you design an AI system like this for your own company. The demo above shows a fraction of what a deployed intelligence system surfaces.';

// --- Graph Data for ReactFlow ---

export interface GraphNode {
  id: string;
  label: string;
  icon: string;
  agents: number;
  color: string;
  bgLight?: string;
  position: { x: number; y: number };
  hasDepartmentData: boolean;
}

export interface GraphEdge {
  id: string;
  source: string;
  target: string;
}

export const GRAPH_NODES: GraphNode[] = [
  { id: 'strategy', label: 'Strategy', icon: '\u{1F3AF}', agents: 8, color: '#1a365d', bgLight: '#ebf8ff', position: { x: 300, y: 0 }, hasDepartmentData: true },
  { id: 'intelligence', label: 'Intelligence', icon: '\u{1F9E0}', agents: 22, color: '#4a5568', position: { x: 300, y: 120 }, hasDepartmentData: false },
  { id: 'marketing', label: 'Marketing', icon: '\u{1F4E3}', agents: 16, color: '#e53e3e', bgLight: '#fff5f5', position: { x: 80, y: 240 }, hasDepartmentData: true },
  { id: 'sales', label: 'Sales', icon: '\u{1F4BC}', agents: 14, color: '#805ad5', bgLight: '#faf5ff', position: { x: 300, y: 240 }, hasDepartmentData: true },
  { id: 'operations', label: 'Operations', icon: '\u2699\uFE0F', agents: 12, color: '#38a169', bgLight: '#f0fff4', position: { x: 520, y: 240 }, hasDepartmentData: true },
  { id: 'finance', label: 'Finance', icon: '\u{1F4B0}', agents: 10, color: '#d69e2e', bgLight: '#fffff0', position: { x: 140, y: 380 }, hasDepartmentData: true },
  { id: 'customer-success', label: 'Customer Success', icon: '\u{1F91D}', agents: 11, color: '#319795', bgLight: '#e6fffa', position: { x: 460, y: 380 }, hasDepartmentData: true },
  { id: 'platform', label: 'Platform', icon: '\u{1F5A5}\uFE0F', agents: 9, color: '#2b6cb0', position: { x: 0, y: 120 }, hasDepartmentData: false },
  { id: 'security', label: 'Security', icon: '\u{1F6E1}\uFE0F', agents: 7, color: '#c53030', position: { x: 600, y: 120 }, hasDepartmentData: false },
  { id: 'reporting', label: 'Reporting', icon: '\u{1F4CA}', agents: 5, color: '#718096', position: { x: 300, y: 480 }, hasDepartmentData: false },
];

export const GRAPH_EDGES: GraphEdge[] = [
  { id: 'e-strategy-intelligence', source: 'strategy', target: 'intelligence' },
  { id: 'e-intelligence-marketing', source: 'intelligence', target: 'marketing' },
  { id: 'e-intelligence-sales', source: 'intelligence', target: 'sales' },
  { id: 'e-intelligence-operations', source: 'intelligence', target: 'operations' },
  { id: 'e-marketing-sales', source: 'marketing', target: 'sales' },
  { id: 'e-operations-finance', source: 'operations', target: 'finance' },
  { id: 'e-sales-customer-success', source: 'sales', target: 'customer-success' },
  { id: 'e-platform-intelligence', source: 'platform', target: 'intelligence' },
  { id: 'e-security-operations', source: 'security', target: 'operations' },
  { id: 'e-finance-reporting', source: 'finance', target: 'reporting' },
  { id: 'e-customer-success-reporting', source: 'customer-success', target: 'reporting' },
];

// --- KPI Data ---

export interface DemoKpi {
  label: string;
  value: string;
  detail: string;
  color: string;
  trend?: number;
}

const DEPARTMENT_KPIS: Record<string, DemoKpi[]> = {
  strategy: [
    { label: 'Initiative Progress', value: '72%', detail: '18 of 25 on track', color: '#1a365d', trend: 8 },
    { label: 'Market Opportunity', value: '$12M', detail: 'combined TAM identified', color: '#38a169', trend: 15 },
    { label: 'Execution Velocity', value: '3.2x', detail: 'vs. industry avg', color: '#805ad5', trend: 12 },
    { label: 'Investment Efficiency', value: '4.1x', detail: 'ROI on AI spend', color: '#d69e2e', trend: 6 },
    { label: 'Risk Exposure', value: 'LOW', detail: '14/100', color: '#38a169', trend: -5 },
    { label: 'Innovation Index', value: '84', detail: '/100', color: '#e53e3e', trend: 11 },
  ],
  marketing: [
    { label: 'MQL Growth', value: '+38%', detail: 'vs. prior quarter', color: '#e53e3e', trend: 38 },
    { label: 'Acquisition Cost', value: '$112', detail: 'cost per lead', color: '#d69e2e', trend: -14 },
    { label: 'Campaign ROI', value: '4.8x', detail: 'avg. return', color: '#38a169', trend: 22 },
    { label: 'Conversion Rate', value: '6.2%', detail: 'lead to opp.', color: '#805ad5', trend: 12 },
    { label: 'Engagement Score', value: '82', detail: '/100', color: '#1a365d', trend: 9 },
    { label: 'Pipeline Value', value: '$2.4M', detail: 'contribution', color: '#319795', trend: 18 },
  ],
  operations: [
    { label: 'Cycle Time', value: '2.1d', detail: 'avg. process duration', color: '#38a169', trend: -24 },
    { label: 'Automation Rate', value: '62%', detail: 'processes automated', color: '#805ad5', trend: 18 },
    { label: 'SLA Compliance', value: '94.7%', detail: 'on-time delivery', color: '#1a365d', trend: 3 },
    { label: 'Efficiency Score', value: '87', detail: '/100', color: '#d69e2e', trend: 15 },
    { label: 'Resolution Time', value: '4.2h', detail: 'avg. incident', color: '#e53e3e', trend: -31 },
    { label: 'Cost Per Process', value: '$18', detail: 'down from $26', color: '#319795', trend: -30 },
  ],
  sales: [
    { label: 'Pipeline Coverage', value: '3.8x', detail: 'vs. target', color: '#805ad5', trend: 14 },
    { label: 'Win Rate', value: '28%', detail: 'qualified opps.', color: '#38a169', trend: 6 },
    { label: 'Avg Deal Size', value: '$47K', detail: 'per closed deal', color: '#1a365d', trend: 11 },
    { label: 'Sales Cycle', value: '42d', detail: 'avg. days to close', color: '#d69e2e', trend: -8 },
    { label: 'Forecast Accuracy', value: '81%', detail: 'within 10% band', color: '#e53e3e', trend: 9 },
    { label: 'Quota Attainment', value: '108%', detail: 'team average', color: '#319795', trend: 12 },
  ],
  finance: [
    { label: 'Revenue Growth', value: '+18%', detail: 'YoY', color: '#38a169', trend: 18 },
    { label: 'Gross Margin', value: '64.2%', detail: 'trailing 12mo', color: '#1a365d', trend: 3 },
    { label: 'OpEx Ratio', value: '31%', detail: 'of revenue', color: '#d69e2e', trend: -4 },
    { label: 'Cash Conversion', value: '38d', detail: 'cycle length', color: '#805ad5', trend: -12 },
    { label: 'Budget Variance', value: '+2.1%', detail: 'within tolerance', color: '#e53e3e', trend: -6 },
    { label: 'Forecast Accuracy', value: '88%', detail: 'quarterly', color: '#319795', trend: 7 },
  ],
  'customer-success': [
    { label: 'Health Score', value: '78', detail: '/100 avg.', color: '#319795', trend: 8 },
    { label: 'Retention Rate', value: '91.4%', detail: 'annual', color: '#38a169', trend: 4 },
    { label: 'Churn Rate', value: '3.2%', detail: 'monthly', color: '#e53e3e', trend: -18 },
    { label: 'Expansion Rev.', value: '+$420K', detail: 'upsell/cross-sell', color: '#805ad5', trend: 22 },
    { label: 'Resolution Time', value: '2.8h', detail: 'avg. support ticket', color: '#d69e2e', trend: -15 },
    { label: 'NPS', value: '62', detail: 'net promoter score', color: '#1a365d', trend: 11 },
  ],
};

export function getKpisForDepartment(deptId: string): DemoKpi[] {
  return DEPARTMENT_KPIS[deptId] || DEPARTMENT_KPIS.strategy;
}

// --- Executive Summary ---

export function getExecutiveSummary(deptId: string): string {
  const summaries: Record<string, string> = {
    strategy:
      'Strategic initiative tracking shows 72% of programs on track (18 of 25), with execution velocity at 3.2x the industry average. AI agents have identified $12M in combined TAM across 3 untapped market segments. Investment efficiency remains strong at 4.1x ROI on AI spend, while risk exposure holds at LOW (14/100) — the Innovation Index has climbed to 84, up 11% this period.',
    marketing:
      'Marketing intelligence is detecting strong momentum — MQL growth is up 38% vs. prior quarter while acquisition cost has dropped 14% to $112 per lead. Campaign ROI averages 4.8x across active channels, with a 6.2% lead-to-opportunity conversion rate driving $2.4M in pipeline contribution. AI agents are identifying high-engagement segments and recommending budget reallocation to top-performing campaigns.',
    operations:
      'Operational efficiency analysis shows average cycle time reduced to 2.1 days (down 24%) with 62% of processes now automated. SLA compliance is at 94.7% and the overall efficiency score has reached 87/100. AI agents flagged incident resolution time improvements — now averaging 4.2 hours — and cost per process has dropped 30% from $26 to $18, indicating strong automation ROI.',
    sales:
      'Sales intelligence reports pipeline coverage at 3.8x target with a 28% win rate on qualified opportunities. Average deal size holds at $47K with the sales cycle shortened to 42 days (down 8%). Forecast accuracy has improved to 81% within the 10% band, and team quota attainment is at 108%. AI models are identifying deal acceleration opportunities in mid-stage pipeline.',
    finance:
      'Financial intelligence shows revenue growing at 18% YoY with gross margin stable at 64.2%. Operating expenses are well-controlled at 31% of revenue (down 4%), and the cash conversion cycle has tightened to 38 days. Budget variance remains within tolerance at +2.1%, while quarterly forecast accuracy has reached 88% — AI agents are detecting cost optimization opportunities across 3 departments.',
    'customer-success':
      'Customer health monitoring shows an average health score of 78/100 (up 8%) with annual retention at 91.4%. Monthly churn has decreased 18% to 3.2%, and AI models are detecting early risk indicators across the portfolio. Expansion revenue reached +$420K through upsell and cross-sell, with support resolution time averaging 2.8 hours. NPS has climbed to 62, up 11 points this period.',
  };
  return summaries[deptId] || summaries.strategy;
}
