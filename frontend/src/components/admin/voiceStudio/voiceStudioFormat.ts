import type { Kpi, Provenance } from '../../../services/voiceStudioApi';

/** The words shown for a KPI with no data. Never "0": zero is a measurement, this is its absence. */
export const NO_DATA = 'No data';

export function formatKpiValue(k: Pick<Kpi, 'value' | 'unit'>): string {
  if (k.value === null || k.value === undefined || Number.isNaN(k.value)) return NO_DATA;
  switch (k.unit) {
    case 'percent': return `${k.value}%`;
    case 'ms': return `${Math.round(k.value).toLocaleString('en-US')} ms`;
    case 'usd_per_min': return `$${k.value.toFixed(4)} / min`;
    default: return k.value.toLocaleString('en-US');
  }
}

export const PROVENANCE_LABEL: Record<Provenance, string> = {
  observed: 'Observed',
  estimated: 'Estimated',
  simulated: 'Simulated',
};

export const PROVENANCE_HELP: Record<Provenance, string> = {
  observed: 'Measured from our own call records.',
  estimated: 'Computed from a published rate card, not a provider invoice.',
  simulated: 'Test-mode calls only. Not live traffic.',
};

export function denominatorText(k: Pick<Kpi, 'denominator'>): string | undefined {
  return k.denominator ? `of ${k.denominator.value.toLocaleString('en-US')} ${k.denominator.label}` : undefined;
}

export type DiffLine = { kind: 'same' | 'added' | 'removed'; text: string };

/** A line diff (longest common subsequence). Bounded: above 400 lines per side it compares whole texts. */
export function lineDiff(before: string, after: string): DiffLine[] {
  const a = before.split('\n');
  const b = after.split('\n');
  if (a.length > 400 || b.length > 400) {
    return before === after ? a.map((text) => ({ kind: 'same' as const, text })) : [...a.map((text) => ({ kind: 'removed' as const, text })), ...b.map((text) => ({ kind: 'added' as const, text }))];
  }
  const dp: number[][] = Array.from({ length: a.length + 1 }, () => new Array<number>(b.length + 1).fill(0));
  for (let i = a.length - 1; i >= 0; i--) for (let j = b.length - 1; j >= 0; j--) dp[i][j] = a[i] === b[j] ? dp[i + 1][j + 1] + 1 : Math.max(dp[i + 1][j], dp[i][j + 1]);
  const out: DiffLine[] = [];
  let i = 0;
  let j = 0;
  while (i < a.length && j < b.length) {
    if (a[i] === b[j]) { out.push({ kind: 'same', text: a[i] }); i++; j++; } else if (dp[i + 1][j] >= dp[i][j + 1]) { out.push({ kind: 'removed', text: a[i] }); i++; } else { out.push({ kind: 'added', text: b[j] }); j++; }
  }
  while (i < a.length) out.push({ kind: 'removed', text: a[i++] });
  while (j < b.length) out.push({ kind: 'added', text: b[j++] });
  return out;
}

export const ENGINE_LABEL: Record<string, string> = {
  conversation_relay: 'Engine A (Conversation Relay)',
  openai_realtime: 'Engine B (OpenAI Realtime)',
  synthflow_legacy: 'Synthflow (legacy)',
};
