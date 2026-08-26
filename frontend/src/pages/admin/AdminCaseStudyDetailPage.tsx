import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader, StatusBadge } from '../../components/admin/shell';
import {
  CaseStudyArtifactsPanel, CaseStudyConsentPanel, CaseStudyContributorsPanel,
  CaseStudyEvidencePanel, CaseStudyMetricsPanel, CaseStudyNarrativePanel, CaseStudyPreviewPanel,
  CaseStudyProvenancePanel, CaseStudyPublishPanel, CaseStudyReadinessPanel,
  CaseStudyRepositoriesPanel, CaseStudySyncPanel, formatDate, readProvenance, readSnapshot,
} from '../../components/admin/caseStudy';
import type { ProvenanceVersionOption } from '../../components/admin/caseStudy';
import CaseStudySurfaceLab from './CaseStudySurfaceLab';
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
 * AdminCaseStudyDetailPage — the review desk for one candidate (spec §17, §18).
 *
 * The whole record is on one page rather than behind tabs, because the decision
 * this screen exists for is a single judgement made across all of it: a metric
 * is publishable only if its evidence is, a name may be shown only if consent
 * was recorded, and the publish gate refuses on any of them. Splitting that into
 * tabs would let a reviewer approve a record having seen a third of it.
 *
 * NOTHING HERE DECIDES ANYTHING. Every action posts to a service that owns the
 * rule and re-checks it; readiness is displayed and never gates; the publish
 * button is enabled regardless of score, and the gate's named refusals are
 * rendered in full. All four write paths (sync, approve, publish, unpublish) are
 * idempotent server-side, so the retry strategy for any of them is pressing the
 * button again.
 */

