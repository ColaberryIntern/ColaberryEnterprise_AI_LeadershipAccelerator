/**
 * Computes INPACT%/GOALS/25 for the Trust Command Center from the AI System Registry
 * (docs/ai-governance/ai-systems-registry.csv), instead of the two hardcoded literals that
 * previously lived in trustMetricsService. This is still a DESK ESTIMATE, not an official
 * score — the real number requires the cross-functional per-system scoring SOP in
 * TBI_COMPLIANCE_PROGRAM.md §4.1 (engineering + security + business owner, evidence-cited).
 * What this closes is a narrower gap: the estimate is now traceable to a per-system,
 * per-tier registry file instead of an unexplained pair of numbers.
 */
import fs from 'fs';
import path from 'path';
import { parse } from 'csv-parse/sync';

interface RegistryRow {
  System: string;
  Tier: string;
  'Provisional INPACT band': string;
  'Provisional GOALS': string;
}

export interface InpactGoalsEstimate {
  inpactEstimatePct: number;
  goalsEstimate: number; // /25
  tier1SystemCount: number;
  scoredSystemCount: number;
  registrySource: string;
}

// TBI_COMPLIANCE_PROGRAM.md §2.1 trust bands. A compound read like "Moderate/Low" takes the
// LOWER band per §4.1's scoring rule ("when torn between two scores, take the lower").
const INPACT_BAND_MIDPOINT_PCT: Record<string, number> = {
  'very low': 25,
  low: 41,
  moderate: 58,
  'adoption-ready': 61, // borrowed GOALS-band label used loosely in the registry for INPACT; treat as Moderate-to-Good boundary
  'good-ish': 70,
  'good trust': 75,
  'high trust': 90,
};

function estimateInpactPct(band: string): number | null {
  const parts = band.toLowerCase().split('/').map((p) => p.trim());
  const scores = parts.map((p) => INPACT_BAND_MIDPOINT_PCT[p]).filter((n): n is number => n !== undefined);
  if (scores.length === 0) return null;
  return Math.min(...scores); // take the lower, per §4.1
}

function parseGoals(raw: string): number | null {
  const match = raw.match(/(\d+(\.\d+)?)/);
  return match ? Number(match[1]) : null;
}

let cached: { mtimeMs: number; value: InpactGoalsEstimate } | null = null;

// __dirname's depth relative to the repo root differs between environments: locally, both
// backend/src/services/*.ts and backend/dist/services/*.js sit 3 levels under repo root. In
// the prod/dev Docker image (backend/Dockerfile), backend/dist is flattened to /app/dist while
// docs/ai-governance is copied to /app/docs/ai-governance — only 2 levels apart there. Trying
// both candidates, first-match-wins, is more robust than hardcoding one and re-breaking this
// every time the Docker layout or local build output shifts.
function resolveRegistryPath(): string {
  const candidates = [
    path.resolve(__dirname, '../../../docs/ai-governance/ai-systems-registry.csv'), // local (source or dist)
    path.resolve(__dirname, '../../docs/ai-governance/ai-systems-registry.csv'), // Docker image
  ];
  for (const p of candidates) {
    if (fs.existsSync(p)) return p;
  }
  return candidates[0]; // none found — fall through so the resulting ENOENT names a real path
}

/** Reads and averages the registry. Cached per file mtime — the registry changes only when someone edits it. */
export function getInpactGoalsEstimate(): InpactGoalsEstimate {
  const csvPath = resolveRegistryPath();
  const stat = fs.statSync(csvPath);
  if (cached && cached.mtimeMs === stat.mtimeMs) return cached.value;

  const raw = fs.readFileSync(csvPath, 'utf8');
  const rows: RegistryRow[] = parse(raw, { columns: true, skip_empty_lines: true, trim: true });

  let tier1SystemCount = 0;
  let scoredSystemCount = 0;
  let inpactSum = 0;
  let goalsSum = 0;

  for (const row of rows) {
    const tier = row.Tier?.trim();
    if (tier !== '1') continue; // the production gate (INPACT >= 86%, GOALS >= 21/25) is a Tier-1 bar specifically
    tier1SystemCount += 1;

    const inpact = estimateInpactPct(row['Provisional INPACT band'] ?? '');
    const goals = parseGoals(row['Provisional GOALS'] ?? '');
    if (inpact === null || goals === null) continue; // e.g. "Unassessed" rows
    scoredSystemCount += 1;
    inpactSum += inpact;
    goalsSum += goals;
  }

  const value: InpactGoalsEstimate = {
    inpactEstimatePct: scoredSystemCount ? Math.round(inpactSum / scoredSystemCount) : 0,
    goalsEstimate: scoredSystemCount ? Math.round(goalsSum / scoredSystemCount) : 0,
    tier1SystemCount,
    scoredSystemCount,
    registrySource: 'docs/ai-governance/ai-systems-registry.csv (desk estimate — pending §4.1 council scoring)',
  };
  cached = { mtimeMs: stat.mtimeMs, value };
  return value;
}
