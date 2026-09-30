/**
 * Contract test for the transcribed CCAR-F blueprint.
 *
 * This is a TRANSCRIPTION of Anthropic's exam guide, so the risk it guards is a
 * copying error, not a logic error: a weight that does not total 100, a task
 * statement dropped on the way across, a domain silently renumbered. Every
 * assertion here is checkable against the source PDF (v1.0, effective July 2026).
 */
import {
  CCAR_FOUNDATIONS_BLUEPRINT as BP,
  CERT_BLUEPRINTS,
  totalWeight,
} from '../ccarFoundations';

describe('CCAR-F blueprint — exam facts', () => {
  it('matches the official "Exam Details at a Glance" table', () => {
    expect(BP.exam_code).toBe('CCAR-F');
    expect(BP.exam_item_count).toBe(60);
    expect(BP.exam_duration_minutes).toBe(120);
    expect(BP.passing_scaled_score).toBe(720);
    expect(BP.scaled_score_min).toBe(100);
    expect(BP.scaled_score_max).toBe(1000);
    expect(BP.exam_fee_usd).toBe(125);
    expect(BP.validity_months).toBe(12);
  });

  it('is marked as officially sourced, with the provenance recorded', () => {
    expect(BP.blueprint_source).toBe('official');
    expect(BP.source_note).toMatch(/Anthropic exam guide v1\.0/);
    expect(BP.source_note).toMatch(/2026-09-03/);
    expect(BP.blueprint_version).toBe('1.0-2026-07');
  });
});

describe('CCAR-F blueprint — domains', () => {
  it('has the five official domains in the official order', () => {
    expect(BP.domains.map((d) => d.domain_id)).toEqual(['D1', 'D2', 'D3', 'D4', 'D5']);
    expect(BP.domains.map((d) => d.label)).toEqual([
      'Agentic Architecture & Orchestration',
      'Tool Design & MCP Integration',
      'Claude Code Configuration & Workflows',
      'Prompt Engineering & Structured Output',
      'Context Management & Reliability',
    ]);
  });

  it('carries the official weights', () => {
    const weights = Object.fromEntries(BP.domains.map((d) => [d.domain_id, d.weight_pct]));
    expect(weights).toEqual({ D1: 27, D2: 18, D3: 20, D4: 20, D5: 15 });
  });

  it('weights total exactly 100', () => {
    expect(totalWeight(BP)).toBe(100);
  });

  it('GUARD: D2 is Tool Design at 18%, NOT Claude Code — the numbering trap', () => {
    // Community guides imply descending-weight order, which mis-numbers D2/D3.
    // Anything tagged from those sources is wrong; this test is the tripwire.
    const d2 = BP.domains.find((d) => d.domain_id === 'D2')!;
    const d3 = BP.domains.find((d) => d.domain_id === 'D3')!;
    expect(d2.label).toBe('Tool Design & MCP Integration');
    expect(d2.weight_pct).toBe(18);
    expect(d3.label).toBe('Claude Code Configuration & Workflows');
    expect(d3.weight_pct).toBe(20);
    expect(d2.weight_pct).toBeLessThan(d3.weight_pct); // domains are NOT weight-ordered
  });

  it('has all 30 task statements, distributed 7/5/6/6/6', () => {
    const counts = BP.domains.map((d) => d.objectives.length);
    expect(counts).toEqual([7, 5, 6, 6, 6]);
    expect(counts.reduce((a, b) => a + b, 0)).toBe(30);
  });

  it('every objective id is prefixed with its own domain and is unique', () => {
    const seen = new Set<string>();
    for (const domain of BP.domains) {
      domain.objectives.forEach((o, i) => {
        expect(o.objective_id).toBe(`${domain.domain_id}.${i + 1}`);
        expect(o.label.trim().length).toBeGreaterThan(10);
        expect(seen.has(o.objective_id)).toBe(false);
        seen.add(o.objective_id);
      });
    }
    expect(seen.size).toBe(30);
  });

  it('display_order matches the official numbering', () => {
    expect(BP.domains.map((d) => d.display_order)).toEqual([1, 2, 3, 4, 5]);
  });
});

describe('CCAR-F blueprint — scenarios', () => {
  it('has the published bank of 6, from which the exam draws 4', () => {
    expect(BP.scenarios).toHaveLength(6);
    expect(BP.scenarios.map((s) => s.label)).toEqual([
      'Customer Support Resolution Agent',
      'Code Generation with Claude Code',
      'Multi-Agent Research System',
      'Developer Productivity with Claude',
      'Claude Code for Continuous Integration',
      'Structured Data Extraction',
    ]);
  });

  it('every scenario maps only to domains that exist', () => {
    const ids = new Set(BP.domains.map((d) => d.domain_id));
    for (const scenario of BP.scenarios) {
      expect(scenario.primary_domains.length).toBeGreaterThan(0);
      scenario.primary_domains.forEach((d) => expect(ids.has(d)).toBe(true));
    }
  });

  it('every domain is exercised by at least one scenario', () => {
    const covered = new Set(BP.scenarios.flatMap((s) => s.primary_domains));
    BP.domains.forEach((d) => expect(covered.has(d.domain_id)).toBe(true));
  });
});

describe('CERT_BLUEPRINTS registry', () => {
  it('is keyed by track id', () => {
    expect(CERT_BLUEPRINTS['ccar-f']).toBe(BP);
  });
});
