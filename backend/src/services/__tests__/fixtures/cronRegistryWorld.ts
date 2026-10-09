/**
 * cronRegistryWorld — the IO shell. Walks backend/src, reads every source file off disk and
 * hands the pure parser and the pure ratchet everything they need.
 *
 * `readCronRegistryWorld()` holds no cache and no module-scope state: every call re-walks
 * the tree and re-reads every file. That is deliberate — it is what lets the replay test
 * prove idempotency against the *filesystem* (CRLF, encoding, readdir ordering) rather than
 * only re-calling a pure function over arrays that were parsed once at import.
 */
import * as fs from 'fs';
import * as path from 'path';
import { GROWTH_JOURNEY_AGENT_ENTRIES } from '../../agentRegistry/growthJourneyAgents';
import {
  CronSites,
  RegistryRow,
  SeedRow,
  parseIntelSourceSlugs,
  parseRegistryRows,
  parseSeedRows,
  resolveNameConstants,
  scanCronSites,
  scanSource,
  sliceArrayLiteral,
} from './cronRegistrySourceParser';
import { Reconciliation, reconcile } from './cronRegistryRatchet';

export interface CronRegistryWorld {
  scheduleRows: RegistryRow[];
  dynamicRows: RegistryRow[];
  registryRows: RegistryRow[];
  parsedSeedRows: SeedRow[];
  parsedGrowthRows: SeedRow[];
  importedGrowthRows: SeedRow[];
  seedRows: SeedRow[];
  cronSites: CronSites;
  resolvedConstants: Map<string, string>;
  /** Slugs of the intel source adapters the barrel actually registers. */
  intelSourceSlugs: string[];
  /** Concrete names a template-literal cron site can fire, e.g. `Intel_build_breakdown`. */
  expandedPrefixNames: string[];
  /** Template prefixes with no expansion rule — they resolve to NOTHING, never to a wildcard. */
  unexpandedNamePrefixes: string[];
  /** Every name a timer can actually fire, fully resolved. No prefix matching downstream. */
  registeredNames: string[];
  sourceFiles: string[];
  /** Files whose comment/string scan did not end in the base code context. A desync there
   *  can move an occurrence between live code and prose, so the suite fails by file name
   *  rather than trusting a scan that lost its place. Measured empty over all of
   *  backend/src, which is what makes the assertion a real line and not a wish. */
  unbalancedSourceFiles: string[];
  /** The four array literals, kept so the parse can be counted a second, independent way. */
  arrayLiterals: { schedule: string; dynamic: string; seed: string; growth: string };
  observed: Reconciliation;
}

const SRC_ROOT = path.resolve(__dirname, '..', '..', '..');
const SCHEDULER_FILE = path.join(SRC_ROOT, 'services', 'aiOpsScheduler.ts');
const SEED_FILE = path.join(SRC_ROOT, 'services', 'agentRegistrySeed.ts');
const GROWTH_FILE = path.join(SRC_ROOT, 'services', 'agentRegistry', 'growthJourneyAgents.ts');
const INTEL_SOURCES_DIR = path.join(SRC_ROOT, 'services', 'intel', 'sources');

/** Template-literal cron sites, each mapped to the real data it interpolates. A prefix with
 *  no entry here expands to nothing, so its seed rows stay visible to invariant (i). */
const PREFIX_EXPANSIONS: Record<string, (w: { intelSourceSlugs: string[] }) => string[]> = {
  Intel_: (w) => w.intelSourceSlugs.map((slug) => `Intel_${slug}`),
};

/** The prefixes PREFIX_EXPANSIONS can resolve, exported so a test can assert that the set
 *  of prefixes found in source has not outgrown the set this module knows how to expand. */
export const EXPANDABLE_NAME_PREFIXES: ReadonlyArray<string> = Object.keys(PREFIX_EXPANSIONS).sort();

function listSourceFiles(dir: string, out: string[] = []): string[] {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== 'node_modules' && entry.name !== '__tests__') listSourceFiles(full, out);
    } else if (/\.(ts|js)$/.test(entry.name) && !/\.test\./.test(entry.name) && !/-Ali-AI\.ts$/.test(entry.name)) {
      out.push(full);
    }
  }
  return out;
}

