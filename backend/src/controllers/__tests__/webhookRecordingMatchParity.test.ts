/**
 * THE WEBHOOK AND THE POLLING SWEEP MUST DESCRIBE A RECORDING THE SAME WAY.
 *
 * Both paths pick a file with the same selector, `pickBestMp4`, and then build a
 * match object for the ingest. `zoomService.toRecordingMatch` carried
 * `providerFileId`; the object literal in `webhookController` did not — it copied
 * `download_url`, `file_size` and `recording_type` off the very same file and
 * stopped one field short.
 *
 * The consequence was the whole feature. Correlation parks a recording with no file
 * id in review, owned by nobody, so every webhook-delivered recording was
 * unattributable — while the slower cron sweep, which did carry the id, would have
 * attributed it correctly. The fast path always wins the race, so in practice no
 * recording was ever attributed to anybody. Production held one recording, parked,
 * after the first real rehearsal on 2026-10-09; Zoom had sent an id for all six files.
 *
 * A comment above the literal already asserted the two paths "can never pick
 * different files". It was true of the selector and false of the mapping. A comment
 * cannot fail a build, so this does: it extracts the field set each path produces
 * from SOURCE and requires the webhook's to be a superset of the sweep's.
 *
 * Source text rather than execution, on purpose — the webhook literal is built inline
 * inside a long handler with a live request, and reaching it in a unit test would mean
 * mocking enough of Express, Zoom and the DB that the mocks, not the code, would
 * decide the result.
 */
import fs from 'fs';
import path from 'path';

const SRC = path.join(__dirname, '..', '..');
const read = (p: string) => fs.readFileSync(path.join(SRC, p), 'utf8');

/** The keys of the object literal assigned to `name`, as written in the source. */
function literalKeys(source: string, name: string): string[] {
  const start = source.indexOf(`const ${name} = {`);
  if (start < 0) return [];
  let depth = 0;
  let end = -1;
  for (let i = source.indexOf('{', start); i < source.length; i += 1) {
    if (source[i] === '{') depth += 1;
    else if (source[i] === '}') {
      depth -= 1;
      if (depth === 0) { end = i; break; }
    }
  }
  if (end < 0) return [];
  const body = source.slice(start, end);
  // Top-level `key:` only — nested object keys would inflate the comparison, and
  // commented-out lines must not count as fields that exist.
  return Array.from(
    new Set(
      body
        .split('\n')
        .map((l) => l.trim())
        .filter((l) => !l.startsWith('//') && !l.startsWith('*'))
        .map((l) => /^([A-Za-z_][A-Za-z0-9_]*)\s*:/.exec(l))
        .filter((m): m is RegExpExecArray => m !== null)
        .map((m) => m[1]),
    ),
  ).sort();
}

const webhookSrc = read(path.join('controllers', 'webhookController.ts'));
const zoomSrc = read(path.join('services', 'zoomService.ts'));

describe('the two ingest paths agree on what a recording is', () => {
  it('finds both match objects — a rename must fail loudly, not pass vacuously', () => {
    // Positive control. Without this, a renamed literal makes every assertion
    // below compare two empty arrays and pass.
    expect(literalKeys(webhookSrc, 'preResolvedMatch').length).toBeGreaterThan(3);
    expect(/providerFileId:\s*\(best as/.test(zoomSrc) || /providerFileId:/.test(zoomSrc)).toBe(true);
  });

  it('THE REGRESSION: the webhook path carries providerFileId', () => {
    expect(literalKeys(webhookSrc, 'preResolvedMatch')).toContain('providerFileId');
  });

  it('reads the id off the SAME file the selector chose, not off the payload root', () => {
    // `event.payload.object.id` is the MEETING id. Using it here would populate the
    // field with a plausible-looking wrong value, which is worse than null: the
    // review queue would never flag it and every part of a meeting would share one
    // "file" id, so the ON CONFLICT dedupe would swallow part 2 in silence.
    expect(webhookSrc).toMatch(/providerFileId:\s*best\.id\s*\?\?\s*null/);
  });

  it('the webhook mapping is a superset of the sweep mapping', () => {
    const sweep = ['downloadUrl', 'mimeType', 'name', 'providerFileId', 'recordingType', 'sizeBytes'];
    const webhook = literalKeys(webhookSrc, 'preResolvedMatch');
    for (const field of sweep) expect(webhook).toContain(field);
  });
});

/**
 * The guard that parks an id-less recording is load-bearing and must stay ABOVE the
 * attribution branches. See the comment at its site: with no real id, every part of
 * one occurrence synthesises the same `nofile:<uuid>` key, and `ON CONFLICT ... DO
 * NOTHING` would swallow part 2 without an error.
 */
describe('an id-less recording is still parked, not guessed at', () => {
  const corr = read(path.join('services', 'presentation', 'presentationRecordingCorrelation.ts'));

  it('the missing-id check precedes the single-candidate attribution', () => {
    const guard = corr.indexOf('if (!rec.providerFileId)');
    const single = corr.indexOf('if (candidates.length === 1)');
    expect(guard).toBeGreaterThan(-1);
    expect(single).toBeGreaterThan(-1);
    expect(guard).toBeLessThan(single);
  });

  it('no longer blames Zoom for a field this codebase dropped', () => {
    expect(corr).not.toContain('Zoom sent no per-file id');
  });
});
