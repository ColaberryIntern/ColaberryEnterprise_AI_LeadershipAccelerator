/**
 * The checks T12's verifier proved were missing or escapable.
 *
 * Run `20261007-school-agent-factory`, session CC-20261006-a4k7.
 *
 * ## Why this is a separate file
 *
 * Four findings, each with a demonstration rather than an opinion:
 *
 *  1. **The import sweep was escapable.** `agentDomainStoryTemplates.test.ts` filtered source
 *     LINES with `/^\s*import\b|require\(/`, so it only ever saw the first physical line of a
 *     multi-line import. A verifier planted `import {\n  sendEmail,\n} from '../emailService';`
 *     and all 40 tests passed. Every import in this directory is multi-line, so the sweep's view
 *     of the module was literally `["import {", "import {"]`. Fixed here by matching module
 *     SPECIFIERS, which is what the rule is actually about and which no formatting can hide.
 *  2. **The anti-templating check only caught exact duplicates.** Replacing `promptFor` with
 *     boilerplate carrying a substituted capability name passed all 40 tests. Fixed here by
 *     asserting each prompt contains content from its OWN record.
 *  3. **A claimed assertion did not exist.** T12's commit body says the backspace repair shipped
 *     "with an assertion that no backspace survives anywhere in the directory". It did not: that
 *     assertion was in the throwaway repair script, not in a test. It exists now.
 *  4. **No test said a draft story cannot be rendered as accepted work.**
 *
 * The shipped story total was also wrong. T12's commit says "448 stories in total". Measured:
 * **503** — 443 implementation, 50 research (five per domain, counted once instead of ten times)
 * and 10 legacy-migration plans (dropped entirely). The corrected composition is asserted below
 * so the number cannot drift again without a test naming it.
 *
 * It has since moved twice, each time by addition and each time pinned per kind rather than as a
 * total: **513** when Phase 1 gave every domain a Command Center, and **1,477** when Phase 2
 * projected the 964 `release_behaviour[]` entries into per-rung stories.
 */

import * as fs from 'fs';
import * as path from 'path';
import { planForAllDomains, type GeneratedStory } from '../agentDomainStoryTemplates';
import { loadAllMatrices, type CapabilityRecord } from '../capabilityRecord';
import { AUTONOMY_STAGES } from '../autonomyLadder';

const DIR = path.join(__dirname, '..');
const TS_FILES = fs.readdirSync(DIR).filter((f) => f.endsWith('.ts'));

function strip(src: string): string {
  return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
}

/**
 * Every module specifier this source imports, however the import is formatted.
 *
 * Matching the specifier rather than the statement is the whole point: `from '../emailService'`
 * is the same fact whether the named bindings sit on one line or twelve.
 */
