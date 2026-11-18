import React, { useEffect, useState } from 'react';
import {
  errorMessage,
  fetchDatasetDetail,
  type DatasetDetail,
} from '../../../services/agentDomainApi';

/**
 * AF12.2 — what one dataset actually looks like, opened from the picker.
 *
 * Ali, 17 Nov 2026: *"If we are picking datasets we need to be able to see the data when we click
 * on it."*
 *
 * ## It shows the shape, and says so in its own heading
 *
 * The title is "The shape of this table", not "The data". Somebody who opens a panel called data
 * and finds no rows concludes the feature is broken; somebody who opens one called shape and finds
 * columns, types and a row count has what they came for. The sentence under it names the one thing
 * deliberately absent and why, because an unexplained absence reads as an oversight and gets
 * raised as a bug — and because the person reading it is about to request access to this table,
 * which is the mechanism by which an agent is allowed to see rows.
 *
 * ## Inspecting is NOT selecting
 *
 * This opens from a control of its own, beside the row, rather than from the row itself. The row's
 * click is the picker's whole job; taking it over to open a panel would mean a builder who wanted
 * to look at a table ended up having chosen it, or worse, un-chosen one they had.
 *
 * ## Unknown is rendered as unknown
 *
 * A null `row_count` prints "not counted" and a null `last_scanned` prints "never scanned".
 * Neither is allowed to fall back to 0 or to today: "we do not know how big this is" and "this
 * table is empty" argue for opposite decisions about a read grant.
 */

/** A small count, humanised, so 300000 does not have to be read digit by digit. */
function rows(n: number | null): string {
  if (n === null) return 'not counted';
  if (n === 0) return 'empty';
  if (n < 1000) return `${n} rows`;
  if (n < 1_000_000) return `${(n / 1000).toFixed(n < 10_000 ? 1 : 0)}k rows`;
  return `${(n / 1_000_000).toFixed(1)}m rows`;
}

/**
 * How much reading this table would expose, as a word.
 *
 * Deliberately coarse and deliberately not a score. It exists because the row count is the fact
 * that changes the decision and a bare number does not read as a magnitude at a glance. An unknown
 * count is its own tone rather than the lowest one: not knowing is a reason for more care, not
 * less.
 */
export function sizeTone(n: number | null): { label: string; cls: string; icon: string } {
  if (n === null) return { label: 'size unknown', cls: 'bg-secondary', icon: 'question-line' };
  if (n === 0) return { label: 'empty today', cls: 'bg-light text-dark border', icon: 'inbox-line' };
  if (n < 1000) return { label: 'small', cls: 'bg-light text-dark border', icon: 'database-2-line' };
  if (n < 100_000) return { label: 'substantial', cls: 'bg-warning text-dark', icon: 'database-2-line' };
  return { label: 'large', cls: 'bg-danger', icon: 'alert-line' };
}

/**
 * Column types that mean a row is about a PERSON.
 *
 * Shown as a notice on the panel, because it is the single most useful thing a decider can know
 * about a read grant and it is otherwise buried in a list of forty column names. Matched on the
 * scanner's semantic type first and on the column name only as a fallback, and the fallback is
 * kept narrow: guessing from names is how `read_lead_records` got matched to `hire_interviews`,
 * which is already written up in `datasetCatalog.ts`.
 */
const PERSONAL_TYPES = ['email', 'phone', 'person_name', 'name', 'address', 'ssn'];

export function personalColumns(d: DatasetDetail): string[] {
  return d.columns
    .filter((c) => {
      const t = (c.semantic_type ?? '').toLowerCase();
      if (t && PERSONAL_TYPES.some((p) => t === p || t.includes(p))) return true;
      const n = c.name.toLowerCase();
      return n === 'email' || n.endsWith('_email') || n === 'phone' || n.endsWith('_phone')
        || n === 'full_name' || n === 'first_name' || n === 'last_name';
    })
    .map((c) => c.name);
}

