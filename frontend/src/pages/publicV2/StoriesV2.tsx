import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { Link, useSearchParams } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import CaseStudyCard from '../../components/caseStudy/CaseStudyCard';
import CaseStudyFilters from '../../components/caseStudy/CaseStudyFilters';
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
  PublicCaseStudySummary,
  PublicCaseStudyTaxonomyFacets,
} from '../../services/caseStudyPublicTypes';
import { trackCaseStudyCardClick, trackCaseStudyFilter } from '../../utils/caseStudyTracking';
import StoriesStandardBand from './StoriesStandardBand';
import StoriesCta from './StoriesCta';
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
 * WHAT CHANGED. It used to render `config/v2Stories.ts` - six worked examples,
 * honestly badged, but typed into a source file. Section 26 requires that out of
 * the production data path: the module is now a dev/test fixture, this file does
 * not import it, and `storiesV2Contract.test.ts` greps `src/` to keep it so.
 *
 * FOUR STATES, FOUR SENTENCES. Loading, failed, empty and populated are
 * different situations. The one that costs money to confuse is failed-versus-
 * empty: the admin leads page caught a failed fetch, left its rows at `[]`, and
 * told an operator "No leads yet" against 24,244 real rows. `caseStudyApi`
 * throws on every failure rather than returning an empty list, so a failure
 * cannot reach the empty branch even by accident. And empty is itself two
 * situations - filters that exclude everything, and a library with nothing in it
 * - which `emptyStateFor()` decides from the unfiltered ledger.
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

  const onClearFilters = useCallback((): void => {
    pendingFilterEvent.current = { filter_key: 'all', filter_value: 'cleared' };
    commit(EMPTY_CASE_STUDY_FILTERS);
  }, [commit]);

  const ready = index.status === 'ready' ? index.data : null;
  const items: readonly PublicCaseStudySummary[] = ready ? ready.items : [];
  const profile = resolveCaseStudySurfaceProfile(ready ? ready.surface.key : null);
  const masthead = ready ? ready.surface.hero : MASTHEAD_FALLBACK;
  const groups = useMemo(() => filterGroupsFrom(facets), [facets]);
  const empty = ready ? emptyStateFor(items, ready.ledger) : null;
  const withheld = hiddenVerificationCount(facets);

  /**
   * Card clicks, by delegation.
   *
   * One handler on the list rather than a prop on every card, because the card
   * component is surface-neutral and takes no click handler. It is an OBSERVER,
   * not a control: no role, no tabindex, nothing focusable is created here. The
   * real control is the card's own `<a>`, which is why the handler returns early
   * unless the click originated inside one - a click on the card's whitespace
   * navigates nowhere and must not be recorded as if it had. Keyboard activation
   * dispatches a click from the anchor too, so this covers it.
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

      <section className="cbv2-pagehero" aria-labelledby="cbv2-stories-title">
        <div className="cbv2-wrap">
          <p className="cbv2-eyebrow cbv2-eyebrow--onDark">{masthead.eyebrow}</p>
          <h1 id="cbv2-stories-title">{masthead.title}</h1>
          <p className="cbv2-pagehero__lede">{masthead.description}</p>
          {/* No ledger until the counts exist. A placeholder figure here would be
              the one invented number on a page about not inventing them. */}
          {ready ? (
            <CaseStudyLedger
              className="cbv2-stories__ledger"
              ledger={ready.ledger}
              labels={profile.ledgerLabels}
            />
          ) : null}
        </div>
      </section>

      {/* The vocabulary before the cards that use it - see `StoriesStandardBand`. */}
      <StoriesStandardBand />

      <section className="cbv2-rv cbv2-section" aria-labelledby="cbv2-stories-results-title">
        <div className="cbv2-wrap cbv2-stories">
          <h2 className="cbv2-cs-sr-only" id="cbv2-stories-results-title">
            Published projects
          </h2>

          <div className="cbv2-stories__layout">
            <aside
              className="cbv2-stories__aside"
              aria-label="Filter published projects"
              data-testid="stories-filters"
            >
              <CaseStudyFilters
                groups={groups}
                value={filters}
                onToggle={onToggleFacet}
                openByDefault={wide}
                idPrefix="stories-filter"
              />
              {facetsFailed ? (
                <p className="cbv2-stories__note" data-testid="stories-facets-note">
                  The filter list could not be loaded, so it is not shown. The project records
                  below are unaffected.
                </p>
              ) : null}
              {withheld > 0 ? (
                <p className="cbv2-stories__note" data-testid="stories-hidden-note">
                  Illustrative demonstrations are withheld unless you select them under
                  Verification.
                </p>
              ) : null}
            </aside>

            <div className="cbv2-stories__main">
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
                {hasActiveCaseStudyFilters(filters) ? (
                  <button
                    type="button"
                    className="cbv2-btn cbv2-btn--ghost cbv2-btn--sm"
                    onClick={onClearFilters}
                    data-testid="stories-clear-filters"
                  >
                    Clear all filters
                  </button>
                ) : null}
              </div>

              {index.status === 'loading' ? (
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

      <StoriesCta />
    </>
  );
}

export default StoriesV2;
