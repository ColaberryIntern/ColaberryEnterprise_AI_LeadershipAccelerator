/**
 * The capability matrices must be IN THE IMAGE, not only in the repository.
 *
 * Run `20261007-school-agent-factory` (T19), session CC-20261006-a4k7.
 *
 * ## Why this test exists
 *
 * The first production provisioning run failed with:
 *
 *   Capability matrix missing for 'learner_success' at
 *   /app/dist/services/agentDomain/capabilities/learner_success.json
 *
 * `tsc` compiles `.ts` and does not copy `.json`. So 2.6 MB of committed data — the ten matrices
 * and the undomained-legacy bucket — were simply absent from the runtime image, and every test in
 * this repository passed, because every one of them runs against the source tree where the files
 * are right there.
 *
 * That is the gap: a green suite says nothing about what got packaged. The repo already knew this
 * and solved it one line away in the Dockerfile — `ai-systems-registry.csv` is copied explicitly,
 * with a comment saying the backend "reads this at runtime". The pattern existed; I did not follow
 * it, and only a real deployment could say so.
 *
 * ## What it checks
 *
 * That the Dockerfile copies the directory `capabilityRecord` actually resolves, with the
 * directory DERIVED from the loader rather than typed here — so moving the data without updating
 * the Dockerfile fails, which is the scenario that produced this test.
 */

import * as fs from 'fs';
import * as path from 'path';
import { loadAllMatrices, loadUnresolvedBucket } from '../capabilityRecord';

const DOCKERFILE = path.join(__dirname, '..', '..', '..', '..', 'Dockerfile');
const SOURCE_DIR = path.join(__dirname, '..', 'capabilities');

/** The Dockerfile with comments stripped: a path named in prose is not a COPY. */
function dockerfileInstructions(): string {
  return fs.readFileSync(DOCKERFILE, 'utf8')
    .split('\n')
    .filter((l) => !l.trim().startsWith('#'))
    .join('\n');
}

describe('the capability data is packaged, not just committed', () => {
  it('POSITIVE CONTROL: the Dockerfile is where it is expected, and is a real one', () => {
    // Without this, every assertion below could pass over an empty read.
    expect(fs.existsSync(DOCKERFILE)).toBe(true);
    const text = fs.readFileSync(DOCKERFILE, 'utf8');
    expect(text).toMatch(/^FROM /m);
    expect(text.length).toBeGreaterThan(500);
  });

  it('POSITIVE CONTROL: there really is data to package', () => {
    const files = fs.readdirSync(SOURCE_DIR).filter((f) => f.endsWith('.json'));
    // Ten domain matrices plus the undomained-legacy bucket.
    expect(files).toHaveLength(11);
    expect(loadAllMatrices().size).toBe(10);
    expect(loadUnresolvedBucket().rows.length).toBe(21);
  });

  it('the Dockerfile COPIES the capabilities directory into dist', () => {
    const instructions = dockerfileInstructions();
    // The destination has to be under `dist`, because the loader resolves the data relative to
    // its OWN __dirname — which at runtime is /app/dist/services/agentDomain.
    expect(instructions).toMatch(
      /COPY[^\n]*agentDomain\/capabilities\s+\.\/dist\/services\/agentDomain\/capabilities/,
    );
  });

  it('it copies from the BUILDER, so the path matches where the loader looks', () => {
    const instructions = dockerfileInstructions();
    const line = instructions.split('\n').find((l) => /agentDomain\/capabilities/.test(l));
    expect(line).toBeDefined();
    expect(line as string).toMatch(/--from=builder/);
  });

  it('the loader reads from a directory beside ITSELF, which is why the COPY target is what it is', () => {
    // Derived, not asserted: if the loader ever resolves its data from somewhere else, the
    // Dockerfile target above stops being the right one and this records why.
    const src = fs.readFileSync(path.join(__dirname, '..', 'capabilityRecord.ts'), 'utf8');
    expect(src).toMatch(/path\.join\(__dirname,\s*'capabilities'\)/);
  });

  it('POSITIVE CONTROL: a Dockerfile without the COPY fails this check', () => {
    // Proves the assertion can fail. This is the state the image was actually in when the first
    // production provisioning run died.
    const withoutIt = dockerfileInstructions()
      .split('\n')
      .filter((l) => !/agentDomain\/capabilities/.test(l))
      .join('\n');
    expect(withoutIt).not.toMatch(
      /COPY[^\n]*agentDomain\/capabilities\s+\.\/dist\/services\/agentDomain\/capabilities/,
    );
  });

  it('every file the loader needs is in the directory the Dockerfile copies', () => {
    // The two reads `capabilityRecord` performs, enumerated from the data rather than listed.
    const present = new Set(fs.readdirSync(SOURCE_DIR));
    for (const key of loadAllMatrices().keys()) {
      expect(present.has(`${key}.json`)).toBe(true);
    }
    expect(present.has('_unresolved.json')).toBe(true);
  });
});
