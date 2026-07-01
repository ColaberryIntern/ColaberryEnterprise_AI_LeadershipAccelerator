// Pure helpers for ingesting a Story-Driven Build engine plan (deep_plan.json)
// into the Accelerator student platform. NO DB / I/O imports here so the logic
// is unit-testable in isolation (CLAUDE.md: pure logic tested without I/O).
// See docs/student-platform-sync/01-adapter-contract.md.

export interface DeepPlanReq {
  id: string;
  priority?: string;
  statement: string;
  acceptance?: string[];
  cluster?: string;
}

export interface DeepPlanStory {
  id: string;
  title: string;
  fulfills?: string[];
  owner_agent?: string;
  narrative?: string;
  acceptance?: any[];
  build?: string;
  vibe?: string;
  trust?: string;
  release?: string;
}

export interface DeepPlanRelease {
  key: string;
  name?: string;
  goal?: string;
  demo?: string;
  stories?: string[];
  weeks?: number[];
}

export interface DeepPlan {
  project?: string;
  reqs?: DeepPlanReq[];
  stories?: DeepPlanStory[];
  releases?: DeepPlanRelease[];
  trace?: { ok?: boolean; [k: string]: any };
}

export type TaskExecutionMode = 'human' | 'ai_with_approval' | 'ai_autonomous';
export type RequirementState = 'unmapped' | 'planned' | 'built' | 'verified';

// Human-only acts (decisions, approvals, outward commitments) route to a human;
// everything else defaults to AI-with-approval (student supervises AI per task).
// Mirrors the outward-facing classifier bias: when in doubt, keep it buildable by AI.
const HUMAN_RE =
  /\b(decide|decision|approve|approval|sign[- ]?off|present|pitch|negotiate|hire|budget|contract|legal|stakeholder|meeting|demo to|review with)\b/i;

export function deriveExecutionMode(story: DeepPlanStory): TaskExecutionMode {
  const text = `${story.title || ''} ${story.build || ''} ${story.narrative || ''}`;
  return HUMAN_RE.test(text) ? 'human' : 'ai_with_approval';
}

// Set of REQ ids that at least one story fulfills.
export function fulfilledReqIds(stories: DeepPlanStory[]): Set<string> {
  const s = new Set<string>();
  for (const st of stories || []) for (const r of st.fulfills || []) s.add(r);
  return s;
}

// Seed the 4-state on ingest: fulfilled by >=1 story -> planned, else unmapped.
// (built / verified are reached later by the write-back loop, not at ingest.)
export function reqState(reqId: string, fulfilled: Set<string>): RequirementState {
  return fulfilled.has(reqId) ? 'planned' : 'unmapped';
}
