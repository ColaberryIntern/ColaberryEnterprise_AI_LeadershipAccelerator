/**
 * capabilityInventory — the eleven things a student is meant to have built, and
 * the single record of which of them exist.
 *
 * ## Why an inventory rather than a checklist per surface
 *
 * Two producers build these. The curriculum labs build most of them; the project
 * build builds the product's agents and the app itself. Before this, neither knew
 * what the other had done, so the only safe behaviours were "always rebuild" —
 * which destroys work — or "never build" — which strands the student.
 *
 * The inventory is the shared answer. Both producers ask it what exists, and
 * PRESENCE WINS: neither rebuilds what is already there. That rule is not new
 * here; it is `fileOwnership`'s `student` and `platform_unless_edited` classes
 * generalised from files to capabilities, and it exists for the same reason —
 * "the bot overwrote a student's file, he restored it by hand, and the bot
 * overwrote him again."
 *
 * ## Keyed on the ENROLLMENT, not the project
 *
 * Projects start in week 4 (`buildSchedule.DEFAULT_START_WEEK`). Weeks 1, 2 and 3
 * produce real work — a workspace, three skills, a workflow assistant — with no
 * project to hang it on. A project-scoped inventory would strand a quarter of the
 * programme, so the project is a LATE-BOUND ATTRIBUTE: entries are recorded
 * against the enrollment and adopt a project when one appears. Adoption is a
 * re-key, never a rebuild, which also means a student who switches projects keeps
 * everything they proved.
 *
 * The same reasoning already governs artifact sync, where artifacts are keyed to
 * the week rather than the project id precisely so late adoption costs nothing.
 *
 * ## The four shapes are not decoration
 *
 * A Command Center panel that renders "14 in the plan · 7 running" is showing a
 * COLLECTION. It cannot render a governance module, because there is only ever
 * one of those. Conflating them is how a panel ends up reporting "1 of 1
 * governance" as though it were progress. Each shape is counted and displayed
 * differently, so the shape is part of the contract rather than a UI detail.
 *
 * PURE. No I/O, no clock. The reader that resolves `present` against a real repo
 * tree lives above this.
 */

/**
 * `collection` — many items, grows all programme. Counted, with a floor.
 * `module`     — exactly one thing, present or not, with parts worth checking.
 * `service`    — must exist AND be shown running; a static tree cannot prove the
 *                second, so these carry a separate run-evidence path.
 * `package`    — a document set, scored on how much of it is there.
 * `composite`  — derived from the others. Never built directly.
 */
export type CapabilityShape = 'collection' | 'module' | 'service' | 'package' | 'composite';

/** Who is allowed to create this. `either` means whoever gets there first. */
export type CapabilityProducer = 'curriculum' | 'build' | 'either';

export interface CapabilityDef {
  /** Stable across both producers and the Delivery OS. The ONLY thing that must agree. */
  id: string;
  label: string;
  /**
   * Every week whose lab contributes to it. A list rather than a single week
   * because capabilities are not one-per-week: the MCP server is built in week 5
   * and extended in week 6, and it is ONE server the whole time. Splitting that
   * into two capabilities produced two entries pointing at the same evidence
   * path, which could never disagree on presence.
   */
  weeks: number[];
  shape: CapabilityShape;
  producer: CapabilityProducer;
  /** Repo paths whose presence is evidence. Empty for composites. */
  evidence: string[];
  /** Collections only: how many items before it counts as done. */
  minimum?: number;
  /** Services only: where the proof-of-running is committed. */
  runEvidence?: string;
}

/**
 * The eleven, taken from `weekBlueprints.ts` `github_deliverables` rather than
 * invented, so the inventory promises exactly what the curriculum promises.
 *
 * Ids are SCREAMING_SNAKE and permanent. Renaming one breaks the agreement with
 * the Delivery OS, which consumes these when a capability is promoted from
 * coursework to a client deliverable.
 */
export const CAPABILITIES: readonly CapabilityDef[] = [
  { id: 'WORKSPACE', label: 'Architect Workspace', weeks: [1], shape: 'module', producer: 'curriculum',
    evidence: ['CLAUDE.md'] },
  { id: 'SKILLS', label: 'Agent Skills', weeks: [2], shape: 'collection', producer: 'curriculum',
    evidence: ['.claude/skills/'], minimum: 3 },
  { id: 'WORKFLOW_ASSISTANT', label: 'Workflow Assistant', weeks: [3], shape: 'module', producer: 'curriculum',
    evidence: ['eval/', 'tools/'] },
  { id: 'PROMPT_LIBRARY', label: 'Prompt Library', weeks: [4], shape: 'collection', producer: 'curriculum',
    evidence: ['prompts/'], minimum: 3 },
  { id: 'MCP_SERVER', label: 'MCP Server', weeks: [5, 6], shape: 'service', producer: 'curriculum',
    evidence: ['mcp-server/'], runEvidence: 'artifacts/week-05/' },
  // The one capability BOTH producers can create: the student builds three by
  // hand in week 7, and the project build may generate the rest from the plan.
  // `.claude/agents/**` is student-owned in fileOwnership, so the build can add
  // but never replace.
  { id: 'AGENTS', label: 'Subagent Team', weeks: [7], shape: 'collection', producer: 'either',
    evidence: ['.claude/agents/'], minimum: 3 },
  { id: 'AUTOMATION', label: 'Automation Platform', weeks: [8], shape: 'module', producer: 'curriculum',
    evidence: ['.claude/commands/', '.github/workflows/'] },
  { id: 'RELIABILITY', label: 'Reliability Layer', weeks: [9], shape: 'module', producer: 'curriculum',
    evidence: ['reliability/'] },
  { id: 'GOVERNANCE', label: 'Governance Engine', weeks: [10], shape: 'module', producer: 'curriculum',
    evidence: ['governance/'] },
  { id: 'ARCHITECTURE', label: 'Architecture Package', weeks: [11], shape: 'package', producer: 'curriculum',
    evidence: ['architecture/'] },
  { id: 'CAPSTONE', label: 'Capstone', weeks: [12], shape: 'composite', producer: 'either', evidence: [] },
];