export function readCronRegistryWorld(): CronRegistryWorld {
  // Every file is read through the one scanner, and the files whose scan did not end balanced
  // are collected rather than discarded: that is the self-check on the stripper itself. The
  // collector is a local, so this function still holds no module-scope state between calls —
  // which is what lets the replay test compare two independent full reads.
  const unbalanced: string[] = [];
  const read = (file: string) => {
    const scanned = scanSource(fs.readFileSync(file, 'utf8'));
    if (!scanned.balanced && !unbalanced.includes(file)) unbalanced.push(file);
    return scanned.text;
  };

  const schedulerSrc = read(SCHEDULER_FILE);
  const arrayLiterals = {
    schedule: sliceArrayLiteral(schedulerSrc, 'export const SCHEDULE_REGISTRY: ScheduleEntry[] ='),
    dynamic: sliceArrayLiteral(schedulerSrc, 'const DYNAMIC_SCHEDULE_REGISTRY: DynamicScheduleEntry[] ='),
    seed: sliceArrayLiteral(read(SEED_FILE), 'const AGENT_REGISTRY: AgentSeedEntry[] ='),
    growth: sliceArrayLiteral(read(GROWTH_FILE), 'export const GROWTH_JOURNEY_AGENT_ENTRIES: AgentSeedEntry[] ='),
  };
  const scheduleRows = parseRegistryRows(arrayLiterals.schedule, 'SCHEDULE_REGISTRY');
  const dynamicRows = parseRegistryRows(arrayLiterals.dynamic, 'DYNAMIC_SCHEDULE_REGISTRY');
  const registryRows = [...scheduleRows, ...dynamicRows];

  const parsedSeedRows = parseSeedRows(arrayLiterals.seed);
  const parsedGrowthRows = parseSeedRows(arrayLiterals.growth);
  // The spread at agentRegistrySeed.ts:2824 puts GROWTH_JOURNEY_AGENT_ENTRIES in
  // AGENT_REGISTRY. Those rows come from the real imported array, not the parse; the parse
  // of the same file is kept as the parser's strongest positive control.
  const importedGrowthRows: SeedRow[] = GROWTH_JOURNEY_AGENT_ENTRIES.map((e) => ({
    agentName: e.agent_name,
    triggerType: e.trigger_type,
    schedule: e.schedule,
  }));
  const seedRows = [...parsedSeedRows, ...importedGrowthRows];

  const sourceFiles = listSourceFiles(SRC_ROOT);
  const sources = sourceFiles.map((file) => ({ file, text: read(file) }));
  const cronSites = scanCronSites(sources);
  const identifierArgs = cronSites.dynamicArgForms.filter((a) => /^[A-Z][A-Z0-9_]*$/.test(a));
  const resolvedConstants = resolveNameConstants(identifierArgs, sources);

  const intelSourceSlugs = parseIntelSourceSlugs(read(path.join(INTEL_SOURCES_DIR, 'index.ts')), (base) =>
    read(path.join(INTEL_SOURCES_DIR, `${base}.ts`)),
  );
  const expandedPrefixNames: string[] = [];
  const unexpandedNamePrefixes: string[] = [];
  for (const prefix of cronSites.namePrefixes) {
    const expand = PREFIX_EXPANSIONS[prefix];
    if (expand) expandedPrefixNames.push(...expand({ intelSourceSlugs }));
    else unexpandedNamePrefixes.push(prefix);
  }

  const registeredNames = [
    ...new Set([
      ...registryRows.map((r) => r.agentName),
      ...cronSites.exactNames,
      ...resolvedConstants.values(),
      ...expandedPrefixNames,
    ]),
  ].sort();

  return {
    scheduleRows,
    dynamicRows,
    registryRows,
    parsedSeedRows,
    parsedGrowthRows,
    importedGrowthRows,
    seedRows,
    cronSites,
    resolvedConstants,
    intelSourceSlugs,
    expandedPrefixNames: [...new Set(expandedPrefixNames)].sort(),
    unexpandedNamePrefixes,
    registeredNames,
    sourceFiles,
    unbalancedSourceFiles: [...unbalanced].sort(),
    arrayLiterals,
    observed: reconcile(seedRows, registryRows, registeredNames),
  };
}
