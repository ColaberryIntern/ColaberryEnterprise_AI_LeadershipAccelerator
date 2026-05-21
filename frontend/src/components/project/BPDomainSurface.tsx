/**
 * BPDomainSurface — operational architecture view with causality.
 *
 * Operational Causality Sprint, 2026-05-12.
 *
 * The surface reads like a navigable map of business operations — the
 * operator can trace how operational pressure moves through the system.
 *
 *   1. Editorial overview headline (authored, not "X% complete")
 *   2. Operational flow strip — CLICKABLE: each stop carries a BP count
 *      and navigates to its domain (expand + smooth-scroll + pulse)
 *   3. Domain rows — softer monochrome icons, BP count, lifecycle state,
 *      authored narrative, momentum chip, CLICKABLE relationship chips
 *      (receives from / feeds / supports), and an operational-pressure note
 *   4. Expanded domain — entry/exit role + downstream-effect summary +
 *      the BP list
 *   5. First populated domain auto-expanded
 *   6. Power-user escape hatch: "Show full inventory" reveals the legacy grid
 *
 * Not a graph engine — editorial relationship UX. Clicking any
 * relationship or flow stop expands + scrolls + pulses the target domain.
 */
import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import * as bpApi from '../../services/portalBusinessProcessApi';
import {
  classifyBPs,
  type DomainBucket,
  type BPLike,
  type DomainKey,
} from '../../utils/bpDomainClassifier';
import { useDomainMomentum } from '../../hooks/useDomainMomentum';
import { useWorkspaceMemory } from '../../hooks/useWorkspaceMemory';
import FirstVisitFramingCard from '../workspace/FirstVisitFramingCard';
import { useUnifiedProjectState } from '../../hooks/useUnifiedProjectState';
import { computeSystemLeverage, leverageHeadline, buildLeverageSummary } from '../../utils/operationalLeverage';
import { systemResilienceSentence } from '../../utils/structuralConfidence';
import { matchCoryPriorityDomain, whyThisMattersSentence } from '../../utils/coryPriorityMatcher';
import { sortByOperationalPriority, downstreamKeysOf } from '../../utils/domainPrioritySorter';
import BPDetailV2 from './BPDetailV2';
import PortalBusinessProcessesTab from './PortalBusinessProcessesTab';
import { DomainRow } from './BPDomainSurfaceRows';
import MergedCapsModal from './MergedCapsModal';
import BPFilterToolbar from './BPFilterToolbar';
import { useBPFilters } from '../../hooks/useBPFilters';

