import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import CaseStudyCard from '../../components/caseStudy/CaseStudyCard';
import type { CaseStudyFilterField } from '../../components/caseStudy/CaseStudyFilters';
import CaseStudyLedger from '../../components/caseStudy/CaseStudyLedger';
import { caseStudyDetailPath, resolveCaseStudySurfaceProfile } from '../../config/caseStudySurfaces';
import {
  EMPTY_CASE_STUDY_FILTERS,
  describeCaseStudyError,
  fetchCaseStudyIndex,
  fetchCaseStudyTaxonomy,
  hasActiveCaseStudyFilters,
  parseCaseStudyFilters,
  serializeCaseStudyFilters,
  toggleCaseStudyFacet,
} from '../../services/caseStudyApi';
import type {
  PublicCaseStudyListResponse,
  PublicCaseStudySummary,
  PublicCaseStudyTaxonomyFacets,
} from '../../services/caseStudyPublicTypes';
import { trackCaseStudyCardClick, trackCaseStudyFilter } from '../../utils/caseStudyTracking';
import StoriesStandardBand from './StoriesStandardBand';
import StoriesCta from './StoriesCta';
import StoriesFilterAside from './StoriesFilterAside';
import StoriesSearch from './StoriesSearch';
import StoriesActiveFilters from './StoriesActiveFilters';
import { VISIBLE_PER_GROUP, activeFilterChips, narrowGroups, splitTitle } from './storiesFilterModel';
import {
  MASTHEAD_FALLBACK,
  WIDE_VIEWPORT,
  countSentence,
  emptyStateFor,
  filterGroupsFrom,
  hiddenVerificationCount,
  withDefaultVerification,
} from './storiesV2Model';
import type { IndexState } from './storiesV2Model';
import './storiesV2.css';

/**
 * StoriesV2 - the Enterprise public index at `/stories` (spec sections 22, 26).
 *
 * The old `config/v2Stories.ts` examples are a dev/test fixture only (section
 * 26); this file does not import it and `storiesV2Contract.test.ts` keeps it so.
 *
 * FOUR STATES, FOUR SENTENCES. Loading, failed, empty and populated differ;
 * `caseStudyApi` throws on failure so a failed fetch never reads as "none", and
 * `emptyStateFor()` tells "no match" from "empty library" by the ledger.
 *
 * THE URL IS THE ONLY PLACE FILTER STATE LIVES. No mirrored `useState` for the
 * facets, so reload, back and forward are correct by construction rather than by
 * a synchronisation effect that has to be right in both directions.
 *
 * TRACKING IS CONSENT-GATED AND OFF BY DEFAULT. `PublicLayoutV2` starts the
 * tracker only when `localStorage['cbv2_consent'] === 'granted'`, default
 * `'unset'`. Everything emitted here measures CONSENTING SESSIONS ONLY and
 * nothing on this page may depend on an event arriving. `case_study_view` is
 * deliberately not emitted here: it belongs to the detail page, it is guarded
 * once per slug per session, and firing it per card would write a row per record
 * into a table with no event-level deduplication.
 */

/* ---------------------------------------------------------------- state --- */

/**
 * `<details open>` cannot be driven by a media query, so the page decides and
 * `CaseStudyFilters` is told. When `matchMedia` is unavailable - jsdom does not
 * implement it - the groups open, because hidden content is the worse failure.
 */
function useWideViewport(): boolean {
  const supported = typeof window !== 'undefined' && typeof window.matchMedia === 'function';
  const [wide, setWide] = useState<boolean>(
    () => (supported ? window.matchMedia(WIDE_VIEWPORT).matches : true),
  );

  useEffect(() => {
    if (!supported) return undefined;
    const query = window.matchMedia(WIDE_VIEWPORT);
    const onChange = (): void => setWide(query.matches);
    onChange();
    if (typeof query.addEventListener !== 'function') return undefined;
    query.addEventListener('change', onChange);
    return () => query.removeEventListener('change', onChange);
  }, [supported]);

  return wide;
}

/* ----------------------------------------------------------------- page --- */

