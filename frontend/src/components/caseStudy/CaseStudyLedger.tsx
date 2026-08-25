import React from 'react';
import type { CaseStudyLedgerLabels } from '../../config/caseStudySurfaces';
import type { CaseStudyLedgerCounts } from '../../services/caseStudyPublicTypes';
import './caseStudy.css';

/**
 * CaseStudyLedger - the four counts across the top of an index.
 *
 * NO HARDCODED COUNTS (spec section 22). Every number is read off the `ledger`
 * the API computed from what is actually published, and there is no default, no
 * fallback figure and no "approximately". A ledger of zeroes renders as zeroes,
 * which is the truthful state of an empty library and the thing a placeholder
 * would have hidden.
 *
 * The labels arrive from the surface profile rather than from this file, because
 * a second surface counts the same rows and may well name them differently.
 */

export interface CaseStudyLedgerProps {
  ledger: CaseStudyLedgerCounts;
  labels: CaseStudyLedgerLabels;
  className?: string;
}

/** Grouping separators only. No rounding, no abbreviation, no "k". */
const format = (value: number): string =>
  Number.isFinite(value) ? Math.trunc(value).toLocaleString('en-US') : '0';

const FIELDS: readonly (keyof CaseStudyLedgerCounts & keyof CaseStudyLedgerLabels)[] = [
  'projects',
  'verifiedOutcomes',
  'publicRepositories',
  'shipped',
];

export function CaseStudyLedger({
  ledger,
  labels,
  className,
}: CaseStudyLedgerProps): React.ReactElement {
  return (
    <dl className={`cbv2-cs-ledger${className ? ` ${className}` : ''}`}>
      {FIELDS.map((field) => (
        <div className="cbv2-cs-ledger__item" key={field} data-ledger-field={field}>
          {/* Value before label visually; `dt` first keeps the pairing correct
              for assistive technology, and CSS order does the rest. */}
          <dt className="cbv2-cs-ledger__label">{labels[field]}</dt>
          <dd className="cbv2-cs-ledger__value">{format(ledger[field])}</dd>
        </div>
      ))}
    </dl>
  );
}

export default CaseStudyLedger;
