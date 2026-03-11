export interface DepartmentConfig {
  label: string;
  color: string;
  bgLight: string;
}

export const DEPARTMENT_CATEGORIES: Record<string, DepartmentConfig> = {
  intelligence:    { label: 'Intelligence',    color: '#1a365d', bgLight: '#ebf8ff' },
  operations:      { label: 'Operations',      color: '#2b6cb0', bgLight: '#ebf4ff' },
  growth:          { label: 'Growth',          color: '#38a169', bgLight: '#f0fff4' },
  marketing:       { label: 'Marketing',       color: '#e53e3e', bgLight: '#fff5f5' },
  finance:         { label: 'Finance',         color: '#d69e2e', bgLight: '#fffff0' },
  infrastructure:  { label: 'Infrastructure',  color: '#718096', bgLight: '#f7fafc' },
  education:       { label: 'Education',       color: '#805ad5', bgLight: '#faf5ff' },
  orchestration:   { label: 'Orchestration',   color: '#319795', bgLight: '#e6fffa' },
};

export function formatScore(score: number): string {
  return `${Math.round(score)}`;
}
