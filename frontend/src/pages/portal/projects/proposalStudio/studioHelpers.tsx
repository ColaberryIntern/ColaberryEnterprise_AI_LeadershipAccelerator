import React from 'react';
import type { GovProposalDocument, GovCheckKey, GovGateName } from '../../../../services/govProjectPortalApi';

/** The six-check weights (match backend proposalReviewConfig). */
export const WEIGHTS: Record<GovCheckKey, number> = { coverage: 25, evaluator: 25, proof: 15, clarity: 15, format: 10, fact: 10 };

/** The weighted 0–100 score of a document's latest version (0 when it has none). */
export function docScore(d: GovProposalDocument): number {
  const s = d.latest?.scores;
  if (!s) return 0;
  let total = 0;
  (Object.keys(WEIGHTS) as GovCheckKey[]).forEach((k) => { total += (Number.isFinite(s[k]) ? (s[k] as number) : 0) * WEIGHTS[k]; });
  return Math.round(total / 100);
}

/** Band color for a 0–100 score (≥95 ok, ≥85 accent, ≥70 warn, below bad). */
export const colr = (v: number): string => (v >= 95 ? 'var(--gps-ok)' : v >= 85 ? 'var(--gps-accent)' : v >= 70 ? 'var(--gps-warn)' : 'var(--gps-bad)');

/** A score bar. */
export const Bar = ({ v }: { v: number }): React.ReactElement => (<div className="gps-bar-s"><span style={{ width: `${v}%`, background: colr(v) }} /></div>);

/** The Shipley color-team tag for a gate. */
export function teamTag(gate: GovGateName | null | undefined): React.ReactElement | null {
  if (!gate) return null;
  const map: Record<GovGateName, { cls: string; label: string }> = {
    pink: { cls: 'pink', label: 'Pink' }, red: { cls: 'red', label: 'Red' }, gold: { cls: 'gold', label: 'Gold' }, white_glove: { cls: 'glove', label: 'White glove' },
  };
  const t = map[gate];
  return <span className={`gps-tag ${t.cls}`}>{t.label}</span>;
}

export interface DocTypeMeta { label: string; tagClass: string; how: string; }
/** How a document is produced, by its type (pricing detected by key). Mirrors the design's TYPES. */
export function docTypeMeta(d: GovProposalDocument): DocTypeMeta {
  if (d.key === 'pricing') return { label: 'Pricing', tagClass: 'gold', how: 'Admin only' };
  switch (d.docType) {
    case 'form': return { label: 'Form', tagClass: 'glove', how: 'Fill & sign' };
    case 'build': return { label: 'From build', tagClass: 'agent', how: 'Assembled from artifacts' };
    case 'generated': return { label: 'Generated', tagClass: 'ok', how: 'Built from the blueprint' };
    default: return { label: 'Narrative', tagClass: 'acc', how: 'Agent drafts' };
  }
}
