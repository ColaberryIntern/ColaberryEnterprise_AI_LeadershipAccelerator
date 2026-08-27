import { useCallback, useEffect, useState } from 'react';
import { describeApiError } from '../../services/caseStudyAdminApi';
import * as studio from '../../services/caseStudyStudioApi';
import type {
  CaseStudyAiDraft, CaseStudyArtifactRecord, CaseStudyChartResolution, CaseStudyChartType,
  CaseStudyDraftRefusal, CaseStudyQuote, CaseStudyQuoteAttribution, CaseStudyQuoteSource,
  CaseStudyRepoProof, CaseStudyStoryline,
} from '../../services/caseStudyStudioApi';

/**
 * useCaseStudyStudio — the authoring half of the detail page's state.
 *
 * SEPARATE FROM `useCaseStudyDesk` ON PURPOSE, and the separation carries a
 * safety property rather than only tidiness: this hook imports
 * `caseStudyStudioApi` and NOT `caseStudyAdminApi`'s lifecycle functions, so
 * there is no expression anywhere in this module that could publish, approve or
 * unpublish. Authoring state cannot reach a lifecycle act, and that is a
 * property a reader can check by looking at the import list.
 *
 * LAZY BY SECTION. Storyline, drafts, artifacts, charts and quotes each load on
 * demand rather than all on mount, because opening a record to read its
 * provenance should not fire five requests the operator did not ask for. The
 * `loaded` set makes "not fetched yet" distinguishable from "fetched and
 * empty", which is the distinction the list page's four-sentence rule exists to
 * protect.
 */

export interface CaseStudyStudioState {
  storyline: CaseStudyStoryline | null;
  storylineLoading: boolean;
  storylineError: string | null;
  onSaveStoryline: (text: string) => void;

  proofs: readonly CaseStudyRepoProof[];
  analyzing: boolean;
  analyzeError: string | null;
  onAnalyze: (owner: string, repo: string) => void;

  drafts: readonly CaseStudyAiDraft[];
  draftRefusals: readonly CaseStudyDraftRefusal[];
  draftGeneratedBy: string | null;
  generating: boolean;
  draftError: string | null;
  onGenerateDraft: (repositories: readonly { owner: string; repo: string }[]) => void;
  onPromoteDraft: (draftId: string) => void;
  onRejectDraft: (draftId: string) => void;

  artifacts: readonly CaseStudyArtifactRecord[];
  charts: readonly CaseStudyChartResolution[];
  visualsLoading: boolean;
  visualsError: string | null;
  onSetArtifactStatus: (
    artifactId: string,
    status: 'candidate' | 'approved' | 'rejected',
    visibility: 'public' | 'request_only' | 'private',
  ) => void;
  onSaveChart: (body: {
    chartType: CaseStudyChartType; title: string; metricKeys: readonly string[];
  }) => void;
  onSetChartApproval: (chartId: string, approved: boolean) => void;

  quotes: readonly CaseStudyQuote[];
  quotesLoading: boolean;
  quotesError: string | null;
  onCreateQuote: (body: {
    text: string; attribution: CaseStudyQuoteAttribution; source: CaseStudyQuoteSource;
  }) => void;
  onSetQuoteApproval: (quoteId: string, approved: boolean) => void;

  busy: boolean;
  /** Tell the hook which tab is open so it fetches only what is being looked at. */
  ensureLoaded: (section: 'storyline' | 'drafts' | 'visuals' | 'quotes') => void;
  /** Called after a promotion so the desk can re-read the snapshot it changed. */
  onDeskReload: () => void;
}

