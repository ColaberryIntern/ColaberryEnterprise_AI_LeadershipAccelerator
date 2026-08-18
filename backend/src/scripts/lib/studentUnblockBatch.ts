/**
 * Batch send orchestration for the student-unblock campaign.
 *
 * Pure logic with injected dependencies so the abort paths can be tested
 * without a database, a mail provider, or a child process. The CLI wrapper
 * (`backend/src/scripts/sendStudentUnblockBatch.ts`) supplies the real ones.
 *
 * Order of operations, and why:
 *
 *   1. PREFLIGHT — every draft is matched against the manifest and the
 *      idempotency key is RECOMPUTED from the message about to be sent. A key
 *      that was correct when the draft was written but no longer describes its
 *      current subject line is the exact way a "deduped" campaign sends twice.
 *   2. GATE — `verify-drafts.js` is re-run immediately before the first send,
 *      not trusted from an earlier run. Live state moved between drafting and
 *      sending; that is the whole reason the gate is re-runnable.
 *   3. CANARY — exactly one message, then a full stop. Not a smaller batch: a
 *      hard return, so a human has to look at a real delivered email before
 *      anything else goes out.
 *   4. BATCHES — small, with the gate re-run between each. Any anomaly aborts
 *      the whole run rather than skipping a recipient and continuing.
 *
 * `dryRun` is the default at the CLI and performs zero writes: no claim, no
 * send. A dry run that claimed keys would burn them and make the real run
 * refuse every recipient.
 */

export interface ManifestEntry {
  file: string;
  email: string;
  name: string;
  group: string;
  subject: string;
  key: string;
}

export interface ParsedDraft {
  to: string;
  subject: string;
  businessEventId: string;
  idempotencyKey: string;
  status: string;
  body: string;
}

export interface GateResult {
  ok: boolean;
  exitCode: number;
  summary: string;
}

export type AbortReason =
  | 'empty_manifest'
  | 'duplicate_key_in_manifest'
  | 'draft_unreadable'
  | 'recipient_mismatch'
  | 'subject_mismatch'
  | 'declared_key_mismatch'
  | 'derived_key_mismatch'
  | 'business_event_mismatch'
  | 'denylisted_recipient'
  | 'gate_failed'
  | 'send_failed'
  | 'claim_in_flight'
  | 'claim_natural_key_conflict'
  | 'halt_requested';

export interface SendRecord {
  file: string;
  recipient: string;
  idempotencyKey: string;
  messageId?: string;
}

export interface SkipRecord {
  file: string;
  recipient: string;
  idempotencyKey: string;
  reason: string;
}

export interface BatchOutcome {
  status: 'dry_run_ok' | 'canary_sent' | 'complete' | 'aborted';
  sent: SendRecord[];
  skipped: SkipRecord[];
  gateRuns: number;
  abort?: { reason: AbortReason; detail: string };
}

export interface BatchDeps {
  /** Reads and parses one draft. Throws if the file is missing or malformed. */
  loadDraft: (file: string) => ParsedDraft;
  /** Spawns `verify-drafts.js`. Never inferred from a previous run. */
  runGate: () => Promise<GateResult>;
  /** Claim-then-send-then-record. Supplied by services/email/idempotentSend. */
  sendOnce: (
    id: { recipient: string; subject: string; businessEventId: string; idempotencyKey: string },
    body: { text: string; html: string },
  ) => Promise<
    | { outcome: 'sent'; idempotencyKey: string; messageId?: string }
    | { outcome: 'skipped'; reason: string; idempotencyKey: string }
    | { outcome: 'failed'; idempotencyKey: string; errorClass: string; error: string }
  >;
  /** Recomputes the key from the message being sent. */
  computeKey: (recipient: string, subject: string, businessEventId: string) => string;
  /**
   * Operator kill switch, checked before EVERY message. The backend's own
   * kill switch lives behind a settings table this local script does not read,
   * so the substitute is a file: `touch <run-dir>/HALT` stops the batch at the
   * next recipient. Returns a reason string to halt, or null to continue.
   */
  haltRequested?: () => string | null;
  log: (event: string, context: Record<string, unknown>) => void;
}

export interface BatchOptions {
  manifest: ManifestEntry[];
  businessEventId: string;
  dryRun: boolean;
  batchSize: number;
  /** Stop after the first message. The default posture for a first run. */
  canaryOnly: boolean;
  /** Set once a human has confirmed the canary landed and rendered correctly. */
  canaryConfirmed: boolean;
}

