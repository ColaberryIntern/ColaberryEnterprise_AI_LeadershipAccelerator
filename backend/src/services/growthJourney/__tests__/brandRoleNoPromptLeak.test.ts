import * as fs from 'fs';
import * as path from 'path';

/**
 * No agent reads the brand role. It is display and copy only.
 *
 * ─── WHY THIS IS AN IMPORT SCAN AND NOT A STRING SCAN ───────────────────────
 *
 * Scanning for "Enrollment Specialist" would only catch a HARDCODED title,
 * which is not the realistic leak. The realistic leak is a prompt builder
 * importing `brandRoleService` and interpolating whatever an operator typed, at
 * which point a role title is an instruction an agent follows and a text search
 * for the seeded default finds nothing at all.
 *
 * So the assertion is structural: nothing under the Maya or agent trees imports
 * this module. That holds whatever the stored value says.
 *
 * ─── THE SCAN IS PATTERN-BASED BECAUSE A DIRECTORY SCAN MISSES MOST OF MAYA ─
 *
 * The first draft of this scanned `services/maya/` and `services/agents/`.
 * Measured, that misses twelve loose `maya*` files directly under
 * `services/`, plus `mayaBrain/` and `mayaTools/`, plus
 * `admissionsMayaService.ts` - and that last one is where
 * `MAYA_ADMISSIONS_VOICE` lives, which is the single most likely home for a
 * persona leak. A scan that skipped it would have been the comfortable version.
 *
 * ─── AND IT PROVES ITSELF NON-EMPTY FIRST ───────────────────────────────────
 *
 * A glob that matches nothing passes an "and none of them imports it" assertion
 * perfectly. So the file count is asserted before the imports are, with a floor
 * taken from what is actually on disk today. A refactor that moves Maya
 * wholesale will fail this and should: the scan needs re-pointing, and the
 * alternative is a guard that silently stops guarding.
 */

const SERVICES = path.join(__dirname, '..', '..');

function tsFilesUnder(abs: string): string[] {
  if (!fs.existsSync(abs)) return [];
  const out: string[] = [];
  for (const entry of fs.readdirSync(abs, { withFileTypes: true })) {
    const full = path.join(abs, entry.name);
    if (entry.isDirectory()) {
      if (entry.name !== '__tests__' && entry.name !== 'node_modules') {
        out.push(...tsFilesUnder(full));
      }
    } else if (entry.name.endsWith('.ts') && !entry.name.endsWith('.d.ts')) {
      out.push(full);
    }
  }
  return out;
}

/** Any path matching `maya` case-insensitively, plus everything under `agents/`. */
function agentSurfaceFiles(): string[] {
  const all = tsFilesUnder(SERVICES);
  return all.filter((p) => {
    const rel = path.relative(SERVICES, p).replace(/\\/g, '/');
    return /maya/i.test(rel) || rel.startsWith('agents/');
  });
}

/** An import of the role service, however it is spelled. */
const IMPORTS_ROLE_SERVICE = /(?:from\s+['"][^'"]*brandRoleService['"]|require\(\s*['"][^'"]*brandRoleService['"])/;

describe('the brand role never reaches an agent', () => {
  const files = agentSurfaceFiles();

  it('finds the Maya and agent surface it is supposed to be scanning', () => {
    // Measured on 2026-11-22: 77 maya-matching files plus 189 under agents/.
    // The floor is deliberately well below that, so ordinary growth or tidying
    // does not fail the suite, while a scan pointed at nothing does.
    expect(files.length).toBeGreaterThan(150);
    const rels = files.map((p) => path.relative(SERVICES, p).replace(/\\/g, '/'));
    // The three places a directory-only scan would have missed.
    expect(rels).toContain('admissionsMayaService.ts');
    expect(rels.some((r) => r.startsWith('maya/'))).toBe(true);
    expect(rels.some((r) => r.startsWith('agents/'))).toBe(true);
  });

  it('none of them imports brandRoleService', () => {
    const offenders = files
      .filter((p) => IMPORTS_ROLE_SERVICE.test(fs.readFileSync(p, 'utf8')))
      .map((p) => path.relative(SERVICES, p).replace(/\\/g, '/'));

    // Named rather than counted, so a failure says which file to look at.
    expect(offenders).toEqual([]);
  });

  it('and neither does anything that builds a prompt', () => {
    const prompts = tsFilesUnder(SERVICES).filter((p) =>
      /prompt|persona|voice|charter/i.test(path.relative(SERVICES, p))
    );
    expect(prompts.length).toBeGreaterThan(0);

    const offenders = prompts
      .filter((p) => IMPORTS_ROLE_SERVICE.test(fs.readFileSync(p, 'utf8')))
      .map((p) => path.relative(SERVICES, p).replace(/\\/g, '/'));

    expect(offenders).toEqual([]);
  });
});
