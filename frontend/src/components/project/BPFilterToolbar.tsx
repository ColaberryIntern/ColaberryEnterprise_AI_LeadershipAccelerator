/**
 * BPFilterToolbar — sticky filter strip above the BP domain stack.
 *
 * Three composable filters (AND):
 *   1. Type-ahead text (name + linked-file basenames, 120ms debounce)
 *   2. Layer chips (All / Backend / Frontend / Agent / Page)
 *   3. Keyword refine cloud (light-blue panel à la Opportunity Pulse)
 *
 * Cloud is view-scoped: keywords extracted from the BPs currently
 * passing text + layer filters, so the cloud shrinks as filters
 * narrow. Selected chips pin to the top regardless of frequency.
 */
import React, { useEffect, useMemo, useState } from 'react';
import type { BPLike } from '../../utils/bpDomainClassifier';
import { extractKeywords, type KeywordChip } from '../../utils/bpKeywordExtractor';
import type { LayerFilter, BPFilterState } from '../../hooks/useBPFilters';

interface Props {
  /** Filter state + setters from useBPFilters(). */
  state: BPFilterState;
  setQuery: (q: string) => void;
  setLayer: (l: LayerFilter) => void;
  toggleKeyword: (kw: string) => void;
  clearAll: () => void;
  hasAny: boolean;

  /** Total BPs (denominator for the count chip). */
  totalCount: number;
  /** BPs passing the current filters (numerator). */
  visibleCount: number;

  /**
   * BPs to mine for the keyword cloud — typically the BPs passing the
   * text + layer filter (NOT all keyword filters), so toggling a keyword
   * narrows the cloud without making it disappear.
   */
  cloudInputBps: BPLike[];
}

const LAYER_OPTIONS: Array<{ value: LayerFilter; label: string; title: string }> = [
  { value: 'all',      label: 'All',      title: 'Show every BP regardless of layer presence' },
  { value: 'backend',  label: 'Backend',  title: 'BPs with attributed backend service files' },
  { value: 'frontend', label: 'Frontend', title: 'BPs that own a page route or are a page BP' },
  { value: 'agent',    label: 'Agent',    title: 'BPs with confirmed agent attribution' },
  { value: 'page',     label: 'Page',     title: 'Page BPs only (subset of Frontend)' },
];

