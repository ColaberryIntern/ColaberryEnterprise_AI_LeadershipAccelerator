/**
 * The operator tool for the Zoom host pool: register hosts, prove them, see the truth.
 *
 * WHY THIS EXISTS AS A SCRIPT. The pool raises practice capacity from one concurrent
 * session to however many Zoom hosts genuinely work. Which hosts genuinely work is a
 * question only Zoom can answer, and the answer changes when someone edits the app's
 * scopes or adds a licence. Encoding a guess in a seed file would be the same mistake
 * as the capacity constant this whole feature replaced.
 *
 * IT NEVER CREATES A MEETING. Verification is a read. Creating one to prove a host
 * would scatter real meetings across accounts that also run live classes.
 *
 * IT HOLDS NO SECRETS. Only addresses. A host in a different Zoom account needs its
 * own credential, and that is referenced by name (`credential_ref`), never stored here.
 *
 * ── Running it ────────────────────────────────────────────────────────────────────
 *
 *   npx ts-node src/scripts/zoomHosts.ts list
 *   npx ts-node src/scripts/zoomHosts.ts verify
 *   npx ts-node src/scripts/zoomHosts.ts rooms
 *   npx ts-node src/scripts/zoomHosts.ts register <email> [label] [priority] [--purpose=any|room|practice]
 *   npx ts-node src/scripts/zoomHosts.ts disable <email>
 *
 * `list`, `verify` and `rooms` are safe against production; `verify` writes only the
 * verified_at / last_error columns of the registry, and `rooms` writes nothing.
 *
 * ── SPLIT THE POOL BY PURPOSE ONCE IT HOLDS MORE THAN ONE HOST ───────────────────
 *
 * Two allocators draw from this pool and neither can see the other's claim: a room
 * keeps its host permanently, a rehearsal borrows one for a window. A host registered
 * `any` matches both, and both pick the first viable host in priority order — so they
 * prefer the SAME host rather than colliding occasionally. Give the always-open rooms
 * their own hosts and leave the rest for rehearsals:
 *
 *   register room-a@example.com    --purpose=room
 *   register rehearsal-a@example.com --purpose=practice
 *
 * `rooms` reports any host still exposed to both, and exits non-zero while one is.
 *
 * Exit 0 when the command succeeded. `verify` exits 1 if NO host ended up
 * allocatable, because a pool nothing can use is a failure worth noticing in a cron.
 */

import {
  registerHost,
  listHosts,
  verifyAllHosts,
  allocatableHostEmails,
  crossPurposeHosts,
  setHostEnabled,
  PRACTICE_HOST_PURPOSE,
  type ZoomHostRow,
} from '../services/zoom/zoomHostRegistry';
import { roomsSharingAHost, roomHostUsage, ROOM_HOST_PURPOSE } from '../services/zoom/roomHostAllocator';
import { parseRegisterArgs, REGISTER_USAGE } from './lib/zoomHostArgs';
import { registerMessageLines } from './lib/zoomHostRegisterMessage';

function pad(s: unknown, n: number): string {
  const v = String(s ?? '');
  return v.length >= n ? v : v + ' '.repeat(n - v.length);
}

function renderTable(rows: ZoomHostRow[]): void {
  if (!rows.length) {
    console.log('  (no hosts registered — capacity is the single configured ZOOM_HOST_EMAIL)');
    return;
  }
  // PURPOSE IS A COLUMN AN OPERATOR MUST BE ABLE TO SEE. It decides which allocator
  // may take a host, so a table that hides it cannot answer the one question this
  // tool exists to answer.
  console.log('  ' + pad('HOST', 34) + pad('PURPOSE', 10) + pad('PRIO', 6) + pad('ENABLED', 9) + pad('VERIFIED', 10) + 'NOTE');
  for (const r of rows) {
    const verified = r.verified_at ? 'yes' : 'NO';
    const note = r.verified_at ? (r.credential_ref ? `cred=${r.credential_ref}` : '') : (r.last_error || 'never verified');
    console.log('  ' + pad(r.host_email, 34) + pad(r.purpose, 10) + pad(r.priority, 6) + pad(r.enabled ? 'yes' : 'no', 9)
      + pad(verified, 10) + String(note).slice(0, 80));
  }
}

async function cmdList(): Promise<number> {
  const rows = await listHosts();
  console.log('Registered Zoom hosts');
  renderTable(rows);

  // BOTH CAPACITIES, because they are different numbers drawn from one pool and
  // reporting only one made the other invisible.
  const forPractice = await allocatableHostEmails(PRACTICE_HOST_PURPOSE);
  const forRooms = await allocatableHostEmails(ROOM_HOST_PURPOSE);
  console.log('');
  console.log(`Concurrent practice sessions possible right now: ${Math.max(1, forPractice.length)}`);
  console.log(`Rooms that can be live at once right now:        ${Math.max(1, forRooms.length)}`);
  if (!forPractice.length && !forRooms.length) {
    console.log('  (nothing allocatable — everything falls back to the configured default host)');
  }

  const exposed = crossPurposeHosts(rows, await roomHostUsage());
  if (exposed.length) {
    console.log('');
    console.log(`${exposed.length} host(s) can be taken from a room by a rehearsal. See: zoomHosts.ts rooms`);
  }
  return 0;
}

