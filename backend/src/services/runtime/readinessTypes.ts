/**
 * Learning Runtime Intelligence — shared signals + readiness types. The Runtime
 * consumes the existing progression (competencies + XP) and the student's
 * accumulated evidence, and turns them into Employment + Certification readiness.
 */

export interface StudentSignals {
  competencies: Array<{ domain_id: string; confidence: number; evidence_count: number }>;
  github: { commits: number; prs: number; repos: number };
  portfolio: { entries: number; artifacts: number };
  xp: { learning: number; builder: number; community: number };
}

export interface SkillScore { key: string; label: string; score: number }
export interface EmploymentReadiness {
  skills: SkillScore[];
  overall: number;               // 0..100
  band: 'emerging' | 'developing' | 'competitive' | 'market-ready';
  employer_gaps: Array<{ skill: string; need: string }>;
}

export interface CertDomain { domain: string; confidence: number; band: 'weak' | 'developing' | 'strong' }
export interface CertificationReadiness {
  domains: CertDomain[];
  strong: string[];
  weak: string[];
  confidence: number;            // 0..1 overall
  pass_probability: number;      // 0..1
  next_activities: string[];     // recommended component types for weak domains
}