function StoriesV2(): React.ReactElement {
  const [searchParams, setSearchParams] = useSearchParams();
  const searchKey = searchParams.toString();

  // Derived from the URL on every render, memoised on the URL string so the
  // fetch effect below is keyed on the query rather than on object identity.
  const filters = useMemo(() => parseCaseStudyFilters(searchKey), [searchKey]);
  const requestFilters = useMemo(() => withDefaultVerification(filters), [filters]);

  const [index, setIndex] = useState<IndexState>({ status: 'loading' });
  const [facets, setFacets] = useState<PublicCaseStudyTaxonomyFacets | null>(null);
  const [facetsFailed, setFacetsFailed] = useState(false);
  const [reloadToken, setReloadToken] = useState(0);
  /* W26: the last response that landed, held while a new filter loads so the
     panel, figures and cards stay put instead of jumping on every click. */
  const [lastReady, setLastReady] = useState<PublicCaseStudyListResponse | null>(null);
  const wide = useWideViewport();

  /**
   * The facet change awaiting its result count. `case_study_filter` is worth
   * recording because of `result_count`, which separates "explored and found
   * matches" from "explored and found nothing" - a content gap rather than an
   * engagement signal. The count is only known once the response lands, so the
   * commit is parked here and emitted on arrival. A ref rather than state: it
   * must not cause a render, and a re-render must not re-emit it.
   */
  const pendingFilterEvent = useRef<{ filter_key: string; filter_value: string } | null>(null);

  /* Taxonomy: the facet vocabulary, derived by the server from what is
     published. Loaded once - it does not narrow with the query. */
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    fetchCaseStudyTaxonomy({ signal: controller.signal })
      .then((response) => {
        if (live) setFacets(response.facets);
      })
      .catch(() => {
        // No menu rather than a menu that cannot be trusted; the note below says
        // so. The records themselves are a separate request and still render.
        if (live) setFacetsFailed(true);
      });
    return () => {
      live = false;
      controller.abort();
    };
  }, []);

  /* The records. Re-runs whenever the URL changes, which is the only thing that
     can change the query. */
  useEffect(() => {
    const controller = new AbortController();
    let live = true;
    setIndex({ status: 'loading' });

    fetchCaseStudyIndex(requestFilters, { signal: controller.signal })
      .then((data) => {
        if (!live) return;
        setIndex({ status: 'ready', data });
        setLastReady(data);
        const pending = pendingFilterEvent.current;
        pendingFilterEvent.current = null;
        if (pending) {
          trackCaseStudyFilter({
            ...pending,
            result_count: data.total,
            surface: data.surface.key,
            source: 'stories-index',
          });
        }
      })
      .catch((err: unknown) => {
        if (!live || controller.signal.aborted) return;
        // A commit whose result never arrived has no result_count to report, and
        // an event carrying a stale one would be worse than no event.
        pendingFilterEvent.current = null;
        setIndex({ status: 'failed', message: describeCaseStudyError(err) });
      });

    return () => {
      live = false;
      controller.abort();
    };
  }, [requestFilters, reloadToken]);

  const commit = useCallback(
    (next: Parameters<typeof serializeCaseStudyFilters>[0]): void => {
      // A push, not a replace: back must undo one facet at a time.
      setSearchParams(serializeCaseStudyFilters(next));
    },
    [setSearchParams],
  );

  const onToggleFacet = useCallback(
    (field: CaseStudyFilterField, value: string): void => {
      pendingFilterEvent.current = { filter_key: field, filter_value: value };
      commit(toggleCaseStudyFacet(filters, field, value));
    },
    [commit, filters],
  );

  const onSearch = useCallback(
    (q: string): void => {
      // Tracked as a filter, because that is what it is - the analytics stream
      // should not have to know search is a different mechanism.
      pendingFilterEvent.current = { filter_key: 'q', filter_value: q || 'cleared' };
      // Page resets with it: holding page 3 while the result set changes shows
      // an empty page, which is the same reason `toggleCaseStudyFacet` does it.
      commit({ ...filters, q, page: null });
    },
    [commit, filters],
  );

  const onClearFilters = useCallback((): void => {
    pendingFilterEvent.current = { filter_key: 'all', filter_value: 'cleared' };
    commit(EMPTY_CASE_STUDY_FILTERS);
  }, [commit]);

  const ready = index.status === 'ready' ? index.data : (index.status === 'loading' ? lastReady : null);
  const refreshing = index.status === 'loading' && lastReady !== null;
  const items: readonly PublicCaseStudySummary[] = ready ? ready.items : [];
  const profile = resolveCaseStudySurfaceProfile(ready ? ready.surface.key : null);
  const masthead = ready ? ready.surface.hero : MASTHEAD_FALLBACK;
  /* W26: counts narrowed to this query when the server sends them; the
     library-wide taxonomy before the first response (or from an older server). */
  const liveFacets = ready?.facets ?? facets;
  const groups = useMemo(() => narrowGroups(filterGroupsFrom(liveFacets), filters), [liveFacets, filters]);
  const chips = useMemo(() => activeFilterChips(groups, filters), [groups, filters]);
  const empty = ready ? emptyStateFor(items, ready.ledger) : null;
  const withheld = hiddenVerificationCount(liveFacets);
  const [titleHead, titleTail] = splitTitle(masthead.title);

  /**
   * Card clicks, by delegation.
   *
   * One observer on the list (the card takes no click handler); it records
   * only clicks that came from a card's own `<a>`, keyboard included.
   */
  const onResultsClick = useCallback(
    (event: React.MouseEvent<HTMLUListElement>): void => {
      const target = event.target as HTMLElement | null;
      if (!target || typeof target.closest !== 'function') return;
      if (!target.closest('a[href]')) return;
      const card = target.closest('[data-case-study]');
      const slug = card?.getAttribute('data-case-study');
      if (!slug) return;
      const record = items.find((item) => item.slug === slug);
      const rank = card?.closest('[data-position]')?.getAttribute('data-position');
      trackCaseStudyCardClick({
        slug,
        position: rank ? Number(rank) : undefined,
        surface: ready?.surface.key,
        source: 'stories-index',
        industry: record?.industry ?? undefined,
        capability: record?.primaryCapability ?? undefined,
        verification: record?.verificationClass,
      });
    },
    [items, ready],
  );

  return (
    <>
      <SeoV2
        title="Shipped work"
        description={
          'Published project records, each assembled from repository evidence, delivery records '
          + 'and approved verification.'
        }
      />

      {/* W26: the light hero every other page uses (crumb, two-tone title);
          the four figures follow the filters below. */}
      <section className="cbv2-prhero5 cbv2-stories__hero" aria-labelledby="cbv2-stories-title">
        <div className="cbv2-wrap">
          <p className="cbv2-crumb5">
            <Link to="/">Home</Link> / Proof
          </p>
          <h1 id="cbv2-stories-title">
            {titleHead}
            {titleTail ? (
              <>
                {' '}
                <span className="cbv2-it">{titleTail}</span>
              </>
            ) : null}
          </h1>
          <p className="cbv2-lede">{masthead.description}</p>
          {/* No ledger until the counts exist (no invented placeholder figure). */}
          {ready ? (
            <>
              <CaseStudyLedger
                className="cbv2-stories__ledger"
                ledger={ready.matchLedger ?? ready.ledger}
                labels={profile.ledgerLabels}
              />
              {hasActiveCaseStudyFilters(filters) && ready.matchLedger ? (
                <p className="cbv2-stories__ledger-note" data-testid="stories-ledger-note">
                  These figures follow your filters.
                </p>
              ) : null}
            </>
          ) : null}
        </div>
      </section>

      <section className="cbv2-rv cbv2-section cbv2-stories__section" aria-labelledby="cbv2-stories-results-title">
        <div className="cbv2-wrap cbv2-stories">
          <h2 className="cbv2-cs-sr-only" id="cbv2-stories-results-title">
            Published projects
          </h2>

          <div className="cbv2-stories__layout">
            <StoriesFilterAside
              groups={groups}
              value={filters}
              onToggle={onToggleFacet}
              openByDefault={wide}
              facetsFailed={facetsFailed}
              withheld={withheld}
              visibleLimit={VISIBLE_PER_GROUP}
            />

            <div className="cbv2-stories__main" aria-busy={refreshing}>
              {/* Directly above the count it moves, so cause and effect are one
                  glance apart. */}
              <StoriesSearch value={filters.q} onCommit={onSearch} />

              <div className="cbv2-stories__toolbar">
                {/* Present from first paint, so a change to its text is announced.
                    A live region inserted along with its content often is not. */}
                <p
                  className="cbv2-stories__count"
                  aria-live="polite"
                  data-testid="stories-result-count"
                >
                  {countSentence(index)}
                </p>
              </div>

              <StoriesActiveFilters chips={chips} onRemove={onToggleFacet} onClear={onClearFilters} />

              {index.status === 'loading' && !refreshing ? (
                <p className="cbv2-stories__state" data-testid="stories-loading">
                  Loading published project records.
                </p>
              ) : null}

              {index.status === 'failed' ? (
                <div className="cbv2-stories__state" role="alert" data-testid="stories-failure">
                  <p>{index.message}</p>
                  <button
                    type="button"
                    className="cbv2-btn cbv2-btn--ghost cbv2-btn--sm"
                    onClick={() => setReloadToken((token) => token + 1)}
                    data-testid="stories-retry"
                  >
                    Try again
                  </button>
                </div>
              ) : null}

              {empty === 'filtered' ? (
                <p className="cbv2-stories__state" data-empty="filtered" data-testid="stories-empty">
                  {profile.emptyFiltered}
                </p>
              ) : null}

              {empty === 'library' ? (
                <p className="cbv2-stories__state" data-empty="library" data-testid="stories-empty">
                  {profile.emptyLibrary}
                </p>
              ) : null}

              {items.length > 0 ? (
                <ul className="cbv2-stories__results" onClick={onResultsClick}>
                  {items.map((item, position) => (
                    <li
                      className="cbv2-stories__result"
                      key={item.slug}
                      data-position={position + 1}
                    >
                      <CaseStudyCard
                        caseStudy={item}
                        href={caseStudyDetailPath(profile, item.slug)}
                        headingLevel={3}
                      />
                    </li>
                  ))}
                </ul>
              ) : null}
            </div>
          </div>
        </div>
      </section>

      {/* W26: after the cards, so a visitor reaches the case studies without
          scrolling past it. Each card still badges its own class in words. */}
      <StoriesStandardBand />

      <StoriesCta />
    </>
  );
}

export default StoriesV2;
