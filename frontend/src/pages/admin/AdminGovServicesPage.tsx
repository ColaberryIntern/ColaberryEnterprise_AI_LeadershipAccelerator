import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { PageHeader, SectionCard } from '../../components/admin/shell';
import type { ServiceOffering } from '../../services/factoryApi';
import type { EvidenceService } from '../../services/ourServicesApi';
import ServiceEvidencePanel from '../../components/admin/ServiceEvidencePanel';
import OurServicesKpiRow from '../../components/admin/ourServices/OurServicesKpiRow';
import DecideNowStrip, { type DecideTarget } from '../../components/admin/ourServices/DecideNowStrip';
import ServicesLifecycleDiagram from '../../components/admin/ourServices/ServicesLifecycleDiagram';
import ServiceEvidenceBarChart from '../../components/admin/ourServices/ServiceEvidenceBarChart';
import ServiceInvestQuadrant from '../../components/admin/ourServices/ServiceInvestQuadrant';
import EvidenceTierDonut from '../../components/admin/ourServices/EvidenceTierDonut';
import CatalogGrowthChart from '../../components/admin/ourServices/CatalogGrowthChart';
import ServiceFamilyChart from '../../components/admin/ourServices/ServiceFamilyChart';
import ServiceCatalogTable, { CatalogFilterTabs, type CatalogFilter } from '../../components/admin/ourServices/ServiceCatalogTable';
import ServiceIndustryHeatmap from '../../components/admin/ourServices/ServiceIndustryHeatmap';
import CaseStudyIntakeQueue, { IntakeLegend } from '../../components/admin/ourServices/CaseStudyIntakeQueue';
import OutsideCaseStudyImportModal from '../../components/admin/ourServices/OutsideCaseStudyImportModal';
import ProposalGapsPanel from '../../components/admin/ourServices/ProposalGapsPanel';
import { SourcePill } from '../../components/admin/ourServices/CaseStudyCard';
import ServiceFormModal,{ emptyForm, formFrom, inputFrom, type FormState } from '../../components/admin/ourServices/ServiceFormModal';
import { useOurServicesData } from '../../components/admin/ourServices/useOurServicesData';
import CaseStudyDrawer, { type DrawerSeed } from '../../components/admin/ourServices/CaseStudyDrawer';
import { CaseStudyOpenerContext } from '../../components/admin/ourServices/caseStudyOpener';
import GuidedTour from '../../components/admin/ourServices/GuidedTour';
import { OUR_SERVICES_TOUR } from '../../components/admin/ourServices/ourServicesTourSteps';
import { buildKpis, centralYear, nonRetired } from '../../components/admin/ourServices/ourServicesModel';
import AiServiceOpportunities from '../../components/admin/ourServices/serviceGap/AiServiceOpportunities';
import { useServiceGap } from '../../components/admin/ourServices/serviceGap/useServiceGap';
import type { IntakeGapProps } from '../../components/admin/ourServices/IntakeCard';
import type { IntakeSummaryItem } from '../../services/ourServicesApi';
import GovDossierPanel, { DOSSIER_ANCHOR, requestDossierOpen } from '../../components/admin/govDossier/GovDossierPanel';
import CaseStudyFinderSection from '../../components/admin/ourServices/caseStudyFinder/CaseStudyFinderSection';
import { useCaseStudyFinder } from '../../components/admin/ourServices/caseStudyFinder/useCaseStudyFinder';
import OurServicesSectionNav, { OUR_SERVICES_SCROLL_MARGIN, type SectionNavItem } from '../../components/admin/ourServices/OurServicesSectionNav';

/** The public page contracting officers see; it reads this catalog live (active services with confirmed proof). */
export const PUBLIC_GOV_PAGE = '/government/';

/**
 * AdminGovServicesPage - "Our Services", the evidence-backed catalog (Services Upgrade SV3). A thin composer: the
 * data and every write live in `useOurServicesData`, each section is its own component under
 * components/admin/ourServices/. Section order follows the design mockup: KPIs, Decide now, How it grows,
 * evidence charts, catalog, industry heatmap, Intake, proposal gaps.
 *
 * Every number comes from GET /api/admin/factory/services/evidence-summary; nothing here is sample data. A service
 * is RETIRED, never deleted. Tenant-scoped on the server.
 */
type Editing = ServiceOffering | 'new' | null;

const SECTION_IDS: Record<DecideTarget, string> = { intake: 'intake', gaps: 'gaps', quad: 'quad', catalog: 'catalog' };

