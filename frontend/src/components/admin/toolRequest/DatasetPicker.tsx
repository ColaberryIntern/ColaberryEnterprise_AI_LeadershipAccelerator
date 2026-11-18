import React, { useEffect, useState } from 'react';
import { searchAgentDomainDatasets, type CatalogDataset } from '../../../services/agentDomainApi';
import DatasetDetailPanel from './DatasetDetailPanel';

/**
 * AF11.11 — the `read_datasets` picker.
 *
 * ## It picks from the catalog rather than accepting typing, because the gate checks the catalog
 *
 * `read_datasets_not_catalogued` refuses a name that is not a real table. The contract's own
 * sentence says *"pick them from the catalog rather than typing them, so the names match real
 * tables"*, and a free-text box would be the control that makes that refusal common.
 *
 * ## "Could not read the catalog" is NOT "no datasets matched"
 *
 * `catalog_absent` comes back true when the catalog could not be read, and the two states are
 * rendered differently on purpose. Showing an unreadable catalog as an empty result would tell the
 * builder no such table exists, and the next thing they do is type the name by hand and get
 * refused for a reason that is not their fault. `datasetCatalog.ts` keeps the same distinction on
 * the server for the same reason.
 *
 * ## AF12.2 — you can look at a table before choosing it
 *
 * Ali, 17 Nov 2026: *"If we are picking datasets we need to be able to see the data when we click
 * on it."* Each row carries a second control that opens `DatasetDetailPanel` with that table's
 * shape, and so does each chosen chip, because the table you most want to check is often one you
 * already picked.
 *
 * It is a separate control rather than the row's own click. The row's click is this component's
 * whole job, and taking it over would mean somebody who wanted to look at a table had chosen it,
 * or had un-chosen one they had. One panel is open at a time: two open panels on a list this
 * short is scrolling for no gain.
 */

export default function DatasetPicker({
  selected,
  onChange,
  disabled,
}: {
  selected: string[];
  onChange: (next: string[]) => void;
  disabled?: boolean;
}) {
  const [q, setQ] = useState('');
  const [results, setResults] = useState<CatalogDataset[]>([]);
  const [absent, setAbsent] = useState(false);
  const [searched, setSearched] = useState(false);
  const [busy, setBusy] = useState(false);
  const [problem, setProblem] = useState('');
  /** The one table whose shape is open, if any. */
  const [inspecting, setInspecting] = useState('');

  useEffect(() => {
    let alive = true;
    // Debounced, so a picker does not fire a request per keystroke.
    const timer = setTimeout(async () => {
      setBusy(true);
      setProblem('');
      try {
        const res = await searchAgentDomainDatasets(q, 25);
        if (!alive) return;
        setResults(res.datasets);
        setAbsent(res.catalog_absent);
        setSearched(true);
      } catch {
        if (!alive) return;
        // A failed REQUEST is the same fact as an unreadable catalog from the reader's point of
        // view: we cannot show them the list. It must not read as "nothing matched".
        setResults([]);
        setAbsent(true);
        setSearched(true);
        setProblem('Could not reach the dataset catalog just now.');
      } finally {
        if (alive) setBusy(false);
      }
    }, 250);
    return () => { alive = false; clearTimeout(timer); };
  }, [q]);

  function toggle(name: string) {
    onChange(selected.includes(name)
      ? selected.filter((n) => n !== name)
      : [...selected, name]);
  }

  return (
    <div data-testid="dataset-picker">
      {selected.length > 0 && (
        <div className="d-flex flex-wrap gap-1 mb-2">
          {selected.map((name) => (
            <span key={name} className="badge bg-light text-dark border d-inline-flex align-items-center">
              <code className="small">{name}</code>
              <button
                type="button"
                className="btn btn-sm btn-link p-0 ms-2 text-decoration-none"
                onClick={() => setInspecting(inspecting === name ? '' : name)}
                aria-label={`Look at ${name}`}
                title="Look at this table"
                data-testid={`inspect-chip-${name}`}
              >
                <i className="ri-eye-line" aria-hidden="true" />
              </button>
              <button
                type="button"
                className="btn btn-sm btn-link p-0 ms-2 text-decoration-none"
                disabled={disabled}
                onClick={() => toggle(name)}
                aria-label={`Remove ${name}`}
                title="Remove"
              >
                ×
              </button>
            </span>
          ))}
        </div>
      )}

      <input
        id="tr-read-datasets"
        className="form-control form-control-sm"
        style={{ maxWidth: 420 }}
        value={q}
        placeholder="Search tables, for example leads"
        disabled={disabled}
        onChange={(e) => setQ(e.target.value)}
      />

      {problem && <div className="form-text text-danger">{problem}</div>}

      {/* THE DISTINCTION THAT MATTERS: unreadable, versus genuinely no match. */}
      {searched && absent && (
        <div className="alert alert-warning small mt-2 mb-0" role="alert">
          We could not read the dataset catalog, so this list is missing rather than empty. Do not
          type a table name to work around it: the name is checked when you file, and a guess will
          be refused. Try again, or leave the list empty and say what this tool reads under what it
          touches.
        </div>
      )}

      {searched && !absent && results.length === 0 && (
        <div className="form-text">
          No table matches that. Try a shorter word, or a column name.
        </div>
      )}

      {!absent && results.length > 0 && (
        <div className="list-group list-group-flush mt-2" style={{ maxHeight: 220, overflowY: 'auto' }}>
          {results.map((d) => (
            <div
              key={`${d.schema_name}.${d.table_name}`}
              className={`list-group-item py-1 d-flex align-items-center gap-2 ${selected.includes(d.table_name) ? 'active' : ''}`}
            >
              {/* Choosing. The whole row, as before, so the target stays big. */}
              <button
                type="button"
                className="btn btn-sm btn-link p-0 text-start flex-grow-1 text-decoration-none"
                style={{ color: 'inherit' }}
                disabled={disabled}
                onClick={() => toggle(d.table_name)}
              >
                <code className="small">{d.table_name}</code>
                <span className={selected.includes(d.table_name) ? 'small ms-2' : 'text-muted small ms-2'}>
                  {`${d.column_count} columns`}
                  {d.last_scanned ? `, scanned ${d.last_scanned}` : ', never scanned'}
                </span>
              </button>
              {/* Looking. Never disabled by `disabled`: that prop stops the form being EDITED,
                  and reading what a table looks like is not an edit. A builder reviewing a
                  submitted request should still be able to check what it named. */}
              <button
                type="button"
                className={`btn btn-sm ${selected.includes(d.table_name) ? 'btn-light' : 'btn-outline-secondary'} py-0 px-1`}
                onClick={() => setInspecting(inspecting === d.table_name ? '' : d.table_name)}
                aria-label={`Look at ${d.table_name}`}
                aria-expanded={inspecting === d.table_name}
                title="Look at this table"
                data-testid={`inspect-${d.table_name}`}
              >
                <i className="ri-eye-line" aria-hidden="true" />
              </button>
            </div>
          ))}
        </div>
      )}
      {inspecting && (
        <DatasetDetailPanel tableName={inspecting} onClose={() => setInspecting('')} />
      )}

      {busy && <div className="form-text">Searching…</div>}
    </div>
  );
}
