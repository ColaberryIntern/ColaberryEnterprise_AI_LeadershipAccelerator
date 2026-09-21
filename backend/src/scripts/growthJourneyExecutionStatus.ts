import { env } from '../config/env';
import type { ExplorerGrowthFlags } from '../config/explorerGrowthFlags';
import { isGrowthJourneyCapabilityEnabled, type GrowthJourneyFlags } from '../config/growthJourneyFlags';
import { Brand, GrowthJourneyExecution, GrowthJourneyExecutionControl, JourneyProgram } from '../models';
import { safeField } from '../services/growthJourney/handoffs/assigneeDigest';
import { EXECUTABLE_CHANNELS, resolveExecutionMode, type ExecutionChannel } from '../services/growthJourney/execution/resolveExecutionMode';
import { rolloutScopeKey, WILDCARD } from '../services/growthJourney/execution/scopeKey';

/**
 * Growth Journey OS — the execution status probe (Phase 5 T518). READ-ONLY.
 *
 * For every brand × programme × executable channel it prints:
 *
 *   mode      what `resolveExecutionMode` answers for the scope today, with its
 *             reason - the same function the planner asks, so this is what the
 *             next run will do, not a guess
 *   controls  every ACTIVE control row that covers the scope, listed whether or
 *             not the flags are on - a pause set while the master is off is
 *             visible here, which is the point: the switchboard is readable in
 *             the dark
 *   receipts  the execution receipts of the scope, counted by status
 *
 *   node dist/scripts/growthJourneyExecutionStatus.js            # every tenant
 *   node dist/scripts/growthJourneyExecutionStatus.js --json     # one JSON document
 *
 * It writes nothing: no model create, update or destroy is reachable from
 * here, and the test spies on all three. No address is printed - the reason
 * strings pass T517's `safeField` (an `@` -> `redacted`, bounded), and the rest
 * is ids, codes and counts. The imports stay clear of any module that loads a
 * model FILE: `reconcileExecutions` does, and constructing Sequelize at load is
 * what a probe must never do.
 */

export interface ProbeArgs {
  json: boolean;
}

export function parseArgs(argv: string[]): ProbeArgs {
  const out: ProbeArgs = { json: false };
  for (const a of argv) {
    if (a === '--json') out.json = true;
    else throw new Error(`unknown argument: ${a} (usage: growthJourneyExecutionStatus [--json])`);
  }
  return out;
}

export interface ScopeControl {
  id: string;
  kind: string;
  scope_key: string;
  mode: string;
  daily_limit: number | null;
  cohort_size: number | null;
  subject_ref: string | null;
  reason: string;
  set_by_admin_id: string | null;
  created_at: string;
}

export interface ScopeStatus {
  tenant_id: string;
  brand_id: string;
  brand_slug: string;
  program_id: string;
  program_slug: string;
  program_status: string;
  channel: ExecutionChannel;
  mode: string;
  mode_reason: string;
  controls: ScopeControl[];
  receipts: Record<string, number>;
}

export interface ProbeReport {
  as_of: string;
  flags: { master: boolean; decisions: boolean; execution: boolean; handoffs: boolean };
  scopes: ScopeStatus[];
}

type Row = { get(k: string): unknown };
const s = (row: Row, k: string): string => String(row.get(k));

/** Does an active control row cover this brand × programme × channel? A pause covers it when each named dimension matches. */
export function controlCovers(row: { kind: string; scope_key: string; brand_id: string | null; program_id: string | null; channel: string | null }, scope: { brand_id: string; program_id: string; channel: string }): boolean {
  if (row.kind === 'rollout') return row.scope_key === rolloutScopeKey({ brandId: scope.brand_id, programId: scope.program_id, channel: scope.channel });
  const dim = (named: string | null, actual: string) => named === null || named === WILDCARD || named === actual;
  return dim(row.brand_id, scope.brand_id) && dim(row.program_id, scope.program_id) && dim(row.channel, scope.channel);
}

export interface ProbeInputs {
  flags?: GrowthJourneyFlags;
  explorerFlags?: ExplorerGrowthFlags;
  asOf?: Date;
}

