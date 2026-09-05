import { useCallback, useEffect, useMemo, useState } from 'react';
import { readSnapshot } from '../../components/admin/caseStudy';
import type { ProvenanceVersionOption } from '../../components/admin/caseStudy';
import {
  applyCaseStudyOverride, approveCaseStudySnapshot, archiveCaseStudy, attachCaseStudyRepository,
  describeApiError, getCaseStudy, listCaseStudySyncRuns, previewCaseStudy, publishBlockersFrom,
  publishCaseStudy, removeCaseStudyRepository, setCaseStudyRepositoryRole, syncCaseStudy,
  unpublishCaseStudy, updateCaseStudy,
} from '../../services/caseStudyAdminApi';
import type {
  CaseStudyDetail, CaseStudyPublishBlocker, CaseStudyRepoRole, CaseStudySnapshotSummary,
  CaseStudySurfaceKey, CaseStudySurfacePreview, CaseStudySyncResult, CaseStudySyncRunSummary,
  CaseStudyUpdatePatch,
} from '../../services/caseStudyAdminApi';

/**
 * useCaseStudyDesk — the review desk's state and writes, extracted from
 * `AdminCaseStudyDetailPage.tsx`.
 *
 * WHY IT MOVED. The page was 480 lines against CLAUDE.md's 500 hard ceiling and
 * the Story Studio adds seven tabs and six new panels to it. The Modular
 * Composition Rule requires the split before the addition, and the seam was
 * already visible: twenty-one `useState` hooks and nine callbacks that touch no
 * JSX, sitting above a render function that touches no API.
 *
 * NOTHING HERE DECIDES ANYTHING. Every write posts to a service that owns the
 * rule and re-checks it. Readiness is displayed and never gates. All four write
 * paths (sync, approve, publish, unpublish) are idempotent server-side, so the
 * retry strategy for any of them is pressing the button again.
 */

/**
 * THE PUBLISH SURFACE. Deliberately a constant, and deliberately NOT the
 * surface the lens lab is looking at.
 *
 * Until 2026-08-26 one `SURFACE` constant served preview, publish, unpublish and
 * the publication lookup, so there was nothing to get wrong. The lens lab makes
 * the preview surface a moving value, and the obvious next step — pointing
 * publish at the same state — is the one genuinely dangerous version of this
 * feature: an operator idly exploring the Training lens would be one click from
 * publishing to it, on a surface whose framing copy has never been reviewed and
 * whose publish gate refuses it for a reason they would then be tempted to work
 * around. Preview follows the tab. Publish follows this constant. They are two
 * decisions and they stay two names.
 */
export const PUBLISH_SURFACE: CaseStudySurfaceKey = 'enterprise';

/*
 * 2026-09-05: publish and unpublish now TAKE a surface, because Ali asked to
 * "control what Case Study is shown on what site" and AI Flotation gained a
 * page to be shown on.
 *
 * THE RULE THE CONSTANT ABOVE EXISTS FOR IS UNCHANGED, and this is the part
 * worth reading twice. Publish still does NOT follow `lensSurface`. The danger
 * that constant was written against - an operator idly exploring a lens being
 * one click from publishing to it - is avoided the same way it always was: the
 * surface comes from the control the operator pressed, never from the tab they
 * happen to be looking at. The panel renders one named button per publishable
 * surface, so choosing one is a deliberate act with the brand's name on it.
 * `PUBLISH_SURFACE` remains the default for any caller that names none.
 */
const SYNC_RUN_PAGE = { limit: 20, offset: 0 };

