import { INTERNS_ROOM_SLUG, PUBLIC_ROOM_SLUG } from '../../services/internship/internshipMeetingRooms';

/**
 * Argument parsing for `remintRoomZoomHosts.ts`, separate so it is tested without
 * running a script that re-mints production Zoom meetings.
 *
 * WHY THE SLUG LIST IS CLOSED. Re-minting is not just "mint a new link": the
 * cohort's `required_meetings[].join_url` has to be re-stamped in the same breath,
 * or the campus and the agenda keep serving a dead link. The only thing that does
 * both is `ensureInternshipMeetingRooms`, and it knows exactly two rooms. A slug it
 * does not handle would clear a room's link and never replace it, so an unknown slug
 * is refused rather than half-performed.
 *
 * WHY A TYPO MUST NOT PASS. The destructive half of this operation (clear the link)
 * is driven by these arguments. `--dry-rn` silently falling through to a real run,
 * or a misspelled host address reserving a host that does not exist and failing the
 * mint after the link is already gone, are both worse than an error message.
 */

/** The rooms `ensureInternshipMeetingRooms` can actually re-mint and re-stamp. */
export const REMINTABLE_SLUGS: readonly string[] = [INTERNS_ROOM_SLUG, PUBLIC_ROOM_SLUG];

export const REMINT_USAGE =
  `usage: remintRoomZoomHosts.ts <slug>=<host-email> [<slug>=<host-email>] [--dry-run]\n`
  + `  slugs: ${REMINTABLE_SLUGS.join(', ')}`;

export interface RemintArgs {
  /** slug -> the host its link must be minted under, in the order given. */
  targets: ReadonlyArray<{ slug: string; hostEmail: string }>;
  dryRun: boolean;
}

export type RemintParseResult =
  | { ok: true; args: RemintArgs }
  | { ok: false; error: string };

const fail = (msg: string): RemintParseResult => ({ ok: false, error: `${msg}\n${REMINT_USAGE}` });

export function parseRemintArgs(argv: readonly string[]): RemintParseResult {
  let dryRun = false;
  const pairs: Array<{ slug: string; hostEmail: string }> = [];
  const seen = new Set<string>();

  for (const raw of argv) {
    const token = String(raw ?? '').trim();
    if (!token) continue;

    if (token.startsWith('-')) {
      // Only one flag exists. Anything else that looks like a flag is a typo, and a
      // typo that falls through to a real run is the failure this guard exists for.
      if (token !== '--dry-run') return fail(`unknown option: ${token}`);
      if (dryRun) return fail('--dry-run given twice');
      dryRun = true;
      continue;
    }

    const eq = token.indexOf('=');
    if (eq < 0) return fail(`expected <slug>=<host-email>, got: ${token}`);
    const slug = token.slice(0, eq).trim();
    const hostEmail = token.slice(eq + 1).trim();
    if (!slug) return fail(`missing slug in: ${token}`);
    if (!hostEmail) return fail(`missing host email in: ${token}`);
    if (!REMINTABLE_SLUGS.includes(slug)) {
      return fail(`cannot re-mint slug "${slug}" - its schedule would not be re-stamped`);
    }
    // Not a full address validation, deliberately: Zoom is the authority on whether
    // the user exists, and the registry's verify step is what proves it. This only
    // catches the shape that is certainly wrong.
    if (!hostEmail.includes('@') || /\s/.test(hostEmail)) {
      return fail(`not a host email address: ${hostEmail}`);
    }
    if (seen.has(slug)) return fail(`slug given twice: ${slug}`);
    seen.add(slug);
    pairs.push({ slug, hostEmail });
  }

  if (pairs.length === 0) return fail('no <slug>=<host-email> pair given');

  // Two rooms on ONE host is the bug this script exists to fix. Accepting it would
  // let a re-mint reproduce the collision it is meant to end.
  const hosts = pairs.map((p) => p.hostEmail.toLowerCase());
  const dupeHost = hosts.find((h, i) => hosts.indexOf(h) !== i);
  if (dupeHost) return fail(`both rooms point at the same host (${dupeHost}) - that is the collision being fixed`);

  return { ok: true, args: { targets: pairs, dryRun } };
}
