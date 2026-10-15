import fs from 'fs';
import path from 'path';

/**
 * MOUNT ORDER IS THE WHOLE FIX, AND NOTHING ELSE CHECKS IT.
 *
 * `participantRoutes` gates the entire `/api/portal/projects` prefix:
 *
 *     router.use('/api/portal/projects', requireParticipant, requireContentEntitlement('projects'));
 *
 * Every path under that prefix then demands a bearer token regardless of what the
 * individual route declares. The playback route cannot satisfy it — a `<video src>`
 * issues a plain browser GET with no Authorization header — so mounted after the
 * gate it returns `{"error":"Authentication required"}` and never runs. That is
 * exactly what production did on 2026-10-15, with the route correct, the ticket
 * correct, 21 ticket tests green and the deploy marker present.
 *
 * This is the third "correct route, unreachable because of an earlier mount" in this
 * file's history. The ordering is load-bearing and invisible: move the mount one line
 * down and every other test still passes while playback silently breaks.
 *
 * Read as source text on purpose. Booting the real router to assert ordering would
 * need the whole app — database, env, every service — and the thing being protected
 * is a property of the file, not of a running request.
 */

const ROUTES = path.join(__dirname, '..');
const participantSrc = fs.readFileSync(path.join(ROUTES, 'participantRoutes.ts'), 'utf8');

/**
 * Source with block and line comments removed.
 *
 * Needed because these files document the very pattern they must not contain: the
 * playback router's header quotes the `requireParticipant` gate line in full to
 * explain why it exists. Asserting on raw text matches the explanation.
 */
const codeOnly = (src: string): string =>
  src
    .replace(/\/\*[\s\S]*?\*\//g, ' ')
    .split('\n')
    .map((line) => line.replace(/\/\/.*$/, ''))
    .join('\n');

const MOUNT = 'router.use(presentationPlaybackRoutes);';
const GATE = "router.use('/api/portal/projects', requireParticipant, requireContentEntitlement('projects'));";

describe('the playback router is mounted before the projects gate', () => {
  it('finds both lines — a rename must fail loudly, not pass vacuously', () => {
    // Positive control. Without it, renaming either line makes indexOf return -1 for
    // both and the ordering assertion below compares two -1s and passes.
    expect(participantSrc).toContain(MOUNT);
    expect(participantSrc).toContain(GATE);
  });

  it('THE FIX: the mount precedes the gate', () => {
    expect(participantSrc.indexOf(MOUNT)).toBeLessThan(participantSrc.indexOf(GATE));
  });

  it('the gate itself is still in place for every other project path', () => {
    // The fix must not have been "remove the gate". Playback steps around it with a
    // signed ticket; nothing else should.
    expect(participantSrc).toContain('requireContentEntitlement');
    expect(participantSrc).toMatch(/router\.use\('\/api\/portal\/projects',\s*requireParticipant/);
  });

  it('is mounted exactly once', () => {
    expect(participantSrc.split(MOUNT).length - 1).toBe(1);
  });
});

/**
 * The playback route must NOT live in `presentationPortalRoutes`, which is mounted
 * after the gate. Putting it back there would reintroduce the bug while looking like
 * a tidy-up — the file is "where the Studio routes go", so it is the obvious wrong
 * place for the next person to move it.
 */
describe('the playback route lives in its own router', () => {
  const playbackSrc = fs.readFileSync(path.join(ROUTES, 'presentationPlaybackRoutes.ts'), 'utf8');
  const portalSrc = fs.readFileSync(path.join(ROUTES, 'presentationPortalRoutes.ts'), 'utf8');

  it('the file route is defined in presentationPlaybackRoutes', () => {
    expect(playbackSrc).toMatch(/recordings\/:recordingId\/file/);
  });

  it('and NOT in the gated presentationPortalRoutes', () => {
    expect(portalSrc).not.toMatch(/recordings\/:recordingId\/file/);
  });

  it('applies no requireParticipant middleware — the ticket is the credential here', () => {
    // A bearer guard on this route is unsatisfiable by a video element: its presence
    // would mean somebody "restored" an auth check that only breaks playback.
    //
    // COMMENTS ARE STRIPPED FIRST, and that is the point rather than a convenience.
    // This file's header explains the prefix gate at length and quotes the offending
    // `router.use('/api/portal/projects', requireParticipant, ...)` line verbatim, so
    // both a `not.toContain` and a naive regex match the DOCUMENTATION and fail on a
    // file that is perfectly correct. Twice, on the first two attempts at this test.
    // The property is about code, so the assertion has to be about code.
    expect(codeOnly(playbackSrc)).not.toMatch(/requireParticipant/);
  });

  it('the comment stripper actually removes comments — otherwise the test above is vacuous', () => {
    // Positive control. If `codeOnly` returned '' for everything, the assertion above
    // would pass against literally any file.
    expect(codeOnly('/* a */ const x = 1; // b')).toContain('const x = 1;');
    expect(codeOnly('/* requireParticipant */')).not.toContain('requireParticipant');
    expect(codeOnly('// requireParticipant')).not.toContain('requireParticipant');
    // And the real file still has its code in it.
    expect(codeOnly(playbackSrc)).toContain('router.get');
  });

  it('still verifies the ticket AND the ownership query', () => {
    // Neither alone is sufficient: the ticket proves the link was issued to this
    // viewer, the query proves the recording is actually theirs.
    expect(playbackSrc).toContain('verifyRecordingTicket');
    expect(playbackSrc).toContain('resolvePlayableRecording');
  });
});
