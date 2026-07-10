/**
 * Curriculum Composer — shared types. A generated curriculum is an ordered list
 * of PlanCards; each is a not-yet-published instance of a real Experience Studio
 * component type (registry slug). The engines (dependency/validation/evidence/
 * DNA/journey/optimization) all operate on PlanCard[] + the type registry.
 */

export type Difficulty = 'intro' | 'core' | 'stretch';

export interface PlanCard {
  type: string;                 // registry slug — the reusable component type
  title: string;
  subtitle?: string | null;
  description?: string | null;
  bucket: string;
  week: number | null;
  difficulty: Difficulty;
  estimated_time: number;       // minutes
  points: { learning: number; builder: number; community: number };
  competencies: string[];
  rationale?: string | null;    // why this card moves the student toward Architect
  video_url?: string | null;
}

export type ComposerScope =
  | 'lesson' | 'session' | 'day' | 'week' | 'sprint' | 'month'
  | 'certification_module' | 'internship' | 'program';

export interface CurriculumPlan {
  scope: ComposerScope;
  week: number | null;
  summary?: string | null;
  cards: PlanCard[];
}