const BY_ID = new Map(CAPABILITIES.map((c) => [c.id, c]));

export function capabilityById(id: string): CapabilityDef | null {
  return BY_ID.get(id) ?? null;
}

/** One capability's recorded state for one student. */
export interface CapabilityEntry {
  id: string;
  present: boolean;
  /** Collections: how many were found. Other shapes: 0 or 1. */
  count: number;
  /** Services: has the run been evidenced, separately from the code existing? */
  proven?: boolean;
  /**
   * Built against the sample rather than the student's own project. Week 3
   * explicitly permits this. Carried so a portfolio can say so plainly rather
   * than implying work that was never done on a real system — the same
   * distinction the Capstone Record already draws with `built_on_sample`.
   */
  onSample?: boolean;
  /** Late-bound. Null until the student has a project, then adopted. */
  projectId?: string | null;
}

export interface Inventory {
  enrollmentId: string;
  entries: CapabilityEntry[];
}

/**
 * Merge freshly-observed state into what is stored. FIELD BY FIELD, never wholesale.
 *
 * ── PRESENCE IS A RATCHET ───────────────────────────────────────────────────
 *
 * Once a capability has been seen, it stays seen. A student who deletes a folder
 * while refactoring, or whose repo read fails, does not lose credit for work they
 * did — the same rule `markTaskVerifiedComplete` already follows, where
 * `verified_at` can only ever rewrite its own existing value and no path sets it
 * back to null. Counts climb and never fall for the same reason: a collection
 * that reads 2 today after reading 5 last week is far more likely to be a partial
 * read than three deletions.
 *
 * This is deliberately NOT a general-purpose merge. It is asymmetric on purpose,
 * and the asymmetry is the whole safety property.
 *
 * ── WHY NEW CATEGORIES ALWAYS LAND ──────────────────────────────────────────
 *
 * Entries absent from the stored copy are added. That is what makes the Command
 * Center upgradable forever: a twelfth capability added next year appears for
 * every existing student on their next sync, without touching anything they have
 * already earned. It is the reason this is `co_owned` and merged rather than
 * `platform_unless_edited` — under that class, one hand-edit would freeze a
 * student's inventory permanently.
 */
export function mergeInventory(stored: Inventory | null, observed: Inventory): Inventory {
  const byId = new Map<string, CapabilityEntry>();

  for (const entry of stored?.entries ?? []) byId.set(entry.id, { ...entry });

  for (const fresh of observed.entries) {
    const prior = byId.get(fresh.id);
    if (!prior) { byId.set(fresh.id, { ...fresh }); continue; }
    byId.set(fresh.id, {
      ...prior,
      present: prior.present || fresh.present,
      count: Math.max(prior.count ?? 0, fresh.count ?? 0),
      proven: prior.proven || fresh.proven || undefined,
      // A capability first built on the sample and later rebuilt on the real
      // project stops being a sample build. It never goes the other way.
      onSample: fresh.onSample === false ? false : (prior.onSample ?? fresh.onSample),
      // Late binding: adopt a project when one appears, never unset it.
      projectId: fresh.projectId ?? prior.projectId ?? null,
    });
  }

  // Stable order so a stored inventory is byte-comparable across syncs and does
  // not churn a version for having been re-serialised.
  const order = new Map(CAPABILITIES.map((c, i) => [c.id, i]));
  const entries = [...byId.values()].sort(
    (a, b) => (order.get(a.id) ?? 999) - (order.get(b.id) ?? 999) || a.id.localeCompare(b.id),
  );

  return { enrollmentId: observed.enrollmentId || stored?.enrollmentId || '', entries };
}

/**
 * Is this capability finished, by its own shape's rule?
 *
 * A collection needs its floor; a service needs the code AND the proof it ran.
 * `CAPSTONE` is composite and is never answered here — asking about it directly
 * returns false, because it is derived from the other ten rather than observed.
 */
export function isComplete(entry: CapabilityEntry): boolean {
  const def = capabilityById(entry.id);
  if (!def || def.shape === 'composite') return false;
  if (!entry.present) return false;
  if (def.shape === 'collection') return (entry.count ?? 0) >= (def.minimum ?? 1);
  if (def.shape === 'service') return entry.proven === true;
  return true;
}

/** The composite: how many of the ten observable capabilities are finished. */
export function capstoneProgress(inv: Inventory): { complete: number; total: number } {
  const observable = CAPABILITIES.filter((c) => c.shape !== 'composite');
  const byId2 = new Map(inv.entries.map((e) => [e.id, e]));
  const complete = observable.filter((c) => {
    const e = byId2.get(c.id);
    return e ? isComplete(e) : false;
  }).length;
  return { complete, total: observable.length };
}
