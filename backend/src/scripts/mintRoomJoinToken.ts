/**
 * Give a room a stable join address to paste into a calendar invite.
 *
 *   npx ts-node src/scripts/mintRoomJoinToken.ts --slug=colaberry-ai-sessions
 *   npx ts-node src/scripts/mintRoomJoinToken.ts --slug=a --slug=b --dry-run
 *   npx ts-node src/scripts/mintRoomJoinToken.ts --slug=a --rotate
 *
 * IDEMPOTENT. A room that already has a token keeps it and the same URL is
 * printed again, because the point of the address is that it never changes.
 * Rotating is therefore an explicit `--rotate`, and it BREAKS every invite
 * already carrying the old URL — which is the one thing this whole mechanism
 * exists to avoid, so it says so before doing it.
 *
 * EXPLICIT PER ROOM, never a backfill across all of them. A token is a public
 * address; no room should acquire one because a script swept the table.
 */
import { env } from '../config/env';
import CommunityRoom from '../models/CommunityRoom';
import {
  ROOM_JOIN_TOKEN_KEY,
  generateJoinToken,
  joinUrlForToken,
  readJoinToken,
} from '../services/communityRooms/roomJoinToken';

interface Parsed {
  slugs: string[];
  rotate: boolean;
  dryRun: boolean;
  origin: string;
  error?: string;
}

export function parseArgs(argv: readonly string[]): Parsed {
  const out: Parsed = { slugs: [], rotate: false, dryRun: false, origin: env.publicAppUrl };
  for (const arg of argv) {
    if (arg === '--rotate') { out.rotate = true; continue; }
    if (arg === '--dry-run') { out.dryRun = true; continue; }
    const slug = /^--slug=(.+)$/.exec(arg);
    if (slug) { out.slugs.push(slug[1]); continue; }
    const origin = /^--origin=(.+)$/.exec(arg);
    if (origin) { out.origin = origin[1]; continue; }
    return { ...out, error: `unknown argument: ${arg}` };
  }
  if (!out.slugs.length) return { ...out, error: 'no --slug=<room-slug> given' };
  const dupe = out.slugs.find((s, i) => out.slugs.indexOf(s) !== i);
  if (dupe) return { ...out, error: `--slug=${dupe} given twice` };
  return out;
}

async function main(): Promise<number> {
  const args = parseArgs(process.argv.slice(2));
  if (args.error) {
    console.error(`mintRoomJoinToken: ${args.error}`);
    console.error('usage: --slug=<room-slug> [--slug=...] [--rotate] [--dry-run] [--origin=https://...]');
    return 1;
  }

  console.log(args.dryRun ? 'DRY RUN - nothing will be written' : 'APPLY');
  console.log(`origin: ${args.origin}`);
  console.log('');

  let failures = 0;
  for (const slug of args.slugs) {
    const room = await CommunityRoom.findOne({ where: { slug } });
    if (!room) {
      console.error(`  ${slug}: no such room - refusing`);
      failures++;
      continue;
    }

    const existing = readJoinToken(room.metadata);
    if (existing && !args.rotate) {
      console.log(`  ${slug}: already has a token, kept`);
      console.log(`      ${joinUrlForToken(args.origin, existing)}`);
      continue;
    }
    if (existing && args.rotate) {
      console.log(`  ${slug}: ROTATING - every calendar invite carrying the old URL will stop working`);
    }

    const token = generateJoinToken();
    if (!args.dryRun) {
      // Spread rather than assign into room.metadata: Sequelize does not track
      // a mutation inside a JSONB object, so an in-place edit saves nothing.
      await room.update({ metadata: { ...(room.metadata || {}), [ROOM_JOIN_TOKEN_KEY]: token } });
    }
    console.log(`  ${slug}: ${args.dryRun ? 'would mint' : 'minted'}`);
    console.log(`      ${joinUrlForToken(args.origin, token)}`);

    if (!room.meeting_link) {
      console.log('      note: this room has no meeting_link yet, so the address 404s until it does');
    }
  }

  if (failures) {
    console.error('');
    console.error(`${failures} room(s) could not be processed`);
    return 1;
  }
  return 0;
}

if (require.main === module) {
  main()
    .then((code) => process.exit(code))
    .catch((err) => {
      console.error(`mintRoomJoinToken failed: ${err?.message || err}`);
      process.exit(1);
    });
}
