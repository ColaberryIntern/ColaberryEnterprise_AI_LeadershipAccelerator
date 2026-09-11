import * as fs from 'fs';
import * as path from 'path';

/**
 * Shared by every test that asserts something about the boot sequence in
 * `server.ts` — schema ensure order, seed order, and (Phase 2) that a seed is
 * NOT boot-wired. Lifted out of the growth-journey schema test when that file
 * was split; the routing-audit and routing-action tests need the same helper
 * and copying it would have meant three drifting versions.
 */
const serverSource = fs.readFileSync(
  path.join(__dirname, '..', '..', '..', 'server.ts'),
  'utf8',
);

/**
 * Offset of an ACTIVE occurrence of a boot call — one that is not commented out.
 * Returns -1 when every occurrence is commented out or none exists.
 *
 * A plain `indexOf` matches the text, not the call. An independent review proved
 * it: commenting out the seed invocation while leaving the line in place passed
 * all 40 tests. The consequence of a disabled boot call is fail-closed — an
 * empty registry, and every brand resolving `program_not_active` — but "fails
 * safe" is not the same as "noticed", and a boot step silently switched off is
 * exactly the kind of thing that stays switched off.
 */
export function activeBootCall(needle: string): number {
  let from = 0;
  for (;;) {
    const at = serverSource.indexOf(needle, from);
    if (at === -1) return -1;
    const lineStart = serverSource.lastIndexOf('\n', at) + 1;
    if (!serverSource.slice(lineStart, at).includes('//')) return at;
    from = at + needle.length;
  }
}

/** The raw server source, for tests that need to assert on something other than a call. */
export function serverSourceText(): string {
  return serverSource;
}
