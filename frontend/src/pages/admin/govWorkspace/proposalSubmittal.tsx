import React, { useState } from 'react';
import type { GovResponseSlot } from '../../../services/factoryApi';

/**
 * proposalSubmittal — group the flat proposal response checklist into the 8 SUBMITTAL categories a real
 * government proposal is organized into (the volume/tab model), so an operator sees a manageable <=10-item
 * breakdown of "what we actually hand in" instead of 80+ ungrouped line-items.
 *
 * The bucket itself is assigned server-side (backend submittalBuckets.ts); this file only RENDERS the grouping:
 * an audit summary (counts + gate flags per category) and a collapsible section per category. The catalog below
 * MIRRORS the backend SUBMITTAL_BUCKETS (there is no shared module across the two builds) - keep them in sync.
 */
export type SubmittalBucketKey =
  | 'admin' | 'certs' | 'technical' | 'management' | 'experience' | 'price' | 'financial' | 'socioeconomic';

export interface SubmittalBucketMeta {
  key: SubmittalBucketKey;
  label: string;
  short: string;
  order: number;
  /** A typical pass/fail gate: a miss here is usually a rejection, not a low score. Surfaced in the audit. */
  gate: boolean;
}

export const SUBMITTAL_BUCKETS: SubmittalBucketMeta[] = [
  { key: 'admin',         label: 'Administrative & Offer Forms',                short: 'Admin & Forms',    order: 1, gate: true },
  { key: 'certs',         label: 'Representations, Certifications & Compliance', short: 'Reps & Certs',     order: 2, gate: true },
  { key: 'technical',     label: 'Technical / Solution Approach',               short: 'Technical',        order: 3, gate: false },
  { key: 'management',    label: 'Management, Staffing & Key Personnel',        short: 'Management',       order: 4, gate: false },
  { key: 'experience',    label: 'Experience & Past Performance',               short: 'Past Performance', order: 5, gate: false },
  { key: 'price',         label: 'Price / Cost Proposal',                       short: 'Price / Cost',     order: 6, gate: true },
  { key: 'financial',     label: 'Financial Responsibility & Insurance',        short: 'Financial',        order: 7, gate: false },
  { key: 'socioeconomic', label: 'Small Business / Socioeconomic',              short: 'Socioeconomic',    order: 8, gate: true },
];

/** Group slots by bucket, in catalog order, omitting empty categories. A missing bucket defaults to `technical`. */
export function groupSlotsByBucket(slots: GovResponseSlot[]): Array<{ bucket: SubmittalBucketMeta; slots: GovResponseSlot[] }> {
  const by = new Map<SubmittalBucketKey, GovResponseSlot[]>();
  for (const s of Array.isArray(slots) ? slots : []) {
    const k = (s.bucket ?? 'technical') as SubmittalBucketKey;
    const arr = by.get(k) ?? [];
    arr.push(s);
    by.set(k, arr);
  }
  return SUBMITTAL_BUCKETS
    .filter((b) => (by.get(b.key)?.length ?? 0) > 0)
    .map((b) => ({ bucket: b, slots: by.get(b.key)! }));
}

const approvedCount = (slots: GovResponseSlot[]): number => slots.filter((s) => s.status === 'approved').length;
const startedCount = (slots: GovResponseSlot[]): number => slots.filter((s) => s.status !== 'unanswered').length;

/**
 * ProposalSubmittalAudit — the "exactly what we need to submit" breakdown: one tile per category present, each
 * showing approved/total and whether it is a pass/fail gate. The honest headline is approved-of-total, because an
 * unapproved response is not a submitted one.
 */
export function ProposalSubmittalAudit({ slots }: { slots: GovResponseSlot[] }): React.ReactElement {
  const groups = groupSlotsByBucket(slots);
  const total = (slots ?? []).length;
  const approved = approvedCount(slots ?? []);
  return (
    <div className="mb-3">
      <div className="small text-secondary mb-2">
        <i className="ri-list-check-2 me-1" aria-hidden="true" />
        What we must submit, grouped into {groups.length} categor{groups.length === 1 ? 'y' : 'ies'}:{' '}
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{approved}</strong> of{' '}
        <strong style={{ fontVariantNumeric: 'tabular-nums' }}>{total}</strong> responses approved. A{' '}
        <span className="badge bg-warning-subtle text-warning-emphasis">gate</span> category is one a miss in which
        is usually a rejection, not a low score.
      </div>
      <div className="row g-2">
        {groups.map(({ bucket, slots: bs }) => {
          const a = approvedCount(bs);
          const pct = bs.length ? Math.round((a / bs.length) * 100) : 0;
          return (
            <div key={bucket.key} className="col-6 col-lg-3">
              <div className="border rounded p-2 h-100">
                <div className="d-flex align-items-center gap-1 mb-1">
                  <span className="small fw-semibold text-truncate" title={bucket.label}>{bucket.short}</span>
                  {bucket.gate && <span className="badge bg-warning-subtle text-warning-emphasis ms-auto" title="Pass/fail gate: typically a rejection if missing">gate</span>}
                </div>
                <div className="small" style={{ fontVariantNumeric: 'tabular-nums' }}>{a}/{bs.length} approved</div>
                <div className="progress mt-1" style={{ height: 4 }} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100} aria-label={`${bucket.short} approved`}>
                  <div className={`progress-bar ${pct === 100 ? 'bg-success' : ''}`} style={{ width: `${pct}%` }} />
                </div>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

/**
 * SubmittalBucketSection — a collapsible group for one category, wrapping its response rows (passed as children).
 * Opens by default when the category still has unapproved work, so the operator sees what is left to do and
 * completed categories stay folded.
 */
export function SubmittalBucketSection({ bucket, slots, defaultOpen, children }: {
  bucket: SubmittalBucketMeta;
  slots: GovResponseSlot[];
  defaultOpen?: boolean;
  children: React.ReactNode;
}): React.ReactElement {
  const approved = approvedCount(slots);
  const started = startedCount(slots);
  const [open, setOpen] = useState(defaultOpen ?? approved < slots.length);
  return (
    <div className="border rounded mb-2">
      <button type="button" className="btn btn-link text-decoration-none w-100 d-flex flex-wrap align-items-center gap-2 p-2 text-start" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        <i className={`ri-arrow-${open ? 'down' : 'right'}-s-line`} aria-hidden="true" />
        <span className="fw-semibold">{bucket.label}</span>
        {bucket.gate && <span className="badge bg-warning-subtle text-warning-emphasis" title="Pass/fail gate: typically a rejection if missing">gate</span>}
        <span className="text-secondary small ms-auto" style={{ fontVariantNumeric: 'tabular-nums' }}>{approved}/{slots.length} approved &middot; {started}/{slots.length} started</span>
      </button>
      {open && <div className="p-2 pt-0">{children}</div>}
    </div>
  );
}
