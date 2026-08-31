import React, { useEffect, useState } from 'react';
import { Link, useParams } from 'react-router-dom';
import { PageHeader, StatusBadge } from '../../components/admin/shell';
import {
  CaseStudyActionBand, CaseStudyAnalyzePanel, CaseStudyArtifactsPanel, CaseStudyConsentPanel,
  CaseStudyContributorsPanel, CaseStudyDraftPanel, CaseStudyEvidencePanel, CaseStudyGateBand,
  CaseStudyMetricsPanel, CaseStudyNarrativePanel, CaseStudyProvenancePanel,
  CaseStudyPublishPanel, CaseStudyQuotesPanel, CaseStudyReadinessPanel, CaseStudyRepositoriesPanel,
  CaseStudyStorylinePanel, CaseStudyStudioTabStrip, CaseStudySyncPanel, CaseStudyVisualsPanel,
  DEFAULT_STUDIO_TAB, formatDate, readProvenance,
} from '../../components/admin/caseStudy';
import type { CaseStudyStudioTabKey } from '../../components/admin/caseStudy';
import CaseStudyRenderedPreview from './CaseStudyRenderedPreview';
import CaseStudySurfaceLab from './CaseStudySurfaceLab';
import { PUBLISH_SURFACE, useCaseStudyDesk } from './useCaseStudyDesk';
import { useCaseStudyPreviewLens } from './useCaseStudyPreviewLens';
import { useCaseStudyStudio } from './useCaseStudyStudio';
import { useCaseStudyMeasurement } from './useCaseStudyMeasurement';
import CaseStudyMeasuredMetricsPanel from '../../components/admin/caseStudy/CaseStudyMeasuredMetricsPanel';

/**
 * AdminCaseStudyDetailPage — the Story Studio, seven tabs over one record.
 *
 * TRUTH · SOURCES · STORY · VISUALS · SURFACES · PREVIEW · PUBLISH
 *
 * WHAT CHANGED HERE, AND THE DECISION IT REVERSES.
 *
 * This page used to open with: "The whole record is on one page rather than
 * behind tabs, because the decision this screen exists for is a single
 * judgement made across all of it... Splitting that into tabs would let a
 * reviewer approve a record having seen a third of it."
 *
 * That risk is real and the sentence was right. It is reversed because the
 * surface acquired a SECOND job — authoring — and a flat scroll of eighteen
 * panels is a bad authoring surface in a different way: the five steps
 * (storyline, sources, analyze, draft, edit) have an order, and one long page
 * presents them as though they do not.
 *
 * THE OLD INVARIANT IS PRESERVED BY A DIFFERENT MECHANISM, not abandoned.
 * `CaseStudyGateBand` renders the publish gate's named refusals ABOVE the tab
 * strip, on every tab. A reviewer on VISUALS sees exactly the refusals a
 * reviewer on PUBLISH sees. Approving without having read every panel is still
 * possible; approving without having seen what the gate refuses is not, and
 * that is the half the original comment was protecting.
 *
 * NOTHING HERE DECIDES ANYTHING. Every action posts to a service that owns the
 * rule and re-checks it; readiness is displayed and never gates; the publish
 * button is enabled regardless of score, and the gate's named refusals are
 * rendered in full. All write paths are idempotent server-side, so the retry
 * strategy for any of them is pressing the button again.
 *
 * THE PAGE HOLDS NO DATA STATE. `useCaseStudyDesk` owns the review desk's state
 * and writes; `useCaseStudyStudio` owns authoring's. The split is not only for
 * the 500-line ceiling: the studio hook does not import a single lifecycle
 * function, so no authoring action can publish, and that is checkable by
 * reading its import list.
 */