async function cmdVerify(): Promise<number> {
  const results = await verifyAllHosts();
  if (!results.length) {
    console.log('No hosts registered. Nothing to verify.');
    return 0;
  }
  console.log('Verification results');
  let ok = 0;
  let scopeBlocked = 0;
  for (const r of results) {
    if (r.ok) {
      ok += 1;
      console.log('  ' + pad('OK', 16) + r.hostEmail);
    } else {
      if (r.reason === 'missing_scope') scopeBlocked += 1;
      console.log('  ' + pad(r.reason.toUpperCase(), 16) + pad(r.hostEmail, 34) + r.detail.slice(0, 90));
    }
  }
  console.log('');
  if (scopeBlocked) {
    // The single most common cause, and the one with a two-minute fix. Saying
    // "verification failed" without this sends someone hunting the wrong problem.
    console.log(`${scopeBlocked} host(s) could not be checked because the Zoom app lacks read scopes.`);
    console.log('Add these to the Server-to-Server app, then RE-ACTIVATE it:');
    console.log('  user:read:list_users:admin');
    console.log('  meeting:read:list_meetings:admin');
    console.log('  meeting:read:meeting:admin');
    console.log('  meeting:update:meeting:admin');
    console.log('  meeting:delete:meeting:admin');
    console.log('A scope edit does not take effect until the app is re-activated.');
  }
  console.log(`${ok} of ${results.length} host(s) are usable.`);
  return ok > 0 ? 0 : 1;
}

async function cmdRegister(argv: string[]): Promise<number> {
  const parsed = parseRegisterArgs(argv);
  if (!parsed.ok) {
    console.error(parsed.error);
    return 2;
  }
  const { email, label, priority, purpose } = parsed.args;
  await registerHost({ hostEmail: email, label, purpose, priority });
  // Read back rather than assume: registering a NEW host leaves it unverified, but
  // re-registering an existing one PRESERVES its verification, and the operator needs
  // to know which of the two just happened before relying on the host.
  const row = (await listHosts()).find((h) => h.host_email.toLowerCase() === email.toLowerCase());
  for (const line of registerMessageLines({ email, purpose, verifiedAt: row?.verified_at ?? null })) {
    console.log(line);
  }
  return 0;
}

async function cmdDisable(argv: string[]): Promise<number> {
  const [email] = argv;
  if (!email) {
    console.error('usage: zoomHosts.ts disable <email>');
    return 2;
  }
  await setHostEnabled(email, false);
  console.log(`Disabled ${email}. In-flight reservations already held on it are untouched.`);
  console.log('Its purpose, label and priority are kept, so re-enabling restores it as it was.');
  return 0;
}

/**
 * Everything that can stop a room going live, in one place.
 *
 * TWO WAYS A ROOM LOSES ITS HOST, and they need different answers:
 *
 *   1. ANOTHER ROOM has the same host. A Zoom user hosts one meeting at a time, so
 *      two rooms on one host can never both be live — the condition that made the
 *      Monday standup and the public AI session mutually exclusive. The answer is
 *      another host.
 *   2. A REHEARSAL can take the host, because the host's purpose is `any` and the
 *      practice allocator matches it too. The answer is a purpose, not a host — and
 *      it is free, which is why it is reported separately rather than folded in.
 *
 * Exits 1 while either holds, so a cron notices before a person does. A non-zero exit
 * is an OPERATIONAL fact, not a code fault.
 */
async function cmdRooms(): Promise<number> {
  const shared = await roomsSharingAHost();
  const exposed = crossPurposeHosts(await listHosts(), await roomHostUsage());

  if (!shared.length && !exposed.length) {
    console.log('No host carries more than one room, and no room can be taken by a rehearsal.');
    console.log('Every room can be live at once.');
    return 0;
  }

  if (shared.length) {
    console.log('Rooms sharing a Zoom host — only ONE of each group can be live at a time:');
    for (const row of shared) {
      console.log('');
      console.log('  ' + row.host_email + '  (' + row.room_count + ' rooms)');
      for (const name of row.rooms) console.log('    - ' + name);
    }
    console.log('');
    console.log('Add and verify another host, then re-mint the extra rooms:');
    console.log('  npx ts-node src/scripts/zoomHosts.ts register <email> --purpose=room');
    console.log('  npx ts-node src/scripts/zoomHosts.ts verify');
    console.log('Re-minting changes a room\'s join URL, so announce it before you do.');
  }

  if (exposed.length) {
    if (shared.length) console.log('');
    console.log('Hosts a rehearsal can take out from under a live room (purpose is "any"):');
    for (const row of exposed) {
      console.log('  ' + row.host_email + '  (carries ' + row.room_count
        + (row.room_count === 1 ? ' room)' : ' rooms)'));
    }
    console.log('');
    console.log('Pin each one to a single allocator. This changes no join URL:');
    for (const row of exposed) {
      console.log('  npx ts-node src/scripts/zoomHosts.ts register ' + row.host_email + ' --purpose=room');
    }
  }
  return 1;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  let code = 0;
  switch (cmd) {
    case 'list': code = await cmdList(); break;
    case 'verify': code = await cmdVerify(); break;
    case 'rooms': code = await cmdRooms(); break;
    case 'register': code = await cmdRegister(rest); break;
    case 'disable': code = await cmdDisable(rest); break;
    default:
      console.error('usage: zoomHosts.ts <list|verify|rooms|register|disable> [args]');
      code = 2;
  }
  process.exit(code);
}

main().catch((err) => {
  console.error(JSON.stringify({
    timestamp: new Date().toISOString(), level: 'error', service: 'backend',
    event: 'zoom_hosts_script_failed', outcome: 'failure',
    error_class: err?.constructor?.name ?? 'Error', context: { message: String(err?.message || err) },
  }));
  process.exit(1);
});
