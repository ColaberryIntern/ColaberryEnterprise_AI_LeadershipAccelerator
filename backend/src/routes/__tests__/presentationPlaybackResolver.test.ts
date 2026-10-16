import fs from 'fs';
import path from 'path';

/**
 * THE ROUTE MUST USE THE AUDIENCE-AWARE RESOLVER, AND NOTHING ELSE NOTICED.
 *
 * `recordingPlayback.ts` exports two resolvers. `resolvePlayableRecording` proves
 * OWNERSHIP — right for a private rehearsal. `resolveViewableRecording` tries the
 * owner path first and then applies `canView` — the one a published demo needs.
 *
 * The playback route shipped calling the owner-only one. Every peer who clicked a
 * published demo got a 404 underneath a page captioned "Public to your cohort", and
 * the eleven refusal tests in `recordingPlaybackAudience.test.ts` all passed the
 * whole time, because they test the function rather than its callers. The audience
 * resolver had no caller at all — written, tested, unreachable, which is the same
 * shape as the deck-generate button that existed only in a comment.
 *
 * So this test asserts the WIRING, not the behaviour: which of the two the route
 * reaches for. Read as source text for the same reason the mount-order test is —
 * booting the real router would need the whole app, and the property being protected
 * is a property of the file.
 */

const ROUTE = path.join(__dirname, '..', 'presentationPlaybackRoutes.ts');
const src = fs.readFileSync(ROUTE, 'utf8');

/**
 * Source with comments stripped. The header above the route explains the mistake by
 * NAMING the owner-only resolver, so a raw-text assertion would match the
 * explanation and fail on a correct file.
 */
const codeOnly = (s: string): string =>
  s
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');

const code = codeOnly(src);

describe('the playback route resolves through the audience rule', () => {
  it('strips comments but keeps the code — a positive control', () => {
    // Without this, a stripper that returned '' would make every assertion below
    // pass vacuously.
    expect(code).toContain('router.get(');
    expect(code).toContain('verifyRecordingTicket');
    // And the stripping genuinely happened: the header's prose is gone.
    expect(code).not.toContain('eleven refusal tests');
  });

  it('calls resolveViewableRecording', () => {
    expect(code).toContain('resolveViewableRecording');
  });

  it('does NOT call the owner-only resolver', () => {
    // The regression this file exists for. A revert to the owner path is invisible
    // in every other test in the repository.
    expect(code).not.toContain('resolvePlayableRecording');
  });

  it('passes the ticket enrollment as the viewer, never a route param', () => {
    // The viewer identity has to come from the signed ticket. Taking it from the URL
    // would let anyone watch anything by editing a path segment.
    expect(code).toMatch(/resolveViewableRecording\(\s*claims\.enrollmentId/);
  });

  it('still records the view against the ticket holder and the owner', () => {
    // Views are distinct PEOPLE and exclude the owner, which needs both ids at the
    // call site. Dropping `ownerEnrollmentId` here would start counting a learner's
    // own rehearsals as an audience.
    // `[\s\S]*?` rather than `[^)]*`: the first argument is itself a call,
    // `String(req.params.recordingId)`, so a pattern that cannot cross a closing
    // paren never reaches the two arguments this test is about.
    expect(code).toMatch(/recordView\([\s\S]*?claims\.enrollmentId[\s\S]*?ownerEnrollmentId/);
  });

  it('does not await the view write', () => {
    // Awaiting it puts a database round trip in front of every byte range a player
    // requests, and a failure there would turn a working video into an error page.
    expect(code).toContain('void import');
    expect(code).not.toMatch(/await\s+recordView/);
  });
});
