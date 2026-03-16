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
