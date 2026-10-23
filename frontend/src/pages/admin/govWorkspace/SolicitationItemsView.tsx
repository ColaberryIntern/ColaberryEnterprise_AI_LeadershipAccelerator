import React, { useState } from 'react';
import type { RequirementItem, ReqItemCategory, ExtractedRequirementCandidate } from '../../../services/factoryApi';

/**
 * SolicitationItemsView (P2) — the Step 2 requirements tri-view: Map | Checklist | Raw.
 *
 *  - Map: the four categories (submit / rule / scope / after_award) as a board of cards, each citing
 *    its source fragment, with a category legend + counts. A checkbox per card selects it to establish.
 *  - Checklist: the same items as a dense grouped list (confirm quickly).
 *  - Raw: the extractor's candidate fragments as-is (audit = today's list).
 *
 * A long solicitation can detect ~200 candidates (one category alone, e.g. "Rules to follow", can hold
 * 180+), so every list is CAPPED with a "Show all N" expander — nothing is dropped, the hidden rows are
 * one click away, and the count is always shown. The header is sticky and carries the "Establish selected"
 * action, so the reviewer can confirm without scrolling past the whole list and back up.
 *
 * Presentational only. Selection is keyed by the underlying candidate id (an item cites its candidate via
 * sourceFragments[0].reqId), so the page's existing confirm/establish path is reused unchanged. No chart or
 * routing dependency; the "map" is a responsive 4-column board (falls back to one column on narrow screens).
 */
export type SolView = 'map' | 'checklist' | 'raw';

export interface CandRow { checked: boolean; applicability: string; dueStage: string; }

/** The "Establish selected" action, surfaced in the sticky header so it's reachable without a long scroll. */
export interface EstablishControl { selectedCount: number; busy: boolean; onEstablish: () => void; }

export const CATEGORY_META: Record<ReqItemCategory, { label: string; blurb: string; icon: string; accent: string; bg: string; text: string }> = {
  submit: { label: 'What we submit', blurb: 'Goes in the proposal package', icon: 'file-list-3-line', accent: '#1f6feb', bg: 'bg-primary-subtle', text: 'text-primary-emphasis' },
  rule: { label: 'Rules to follow', blurb: 'Compliance and terms', icon: 'scales-3-line', accent: '#d4760a', bg: 'bg-warning-subtle', text: 'text-warning-emphasis' },
  scope: { label: "What they're buying", blurb: 'The system / services to deliver', icon: 'tools-line', accent: '#117a52', bg: 'bg-success-subtle', text: 'text-success-emphasis' },
  after_award: { label: 'After award', blurb: 'Ongoing duties once we win', icon: 'time-line', accent: '#64748b', bg: 'bg-body-secondary', text: 'text-secondary' },
};
const CATEGORY_ORDER: ReqItemCategory[] = ['submit', 'rule', 'scope', 'after_award'];
/** Cards shown before the "Show all N" expander kicks in. Matches the solicitation requirement lists. */
const CARD_LIMIT = 6;
const RAW_LIMIT = 12;

/** The candidate id an item was built from (1:1 with the extractor's candidate). */
function candidateIdOf(item: RequirementItem): string {
  return item.sourceFragments[0]?.reqId || item.id;
}

/** Frontend mirror of the backend mapping (govRequirementItems.ts): only a `scope` item carries solution_build,
 *  so a confirmed scope item still becomes a build story; others are submission/award-stage. */
export function tracksForCategory(category: ReqItemCategory): string[] {
  return category === 'scope' ? ['proposal', 'solution_build'] : ['proposal'];
}
export function dueStageForCategory(category: ReqItemCategory): 'submission' | 'award' | 'delivery' | 'unknown' {
  if (category === 'submit' || category === 'rule') return 'submission';
  if (category === 'after_award') return 'award';
  if (category === 'scope') return 'delivery';
  return 'unknown';
}

/** A "Show all N (M more)" / "Show fewer" toggle — the shared expander every capped list uses. */
function ShowMore({ total, limit, showAll, onToggle }: { total: number; limit: number; showAll: boolean; onToggle: () => void }): React.ReactElement | null {
  if (total <= limit) return null;
  const hidden = total - limit;
  return (
    <button type="button" className="btn btn-link btn-sm px-0 mt-1" onClick={onToggle} aria-expanded={showAll}>
      {showAll ? 'Show fewer' : `Show all ${total} (${hidden} more)`}
    </button>
  );
}