export interface CaseStudyDeskState {
  detail: CaseStudyDetail | null;
  loading: boolean;
  loadError: string | null;
  busy: boolean;
  syncing: boolean;
  actionError: string | null;
  actionNote: string | null;
  blockers: readonly CaseStudyPublishBlocker[];
  blockerSource: 'publish' | 'preview' | null;
  /** True until any gate verdict has been received. Not the same as "no blockers". */
  gateUnknown: boolean;
  preview: CaseStudySurfacePreview | null;
  previewLoading: boolean;
  previewError: string | null;
  lensSurface: CaseStudySurfaceKey;
  rawPanelOpen: boolean;
  lastSync: CaseStudySyncResult | null;
  runs: readonly CaseStudySyncRunSummary[] | null;
  runsLoading: boolean;
  runsError: string | null;
  provenanceId: string;
  provenanceSnapshot: CaseStudySnapshotSummary | null;
  provenanceLoading: boolean;
  provenanceError: string | null;
  publishedSnapshot: CaseStudySnapshotSummary | null;
  diffLoading: boolean;
  diffError: string | null;
  publishedSnapshotId: string | null;
  view: ReturnType<typeof readSnapshot>;
  metrics: ReturnType<typeof readSnapshot>['heroMetrics'];
  provenanceVersions: ProvenanceVersionOption[];
  load: () => Promise<void>;
  override: (path: string, value: string, note?: string) => void;
  setRawPanelOpen: (open: boolean) => void;
  onSync: () => Promise<void>;
  onPublish: (surfaceKey?: CaseStudySurfaceKey) => Promise<void>;
  onSelectLens: (surfaceKey: CaseStudySurfaceKey) => void;
  runPreview: (surfaceKey: CaseStudySurfaceKey) => Promise<void>;
  onLoadRuns: () => Promise<void>;
  onDiff: () => Promise<void>;
  onSelectProvenanceVersion: (snapshotId: string) => Promise<void>;
  onApprove: () => void;
  onUnpublish: (surfaceKey?: CaseStudySurfaceKey) => void;
  onArchive: (title: string) => void;
  onSaveConsent: (patch: CaseStudyUpdatePatch) => void;
  onAttachRepo: (body: { reference: string; role?: CaseStudyRepoRole }) => void;
  onSetRepoRole: (repositoryId: string, role: CaseStudyRepoRole) => void;
  onRemoveRepo: (repositoryId: string, label: string) => void;
}