export function useCaseStudyStudio(
  id: string, reloadDesk: () => Promise<void>,
): CaseStudyStudioState {
  const [busy, setBusy] = useState(false);
  const [loaded, setLoaded] = useState<Set<string>>(new Set());

  const [storyline, setStoryline] = useState<CaseStudyStoryline | null>(null);
  const [storylineLoading, setStorylineLoading] = useState(false);
  const [storylineError, setStorylineError] = useState<string | null>(null);

  const [proofs, setProofs] = useState<readonly CaseStudyRepoProof[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [analyzeError, setAnalyzeError] = useState<string | null>(null);

  const [drafts, setDrafts] = useState<readonly CaseStudyAiDraft[]>([]);
  const [draftRefusals, setDraftRefusals] = useState<readonly CaseStudyDraftRefusal[]>([]);
  const [draftGeneratedBy, setDraftGeneratedBy] = useState<string | null>(null);
  const [generating, setGenerating] = useState(false);
  const [draftError, setDraftError] = useState<string | null>(null);

  const [artifacts, setArtifacts] = useState<readonly CaseStudyArtifactRecord[]>([]);
  const [charts, setCharts] = useState<readonly CaseStudyChartResolution[]>([]);
  const [visualsLoading, setVisualsLoading] = useState(false);
  const [visualsError, setVisualsError] = useState<string | null>(null);

  const [quotes, setQuotes] = useState<readonly CaseStudyQuote[]>([]);
  const [quotesLoading, setQuotesLoading] = useState(false);
  const [quotesError, setQuotesError] = useState<string | null>(null);

  const markLoaded = useCallback((section: string): void => {
    setLoaded((prev) => {
      if (prev.has(section)) return prev;
      const next = new Set(prev);
      next.add(section);
      return next;
    });
  }, []);

  const loadStoryline = useCallback(async () => {
    setStorylineLoading(true);
    setStorylineError(null);
    try {
      setStoryline(await studio.getStoryline(id));
    } catch (err) {
      setStorylineError(describeApiError(err, 'this storyline'));
    } finally {
      setStorylineLoading(false);
    }
  }, [id]);

  const loadDrafts = useCallback(async () => {
    setDraftError(null);
    try {
      setDrafts(await studio.listStoryDrafts(id));
    } catch (err) {
      setDraftError(describeApiError(err, 'these drafts'));
    }
  }, [id]);

  const loadVisuals = useCallback(async () => {
    setVisualsLoading(true);
    setVisualsError(null);
    try {
      const [artifactRows, chartRows] = await Promise.all([
        studio.listArtifactRecords(id),
        studio.listCharts(id),
      ]);
      setArtifacts(artifactRows);
      setCharts(chartRows);
    } catch (err) {
      setVisualsError(describeApiError(err, 'these visuals'));
    } finally {
      setVisualsLoading(false);
    }
  }, [id]);

  const loadQuotes = useCallback(async () => {
    setQuotesLoading(true);
    setQuotesError(null);
    try {
      setQuotes(await studio.listQuotes(id));
    } catch (err) {
      setQuotesError(describeApiError(err, 'these quotes'));
    } finally {
      setQuotesLoading(false);
    }
  }, [id]);

  const ensureLoaded = useCallback((section: 'storyline' | 'drafts' | 'visuals' | 'quotes') => {
    if (loaded.has(section)) return;
    markLoaded(section);
    if (section === 'storyline') void loadStoryline();
    if (section === 'drafts') void loadDrafts();
    if (section === 'visuals') void loadVisuals();
    if (section === 'quotes') void loadQuotes();
  }, [loaded, markLoaded, loadStoryline, loadDrafts, loadVisuals, loadQuotes]);

  // The storyline is step 1 and the Truth tab is the landing tab, so it is the
  // one section fetched on arrival.
  useEffect(() => { ensureLoaded('storyline'); }, [ensureLoaded]);

  const onSaveStoryline = useCallback((text: string): void => {
    setBusy(true);
    setStorylineError(null);
    void studio.saveStoryline(id, text)
      .then(setStoryline)
      .catch((err) => setStorylineError(describeApiError(err, 'this storyline')))
      .finally(() => setBusy(false));
  }, [id]);

  const onAnalyze = useCallback((owner: string, repo: string): void => {
    setAnalyzing(true);
    setAnalyzeError(null);
    void studio.analyzeRepository(id, { owner, repo })
      .then((proof) => setProofs((prev) => [
        // Re-analysing the same repository replaces its result rather than
        // stacking a second panel that may disagree with the first.
        ...prev.filter((p) => !(p.owner === proof.owner && p.repo === proof.repo)),
        proof,
      ]))
      .catch((err) => setAnalyzeError(describeApiError(err, 'this repository')))
      .finally(() => setAnalyzing(false));
  }, [id]);

  const onGenerateDraft = useCallback((
    repositories: readonly { owner: string; repo: string }[],
  ): void => {
    setGenerating(true);
    setDraftError(null);
    void studio.generateStoryDraft(id, repositories)
      .then((result) => {
        setDraftGeneratedBy(result.generatedBy);
        setDraftRefusals(result.refused);
        return loadDrafts();
      })
      .catch((err) => setDraftError(describeApiError(err, 'this draft generation')))
      .finally(() => setGenerating(false));
  }, [id, loadDrafts]);

  /**
   * Promote, then reload BOTH the drafts and the record. Promotion creates a
   * new draft snapshot version, so the desk's view of the snapshot is stale the
   * instant this resolves — and a page showing the old prose beside a draft
   * marked "promoted" would read as a failed write.
   */
  const onPromoteDraft = useCallback((draftId: string): void => {
    setBusy(true);
    setDraftError(null);
    void studio.promoteStoryDraft(id, draftId)
      .then(() => Promise.all([loadDrafts(), reloadDesk()]))
      .catch((err) => setDraftError(describeApiError(err, 'this promotion')))
      .finally(() => setBusy(false));
  }, [id, loadDrafts, reloadDesk]);

  const onRejectDraft = useCallback((draftId: string): void => {
    setBusy(true);
    void studio.rejectStoryDraft(id, draftId)
      .then(() => loadDrafts())
      .catch((err) => setDraftError(describeApiError(err, 'this rejection')))
      .finally(() => setBusy(false));
  }, [id, loadDrafts]);

  const onSetArtifactStatus = useCallback((
    artifactId: string,
    status: 'candidate' | 'approved' | 'rejected',
    visibility: 'public' | 'request_only' | 'private',
  ): void => {
    setBusy(true);
    setVisualsError(null);
    void studio.setArtifactStatus(id, artifactId, { status, visibility })
      .then(() => loadVisuals())
      .catch((err) => setVisualsError(describeApiError(err, 'this artifact')))
      .finally(() => setBusy(false));
  }, [id, loadVisuals]);

  const onSaveChart = useCallback((body: {
    chartType: CaseStudyChartType; title: string; metricKeys: readonly string[];
  }): void => {
    setBusy(true);
    setVisualsError(null);
    void studio.saveChart(id, body)
      .then(() => loadVisuals())
      .catch((err) => setVisualsError(describeApiError(err, 'this chart')))
      .finally(() => setBusy(false));
  }, [id, loadVisuals]);

  const onSetChartApproval = useCallback((chartId: string, approved: boolean): void => {
    setBusy(true);
    setVisualsError(null);
    void studio.setChartApproval(id, chartId, approved)
      .then(() => loadVisuals())
      .catch((err) => setVisualsError(describeApiError(err, 'this chart approval')))
      .finally(() => setBusy(false));
  }, [id, loadVisuals]);

  const onCreateQuote = useCallback((body: {
    text: string; attribution: CaseStudyQuoteAttribution; source: CaseStudyQuoteSource;
  }): void => {
    setBusy(true);
    setQuotesError(null);
    void studio.createQuote(id, body)
      .then(() => loadQuotes())
      .catch((err) => setQuotesError(describeApiError(err, 'this quote')))
      .finally(() => setBusy(false));
  }, [id, loadQuotes]);

  const onSetQuoteApproval = useCallback((quoteId: string, approved: boolean): void => {
    setBusy(true);
    setQuotesError(null);
    // Approving requires a verification class other than `pending`; the server
    // refuses otherwise, and `anonymized` is the honest default for a quote a
    // human recorded but has not independently corroborated.
    void studio.setQuoteApproval(id, quoteId, {
      approved, ...(approved ? { verificationClass: 'anonymized' as const } : {}),
    })
      .then(() => loadQuotes())
      .catch((err) => setQuotesError(describeApiError(err, 'this quote approval')))
      .finally(() => setBusy(false));
  }, [id, loadQuotes]);

  return {
    storyline, storylineLoading, storylineError, onSaveStoryline,
    proofs, analyzing, analyzeError, onAnalyze,
    drafts, draftRefusals, draftGeneratedBy, generating, draftError,
    onGenerateDraft, onPromoteDraft, onRejectDraft,
    artifacts, charts, visualsLoading, visualsError,
    onSetArtifactStatus, onSaveChart, onSetChartApproval,
    quotes, quotesLoading, quotesError, onCreateQuote, onSetQuoteApproval,
    busy, ensureLoaded, onDeskReload: () => { void reloadDesk(); },
  };
}
