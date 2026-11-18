import type { Request, Response } from 'express';
import { sequelize } from '../config/database';
import { ConfirmCapabilitySchema } from '../schemas/capabilityConfirmationSchema';
import {
  CapabilityConfirmationRefusedError,
  loadConfirmation,
  recordCapabilityConfirmation,
} from '../services/agentDomain/capabilityConfirmationService';

/**
 * AF11.0 — the door onto `recordCapabilityConfirmation`.
 *
 * The service, the contract, the model, the table and its schema-ensurer have all existed since
 * AF11.0 shipped. Nothing called the service. Measured 2026-11-17: `recordCapabilityConfirmation`
 * appeared in no route and no controller, so the confirmations table could never gain a row, so
 * `agentToolGrantService` read an empty set of confirmed ids and refused **every** grant with
 * `capability_not_confirmed`. The governance spine was complete and declined everything, because
 * the one step that fills the table had no way in. This file is that way in and nothing more.
 *
 * ## The outcome ladder, matching `agentToolGrantController`
 *
 *   400  the body is not usable — no capability id, or a key this route refuses
 *   409  the confirmation is refused, with EVERY reason the contract found
 *   500  the write failed
 *   201  recorded
 *
 * **409 and not 403, including for `confirmer_not_super_admin`.** Same call the grant route
 * makes, and for the same reason: the caller IS authorized to use this endpoint — `requireAdmin`
 * let them in — and what is refused is this particular confirmation standing. A 403 would send
 * an `admin` looking for a login problem instead of reading the sentence that tells them only a
 * Super Admin may confirm. The refusal arrives named, beside any others.
 *
 * ## Every reason at once
 *
 * `CapabilityConfirmationRefusedError` carries the whole `issues` list because its own header
 * says it exists "so a caller renders all of them at once". Returning only the first would make
 * fixing a body a guessing game played one round-trip at a time, so the array is passed through
 * whole.
 *
 * ## The actor comes from the verified token and nowhere else
 *
 * No `|| 'unknown'`. `isNonHumanIdentity('unknown')` returns false, so a defaulted identity
 * would be recorded as a human who confirmed something nobody looked at — the precise failure
 * `recordedHumans` was written as a positive lookup to prevent. An identity this route cannot
 * resolve is passed through empty and refused by name as `confirmer_not_recorded`.
 *
 * ## This route grants nothing
 *
 * A confirmation makes a capability ELIGIBLE for a tool grant. It does not grant one, does not
 * touch an agent row, does not promote a capability live and sends nothing. The write is one
 * insert into `agent_domain_capability_confirmations`. `capabilityConfirmationBlastRadius.test.ts`
 * asserts that against this file by name rather than leaving it to a reader.
 */

function log(fields: Record<string, unknown>): void {
  console.log(JSON.stringify({
    timestamp: new Date().toISOString(),
    service: 'backend',
    event: 'capability_confirmation_request',
    ...fields,
  }));
}

/** Prefer the constructor name: a subclass that forgot to set `.name` still classifies right. */
function classify(err: unknown): string {
  if (err instanceof Error) return err.constructor?.name || err.name || 'Error';
  return 'UnknownError';
}

function actorOf(req: Request): { email: string; role: string } {
  const admin = (req as unknown as { admin?: { email?: string; role?: string } }).admin;
  return { email: admin?.email ?? '', role: admin?.role ?? '' };
}

/** POST — a Super Admin records that they confirmed a capability by hand. 201, or 400/409/500. */
export async function handleConfirmCapability(req: Request, res: Response): Promise<void> {
  const parsed = ConfirmCapabilitySchema.safeParse(req.body);
  if (!parsed.success) {
    res.status(400).json({
      error: 'That confirmation cannot be read.',
      code: 'invalid_confirmation_body',
      issues: parsed.error.issues.map((i) => ({
        rule: i.path.join('.') || 'body',
        detail: i.message,
      })),
    });
    return;
  }

  const actor = actorOf(req);
  try {
    const confirmation = await recordCapabilityConfirmation({
      sequelize,
      email: actor.email,
      actorRole: actor.role,
      capabilityId: parsed.data.capability_id,
      evidence: parsed.data.evidence,
    });
    // The service already logs `capability_confirmed` on the way out, with the identity on it.
    // This line is the REQUEST's outcome under a different event name, so the two are not
    // mistaken for one event logged twice. No identity here: the row carries it by design,
    // a log line does not need to.
    log({
      level: 'info',
      outcome: 'success',
      capability_id: confirmation.capability_id,
      evidence_kind: confirmation.evidence.kind,
    });
    res.status(201).json({ confirmation });
  } catch (err: unknown) {
    if (err instanceof CapabilityConfirmationRefusedError) {
      log({
        level: 'warn',
        outcome: 'refused',
        error_class: classify(err),
        capability_id: parsed.data.capability_id,
        rules: err.issues.map((i) => i.rule),
      });
      res.status(409).json({
        error: 'That confirmation cannot stand.',
        code: 'confirmation_refused',
        issues: err.issues,
      });
      return;
    }
    log({ level: 'error', outcome: 'failure', error_class: classify(err) });
    res.status(500).json({
      error: 'Could not record that confirmation.',
      code: 'confirmation_failed',
    });
  }
}

/**
 * GET — one capability's confirmation, or 404.
 *
 * `loadConfirmation` was exported with no caller either. It is the read that makes the write
 * checkable: without it, the only way to see whether a confirmation landed is to attempt a grant
 * and read the refusal, which is a test that changes state to answer a question.
 *
 * 404 rather than `{ confirmation: null }` with a 200, because "this capability is not confirmed"
 * and "this capability does not exist" are both answered by the absence of a row here, and a 200
 * carrying a null invites a caller to treat the first as a success.
 */
export async function handleGetConfirmation(req: Request, res: Response): Promise<void> {
  const capabilityId = String(req.params.capabilityId ?? '').trim();
  if (!capabilityId) {
    res.status(400).json({ error: 'Name the capability.', code: 'invalid_capability_id' });
    return;
  }
  try {
    const confirmation = await loadConfirmation(capabilityId);
    if (!confirmation) {
      res.status(404).json({
        error: 'No confirmation has been recorded for that capability.',
        code: 'confirmation_not_found',
      });
      return;
    }
    res.json({ confirmation });
  } catch (err: unknown) {
    log({ level: 'error', outcome: 'failure', error_class: classify(err) });
    res.status(500).json({
      error: 'Could not read that confirmation.',
      code: 'confirmation_unreadable',
    });
  }
}