export function useCaseStudyDesk(id: string): CaseStudyDeskState {
  const [detail, setDetail] = useState<CaseStudyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<readonly CaseStudyPublishBlocker[]>([]);
  const [blockerSource, setBlockerSource] = useState<'publish' | 'preview' | null>(null);
  const [gateUnknown, setGateUnknown] = useState(true);

  const [preview, setPreview] = useState<CaseStudySurfacePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  /**
   * Which lens the lab is showing. State, not a constant — but note what it is
   * NOT wired to: `onPublish` and `onUnpublish` both read `PUBLISH_SURFACE`,
   * never this. See the constant's comment.
   */
  const [lensSurface, setLensSurface] = useState<CaseStudySurfaceKey>(PUBLISH_SURFACE);
  /**
   * Whether the RAW SNAPSHOT panel has been opened. It names private
   * repositories by a disclosed exception, which is defensible for a reviewer
   * who deliberately opened it and indefensible as something that appears for
   * anyone who merely navigated to the page.
   */
  const [rawPanelOpen, setRawPanelOpen] = useState(false);

  const [lastSync, setLastSync] = useState<CaseStudySyncResult | null>(null);
  const [runs, setRuns] = useState<readonly CaseStudySyncRunSummary[] | null>(null);
  const [runsLoading, setRunsLoading] = useState(false);
  const [runsError, setRunsError] = useState<string | null>(null);

  const [provenanceId, setProvenanceId] = useState('');
  const [provenanceSnapshot, setProvenanceSnapshot] = useState<CaseStudySnapshotSummary | null>(null);
  const [provenanceLoading, setProvenanceLoading] = useState(false);
  const [provenanceError, setProvenanceError] = useState<string | null>(null);

  const [publishedSnapshot, setPublishedSnapshot] = useState<CaseStudySnapshotSummary | null>(null);
  const [diffLoading, setDiffLoading] = useState(false);
  const [diffError, setDiffError] = useState<string | null>(null);

  const load = useCallback(async () => {
    try {
      setDetail(await getCaseStudy(id));
      setLoadError(null);
    } catch (err) {
      setLoadError(describeApiError(err, 'this Case Study'));
      setDetail(null);
    }
  }, [id]);

  useEffect(() => {
    setLoading(true);
    load().finally(() => setLoading(false));
  }, [load]);

  /** One write, one reload, one place errors are surfaced rather than swallowed. */
  const act = useCallback(async (
    subject: string, run: () => Promise<unknown>, note: string,
  ): Promise<void> => {
    setBusy(true);
    setActionError(null);
    setActionNote(null);
    try {
      await run();
      setActionNote(note);
      await load();
    } catch (err) {
      setActionError(describeApiError(err, subject));
    } finally {
      setBusy(false);
    }
  }, [load]);

  /**
   * One human override of one snapshot field. Every editorial panel shares this
   * path deliberately: an override is the same operation whichever field it
   * touches, and it always produces a NEW snapshot version that has to be
   * approved before it counts, so no panel gets to write directly.
   */
  const override = useCallback((path: string, value: string, note?: string): void => {
    void act(
      'this override',
      () => applyCaseStudyOverride(id, { path, value, ...(note ? { note } : {}) }),
      `Override applied to ${path} as a new snapshot version. Approve it before it counts.`,
    );
  }, [act, id]);

  const onSync = useCallback(async () => {
    setSyncing(true);
    setActionError(null);
    try {
      setLastSync(await syncCaseStudy(id, { trigger: 'manual' }));
      await load();
    } catch (err) {
      setActionError(describeApiError(err, 'this sync'));
    } finally {
      setSyncing(false);
    }
  }, [id, load]);

  /**
   * Publish. A refusal is not an error to be summarised: it is a list of named
   * conditions, and every one of them is put on screen.
   */
  const onPublish = useCallback(async (surfaceKey: CaseStudySurfaceKey = PUBLISH_SURFACE) => {
    setBusy(true);
    setActionError(null);
    setActionNote(null);
    setBlockers([]);
    try {
      const result = await publishCaseStudy(id, { surfaceKey });
      setGateUnknown(false);
      setActionNote(result.outcome === 'published'
        ? `Published snapshot v${result.snapshotVersion} to the ${surfaceKey} surface.`
        : 'Nothing changed: that snapshot was already live on this surface.');
      await load();
    } catch (err) {
      const named = publishBlockersFrom(err);
      setBlockers(named);
      setBlockerSource('publish');
      setGateUnknown(false);
      setActionError(named.length > 0
        ? `The publish gate refused this record for ${named.length} named reason${named.length === 1 ? '' : 's'}. Every one is listed below.`
        : describeApiError(err, 'this publication'));
    } finally {
      setBusy(false);
    }
  }, [id, load]);

  /**
   * Render one lens. A READ, and the only thing switching a lens does.
   *
   * On failure the previous payload is CLEARED rather than left on screen: a
   * non-allowlisted admin selecting the Training tab gets a 403 here, and
   * keeping the Enterprise projection visible under a heading that now says
   * Training would show one surface's content labelled as another's.
   */
  const runPreview = useCallback(async (surfaceKey: CaseStudySurfaceKey): Promise<void> => {
    setPreviewLoading(true);
    setPreviewError(null);
    try {
      const result = await previewCaseStudy(id, { surfaceKey });
      setPreview(result);
      // The preview carries the REAL gate decision, so its reasons are shown in
      // the same place a refused publish puts them.
      setBlockers(result.decision.blockers);
      setBlockerSource(result.decision.blockers.length > 0 ? 'preview' : null);
      setGateUnknown(false);
    } catch (err) {
      setPreview(null);
      setBlockers([]);
      setBlockerSource(null);
      setPreviewError(describeApiError(err, 'this preview'));
    } finally {
      setPreviewLoading(false);
    }
  }, [id]);

  /**
   * Select a lens. It sets which lens is being LOOKED at and re-reads. It does
   * not touch `PUBLISH_SURFACE`, and there is no code path from this callback
   * to `publishCaseStudy`.
   */
  const onSelectLens = useCallback((surfaceKey: CaseStudySurfaceKey): void => {
    setLensSurface(surfaceKey);
    void runPreview(surfaceKey);
  }, [runPreview]);

  /**
   * Render the LIVE lens on arrival. It fires for `PUBLISH_SURFACE` and only for
   * `PUBLISH_SURFACE`: an admin who is not on the surface lab allowlist must
   * never meet a 403 they did not ask for.
   */
  useEffect(() => {
    void runPreview(PUBLISH_SURFACE);
  }, [runPreview]);

  const onLoadRuns = useCallback(async () => {
    setRunsLoading(true);
    setRunsError(null);
    try {
      setRuns((await listCaseStudySyncRuns(id, SYNC_RUN_PAGE)).items);
    } catch (err) {
      setRuns(null);
      setRunsError(describeApiError(err, 'the sync history'));
    } finally {
      setRunsLoading(false);
    }
  }, [id]);

  const publishedSnapshotId = detail?.publications
    .find((p) => p.surfaceKey === PUBLISH_SURFACE)?.publishedSnapshotId ?? null;

  const onDiff = useCallback(async () => {
    if (!publishedSnapshotId) return;
    setDiffLoading(true);
    setDiffError(null);
    try {
      setPublishedSnapshot((await previewCaseStudy(id, { snapshotId: publishedSnapshotId })).snapshot);
    } catch (err) {
      setDiffError(describeApiError(err, 'the published version'));
    } finally {
      setDiffLoading(false);
    }
  }, [id, publishedSnapshotId]);

  const onSelectProvenanceVersion = useCallback(async (snapshotId: string) => {
    setProvenanceId(snapshotId);
    setProvenanceError(null);
    if (!snapshotId) {
      setProvenanceSnapshot(null);
      return;
    }
    setProvenanceLoading(true);
    try {
      setProvenanceSnapshot((await previewCaseStudy(id, { snapshotId })).snapshot);
    } catch (err) {
      setProvenanceSnapshot(null);
      setProvenanceError(describeApiError(err, 'that snapshot version'));
    } finally {
      setProvenanceLoading(false);
    }
  }, [id]);

  const view = useMemo(() => readSnapshot(detail?.latestSnapshot?.content ?? null), [detail]);
  const metrics = useMemo(
    () => [...view.heroMetrics, ...view.measurementMetrics], [view],
  );
  const provenanceVersions = useMemo((): ProvenanceVersionOption[] => {
    const options: ProvenanceVersionOption[] = [{
      snapshotId: null,
      label: detail?.latestSnapshot
        ? `Latest draft v${detail.latestSnapshot.version}`
        : 'Latest draft (none)',
    }];
    if (detail?.approvedSnapshot) {
      options.push({
        snapshotId: detail.approvedSnapshot.id,
        label: `Approved v${detail.approvedSnapshot.version}`,
      });
    }
    if (publishedSnapshotId && publishedSnapshotId !== detail?.approvedSnapshot?.id) {
      options.push({ snapshotId: publishedSnapshotId, label: 'Published version' });
    }
    return options;
  }, [detail, publishedSnapshotId]);

  const onApprove = useCallback((): void => {
    if (!detail?.latestSnapshot) return;
    void act('this approval',
      () => approveCaseStudySnapshot(id, detail.latestSnapshot!.id),
      'Snapshot approved. It now supersedes any earlier approved version.');
  }, [act, detail, id]);

  const onUnpublish = useCallback((surfaceKey: CaseStudySurfaceKey = PUBLISH_SURFACE): void => {
    void act('this unpublish', () => unpublishCaseStudy(id, { surfaceKey }),
      `Unpublished from ${surfaceKey}. Snapshots, evidence and publication history are kept.`);
  }, [act, id]);

  const onArchive = useCallback((title: string): void => {
    if (!window.confirm(`Archive "${title}"? Nothing is deleted.`)) return;
    void act('this archive', () => archiveCaseStudy(id),
      'Archived. The record is out of the worklist and nothing was deleted.');
  }, [act, id]);

  const onSaveConsent = useCallback((patch: CaseStudyUpdatePatch): void => {
    void act('this consent change', () => updateCaseStudy(id, patch),
      'Consent saved on the record. Rebuild the snapshot with a sync and approve it again, '
      + 'or the gate will refuse the publish for a consent mismatch.');
  }, [act, id]);

  const onAttachRepo = useCallback((body: { reference: string; role?: CaseStudyRepoRole }): void => {
    void act('this repository', () => attachCaseStudyRepository(id, body),
      'Repository attached. Sync to read it.');
  }, [act, id]);

  const onSetRepoRole = useCallback((repositoryId: string, role: CaseStudyRepoRole): void => {
    void act('this repository role', () => setCaseStudyRepositoryRole(id, repositoryId, role),
      'Role updated. Promoting to primary demotes the previous primary.');
  }, [act, id]);

  const onRemoveRepo = useCallback((repositoryId: string, label: string): void => {
    if (!window.confirm(`Detach ${label} from this Case Study?`)) return;
    void act('this repository', () => removeCaseStudyRepository(id, repositoryId),
      'Repository detached. Snapshots that already cite it are unchanged.');
  }, [act, id]);

  return {
    detail, loading, loadError, busy, syncing, actionError, actionNote,
    blockers, blockerSource, gateUnknown,
    preview, previewLoading, previewError, lensSurface, rawPanelOpen,
    lastSync, runs, runsLoading, runsError,
    provenanceId, provenanceSnapshot, provenanceLoading, provenanceError,
    publishedSnapshot, diffLoading, diffError, publishedSnapshotId,
    view, metrics, provenanceVersions,
    load, override, setRawPanelOpen, onSync, onPublish, onSelectLens, runPreview,
    onLoadRuns, onDiff, onSelectProvenanceVersion,
    onApprove, onUnpublish, onArchive, onSaveConsent,
    onAttachRepo, onSetRepoRole, onRemoveRepo,
  };
}
