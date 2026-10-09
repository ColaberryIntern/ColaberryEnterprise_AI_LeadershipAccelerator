import React from 'react';
import Pagination from '../ui/Pagination';
import EmptyState from '../admin/shell/EmptyState';
import type { JourneyPage, JourneyScope } from '../../services/growthJourneyInspectApi';

/**
 * The two things all five T614 tabs need: a footer that reports the page the SERVER
 * served, and an empty state that names the scope it was empty for.
 *
 * ── WHY THE FOOTER REPORTS THE SERVER'S NUMBERS, NOT THE REQUEST'S ──────────
 *
 * Every one of the nine reads echoes `total`, `limit` and `offset`, and the echo is
 * not always what was asked for: `limit` is clamped to 100 server-side and `offset`
 * is honoured as sent, so a tab that renders its own request state can disagree with
 * the rows on screen. This footer takes the response.
 *
 * None of the nine returns an `as_of`, unlike `/status/health` and
 * `/status/readiness`. This surface's convention is that a count without freshness
 * is a failing condition, so rather than stamp a client clock and call it server
 * freshness, these tabs print the echoed envelope - which the server did send - and
 * say plainly that it is a page description rather than a timestamp.
 *
 * ── WHY `total` IS A REAL TOTAL HERE ────────────────────────────────────────
 *
 * All nine use `findAndCountAll`, so `total` is a genuine `COUNT(*)` over the
 * filtered set and never a floor. The FLOOR convention on this phase
 * (`truncated[]`, `refused.capped`) belongs to `/status/health` alone. Do not add a
 * floor caveat here - it would be a warning about a condition that cannot arise,
 * and a false caveat costs the real one its credibility. The per-list cut that DOES
 * exist is `approved_landing_pages_total` on a content policy row, which the content
 * tab reports on the row itself.
 */

export const PAGE_LIMIT = 25;

interface FooterProps {
  page: JourneyPage;
  onOffset: (offset: number) => void;
  /** What the rows are, for the screen-reader sentence: "classifications". */
  noun: string;
}

export function JourneyPagingFooter({ page, onOffset, noun }: FooterProps) {
  const { total, limit, offset } = page;
  const first = total === 0 ? 0 : offset + 1;
  const last = Math.min(offset + limit, total);
  const totalPages = limit > 0 ? Math.ceil(total / limit) : 1;
  const current = limit > 0 ? Math.floor(offset / limit) + 1 : 1;

  return (
    <div className="d-flex justify-content-between align-items-center flex-wrap gap-2 mt-3">
      <span className="small text-muted">
        {total === 0
          ? `No ${noun} on this page.`
          : `Showing ${first}–${last} of ${total} ${noun}.`}{' '}
        {/* The server's own echo, named as such. */}
        <span>Server returned limit {limit}, offset {offset}.</span>
      </span>
      <Pagination
        page={current}
        totalPages={totalPages}
        onPageChange={(p) => onOffset(Math.max(0, (p - 1) * limit))}
      />
    </div>
  );
}

interface EmptyProps {
  /** "classifications", "shadow runs" - what was looked for. */
  noun: string;
  /** The scope the SERVER applied, from the response. */
  scope?: JourneyScope | null;
  /** Brand name resolved from the status registry, when one is known. */
  brandName?: string | null;
  /** True when the registry says no tenant memberships are seeded. */
  unseeded?: boolean;
  /** An extra sentence for a read that is empty for a structural reason. */
  hint?: React.ReactNode;
}

/**
 * Empty is a result, and this says whose result it was.
 *
 * The distinction that matters, and the reason this is not a bare "No data": with no
 * tenant membership every scoped read answers an empty page with no SQL issued at
 * all, which looks exactly like a working system with nothing in it. That is a
 * PERMISSIONS answer, not an empty system, and the page-level
 * `SystemStateNotices` already says so when the registry reports it - so this
 * component points at that rather than repeating it.
 */