export default function DatasetDetailPanel({
  tableName,
  onClose,
}: {
  tableName: string;
  onClose: () => void;
}) {
  const [detail, setDetail] = useState<DatasetDetail | null>(null);
  const [notCatalogued, setNotCatalogued] = useState(false);
  const [loading, setLoading] = useState(true);
  const [problem, setProblem] = useState('');

  useEffect(() => {
    let alive = true;
    setLoading(true);
    setProblem('');
    setNotCatalogued(false);
    setDetail(null);
    (async () => {
      try {
        const d = await fetchDatasetDetail(tableName);
        if (!alive) return;
        // Null is the 404: the name is not in the catalog. Its own state, because it is also the
        // reason the request would be refused later, and that is worth reading now.
        if (!d) setNotCatalogued(true);
        else setDetail(d);
      } catch (e) {
        if (alive) setProblem(errorMessage(e, 'Could not read that table just now.'));
      } finally {
        if (alive) setLoading(false);
      }
    })();
    return () => { alive = false; };
  }, [tableName]);

  const tone = detail ? sizeTone(detail.row_count) : null;
  const personal = detail ? personalColumns(detail) : [];

  return (
    <div className="card border-primary mt-2 mb-2" data-testid="dataset-detail-panel">
      <div className="card-header bg-white d-flex align-items-center gap-2 py-2">
        <i className="ri-table-line text-primary" aria-hidden="true" />
        <span className="fw-semibold small">The shape of this table</span>
        <code className="small">{tableName}</code>
        {tone && (
          <span className={`badge ${tone.cls}`} title="How much reading this would expose">
            <i className={`ri-${tone.icon} me-1`} aria-hidden="true" />
            {tone.label}
          </span>
        )}
        <button
          type="button"
          className="btn btn-sm btn-link text-muted ms-auto p-0"
          onClick={onClose}
          data-testid="dataset-detail-close"
        >
          Close
        </button>
      </div>

      <div className="card-body py-2">
        {loading && (
          <div className="d-flex align-items-center gap-2 text-muted small">
            <span className="spinner-border spinner-border-sm" role="status" aria-hidden="true" />
            Reading the catalog…
          </div>
        )}

        {/* Not catalogued is NOT an error, and it carries what it means for the request. */}
        {!loading && notCatalogued && (
          <div className="alert alert-warning small mb-0" role="alert" data-testid="dataset-not-catalogued">
            <span className="fw-semibold">{tableName} is not in the dataset catalog.</span>{' '}
            Nothing is recorded about its shape, and a request that names it will be refused as not
            catalogued. Pick a table from the list instead, or say what this tool reads under what
            it touches.
          </div>
        )}

        {!loading && problem && (
          <div className="alert alert-danger small mb-0" role="alert">{problem}</div>
        )}

        {!loading && detail && (
          <>
            <div className="d-flex flex-wrap gap-3 small mb-2">
              <span>
                <span className="text-muted">Size </span>
                <strong data-testid="dataset-rows">{rows(detail.row_count)}</strong>
              </span>
              <span>
                <span className="text-muted">Columns </span>
                <strong>{detail.column_count}</strong>
              </span>
              <span>
                <span className="text-muted">Scanned </span>
                <strong data-testid="dataset-scanned">
                  {detail.last_scanned ?? 'never scanned'}
                </strong>
              </span>
              <span>
                <span className="text-muted">Status </span>
                <strong>{detail.status}</strong>
              </span>
              <span>
                <span className="text-muted">Schema </span>
                <code>{detail.schema_name}</code>
              </span>
            </div>

            {/* The one thing a decider most needs to know, lifted out of the column list. */}
            {personal.length > 0 && (
              <div className="alert alert-warning small py-2 mb-2" role="alert" data-testid="dataset-personal">
                <i className="ri-user-line me-1" aria-hidden="true" />
                <span className="fw-semibold">This table is about people.</span>{' '}
                {`${personal.length} column${personal.length === 1 ? '' : 's'} hold personal
                 details: `}
                {personal.slice(0, 6).map((c) => <code key={c} className="me-1">{c}</code>)}
                {personal.length > 6 ? `and ${personal.length - 6} more. ` : ''}
                Reading it means the agent reads real people&apos;s records.
              </div>
            )}

            {detail.columns.length === 0 ? (
              <div className="form-text mb-2">
                The catalog has this table but recorded no column names for it, so there is nothing
                to show here. That usually means it has not been profiled yet.
              </div>
            ) : (
              <div className="table-responsive" style={{ maxHeight: 260, overflowY: 'auto' }}>
                <table className="table table-sm table-hover mb-0">
                  <thead className="table-light">
                    <tr>
                      <th scope="col" className="small">Column</th>
                      <th scope="col" className="small">Holds</th>
                    </tr>
                  </thead>
                  <tbody data-testid="dataset-columns">
                    {detail.columns.map((c) => (
                      <tr key={c.name}>
                        <td className="small"><code>{c.name}</code></td>
                        <td className="small">
                          {c.semantic_type
                            ? <span className="badge bg-light text-dark border">{c.semantic_type}</span>
                            : <span className="text-muted">not recorded</span>}
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            )}

            {detail.columns_incomplete && (
              <div className="form-text" data-testid="dataset-columns-incomplete">
                {`Showing ${detail.columns.length} of ${detail.column_count} columns. The catalog is
                 behind, or the list is capped, so this is not the whole table.`}
              </div>
            )}

            {detail.relationships.length > 0 && (
              <div className="mt-2">
                <div className="small fw-medium">
                  {detail.relationships_incomplete
                    ? `Joins to ${detail.relationship_count} tables, showing ${detail.relationships.length}`
                    : `Joins to ${detail.relationship_count} table${detail.relationship_count === 1 ? '' : 's'}`}
                </div>
                <div className="d-flex flex-wrap gap-1 mt-1">
                  {detail.relationships.map((r) => (
                    <span
                      key={`${r.to_table}.${r.to_column ?? ''}.${r.from_column ?? ''}`}
                      className="badge bg-light text-dark border"
                      title={r.from_column && r.to_column ? `${r.from_column} → ${r.to_table}.${r.to_column}` : undefined}
                    >
                      <code className="small">{r.to_table}</code>
                    </span>
                  ))}
                </div>
                <div className="form-text" data-testid="dataset-joins-note">
                  A tool that reads this table can follow these joins only if it is also granted
                  them. They are listed so you can see what sits next to it.
                  {detail.relationships_incomplete
                    ? ` This table is heavily connected: ${detail.relationship_count} declared joins, of which ${detail.relationships.length} are shown. Treat the list as a sample, not the blast radius.`
                    : ''}
                </div>
              </div>
            )}

            {/* The absence, named. Otherwise it is read as a thing that is broken. */}
            <div className="form-text mt-2" data-testid="dataset-no-values">
              No rows are shown here, and none are available on this screen. This is the shape of
              the table, which is what a request should be written against. Reading what is in it
              is what the grant you are asking for would allow.
            </div>
          </>
        )}
      </div>
    </div>
  );
}
