/**
 * Content rules for the recap (WL1, assumption A4): the minimal subset Phase 1 needs, replaced by the
 * shared contentLint in WL2.3. Pure; returns every violation instead of stopping at the first, so the
 * admin panel can show them all at once.
 *
 *  - Never say a price is zero (Texas Workforce Commission exposure, Ali's standing rule): free, $0,
 *    no cost, no charge, zero cost. "Free" inside an unrelated word (freedom) is fine.
 *  - Nothing that implies a partnership with Anthropic.
 *  - No em or en dashes (house style).
 */
export interface LintViolation { field: string; rule: 'zero_price' | 'partnership' | 'dash'; match: string }

const ZERO_PRICE = /\b(free|no[\s-]cost|no[\s-]charge|zero[\s-]cost)\b|\$\s?0(?![\d.,])/i;
const PARTNERSHIP = /\b(anthropic|claude)\s+(partner|partnership|certified partner|official partner)\b|\bin partnership with (anthropic|claude)\b|\bpowered by anthropic\b/i;
const DASH = /[–—]/;

export function lintText(field: string, text: string | null | undefined): LintViolation[] {
  const s = String(text ?? '');
  const out: LintViolation[] = [];
  const z = s.match(ZERO_PRICE); if (z) out.push({ field, rule: 'zero_price', match: z[0] });
  const p = s.match(PARTNERSHIP); if (p) out.push({ field, rule: 'partnership', match: p[0] });
  const d = s.match(DASH); if (d) out.push({ field, rule: 'dash', match: d[0] });
  return out;
}

/** Lint every string inside an object, reporting dotted field paths. */
export function lintObject(obj: unknown, prefix = ''): LintViolation[] {
  if (typeof obj === 'string') return lintText(prefix || 'value', obj);
  if (Array.isArray(obj)) return obj.flatMap((v, i) => lintObject(v, `${prefix}[${i}]`));
  if (obj && typeof obj === 'object') {
    return Object.entries(obj as Record<string, unknown>).flatMap(([k, v]) => lintObject(v, prefix ? `${prefix}.${k}` : k));
  }
  return [];
}
