export interface IndustryDemo {
  scenario: string;
  label: string;
  icon: string;
  headline: string;
  description: string;
}

export const INDUSTRY_DEMOS: IndustryDemo[] = [
  {
    scenario: 'logistics',
    label: 'Logistics',
    icon: 'bi-truck',
    headline: 'See a Logistics AI Organization Get Built in Seconds',
    description: 'Route optimization, dispatch automation, and fleet operations for 200+ drivers.',
  },
  {
    scenario: 'healthcare',
    label: 'Healthcare',
    icon: 'bi-hospital',
    headline: 'See a Healthcare AI Organization Get Built in Seconds',
    description: 'Nurse credentialing, shift matching, and compliance automation.',
  },
  {
    scenario: 'saas',
    label: 'B2B SaaS',
    icon: 'bi-cloud',
    headline: 'See a SaaS AI Organization Get Built in Seconds',
    description: 'Lead scoring, churn prediction, and automated customer onboarding.',
  },
  {
    scenario: 'ecommerce',
    label: 'E-Commerce',
    icon: 'bi-cart3',
    headline: 'See an E-Commerce AI Organization Get Built in Seconds',
    description: 'Cart recovery, dynamic pricing, and inventory forecasting.',
  },
  {
    scenario: 'consulting',
    label: 'Consulting',
    icon: 'bi-briefcase',
    headline: 'See a Consulting AI Organization Get Built in Seconds',
    description: 'Proposal automation, resource planning, and utilization tracking.',
  },
];

/** Find demos matching an industry keyword */
export function getDemosForIndustry(industry: string): IndustryDemo[] {
  const lower = industry.toLowerCase();
  const map: Record<string, string[]> = {
    logistics: ['logistics', 'supply chain', 'transportation', 'shipping', 'manufacturing'],
    healthcare: ['healthcare', 'health', 'medical', 'hospital', 'clinical', 'life sciences'],
    saas: ['saas', 'software', 'technology', 'fintech', 'finance', 'banking'],
    ecommerce: ['ecommerce', 'e-commerce', 'retail', 'commerce', 'marketplace'],
    consulting: ['consulting', 'professional services', 'advisory', 'government', 'public sector'],
  };
  return INDUSTRY_DEMOS.filter(d =>
    map[d.scenario]?.some(kw => lower.includes(kw))
  );
}
