export interface AIXceleratorScenario {
  demoId: string;
  emoji: string;
  title: string;
  description: string;
  metric: string;
  agents: number;
}

export const AIXCELERATOR_SCENARIOS: AIXceleratorScenario[] = [
  {
    demoId: 'aixcel-eos-blueprint',
    emoji: '\u{1F4CB}',
    title: 'EOS Blueprint Delivery',
    description: 'Watch an EOS Implementer refer a client, receive a Business Blueprint in 2 weeks, and earn $1,750.',
    metric: '$1,750 per delivery',
    agents: 8,
  },
  {
    demoId: 'aixcel-vistage-group',
    emoji: '\u{1F465}',
    title: 'Vistage Group Session',
    description: 'Watch a Vistage Chair earn $10,500 from one group session by converting 6 members to Blueprints.',
    metric: '$10,500 per session',
    agents: 8,
  },
  {
    demoId: 'aixcel-acceleration-upsell',
    emoji: '\u{1F680}',
    title: 'Blueprint to Acceleration',
    description: 'Watch a Blueprint turn into running AI agents with recurring monthly coach income.',
    metric: '$500/mo recurring',
    agents: 8,
  },
];
