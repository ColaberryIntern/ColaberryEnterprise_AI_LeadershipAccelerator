/**
 * govBuildPlan — the DETERMINISTIC projection of a won proposal's established requirements into the Build track's
 * releases → stories → prompts. It is the gov analogue of responseSlots: a pure read-model over the SAME
 * `established` requirements the workspace already shows, so it is stable across refresh and fabricates nothing.
 *
 * THE RULE (spec §1, reused from Phase-1 T4): build stories appear "where relevant", NOT for every requirement.
 * Only a requirement that classifyRequirementTracks puts on the `solution_build` track becomes a story — an
 * ADMINISTRATIVE requirement (a pricing schedule, an execution-of-offer form, a SAM registration) is
 * proposal-only and MUST NOT generate an invented software feature. Each story CITES its requirement verbatim
 * and carries a stable id derived from the requirement id, so a regeneration preserves story identity.
 *
 * HONESTY RAIL: a story is `unassigned` and is never fabricated into an assigned/built/executed state — plan
 * review, assignment, the student prompt hand-in, and (disabled) execution are later steps. Pure + total.
 */
import { classifyRequirementTracks } from '../govDeliveryProject';

/**
 * A derived story is `unassigned`. The ONLY persisted transition the plan adds is `assigned` (an operator assigns a
 * story to a builder, P3-T2) — it is NEVER a fabricated built/done state. "Built" is proven by evidence + reviewer
 * verification (gov_build_story_evidence), which is a separate, gated surface, not a story-status flag.
 */
export type GovBuildStoryStatus = 'unassigned' | 'assigned';

export interface GovBuildStory {
  /** Stable id derived from the requirement id, so regeneration preserves identity (no renumber churn). */
  id: string;
  /** The established requirement this story builds — traceability back to the proposal/compliance spine. */
  requirementId: string;
  title: string;
  /** The requirement text verbatim — the citation; never paraphrased or invented. */
  statement: string;
  release: string;
  acceptance: string[];
  /** Derived as `unassigned`; a persisted assignment overlay (applyAssignmentsToStories) moves it to `assigned`. */
  status: GovBuildStoryStatus;
  /** Set ONLY when a persisted assignment overlays the derived story — never fabricated. */
  assigneeIdentityId?: string | null;
  /** When the assignment was made (ISO), or null. */
  assignedAt?: string | null;
  /** True ONLY for a reconciled story whose requirement left the established set but which still carries persisted
   *  assignment/evidence — surfaced (never dropped) so a revision cannot silently destroy completed work (P3-T4). */
  orphaned?: boolean;
}

/** Minimal structural shape of a persisted assignment — kept local so this pure module never imports the DB layer. */
export interface BuildAssignmentOverlay {
  storyId: string;
  canonicalReqId: string;
  assigneeIdentityId: string;
  assignedAt: string | null;
}

/** Minimal structural shape of a persisted evidence row — only the keys reconciliation needs. */
export interface BuildEvidenceRef {
  storyId: string;
  canonicalReqId: string;
}

export interface GovBuildRelease {
  key: string;
  name: string;
  storyIds: string[];
}

export interface GovBuildPlan {
  releases: GovBuildRelease[];
  stories: GovBuildStory[];
  buildStoryCount: number;
}

const truncate = (s: string, n: number): string => (s.length > n ? s.slice(0, n - 1).trimEnd() + '…' : s);

/**
 * Derive the Build-track plan from the established requirements. Only `solution_build`-classified requirements
 * become stories (admin/proposal-only ones never do); stories are de-duplicated by requirement id, in order.
 */
export function deriveGovBuildPlan(established: any[]): GovBuildPlan {
  const rows = Array.isArray(established) ? established : [];
  const stories: GovBuildStory[] = [];
  const seen = new Set<string>();
  for (const r of rows) {
    if (!r) continue;
    // Prefer the requirement's OWN stored tracks (reviewer-set, authoritative — e.g. a ContractRequirement row);
    // fall back to classifying its text only when no tracks are recorded (e.g. a freshly-established requirement).
    const tracks = Array.isArray(r.tracks) && r.tracks.length ? r.tracks.map((t: any) => String(t)) : classifyRequirementTracks(r);
    if (!tracks.includes('solution_build')) continue; // never a story for a non-build requirement
    const requirementId = String(r.id ?? r.canonicalReqId ?? '').trim();
    if (!requirementId || seen.has(requirementId)) continue;
    seen.add(requirementId);
    const statement = String(r.text ?? r.statement ?? '').trim();
    stories.push({
      id: `STORY-${requirementId}`,
      requirementId,
      title: truncate(statement, 80) || requirementId,
      statement,
      release: 'r0',
      acceptance: statement ? [`The solution demonstrably satisfies: ${truncate(statement, 240)}`] : [],
      status: 'unassigned',
    });
  }
  const releases: GovBuildRelease[] = stories.length
    ? [{ key: 'r0', name: 'Release 0 — initial build', storyIds: stories.map((s) => s.id) }]
    : [];
  return { releases, stories, buildStoryCount: stories.length };
}