export function JourneyEmpty({ noun, scope, brandName, unseeded, hint }: EmptyProps) {
  const where = brandName
    ? `brand ${brandName}`
    : scope?.brand_id
      ? `brand ${scope.brand_id}`
      : 'every brand in your scope';

  return (
    <EmptyState
      tone="quiet"
      icon="inbox-line"
      title={`No ${noun} in scope`}
      description={
        <>
          <span>
            The request succeeded and returned no {noun} for {where}.
          </span>
          {unseeded && (
            <>
              {' '}
              <strong>
                {'Your tenant has no memberships seeded, so every scoped read answers empty '
                  + 'without querying anything — this is a permissions result, not an '
                  + 'empty system.'}
              </strong>
            </>
          )}
          {hint && <> {hint}</>}
        </>
      }
    />
  );
}

interface FilterBarProps {
  children: React.ReactNode;
  /** Rendered at the right-hand end, for a reload button. */
  right?: React.ReactNode;
}

/** The repo's filter-bar shape, so five tabs do not each invent one. */
export function JourneyFilterBar({ children, right }: FilterBarProps) {
  return (
    <div className="d-flex gap-2 mb-3 flex-wrap align-items-end">
      {children}
      {right && <div className="ms-auto d-flex gap-2 align-items-end">{right}</div>}
    </div>
  );
}

interface SelectProps {
  label: string;
  value: string;
  options: readonly { value: string; label: string }[];
  onChange: (v: string) => void;
}

/** A labelled select. The label is a real `<label htmlFor>`, which rule 6 requires. */
export function JourneySelect({ label, value, options, onChange }: SelectProps) {
  const id = `gj-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div>
      <label className="form-label small fw-medium mb-1" htmlFor={id}>{label}</label>
      <select
        id={id}
        className="form-select form-select-sm"
        style={{ maxWidth: 190 }}
        value={value}
        onChange={(e) => onChange(e.target.value)}
      >
        {options.map((o) => (
          <option key={o.value} value={o.value}>{o.label}</option>
        ))}
      </select>
    </div>
  );
}

interface TextFilterProps {
  label: string;
  value: string;
  placeholder?: string;
  onCommit: (v: string) => void;
}

/**
 * A text filter that commits on blur or Enter rather than per keystroke.
 *
 * Deliberate: these reads are rate-limited to 120 requests a minute per admin, and
 * several answer a malformed value with a 400 rather than an empty list - so a
 * fetch per character would both burn the budget and flash errors at someone
 * halfway through typing `lead:4711`.
 */
export function JourneyTextFilter({ label, value, placeholder, onCommit }: TextFilterProps) {
  const [draft, setDraft] = React.useState(value);
  React.useEffect(() => { setDraft(value); }, [value]);
  const id = `gj-${label.toLowerCase().replace(/[^a-z0-9]+/g, '-')}`;
  return (
    <div>
      <label className="form-label small fw-medium mb-1" htmlFor={id}>{label}</label>
      <input
        id={id}
        className="form-control form-control-sm"
        style={{ maxWidth: 220 }}
        value={draft}
        placeholder={placeholder}
        onChange={(e) => setDraft(e.target.value)}
        onBlur={() => onCommit(draft.trim())}
        onKeyDown={(e) => { if (e.key === 'Enter') onCommit(draft.trim()); }}
      />
    </div>
  );
}

/**
 * A masked value with its own provenance.
 *
 * `/decisions/transitions` and `/content/rules` mask `reason`, `requested_by` and
 * `approved_by` server-side through `safeField`, and report which happened in a
 * companion boolean. `'unknown'` means the column was empty or not a string;
 * `'redacted'` means it held an `@`. Collapsing both into "absent" throws away the
 * more interesting fact, so this renders them differently.
 */
export function MaskedValue({ value, redacted }: { value: string; redacted: boolean }) {
  if (redacted) {
    return <span className="badge bg-secondary">redacted by the API</span>;
  }
  if (value === 'unknown') {
    return <span className="text-muted">not recorded</span>;
  }
  return <span className="text-break">{value}</span>;
}
