// Freight Brokerage scenario card data for the /freight-ai landing page

export interface FreightScenario {
  demoId: string;
  emoji: string;
  title: string;
  description: string;
  metric: string;
  agents: number;
}

export const FREIGHT_SCENARIOS: FreightScenario[] = [
  {
    demoId: 'freight-billing',
    emoji: '\u{1F4CB}',
    title: 'Billing Engine',
    description: 'Validate rates against contracts, calculate accessorials from evidence, and lock charge packages same-day.',
    metric: '80% faster billing',
    agents: 8,
  },
  {
    demoId: 'freight-invoice',
    emoji: '\u{1F4E8}',
    title: 'Invoice Engine',
    description: 'Generate invoices with correct docs and formatting, track acceptance vs receipt, reconcile short-pays automatically.',
    metric: 'DSO from 45 to 30 days',
    agents: 7,
  },
  {
    demoId: 'freight-dispute',
    emoji: '\u26A0\uFE0F',
    title: 'Dispute Engine',
    description: 'Auto-assemble evidence binders in seconds, classify disputes by playbook, and prevent repeat disputes at the root cause.',
    metric: '70% faster resolution',
    agents: 8,
  },
  {
    demoId: 'freight-settlement',
    emoji: '\u{1F3E6}',
    title: 'Settlement Engine',
    description: 'Three-way match carrier invoices, detect fraud and double-brokering, manage quick pay, and execute payments with remittance.',
    metric: '90% auto-matched',
    agents: 9,
  },
];
