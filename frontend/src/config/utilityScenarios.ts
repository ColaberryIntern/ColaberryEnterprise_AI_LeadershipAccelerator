export interface UtilityScenario {
  id: string;
  title: string;
  icon: string;
  description: string;
  kpi: string;
  agentCount: number;
}

export const UTILITY_SCENARIOS: UtilityScenario[] = [
  {
    id: 'outage-prediction',
    title: 'Outage Prediction',
    icon: 'bi-lightning-charge',
    description: 'Predict transformer and equipment failures 48 hours before they happen using sensor data and weather patterns.',
    kpi: '92% fewer unplanned outages',
    agentCount: 3,
  },
  {
    id: 'storm-response',
    title: 'Storm Response',
    icon: 'bi-cloud-lightning-rain',
    description: 'Auto-notify members, triage inbound calls, and coordinate restoration crews during severe weather events.',
    kpi: '60% fewer inbound calls during storms',
    agentCount: 4,
  },
  {
    id: 'smart-metering',
    title: 'Smart Metering',
    icon: 'bi-speedometer2',
    description: 'Detect anomalies across 75,000+ meters in real-time — theft, malfunction, and usage pattern shifts.',
    kpi: '$180K annual revenue recovery',
    agentCount: 2,
  },
  {
    id: 'vegetation-mgmt',
    title: 'Vegetation Management',
    icon: 'bi-tree',
    description: 'AI-prioritized trimming schedules using satellite imagery, growth models, and outage correlation data.',
    kpi: '35% reduction in vegetation-caused outages',
    agentCount: 2,
  },
  {
    id: 'rate-case',
    title: 'Rate Case Automation',
    icon: 'bi-file-earmark-bar-graph',
    description: 'Generate regulatory filings, cost-of-service studies, and rate design analysis in hours instead of weeks.',
    kpi: '80% faster filing preparation',
    agentCount: 3,
  },
  {
    id: 'member-services',
    title: 'Member Services AI',
    icon: 'bi-headset',
    description: '24/7 billing inquiries, outage status, service requests, and new connection applications — no hold times.',
    kpi: '45% reduction in call center volume',
    agentCount: 3,
  },
  {
    id: 'fleet-dispatch',
    title: 'Fleet & Crew Dispatch',
    icon: 'bi-truck',
    description: 'Optimal crew routing, real-time job assignment, and automatic escalation for priority restoration work.',
    kpi: '28% faster storm restoration',
    agentCount: 3,
  },
  {
    id: 'regulatory-compliance',
    title: 'Regulatory Compliance',
    icon: 'bi-shield-check',
    description: 'Auto-generate NERC, FERC, and state PUC compliance reports from operational data. Continuous monitoring.',
    kpi: '90% less manual compliance work',
    agentCount: 2,
  },
];
