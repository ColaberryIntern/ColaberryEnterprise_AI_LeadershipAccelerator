/**
 * voice:grade (VS2.5), pure. Reads an evidence manifest for a live test run and scores it with
 * visible per-dimension math. The run passes only at 90 or more with no failed critical gate.
 *
 * The manifest holds REDACTED references only (masked call ids, timings, booleans, scores from the
 * human listener); it never holds a phone number, a transcript or audio. A missing artifact scores 0
 * on its dimension and is listed by name, so an empty manifest fails loudly instead of passing quietly.
 */
import { z } from 'zod';

export const ManifestSchema = z.object({
  runId: z.string().min(1),
  calls: z.array(z.object({
    script: z.string(),
    engine: z.enum(['conversation_relay', 'openai_realtime']),
    callSidMasked: z.string().regex(/^CA\*+[0-9a-f]{4}$/i).optional(),
    humanAnswered: z.boolean().optional(),
    disclosureHeard: z.boolean().optional(),
    interruptionHandled: z.boolean().optional(),
    toolUsedOnce: z.boolean().optional(),
    firstResponseMs: z.number().nonnegative().optional(),
    costUsd: z.number().nonnegative().optional(),
    listenerScore: z.number().min(0).max(10).optional(),
  }).strict()).default([]),
  preflightPassed: z.boolean().optional(),
  attemptsUsed: z.number().int().nonnegative().optional(),
  spendUsd: z.number().nonnegative().optional(),
}).strict();
export type Manifest = z.infer<typeof ManifestSchema>;

interface Dimension { key: string; weight: number; critical: boolean; score: (m: Manifest) => number | null; requires: string }

const allCalls = (m: Manifest, f: (c: Manifest['calls'][number]) => boolean | undefined): number | null => {
  if (m.calls.length === 0) return null;
  const vals = m.calls.map(f);
  if (vals.some((v) => v === undefined)) return null;
  return vals.every(Boolean) ? 1 : 0;
};

/** Weights sum to 100. Critical gates fail the run regardless of the total. */
export const DIMENSIONS: Dimension[] = [
  { key: 'preflight', weight: 10, critical: true, requires: 'preflightPassed', score: (m) => (m.preflightPassed === undefined ? null : m.preflightPassed ? 1 : 0) },
  { key: 'human_answered', weight: 10, critical: true, requires: 'calls[].humanAnswered', score: (m) => allCalls(m, (c) => c.humanAnswered) },
  { key: 'ai_disclosure', weight: 20, critical: true, requires: 'calls[].disclosureHeard', score: (m) => allCalls(m, (c) => c.disclosureHeard) },
  { key: 'interruption', weight: 15, critical: false, requires: 'calls[].interruptionHandled', score: (m) => allCalls(m, (c) => c.interruptionHandled) },
  { key: 'tool_once', weight: 10, critical: false, requires: 'calls[].toolUsedOnce', score: (m) => allCalls(m, (c) => c.toolUsedOnce) },
  { key: 'latency', weight: 10, critical: false, requires: 'calls[].firstResponseMs',
    score: (m) => (m.calls.length && m.calls.every((c) => c.firstResponseMs !== undefined) ? (m.calls.every((c) => (c.firstResponseMs as number) <= 1500) ? 1 : 0.5) : null) },
  { key: 'listener_quality', weight: 15, critical: false, requires: 'calls[].listenerScore',
    score: (m) => (m.calls.length && m.calls.every((c) => c.listenerScore !== undefined) ? m.calls.reduce((s, c) => s + (c.listenerScore as number), 0) / (10 * m.calls.length) : null) },
  { key: 'limits_respected', weight: 10, critical: true, requires: 'attemptsUsed + spendUsd',
    score: (m) => (m.attemptsUsed === undefined || m.spendUsd === undefined ? null : m.attemptsUsed <= 3 && m.spendUsd <= 5 ? 1 : 0) },
];

export interface GradeReport {
  runId: string | null;
  total: number;
  passed: boolean;
  rows: Array<{ key: string; weight: number; fraction: number; points: number; critical: boolean; missing: boolean }>;
  failedGates: string[];
  missing: string[];
  invalid: string[];
}

export function gradeManifest(input: unknown): GradeReport {
  const parsed = ManifestSchema.safeParse(input ?? {});
  if (!parsed.success) {
    return { runId: null, total: 0, passed: false, rows: [], failedGates: ['manifest_invalid'], missing: DIMENSIONS.map((d) => d.requires),
      invalid: parsed.error.issues.map((i) => `${i.path.join('.') || '(root)'}: ${i.message}`) };
  }
  const m = parsed.data;
  const rows = DIMENSIONS.map((d) => {
    const s = d.score(m);
    const fraction = s === null ? 0 : s;
    return { key: d.key, weight: d.weight, fraction, points: Number((d.weight * fraction).toFixed(2)), critical: d.critical, missing: s === null };
  });
  const total = Number(rows.reduce((t, r) => t + r.points, 0).toFixed(2));
  const failedGates = rows.filter((r) => r.critical && r.fraction < 1).map((r) => r.key);
  const missing = DIMENSIONS.filter((_, i) => rows[i].missing).map((d) => d.requires);
  return { runId: m.runId, total, passed: total >= 90 && failedGates.length === 0, rows, failedGates, missing, invalid: [] };
}

export function gradeMarkdown(r: GradeReport): string {
  const lines = [`# Voice test grade: ${r.runId ?? '(invalid manifest)'}`, '', `**Total: ${r.total} / 100 -> ${r.passed ? 'PASS' : 'FAIL'}** (pass = 90+ and no failed critical gate)`, '',
    '| Dimension | Weight | Fraction | Points | Critical |', '|---|---|---|---|---|',
    ...r.rows.map((x) => `| ${x.key}${x.missing ? ' (missing)' : ''} | ${x.weight} | ${x.fraction} | ${x.points} | ${x.critical ? 'yes' : 'no'} |`), ''];
  if (r.failedGates.length) lines.push(`Failed critical gates: ${r.failedGates.join(', ')}`);
  if (r.missing.length) lines.push(`Missing artifacts: ${r.missing.join(', ')}`);
  if (r.invalid.length) lines.push(`Invalid manifest: ${r.invalid.join('; ')}`);
  return lines.join('\n') + '\n';
}