function AdminCaseStudyDetailPage(): React.ReactElement {
  const { id = '' } = useParams<{ id: string }>();
  const [tab, setTab] = useState<CaseStudyStudioTabKey>(DEFAULT_STUDIO_TAB);

  const desk = useCaseStudyDesk(id);
  const studio = useCaseStudyStudio(id, desk.load);
  // The THIRD source of metrics on this page, and deliberately distinct from
  // desk.metrics: those come from snapshot content, these from the
  // case_study_metrics table that resolveChart actually reads.
  const measurement = useCaseStudyMeasurement(id);
  /**
   * PREVIEW's OWN surface, and its own read.
   *
   * It is lazy on purpose — the second argument is `tab === 'preview'`, so
   * arriving on a record does not fire a second copy of the desk's preview GET,
   * and an admin who is not on the surface-lab allowlist never meets a 403 they
   * did not ask for. It is held HERE rather than inside the panel so leaving the
   * tab and coming back does not reset the surface the operator chose.
   *
   * It starts on `PUBLISH_SURFACE` because that is the one live surface, and it
   * is passed as a VALUE, never wired back: nothing in this lens can reach
   * `publishCaseStudy`. See `useCaseStudyPreviewLens`.
   */
  const previewLens = useCaseStudyPreviewLens(id, tab === 'preview', PUBLISH_SURFACE);

  /** Fetch only what the open tab needs. See the hook's header. */
  useEffect(() => {
    if (tab === 'truth') studio.ensureLoaded('storyline');
    if (tab === 'story') { studio.ensureLoaded('drafts'); studio.ensureLoaded('quotes'); }
    if (tab === 'visuals') studio.ensureLoaded('visuals');
  }, [tab, studio]);

  if (desk.loading) {
    return <div className="container-fluid py-4"><p className="text-muted">Loading this Case Study...</p></div>;
  }

  if (desk.loadError || !desk.detail) {
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
          {desk.loadError || 'This Case Study could not be found.'}
        </div>
        <Link className="btn btn-outline-secondary" to="/admin/case-studies">
          Back to all Case Studies
        </Link>
      </div>
    );
  }

  const detail = desk.detail;
  const record = detail.caseStudy;
  const busy = desk.busy || studio.busy;

  /** Repository references the draft generator can be pointed at. */
  const repoRefs = detail.repositories.map((repo) => ({
    owner: repo.repoOwner, repo: repo.repoName,
  }));

  /**
   * DE-DUPLICATED, and it is not cosmetic.
   *
   * `desk.metrics` is `heroMetrics` concatenated with `measurement.metrics`, and
   * a headline metric legitimately appears in both — the pilot record's
   * `verified_competencies` does. Un-deduplicated, the chart builder rendered
   * two checkboxes carrying the same `id` AND the same `data-testid`, so both
   * `<label htmlFor>` associations pointed at the first input and a click on the
   * second label toggled the wrong box. Observed on production 2026-08-26.
   *
   * This does NOT fix the deeper mismatch, which is recorded rather than
   * papered over: these keys are read from the SNAPSHOT, while `resolveChart`
   * resolves against the `case_study_metrics` table. On a record whose metrics
   * were authored straight into snapshot content, every offered key resolves to
   * nothing. Closing that needs a metric-listing endpoint the API does not have.
   */
  const metricKeys = Array.from(new Set(
    desk.metrics
      .map((metric) => metric.key)
      .filter((key): key is string => typeof key === 'string' && key.length > 0),
  ));

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

      {/*
        ABOVE THE TABS, DELIBERATELY. This is what makes tabs safe on this
        surface — see the file header. It must never move inside a tab.
      */}
      <CaseStudyGateBand
        blockers={desk.blockers}
        source={desk.blockerSource}
        unknown={desk.gateUnknown}
      />

      {/*
        ALSO ABOVE THE TABS, AND FOR THE SAME REASON. Every write on this page
        goes through one `act()` in `useCaseStudyDesk` and reports through one
        note and one error. Those two lines used to render inside
        `CaseStudyPublishPanel`, which reaches the screen on PUBLISH only — so a
        consent save on TRUTH, a repository attach on SOURCES and every override
        anywhere reported their outcome to a panel the operator could not see.
        Observed on production 2026-08-26: a consent save produced no visible
        response of any kind. See `CaseStudyActionBand`'s header.
      */}
      <CaseStudyActionBand note={desk.actionNote} error={desk.actionError} />

      <CaseStudyStudioTabStrip active={tab} onSelect={setTab} />

      <div id="cs-studio-panel" role="tabpanel" aria-labelledby={`cs-studio-tab-${tab}`}>
        {tab === 'truth' ? (
          <>
            <CaseStudyStorylinePanel
              storyline={studio.storyline}
              loading={studio.storylineLoading}
              error={studio.storylineError}
              busy={busy}
              onSave={studio.onSaveStoryline}
            />
            <CaseStudyConsentPanel record={record} busy={busy} onSave={desk.onSaveConsent} />
            <CaseStudyContributorsPanel
              contributors={desk.view.contributors} busy={busy} onApplyOverride={desk.override}
            />
            <CaseStudyProvenancePanel
              rows={readProvenance(
                (desk.provenanceId ? desk.provenanceSnapshot : detail.latestSnapshot)?.provenance ?? null,
              )}
              versions={desk.provenanceVersions}
              selectedSnapshotId={desk.provenanceId}
              onSelectVersion={(snapshotId) => { void desk.onSelectProvenanceVersion(snapshotId); }}
              loading={desk.provenanceLoading}
              error={desk.provenanceError}
            />
          </>
        ) : null}

        {tab === 'sources' ? (
          <>
            <CaseStudyRepositoriesPanel
              repositories={detail.repositories} busy={busy} syncing={desk.syncing}
              onAttach={desk.onAttachRepo}
              onSetRole={desk.onSetRepoRole}
              onRemove={desk.onRemoveRepo}
              onSync={() => { void desk.onSync(); }}
            />
            <CaseStudyAnalyzePanel
              proofs={studio.proofs}
              analyzing={studio.analyzing}
              error={studio.analyzeError}
              onAnalyze={studio.onAnalyze}
            />
            <CaseStudyEvidencePanel
              metrics={desk.metrics} busy={busy} onApplyOverride={desk.override}
            />
            <CaseStudySyncPanel
              lastSync={desk.lastSync} runs={desk.runs}
              runsLoading={desk.runsLoading} runsError={desk.runsError}
              onLoadRuns={() => { void desk.onLoadRuns(); }}
              draftSnapshot={detail.latestSnapshot}
              publishedSnapshot={desk.publishedSnapshot}
              canDiff={desk.publishedSnapshotId !== null}
              diffLoading={desk.diffLoading} diffError={desk.diffError}
              onDiff={() => { void desk.onDiff(); }}
            />
          </>
        ) : null}

        {tab === 'story' ? (
          <>
            <CaseStudyDraftPanel
              drafts={studio.drafts}
              refused={studio.draftRefusals}
              generatedBy={studio.draftGeneratedBy}
              generating={studio.generating}
              busy={busy}
              error={studio.draftError}
              canGenerate={repoRefs.length > 0}
              onGenerate={() => studio.onGenerateDraft(repoRefs)}
              onPromote={studio.onPromoteDraft}
              onReject={studio.onRejectDraft}
            />
            <CaseStudyNarrativePanel
              view={desk.view} busy={busy} hasSnapshot={detail.latestSnapshot !== null}
              onApplyOverride={desk.override}
            />
            <CaseStudyMetricsPanel
              metrics={desk.metrics} busy={busy} onApplyOverride={desk.override}
            />
            <CaseStudyMeasuredMetricsPanel
              metrics={measurement.metrics}
              definitionKeys={measurement.definitionKeys}
              busy={busy || measurement.busy}
              lastRun={measurement.lastRun}
              error={measurement.error}
              onRun={measurement.onRun}
              onPromote={measurement.onPromote}
            />
            <CaseStudyQuotesPanel
              quotes={studio.quotes}
              loading={studio.quotesLoading}
              busy={busy}
              error={studio.quotesError}
              suggestedSlots={[]}
              onCreate={studio.onCreateQuote}
              onSetApproval={studio.onSetQuoteApproval}
            />
          </>
        ) : null}

        {tab === 'visuals' ? (
          <>
            <CaseStudyVisualsPanel
              artifacts={studio.artifacts}
              charts={studio.charts}
              availableMetricKeys={metricKeys}
              loading={studio.visualsLoading}
              busy={busy}
              error={studio.visualsError}
              onSetArtifactStatus={studio.onSetArtifactStatus}
              onSaveChart={studio.onSaveChart}
              onSetChartApproval={studio.onSetChartApproval}
            />
            <CaseStudyArtifactsPanel
              artifacts={desk.view.artifacts} busy={busy} onApplyOverride={desk.override}
            />
          </>
        ) : null}

        {tab === 'surfaces' ? (
          <CaseStudySurfaceLab
            recordTitle={record.title}
            activeSurface={desk.lensSurface}
            onSelectSurface={desk.onSelectLens}
            detail={detail}
            preview={desk.preview}
            loading={desk.previewLoading}
            error={desk.previewError}
          />
        ) : null}

        {tab === 'preview' ? (
          <CaseStudyRenderedPreview
            lens={previewLens}
            /* `rawPanelOpen` is reused rather than replaced. It already means
               "the reviewer deliberately asked for the raw snapshot", which is
               what the payload toggle asks — and the raw column names private
               repositories by a disclosed exception, so it must stay opt-in
               rather than appear for anyone who merely opened the tab. */
            payloadOpen={desk.rawPanelOpen}
            onTogglePayload={desk.setRawPanelOpen}
          />
        ) : null}

        {tab === 'publish' ? (
          <>
            <CaseStudyReadinessPanel
              readiness={detail.readiness} busy={busy}
              onRecheck={() => { void desk.load(); }}
            />
            <CaseStudyPublishPanel
              record={record}
              latestSnapshot={detail.latestSnapshot}
              approvedSnapshot={detail.approvedSnapshot}
              publications={detail.publications}
              blockers={desk.blockers}
              blockerSource={desk.blockerSource}
              busy={busy}
              onApprove={desk.onApprove}
              onPublish={() => { void desk.onPublish(); }}
              onUnpublish={desk.onUnpublish}
              onArchive={() => desk.onArchive(record.title)}
            />
            <p className="small text-muted" data-testid="cs-publish-surface-note">
              Publishing targets the <code>{PUBLISH_SURFACE}</code> surface. Exploring a lens on the
              SURFACES tab never changes that.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}

export default AdminCaseStudyDetailPage;