/**
 * The student's Claude Code prompt for one build story — DETERMINISTIC and non-fabricating: it cites the
 * requirement verbatim, scopes the task to it, and asks for requirement-traced evidence. It references NO files
 * (there is no committed manifest here), so it can never point a student at code that does not exist.
 */
export function buildGovStoryPrompt(story: GovBuildStory): string {
  return [
    `# ${story.id}: ${story.title}`,
    '',
    '## The requirement (verbatim, from the solicitation)',
    story.statement || '(no requirement text captured — review the source before building)',
    '',
    '## Your task',
    'Build the part of the solution that satisfies the requirement above. Do NOT invent scope beyond it — an administrative or compliance item is not a software feature.',
    '',
    '## Acceptance',
    ...(story.acceptance.length ? story.acceptance.map((a) => `- ${a}`) : ['- Derive the acceptance from the requirement above and confirm it with your reviewer.']),
    '',
    '## Evidence to hand in',
    `A short description and screenshot(s) showing the requirement is met, traced back to ${story.requirementId}.`,
  ].join('\n');
}

/**
 * Overlay persisted assignments onto the derived stories — PURE. A story with a matching assignment becomes
 * `assigned` and carries its assignee; a story with none is explicitly `unassigned` with null assignee. The honesty
 * rail: `assigned` is set ONLY from a real persisted assignment — this function NEVER invents an assignee, and a
 * missing assignment always resets to `unassigned` (so a stale overlay can't leave a phantom assignee behind).
 */
export function applyAssignmentsToStories(stories: GovBuildStory[], assignments: BuildAssignmentOverlay[]): GovBuildStory[] {
  const byStory = new Map<string, BuildAssignmentOverlay>();
  for (const a of Array.isArray(assignments) ? assignments : []) if (a && a.storyId) byStory.set(a.storyId, a);
  return (Array.isArray(stories) ? stories : []).map((s) => {
    const a = byStory.get(s.id);
    return a
      ? { ...s, status: 'assigned' as const, assigneeIdentityId: a.assigneeIdentityId, assignedAt: a.assignedAt ?? null }
      : { ...s, status: 'unassigned' as const, assigneeIdentityId: null, assignedAt: null };
  });
}

export interface GovBuildPlanReconciliation {
  /** The derived stories with assignment overlaid (the live plan). */
  stories: GovBuildStory[];
  /** Stories whose requirement is no longer derived but that carry persisted assignment/evidence — preserved. */
  orphanedStories: GovBuildStory[];
}

/**
 * Revision-aware reconciliation (P3-T4). When requirements are revised, re-deriving the plan can drop a story (its
 * requirement was removed, or lost its build signal). If that story carries PERSISTED work — an assignment or
 * submitted evidence — dropping it silently would destroy a student's completed work and its traceability. So this
 * surfaces every persisted story id that no longer derives as an ORPHAN (flagged, assignee preserved), while the
 * evidence itself stays in its table keyed by (story_id, canonical_req_id). PURE: it reconciles already-loaded
 * arrays and touches no DB. The derived stories themselves are returned with assignment overlaid.
 */
export function reconcileGovBuildPlan(
  derivedStories: GovBuildStory[],
  assignments: BuildAssignmentOverlay[],
  evidence: BuildEvidenceRef[],
): GovBuildPlanReconciliation {
  const stories = applyAssignmentsToStories(derivedStories, assignments);
  const derivedIds = new Set(stories.map((s) => s.id));
  const assignByStory = new Map<string, BuildAssignmentOverlay>();
  for (const a of Array.isArray(assignments) ? assignments : []) if (a && a.storyId) assignByStory.set(a.storyId, a);

  // Every persisted story id (assignment OR evidence) that no longer derives is an orphan to preserve.
  const orphanReq = new Map<string, string>();
  const consider = (storyId: string, canonicalReqId: string) => {
    if (!storyId || derivedIds.has(storyId)) return;
    if (!orphanReq.has(storyId)) orphanReq.set(storyId, canonicalReqId || storyId.replace(/^STORY-/, ''));
  };
  for (const a of Array.isArray(assignments) ? assignments : []) if (a) consider(a.storyId, a.canonicalReqId);
  for (const e of Array.isArray(evidence) ? evidence : []) if (e) consider(e.storyId, e.canonicalReqId);

  const orphanedStories: GovBuildStory[] = [...orphanReq.keys()].map((id) => {
    const a = assignByStory.get(id);
    return {
      id,
      requirementId: orphanReq.get(id) as string,
      title: `${id} — requirement no longer in the established set`,
      statement: '',
      release: 'orphaned',
      acceptance: [],
      status: a ? ('assigned' as const) : ('unassigned' as const),
      assigneeIdentityId: a ? a.assigneeIdentityId : null,
      assignedAt: a ? (a.assignedAt ?? null) : null,
      orphaned: true,
    };
  });

  return { stories, orphanedStories };
}
