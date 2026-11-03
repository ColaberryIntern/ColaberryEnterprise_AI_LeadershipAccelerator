import { registerMessageLines } from '../zoomHostRegisterMessage';

/**
 * THE DEFECT THIS PINS. Registering always printed "It is NOT allocatable until it
 * verifies", which is true for a new host and FALSE for a re-registration — because
 * the upsert now preserves `verified_at` on purpose. Pinning a verified host to a new
 * purpose printed that line directly above a table reading `verified=yes`, and an
 * operator about to run an irreversible re-mint has to be able to trust the output.
 */
describe('registerMessageLines', () => {
  const lines = (over: Partial<Parameters<typeof registerMessageLines>[0]> = {}) =>
    registerMessageLines({ email: 'a@c.com', purpose: 'room', verifiedAt: null, ...over }).join('\n');

  it('tells a NEW host it is not usable yet', () => {
    const out = lines({ verifiedAt: null });
    expect(out).toContain('NOT allocatable until it verifies');
    expect(out).not.toContain('allocatable now');
  });

  it('tells a re-registered VERIFIED host that it is usable right now', () => {
    const out = lines({ verifiedAt: new Date('2026-11-02T12:00:00Z') });
    expect(out).toContain('existing verification was kept');
    expect(out).toContain('allocatable now');
    // The contradiction itself is what has to be gone.
    expect(out).not.toContain('NOT allocatable');
  });

  it('accepts the timestamp as a string, which is how a driver may hand it over', () => {
    expect(lines({ verifiedAt: '2026-11-02T12:00:00Z' })).toContain('allocatable now');
  });

  it('points at the verify command either way, so the path is never lost', () => {
    expect(lines({ verifiedAt: null })).toContain('zoomHosts.ts verify');
    expect(lines({ verifiedAt: new Date() })).toContain('zoomHosts.ts verify');
  });

  it('warns about "any" regardless of verification, because the hazard is the purpose', () => {
    for (const verifiedAt of [null, new Date()]) {
      const out = lines({ purpose: 'any', verifiedAt });
      expect(out).toContain('BOTH a room and a rehearsal');
      expect(out).toContain('--purpose=room');
    }
  });

  it('does NOT warn for a purpose that is already split', () => {
    expect(lines({ purpose: 'room' })).not.toContain('BOTH a room and a rehearsal');
    expect(lines({ purpose: 'practice' })).not.toContain('BOTH a room and a rehearsal');
  });

  it('names the host and the purpose it was just set to', () => {
    const out = lines({ email: 'program.101@colaberry.com', purpose: 'room', verifiedAt: new Date() });
    expect(out).toContain('program.101@colaberry.com');
    expect(out).toContain('"room"');
  });
});