/** The whole picture, read in four bounded queries plus one mode resolution per scope. */
export async function buildReport(inputs: ProbeInputs = {}): Promise<ProbeReport> {
  const flags = inputs.flags ?? env.growthJourney;
  const explorerFlags = inputs.explorerFlags ?? env.explorerGrowth;
  const asOf = inputs.asOf ?? new Date();

  const programs = (await JourneyProgram.findAll({ attributes: ['id', 'tenant_id', 'brand_id', 'slug', 'status'], order: [['slug', 'ASC']] })) as unknown as Row[];
  const brandIds = [...new Set(programs.map((p) => s(p, 'brand_id')))];
  const brands = brandIds.length === 0 ? [] : ((await Brand.findAll({ where: { id: brandIds }, attributes: ['id', 'slug'] })) as unknown as Row[]);
  const brandSlug = new Map(brands.map((b) => [s(b, 'id'), s(b, 'slug')]));
  // Every active control, whatever the flags say: the switchboard is readable in the dark.
  const controls = (await GrowthJourneyExecutionControl.findAll({ where: { cleared_at: null }, order: [['created_at', 'ASC']] })) as unknown as Row[];
  const grouped = (await GrowthJourneyExecution.count({ group: ['tenant_id', 'brand_id', 'program_id', 'channel', 'status'] })) as unknown as Array<Record<string, unknown>>;
  const receiptKey = (t: string, b: string, p: string, c: string) => `${t}|${b}|${p}|${c}`;
  const receipts = new Map<string, Record<string, number>>();
  for (const g of grouped) {
    const key = receiptKey(String(g.tenant_id), String(g.brand_id), String(g.program_id), String(g.channel));
    const counts = receipts.get(key) ?? {};
    counts[String(g.status)] = (counts[String(g.status)] ?? 0) + Number(g.count);
    receipts.set(key, counts);
  }

  const scopes: ScopeStatus[] = [];
  for (const program of programs) {
    const scope = { tenant_id: s(program, 'tenant_id'), brand_id: s(program, 'brand_id'), program_id: s(program, 'id') };
    for (const channel of EXECUTABLE_CHANNELS) {
      const mode = await resolveExecutionMode({ tenantId: scope.tenant_id, brandId: scope.brand_id, programId: scope.program_id, channel, leadId: null, asOf, flags, explorerFlags });
      const covering = controls
        .filter((c) => s(c, 'tenant_id') === scope.tenant_id)
        .filter((c) => controlCovers({ kind: s(c, 'kind'), scope_key: s(c, 'scope_key'), brand_id: (c.get('brand_id') as string | null) ?? null, program_id: (c.get('program_id') as string | null) ?? null, channel: (c.get('channel') as string | null) ?? null }, { ...scope, channel }))
        .map((c): ScopeControl => ({
          id: s(c, 'id'), kind: s(c, 'kind'), scope_key: s(c, 'scope_key'), mode: s(c, 'mode'),
          daily_limit: (c.get('daily_limit') as number | null) ?? null,
          cohort_size: ((c.get('cohort_lead_ids') as number[] | null) ?? null)?.length ?? null,
          subject_ref: (c.get('subject_ref') as string | null) ?? null,
          reason: safeField(c.get('reason')).value,
          set_by_admin_id: (c.get('set_by_admin_id') as string | null) ?? null,
          created_at: new Date(c.get('created_at') as Date).toISOString(),
        }));
      scopes.push({
        ...scope,
        brand_slug: brandSlug.get(scope.brand_id) ?? 'unknown',
        program_slug: s(program, 'slug'),
        program_status: s(program, 'status'),
        channel,
        mode: mode.mode,
        mode_reason: mode.reason,
        controls: covering,
        receipts: receipts.get(receiptKey(scope.tenant_id, scope.brand_id, scope.program_id, channel)) ?? {},
      });
    }
  }
  return {
    as_of: asOf.toISOString(),
    // Effective, through the sanctioned reader: a capability is on only when the master is too.
    flags: {
      master: flags.growthJourneyEnabled,
      decisions: isGrowthJourneyCapabilityEnabled('journeyDecisions', flags),
      execution: isGrowthJourneyCapabilityEnabled('journeyExecution', flags),
      handoffs: isGrowthJourneyCapabilityEnabled('journeyHandoffs', flags),
    },
    scopes,
  };
}

/** One line per scope, one indented line per covering control - ids, codes and counts only. */
export function renderReport(report: ProbeReport): string[] {
  const f = report.flags;
  const out = [`growth journey execution status @ ${report.as_of} · master=${f.master} decisions=${f.decisions} execution=${f.execution} handoffs=${f.handoffs}`];
  if (report.scopes.length === 0) out.push('no journey programmes');
  for (const sc of report.scopes) {
    const receipts = Object.entries(sc.receipts).sort(([a], [b]) => a.localeCompare(b)).map(([k, v]) => `${k}=${v}`).join(' ') || 'none';
    out.push(`${sc.brand_slug}/${sc.program_slug} (${sc.program_status}) · ${sc.channel} · mode=${sc.mode} (${sc.mode_reason}) · receipts: ${receipts}`);
    for (const c of sc.controls) {
      const extra = [c.daily_limit !== null ? `daily_limit=${c.daily_limit}` : '', c.cohort_size !== null ? `cohort=${c.cohort_size}` : '', c.subject_ref ? `subject=${c.subject_ref}` : ''].filter(Boolean).join(' ');
      out.push(`    ${c.kind} ${c.scope_key} mode=${c.mode}${extra ? ` ${extra}` : ''} · ${c.id} · by ${c.set_by_admin_id ?? 'unknown'} @ ${c.created_at} · ${c.reason}`);
    }
  }
  return out;
}

export async function run(args: ProbeArgs, out: (line: string) => void = console.log): Promise<number> {
  const report = await buildReport();
  if (args.json) out(JSON.stringify(report, null, 2));
  else for (const line of renderReport(report)) out(line);
  return 0;
}

export async function main(argv: string[] = process.argv.slice(2)): Promise<number> {
  return run(parseArgs(argv));
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(err instanceof Error ? err.message : String(err));
      process.exit(1);
    });
}
