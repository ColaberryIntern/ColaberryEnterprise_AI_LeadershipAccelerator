export interface DepartmentConfig {
  label: string;
  color: string;
  bgLight: string;
}

export const DEPARTMENT_CATEGORIES: Record<string, DepartmentConfig> = {
  intelligence:    { label: 'Intelligence',      color: '#1a365d', bgLight: '#ebf8ff' },
  operations:      { label: 'Operations',        color: '#2b6cb0', bgLight: '#ebf4ff' },
  growth:          { label: 'Growth',            color: '#38a169', bgLight: '#f0fff4' },
  marketing:       { label: 'Marketing',         color: '#e53e3e', bgLight: '#fff5f5' },
  finance:         { label: 'Finance',           color: '#d69e2e', bgLight: '#fffff0' },
  infrastructure:  { label: 'Infrastructure',    color: '#718096', bgLight: '#f7fafc' },
  education:       { label: 'Education',         color: '#805ad5', bgLight: '#faf5ff' },
  orchestration:   { label: 'Orchestration',     color: '#319795', bgLight: '#e6fffa' },
  admissions:      { label: 'Admissions',        color: '#2b6cb0', bgLight: '#ebf4ff' },
  alumni:          { label: 'Alumni',            color: '#38a169', bgLight: '#f0fff4' },
  executive:       { label: 'Executive Office',  color: '#1a365d', bgLight: '#ebf8ff' },
  governance:      { label: 'Governance',        color: '#744210', bgLight: '#fefcbf' },
  partnerships:    { label: 'Partnerships',      color: '#2c7a7b', bgLight: '#e6fffa' },
  platform:        { label: 'Platform',          color: '#4a5568', bgLight: '#edf2f7' },
  strategy:        { label: 'Strategy',          color: '#553c9a', bgLight: '#e9d8fd' },
  student_success: { label: 'Student Success',   color: '#276749', bgLight: '#c6f6d5' },
  security:        { label: 'Security',          color: '#c53030', bgLight: '#fff5f5' },
  reporting:       { label: 'Reporting',         color: '#6b46c1', bgLight: '#f3e8ff' },
};

export function formatScore(score: number): string {
  return `${Math.round(score)}`;
}

// 5-Layer organizational structure
export const LAYER_LABELS = ['Command', 'Strategy', 'Intelligence', 'Business', 'Delivery'];

export const DEPT_TIER: Record<string, number> = {
  executive: 0, governance: 0, security: 0,
  strategy: 1, finance: 1, reporting: 1,
  intelligence: 2, orchestration: 2, operations: 2,
  growth: 3, marketing: 3, admissions: 3, partnerships: 3,
  education: 4, student_success: 4, alumni: 4, platform: 4, infrastructure: 4,
};

// Reverse lookup: tier → set of department slugs
export const TIER_SLUGS: Record<number, Set<string>> = {};
Object.entries(DEPT_TIER).forEach(([slug, tier]) => {
  if (!TIER_SLUGS[tier]) TIER_SLUGS[tier] = new Set();
  TIER_SLUGS[tier].add(slug);
});

export function deptMatchesLayer(deptNameOrSlug: string, layer: number): boolean {
  const slugs = TIER_SLUGS[layer];
  if (!slugs) return false;
  const normalized = deptNameOrSlug.toLowerCase().replace(/\s+/g, '_');
  return slugs.has(normalized);
}
