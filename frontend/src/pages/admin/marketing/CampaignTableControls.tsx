import React, { useState } from 'react';
import { ALL_COLUMNS, DEFAULT_COLUMNS, loadViews, saveViews, upsertView, type SavedView } from './campaignTableViews';

/**
 * The campaign table's view controls: objective ranking vs manual sort, the column picker,
 * and saved views. Extracted from AdminMarketingDashboardPage (T016 added this inline to a
 * page already past the size ceiling; CLAUDE.md says the next change to such a file splits
 * before adding - the verifier's convention finding). All the logic is in
 * `campaignTableViews.ts` and tested there; this owns only the picker's local UI state.
 */

export interface CampaignTableControlsProps {
  manualSortLabel: string | null;
  onResetSort: () => void;
  visibleColumns: Set<string>;
  onVisibleColumnsChange: (next: Set<string>) => void;
  /** Injected so tests and SSR need no window. */
  storage: Storage | null;
}

export default function CampaignTableControls({ manualSortLabel, onResetSort, visibleColumns, onVisibleColumnsChange, storage }: CampaignTableControlsProps) {
  const [showPicker, setShowPicker] = useState(false);
  const [views, setViews] = useState<SavedView[]>(() => loadViews(storage));
  const [newViewName, setNewViewName] = useState('');

  const persistViews = (next: SavedView[]) => {
    setViews(next);
    saveViews(storage, next);
  };

  return (
    <>
      <div className="d-flex flex-wrap align-items-center gap-2 px-3 py-2 border-bottom small">
        {manualSortLabel ? (
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={onResetSort}>
            Sorted by {manualSortLabel} - reset to objective ranking
          </button>
        ) : (
          <span className="text-muted">Ranked by each campaign's own objective. Click a column to sort manually.</span>
        )}
        <div className="ms-auto d-flex gap-2 align-items-center">
          <button type="button" className="btn btn-sm btn-outline-secondary" onClick={() => setShowPicker((v) => !v)}>
            Columns ({ALL_COLUMNS.filter((c) => visibleColumns.has(c.key)).length})
          </button>
          {views.length > 0 && (
            <select
              className="form-select form-select-sm"
              style={{ width: 'auto' }}
              value=""
              aria-label="Saved views"
              onChange={(e) => {
                const v = views.find((x) => x.name === e.target.value);
                if (v) onVisibleColumnsChange(new Set(v.columns));
              }}
            >
              <option value="">Saved views...</option>
              {views.map((v) => <option key={v.name} value={v.name}>{v.name}</option>)}
            </select>
          )}
        </div>
      </div>

      {showPicker && (
        <div className="px-3 py-2 border-bottom bg-light small" data-testid="column-picker">
          <div className="d-flex flex-wrap gap-3 mb-2">
            {ALL_COLUMNS.map((col) => (
              <label key={col.key} className="form-check-label d-flex align-items-center gap-1">
                <input
                  type="checkbox"
                  className="form-check-input"
                  checked={visibleColumns.has(col.key)}
                  onChange={(e) => {
                    const next = new Set(visibleColumns);
                    if (e.target.checked) next.add(col.key); else next.delete(col.key);
                    onVisibleColumnsChange(next);
                  }}
                />
                {col.label}
              </label>
            ))}
          </div>
          <div className="d-flex gap-2 align-items-center">
            <input
              className="form-control form-control-sm"
              style={{ maxWidth: 220 }}
              placeholder="Save this column set as..."
              value={newViewName}
              onChange={(e) => setNewViewName(e.target.value)}
            />
            <button
              type="button"
              className="btn btn-sm btn-primary"
              disabled={!newViewName.trim()}
              onClick={() => {
                persistViews(upsertView(views, { name: newViewName.trim(), columns: Array.from(visibleColumns) }));
                setNewViewName('');
              }}
            >
              Save view
            </button>
            <button type="button" className="btn btn-sm btn-link" onClick={() => onVisibleColumnsChange(new Set(DEFAULT_COLUMNS))}>
              Reset columns
            </button>
          </div>
        </div>
      )}
    </>
  );
}