function Toggle({ view, onView, counts, establish }: { view: SolView; onView: (v: SolView) => void; counts: number; establish?: EstablishControl }): React.ReactElement {
  const btn = (v: SolView, label: string, icon: string) => (
    <button type="button" className={`btn btn-sm ${view === v ? 'btn-primary' : 'btn-outline-secondary'}`} aria-pressed={view === v} onClick={() => onView(v)}>
      <i className={`ri-${icon} me-1`} aria-hidden="true" />{label}
    </button>
  );
  return (
    <div className="d-flex flex-wrap align-items-center justify-content-between gap-2 mb-3 py-2" style={{ position: 'sticky', top: 0, zIndex: 5, background: 'var(--bs-body-bg)' }}>
      <div className="btn-group" role="group" aria-label="Requirements view">
        {btn('map', 'Map', 'mind-map')}
        {btn('checklist', 'Checklist', 'list-check-2')}
        {btn('raw', 'Raw fragments', 'file-text-line')}
      </div>
      <div className="d-flex flex-wrap align-items-center gap-2">
        <span className="small text-secondary">{counts} candidate requirement(s) detected <span className="badge bg-info-subtle text-info-emphasis ms-1">suggested — confirm</span></span>
        {establish && (
          <button type="button" className="btn btn-primary btn-sm" disabled={establish.busy || establish.selectedCount === 0} onClick={establish.onEstablish}>
            <i className="ri-check-double-line me-1" aria-hidden="true" />Establish selected ({establish.selectedCount})
          </button>
        )}
      </div>
    </div>
  );
}

function ItemCard({ item, checked, onToggle, compact }: { item: RequirementItem; checked: boolean; onToggle: (v: boolean) => void; compact?: boolean }): React.ReactElement {
  const cid = candidateIdOf(item);
  return (
    <div className={`border rounded-3 p-2 mb-2 ${item.inferred ? 'border-2 border-dashed' : ''}`} style={item.inferred ? { borderStyle: 'dashed' } : undefined}>
      <div className="d-flex align-items-start gap-2">
        <input type="checkbox" className="form-check-input mt-1" checked={checked} aria-label={`Confirm ${item.title}`} onChange={(e) => onToggle(e.target.checked)} />
        <div className="flex-grow-1">
          <div className="fw-semibold small">{item.title}</div>
          {!compact && <div className="small text-body">{item.definition}</div>}
          <div className="small text-secondary mt-1">
            <i className="ri-file-2-line me-1" aria-hidden="true" />{item.sourceFragments[0]?.doc || 'source'}
            <span className="ms-2 text-uppercase">{cid}</span>
            {item.dueAt ? <span className="badge bg-body-secondary text-secondary ms-2">due {item.dueAt}</span> : null}
            {item.inferred ? <span className="badge bg-warning-subtle text-warning-emphasis ms-2">AI inferred · check</span> : null}
          </div>
        </div>
      </div>
    </div>
  );
}

/** A capped list of item cards with a Show-all expander. Owns its own expand state so each
 *  category (and the Map column vs the Checklist group) expands independently. */
function CollapsibleItems({ list, isChecked, onToggle, compact }: { list: RequirementItem[]; isChecked: (cid: string) => boolean; onToggle: (cid: string, v: boolean) => void; compact?: boolean }): React.ReactElement {
  const [showAll, setShowAll] = useState(false);
  const visible = showAll ? list : list.slice(0, CARD_LIMIT);
  return (
    <>
      {visible.map((it) => (
        <ItemCard key={it.id} item={it} checked={isChecked(candidateIdOf(it))} onToggle={(v) => onToggle(candidateIdOf(it), v)} compact={compact} />
      ))}
      <ShowMore total={list.length} limit={CARD_LIMIT} showAll={showAll} onToggle={() => setShowAll((v) => !v)} />
    </>
  );
}

