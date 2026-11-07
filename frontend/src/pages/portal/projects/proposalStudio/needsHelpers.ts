import type { GovProjectNeed, GovNeedKind, GovNeedSubmission } from '../../../../services/govProjectPortalApi';

/**
 * needsHelpers — the PURE display logic for the v3 "Needs you" inbox (T15), shared by the inbox view, the agent
 * panel's top-5 (T16), and the contract-bar / rail badge (T22). No React, no I/O — table-testable.
 */

/** Which inline control a need renders, derived from its kind + format. */
export type NeedControl = 'text' | 'url' | 'choice' | 'file' | 'confirm' | 'approve';

export function needControl(need: Pick<GovProjectNeed, 'kind' | 'format' | 'options'>): NeedControl {
  switch (need.kind) {
    case 'decision':
    case 'confirm_rule':
      return need.options && need.options.length ? 'choice' : 'confirm';
    case 'file':
    case 'signature':
      return 'file';
    case 'approval':
      return 'approve';
    case 'setting':
      return /url|link|https?:/i.test(need.format || '') ? 'url' : 'text';
    case 'fact':
    default:
      return 'text';
  }
}

/** A short human label for a need's kind (the card's type chip). */
export function needKindLabel(kind: GovNeedKind): string {
  const map: Record<GovNeedKind, string> = {
    fact: 'Fact', decision: 'Decision', file: 'File', signature: 'Signature',
    approval: 'Approval', confirm_rule: 'Confirm', setting: 'Setting',
  };
  return map[kind] ?? 'Need';
}

/** "Unblocks N documents" / "Project-level" — the distinct documents a need gates. */
export function unblockLabel(need: Pick<GovProjectNeed, 'usedIn'>): string {
  const n = new Set((need.usedIn || []).map((u) => u.docKey).filter(Boolean)).size;
  return n ? `Unblocks ${n} document${n === 1 ? '' : 's'}` : 'Project-level';
}

/** The rail / contract-bar badge: count + tone (fatal if any fatal need, else score, else none). */
export function needsBadge(needs: GovProjectNeed[] | null | undefined): { count: number; tone: 'fatal' | 'score' | 'none' } {
  const list = Array.isArray(needs) ? needs : [];
  if (!list.length) return { count: 0, tone: 'none' };
  return { count: list.length, tone: list.some((n) => n.blocking === 'fatal') ? 'fatal' : 'score' };
}

/** Build the resolve submission for a control + the viewer's input. */
export function submissionFor(control: NeedControl, value: string): GovNeedSubmission {
  switch (control) {
    case 'file':
      return { fileRef: value };
    case 'approve':
      return { approve: value === 'go', note: value === 'go' ? undefined : value };
    case 'confirm':
      return { approve: true };
    default:
      return { value };
  }
}

/** Partition needs into Blocking-export (fatal) then Holding-score, each preserving input order. */
export function partitionNeeds(needs: GovProjectNeed[] | null | undefined): { blockingExport: GovProjectNeed[]; holdingScore: GovProjectNeed[] } {
  const list = Array.isArray(needs) ? needs : [];
  return {
    blockingExport: list.filter((n) => n.blocking === 'fatal'),
    holdingScore: list.filter((n) => n.blocking !== 'fatal'),
  };
}