const BPFilterToolbar: React.FC<Props> = ({
  state, setQuery, setLayer, toggleKeyword, clearAll, hasAny,
  totalCount, visibleCount, cloudInputBps,
}) => {
  // Debounce the typed input so we're not recomputing the keyword cloud
  // on every keystroke. 120ms is short enough to feel live, long enough
  // to skip mid-word recomputation.
  const [localQ, setLocalQ] = useState(state.q);
  useEffect(() => { setLocalQ(state.q); }, [state.q]);
  useEffect(() => {
    if (localQ === state.q) return;
    const id = window.setTimeout(() => setQuery(localQ), 120);
    return () => window.clearTimeout(id);
  }, [localQ, state.q, setQuery]);

  // Cloud derivation: rank from the visible (post text + layer) set,
  // then pin currently-selected keywords to the top regardless of
  // current frequency. Without pinning, a selected chip could vanish
  // when its narrowing leaves it with count = visibleSet (which we
  // suppress as "narrows nothing").
  const cloud = useMemo<KeywordChip[]>(() => {
    const ranked = extractKeywords(cloudInputBps, { topN: 24 });
    const selected = new Set(state.kws);
    const inRanked = new Set(ranked.map(c => c.word));
    const pinned: KeywordChip[] = [];
    for (const kw of state.kws) {
      if (!inRanked.has(kw)) {
        pinned.push({ word: kw, count: 0, weight: 0.6 });
      }
    }
    const rest = ranked.filter(c => !selected.has(c.word));
    const head = ranked.filter(c => selected.has(c.word));
    return [...pinned, ...head, ...rest];
  }, [cloudInputBps, state.kws]);

  return (
    <div
      className="bp-filter-toolbar"
      role="region"
      aria-label="Filter business processes"
      style={{
        position: 'sticky',
        top: 0,
        zIndex: 5,
        background: 'white',
        borderBottom: '1px solid var(--color-border)',
        marginBottom: '1rem',
        paddingBottom: '0.5rem',
      }}
    >
      {/* Row 1 — text input + layer chips + result count */}
      <div style={{
        display: 'flex', alignItems: 'center', gap: 12, flexWrap: 'wrap',
        padding: '0.5rem 0', borderBottom: '1px solid var(--color-border)',
      }}>
        <label style={{
          display: 'inline-flex', alignItems: 'center', gap: 6,
          flex: '1 1 240px', minWidth: 240, maxWidth: 420,
          background: 'var(--color-bg-alt)', border: '1px solid var(--color-border)',
          borderRadius: 6, padding: '0.35rem 0.6rem',
        }}>
          <i className="bi bi-search" aria-hidden="true" style={{ fontSize: 13, color: 'var(--color-text-light)' }} />
          <input
            type="text"
            value={localQ}
            onChange={(e) => setLocalQ(e.target.value)}
            placeholder="Type to filter BPs…"
            aria-label="Filter BPs by name or file"
            style={{
              flex: 1, border: 'none', outline: 'none', background: 'transparent',
              fontSize: 13, color: 'var(--color-text)', padding: 0, minWidth: 0,
            }}
          />
          {localQ && (
            <button
              type="button"
              onClick={() => { setLocalQ(''); setQuery(''); }}
              aria-label="Clear text filter"
              style={{
                background: 'transparent', border: 'none', cursor: 'pointer',
                padding: 2, color: 'var(--color-text-light)', display: 'inline-flex',
              }}
            >
              <i className="bi bi-x-circle-fill" style={{ fontSize: 13 }} />
            </button>
          )}
        </label>

        <div
          role="group"
          aria-label="Layer filter"
          style={{ display: 'inline-flex', alignItems: 'center', gap: 4, flexWrap: 'wrap' }}
        >
          <span style={{
            fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.08em',
            color: 'var(--color-text-light)', fontWeight: 600, marginRight: 4,
          }}>
            Layer
          </span>
          {LAYER_OPTIONS.map(opt => {
            const active = state.layer === opt.value;
            return (
              <button
                key={opt.value}
                type="button"
                onClick={() => setLayer(opt.value)}
                title={opt.title}
                aria-pressed={active}
                style={{
                  padding: '3px 10px', fontSize: 11.5, fontWeight: 600,
                  border: `1px solid ${active ? 'var(--color-primary)' : 'var(--color-border)'}`,
                  background: active ? 'var(--color-primary)' : 'white',
                  color: active ? 'white' : 'var(--color-text)',
                  borderRadius: 999, cursor: 'pointer',
                  minHeight: 28,
                }}
              >
                {opt.label}
              </button>
            );
          })}
        </div>

        <div style={{
          marginLeft: 'auto', display: 'inline-flex', alignItems: 'center', gap: 10,
          fontSize: 12, color: 'var(--color-text-light)',
        }}>
          <span aria-live="polite">
            <strong style={{ color: 'var(--color-text)', fontWeight: 600 }}>{visibleCount}</strong>
            {' of '}{totalCount}
          </span>
          {hasAny && (
            <button
              type="button"
              onClick={clearAll}
              style={{
                background: 'transparent', border: '1px solid var(--color-border)',
                padding: '3px 10px', borderRadius: 4, fontSize: 11.5, cursor: 'pointer',
                color: 'var(--color-text-light)',
                minHeight: 28,
              }}
              title="Clear text, layer, and keyword filters"
            >
              <i className="bi bi-x-lg me-1" style={{ fontSize: 10 }} />
              Clear filters
            </button>
          )}
        </div>
      </div>

      {/* Row 2 — keyword refine cloud */}
      {cloud.length > 0 && (
        <div
          style={{
            background: 'rgba(59,130,246,0.06)',
            border: '1px solid rgba(59,130,246,0.18)',
            borderRadius: 6,
            padding: '0.6rem 0.85rem',
            marginTop: '0.6rem',
          }}
        >
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'space-between',
            gap: 8, marginBottom: 6, flexWrap: 'wrap',
          }}>
            <span style={{
              fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.1em',
              color: 'var(--color-primary)', fontWeight: 700,
            }}>
              <i className="bi bi-stars me-1" aria-hidden="true" />
              Refine
            </span>
            <span style={{ fontSize: 11, color: 'var(--color-text-light)', fontStyle: 'italic' }}>
              click any word to narrow · works across domains
            </span>
          </div>
          <div style={{ display: 'flex', flexWrap: 'wrap', gap: 6, lineHeight: 1.7 }}>
            {cloud.map(chip => {
              const active = state.kws.includes(chip.word);
              // Font size scales with frequency, 11.5 → 16.5px.
              const fontSize = 11.5 + chip.weight * 5;
              return (
                <button
                  key={chip.word}
                  type="button"
                  onClick={() => toggleKeyword(chip.word)}
                  aria-pressed={active}
                  title={chip.count > 0
                    ? `Appears in ${chip.count} BP${chip.count === 1 ? '' : 's'} — click to ${active ? 'remove' : 'add'} filter`
                    : `Keyword filter (no longer in visible set) — click to remove`}
                  style={{
                    padding: '2px 9px',
                    fontSize,
                    fontWeight: active ? 700 : 500,
                    border: `1px solid ${active ? 'var(--color-primary)' : 'transparent'}`,
                    background: active ? 'var(--color-primary)' : 'transparent',
                    color: active ? 'white' : 'var(--color-primary)',
                    borderRadius: 999,
                    cursor: 'pointer',
                    transition: 'background 0.12s, color 0.12s',
                    minHeight: 24,
                  }}
                  onMouseEnter={(e) => {
                    if (!active) e.currentTarget.style.background = 'rgba(59,130,246,0.12)';
                  }}
                  onMouseLeave={(e) => {
                    if (!active) e.currentTarget.style.background = 'transparent';
                  }}
                >
                  {chip.word}
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
};

export default BPFilterToolbar;