function RawList({ candidates, candRows, onToggle, onSetField }: {
  candidates: ExtractedRequirementCandidate[];
  candRows: Record<string, CandRow>;
  onToggle: (candidateId: string, checked: boolean) => void;
  onSetField: (candidateId: string, field: 'applicability' | 'dueStage', value: string) => void;
}): React.ReactElement {
  const [showAll, setShowAll] = useState(false);
  const isChecked = (cid: string): boolean => candRows[cid]?.checked ?? true;
  const visible = showAll ? candidates : candidates.slice(0, RAW_LIMIT);
  return (
    <>
      <ul className="list-unstyled mb-2">
        {visible.map((c, idx) => (
          <li key={c.id + idx} className="py-2 border-bottom">
            <div className="d-flex align-items-start gap-2">
              <input type="checkbox" className="form-check-input mt-1" checked={isChecked(c.id)} aria-label={`Confirm ${c.id}`} onChange={(e) => onToggle(c.id, e.target.checked)} />
              <div className="flex-grow-1">
                <div className="fw-semibold small text-uppercase">{c.id}</div>
                <div className="small">{c.extractedText || c.text}</div>
                {(c.sourceDocument || c.section) && (
                  <div className="small text-secondary">{c.sourceDocument ?? ''}{c.section ? ` · §${c.section}` : ''}</div>
                )}
                <div className="d-flex flex-wrap gap-2 mt-1">
                  <select className="form-select form-select-sm" style={{ maxWidth: 150 }} value={candRows[c.id]?.applicability ?? 'always'} aria-label={`Applicability for ${c.id}`}
                    onChange={(e) => onSetField(c.id, 'applicability', e.target.value)}>
                    <option value="always">always</option><option value="conditional">conditional</option><option value="not_applicable">not_applicable</option><option value="unknown">unknown</option>
                  </select>
                  <select className="form-select form-select-sm" style={{ maxWidth: 140 }} value={candRows[c.id]?.dueStage ?? 'submission'} aria-label={`Due stage for ${c.id}`}
                    onChange={(e) => onSetField(c.id, 'dueStage', e.target.value)}>
                    <option value="submission">submission</option><option value="award">award</option><option value="delivery">delivery</option><option value="unknown">unknown</option>
                  </select>
                </div>
              </div>
            </div>
          </li>
        ))}
      </ul>
      <ShowMore total={candidates.length} limit={RAW_LIMIT} showAll={showAll} onToggle={() => setShowAll((v) => !v)} />
    </>
  );
}

export function SolicitationItemsView({
  items, candidates, candRows, onToggle, onSetField, view, onView, establish,
}: {
  items: RequirementItem[] | null;
  candidates: ExtractedRequirementCandidate[];
  candRows: Record<string, CandRow>;
  onToggle: (candidateId: string, checked: boolean) => void;
  onSetField: (candidateId: string, field: 'applicability' | 'dueStage', value: string) => void;
  view: SolView;
  onView: (v: SolView) => void;
  establish?: EstablishControl;
}): React.ReactElement {
  const hasItems = Array.isArray(items) && items.length > 0;
  const isChecked = (cid: string): boolean => candRows[cid]?.checked ?? true;

  // No taxonomy (older backend or empty) — just the raw fragments.
  const effectiveView: SolView = hasItems ? view : 'raw';

  const byCat: Record<ReqItemCategory, RequirementItem[]> = { submit: [], rule: [], scope: [], after_award: [] };
  if (hasItems) for (const it of items as RequirementItem[]) byCat[it.category].push(it);

  return (
    <div>
      <Toggle view={effectiveView} onView={onView} counts={candidates.length} establish={establish} />

      {effectiveView === 'map' && hasItems && (
        <div className="row g-3 mb-2">
          {CATEGORY_ORDER.map((cat) => {
            const m = CATEGORY_META[cat];
            const list = byCat[cat];
            return (
              <div key={cat} className="col-12 col-lg-3">
                <div className={`rounded-3 p-2 h-100 ${m.bg}`} style={{ borderTop: `3px solid ${m.accent}` }}>
                  <div className={`d-flex align-items-center justify-content-between mb-2 ${m.text}`}>
                    <span className="fw-semibold small"><i className={`ri-${m.icon} me-1`} aria-hidden="true" />{m.label}</span>
                    <span className="badge" style={{ background: m.accent, color: '#fff' }}>{list.length}</span>
                  </div>
                  <div className="small text-secondary mb-2">{m.blurb}</div>
                  {list.length === 0 ? (
                    <div className="small text-secondary fst-italic">None detected</div>
                  ) : (
                    <CollapsibleItems list={list} isChecked={isChecked} onToggle={onToggle} compact />
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      {effectiveView === 'checklist' && hasItems && (
        <div className="mb-2">
          {CATEGORY_ORDER.map((cat) => {
            const list = byCat[cat];
            if (list.length === 0) return null;
            const m = CATEGORY_META[cat];
            return (
              <div key={cat} className="mb-3">
                <div className={`small fw-semibold text-uppercase mb-1 ${m.text}`}><i className={`ri-${m.icon} me-1`} aria-hidden="true" />{m.label} ({list.length})</div>
                <CollapsibleItems list={list} isChecked={isChecked} onToggle={onToggle} />
              </div>
            );
          })}
        </div>
      )}

      {effectiveView === 'raw' && (
        <RawList candidates={candidates} candRows={candRows} onToggle={onToggle} onSetField={onSetField} />
      )}
    </div>
  );
}
