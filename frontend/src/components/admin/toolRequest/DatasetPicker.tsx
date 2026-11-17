import React, { useEffect, useState } from 'react';
import { searchAgentDomainDatasets, type CatalogDataset } from '../../../services/agentDomainApi';

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
            <button
              type="button"
              key={`${d.schema_name}.${d.table_name}`}
              className={`list-group-item list-group-item-action py-1 ${selected.includes(d.table_name) ? 'active' : ''}`}
              disabled={disabled}
              onClick={() => toggle(d.table_name)}
            >
              <code className="small">{d.table_name}</code>
              <span className={selected.includes(d.table_name) ? 'small ms-2' : 'text-muted small ms-2'}>
                {`${d.column_count} columns`}
                {d.last_scanned ? `, scanned ${d.last_scanned}` : ', never scanned'}
              </span>
            </button>
          ))}
        </div>
      )}
      {busy && <div className="form-text">Searching…</div>}
    </div>
  );
}
