/**
 * Cory Orchestrator — Unified Task Types
 *
 * Shared type definitions for the Cory Decision Engine.
 * All task sources (Build, Health, Improve, UI) normalize to CoryTask.
 */

export type TaskSource = 'build' | 'health' | 'improve' | 'ui';
export type TaskType = 'foundational' | 'fix' | 'enhancement' | 'experience';
export type SystemLayer = 'backend' | 'frontend' | 'agents_backend' | 'agents_frontend' | 'data' | 'observability';
export type ProjectMode = 'mvp' | 'production' | 'enterprise' | 'autonomous';

export interface CoryTask {
  id: string;
  title: string;
  description: string;
  source: TaskSource;
  type: TaskType;
  impact: number;       // 0-100
  urgency: number;      // 0-100
  confidence: number;   // 0-100
  blocking: boolean;
  blocked: boolean;
  block_reason?: string;
  dependencies: string[];
  system_layer: SystemLayer;
  mode_relevance: Record<ProjectMode, number>;
  color: string;
  prompt_target?: string;
  component_id?: string;
  priority?: number;    // computed by scoring engine
  decision_trace: DecisionTrace;
}

export interface DecisionTrace {
  reason: string;
  inputs: {
    coverage: number;
    readiness: number;
    quality: number;
    mode: string;
    layer_status: string;
  };
  confidence: number;
  scoring_breakdown?: {
    impact_score: number;
    urgency_score: number;
    confidence_score: number;
    blocking_bonus: number;
    mode_weight: number;
    total: number;
  };
}

export interface SystemState {
  backend_exists: boolean;
  backend_partial: boolean;
  frontend_exists: boolean;
  frontend_partial: boolean;
  agents_exist: boolean;
  has_models: boolean;
  coverage: number;
  readiness: number;
  quality_score: number;
  quality: {
    determinism: number;
    reliability: number;
    observability: number;
    ux_exposure: number;
    automation: number;
    production_readiness: number;
  };
  maturity_level: number;
  mode: ProjectMode;
  completed_steps: string[];
  has_frontend_route: boolean;
  has_ui_pages: boolean;
}
