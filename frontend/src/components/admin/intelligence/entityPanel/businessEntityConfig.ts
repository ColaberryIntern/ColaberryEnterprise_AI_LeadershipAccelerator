export interface CategoryConfig {
  label: string;
  color: string;
  bgLight: string;
}

export const BUSINESS_CATEGORIES: Record<string, CategoryConfig> = {
  campaigns:  { label: 'Campaigns',  color: '#2b6cb0', bgLight: '#ebf4ff' },
  leads:      { label: 'Leads',      color: '#1a365d', bgLight: '#e2e8f0' },
  students:   { label: 'Students',   color: '#38a169', bgLight: '#f0fff4' },
  cohorts:    { label: 'Cohorts',    color: '#805ad5', bgLight: '#faf5ff' },
  curriculum: { label: 'Curriculum', color: '#dd6b20', bgLight: '#fffaf0' },
  visitors:   { label: 'Visitors',   color: '#319795', bgLight: '#e6fffa' },
  agents:     { label: 'AI Agents',  color: '#e53e3e', bgLight: '#fff5f5' },
  system:     { label: 'System',     color: '#718096', bgLight: '#f7fafc' },
  other:      { label: 'Other',      color: '#a0aec0', bgLight: '#f7fafc' },
};

export function formatRowCount(count: number): string {
  if (count >= 1_000_000) return `${(count / 1_000_000).toFixed(1)}M`;
  if (count >= 1_000) return `${(count / 1_000).toFixed(1)}K`;
  return String(count);
}
