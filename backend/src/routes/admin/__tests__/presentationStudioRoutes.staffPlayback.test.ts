import fs from 'fs';
import path from 'path';

/**
 * THE GUARD ON THE STAFF PLAYBACK ROUTE, CHECKED WHERE IT IS USED.
 *
 * `isStaffTicket` has its own unit tests and they all pass. That proves nothing
 * about this route: four times in this workstream a correct, well-tested unit sat
 * behind missing wiring — the audience-aware playback resolver with eleven green
 * tests and no caller, the feed DTO that never carried the field its twenty tests
 * fed in by hand, the posters generated on disk that no panel requested, and the
 * review queue in this very PR, written on 2026-10-18 with no route at all.
 *
 * A unit test cannot see its caller. These assertions are about the caller.
 */

const ROUTES = path.join(__dirname, '..', 'presentationStudioRoutes.ts');
const SRC = fs.readFileSync(ROUTES, 'utf8');

/** The body of the one function that serves recording bytes to a reviewer. */
const SERVE = (() => {
  const start = SRC.indexOf('async function serveStaffRecording');
  expect(start).toBeGreaterThan(-1);
  // To the next top-level declaration.
  const after = SRC.indexOf('\nrouter.get(', start);
  return SRC.slice(start, after > -1 ? after : SRC.length);
})();

describe('positive control', () => {
  it('found the handler and the two routes that use it', () => {
    expect(SERVE.length).toBeGreaterThan(400);
    expect(SRC).toContain("'/api/admin/presentation/recordings/:recordingId/file'");
    expect(SRC).toContain("'/api/admin/presentation/recordings/:recordingId/thumbnail'");
  });
});

describe('a learner ticket must not open the staff route', () => {
  it('the handler calls isStaffTicket, not just verifyRecordingTicket', () => {
    // Verifying the signature only proves THIS SERVER minted it. A learner's own
    // ticket is validly signed; the staff claim is what separates them.
    expect(SERVE).toContain('verifyRecordingTicket');
    expect(SERVE).toContain('isStaffTicket(claims)');
  });

  it('refuses when the ticket is not a staff one', () => {
    expect(SERVE).toMatch(/!isStaffTicket\(claims\)/);
  });

  it('still binds the ticket to the recording in the path', () => {
    // Without this a staff ticket for one recording would open every recording.
    expect(SERVE).toMatch(/claims\.recordingId !== String\(req\.params\.recordingId\)/);
  });

  it('answers 404 for every refusal, so a guessed id is not confirmed', () => {
    const refusal = SERVE.slice(SERVE.indexOf('isStaffTicket'));
    expect(refusal).toContain("res.status(404).json({ error: 'Not found' })");
    expect(refusal).not.toContain('res.status(403)');
  });
});

describe('both routes carry both guards', () => {
  const lines = SRC.split('\n').filter((l) => /^\s*router\.get\('\/api\/admin\/presentation\/recordings\//.test(l));

  it('found both', () => {
    expect(lines).toHaveLength(2);
  });

  it.each(lines)('%s requires an admin session', (line) => {
    // The session guards the queue endpoint that MINTS the ticket; the ticket
    // guards the bytes. Neither alone is enough, so both are asserted.
    expect(line).toContain('requireAdmin');
  });
});

describe('the review queue and decline routes', () => {
  it('expose pending work, which nothing did before', () => {
    expect(SRC).toContain("'/api/admin/presentation/showcases/pending'");
    expect(SRC).toContain('listPendingShowcases');
  });

  it('pass the staff identity into the queue, so the ticket names who it was for', () => {
    expect(SRC).toMatch(/listPendingShowcases\(staffIdentity\)/);
  });

  it('require a reason to decline, enforced at the boundary', () => {
    expect(SRC).toContain('declineBody');
    expect(SRC).toMatch(/reason: z\.string\(\)\.min\(1\)/);
  });

  it('declines through the lifecycle service rather than its own UPDATE', () => {
    expect(SRC).toContain('staffDecline');
  });
});
