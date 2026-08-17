/**
 * The student-unblock send batch.
 *
 * Runs from source with ts-node — no build, no deploy, no container:
 *
 *   npx ts-node --transpile-only backend/src/scripts/sendStudentUnblockBatch.ts \
 *     --run-dir <loop-architect run dir>                          # DRY RUN (default)
 *
 *   MANDRILL_API_KEY=... npx ts-node --transpile-only ... \
 *     --run-dir <dir> --init-ledger --send                        # canary, then stops
 *
 *   MANDRILL_API_KEY=... npx ts-node --transpile-only ... \
 *     --run-dir <dir> --send --canary-confirmed --batch-size 5     # the remaining 24
 *
 *   ... --run-dir <dir> --status                                  # who has been sent
 *   ... --run-dir <dir> --release <key> --operator ali --reason "process killed"
 *
 * `--dry-run` is the DEFAULT. Without `--send` nothing is claimed and nothing
 * is sent. There is no short form of `--send`.
 *
 * ── THE TWO LEDGERS ─────────────────────────────────────────────────────────
 *
 *   --ledger file  (default)  a fsync'd append-only JSONL in the run directory.
 *                             Guards a crash-and-rerun. Does NOT guard two
 *                             processes racing — see fileSendLedger.ts.
 *   --ledger db               the Postgres table with a UNIQUE index, which
 *                             does. Requires ensureEmailSendLedgerSchema to
 *                             have run in the target environment, so it is
 *                             unusable until that PR is merged and deployed.
 *
 * The DB modules are imported lazily so the default path needs no DATABASE_URL.
 *
 * ── FAILURE-FIRST NOTES (CLAUDE.md) ─────────────────────────────────────────
 *   - A send fails?  The key is recorded `failed` (retryable) and the WHOLE RUN
 *     aborts. No automatic retry: an auto-retry across a network boundary is
 *     how one apology becomes two.
 *   - Process dies mid-send?  The key stays `claimed` and every later run
 *     refuses it until an operator checks Mandrill's log and runs --release.
 *   - Operator wants to stop mid-batch?  `touch <run-dir>/HALT`.
 *   - NOT handled: Mandrill accepting a message and then bouncing it. That is a
 *     delivery question for the inbox watcher, not for this script.
 */
import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import {
  renderBody,
  runBatch,
  type BatchDeps,
  type ManifestEntry,
  type ParsedDraft,
} from './lib/studentUnblockBatch';
import { computeIdempotencyKey } from '../services/email/idempotencyKey';
import { FileSendLedger, sendOnceViaFile } from '../services/email/fileSendLedger';
import {
  assertSendSafety,
  buildCampaignMessage,
  createMandrillTransport,
  sendCampaignMessage,
} from '../services/email/campaignTransport';

const BUSINESS_EVENT_ID = 'story000-unblock-2026-08-17';

const argOf = (flag: string): string | undefined => {
  const i = process.argv.indexOf(flag);
  return i >= 0 ? process.argv[i + 1] : undefined;
};
const hasFlag = (flag: string) => process.argv.includes(flag);

function log(event: string, context: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    level: 'info',
    service: 'student-unblock-batch',
    event,
    outcome: 'success',
    context,
  }));
}

/** Front matter, then the body that follows the `BODY` marker. */
export function parseDraft(text: string, file: string): ParsedDraft {
  const fm = /^---\n([\s\S]*?)\n---\n/.exec(text);
  if (!fm) throw new Error(`${file}: no front matter`);
  const fields: Record<string, string> = {};
  for (const line of fm[1].split('\n')) {
    const m = /^([a-z_]+):\s*(.*)$/.exec(line.trim());
    if (m) fields[m[1]] = m[2].trim();
  }
  const marker = '\nBODY\n';
  const bodyIdx = text.indexOf(marker);
  if (bodyIdx < 0) throw new Error(`${file}: no BODY marker`);
  const body = text.slice(bodyIdx + marker.length);
  if (!body.trim()) throw new Error(`${file}: empty body`);
  for (const required of ['to', 'subject', 'business_event_id', 'idempotency_key']) {
    if (!fields[required]) throw new Error(`${file}: missing front matter '${required}'`);
  }
  return {
    to: fields.to,
    subject: fields.subject,
    businessEventId: fields.business_event_id,
    idempotencyKey: fields.idempotency_key,
    status: fields.status ?? '',
    body,
  };
}