/** Every jump target keeps its heading clear of the sticky section bar. */
const ANCHOR: React.CSSProperties = { scrollMarginTop: OUR_SERVICES_SCROLL_MARGIN };

const toOffering = (s: EvidenceService, offerings: ServiceOffering[]): ServiceOffering =>
  offerings.find((o) => o.id === s.id) ?? { id: s.id, name: s.name, category: s.category, keywords: s.keywords, naicsCodes: s.naicsCodes, status: s.status };

export default function AdminGovServicesPage(): React.ReactElement {
  const data = useOurServicesData();
  const { summary, offerings } = data;
  // AI Service Gap Detector (GD2): recommendations only; reloads whenever the summary does.
  const gap = useServiceGap(summary?.generatedAt ?? null, data.reload);
  // Case Study Finder (CF2): its own fetch and polling; proposals only, Build creates a private draft + ticket.
  const finder = useCaseStudyFinder();
  const finderCount = finder.state?.result?.proposals.length ?? 0;
  const location = useLocation();
  const navigate = useNavigate();
  const [filter, setFilter] = useState<CatalogFilter>('active');
  const [editing, setEditing] = useState<Editing>(null);
  const [saving, setSaving] = useState(false);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [evidenceFor, setEvidenceFor] = useState<EvidenceService | null>(null);
  const [importOpen, setImportOpen] = useState(false);
  const [tourOpen, setTourOpen] = useState(false);
  const [reading, setReading] = useState<DrawerSeed | null>(null);
  const jumped = useRef(false);
  // "Now" is the summary's own generation time, so deadlines and "this year" agree with the numbers on screen.
  const now = useMemo(() => {
    const t = summary ? new Date(summary.generatedAt) : new Date();
    return Number.isFinite(t.getTime()) ? t : new Date();
  }, [summary]);

  const jump = useCallback((target: DecideTarget) => {
    const el = document.getElementById(SECTION_IDS[target]);
    if (!el) return;
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'start' });
    el.focus({ preventScroll: true });
  }, []);

  // A link into this page with #intake (from the Gov Fit step) lands on the queue once it has loaded.
  useEffect(() => {
    if (jumped.current || !summary) return;
    const hash = location.hash.replace('#', '') as DecideTarget;
    if (hash in SECTION_IDS) { jumped.current = true; jump(hash); }
  }, [summary, location.hash, jump]);

  const live = useMemo(() => (summary ? nonRetired(summary.services) : []), [summary]);
  const descriptions = useMemo(() => Object.fromEntries(offerings.map((o) => [o.id, o.description])), [offerings]);
  const growthIds = useMemo(() => new Set(live.filter((s) => s.status === 'growth').map((s) => s.id)), [live]);

  const handleSave = useCallback(async (f: FormState) => {
    if (!editing) return;
    setSaving(true);
    const ok = await data.saveService(editing, inputFrom(f));
    setSaving(false);
    if (ok) setEditing(null);
  }, [editing, data]);

  const withBusy = (id: string, fn: () => Promise<void>) => async () => { setBusyId(id); await fn(); setBusyId(null); };

  const blocked = summary?.decideNow.blockedCaseStudies.count ?? 0;
  const gapCount = summary?.decideNow.openFitGaps.count ?? 0;

  // The sticky bar: only sections that are on the page right now (no summary -> only the dossier).
  const navItems = useMemo((): SectionNavItem[] => {
    const dossier: SectionNavItem = { id: DOSSIER_ANCHOR, label: 'Gov dossier', icon: 'government-line', onSelect: requestDossierOpen };
    if (!summary) return [dossier];
    return [
      { id: 'overview', label: 'Overview', icon: 'dashboard-line' },
      { id: 'evidence', label: 'Evidence', icon: 'bar-chart-horizontal-line' },
      { id: 'catalog', label: 'Catalog', icon: 'folder-open-line', badge: { text: String(live.length), tone: 'secondary' } },
      { id: 'industries', label: 'Industries', icon: 'grid-line' },
      { id: 'case-study-finder', label: 'Case study finder', icon: 'search-eye-line', badge: finderCount ? { text: String(finderCount), tone: 'success' } : undefined },
      { id: 'ai-opportunities', label: 'AI opportunities', icon: 'sparkling-2-line' },
      { id: 'intake', label: 'Intake', icon: 'inbox-archive-line', badge: blocked ? { text: `${blocked} blocked`, tone: 'danger' } : undefined },
      { id: 'gaps', label: 'Proposal gaps', icon: 'focus-2-line', badge: gapCount ? { text: String(gapCount), tone: 'secondary' } : undefined },
      dossier,
    ];
  }, [summary, live.length, blocked, gapCount, finderCount]);

  // Every case study the page shows (Intake and each service's linked list), so a title click can open the side
  // panel at once with the right title and Inside/Outside kind while the full record loads.
  const seeds = useMemo(() => {
    const m = new Map<string, DrawerSeed>();
    if (!summary) return m;
    for (const it of summary.intake) m.set(it.id, { id: it.id, title: it.title, sourceKind: it.sourceKind });
    for (const s of summary.services) for (const c of s.caseStudies) m.set(c.id, { id: c.id, title: c.title, sourceKind: c.sourceKind });
    return m;
  }, [summary]);
  const titles = useMemo(() => Object.fromEntries((summary?.intake ?? []).map((i) => [i.id, i.title])), [summary]);
  const jumpToCase = useCallback((id: string) => {
    const el = document.getElementById(`intake-card-${id}`);
    if (!el) return;
    if (typeof el.scrollIntoView === 'function') el.scrollIntoView({ behavior: 'smooth', block: 'center' });
    el.focus({ preventScroll: true });
  }, []);
  // Case study id -> how many case studies share its proposed new-service family (GD3: one alone never mints a service).
  const familySizes = useMemo(() => {
    const m = new Map<string, number>();
    for (const c of gap.data?.clusters ?? []) if (c.kind === 'new_service') for (const id of c.caseStudyIds) m.set(id, c.caseStudyIds.length);
    return m;
  }, [gap.data]);
  const gapFor = useCallback((item: IntakeSummaryItem): IntakeGapProps => {
    const a = gap.data?.byCaseStudy[item.id];
    return {
      analysis: a, available: !!gap.data, busy: gap.busy.has(item.id), pinnedServiceId: gap.pinned[item.id], familySize: familySizes.get(item.id),
      serviceCurrent: (id) => { const o = offerings.find((x) => x.id === id); return o ? { description: o.description ?? null, keywords: o.keywords ?? [], naicsCodes: o.naicsCodes ?? [] } : null; },
      onAnalyze: (force) => void gap.analyze(item.id, force),
      onAdoptExisting: () => { if (a) void gap.adoptExisting(item, a); },
      onApplyExpansion: (cur) => { if (a) void gap.applyExpansion(a, cur); },
      onAddNaics: (cur) => { if (a) void gap.addNaics(a, cur); },
      onDismiss: (note) => { if (a) void gap.review(a, 'dismissed', note); },
    };
  }, [gap, offerings, familySizes]);
  const openCaseStudy = useCallback((id: string) => {
    setReading(seeds.get(id) ?? { id, title: 'Case study', sourceKind: 'inside' });
  }, [seeds]);

  return (
    <CaseStudyOpenerContext.Provider value={openCaseStudy}>
    <div>
      <div data-tour="header">
      <PageHeader
        title="Our Services"
        subtitle="Every service is backed by real work. Case studies are the evidence the Gov matcher uses."
        icon="heart-3-line"
        actions={
          <div className="d-flex gap-2 flex-wrap">
            {/* Our Services left the sidebar on 2026-11-17 (reached from the Gov Opportunities page), so it needs its
                own way back. First action, so it reads as the return path. */}
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => navigate('/admin/gov-opportunities')} data-testid="back-to-gov-opps">
              <i className="ri-arrow-left-line me-1" aria-hidden="true" />Gov Opportunities
            </button>
            <a className="btn btn-outline-success btn-sm" href={PUBLIC_GOV_PAGE} target="_blank" rel="noopener noreferrer" data-testid="public-gov-link"
              title="The public Government page, where Active services with a confirmed case study show up for contracting officers">
              <i className="ri-government-line me-1" aria-hidden="true" />View public Government page<i className="ri-external-link-line ms-1" aria-hidden="true" /><span className="visually-hidden"> (opens in a new tab)</span>
            </a>
            <button type="button" className="btn btn-outline-primary btn-sm" onClick={() => setTourOpen(true)} disabled={!summary} data-testid="start-tour">
              <i className="ri-compass-3-line me-1" aria-hidden="true" />How this page works
            </button>
            <button type="button" className="btn btn-outline-secondary btn-sm" onClick={() => setImportOpen(true)}><i className="ri-inbox-archive-line me-1" aria-hidden="true" />Add outside case study</button>
            <button type="button" className="btn btn-primary btn-sm" onClick={() => setEditing('new')}><i className="ri-add-line me-1" aria-hidden="true" />Add service</button>
          </div>
        }
      >
        <p className="small text-secondary mb-0">
          Case studies come from projects we built (<SourcePill kind="inside" />) or from the Drive library (<SourcePill kind="outside" label="Outside" />).
        </p>
      </PageHeader>
      </div>

      <OurServicesSectionNav items={navItems} />

      {data.error && (
        <div className="alert alert-danger d-flex justify-content-between align-items-center gap-2" role="alert">
          <span>{data.error}</span>
          <span className="d-flex gap-2">
            <button type="button" className="btn btn-outline-danger btn-sm" onClick={() => { data.dismissError(); void data.reload(); }}>Retry</button>
            <button type="button" className="btn-close" aria-label="Dismiss error" onClick={data.dismissError} />
          </span>
        </div>
      )}
      {data.notice && (
        <div className="alert alert-success d-flex justify-content-between align-items-center" role="status">
          <span>{data.notice}</span>
          <button type="button" className="btn-close" aria-label="Dismiss message" onClick={data.dismissNotice} />
        </div>
      )}

      {data.loading ? (
        <p className="text-secondary" role="status">Loading Our Services…</p>
      ) : !summary ? (
        <p className="text-secondary">The evidence summary is not available, so no evidence numbers are shown. Retry above.</p>
      ) : (
        <>
          <div id="overview" tabIndex={-1} style={ANCHOR} data-tour="kpis"><OurServicesKpiRow kpis={buildKpis(summary)} /></div>
          <div data-tour="decide"><DecideNowStrip summary={summary} now={now} onJump={jump} /></div>
          <div data-tour="lifecycle"><ServicesLifecycleDiagram /></div>

          <div id="evidence" tabIndex={-1} style={ANCHOR} className="row g-3 mb-4" data-tour="charts">
            <div className="col-12 col-xl-7">
              <SectionCard className="h-100 mb-0" title="Evidence by service" icon="bar-chart-horizontal-line"
                subtitle="Confirmed case studies linked to each service, split by source. Sorted weakest first so the gaps sit at the top.">
                <ServiceEvidenceBarChart services={live} />
              </SectionCard>
            </div>
            <div className="col-12 col-xl-5" id="quad" tabIndex={-1} style={ANCHOR}>
              <SectionCard className="h-100 mb-0" title="Where to invest next" icon="focus-3-line"
                subtitle="Evidence strength vs. open Gov opportunities that match. Bubble size is the number of case studies.">
                <ServiceInvestQuadrant services={live} feed={summary.opportunityFeed} />
              </SectionCard>
            </div>
          </div>

          <div className="row g-3 mb-4">
            <div className="col-12 col-lg-4">
              <SectionCard className="h-100 mb-0" title="Evidence health" icon="donut-chart-line" subtitle="Services grouped by evidence tier.">
                <EvidenceTierDonut services={live} />
              </SectionCard>
            </div>
            <div className="col-12 col-lg-4">
              <SectionCard className="h-100 mb-0" title="Catalog growth" icon="line-chart-line" subtitle="Services and linked case studies by quarter.">
                <CatalogGrowthChart series={summary.growthSeries} />
              </SectionCard>
            </div>
            <div className="col-12 col-lg-4">
              <SectionCard className="h-100 mb-0" title="Proof by service family" icon="pie-chart-line" subtitle="Linked case studies per family. A short wedge is a thin part of the catalog.">
                <ServiceFamilyChart services={live} />
              </SectionCard>
            </div>
          </div>

          <div id="catalog" tabIndex={-1} style={ANCHOR} className="mb-4" data-tour="catalog">
            <SectionCard className="mb-0" title="Service catalog" icon="folder-open-line"
              subtitle="Open a row to see its case studies. Colors show evidence strength and freshness, so weak spots stand out."
              actions={<CatalogFilterTabs filter={filter} onFilter={setFilter} />}>
              <ServiceCatalogTable
                services={summary.services} descriptions={descriptions} currentYear={centralYear(now)} filter={filter} onFilter={setFilter} busyId={busyId}
                onEvidence={setEvidenceFor}
                onEdit={(s) => setEditing(toOffering(s, offerings))}
                onRetire={(s) => void withBusy(s.id, () => data.retire(s.id))()}
                onPromote={(s) => void withBusy(s.id, () => data.promote(s.id, s.name))()}
                onAddService={() => setEditing('new')}
              />
            </SectionCard>
          </div>

          <div id="industries" tabIndex={-1} style={ANCHOR} data-tour="heatmap">
          <SectionCard className="mb-4" title="Service × industry coverage" icon="grid-line"
            subtitle="Confirmed case studies per cell. Darker means more proof; an empty circle means no case study in that industry yet.">
            <ServiceIndustryHeatmap services={live} matrix={summary.industryMatrix} />
          </SectionCard>
          </div>

          <div id="case-study-finder" tabIndex={-1} style={ANCHOR} className="mb-4">
            <SectionCard className="mb-0" icon="search-eye-line" title="Case Study Finder"
              subtitle="Which case study to build next: our proof gaps matched to real business processes in this repo and the connected repos, with what each one would do to our evidence score. Proposals only: Build creates a private draft and a Basecamp ticket, never a publication.">
              <CaseStudyFinderSection finder={finder} />
            </SectionCard>
          </div>

          <div id="ai-opportunities" tabIndex={-1} style={ANCHOR} className="mb-4">
            <SectionCard className="mb-0" icon="sparkling-2-line" title="AI Service Opportunities"
              subtitle="Which unlinked case studies fit a service we already offer, should widen one, or point to a new service. Recommendations only: nothing changes until you act on a card.">
              {gap.notice && (
                <div className="alert alert-success py-1 px-2 small d-flex justify-content-between align-items-center" role="status">
                  <span>{gap.notice}</span><button type="button" className="btn-close" aria-label="Dismiss message" onClick={gap.dismissNotice} />
                </div>
              )}
              <AiServiceOpportunities gap={gap} titles={titles} onJumpToCase={jumpToCase} />
            </SectionCard>
          </div>

          <div id="intake" tabIndex={-1} style={ANCHOR} className="mb-4" data-tour="intake">
            <SectionCard className="mb-0"
              icon="inbox-archive-line"
              title={<>Case study intake <span className={`badge rounded-pill ms-1 ${blocked ? 'bg-danger-subtle text-danger-emphasis' : 'bg-success-subtle text-success-emphasis'}`}>{blocked ? `${blocked} blocked` : 'all linked'}</span></>}
              subtitle="New case studies wait here until they are linked. Strong matches start selected; pick one or more services, or propose a new one."
              actions={<IntakeLegend />}>
              <CaseStudyIntakeQueue intake={summary.intake} growthServiceIds={growthIds} onLink={data.link} onPropose={data.propose} gapFor={gapFor} />
            </SectionCard>
          </div>

          <div id="gaps" tabIndex={-1} style={ANCHOR} className="mb-4" data-tour="gaps">
            <SectionCard className="mb-0" title="Gaps from live proposals" icon="government-line"
              subtitle={'Capabilities that "Can we deliver it?" flagged as Partly or New. Before treating one as a true gap, check whether we have unlinked proof.'}>
              <ProposalGapsPanel openFitGaps={summary.decideNow.openFitGaps} services={summary.services} intake={summary.intake} now={now} onReviewIntake={() => jump('intake')} />
            </SectionCard>
          </div>
        </>
      )}

      {/* Gov Company Dossier: the proposal agent's approved company facts, references and people. Its own fetch, so it
          shows even when the evidence summary is down. Formerly the separate Gov Dossier tab. */}
      <GovDossierPanel embedded />

      {editing && (
        <ServiceFormModal
          title={editing === 'new' ? 'Add a service' : 'Edit service'}
          initial={editing === 'new' ? emptyForm : formFrom(editing)}
          saving={saving}
          onCancel={() => setEditing(null)}
          onSave={handleSave}
        />
      )}

      {evidenceFor && (
        <ServiceEvidencePanel
          serviceId={evidenceFor.id}
          serviceName={evidenceFor.name}
          onClose={() => { setEvidenceFor(null); void data.reload(); }}
        />
      )}

      {importOpen && (
        <OutsideCaseStudyImportModal onClose={(imported) => {
          setImportOpen(false);
          if (imported) void data.reload().then(() => jump('intake'));
        }} />
      )}

      {reading && <CaseStudyDrawer seed={reading} onClose={() => setReading(null)} />}
      {tourOpen && <GuidedTour steps={OUR_SERVICES_TOUR} onClose={() => setTourOpen(false)} />}
    </div>
    </CaseStudyOpenerContext.Provider>
  );
}