/**
 * THE PUBLISH SURFACE. Deliberately a constant, and deliberately NOT the surface
 * the lens lab is looking at.
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
const PUBLISH_SURFACE: CaseStudySurfaceKey = 'enterprise';
const SYNC_RUN_PAGE = { limit: 20, offset: 0 };

function AdminCaseStudyDetailPage(): React.ReactElement {
  const { id = '' } = useParams<{ id: string }>();

  const [detail, setDetail] = useState<CaseStudyDetail | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [busy, setBusy] = useState(false);
  const [syncing, setSyncing] = useState(false);
  const [actionError, setActionError] = useState<string | null>(null);
  const [actionNote, setActionNote] = useState<string | null>(null);
  const [blockers, setBlockers] = useState<readonly CaseStudyPublishBlocker[]>([]);
  const [blockerSource, setBlockerSource] = useState<'publish' | 'preview' | null>(null);

  const [preview, setPreview] = useState<CaseStudySurfacePreview | null>(null);
  const [previewLoading, setPreviewLoading] = useState(false);
  const [previewError, setPreviewError] = useState<string | null>(null);
  /**
   * Which lens the lab is showing. State, not a constant — but note what it is
   * NOT wired to: `onPublish` and `onUnpublish` below both read
   * `PUBLISH_SURFACE`, never this. See the constant's comment.
   */
  const [lensSurface, setLensSurface] = useState<CaseStudySurfaceKey>(PUBLISH_SURFACE);
  /**
   * Whether the RAW SNAPSHOT panel has been opened.
   *
   * It exists because the lens lab now loads a preview on arrival, and
   * `CaseStudyPreviewPanel`'s left-hand column is a verbatim dump of the
   * snapshot — which names private repositories, by a disclosed §34 exception
   * pinned in `AdminCaseStudies.states.test.tsx`. That exception is defensible
   * for a reviewer who deliberately opened it and indefensible as something that
   * appears on screen for anyone who merely navigated to the page. So the lab
   * auto-loads and the raw dump stays behind its own click, exactly as before.
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
   * One human override of one snapshot field (spec §34). Every editorial panel
   * shares this path deliberately: an override is the same operation whichever
   * field it touches, and it always produces a NEW snapshot version that has to
   * be approved before it counts, so no panel gets to write directly.
   */
  const override = useCallback((path: string, value: string, note?: string): void => {
    void act(
      'this override',
      () => applyCaseStudyOverride(id, { path, value, ...(note ? { note } : {}) }),
      `Override applied to ${path} as a new snapshot version. Approve it before it counts.`,
    );
  }, [act, id]);

  const onSync = async () => {
    setSyncing(true);
    setActionError(null);
    try {
      const result = await syncCaseStudy(id, { trigger: 'manual' });
      setLastSync(result);
      await load();
    } catch (err) {
      setActionError(describeApiError(err, 'this sync'));
    } finally {
      setSyncing(false);
    }
  };

  /**
   * Publish. A refusal is not an error to be summarised: it is a list of named
   * conditions, and every one of them is put on screen.
   */
  const onPublish = async () => {
    setBusy(true);
    setActionError(null);
    setActionNote(null);
    setBlockers([]);
    try {
      const result = await publishCaseStudy(id, { surfaceKey: PUBLISH_SURFACE });
      setActionNote(result.outcome === 'published'
        ? `Published snapshot v${result.snapshotVersion} to the enterprise surface.`
        : 'Nothing changed: that snapshot was already live on this surface.');
      await load();
    } catch (err) {
      const named = publishBlockersFrom(err);
      setBlockers(named);
      setBlockerSource('publish');
      setActionError(named.length > 0
        ? `The publish gate refused this record for ${named.length} named reason${named.length === 1 ? '' : 's'}. Every one is listed below.`
        : describeApiError(err, 'this publication'));
    } finally {
      setBusy(false);
    }
  };

  /**
   * Render one lens. A READ, and the only thing switching a lens does.
   *
   * On failure the previous payload is CLEARED rather than left on screen. A
   * non-allowlisted admin selecting the Training tab gets a 403 here, and
   * keeping the Enterprise projection visible under a heading that now says
   * Training would show an operator one surface's content labelled as another's
   * — which is the exact confusion this whole lab exists to remove.
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
   * not touch `PUBLISH_SURFACE`, and there is no code path from this callback to
   * `publishCaseStudy`.
   */
  const onSelectLens = useCallback((surfaceKey: CaseStudySurfaceKey): void => {
    setLensSurface(surfaceKey);
    void runPreview(surfaceKey);
  }, [runPreview]);

  /**
   * Render the LIVE lens on arrival, so the desk opens showing what is actually
   * published rather than an empty panel and an instruction.
   *
   * It fires for `PUBLISH_SURFACE` and only for `PUBLISH_SURFACE` — never for a
   * restricted one. That is deliberate: an admin who is not on the surface lab
   * allowlist must never meet a 403 they did not ask for, and enterprise is the
   * one surface every admin may always preview. Switching to a restricted lens
   * stays an explicit act.
   */
  useEffect(() => {
    void runPreview(PUBLISH_SURFACE);
  }, [runPreview]);

  const onLoadRuns = async () => {
    setRunsLoading(true);
    setRunsError(null);
    try {
      const page = await listCaseStudySyncRuns(id, SYNC_RUN_PAGE);
      setRuns(page.items);
    } catch (err) {
      setRuns(null);
      setRunsError(describeApiError(err, 'the sync history'));
    } finally {
      setRunsLoading(false);
    }
  };

  const enterprisePublication = detail?.publications
    .find((p) => p.surfaceKey === PUBLISH_SURFACE) ?? null;
  const publishedSnapshotId = enterprisePublication?.publishedSnapshotId ?? null;

  const onDiff = async () => {
    if (!publishedSnapshotId) return;
    setDiffLoading(true);
    setDiffError(null);
    try {
      const result = await previewCaseStudy(id, { snapshotId: publishedSnapshotId });
      setPublishedSnapshot(result.snapshot);
    } catch (err) {
      setDiffError(describeApiError(err, 'the published version'));
    } finally {
      setDiffLoading(false);
    }
  };

  const onSelectProvenanceVersion = async (snapshotId: string) => {
    setProvenanceId(snapshotId);
    setProvenanceError(null);
    if (!snapshotId) {
      setProvenanceSnapshot(null);
      return;
    }
    setProvenanceLoading(true);
    try {
      const result = await previewCaseStudy(id, { snapshotId });
      setProvenanceSnapshot(result.snapshot);
    } catch (err) {
      setProvenanceSnapshot(null);
      setProvenanceError(describeApiError(err, 'that snapshot version'));
    } finally {
      setProvenanceLoading(false);
    }
  };

  const view = useMemo(() => readSnapshot(detail?.latestSnapshot?.content ?? null), [detail]);
  const metrics = useMemo(() => [...view.heroMetrics, ...view.measurementMetrics], [view]);
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

  if (loading) {
    return <div className="container-fluid py-4"><p className="text-muted">Loading this Case Study...</p></div>;
  }

  if (loadError || !detail) {
    return (
      <div className="container-fluid py-4">
        <PageHeader
          title="Case Study" icon="award-line"
          breadcrumb={[
            { label: 'Admin', to: '/admin/dashboard' },
            { label: 'Case Studies', to: '/admin/case-studies' },
            { label: 'Detail' },
          ]}
        />
        <div className="alert alert-danger" data-testid="cs-detail-load-error">
          {loadError || 'This Case Study could not be found.'}
        </div>
        <Link className="btn btn-outline-secondary" to="/admin/case-studies">
          Back to all Case Studies
        </Link>
      </div>
    );
  }

  const record = detail.caseStudy;

  return (
    <div className="container-fluid py-4">
      <PageHeader
        title={record.title} icon="award-line"
        subtitle={`${record.sourceType} · ${record.slug} · updated ${formatDate(record.updatedAt, true)}`}
        breadcrumb={[
          { label: 'Admin', to: '/admin/dashboard' },
          { label: 'Case Studies', to: '/admin/case-studies' },
          { label: record.title },
        ]}
        actions={<StatusBadge label={record.status} />}
      />

      <CaseStudyReadinessPanel
        readiness={detail.readiness} busy={busy}
        onRecheck={() => { void load(); }}
      />

      <CaseStudyPublishPanel
        record={record}
        latestSnapshot={detail.latestSnapshot}
        approvedSnapshot={detail.approvedSnapshot}
        publications={detail.publications}
        blockers={blockers}
        blockerSource={blockerSource}
        actionError={actionError}
        actionNote={actionNote}
        busy={busy}
        onApprove={() => {
          if (!detail.latestSnapshot) return;
          void act('this approval',
            () => approveCaseStudySnapshot(id, detail.latestSnapshot!.id),
            'Snapshot approved. It now supersedes any earlier approved version.');
        }}
        onPublish={() => { void onPublish(); }}
        onUnpublish={() => {
          void act('this unpublish', () => unpublishCaseStudy(id, { surfaceKey: PUBLISH_SURFACE }),
            'Unpublished. Snapshots, evidence and publication history are kept.');
        }}
        onArchive={() => {
          if (!window.confirm(`Archive "${record.title}"? Nothing is deleted.`)) return;
          void act('this archive', () => archiveCaseStudy(id),
            'Archived. The record is out of the worklist and nothing was deleted.');
        }}
      />

      <CaseStudyNarrativePanel
        view={view} busy={busy} hasSnapshot={detail.latestSnapshot !== null}
        onApplyOverride={override}
      />

      <CaseStudyMetricsPanel metrics={metrics} busy={busy} onApplyOverride={override} />

      <CaseStudyEvidencePanel metrics={metrics} busy={busy} onApplyOverride={override} />

      <CaseStudyArtifactsPanel
        artifacts={view.artifacts} busy={busy} onApplyOverride={override}
      />

      <CaseStudyContributorsPanel
        contributors={view.contributors} busy={busy} onApplyOverride={override}
      />

      <CaseStudyConsentPanel
        record={record} busy={busy}
        onSave={(patch: CaseStudyUpdatePatch) => {
          void act('this consent change', () => updateCaseStudy(id, patch),
            'Consent saved on the record. Rebuild the snapshot with a sync and approve it again, '
            + 'or the gate will refuse the publish for a consent mismatch.');
        }}
      />

      <CaseStudyRepositoriesPanel
        repositories={detail.repositories} busy={busy} syncing={syncing}
        onAttach={(body) => {
          void act('this repository', () => attachCaseStudyRepository(id, body),
            'Repository attached. Sync to read it.');
        }}
        onSetRole={(repositoryId: string, role: CaseStudyRepoRole) => {
          void act('this repository role',
            () => setCaseStudyRepositoryRole(id, repositoryId, role),
            'Role updated. Promoting to primary demotes the previous primary.');
        }}
        onRemove={(repositoryId: string, label: string) => {
          if (!window.confirm(`Detach ${label} from this Case Study?`)) return;
          void act('this repository', () => removeCaseStudyRepository(id, repositoryId),
            'Repository detached. Snapshots that already cite it are unchanged.');
        }}
        onSync={() => { void onSync(); }}
      />

      <CaseStudyProvenancePanel
        rows={readProvenance(
          (provenanceId ? provenanceSnapshot : detail.latestSnapshot)?.provenance ?? null,
        )}
        versions={provenanceVersions}
        selectedSnapshotId={provenanceId}
        onSelectVersion={(snapshotId) => { void onSelectProvenanceVersion(snapshotId); }}
        loading={provenanceLoading}
        error={provenanceError}
      />

      <CaseStudySurfaceLab
        recordTitle={record.title}
        activeSurface={lensSurface}
        onSelectSurface={onSelectLens}
        detail={detail}
        preview={preview}
        loading={previewLoading}
        error={previewError}
      />

      <CaseStudyPreviewPanel
        preview={rawPanelOpen ? preview : null}
        loading={previewLoading} error={previewError}
        surfaceKey={lensSurface}
        onPreview={() => { setRawPanelOpen(true); void runPreview(lensSurface); }}
      />

      <CaseStudySyncPanel
        lastSync={lastSync} runs={runs} runsLoading={runsLoading} runsError={runsError}
        onLoadRuns={() => { void onLoadRuns(); }}
        draftSnapshot={detail.latestSnapshot}
        publishedSnapshot={publishedSnapshot}
        canDiff={publishedSnapshotId !== null}
        diffLoading={diffLoading} diffError={diffError}
        onDiff={() => { void onDiff(); }}
      />
    </div>
  );
}

export default AdminCaseStudyDetailPage;