/**
 * Addresses that must never receive this campaign, from the drafting run's own
 * exclusion list. Held here as well as there because a deny list that lives
 * only in a markdown table is a deny list that a future edit to the manifest
 * silently defeats.
 */
export const DENYLIST_ADDRESSES = new Set([
  'nzeribeikenna@gmail.com', // do-not-email flag + open refund decision
  'rogation2000@yahoo.fr', // Marione's non-keeper account
  'ali@colaberry.com',
  'e2e+test@colaberry.com',
  'test+fresh@colaberry.com',
  'system@platform.colaberry.ai',
]);

/** `ali+anything@` test fixtures. Deliberately does NOT match other staff. */
export const DENYLIST_PATTERNS = [/^ali\+/i];

export function isDenylisted(email: string): boolean {
  const addr = email.trim().toLowerCase();
  if (DENYLIST_ADDRESSES.has(addr)) return true;
  return DENYLIST_PATTERNS.some((p) => p.test(addr));
}

function abort(reason: AbortReason, detail: string, gateRuns: number, sent: SendRecord[], skipped: SkipRecord[]): BatchOutcome {
  return { status: 'aborted', sent, skipped, gateRuns, abort: { reason, detail } };
}

/**
 * Match every manifest row against its draft before anything is claimed.
 * Returns the abort reason and detail on the first inconsistency, or null.
 */
export function preflight(
  options: BatchOptions,
  deps: Pick<BatchDeps, 'loadDraft' | 'computeKey'>,
): { reason: AbortReason; detail: string } | null {
  if (options.manifest.length === 0) {
    return { reason: 'empty_manifest', detail: 'manifest has no entries' };
  }

  const seenKeys = new Map<string, string>();
  for (const entry of options.manifest) {
    if (seenKeys.has(entry.key)) {
      return {
        reason: 'duplicate_key_in_manifest',
        detail: `${entry.file} shares key ${entry.key} with ${seenKeys.get(entry.key)}`,
      };
    }
    seenKeys.set(entry.key, entry.file);

    if (isDenylisted(entry.email)) {
      return { reason: 'denylisted_recipient', detail: `${entry.file} targets ${entry.email}` };
    }

    let draft: ParsedDraft;
    try {
      draft = deps.loadDraft(entry.file);
    } catch (err: any) {
      return { reason: 'draft_unreadable', detail: `${entry.file}: ${err?.message ?? err}` };
    }

    if (draft.to.trim().toLowerCase() !== entry.email.trim().toLowerCase()) {
      return {
        reason: 'recipient_mismatch',
        detail: `${entry.file}: draft addresses ${draft.to}, manifest says ${entry.email}`,
      };
    }
    if (draft.subject !== entry.subject) {
      return {
        reason: 'subject_mismatch',
        detail: `${entry.file}: draft subject "${draft.subject}" != manifest "${entry.subject}"`,
      };
    }
    if (draft.businessEventId !== options.businessEventId) {
      return {
        reason: 'business_event_mismatch',
        detail: `${entry.file}: draft event ${draft.businessEventId} != ${options.businessEventId}`,
      };
    }
    if (draft.idempotencyKey !== entry.key) {
      return {
        reason: 'declared_key_mismatch',
        detail: `${entry.file}: front matter key ${draft.idempotencyKey} != manifest ${entry.key}`,
      };
    }

    // The check that matters. Everything above compares two pieces of
    // documentation to each other; this compares the documentation to the
    // message that is actually about to be handed to Mandrill.
    const derived = deps.computeKey(draft.to, draft.subject, draft.businessEventId);
    if (derived !== entry.key) {
      return {
        reason: 'derived_key_mismatch',
        detail: `${entry.file}: recomputed ${derived} from the live draft, manifest carries ${entry.key}`,
      };
    }
  }
  return null;
}

/** Minimal, faithful HTML rendering of the gated plain-text body. */
export function renderBody(body: string): { text: string; html: string } {
  const text = body.trim();
  const escape = (s: string) =>
    s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
  const html = text
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px 0;">${escape(p).replace(/\n/g, '<br>')}</p>`)
    .join('\n');
  return { text, html };
}

