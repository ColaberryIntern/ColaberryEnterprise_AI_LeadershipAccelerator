import * as fs from 'fs';
import * as path from 'path';
import { GROWTH_JOURNEY_STATEMENTS } from '../ensureGrowthJourneySchema';
import { GROWTH_JOURNEY_PHASE4_STATEMENTS } from '../growthJourneyPhase4Statements';
import { GROWTH_JOURNEY_PHASE5_STATEMENTS } from '../growthJourneyPhase5Statements';
import { OPEN_HANDOFF_STATUSES } from '../../models/GrowthJourneyHandoff';

/**
 * The Phase 5 statements (governed execution). T501 opens the sibling module
 * with the one index the Phase 5 packet's 7A asked for; T503 adds the three
 * execution tables to the same list and to this file.
 */

const ws = (s: string) => s.replace(/\s+/g, ' ').trim();

describe('the Phase 5 sibling module', () => {
  it('is spread whole, right after Phase 4, and the brands ALTER stays last', () => {
    const p4Last = GROWTH_JOURNEY_STATEMENTS.indexOf(GROWTH_JOURNEY_PHASE4_STATEMENTS[GROWTH_JOURNEY_PHASE4_STATEMENTS.length - 1]);
    const p5 = GROWTH_JOURNEY_PHASE5_STATEMENTS.map((s) => GROWTH_JOURNEY_STATEMENTS.indexOf(s));
    expect(GROWTH_JOURNEY_PHASE5_STATEMENTS.length).toBeGreaterThan(0);
    expect(p5).toEqual(GROWTH_JOURNEY_PHASE5_STATEMENTS.map((_, i) => p4Last + 1 + i));
    const alterAt = GROWTH_JOURNEY_STATEMENTS.findIndex((s) => /ALTER\s+TABLE\s+brands/i.test(s));
    expect(alterAt).toBe(GROWTH_JOURNEY_STATEMENTS.length - 1);
    expect(Math.max(...p5)).toBeLessThan(alterAt);
  });

  it('is additive: every statement IF NOT EXISTS, none destructive, no explorer_ name', () => {
    for (const s of GROWTH_JOURNEY_PHASE5_STATEMENTS) {
      expect(s).toMatch(/IF NOT EXISTS/i);
      expect(s).not.toMatch(/\bDROP\b|\bTRUNCATE\b|DELETE FROM|ALTER COLUMN|\bRENAME\b/i);
      expect(s).not.toMatch(/explorer_/i);
    }
  });

  it('kept the parent at the 500-line ceiling: the import it added was paid for by folding a comment', () => {
    const lines = fs.readFileSync(path.join(__dirname, '..', 'ensureGrowthJourneySchema.ts'), 'utf8').split('\n').length;
    // A trailing newline makes split() one longer than `wc -l`.
    expect(lines - 1).toBeLessThanOrEqual(500);
  });
});

describe('T501 (7A): ONE OPEN HANDOFF PER PERSON PER BRAND', () => {
  it('a partial unique on (lead_id, brand_id) over exactly the open statuses', () => {
    const idx = GROWTH_JOURNEY_PHASE5_STATEMENTS.find((s) => /growth_journey_handoffs_open_lead_unique/.test(s));
    expect(idx).toBeDefined();
    expect(ws(idx!)).toMatch(
      /^CREATE UNIQUE INDEX IF NOT EXISTS growth_journey_handoffs_open_lead_unique ON growth_journey_handoffs \(lead_id, brand_id\) WHERE status IN \('queued', 'assigned', 'accepted'\)$/,
    );
  });

  it('shares its predicate with the per-subject index and with the model, so no writer can drift from either', () => {
    const inList = (name: string) => {
      const s = ws(GROWTH_JOURNEY_STATEMENTS.find((x) => x.includes(name))!);
      return /WHERE status IN \(([^)]*)\)$/.exec(s)![1].split(',').map((v) => v.trim().replace(/^'|'$/g, ''));
    };
    expect(inList('growth_journey_handoffs_open_lead_unique')).toEqual(inList('growth_journey_handoffs_open_subject_unique'));
    expect(inList('growth_journey_handoffs_open_lead_unique')).toEqual([...OPEN_HANDOFF_STATUSES]);
  });
});

describe('heredoc tripwire', () => {
  it('this file, the Phase 5 statements module and the escalation-trigger module carry no literal control byte', () => {
    for (const file of [
      __filename,
      path.join(__dirname, '..', 'growthJourneyPhase5Statements.ts'),
      path.join(__dirname, '..', '..', 'services', 'growthJourney', 'handoffs', 'escalationTriggers.ts'),
    ]) {
      const source = fs.readFileSync(file, 'utf8');
      // Tab (0x09), LF (0x0a) and CR (0x0d) are text; every other byte below 0x20 is a shell accident.
      const control = [...source].filter((ch) => ch.charCodeAt(0) < 0x20 && ![0x09, 0x0a, 0x0d].includes(ch.charCodeAt(0)));
      expect({ file: path.basename(file), control }).toEqual({ file: path.basename(file), control: [] });
    }
  });
});
