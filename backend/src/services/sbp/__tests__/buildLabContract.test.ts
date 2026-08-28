/**
 * buildLabContract — the checks that catch a lab drifting away from the portfolio.
 *
 * The test that matters most is `evidence_path_agrees`. The labs live in the
 * database and nothing in CI can fail when one is edited, so the failure mode is
 * silent: someone renames a folder in a lab prompt, and a student who does
 * everything right reads as having built nothing. These fixtures let the same
 * checker that runs against production also run here, with no database.
 */
import {
  DOCUMENT_WEEKS, STEP_WEEKS,
  checkCurriculum, checkLab, expectedEvidenceFor, weekArtifactPath,
} from '../buildLabContract';

/** A minimal well-formed step lab for a given week. */
const goodLab = (week: number, extra = '') => ({
  week,
  bodyHtml: [
    '<h4>Step 1 &middot; a</h4><h4>Step 2 &middot; b</h4><h4>Step 3 &middot; c</h4>',
    '<h4>Step 4 &middot; d</h4><h4>Step 5 &middot; e</h4><h4>Step 6 &middot; f</h4>',
    `<h4>Step 7 &middot; g</h4> save it in ${weekArtifactPath(week)} `,
    expectedEvidenceFor(week).join(' '),
    extra,
  ].join(''),
  authored: true,
});

const rules = (vs: { rule: string }[]) => vs.map((v) => v.rule).sort();

describe('weekArtifactPath', () => {
  it('zero-pads, because the reader globs on the padded form', () => {
    expect(weekArtifactPath(5)).toBe('artifacts/week-05/');
    expect(weekArtifactPath(12)).toBe('artifacts/week-12/');
  });
});

describe('expectedEvidenceFor', () => {
  it('derives from the capability inventory rather than restating it', () => {
    // Adding a capability must extend the contract automatically. If this were a
    // hand-written list, a new capability would silently escape checking.
    expect(expectedEvidenceFor(7)).toContain('.claude/agents/');
    expect(expectedEvidenceFor(9)).toContain('reliability/');
    expect(expectedEvidenceFor(10)).toContain('governance/');
  });

  it('covers both weeks of a capability that spans two', () => {
    // The MCP server is built in week 5 and extended in week 6 — one capability,
    // so both weeks are expected to name its folder.
    expect(expectedEvidenceFor(5)).toContain('mcp-server/');
    expect(expectedEvidenceFor(6)).toContain('mcp-server/');
  });

  it('demands nothing of the composite', () => {
    // CAPSTONE is derived from the other ten and names no path of its own.
    expect(expectedEvidenceFor(12)).toEqual([]);
  });
});

describe('checkLab', () => {
  it('passes a well-formed step lab', () => {
    expect(checkLab(goodLab(7))).toEqual([]);
  });

  it('catches a lab that still saves to the Downloads folder', () => {
    const lab = goodLab(7, ' save it to my Downloads folder as x.pdf ');
    expect(rules(checkLab(lab))).toContain('no_downloads_folder');
  });

  it('catches a lab still in the old five-document shape', () => {
    const lab = { week: 8, bodyHtml: '<h4>Subagent Design Document</h4><h4>Coordination Plan</h4>' };
    expect(rules(checkLab(lab))).toEqual(['has_steps']);
  });

  it('reports only has_steps for an unconverted lab, not a pile of consequences', () => {
    // Every other rule assumes a step lab. Reporting them too would bury the one
    // fact the editor needs.
    const violations = checkLab({ week: 9, bodyHtml: '<h4>Reliability Design Document</h4>' });
    expect(violations).toHaveLength(1);
  });

  it('catches a lab whose recording has nowhere to land', () => {
    const lab = { ...goodLab(5), bodyHtml: goodLab(5).bodyHtml.replace('artifacts/week-05/', 'somewhere') };
    expect(rules(checkLab(lab))).toContain('commits_to_week_folder');
  });

  it('CATCHES THE SILENT ONE: lab and inventory disagree on the evidence path', () => {
    // The whole reason this module exists. Someone renames the folder in the lab
    // copy; the inventory still looks for the old path; the student builds it
    // correctly and their capability reads as missing, with no error anywhere.
    const drifted = {
      week: 9,
      bodyHtml: goodLab(9).bodyHtml.replace('reliability/', 'resilience/'),
    };
    const violations = checkLab(drifted);
    expect(rules(violations)).toContain('evidence_path_agrees');
    expect(violations.find((v) => v.rule === 'evidence_path_agrees')!.detail).toContain('reliability/');
  });

  it('refuses a seeded card, because a DB edit to one silently reverts on boot', () => {
    const lab = { ...goodLab(7), source: 'intel_sample_seed' };
    expect(rules(checkLab(lab))).toContain('not_seeded');
  });

  it('exempts the document week from every step rule', () => {
    // Week 11's deliverable genuinely IS a document package. Converting it would
    // break a week that works, so the contract must not demand steps of it.
    const w11 = { week: 11, bodyHtml: '<h4>Architecture Decision Records</h4><h4>7-Layer Table</h4>' };
    expect(checkLab(w11)).toEqual([]);
  });

  it('still holds the document week to the Downloads rule', () => {
    const w11 = { week: 11, bodyHtml: '<h4>ADRs</h4> save to my Downloads folder ' };
    expect(rules(checkLab(w11))).toEqual(['no_downloads_folder']);
  });

  it('flags a step lab that is suspiciously short', () => {
    const lab = { week: 7, bodyHtml: `<h4>Step 1 &middot; a</h4><h4>Step 2 &middot; b</h4> ${weekArtifactPath(7)} .claude/agents/` };
    expect(rules(checkLab(lab))).toContain('enough_steps');
  });
});

describe('checkCurriculum', () => {
  it('passes a complete, well-formed curriculum', () => {
    const labs = [
      ...STEP_WEEKS.map((w) => goodLab(w)),
      { week: 11, bodyHtml: '<h4>Architecture Package</h4>' },
    ];
    expect(checkCurriculum(labs)).toEqual([]);
  });

  it('reports a missing week rather than passing over it', () => {
    // Week 12 had no lab at all until it was written. A checker that only
    // examined the labs it was handed would have called that curriculum clean.
    const labs = [
      ...STEP_WEEKS.filter((w) => w !== 12).map((w) => goodLab(w)),
      { week: 11, bodyHtml: '<h4>Architecture Package</h4>' },
    ];
    const violations = checkCurriculum(labs);
    expect(violations).toEqual([{ week: 12, rule: 'lab_exists', detail: 'no build lab for this week at all' }]);
  });

  it('covers all twelve weeks between the step and document lists', () => {
    const all = [...STEP_WEEKS, ...DOCUMENT_WEEKS].sort((a, b) => a - b);
    expect(all).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12]);
  });
});