const BPDomainSurface: React.FC = () => {
  const [processes, setProcesses] = useState<BPLike[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedBp, setSelectedBp] = useState<string | null>(null);
  // userExpanded captures the operator's *explicit* expand/collapse state.
  // Driven only by header clicks. When no filter is active, this is also
  // what renders (single-drill-down). When a filter is active, it overlays
  // the auto-expanded matching-domain set (see effectiveExpanded below).
  // (2026-05-21)
  const [userExpanded, setUserExpanded] = useState<Record<string, boolean>>({});
  const [showFullInventory, setShowFullInventory] = useState(false);
  const [autoExpanded, setAutoExpanded] = useState(false);
  const [pulsedKey, setPulsedKey] = useState<DomainKey | null>(null);
  // 2026-05-20: state for the +N merged-caps overlay surfaced on BP rows
  // whose frontend_route is shared by multiple caps (dedup hint).
  const [mergedBp, setMergedBp] = useState<BPLike | null>(null);
  // 2026-05-21: hide phantom caps (no implementation across any layer
  // AND no requirements) by default. Persisted to localStorage so the
  // operator's preference sticks across visits.
  const [hidePhantoms, setHidePhantoms] = useState<boolean>(() => {
    try {
      const v = localStorage.getItem('bpDomain:hidePhantoms');
      return v === null ? true : v === 'true';
    } catch { return true; }
  });
  useEffect(() => {
    try { localStorage.setItem('bpDomain:hidePhantoms', String(hidePhantoms)); } catch { /* ignore */ }
  }, [hidePhantoms]);
  const phantomCount = useMemo(() => processes.filter(p => (p as any).is_phantom).length, [processes]);

  // 2026-05-20: project-wide call graph (FE→BE) derived once from the
  // loaded processes. Powers the "uses N / used by N" chips on each row.
  // Reverse-direction lookup built locally so the BP API doesn't have to
  // emit a separate inverse map.
  const callGraph = useMemo(() => {
    const nameById = new Map<string, string>();
    const usedByMap = new Map<string, string[]>();
    for (const p of processes) nameById.set(p.id, p.name);
    for (const p of processes) {
      for (const downstreamId of (p as any).frontend_calls_capability_ids || []) {
        const arr = usedByMap.get(downstreamId) || [];
        arr.push(p.id);
        usedByMap.set(downstreamId, arr);
      }
    }
    return { nameById, usedByMap };
  }, [processes]);

  // Refs to each domain row <section> so clicks on the flow strip or a
  // relationship chip can smooth-scroll the target into view.
  const rowRefs = useRef<Record<string, HTMLElement | null>>({});

  // Workspace memory — remember which domain the operator engaged so Cory
  // Home can orient them ("you are currently shaping Lead Intelligence").
  const { memory: workspaceMemory, update: updateMemory } = useWorkspaceMemory();

  useEffect(() => {
    setLoading(true);
    bpApi.getProcesses()
      .then(r => setProcesses(r.data || []))
      .catch(() => setProcesses([]))
      .finally(() => setLoading(false));
  }, []);

  const naturalBuckets = useMemo(() => classifyBPs(processes), [processes]);

  // Cory authority — pull the current next_action so the surface can
  // surface the priority domain visually. Operational Priority Topology
  // Sprint, 2026-05-15.
  const { state: unifiedState } = useUnifiedProjectState({ pollMs: 60_000 });
  const coryPriorityDomain = useMemo(
    () => matchCoryPriorityDomain(unifiedState?.next_action, naturalBuckets),
    [unifiedState?.next_action, naturalBuckets],
  );
  // 2026-05-21: which BP is Cory's current next-action target? Used to
  // render a NEXT chip + accent border + pin to top of its domain sort.
  // source_id from engine_task entries is composite "<capId>:<taskKey>"
  // (e.g. "bc4bc683-...:build_backend"); we want only the cap UUID prefix.
  const nextBpId = useMemo(() => {
    const raw = unifiedState?.next_action?.source_id || null;
    if (!raw) return null;
    const colonIdx = raw.indexOf(':');
    return colonIdx > 0 ? raw.slice(0, colonIdx) : raw;
  }, [unifiedState?.next_action]);
  const focusDomainKey = (workspaceMemory.lastBpDomain as DomainKey | undefined) || null;

  // Priority-sorted stack — Cory's priority domain first, then operator
  // focus, then leverage descending, then canonical orderIndex.
  const buckets = useMemo(
    () => sortByOperationalPriority(naturalBuckets, { coryPriorityDomain, focusDomain: focusDomainKey }),
    [naturalBuckets, coryPriorityDomain, focusDomainKey],
  );
  const momentum = useDomainMomentum(buckets);

  // Set of domain keys downstream of the Cory priority — those rows get
  // a subtle muted-primary left border to make the linkage visible
  // without drawing graph lines.
  const priorityDownstream = useMemo(
    () => downstreamKeysOf(coryPriorityDomain, buckets),
    [coryPriorityDomain, buckets],
  );
  const priorityBucket = useMemo(
    () => buckets.find(b => b.key === coryPriorityDomain) || null,
    [buckets, coryPriorityDomain],
  );
  const whyMattersLine = useMemo(
    () => whyThisMattersSentence(priorityBucket, buckets),
    [priorityBucket, buckets],
  );

  // System-level leverage — where in the operational system effort would
  // ripple furthest right now. Editorial reading of the classifier's
  // existing structural facts (lifecycle states + downstream counts),
  // never a recommendation. Returns null when no domain stands out.
  const systemLeverage = useMemo(() => computeSystemLeverage(buckets), [buckets]);
  const leverageLine = useMemo(() => leverageHeadline(systemLeverage), [systemLeverage]);
  // Resilience phrasing reads sturdier than the classifier's existing
  // systemEvolution scaffolding-and-coordination wording. Falls back to
  // systemEvolution when resilience returns null (fewer than 3 buckets).
  const resilienceLine = useMemo(
    () => systemResilienceSentence(buckets) || systemLeverage.systemEvolution,
    [buckets, systemLeverage.systemEvolution],
  );

  // Persist the operator's current domain focus. Called on explicit
  // engagement only (expanding a row, jumping via flow strip / relationship
  // chip) — never on the system's auto-expand of the first domain.
  const labelByKey = useMemo(
    () => new Map(buckets.map(b => [b.key, b.label] as const)),
    [buckets],
  );
  const rememberDomain = useCallback((key: DomainKey) => {
    updateMemory({
      lastBpDomain: key,
      lastBpDomainLabel: labelByKey.get(key),
      lastBpDomainAt: new Date().toISOString(),
    });
  }, [updateMemory, labelByKey]);

  // Navigate to a domain: expand it, smooth-scroll it into view, pulse it.
  // Used by the flow strip stops AND every relationship chip.
  // 2026-05-20: operator requested single-drill-down — opening one domain
  // collapses all others so the page never carries more than one drawer of
  // detail at a time.
  const navigateToDomain = useCallback((key: DomainKey) => {
    rememberDomain(key);
    setUserExpanded({ [key]: true });
    setPulsedKey(key);
    // Let the expand paint, then scroll.
    requestAnimationFrame(() => {
      requestAnimationFrame(() => {
        rowRefs.current[key]?.scrollIntoView({ behavior: 'smooth', block: 'center' });
      });
    });
    window.setTimeout(() => {
      setPulsedKey(k => (k === key ? null : k));
    }, 1700);
  }, [rememberDomain]);

  // ─── BP filter toolbar wiring ─────────────────────────────────────
  // Hoisted above the auto-expand effect so its `hasAnyFilter` reference
  // is satisfied. Predicate is pushed down to DomainRow which applies
  // it to bucket.processes before sort; empty domains hide.
  const {
    state: filterState,
    setQuery, setLayer, toggleKeyword, clearAll,
    hasAny: hasAnyFilter,
    predicate: filterPredicate,
  } = useBPFilters();

  // Auto-expand the first populated domain on first paint.
  // Skip while filter is active — the filter-driven expand-all (see
  // effectiveExpanded) is doing the heavy lifting and this would just
  // fight it.
  useEffect(() => {
    if (autoExpanded) return;
    if (buckets.length === 0) return;
    if (hasAnyFilter) return;
    setUserExpanded(prev => ({ ...prev, [buckets[0].key]: true }));
    setAutoExpanded(true);
  }, [buckets, autoExpanded, hasAnyFilter]);

  // Persist the current leverage summary to workspace memory on leave so
  // Cory Home can surface one ambient line on the operator's next visit
  // without re-fetching BPs. Mirrors the "save on leave" pattern used for
  // momentum + contribution memory.
  const latestLeverageRef = useRef(systemLeverage);
  useEffect(() => { latestLeverageRef.current = systemLeverage; }, [systemLeverage]);
  useEffect(() => {
    const persistOnLeave = () => {
      const summary = buildLeverageSummary(latestLeverageRef.current);
      if (summary) updateMemory({ lastLeverageSummary: summary });
    };
    const onVis = () => { if (document.visibilityState === 'hidden') persistOnLeave(); };
    document.addEventListener('visibilitychange', onVis);
    window.addEventListener('beforeunload', persistOnLeave);
    return () => {
      document.removeEventListener('visibilitychange', onVis);
      window.removeEventListener('beforeunload', persistOnLeave);
      persistOnLeave(); // also fire on SPA navigation away
    };
  }, [updateMemory]);

  const overall = useMemo(() => {
    const total = buckets.reduce((s, b) => s + b.totalRequirements, 0);
    const matched = buckets.reduce((s, b) => s + b.matchedRequirements, 0);
    return { total, matched, pct: total > 0 ? Math.round((matched / total) * 100) : 0 };
  }, [buckets]);

  // Cap pool the keyword cloud is mined from: BPs that pass text + layer
  // but NOT keyword filter. This way clicking a keyword narrows the rows
  // without making the cloud collapse to just that keyword.
  const cloudInputBps = useMemo(() => {
    return processes.filter((bp) => {
      // Apply phantom hiding to keep the cloud honest.
      if (hidePhantoms && (bp as any).is_phantom) return false;
      // Reuse the predicate but with kws stripped out.
      const partialFilter = { ...filterState, kws: [] };
      // We can call the predicate components inline; simplest path:
      // strip kws by short-circuiting with a synthesized partial check.
      const q = partialFilter.q.trim().toLowerCase();
      if (q) {
        // Reuse same matching rules as bpMatchesQuery — inline-light version.
        const name = bp.name.toLowerCase();
        const tokens = [
          name,
          ...(bp.linked_backend_services || []).map(p => (p.split('/').pop() || p).toLowerCase()),
          ...(bp.linked_frontend_components || []).map(p => (p.split('/').pop() || p).toLowerCase()),
          ...(bp.linked_agents || []).map(p => (p.split('/').pop() || p).toLowerCase()),
          (bp.frontend_route || '').toLowerCase(),
        ];
        if (!tokens.some(t => t.includes(q))) return false;
      }
      const layer = partialFilter.layer;
      if (layer !== 'all') {
        if (layer === 'backend' && (bp.linked_backend_services || []).length === 0) return false;
        if (layer === 'frontend' && !bp.frontend_route && bp.source !== 'frontend_page' && !bp.is_page_bp) return false;
        if (layer === 'agent' && bp.usability?.agent !== 'ready' && bp.usability?.agent !== 'partial') return false;
        if (layer === 'page' && !bp.is_page_bp && bp.source !== 'frontend_page' && !bp.frontend_route) return false;
      }
      return true;
    });
  }, [processes, hidePhantoms, filterState]);

  // Total + visible counts for the toolbar's "N of M" chip. Total excludes
  // phantoms (the operator's hide-phantoms toggle is upstream).
  const totalForCounter = useMemo(
    () => processes.filter(p => !(hidePhantoms && (p as any).is_phantom)).length,
    [processes, hidePhantoms],
  );
  const visibleForCounter = useMemo(
    () => processes.filter(p => !(hidePhantoms && (p as any).is_phantom) && filterPredicate(p)).length,
    [processes, hidePhantoms, filterPredicate],
  );

  // effectiveExpanded — what the render actually uses.
  //   No filter        → userExpanded directly (single-drill-down). If
  //                       userExpanded has no true keys (post-filter
  //                       collapse-everything edge), fall back to the
  //                       first populated bucket so the page is never
  //                       all-collapsed.
  //   Filter active    → union of every matching domain (matchedInDomain > 0)
  //                       overlaid with userExpanded — operator can
  //                       explicitly collapse one mid-filter and that
  //                       sticks; everything else stays open so they
  //                       can see matches across domains.
  // 2026-05-21 (filter expand-all sprint).
  const effectiveExpanded = useMemo(() => {
    if (!hasAnyFilter) {
      const hasAny = Object.values(userExpanded).some(Boolean);
      if (hasAny) return userExpanded;
      return buckets[0] ? { [buckets[0].key]: true } : {};
    }
    // Filter active — start with all domains carrying matches, then
    // overlay explicit operator toggles (true keeps open, false
    // collapses).
    const out: Record<string, boolean> = {};
    for (const b of buckets) {
      const matched = b.processes.some(p =>
        (!hidePhantoms || !(p as any).is_phantom) && filterPredicate(p)
      );
      if (matched) out[b.key] = true;
    }
    for (const [k, v] of Object.entries(userExpanded)) {
      if (k in out || v === true) out[k] = v;
    }
    return out;
  }, [hasAnyFilter, userExpanded, buckets, hidePhantoms, filterPredicate]);

  if (loading) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center', color: 'var(--color-text-light)' }}>
        <div className="spinner-border spinner-border-sm me-2" role="status" />
        Loading operational architecture…
      </div>
    );
  }

  if (buckets.length === 0) {
    return (
      <div style={{ padding: '3rem 1rem', textAlign: 'center' }}>
        <i className="bi bi-diagram-3 d-block mb-2" style={{ fontSize: 32, color: 'var(--color-text-light)' }}></i>
        <div style={{ fontWeight: 600, color: 'var(--color-primary)' }}>No operational domains detected yet</div>
        <div className="small text-muted">
          Upload requirements + extract business processes to see your operational architecture.
        </div>
      </div>
    );
  }

  if (showFullInventory) {
    return (
      <div>
        <div style={{
          display: 'flex', justifyContent: 'space-between', alignItems: 'center',
          padding: '0.7rem 0.95rem', marginBottom: '1rem',
          background: 'var(--color-bg-alt)', borderRadius: 6,
          fontSize: 12, color: 'var(--color-text-light)',
        }}>
          <span>Showing the full flat inventory — every BP in a single grid.</span>
          <button type="button" className="btn btn-sm btn-link p-0" onClick={() => setShowFullInventory(false)} style={{ fontSize: 12 }}>
            ← Back to operational architecture
          </button>
        </div>
        <PortalBusinessProcessesTab />
      </div>
    );
  }

  return (
    <div>
      {/* ─── Editorial overview headline ─── */}
      <header style={{ marginBottom: '1.5rem' }}>
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', gap: 12 }}>
          <div style={{
            fontSize: 10.5, textTransform: 'uppercase', letterSpacing: '0.12em',
            color: 'var(--color-text-light)', fontWeight: 600,
          }}>
            Operational architecture
          </div>
          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexWrap: 'wrap' }}>
            {/* 2026-05-21: hide-phantoms toggle. Default on; shows count + triage link */}
            <label style={{
              display: 'inline-flex', alignItems: 'center', gap: 5,
              fontSize: 11.5, color: 'var(--color-text-light)', cursor: 'pointer',
              padding: '4px 8px',
              border: '1px solid var(--color-border)',
              borderRadius: 4,
              background: hidePhantoms ? 'var(--color-bg-alt)' : 'white',
            }}>
              <input
                type="checkbox"
                checked={hidePhantoms}
                onChange={(e) => setHidePhantoms(e.target.checked)}
                style={{ margin: 0 }}
              />
              <i className="bi bi-eye-slash" style={{ fontSize: 11 }}></i>
              <span>Hide phantoms{phantomCount > 0 ? ` (${phantomCount})` : ''}</span>
            </label>
            {phantomCount > 0 && (
              <a
                href="/portal/project/phantoms"
                className="btn btn-sm btn-link"
                style={{ fontSize: 11.5, padding: '2px 4px', whiteSpace: 'nowrap' }}
                title="Open the phantom-cap triage page"
              >
                Review {phantomCount}
              </a>
            )}
            {/* Phase B (2026-05-20): launch a guided cap walk. */}
            <a
              href="/portal/walk-caps"
              className="btn btn-sm btn-outline-primary"
              style={{ fontSize: 12, whiteSpace: 'nowrap' }}
              title="Step through your caps one at a time, leaving a verdict + note per cap"
            >
              <i className="bi bi-collection me-1"></i>Walk caps
            </a>
          </div>
        </div>
        <h3 style={{
          fontSize: 20, fontWeight: 600, color: 'var(--color-primary)',
          margin: '8px 0 8px', letterSpacing: '-0.012em', lineHeight: 1.35,
          maxWidth: 760,
        }}>
          {buildArchitectureHeadline(buckets, overall.pct)}
        </h3>
        <div style={{ fontSize: 13, color: 'var(--color-text-light)', lineHeight: 1.6, maxWidth: 720 }}>
          {buckets.length} operational domain{buckets.length === 1 ? '' : 's'} ·{' '}
          <strong style={{ color: 'var(--color-text)', fontWeight: 600 }}>{processes.length}</strong> business processes ·{' '}
          {/* Always show the project-wide req count from unified-state so this
              surface agrees with Cory Home + Critique + Blueprint. Falling back
              to the per-BP sum produced "0 of 71" on initial render because
              most reqs don't have capability_id links — misleading flash that
              the operator caught 2026-05-19. Now shows "—" while loading
              instead of the misleading fallback. */}
          {unifiedState?.coverage ? (
            <>
              <strong style={{ color: 'var(--color-text)', fontWeight: 600 }}>
                {unifiedState.coverage.requirements_matched}
                {' of '}
                {unifiedState.coverage.requirements_total}
              </strong>{' '}requirements matched
            </>
          ) : (
            <em style={{ color: 'var(--color-text-light)' }}>loading coverage…</em>
          )}
        </div>
        {/* Phase C surgical reasoning hint — one trailing sentence framing
            what domains and BPs are, for first-time operators. Visible
            to everyone; calm enough to fade into background once known. */}
        <div style={{ fontSize: 12, color: 'var(--color-text-light)', lineHeight: 1.5, maxWidth: 720, marginTop: 6, fontStyle: 'italic' }}>
          Domains are grouped operational areas; expanding a domain shows the business processes inside it.
        </div>
      </header>

      {/* First-visit ambient framing card — appears ONLY when the
          operator has never engaged a BP domain (memory.lastBpDomain
          is null) AND has not dismissed this surface's intro. After
          dismissal it never reappears. Operational Onboarding Sprint,
          2026-05-16. */}
      <FirstVisitFramingCard
        surface="systemBps"
        isFirstVisit={true}
        eyebrow="HOW THIS SURFACE WORKS"
        body="Your operational system is grouped into domains across four canonical stages — Entry, Coordination, Execution, Reporting. The 'Current priority' marker shows where Cory's attention sits today; the order adapts as the system evolves. Strengthening high-leverage areas ripples downstream."
      />

      {/* Horizontal flow strip removed in the Operational Priority
          Topology Sprint, 2026-05-15 — operator feedback approved the
          removal. The domain stack below now serves both navigation and
          overview; relationships between domains remain clickable on
          the per-row chips. */}

      {/* ─── Operational leverage headline — editorial, never prescriptive ─── */}
      {leverageLine && (
        <div
          aria-label="Operational leverage"
          style={{
            background: 'var(--color-bg-alt)',
            border: '1px solid var(--color-border)',
            borderLeft: '3px solid var(--color-primary-light)',
            borderRadius: 6,
            padding: '0.75rem 1rem',
            marginBottom: '1.5rem',
            display: 'flex',
            alignItems: 'flex-start',
            gap: 10,
          }}
        >
          <i
            className="bi bi-bullseye"
            aria-hidden="true"
            style={{ fontSize: 16, color: 'var(--color-primary-light)', flexShrink: 0, marginTop: 2, opacity: 0.85 }}
          ></i>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{
              fontSize: 10, textTransform: 'uppercase', letterSpacing: '0.08em',
              color: 'var(--color-text-light)', fontWeight: 600, marginBottom: 3,
            }}>
              Operational leverage
            </div>
            <div style={{ fontSize: 13, color: 'var(--color-text)', lineHeight: 1.5 }}>
              {leverageLine}
            </div>
            {whyMattersLine && (
              <div
                style={{
                  fontSize: 12, color: 'var(--color-primary)', marginTop: 6, lineHeight: 1.5,
                  paddingTop: 6, borderTop: '1px dashed var(--color-border)',
                }}
                title="Cory's current priority embedded in the topology"
              >
                <span style={{
                  fontSize: 9.5, textTransform: 'uppercase', letterSpacing: '0.08em',
                  color: 'var(--color-text-light)', fontWeight: 600, marginRight: 6,
                }}>Why this matters</span>
                {whyMattersLine}
              </div>
            )}
            {resilienceLine && (
              <div style={{ fontSize: 11.5, color: 'var(--color-text-light)', marginTop: 4, fontStyle: 'italic', lineHeight: 1.5 }}>
                {resilienceLine}
              </div>
            )}
          </div>
        </div>
      )}

      {/* ─── Filter toolbar (sticky) ─── */}
      <BPFilterToolbar
        state={filterState}
        setQuery={setQuery}
        setLayer={setLayer}
        toggleKeyword={toggleKeyword}
        clearAll={clearAll}
        hasAny={hasAnyFilter}
        totalCount={totalForCounter}
        visibleCount={visibleForCounter}
        cloudInputBps={cloudInputBps}
      />

      {/* ─── Domain stack ─── */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.6rem' }}>
        {buckets.map(b => {
          // Drop a domain entirely when filters wipe it out. Keeps the
          // page from listing 6 collapsed (0/N) headers when the operator
          // is hunting for one keyword.
          const matchedInDomain = b.processes.filter(p =>
            (!hidePhantoms || !(p as any).is_phantom) && filterPredicate(p)
          ).length;
          if (hasAnyFilter && matchedInDomain === 0) return null;
          return (
            <DomainRow
              key={b.key}
              bucket={b}
              momentum={momentum[b.key]}
              isExpanded={!!effectiveExpanded[b.key]}
              isPulsing={pulsedKey === b.key}
              isCoryPriority={coryPriorityDomain === b.key}
              isDownstreamOfPriority={priorityDownstream.has(b.key)}
              registerRef={(el) => { rowRefs.current[b.key] = el; }}
              onToggle={() => {
                const currentlyOpen = !!effectiveExpanded[b.key];
                if (hasAnyFilter) {
                  // Filter active: per-domain toggle. Operator can
                  // collapse one of the auto-expanded matches without
                  // closing the others.
                  if (currentlyOpen) {
                    setUserExpanded(prev => ({ ...prev, [b.key]: false }));
                  } else {
                    rememberDomain(b.key);
                    setUserExpanded(prev => ({ ...prev, [b.key]: true }));
                  }
                } else {
                  // No filter: single-drill-down. Clicking opens this
                  // domain (collapsing all others) or closes it if open.
                  if (!currentlyOpen) {
                    rememberDomain(b.key);
                    setUserExpanded({ [b.key]: true });
                  } else {
                    setUserExpanded({});
                  }
                }
              }}
              onNavigate={navigateToDomain}
              onPickBp={setSelectedBp}
              onShowMergedCaps={(bp) => setMergedBp(bp)}
              callGraph={callGraph}
              hidePhantoms={hidePhantoms}
              onOpenPhantomsTriage={() => window.location.assign('/portal/project/phantoms')}
              nextBpId={nextBpId}
              filterPredicate={hasAnyFilter ? filterPredicate : undefined}
            />
          );
        })}
        {hasAnyFilter && visibleForCounter === 0 && (
          <div style={{
            padding: '2rem 1rem', textAlign: 'center',
            background: 'var(--color-bg-alt)', border: '1px dashed var(--color-border)',
            borderRadius: 6, color: 'var(--color-text-light)', fontSize: 13,
          }}>
            <i className="bi bi-funnel d-block mb-2" style={{ fontSize: 22, opacity: 0.6 }} />
            All {totalForCounter} BPs filtered out — clear filters or broaden your search.
            <div style={{ marginTop: 8 }}>
              <button
                type="button"
                onClick={clearAll}
                className="btn btn-sm btn-outline-primary"
                style={{ fontSize: 12 }}
              >
                Clear all filters
              </button>
            </div>
          </div>
        )}
      </div>

      {/* 2026-05-20: +N merged-caps overlay. Driven by the dedup pill on
          any BP row whose frontend_route is shared by multiple caps. */}
      <MergedCapsModal
        open={!!mergedBp}
        route={(mergedBp as any)?.frontend_route || ''}
        caps={(mergedBp as any)?._dupe_caps || []}
        primaryId={(mergedBp as any)?.id || ''}
        onClose={() => setMergedBp(null)}
        onPickCap={(id) => { setMergedBp(null); setSelectedBp(id); }}
      />

      {/* ─── Power-user escape hatch ─── */}
      <div style={{
        marginTop: '1.75rem', paddingTop: '1rem',
        borderTop: '1px solid var(--color-border)',
        display: 'flex', justifyContent: 'space-between', alignItems: 'center',
        gap: '1rem', flexWrap: 'wrap',
      }}>
        <div style={{ fontSize: 11.5, color: 'var(--color-text-light)', fontStyle: 'italic' }}>
          Need every BP at once? The full inventory is available, but it's denser.
        </div>
        <button
          type="button"
          onClick={() => setShowFullInventory(true)}
          style={{
            background: 'transparent', border: '1px solid var(--color-border)',
            padding: '0.4rem 0.85rem', borderRadius: 4,
            fontSize: 12, color: 'var(--color-text-light)', cursor: 'pointer',
          }}
        >
          <i className="bi bi-grid-3x3-gap me-1"></i>Show full inventory
        </button>
      </div>

      {/* ─── BP detail modal ─── */}
      {selectedBp && (
        <div
          style={{
            position: 'fixed', inset: 0, background: 'rgba(15,23,42,0.55)',
            display: 'flex', alignItems: 'flex-start', justifyContent: 'center',
            padding: '3rem 1rem 1rem', overflowY: 'auto', zIndex: 1050,
          }}
          onClick={(e) => { if (e.target === e.currentTarget) setSelectedBp(null); }}
        >
          <div style={{
            background: 'white', borderRadius: 8, width: '100%', maxWidth: 960,
            padding: '1.25rem 1.4rem', boxShadow: '0 20px 60px rgba(15,23,42,0.4)',
          }}>
            <BPDetailV2
              processId={selectedBp}
              onClose={() => setSelectedBp(null)}
              onUpdate={() => {
                bpApi.getProcesses().then(r => setProcesses(r.data || [])).catch(() => {});
              }}
            />
          </div>
        </div>
      )}
    </div>
  );
};

function buildArchitectureHeadline(buckets: DomainBucket[], overallPct: number): string {
  const sorted = [...buckets].sort((a, b) => b.completionPercent - a.completionPercent);
  const top = sorted[0];
  const bottom = sorted[sorted.length - 1];
  if (top && bottom && top !== bottom && top.completionPercent - bottom.completionPercent >= 30) {
    return `${top.label} leads the architecture in maturity; ${bottom.label} is still being scaffolded.`;
  }
  if (overallPct >= 70) return 'Your operational architecture is mature and reading as a connected system.';
  if (overallPct >= 40) return 'Your operational architecture is taking shape — domains exist and the through-line is forming.';
  if (overallPct > 0) return 'Your operational architecture has its first pieces in place; the path between domains is still emerging.';
  return 'Your operational architecture is mapped out; the work to fill it in is just beginning.';
}

export default BPDomainSurface;
