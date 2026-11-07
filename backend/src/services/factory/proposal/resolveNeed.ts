import type { HumanNeed, HumanNeedKind } from './proposalReviewTypes';

/**
 * resolveNeed — the pure routing core for "a human answers one open need" (v3 §V1.4, the POST
 * `/needs/:key/resolve` body). Given a {@link HumanNeed}, a human's {@link NeedSubmission}, and who the
 * actor is, it validates the submission against the need's `kind` and returns the typed action to take:
 * which store the answer lands in, the payload to write, and the resulting status. It performs NO I/O, so
 * every kind + the intern/approver rail is table-testable without a database; the route wires the returned
 * action to the real stores.
 *
 * Routing by kind (the v3 operating model: AI builds + judges, the human supplies exactly these):
 *   fact        -> company library     (approver: `approved`; intern: `pending` review)
 *   decision    -> decision log        (one of `need.options` when the need constrains them)
 *   confirm_rule-> decision log         (a yes/no acknowledgement of a proposed rule)
 *   file        -> upload              (a reference to an uploaded artifact)
 *   signature   -> upload              (a reference to the signed artifact)
 *   setting     -> setting store       (e.g. the demo URL; validated as a URL when the need asks for one)
 *   approval    -> Gold gate           (approver-only Go / No-go; an intern cannot give it)
 */

export type NeedStore = 'library' | 'decision_log' | 'upload' | 'setting' | 'gate';

/** What a human posts to answer a need. Which fields matter depends on the need's kind. */
export interface NeedSubmission {
  /** fact text, decision choice, confirm note, or setting value (e.g. the demo URL). */
  value?: string;
  /** file / signature: a reference (id or path) to the uploaded artifact. */
  fileRef?: string;
  /** approval / confirm_rule: Go / acknowledged. */
  approve?: boolean;
  /** optional free-text context recorded alongside the answer. */
  note?: string;
}

/** Who is answering. `canApprove` is the admin/approver rail; an intern has it false. */
export interface ResolveActor {
  email?: string;
  canApprove: boolean;
}

export type NeedResolution =
  | {
      ok: true;
      store: NeedStore;
      /** library: `approved` (approver) vs `pending` (intern); everything else `recorded`. */
      status: 'approved' | 'pending' | 'recorded';
      key: string;
      payload: Record<string, unknown>;
    }
  | { ok: false; error: string };

const isNonEmpty = (s: unknown): s is string => typeof s === 'string' && s.trim().length > 0;

/** A permissive URL check: http(s) with a host. Kept here so `setting` demo-URL needs validate without a lib. */
function looksLikeUrl(s: string): boolean {
  try {
    const u = new URL(s.trim());
    return (u.protocol === 'http:' || u.protocol === 'https:') && u.host.length > 0;
  } catch {
    return false;
  }
}

/** True when the need asks for a URL (its `format` says so), so a `setting` answer is URL-validated. */
function needWantsUrl(need: HumanNeed): boolean {
  return /url|link|https?:/i.test(need.format || '');
}

export function routeNeedResolution(
  need: HumanNeed,
  submission: NeedSubmission,
  actor: ResolveActor,
): NeedResolution {
  if (!need || !isNonEmpty(need.key)) return { ok: false, error: 'need is missing a key' };
  const by = actor?.email || 'unknown';
  const kind: HumanNeedKind = need.kind;

  switch (kind) {
    case 'fact': {
      if (!isNonEmpty(submission.value)) return { ok: false, error: `fact "${need.key}" needs a value` };
      const status = actor.canApprove ? 'approved' : 'pending';
      return {
        ok: true,
        store: 'library',
        status,
        key: need.key,
        payload: { key: need.key, value: submission.value.trim(), enteredBy: by, approved: actor.canApprove, note: submission.note },
      };
    }
    case 'decision': {
      if (!isNonEmpty(submission.value)) return { ok: false, error: `decision "${need.key}" needs a choice` };
      const choice = submission.value.trim();
      if (need.options && need.options.length > 0 && !need.options.includes(choice)) {
        return { ok: false, error: `decision "${need.key}" must be one of: ${need.options.join(', ')}` };
      }
      return {
        ok: true,
        store: 'decision_log',
        status: 'recorded',
        key: need.key,
        payload: { key: need.key, decision: choice, decidedBy: by, note: submission.note },
      };
    }
    case 'confirm_rule': {
      if (typeof submission.approve !== 'boolean') {
        return { ok: false, error: `confirm_rule "${need.key}" needs an explicit yes/no` };
      }
      return {
        ok: true,
        store: 'decision_log',
        status: 'recorded',
        key: need.key,
        payload: { key: need.key, confirmed: submission.approve, decidedBy: by, note: submission.note },
      };
    }
    case 'file': {
      if (!isNonEmpty(submission.fileRef)) return { ok: false, error: `file "${need.key}" needs an uploaded file` };
      return {
        ok: true,
        store: 'upload',
        status: 'recorded',
        key: need.key,
        payload: { key: need.key, fileRef: submission.fileRef.trim(), uploadedBy: by, note: submission.note },
      };
    }
    case 'signature': {
      if (!isNonEmpty(submission.fileRef)) return { ok: false, error: `signature "${need.key}" needs the signed artifact` };
      return {
        ok: true,
        store: 'upload',
        status: 'recorded',
        key: need.key,
        payload: { key: need.key, signatureRef: submission.fileRef.trim(), signedBy: by, note: submission.note },
      };
    }
    case 'setting': {
      if (!isNonEmpty(submission.value)) return { ok: false, error: `setting "${need.key}" needs a value` };
      const value = submission.value.trim();
      if (needWantsUrl(need) && !looksLikeUrl(value)) {
        return { ok: false, error: `setting "${need.key}" must be a valid http(s) URL` };
      }
      return {
        ok: true,
        store: 'setting',
        status: 'recorded',
        key: need.key,
        payload: { key: need.key, value, setBy: by, note: submission.note },
      };
    }
    case 'approval': {
      if (!actor.canApprove) return { ok: false, error: `approval "${need.key}" can only be given by an approver` };
      if (typeof submission.approve !== 'boolean') {
        return { ok: false, error: `approval "${need.key}" needs an explicit Go / No-go` };
      }
      return {
        ok: true,
        store: 'gate',
        status: 'recorded',
        key: need.key,
        payload: { key: need.key, decision: submission.approve ? 'go' : 'no_go', decidedBy: by, note: submission.note },
      };
    }
    default: {
      // Exhaustiveness guard: a new HumanNeedKind must add a branch above.
      const _never: never = kind;
      return { ok: false, error: `unsupported need kind: ${String(_never)}` };
    }
  }
}
