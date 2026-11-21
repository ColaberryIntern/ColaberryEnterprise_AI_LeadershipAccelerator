/**
 * commandCenterTabContext — what every Command Center tab section reads, and the
 * two line helpers they share. Split out of commandCenterTabs.ts (past the
 * 500-line ceiling) so tab sections can live in their own files. PURE.
 */
import type { BuildPlan } from './planContract';
import type { Schedule } from './buildSchedule';
import type { guardrails as guardrailsOf, measures as measuresOf } from './planDocument';
import type { handoffsFor, artifactsFor } from './planDocumentInsights';

export const bullet = (s: string): string => `- ${s}`;
export const fmt = (d: Date | null | undefined): string | null => (d ? d.toISOString().slice(0, 10) : null);

/** How an autonomy level reads on a card, in the student's language. */
export const AUTONOMY_LABEL: Record<string, string> = {
  suggests: 'drafts for a person',
  acts_with_approval: 'prepares, then waits for a human to release it',
  acts_autonomously: 'completes on its own',
};

/** The heading a reader scans for. Every tab section below begins with one. */
export const good = (text: string): string => `**What good looks like:** ${text}`;

/** Everything the tab sections read, computed once per prompt. */
export interface TabContext {
  plan: BuildPlan;
  schedule: Schedule | null | undefined;
  kpis: ReturnType<typeof measuresOf>;
  safes: ReturnType<typeof guardrailsOf>;
  systems: string[];
  roles: string[];
  /** Every role, uncapped: what `plan.derived` matches approvers against. */
  allRoles: string[];
  agents: NonNullable<BuildPlan['agents']>;
  handoffs: ReturnType<typeof handoffsFor>;
  artifacts: ReturnType<typeof artifactsFor>;
  releases: BuildPlan['releases'];
  dueBy: Map<string, Date>;
}