export async function runBatch(options: BatchOptions, deps: BatchDeps): Promise<BatchOutcome> {
  const sent: SendRecord[] = [];
  const skipped: SkipRecord[] = [];
  let gateRuns = 0;

  const pre = preflight(options, deps);
  if (pre) {
    deps.log('batch_aborted', { reason: pre.reason, detail: pre.detail, phase: 'preflight' });
    return abort(pre.reason, pre.detail, gateRuns, sent, skipped);
  }

  const gate = async (phase: string): Promise<{ reason: AbortReason; detail: string } | null> => {
    const result = await deps.runGate();
    gateRuns += 1;
    deps.log('gate_run', { phase, ok: result.ok, exit_code: result.exitCode });
    if (!result.ok) {
      return { reason: 'gate_failed', detail: `exit ${result.exitCode} at ${phase}: ${result.summary}` };
    }
    return null;
  };

  const gateBeforeFirst = await gate('pre_send');
  if (gateBeforeFirst) {
    deps.log('batch_aborted', { ...gateBeforeFirst, phase: 'pre_send' });
    return abort(gateBeforeFirst.reason, gateBeforeFirst.detail, gateRuns, sent, skipped);
  }

  if (options.dryRun) {
    deps.log('dry_run_complete', { would_send: options.manifest.length, gate_runs: gateRuns });
    return { status: 'dry_run_ok', sent, skipped, gateRuns };
  }

  const queue = options.canaryConfirmed ? options.manifest : options.manifest.slice(0, 1);
  const chunkSize = options.canaryOnly && !options.canaryConfirmed ? 1 : Math.max(1, options.batchSize);

  for (let i = 0; i < queue.length; i += chunkSize) {
    if (i > 0) {
      const between = await gate(`between_batches_at_${i}`);
      if (between) {
        deps.log('batch_aborted', { ...between, sent_so_far: sent.length });
        return abort(between.reason, between.detail, gateRuns, sent, skipped);
      }
    }

    for (const entry of queue.slice(i, i + chunkSize)) {
      const halt = deps.haltRequested?.() ?? null;
      if (halt) {
        deps.log('batch_aborted', { reason: 'halt_requested', detail: halt, sent_so_far: sent.length });
        return abort('halt_requested', halt, gateRuns, sent, skipped);
      }

      const draft = deps.loadDraft(entry.file);
      const body = renderBody(draft.body);
      const result = await deps.sendOnce(
        {
          recipient: draft.to,
          subject: draft.subject,
          businessEventId: draft.businessEventId,
          idempotencyKey: entry.key,
        },
        body,
      );

      if (result.outcome === 'sent') {
        sent.push({
          file: entry.file,
          recipient: draft.to,
          idempotencyKey: result.idempotencyKey,
          messageId: result.messageId,
        });
        deps.log('send_ok', {
          file: entry.file,
          recipient: draft.to,
          idempotency_key: result.idempotencyKey,
          provider_message_id: result.messageId ?? null,
        });
        continue;
      }

      if (result.outcome === 'skipped' && result.reason === 'already_sent') {
        // The only benign skip: a resumed run stepping back over the canary.
        skipped.push({
          file: entry.file,
          recipient: draft.to,
          idempotencyKey: result.idempotencyKey,
          reason: result.reason,
        });
        deps.log('send_skipped_already_sent', {
          file: entry.file,
          idempotency_key: result.idempotencyKey,
        });
        continue;
      }

      const reason: AbortReason =
        result.outcome === 'failed'
          ? 'send_failed'
          : result.reason === 'duplicate_natural_key'
            ? 'claim_natural_key_conflict'
            : 'claim_in_flight';
      const detail =
        result.outcome === 'failed'
          ? `${entry.file}: ${result.errorClass}: ${result.error}`
          : `${entry.file}: claim refused (${result.reason})`;
      deps.log('batch_aborted', { reason, detail, sent_so_far: sent.length });
      return abort(reason, detail, gateRuns, sent, skipped);
    }
  }

  if (!options.canaryConfirmed) {
    deps.log('canary_sent', {
      recipient: sent[0]?.recipient ?? null,
      idempotency_key: sent[0]?.idempotencyKey ?? null,
      provider_message_id: sent[0]?.messageId ?? null,
    });
    return { status: 'canary_sent', sent, skipped, gateRuns };
  }

  deps.log('batch_complete', { sent: sent.length, skipped: skipped.length, gate_runs: gateRuns });
  return { status: 'complete', sent, skipped, gateRuns };
}
