import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation } from 'react-router-dom';
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

const toOffering = (s: EvidenceService, offerings: ServiceOffering[]): ServiceOffering =>
  offerings.find((o) => o.id === s.id) ?? { id: s.id, name: s.name, category: s.category, keywords: s.keywords, naicsCodes: s.naicsCodes, status: s.status };

export default function AdminGovServicesPage(): React.ReactElement {
  const data = useOurServicesData();
  const { summary, offerings } = data;
  const location = useLocation();
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

  // Every case study the page shows (Intake and each service's linked list), so a title click can open the side
  // panel at once with the right title and Inside/Outside kind while the full record loads.
  const seeds = useMemo(() => {
    const m = new Map<string, DrawerSeed>();
    if (!summary) return m;
    for (const it of summary.intake) m.set(it.id, { id: it.id, title: it.title, sourceKind: it.sourceKind });
    for (const s of summary.services) for (const c of s.caseStudies) m.set(c.id, { id: c.id, title: c.title, sourceKind: c.sourceKind });
    return m;
  }, [summary]);
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
          <div className="d-flex gap-2">
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
          <div data-tour="kpis"><OurServicesKpiRow kpis={buildKpis(summary)} /></div>
          <div data-tour="decide"><DecideNowStrip summary={summary} now={now} onJump={jump} /></div>
          <div data-tour="lifecycle"><ServicesLifecycleDiagram /></div>

          <div className="row g-3 mb-4" data-tour="charts">
            <div className="col-12 col-xl-7">
              <SectionCard className="h-100 mb-0" title="Evidence by service" icon="bar-chart-horizontal-line"
                subtitle="Confirmed case studies linked to each service, split by source. Sorted weakest first so the gaps sit at the top.">
                <ServiceEvidenceBarChart services={live} />
              </SectionCard>
            </div>
            <div className="col-12 col-xl-5" id="quad" tabIndex={-1}>
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

          <div id="catalog" tabIndex={-1} className="mb-4" data-tour="catalog">
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

          <div data-tour="heatmap">
          <SectionCard className="mb-4" title="Service × industry coverage" icon="grid-line"
            subtitle="Confirmed case studies per cell. Darker means more proof; an empty circle means no case study in that industry yet.">
            <ServiceIndustryHeatmap services={live} matrix={summary.industryMatrix} />
          </SectionCard>
          </div>

          <div id="intake" tabIndex={-1} className="mb-4" data-tour="intake">
            <SectionCard className="mb-0"
              icon="inbox-archive-line"
              title={<>Case study intake <span className={`badge rounded-pill ms-1 ${blocked ? 'bg-danger-subtle text-danger-emphasis' : 'bg-success-subtle text-success-emphasis'}`}>{blocked ? `${blocked} blocked` : 'all linked'}</span></>}
              subtitle="New case studies wait here until they are linked. Strong matches start selected; pick one or more services, or propose a new one."
              actions={<IntakeLegend />}>
              <CaseStudyIntakeQueue intake={summary.intake} growthServiceIds={growthIds} onLink={data.link} onPropose={data.propose} />
            </SectionCard>
          </div>

          <div id="gaps" tabIndex={-1} className="mb-4" data-tour="gaps">
            <SectionCard className="mb-0" title="Gaps from live proposals" icon="government-line"
              subtitle={'Capabilities that "Can we deliver it?" flagged as Partly or New. Before treating one as a true gap, check whether we have unlinked proof.'}>
              <ProposalGapsPanel openFitGaps={summary.decideNow.openFitGaps} services={summary.services} intake={summary.intake} now={now} onReviewIntake={() => jump('intake')} />
            </SectionCard>
          </div>
        </>
      )}

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