function importedSpecifiers(src: string): string[] {
  const code = strip(src);
  return [...code.matchAll(/(?:\bfrom|\brequire\s*\(|\bimport\s*\()\s*['"]([^'"]+)['"]/g)]
    .map((m) => m[1]);
}

const FORBIDDEN_SPECIFIER = /emailService|nodemailer|mandrill|basecamp|googleapis|calendar|synthflow|twilio|axios|node-fetch/i;

// ─────────────────────── 1. the sweep a multi-line import escaped ───────────────────────

describe('no module in this directory reaches an outbound client', () => {
  it('has files to sweep, and they really do use multi-line imports', () => {
    expect(TS_FILES.length).toBeGreaterThan(3);
    // The condition that made the old line-filter blind. Stated so the fix is not mistaken
    // for defensiveness against a hypothetical.
    const anyMultiline = TS_FILES.some((f) => /import\s*\{[^}]*\n/.test(fs.readFileSync(path.join(DIR, f), 'utf8')));
    expect(anyMultiline).toBe(true);
  });

  it.each(TS_FILES)('%s imports no mail, calendar, Basecamp or HTTP client', (f) => {
    const specs = importedSpecifiers(fs.readFileSync(path.join(DIR, f), 'utf8'));
    const offenders = specs.filter((s) => FORBIDDEN_SPECIFIER.test(s));
    expect(offenders).toEqual([]);
  });

  it('POSITIVE CONTROL: a MULTI-LINE emailService import is caught', () => {
    // The exact fixture that passed the old sweep. If this control stops failing the module
    // under test, the sweep is blind again.
    const fixture = "import {\n  sendEmail,\n  type SendResult,\n} from '../emailService';\n";
    const specs = importedSpecifiers(fixture);
    expect(specs).toEqual(['../emailService']);
    expect(specs.filter((s) => FORBIDDEN_SPECIFIER.test(s))).toEqual(['../emailService']);
  });

  it('POSITIVE CONTROL: a multi-line Basecamp client is caught too', () => {
    const fixture = "import {\n  createTodo,\n} from '../../basecamp/basecampClient';\n";
    expect(importedSpecifiers(fixture).filter((s) => FORBIDDEN_SPECIFIER.test(s)))
      .toEqual(['../../basecamp/basecampClient']);
  });

  it('POSITIVE CONTROL: the old LINE filter would have missed both', () => {
    // Demonstrates the defect rather than asserting it was there.
    const fixture = "import {\n  sendEmail,\n} from '../emailService';\n";
    const oldView = fixture.split('\n').filter((l) => /^\s*import\b|require\(/.test(l)).join('\n');
    expect(oldView).toBe('import {');
    expect(oldView).not.toMatch(/emailService/);
  });

  it('does not flag a legitimate import', () => {
    expect(importedSpecifiers("import { join } from 'path';").filter((s) => FORBIDDEN_SPECIFIER.test(s)))
      .toEqual([]);
  });
});

// ─────────────────────── 2. prompts come from their own record ───────────────────────

describe('each prompt is built from its OWN capability record', () => {
  const caps = new Map<string, CapabilityRecord>();
  for (const m of loadAllMatrices().values()) {
    for (const c of m.capabilities) caps.set(c.capability_id, c);
  }
  const impl = planForAllDomains()
    .flatMap((p) => p.stories)
    .filter((s): s is GeneratedStory & { capability_id: string } => s.kind === 'implementation' && !!s.capability_id);

  it('POSITIVE CONTROL: there are implementation stories and resolvable capabilities', () => {
    expect(impl.length).toBe(443);
    expect(caps.size).toBe(443);
    expect(impl.every((s) => caps.has(s.capability_id))).toBe(true);
  });

  /**
   * The check exact-duplicate detection could not make.
   *
   * A verifier replaced `promptFor` with boilerplate that substituted the capability's name, id
   * and domain and dropped the workflow, inputs, outputs, tools, source modules, evidence and
   * ceiling — and all 40 tests passed, because no two prompts were identical. Containment of the
   * record's OWN first workflow step is the thing templating cannot fake.
   */
  it('every prompt quotes its capability\'s own first workflow step', () => {
    const offenders: string[] = [];
    for (const s of impl) {
      const c = caps.get(s.capability_id)!;
      const step = c.workflow[0];
      if (!step) continue; // a capability with no workflow has no step to quote
      if (!s.claude_code_prompt.includes(step)) offenders.push(s.capability_id);
    }
    expect(offenders).toEqual([]);
  });

  it('every prompt carries at least one of the record\'s tools, modules or evidence', () => {
    const offenders: string[] = [];
    for (const s of impl) {
      const c = caps.get(s.capability_id)!;
      const particulars = [...c.required_tools, ...c.source_modules, ...c.supporting_evidence];
      if (particulars.length === 0) continue;
      if (!particulars.some((p) => s.claude_code_prompt.includes(p))) offenders.push(s.capability_id);
    }
    expect(offenders).toEqual([]);
  });

  it('every prompt states that capability\'s own autonomy ceiling', () => {
    const offenders: string[] = [];
    for (const s of impl) {
      const c = caps.get(s.capability_id)!;
      if (!s.claude_code_prompt.includes(c.max_permitted_autonomy)) offenders.push(s.capability_id);
    }
    expect(offenders).toEqual([]);
  });

  it('POSITIVE CONTROL: name-substituted boilerplate fails all three checks above', () => {
    // Builds the cheat that previously survived, and shows these assertions kill it.
    const c = caps.get(impl[0].capability_id)!;
    const boilerplate = `Build the ${c.name} capability for its domain. Follow the plan.`;
    expect(boilerplate.includes(c.workflow[0] ?? 'SENTINEL-THAT-CANNOT-APPEAR-IN-BOILERPLATE')).toBe(false);
    expect(boilerplate.includes(c.max_permitted_autonomy)).toBe(false);
    const particulars = [...c.required_tools, ...c.source_modules, ...c.supporting_evidence];
    expect(particulars.some((p) => boilerplate.includes(p))).toBe(false);
  });
});

// ─────────────────────── 3. the assertion the commit claimed ───────────────────────

/**
 * No control character survives in this directory.
 *
 * T12's commit body says the backspace repair shipped "with an assertion that no backspace
 * survives anywhere in the directory". That assertion lived in a throwaway Python script, not in
 * a test, so nothing would have caught the next one. The original bug: a non-raw Python string
 * turned `\b` into a real 0x08 byte, and a regex then matched a control character and silently
 * never fired.
 */
describe('no control character survives in this directory', () => {
  // Built from character CODES, not escapes. Writing the class with unicode escapes is how
  // the bytes got in: the editor decoded them into REAL control characters, so the file
  // defining this check became the first thing the check caught. A code cannot be decoded.
  const CONTROL_CODES = [0, 1, 2, 3, 4, 5, 6, 7, 8, 11, 12, 14, 15, 16, 17, 18, 19,
    20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31];
  const CONTROL = new RegExp(
    `[${CONTROL_CODES.map((c) => String.fromCharCode(c)).join('')}]`,
  );

  it.each(TS_FILES)('%s is free of control characters', (f) => {
    const raw = fs.readFileSync(path.join(DIR, f), 'utf8');
    const at = raw.search(CONTROL);
    // Name the offset and the byte, so a failure is actionable rather than a boolean.
    expect(at === -1 ? 'clean' : `${f}: 0x${raw.charCodeAt(at).toString(16)} at offset ${at}`).toBe('clean');
  });

  it('also sweeps the test directory, where the original bug actually was', () => {
    const testFiles = fs.readdirSync(__dirname).filter((f) => f.endsWith('.ts'));
    expect(testFiles.length).toBeGreaterThan(3);
    for (const f of testFiles) {
      const raw = fs.readFileSync(path.join(__dirname, f), 'utf8');
      const at = raw.search(CONTROL);
      expect(at === -1 ? 'clean' : `${f}: 0x${raw.charCodeAt(at).toString(16)}`).toBe('clean');
    }
  });

  it('POSITIVE CONTROL: the pattern matches a planted backspace', () => {
    expect(CONTROL.test(`before${String.fromCharCode(8)}after`)).toBe(true);
    expect(CONTROL.test(`a${String.fromCharCode(0)}b`)).toBe(true);
    expect(CONTROL.test('clean text, with a tab\t and a newline\n')).toBe(false);
  });
});

// ─────────────────────── 4. the corrected counts, and draft status ───────────────────────

describe('the story set, counted correctly', () => {
  const all = planForAllDomains().flatMap((p) => p.stories);

  it('is 1,477 stories, not 448: the composition is asserted so it cannot drift', () => {
    // 448 was 443 + 5: the five research stories counted ONCE rather than per domain, and the
    // ten legacy-migration plans dropped. A bare total hid both mistakes, so the parts are pinned.
    //
    // 503 -> 513 when STORY-000 landed: one Command Center per domain, so the ten are a NEW kind
    // rather than a tenth of something that already existed. Pinning the parts is what makes that
    // readable as "ten were added" instead of "a number changed".
    //
    // 513 -> 1,477 at Phase 2, and the 964 are the whole point: one story per
    // `release_behaviour[]` entry across the 443 capability records. Those entries were always in
    // the data, each with its own behaviour and acceptance criteria, and the generator read only
    // `release_behaviour[0]` -- so about 520 of them had never been looked at by anything. The
    // count is pinned per KIND for the same reason as above: if this number moves, the test says
    // which kind moved.
    expect(all.filter((s) => s.kind === 'implementation')).toHaveLength(443);
    expect(all.filter((s) => s.kind === 'release_behaviour')).toHaveLength(964);
    expect(all.filter((s) => s.kind === 'research')).toHaveLength(50);
    expect(all.filter((s) => s.kind === 'legacy_migration')).toHaveLength(10);
    expect(all.filter((s) => s.kind === 'command_center')).toHaveLength(10);
    expect(all).toHaveLength(1477);
    // 13 releases per domain: ten rungs plus the three originals, kept empty as the rollback path.
    expect(planForAllDomains().reduce((n, p) => n + p.releases.length, 0)).toBe(130);
  });

  it('every story sits on a real rung, and `release_key` agrees with `autonomy_stage`', () => {
    // The invariant the whole migration rests on. A release IS a rung now, so a story whose
    // `release_key` and `autonomy_stage` disagree is a story claiming one authority level while
    // hanging under another -- and `coverageMatrix` reads `release_key` while a dashboard would
    // read `autonomy_stage`, so the two would report different ladders without anything failing.
    for (const s of all) {
      expect(AUTONOMY_STAGES).toContain(s.autonomy_stage);
      expect(s.release_key).toBe(s.autonomy_stage);
    }
  });

  it('POSITIVE CONTROL: a bare `R4` would NOT satisfy the rung check', () => {
    // Proves the check above is testing the namespace and not merely "is a non-empty string".
    // A bare `R4` is the dangerous value: it is lexically valid in the platform's DELIVERY RISK
    // vocabulary, where two readers fail OPEN on an unrecognised tier.
    expect(AUTONOMY_STAGES).not.toContain('R4' as never);
  });

  it('every rung of the ladder is a release on every board, even the empty ones', () => {
    // Deliberate. `AUTONOMY_RELEASE_MIGRATION.md` wants "R2 through R9 visible above him for the
    // first time", and measured against the capability data only one domain names all ten rungs.
    // An empty rung above you is the point of a ladder; creating only the rungs with work in them
    // would have rebuilt the flat backlog with extra steps.
    for (const p of planForAllDomains()) {
      for (const stage of AUTONOMY_STAGES) {
        expect(p.releases.map((r) => r.cluster)).toContain(stage);
      }
    }
  });

  it('five research stories PER DOMAIN, which is where 50 comes from', () => {
    for (const p of planForAllDomains()) {
      expect(p.stories.filter((s) => s.kind === 'research')).toHaveLength(5);
      expect(p.stories.filter((s) => s.kind === 'legacy_migration')).toHaveLength(1);
      expect(p.stories.filter((s) => s.kind === 'command_center')).toHaveLength(1);
    }
  });

  it('the Command Center is the FIRST story of the FIRST release, in every domain', () => {
    // Not cosmetic. `planProvision` derives position from array order within a cluster, so being
    // first in this array is the only thing that makes it position 0 on the board -- and position
    // is what the portal sorts on. A Command Center sitting fourth is a Command Center nobody
    // opens first.
    for (const p of planForAllDomains()) {
      expect(p.stories[0].kind).toBe('command_center');
      expect(p.stories[0].release_key).toBe(p.releases[0].cluster);
    }
  });

  it('every story is DRAFT, and none renders as accepted or approved work', () => {
    expect(all.every((s) => s.status === 'draft')).toBe(true);
    const offenders: string[] = [];
    for (const s of all) {
      const text = `${s.title} ${s.body}`.toLowerCase();
      // A story may DESCRIBE the approval it is waiting on; it may not assert it happened.
      for (const claim of ['this is approved', 'has been accepted', 'manager approved',
        'approved by the manager', 'accepted by the manager', 'sign-off received']) {
        if (text.includes(claim)) offenders.push(`${s.story_id}: ${claim}`);
      }
    }
    expect(offenders).toEqual([]);
  });

  it('every story names a validation dependency rather than implying none', () => {
    expect(all.every((s) => s.validation_dependency.trim().length > 20)).toBe(true);
  });

  it('POSITIVE CONTROL: a story claiming acceptance would be caught', () => {
    const bare = 'this capability has been accepted and is ready to build'.toLowerCase();
    expect(bare.includes('has been accepted')).toBe(true);
  });
});