function requirePaths(runDir: string) {
  const paths = {
    draftsDir: path.join(runDir, 'drafts'),
    peoplePath: path.join(runDir, 'people.json'),
    gatePath: path.join(runDir, 'verify-drafts.js'),
    manifestPath: path.join(runDir, 'drafts-manifest.json'),
  };
  for (const p of Object.values(paths)) {
    if (!fs.existsSync(p)) {
      console.error(`missing required run artefact: ${p}`);
      process.exit(2);
    }
  }
  return paths;
}

async function main(): Promise<void> {
  const runDir = argOf('--run-dir');
  if (!runDir || !fs.existsSync(runDir)) {
    console.error('--run-dir <loop-architect run directory> is required');
    process.exit(2);
  }
  const { draftsDir, peoplePath, gatePath, manifestPath } = requirePaths(runDir);
  const manifest: ManifestEntry[] = JSON.parse(fs.readFileSync(manifestPath, 'utf8'));

  const dryRun = !hasFlag('--send');
  const canaryConfirmed = hasFlag('--canary-confirmed');
  const batchSize = Number(argOf('--batch-size') ?? 5);
  const ledgerKind = argOf('--ledger') ?? 'file';

  if (ledgerKind === 'db') {
    const { assertEmailSendLedgerSchema } = await import('../db/ensureEmailSendLedgerSchema');
    const schema = await assertEmailSendLedgerSchema();
    if (!schema.ok) {
      console.error(`REFUSING TO SEND: email_send_ledger not ready — ${schema.missing.join(', ')}`);
      process.exit(3);
    }
  } else if (ledgerKind !== 'file') {
    console.error(`unknown --ledger ${ledgerKind} (expected "file" or "db")`);
    process.exit(2);
  }

  const wantsStatus = hasFlag('--status');
  const releaseKey = argOf('--release');
  const ledgerPath = path.join(runDir, 'send-ledger.jsonl');

  // A dry run opens NOTHING: no ledger file, no lock. Creating a ledger as a
  // side effect of a dry run would quietly satisfy the --init-ledger guard, so
  // the first REAL run would no longer have to assert that it is the first.
  const needsLedger = ledgerKind === 'file' && (!dryRun || wantsStatus || Boolean(releaseKey));
  if (wantsStatus && !fs.existsSync(ledgerPath)) {
    console.log(JSON.stringify({ ledger: ledgerKind, exists: false, summary: null }, null, 2));
    return;
  }
  const ledger = needsLedger
    ? FileSendLedger.open(runDir, { create: hasFlag('--init-ledger') })
    : null;

  try {
    if (wantsStatus) {
      console.log(JSON.stringify({ ledger: ledgerKind, exists: true, summary: ledger?.summary() ?? null }, null, 2));
      return;
    }

    if (releaseKey) {
      const operator = argOf('--operator');
      const reason = argOf('--reason');
      if (!operator || !reason) {
        console.error('--release requires --operator <name> and --reason "<why>"');
        process.exit(2);
      }
      const result = ledger!.release(releaseKey, operator, reason);
      console.log(JSON.stringify({ released: result.released, key: releaseKey }));
      if (!result.released) {
        console.error('Not released. Only a stranded `claimed` key can be released; a `sent` key never can.');
        process.exit(1);
      }
      return;
    }

    // Compile every message to the exact bytes that would go on the wire and
    // write them out for a human to read. Sends nothing, claims nothing, needs
    // no API key. This is how you confirm the student's copy carries no `Bcc:`
    // header BEFORE trusting 25 sends to that claim.
    if (hasFlag('--compose-only')) {
      const outDir = path.join(runDir, 'composed');
      fs.mkdirSync(outDir, { recursive: true });
      const nodemailer = await import('nodemailer');
      const streamer = nodemailer.default.createTransport({
        streamTransport: true, buffer: true, newline: 'unix',
      });
      for (const entry of manifest) {
        const draft = parseDraft(fs.readFileSync(path.join(draftsDir, entry.file), 'utf8'), entry.file);
        const { text, html } = renderBody(draft.body);
        const message = buildCampaignMessage({
          recipient: draft.to, subject: draft.subject, text, html,
          businessEventId: draft.businessEventId, idempotencyKey: entry.key,
        });
        assertSendSafety(message, draft.to);
        const info: any = await streamer.sendMail(message as any);
        const raw = String(info.message);
        fs.writeFileSync(path.join(outDir, `${entry.file}.eml`), raw);
        const headers = raw.split(/\n\n/)[0];
        log('composed', {
          file: entry.file,
          envelope_to: info.envelope.to,
          bcc_header_present: /^bcc:/im.test(headers),
          cc_header_present: /^cc:/im.test(headers),
        });
      }
      console.log(`\nComposed ${manifest.length} messages to ${outDir}. Nothing was sent.`);
      return;
    }

    const transport = dryRun ? null : createMandrillTransport(process.env.MANDRILL_API_KEY ?? '');

    const deps: BatchDeps = {
      loadDraft: (file) => parseDraft(fs.readFileSync(path.join(draftsDir, file), 'utf8'), file),
      runGate: async () => {
        const r = spawnSync(
          process.execPath,
          [gatePath, '--people', peoplePath, '--drafts', draftsDir, '--selftest'],
          { encoding: 'utf8', timeout: 120_000 },
        );
        const out = `${r.stdout ?? ''}${r.stderr ?? ''}`;
        const exitCode = r.status ?? -1;
        return { ok: exitCode === 0, exitCode, summary: out.trim().split('\n').slice(-3).join(' | ') };
      },
      computeKey: computeIdempotencyKey,
      haltRequested: () =>
        (fs.existsSync(path.join(runDir, 'HALT')) ? `HALT file present at ${path.join(runDir, 'HALT')}` : null),
      sendOnce: async (id, body) => {
        const message = buildCampaignMessage({
          recipient: id.recipient,
          subject: id.subject,
          text: body.text,
          html: body.html,
          businessEventId: id.businessEventId,
          idempotencyKey: id.idempotencyKey,
        });
        const send = () => sendCampaignMessage(transport!, message, id.recipient);

        if (ledgerKind === 'file') return sendOnceViaFile(ledger!, id, send) as any;
        const { sendOnce } = await import('../services/email/idempotentSend');
        return await sendOnce(id, send) as any;
      },
      log,
    };

    const outcome = await runBatch(
      {
        manifest,
        businessEventId: BUSINESS_EVENT_ID,
        dryRun,
        batchSize,
        canaryOnly: !canaryConfirmed,
        canaryConfirmed,
      },
      deps,
    );

    console.log(JSON.stringify({
      ledger: ledgerKind,
      status: outcome.status,
      sent: outcome.sent,
      skipped: outcome.skipped,
      gate_runs: outcome.gateRuns,
      abort: outcome.abort ?? null,
      ledger_summary: ledger?.summary() ?? null,
    }, null, 2));

    if (outcome.status === 'aborted') process.exitCode = 1;
    if (outcome.status === 'canary_sent') {
      console.log('\nCANARY SENT. Confirm it arrived, rendered correctly, and that the BCC copy');
      console.log('landed in ali@colaberry.com, THEN re-run with --canary-confirmed.');
    }
    if (outcome.status === 'dry_run_ok') {
      console.log(`\nDRY RUN ONLY. ${manifest.length} drafts passed preflight and the gate.`);
      console.log('Nothing was claimed and nothing was sent. Add --send to go live.');
    }
  } finally {
    ledger?.close();
  }
}

if (require.main === module) {
  main().catch((err) => {
    console.error('[student-unblock-batch] fatal:', err?.message ?? err);
    process.exit(1);
  });
}
