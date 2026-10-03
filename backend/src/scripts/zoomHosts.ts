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
 *   npx ts-node src/scripts/zoomHosts.ts register <email> [label] [priority]
 *   npx ts-node src/scripts/zoomHosts.ts disable <email>
 *
 * `list` and `verify` are safe against production; `verify` writes only the
 * verified_at / last_error columns of the registry.
 *
 * Exit 0 when the command succeeded. `verify` exits 1 if NO host ended up
 * allocatable, because a pool nothing can use is a failure worth noticing in a cron.
 */

import {
  registerHost,
  listHosts,
  verifyAllHosts,
  allocatableHostEmails,
  type ZoomHostRow,
} from '../services/zoom/zoomHostRegistry';

function pad(s: unknown, n: number): string {
  const v = String(s ?? '');
  return v.length >= n ? v : v + ' '.repeat(n - v.length);
}

function renderTable(rows: ZoomHostRow[]): void {
  if (!rows.length) {
    console.log('  (no hosts registered — capacity is the single configured ZOOM_HOST_EMAIL)');
    return;
  }
  console.log('  ' + pad('HOST', 34) + pad('PRIO', 6) + pad('ENABLED', 9) + pad('VERIFIED', 10) + 'NOTE');
  for (const r of rows) {
    const verified = r.verified_at ? 'yes' : 'NO';
    const note = r.verified_at ? (r.credential_ref ? `cred=${r.credential_ref}` : '') : (r.last_error || 'never verified');
    console.log('  ' + pad(r.host_email, 34) + pad(r.priority, 6) + pad(r.enabled ? 'yes' : 'no', 9)
      + pad(verified, 10) + String(note).slice(0, 80));
  }
}

async function cmdList(): Promise<number> {
  const rows = await listHosts();
  console.log('Registered Zoom hosts');
  renderTable(rows);
  const usable = await allocatableHostEmails('practice');
  console.log('');
  console.log(`Concurrent practice sessions possible right now: ${Math.max(1, usable.length)}`);
  if (!usable.length) {
    console.log('  (nothing allocatable — every booking falls back to the configured default host)');
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
  const [email, label, priority] = argv;
  if (!email) {
    console.error('usage: zoomHosts.ts register <email> [label] [priority]');
    return 2;
  }
  await registerHost({
    hostEmail: email,
    label: label || null,
    purpose: 'any',
    priority: priority ? Number(priority) : 100,
  });
  // Registering deliberately does NOT make a host usable. It must still be proved.
  console.log(`Registered ${email}. It is NOT allocatable until it verifies — run:`);
  console.log('  npx ts-node src/scripts/zoomHosts.ts verify');
  return 0;
}

async function cmdDisable(argv: string[]): Promise<number> {
  const [email] = argv;
  if (!email) {
    console.error('usage: zoomHosts.ts disable <email>');
    return 2;
  }
  await registerHost({ hostEmail: email, enabled: false });
  console.log(`Disabled ${email}. In-flight reservations already held on it are untouched.`);
  return 0;
}

async function main(): Promise<void> {
  const [cmd, ...rest] = process.argv.slice(2);
  let code = 0;
  switch (cmd) {
    case 'list': code = await cmdList(); break;
    case 'verify': code = await cmdVerify(); break;
    case 'register': code = await cmdRegister(rest); break;
    case 'disable': code = await cmdDisable(rest); break;
    default:
      console.error('usage: zoomHosts.ts <list|verify|register|disable> [args]');
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
