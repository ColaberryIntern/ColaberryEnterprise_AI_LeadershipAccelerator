export interface UtilityScenario {
  id: string;
  demoId: string;
  title: string;
  icon: string;
  description: string;
  kpi: string;
  agentCount: number;
}

export const UTILITY_SCENARIOS: UtilityScenario[] = [
  {
    id: 'fleet-dispatch',
    demoId: 'utility-fleet',
    title: 'Crew Productivity Engine',
    icon: 'bi-truck',
    description: 'Daily prioritized work plans, optimal routing, and real-time job assignment. Your crews cover 15% more line per week.',
    kpi: '15% more line covered per crew',
    agentCount: 9,
  },
  {
    id: 'vegetation-mgmt',
    demoId: 'utility-vegetation',
    title: 'Smart Vegetation Management',
    icon: 'bi-tree',
    description: 'Risk-based trimming instead of fixed cycles. AI targets where risk and cost justify it. Same budget, dramatically fewer outages.',
    kpi: '10-20% trimming cost reduction',
    agentCount: 9,
  },
  {
    id: 'outage-prediction',
    demoId: 'utility-outage',
    title: 'Outage Prediction',
    icon: 'bi-lightning-charge',
    description: 'Predict transformer and equipment failures 48 hours before they happen using sensor data and weather patterns.',
    kpi: '92% fewer unplanned outages',
    agentCount: 10,
  },
  {
    id: 'storm-response',
    demoId: 'utility-storm',
    title: 'Storm Response',
    icon: 'bi-cloud-lightning-rain',
    description: 'Auto-notify members, triage inbound calls, and coordinate restoration crews during severe weather events.',
    kpi: '60% fewer inbound calls during storms',
    agentCount: 10,
  },
  {
    id: 'smart-metering',
    demoId: 'utility-metering',
    title: 'Smart Metering',
    icon: 'bi-speedometer2',
    description: 'Detect anomalies across 75,000+ meters in real-time. Theft detection, malfunction alerts, and demand forecasting.',
    kpi: '$180K annual revenue recovery',
    agentCount: 9,
  },
  {
    id: 'member-services',
    demoId: 'utility-memberservices',
    title: 'Member Services AI',
    icon: 'bi-headset',
    description: '24/7 billing inquiries, outage status, service requests, and new connection applications. No hold times.',
    kpi: '45% reduction in call center volume',
    agentCount: 9,
  },
  {
    id: 'rate-case',
    demoId: 'utility-ratecase',
    title: 'Rate Case Automation',
    icon: 'bi-file-earmark-bar-graph',
    description: 'Generate regulatory filings, cost-of-service studies, and rate design analysis in hours instead of weeks.',
    kpi: '80% faster filing preparation',
    agentCount: 9,
  },
  {
    id: 'regulatory-compliance',
    demoId: 'utility-compliance',
    title: 'Regulatory Compliance',
    icon: 'bi-shield-check',
    description: 'Auto-generate NERC, FERC, and state PUC compliance reports from operational data. Continuous monitoring.',
    kpi: '90% less manual compliance work',
    agentCount: 9,
  },
];
