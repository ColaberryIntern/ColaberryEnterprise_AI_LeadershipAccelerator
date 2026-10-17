/**
 * portfolioTypes - the shape the public projection sends, declared once.
 *
 * SPLIT OUT OF `PortfolioBody.tsx`, which reached 538 lines against CLAUDE.md's 500-line
 * ceiling. The rule there is that the next change to an oversize file splits it before
 * adding code, and the verified-commit section is that next change.
 *
 * This mirrors `backend/src/services/career/careerPortfolioPublicProjection.ts`. Every
 * field here is one the backend actually emits; nothing is declared speculatively,
 * because an optional field that never arrives reads as a feature that is merely broken.
 */
import type { ExperienceItem, EducationItem } from './PortfolioHistory';

export interface Capability {
  name: string; count: number; proven?: boolean; on_sample?: boolean;
}

export interface RecordLink {
  slug: string; title: string; published_at: string | null;
  /** The case study covering the same work. Null means no link is offered. */
  case_study_slug?: string | null;
}

export interface ProjectItem {
  title: string; organization: string | null; industry: string | null;
  problem: string | null; automation_goal: string | null; stage: string | null;
  repo_url: string | null; demo_url: string | null;
  /** An image committed to the project's own PUBLIC repo. Null when there is none. */
  hero_image_url?: string | null;
  /** The published write-up about THIS project, at /p/:slug. Null when there is none. */
  record_slug?: string | null;
  /** The published case study about THIS project, at /stories/:slug. Preferred. */
  case_study_slug?: string | null;
}

export interface Repository { name: string; url: string }

export interface PortfolioStats {
  years_experience?: number | null;
  files_committed?: number | null;
  capabilities?: number | null;
  evidence_records?: number | null;
}

export interface FeaturedProject {
  name: string;
  repo_url: string | null;
  files: number | null;
  top_level_areas: number | null;
  capabilities: number | null;
  languages: number | null;
}

export interface Competency { domain: string; label: string; score: number }
export interface EvidenceSource { source_type: string; label: string; count: number }

/**
 * One story the build pipeline verified, and the commit that satisfied it.
 *
 * The learner's FAILURES are deliberately absent: the backend's `toPublicVerifiedCommit`
 * has no shape for `reasons`, `outstanding` or `rejected_claims`, which is the same
 * category as `readiness.blocking` this page already refuses to show a hiring manager.
 * There is nothing to guard against here because nothing private is ever sent.
 */
export interface VerifiedCommit {
  story_id: string;
  title: string | null;
  commit_sha_short: string;
  committed_at: string | null;
  criteria_passed: number | null;
  criteria_total: number | null;
  /** Always an https://github.com/ commit URL. The backend emits no row without one. */
  commit_url: string;
}

export interface Portfolio {
  identity: {
    full_name: string; headline: string | null; cohort_name: string | null;
    avatar_data_url: string | null; linkedin_url: string | null;
    email?: string | null; location?: string | null; github_url?: string | null;
  };
  about?: string[];
  stats?: PortfolioStats;
  featured?: FeaturedProject | null;
  competencies?: Competency[];
  competency_domain_count?: number;
  evidence_by_source?: EvidenceSource[];
  experience?: ExperienceItem[];
  education?: EducationItem[];
  capabilities: Capability[];
  projects: ProjectItem[];
  records: RecordLink[];
  repositories: Repository[];
  private_repository_count: number;
  /**
   * Optional because the three screens that render this component were written before
   * the field existed and a published page cached by an older backend will not carry it.
   * An absent list renders no section rather than an empty heading.
   */
  verified_commits?: VerifiedCommit[];
  generated_at: string;
}
