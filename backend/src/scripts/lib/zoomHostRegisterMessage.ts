/**
 * What `zoomHosts.ts register` says after it writes.
 *
 * THE BUG THIS FIXES. Registering used to always print "It is NOT allocatable until
 * it verifies", because registering a NEW host genuinely does not make it usable.
 * But `registerHost` now preserves `verified_at` on re-registration (that is the
 * whole point of the COALESCE upsert), so re-pinning an already-verified host to a
 * new purpose printed a line saying it was unusable directly above a table showing
 * `verified=yes`. An operator pinning a host immediately before an irreversible
 * re-mint has to be able to trust that output, and a message that contradicts the
 * row underneath it is worse than no message.
 *
 * Pure, so the distinction is pinned by a test rather than by reading it once.
 */

export interface RegisterMessageInput {
  email: string;
  purpose: string;
  /** The host's verification timestamp AFTER the write, or null if it has none. */
  verifiedAt: Date | string | null;
}

export function registerMessageLines(input: RegisterMessageInput): string[] {
  const { email, purpose, verifiedAt } = input;
  const lines: string[] = [];

  if (verifiedAt) {
    // Re-registration kept the proof, so the host is usable right now. Say that
    // plainly: this is the path an operator takes before a re-mint.
    lines.push(`Registered ${email} for purpose "${purpose}". Its existing verification was kept, so it is allocatable now.`);
    lines.push('Re-verify only if its Zoom account changed:');
  } else {
    lines.push(`Registered ${email} for purpose "${purpose}". It is NOT allocatable until it verifies — run:`);
  }
  lines.push('  npx ts-node src/scripts/zoomHosts.ts verify');

  if (purpose === 'any') {
    // Said at the moment the choice is made, because by the time it shows up in
    // `rooms` a room already holds the link and re-minting changes its join URL.
    lines.push('');
    lines.push('"any" means BOTH a room and a rehearsal can take this host, and they');
    lines.push('prefer the same one. With more than one host, use --purpose=room or');
    lines.push('--purpose=practice instead.');
  }

  return lines;
}
