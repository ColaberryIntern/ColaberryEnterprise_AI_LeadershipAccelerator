/**
 * useBPFilters — composable filter state for the System → BPs surface.
 *
 * Three filters compose AND-style:
 *   q       — type-ahead text (debounced; matches name + linked-file basenames)
 *   layer   — 'all' | 'backend' | 'frontend' | 'agent' | 'page'
 *   kws[]   — keyword chips selected from the refine cloud
 *
 * State source-of-truth: URL search params. Workspace persistence is
 * read on mount only — so a shared link always wins over remembered
 * state, but the operator's last filter set restores on a fresh open.
 *
 *   ?q=foo&layer=backend&kw=prompt,validation
 *
 * Returns a memoized predicate the caller applies to BP rows.
 */
import { useCallback, useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { bpMatchesQuery, bpHasKeyword } from '../utils/bpKeywordExtractor';
import type { BPLike } from '../utils/bpDomainClassifier';

export type LayerFilter = 'all' | 'backend' | 'frontend' | 'agent' | 'page';

export interface BPFilterState {
  q: string;
  layer: LayerFilter;
  kws: string[];
}

export interface UseBPFiltersResult {
  state: BPFilterState;
  setQuery: (q: string) => void;
  setLayer: (layer: LayerFilter) => void;
  toggleKeyword: (kw: string) => void;
  clearAll: () => void;
  /** True when at least one filter is active. */
  hasAny: boolean;
  /** Pure predicate: returns true if a BP passes the current filters. */
  predicate: (bp: BPLike) => boolean;
}

const STORAGE_KEY = 'bpDomain:filters';

const LAYERS: LayerFilter[] = ['all', 'backend', 'frontend', 'agent', 'page'];

export function useBPFilters(): UseBPFiltersResult {
  const [searchParams, setSearchParams] = useSearchParams();

  // Initialize from URL first, then fall back to localStorage memory.
  const [state, setState] = useState<BPFilterState>(() => {
    const urlState = readFromUrl(searchParams);
    if (urlState.q || urlState.layer !== 'all' || urlState.kws.length > 0) {
      return urlState;
    }
    return readFromStorage();
  });

  // Persist whenever state changes — but never persist an empty state
  // (we'd lose the operator's last useful filter set on every Clear).
  useEffect(() => {
    if (!state.q && state.layer === 'all' && state.kws.length === 0) return;
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
    } catch { /* private mode */ }
  }, [state]);

  // Mirror state to URL so links + back button work.
  useEffect(() => {
    const next = new URLSearchParams(searchParams);
    if (state.q) next.set('q', state.q); else next.delete('q');
    if (state.layer !== 'all') next.set('layer', state.layer); else next.delete('layer');
    if (state.kws.length > 0) next.set('kw', state.kws.join(',')); else next.delete('kw');
    // Skip write when nothing changed (avoids history churn on every keystroke).
    const cur = searchParams.toString();
    const want = next.toString();
    if (cur !== want) setSearchParams(next, { replace: true });
  }, [state, searchParams, setSearchParams]);

  const setQuery = useCallback((q: string) => {
    setState(s => ({ ...s, q }));
  }, []);

  const setLayer = useCallback((layer: LayerFilter) => {
    setState(s => ({ ...s, layer }));
  }, []);

  const toggleKeyword = useCallback((kw: string) => {
    setState(s => {
      const lower = kw.toLowerCase();
      const has = s.kws.includes(lower);
      return { ...s, kws: has ? s.kws.filter(k => k !== lower) : [...s.kws, lower] };
    });
  }, []);

  const clearAll = useCallback(() => {
    setState({ q: '', layer: 'all', kws: [] });
    try { localStorage.removeItem(STORAGE_KEY); } catch { /* ignore */ }
  }, []);

  const hasAny = !!state.q || state.layer !== 'all' || state.kws.length > 0;

  const predicate = useMemo(() => {
    const q = state.q;
    const layer = state.layer;
    const kws = state.kws;
    return (bp: BPLike): boolean => {
      if (q && !bpMatchesQuery(bp, q)) return false;
      if (layer !== 'all' && !bpMatchesLayer(bp, layer)) return false;
      for (const kw of kws) {
        if (!bpHasKeyword(bp, kw)) return false;
      }
      return true;
    };
  }, [state.q, state.layer, state.kws]);

  return { state, setQuery, setLayer, toggleKeyword, clearAll, hasAny, predicate };
}

/** Same strict-rule signal the new maturityScorer uses. */
function bpMatchesLayer(bp: BPLike, layer: LayerFilter): boolean {
  switch (layer) {
    case 'all': return true;
    case 'backend':
      return (bp.linked_backend_services || []).length > 0;
    case 'frontend':
      return !!bp.frontend_route
        || bp.source === 'frontend_page'
        || bp.is_page_bp === true;
    case 'agent':
      // BPLike doesn't carry _confirmed_agent_count; the usability.agent
      // signal is the proxy the row already uses, so we mirror that.
      // 'ready' or 'partial' = real agent attribution, 'missing' / 'na' = no.
      return bp.usability?.agent === 'ready' || bp.usability?.agent === 'partial';
    case 'page':
      return bp.is_page_bp === true
        || bp.source === 'frontend_page'
        || !!bp.frontend_route;
    default:
      return true;
  }
}

function readFromUrl(params: URLSearchParams): BPFilterState {
  const q = params.get('q') || '';
  const rawLayer = (params.get('layer') || 'all').toLowerCase();
  const layer: LayerFilter = (LAYERS as string[]).includes(rawLayer)
    ? (rawLayer as LayerFilter)
    : 'all';
  const kwsParam = params.get('kw') || '';
  const kws = kwsParam
    ? kwsParam.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
    : [];
  return { q, layer, kws };
}

function readFromStorage(): BPFilterState {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { q: '', layer: 'all', kws: [] };
    const parsed = JSON.parse(raw);
    const layer: LayerFilter = (LAYERS as string[]).includes(parsed?.layer)
      ? parsed.layer
      : 'all';
    return {
      q: typeof parsed?.q === 'string' ? parsed.q : '',
      layer,
      kws: Array.isArray(parsed?.kws) ? parsed.kws.filter((x: any) => typeof x === 'string') : [],
    };
  } catch {
    return { q: '', layer: 'all', kws: [] };
  }
}
