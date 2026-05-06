import React, { useEffect, useState, useCallback } from 'react';
import { initTracker } from '../utils/tracker';
import { captureUTMFromURL, getAdvisoryUrl } from '../services/utmService';
import { captureCampaignFromURL } from '../services/campaignAttributionService';
import SEOHead from '../components/SEOHead';
import InlineDemoPlayer from '../components/InlineDemoPlayer';
import StrategyCallModal from '../components/StrategyCallModal';
import { UTILITY_SCENARIOS } from '../config/utilityScenarios';

const HERO_BG = 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1920&q=80';

const SCENARIO_EMOJIS: Record<string, string> = {
  'outage-prediction': '⚡',
  'storm-response': '\u{1F329}️',
  'smart-metering': '\u{1F4CA}',
  'vegetation-mgmt': '\u{1F333}',
  'rate-case': '\u{1F4C4}',
  'member-services': '\u{1F4DE}',
  'fleet-dispatch': '\u{1F69A}',
  'regulatory-compliance': '\u{1F6E1}️',
};

// Override scenario labels for IOU context (Co-Op page calls customer-facing AI "Member Services").
// IOUs serve "customers" or "ratepayers", not members.
const IOU_SCENARIO_LABELS: Record<string, { title?: string; description?: string; kpi?: string }> = {
  'member-services': {
    title: 'Customer Services AI',
    description: '24/7 billing inquiries, outage status, service requests, and new connection applications across millions of accounts. No hold times.',
    kpi: '45% reduction in call center volume',
  },
  'storm-response': {
    description: 'Auto-notify customers, triage inbound calls, and coordinate restoration crews across multiple service territories during severe weather events.',
  },
  'smart-metering': {
    description: 'Detect anomalies across millions of AMI meters in real-time. Theft detection, malfunction alerts, and demand forecasting at IOU scale.',
    kpi: 'Tens of millions in annual revenue recovery',
  },
  'rate-case': {
    title: 'Rate Case Automation',
    description: 'Generate cost-of-service studies, rate design analysis, and PUC/FERC filings from operational and financial data. 18-month rate case prep compressed to weeks.',
    kpi: '80% faster filing preparation',
  },
  'regulatory-compliance': {
    description: 'Auto-generate NERC, FERC, SOX, and state PUC compliance reports from operational data. Continuous monitoring with full audit trail.',
  },
};

// Role-based hero content for personalized email campaigns to IOU executives
const ROLE_HEROES: Record<string, { badge: string; headline: string; subhead: string; bullets: string[] }> = {
  ceo: {
    badge: 'For IOU CEOs and Chief Operating Officers',
    headline: 'Wall Street Is Asking About Your AI Strategy. So Is the PUC.',
    subhead: 'See exactly what AI does for an investor-owned utility your size, with numbers your board, shareholders, and regulators can act on:',
    bullets: [
      '$25M+ annual savings on a $250M field operations budget',
      'Production AI in 12 weeks, not the typical 18-month enterprise rollout',
      'Rate-case-favorable capex positioning with full ROI methodology',
    ],
  },
  cio: {
    badge: 'For IOU CIOs and VPs of IT/OT',
    headline: 'Oracle CIS, SAP, Maximo, OSI Monarch, GE Smallworld. Now AI on top.',
    subhead: 'An AI orchestration layer that works with your existing IT/OT stack across millions of customers and tens of thousands of assets:',
    bullets: [
      'Connects to Oracle CIS, SAP, Maximo, OMS, AMI head-ends, and your data lake',
      'No data migration required. AI agents read from the systems you already operate.',
      'NERC CIP, SOC 2, and SOX-aligned audit trails. Full explainability of every AI decision.',
    ],
  },
  cfo: {
    badge: 'For IOU CFOs and Treasurers',
    headline: 'Can You Defend the AI Investment in Your Next Rate Case?',
    subhead: 'Every number traces to a verifiable benchmark. Auditor-ready math before you commit:',
    bullets: [
      '6-month payback on a $250M field ops budget',
      'Conservative estimates: 8-12% efficiency gain, not inflated projections',
      'Rate-case-defendable methodology — every dollar of capex with documented prudency',
    ],
  },
  ops: {
    badge: 'For VPs of Operations and Distribution',
    headline: 'Capture 8-12% Field Operations Efficiency Across Your Service Territory',
    subhead: 'You are sitting on $50M to $500M in controllable field ops spend. Here is how AI bends the curve:',
    bullets: [
      'Reduce unnecessary truck rolls across thousands of crews',
      'Risk-based vegetation management instead of fixed cycle trimming',
      'Daily prioritized work plans optimized across your entire territory',
    ],
  },
};

interface UtilityIOULandingPageProps {
  // When true, presenter mode is forced ON regardless of URL params.
  // Used by the /iou-demo route so prospects do not need to know the ?presenter param.
  forcePresenter?: boolean;
  // When set, used as the role if no ?role= URL param is present.
  // Used by the /iou-demo route to default to a CEO-level executive frame.
  defaultRole?: string;
}

function UtilityIOULandingPage({ forcePresenter, defaultRole }: UtilityIOULandingPageProps = {}) {
  const [showBooking, setShowBooking] = useState(false);
  const [demoKey, setDemoKey] = useState(0);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [completedScenarios, setCompletedScenarios] = useState<Set<string>>(new Set());
  const [showPicker, setShowPicker] = useState(false);
  const advisoryUrl = getAdvisoryUrl();

  // Detect role from URL param. Falls back to defaultRole prop, then to ops.
  const urlRole = new URLSearchParams(window.location.search).get('role') || '';
  const role = urlRole || defaultRole || '';
  const heroContent = role && ROLE_HEROES[role] ? ROLE_HEROES[role] : ROLE_HEROES.ops;

  const ROLE_DEFAULT_DEMOS: Record<string, string[]> = {
    ceo: ['utility-outage', 'utility-storm'],
    cio: ['utility-metering', 'utility-compliance'],
    ops: ['utility-fleet', 'utility-vegetation'],
    cfo: ['utility-ratecase', 'utility-fleet'],
  };
  const roleDefaultDemos = role && ROLE_DEFAULT_DEMOS[role] ? ROLE_DEFAULT_DEMOS[role] : UTILITY_SCENARIOS.map(s => s.demoId);

  useEffect(() => {
    initTracker();
    captureUTMFromURL();
    captureCampaignFromURL();
    try { (window as any).trackBookingEvent?.('role_variant_view', { role, segment: 'iou' }); } catch {}
  }, []);

  const openBooking = () => setShowBooking(true);

  const activeScenario = UTILITY_SCENARIOS.find(s => s.demoId === selectedScenario);
  const activeOverride = activeScenario ? IOU_SCENARIO_LABELS[activeScenario.id] : undefined;
  const activeTitle = activeOverride?.title || activeScenario?.title;
  const activeDescription = activeOverride?.description || activeScenario?.description;

  const onDemoComplete = useCallback((scenarioId: string) => {
    setCompletedScenarios(prev => new Set(prev).add(scenarioId));
    setShowPicker(true);
  }, []);

  const playScenario = (scenarioId: string) => {
    setSelectedScenario(scenarioId);
    setShowPicker(false);
    setDemoKey(prev => prev + 1);
    setTimeout(() => {
      document.getElementById('demo')?.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
  };

  const painPointsByRole: Record<string, { icon: string; title: string; problem: string; solution: string }[]> = {
    ops: [
      { icon: 'bi-people', title: 'Crew Capacity Gap', problem: 'You can not hire fast enough to keep up with capex programs and growth. Existing crews waste time on low-value dispatches.', solution: 'AI prioritizes the highest-impact jobs each day across thousands of crews. Same headcount, 8-12% more line restored, inspected, or rebuilt per week.' },
      { icon: 'bi-truck', title: 'Wasted Truck Rolls at Scale', problem: 'Crews dispatched with incomplete data. Multiple visits to the same circuit. Inefficient routing across a multi-state footprint.', solution: 'A 5-10% reduction in unnecessary truck rolls on a $250M field ops budget is $12.5M to $25M per year. Real money in any rate case.' },
      { icon: 'bi-tree', title: 'Cycle-Based Vegetation Programs', problem: 'You trim every 4 to 6 years regardless of risk. High-risk corridors grow unchecked while low-risk areas consume budget.', solution: 'AI targets vegetation work where outage risk and tree-grow rate justify it. 10-20% reduction in vegetation spend, or same spend with measurable SAIDI improvement.' },
      { icon: 'bi-clipboard-data', title: 'Manual Daily Work Planning', problem: 'Field supervisors spend hours each morning assigning work, often without complete OMS, AMI, and weather context.', solution: 'AI generates a prioritized daily work list per crew: which feeders to inspect, where to trim, which transformers to monitor. Supervisors review and dispatch.' },
    ],
    ceo: [
      { icon: 'bi-graph-up-arrow', title: 'Wall Street Wants the AI Story', problem: 'Analysts are asking on every earnings call. So are activist investors. "We are evaluating use cases" is no longer a defensible answer.', solution: 'A concrete production AI deployment with quantified savings becomes a quarterly earnings narrative — and a competitive moat against utilities still in pilot.' },
      { icon: 'bi-bank', title: 'PUC Scrutiny on Capex', problem: 'Your last rate case was contested. Intervenors will challenge every dollar of capex. You need prudent investment narratives, not vendor pitches.', solution: 'AI investments positioned as operational efficiency that reduces revenue requirement. Every dollar of capex has a documented prudency case.' },
      { icon: 'bi-shield-check', title: 'AI Project Failure Risk', problem: 'Most enterprise AI projects fail. The board has heard about peers spending $50M+ on AI initiatives that produced nothing operational.', solution: 'Pre-built utility data structures eliminate discovery. Production system in weeks, not years. Clear go/no-go gates with measurable outcomes at each phase.' },
      { icon: 'bi-people', title: 'Workforce Transition', problem: 'Union concerns, IBEW conversations, and operator resistance can stall any technology rollout. AI accelerates that fear.', solution: 'AI handles the routine 95%. Your dispatchers, operators, and field supervisors move from data entry to judgment work. Same workforce, higher leverage. Documented in the labor narrative.' },
    ],
    cio: [
      { icon: 'bi-database', title: 'IT/OT Convergence Reality', problem: 'Your data lives across Oracle CIS, SAP, Maximo, OSI Monarch OMS, GE Smallworld GIS, AMI head-ends, and a Snowflake data lake. Getting it harmonized for AI is months of work.', solution: 'We connect to your existing systems via standard interfaces. AI agents read from your infrastructure. No new data warehouse, no migration project.' },
      { icon: 'bi-shield-lock', title: 'NERC CIP and SOX Compliance', problem: 'Anything touching the BES is NERC CIP scoped. Anything touching financial reporting is SOX scoped. Both require documented controls and audit trails.', solution: 'Every AI decision is logged, explainable, and replayable. Built for SOC 2 Type II, NERC CIP, and SOX evidence. Auditor-ready from day one.' },
      { icon: 'bi-puzzle', title: 'Yet Another System', problem: 'You have spent years rationalizing your IT footprint. The last thing you need is another platform requiring its own integration, support contract, and admin team.', solution: 'AI orchestration is an overlay, not a replacement. It sits on top of your existing stack and makes it smarter. Sunset path documented if it fails to deliver.' },
      { icon: 'bi-code-square', title: 'No In-House AI Team', problem: 'You have IT generalists and platform engineers. You do not have a team of ML engineers, MLOps specialists, or LLM tuners — and hiring them is brutal.', solution: 'Pre-built AI agents tuned for utility operations. Your IT team manages the orchestration platform; we maintain the underlying models with quarterly tuning.' },
    ],
    cfo: [
      { icon: 'bi-calculator', title: 'Rate Case Defendability', problem: 'Every dollar of AI capex will be challenged in your next rate case. "AI is the future" loses in front of intervenors and PUC staff.', solution: 'Fully transparent ROI methodology with documented benchmarks per FERC accounts. Every input traceable. Built to be defended in testimony.' },
      { icon: 'bi-piggy-bank', title: '$50M to $500M Controllable Spend', problem: 'Vegetation management ($30-150M), truck rolls ($50-250M), and crew labor are your largest controllable O&M lines. Visibly inefficient at scale.', solution: 'Even a conservative 8-10% efficiency gain on a $250M field ops budget is $20M to $25M per year. That moves SAIDI, ROE, and earned return.' },
      { icon: 'bi-clock-history', title: 'Long Payback Periods', problem: 'Most enterprise software has 3-5 year paybacks. That does not survive your CFO peer benchmarks or treasury hurdle rates.', solution: '6-month operational payback. Capex amortized over 7 years. Cash flow positive year one. Documented for your treasury team.' },
      { icon: 'bi-file-earmark-bar-graph', title: 'IRA / DOE Funding Alignment', problem: 'You have grid resilience and decarbonization commitments funded through IRA and DOE programs. Most operational software does not qualify.', solution: 'AI investments positioned for grid resilience tax credits, IRA Section 45 grid program funding, and DOE GRIP/GRP grants. Spend grant money first.' },
    ],
  };
  const painPoints = (role && painPointsByRole[role]) ? painPointsByRole[role] : painPointsByRole.ops;

  return (
    <>
      <SEOHead
        title="AI for Investor-Owned Utilities | Colaberry Enterprise AI"
        description="Production AI for investor-owned utilities. Field operations efficiency, rate-case-defendable ROI, and PUC-ready compliance. Built for Duke, Oncor, Exelon, and peers."
      />

      {/* Navbar */}
      <nav className="navbar navbar-light bg-white sticky-top shadow-sm" style={{ zIndex: 1030 }}>
        <div className="container d-flex justify-content-between align-items-center">
          <span className="navbar-brand d-flex align-items-center gap-2 mb-0">
            <img src="/colaberry-icon.png" alt="" width="30" height="30" />
            <span className="fw-bold" style={{ color: 'var(--color-primary)', fontSize: 16 }}>Colaberry Enterprise AI</span>
          </span>
          <button className="btn btn-primary btn-sm fw-semibold" onClick={openBooking}>
            <i className="bi bi-calendar-check me-1" />Book a Strategy Call
          </button>
        </div>
      </nav>

      {/* Hero */}
      <section
        style={{
          background: `linear-gradient(rgba(15, 23, 42, 0.72), rgba(15, 23, 42, 0.80)), url("${HERO_BG}") center/cover no-repeat`,
          color: '#fff',
          minHeight: 480,
          display: 'flex',
          alignItems: 'center',
          textAlign: 'center',
          padding: '4rem 1.5rem',
        }}
      >
        <div className="container" style={{ maxWidth: 800 }}>
          <span className="badge bg-success mb-3" style={{ fontSize: 12, padding: '6px 14px' }}>
            <i className="bi bi-lightning-charge me-1" />{heroContent.badge}
          </span>
          <h1 className="fw-bold mb-3 text-white" style={{ fontSize: 'clamp(28px, 5vw, 48px)', lineHeight: 1.2, textShadow: '0 2px 8px rgba(0,0,0,0.5)' }}>
            {heroContent.headline}
          </h1>
          <p className="mb-3" style={{ fontSize: 19, color: '#ffffff', maxWidth: 650, margin: '0 auto', textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>
            {heroContent.subhead}
          </p>
          <ul className="list-unstyled mb-4" style={{ fontSize: 17, color: '#e2e8f0', maxWidth: 600, margin: '0 auto', textAlign: 'left', textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>
            {heroContent.bullets.map((b, i) => (
              <li key={i} className="mb-2"><i className="bi bi-check-circle-fill text-success me-2" />{b}</li>
            ))}
          </ul>
          <div className="d-flex flex-wrap justify-content-center gap-3">
            <a
              href="#demo"
              className="btn btn-lg text-white fw-semibold"
              style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', border: 'none', borderRadius: 8, padding: '14px 36px', fontSize: 17, boxShadow: '0 4px 15px rgba(59, 130, 246, 0.4)' }}
            >
              <i className="bi bi-play-circle me-2" />Watch the Demo
            </a>
            <button className="btn btn-lg btn-outline-light fw-semibold" onClick={openBooking} style={{ borderRadius: 8, padding: '14px 28px', fontSize: 17 }}>
              <i className="bi bi-calendar-check me-2" />Book a Strategy Call
            </button>
          </div>
        </div>
      </section>

      {/* Live Demo */}
      <section id="demo" style={{ background: 'var(--color-bg-alt)', padding: '4rem 1.5rem' }}>
        <div className="container" style={{ maxWidth: 900 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)', fontSize: 28 }}>
            {activeScenario ? `See AI ${activeTitle} in Action` : ({'ceo': 'See How AI Defends Reliability and ROE', 'cio': 'See AI Work Across Your IT/OT Stack', 'cfo': 'See the Rate-Case-Defendable Math'} as any)[role] || 'See AI Run a Multi-State Investor-Owned Utility'}
          </h2>
          <p className="text-center text-muted mb-4" style={{ fontSize: 15 }}>
            {activeScenario ? activeDescription : ({'ceo': 'Watch AI predict outages, coordinate storm response, and deliver board-ready and analyst-ready reliability metrics.', 'cio': 'Watch AI ingest from Oracle CIS, OSI Monarch OMS, AMI, and Maximo, detect anomalies, and generate compliance reports across millions of customers.', 'cfo': 'Watch AI automate rate case preparation, prudency narratives, and field operations capex justification.'} as any)[role] || 'Watch 10 AI agents predict outages, dispatch crews, and handle storm-event call volume across millions of customers.'}
          </p>

          <InlineDemoPlayer
            key={demoKey}
            allowedScenarios={selectedScenario ? [selectedScenario] : roleDefaultDemos}
            trackContext="utility_iou_landing"
            onDemoComplete={onDemoComplete}
            autoPlay={!!selectedScenario}
            presenterMode={forcePresenter || new URLSearchParams(window.location.search).has('presenter')}
          />

          {showPicker && (
            <div className="mt-4 text-center">
              <h5 className="fw-bold mb-3" style={{ color: 'var(--color-primary)', fontSize: 18 }}>Explore More IOU AI Scenarios</h5>
              <div className="d-flex flex-wrap justify-content-center gap-2 mb-4">
                {UTILITY_SCENARIOS.map(s => {
                  const done = completedScenarios.has(s.id);
                  const label = IOU_SCENARIO_LABELS[s.id]?.title || s.title;
                  return (
                    <button
                      key={s.id}
                      className={`btn btn-sm rounded-pill px-3 ${done ? 'btn-success' : 'btn-outline-primary'}`}
                      onClick={() => playScenario(s.demoId)}
                      style={{ fontSize: 13 }}
                      data-track={`utility_iou_scenario_pick_${s.id}`}
                    >
                      <span className="me-1">{SCENARIO_EMOJIS[s.id] || '⚙️'}</span>
                      {label}
                      {done && <i className="bi bi-check-circle-fill ms-1" />}
                    </button>
                  );
                })}
              </div>
              <div className="d-flex flex-wrap justify-content-center gap-3">
                <a
                  href={advisoryUrl}
                  className="btn btn-lg fw-semibold text-white"
                  target="_blank"
                  rel="noopener noreferrer"
                  style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', border: 'none', borderRadius: 8, padding: '12px 32px' }}
                >
                  Design My AI Organization &rarr;
                </a>
                <button className="btn btn-lg btn-primary fw-semibold" onClick={openBooking} style={{ borderRadius: 8, padding: '12px 32px' }}>
                  <i className="bi bi-calendar-check me-2" />Book a Strategy Call
                </button>
              </div>
            </div>
          )}
        </div>
      </section>

      {/* Stats Bar (IOU scale) */}
      <section style={{ background: 'var(--color-bg-alt)', padding: '2.5rem 1.5rem', borderBottom: '1px solid var(--color-border)' }}>
        <div className="container" style={{ maxWidth: 800 }}>
          <div className="row g-3 text-center">
            {[
              { value: '$25M+', label: 'Annual savings from 10% field ops efficiency at $250M scale', color: 'var(--color-accent)' },
              { value: '8-12%', label: 'Field operations efficiency captured in production deployments', color: 'var(--color-primary)' },
              { value: '$50-500M', label: 'Controllable field ops spend per investor-owned utility', color: 'var(--color-primary-light)' },
            ].map((st, i) => (
              <div key={i} className="col-md-4">
                <div style={{ fontSize: 36, fontWeight: 800, color: st.color, lineHeight: 1 }}>{st.value}</div>
                <div className="text-muted mt-1" style={{ fontSize: 13 }}>{st.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Pain Points */}
      <section style={{ padding: '4rem 1.5rem' }}>
        <div className="container" style={{ maxWidth: 960 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)', fontSize: 28 }}>The Field Ops Equation Every IOU Faces</h2>
          <p className="text-center text-muted mb-4" style={{ fontSize: 15 }}>Field operations is your largest controllable O&M line. $50M to $500M annually. Visibly inefficient at scale, and the next rate case will make that visible to the PUC.</p>
          <div className="row g-3">
            {painPoints.map((p, i) => (
              <div key={i} className="col-md-6">
                <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12 }}>
                  <div className="card-body p-4">
                    <div className="d-flex align-items-center gap-2 mb-2">
                      <i className={`bi ${p.icon} fs-5`} style={{ color: 'var(--color-secondary)' }} />
                      <h5 className="fw-bold mb-0" style={{ fontSize: 16, color: 'var(--color-primary)' }}>{p.title}</h5>
                    </div>
                    <p className="text-muted mb-2" style={{ fontSize: 13 }}>{p.problem}</p>
                    <p className="mb-0" style={{ fontSize: 13, color: 'var(--color-accent)' }}><i className="bi bi-check-circle-fill me-1" />{p.solution}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* The Real Numbers (IOU scale) */}
      <section style={{ background: 'var(--color-bg-alt)', padding: '3rem 1.5rem' }}>
        <div className="container" style={{ maxWidth: 800 }}>
          <h3 className="text-center fw-bold mb-4" style={{ color: 'var(--color-primary)', fontSize: 24 }}>The Real Numbers</h3>
          <div className="card border-0 shadow-sm" style={{ borderRadius: 12 }}>
            <div className="card-body p-4">
              <div className="row g-4">
                <div className="col-md-6">
                  <h6 className="fw-bold mb-3" style={{ color: 'var(--color-primary)', fontSize: 14 }}>Where the Money Goes</h6>
                  <div className="d-flex justify-content-between align-items-center mb-2 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: 13 }}>Vegetation management</span>
                    <span className="fw-bold" style={{ color: 'var(--color-primary)', fontSize: 14 }}>$30-150M/yr</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center mb-2 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: 13 }}>Truck rolls (labor, fuel, fleet)</span>
                    <span className="fw-bold" style={{ color: 'var(--color-primary)', fontSize: 14 }}>$50-250M/yr</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="fw-bold" style={{ fontSize: 14 }}>Total controllable spend</span>
                    <span className="fw-bold" style={{ color: 'var(--color-accent)', fontSize: 16 }}>$50-500M/yr</span>
                  </div>
                </div>
                <div className="col-md-6">
                  <h6 className="fw-bold mb-3" style={{ color: 'var(--color-primary)', fontSize: 14 }}>What AI Saves</h6>
                  <div className="d-flex justify-content-between align-items-center mb-2 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: 13 }}>10% efficiency on $250M base</span>
                    <span className="fw-bold" style={{ color: 'var(--color-accent)', fontSize: 14 }}>$25M/yr saved</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center mb-2 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: 13 }}>5% efficiency on $250M base</span>
                    <span className="fw-bold" style={{ color: 'var(--color-accent)', fontSize: 14 }}>$12.5M/yr saved</span>
                  </div>
                  <div className="text-muted mt-2" style={{ fontSize: 12, fontStyle: 'italic' }}>
                    Based on a mid-size IOU field operations budget. Moves SAIDI, ROE, and earned return — and survives intervenor scrutiny in your next rate case.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* 8 Scenario Cards */}
      <section style={{ padding: '4rem 1.5rem' }}>
        <div className="container" style={{ maxWidth: 960 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)', fontSize: 28 }}>8 Ways AI Transforms IOU Operations</h2>
          <p className="text-center text-muted mb-4" style={{ fontSize: 15 }}>Each scenario shows a specific AI capability built for investor-owned utility scale.</p>
          <div className="row g-3">
            {UTILITY_SCENARIOS.map(s => {
              const ov = IOU_SCENARIO_LABELS[s.id] || {};
              return (
                <div key={s.id} className="col-md-6 col-lg-3">
                  <button
                    className="card border-0 shadow-sm h-100 text-start w-100"
                    data-track={`utility_iou_card_${s.id}`}
                    onClick={() => playScenario(s.demoId)}
                    style={{ borderRadius: 12, transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer', background: '#fff' }}
                    onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.12)'; }}
                    onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = ''; }}
                  >
                    <div className="card-body p-3">
                      <span className="d-block mb-2" style={{ fontSize: 28 }}>{SCENARIO_EMOJIS[s.id] || '⚙️'}</span>
                      <h6 className="fw-bold mb-1" style={{ color: 'var(--color-primary)', fontSize: 14 }}>{ov.title || s.title}</h6>
                      <p className="text-muted mb-2" style={{ fontSize: 12, lineHeight: 1.5 }}>{ov.description || s.description}</p>
                      <div className="d-flex justify-content-between align-items-center">
                        <span style={{ fontSize: 11, color: 'var(--color-accent)', fontWeight: 600 }}>{ov.kpi || s.kpi}</span>
                        <span className="text-muted" style={{ fontSize: 10 }}>{s.agentCount} agents</span>
                      </div>
                    </div>
                  </button>
                </div>
              );
            })}
          </div>
        </div>
      </section>

      {/* Two Paths */}
      <section style={{ background: 'var(--color-bg-alt)', padding: '4rem 1.5rem' }}>
        <div className="container" style={{ maxWidth: 900 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)', fontSize: 28 }}>Two Paths to AI at Your IOU</h2>
          <p className="text-center text-muted mb-4" style={{ fontSize: 15 }}>We can build it with your team, or we can build it for your team.</p>
          <div className="row g-4">
            <div className="col-md-6">
              <div className="card border-0 shadow h-100" style={{ borderRadius: 12, overflow: 'hidden' }}>
                <div className="card-header text-white fw-bold text-center py-3" style={{ background: 'var(--color-primary)', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' }}>
                  Path 1 — Capability Build
                </div>
                <div className="card-body p-4">
                  <h4 className="fw-bold mb-2" style={{ fontSize: 20, color: 'var(--color-primary)' }}>Enterprise AI Accelerator</h4>
                  <p className="text-muted mb-3" style={{ fontSize: 14 }}>Your distribution operations and IT/OT teams learn to deploy AI on your existing data infrastructure. Daily work plans, route optimization, vegetation prioritization — built by your people on your stack.</p>
                  <ul className="list-unstyled mb-0">
                    {['12-week hands-on program with your ops, IT, and analytics teams', 'Deploy a Crew Productivity Engine on your Oracle/SAP/Maximo data', 'Daily work plans, route optimization, risk-based vegetation', 'Executive sponsorship kit with rate-case-defendable ROI', 'Post-deployment support and quarterly model tuning'].map((item, i) => (
                      <li key={i} className="d-flex align-items-start gap-2 mb-2" style={{ fontSize: 13 }}>
                        <i className="bi bi-check-circle-fill flex-shrink-0" style={{ color: 'var(--color-accent)', marginTop: 2 }} />{item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="card-footer bg-white border-0 p-4 pt-0">
                  <button className="btn btn-primary w-100 fw-semibold" onClick={openBooking}>Discuss Capability Build &rarr;</button>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="card border-0 shadow h-100" style={{ borderRadius: 12, overflow: 'hidden' }}>
                <div className="card-header text-white fw-bold text-center py-3" style={{ background: 'var(--color-primary-light)', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' }}>
                  Path 2 — Managed Delivery
                </div>
                <div className="card-body p-4">
                  <h4 className="fw-bold mb-2" style={{ fontSize: 20, color: 'var(--color-primary)' }}>Advisory & Custom Build</h4>
                  <p className="text-muted mb-3" style={{ fontSize: 14 }}>We embed AI architects with your distribution ops team and deliver a Crew Productivity Engine powered by the <strong>AIXcelerator</strong> platform. Production system on your infrastructure in weeks.</p>
                  <ul className="list-unstyled mb-0">
                    {['Dedicated AI architects embedded with your ops and IT teams', 'AIXcelerator platform to compress delivery timelines', 'Pre-built utility data structures and OMS/AMI/CIS connectors', 'Crew routing, vegetation scheduling, daily work plans across your territory', 'NERC CIP and SOX-aligned audit trails from day one', 'Production system delivered in weeks, not enterprise-software years'].map((item, i) => (
                      <li key={i} className="d-flex align-items-start gap-2 mb-2" style={{ fontSize: 13 }}>
                        <i className="bi bi-check-circle-fill flex-shrink-0" style={{ color: 'var(--color-primary-light)', marginTop: 2 }} />{item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="card-footer bg-white border-0 p-4 pt-0">
                  <button className="btn btn-primary w-100 fw-semibold" onClick={openBooking}>Discuss Managed Delivery &rarr;</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* Why IOUs Trust Us */}
      <section style={{ background: 'var(--color-bg-alt)', padding: '4rem 1.5rem' }}>
        <div className="container" style={{ maxWidth: 960 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)', fontSize: 28 }}>Why Investor-Owned Utilities Trust Colaberry</h2>
          <p className="text-center text-muted mb-4" style={{ fontSize: 15 }}>We understand what matters to IOU executives: rate-case defendability, regulatory compliance, IT/OT security, and producing operational results before the next earnings call.</p>
          <div className="row g-3">
            {[
              { icon: 'bi-building', title: 'Production Utility Experience', desc: 'We have a track record working with the largest utilities in the United States. Our team understands grid operations, FERC and PUC requirements, and rate-case dynamics.' },
              { icon: 'bi-puzzle', title: 'Works With Your Existing Stack', desc: 'Our solution integrates with Oracle CIS, SAP, Maximo, OMS (OSI Monarch, GE), GIS (Smallworld, ESRI), AMI head-ends, and your data lake. We compress time-to-ROI; we do not replace what you already operate.' },
              { icon: 'bi-shield-lock', title: 'NERC CIP, SOX, and SOC 2 Aligned', desc: 'Every AI decision is logged, explainable, and replayable. Audit trails built for SOC 2 Type II, NERC CIP, and SOX evidence. Your compliance team gets a clean story.' },
              { icon: 'bi-cash-stack', title: 'Rate-Case-Defendable ROI', desc: 'Fully transparent ROI methodology with documented benchmarks per FERC accounts. Every input traceable. Built to be defended in PUC testimony, not just in a board deck.' },
              { icon: 'bi-award', title: 'IRA / DOE / GRIP Funding Aligned', desc: 'AI investments positioned for grid resilience tax credits, IRA Section 45 grid program funding, and DOE GRIP/GRP grants. Spend grant capital before discretionary O&M.' },
              { icon: 'bi-arrow-left-right', title: 'Flexible Engagement', desc: 'Start with a free demo and assessment. NDA, MSA, and formal procurement come when you are ready. We meet your enterprise procurement process, not the other way around.' },
            ].map((item, i) => (
              <div key={i} className="col-md-6">
                <div className="d-flex align-items-start gap-3 p-3">
                  <i className={`bi ${item.icon} fs-4 flex-shrink-0`} style={{ color: 'var(--color-primary)' }} />
                  <div>
                    <h6 className="fw-bold mb-1" style={{ fontSize: 15 }}>{item.title}</h6>
                    <p className="text-muted mb-0" style={{ fontSize: 13 }}>{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Design Your Own */}
      <section style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
        <div className="container" style={{ maxWidth: 600 }}>
          <h3 className="fw-bold mb-2" style={{ color: 'var(--color-primary)', fontSize: 24 }}>Want to See What AI Looks Like for YOUR Utility?</h3>
          <p className="text-muted mb-3" style={{ fontSize: 14 }}>Design your own AI organization in 5 minutes — free, no signup required.</p>
          <a href={advisoryUrl} className="btn btn-lg fw-bold px-4" target="_blank" rel="noopener noreferrer" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 8 }}>
            Design My AI Organization &rarr;
          </a>
        </div>
      </section>

      {/* Final CTA */}
      <section
        className="text-light text-center"
        style={{ background: 'linear-gradient(135deg, #0f1b2d 0%, #1a365d 50%, #1e3a5f 100%)', padding: '5rem 1.5rem' }}
      >
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h2 className="text-white fw-bold mb-3" style={{ fontSize: 28 }}>Ready to Bring Production AI to Your Utility?</h2>
          <p className="mb-4" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15 }}>
            Schedule a 30-minute strategy call. We will walk through your specific operations and show you exactly what is possible — with rate-case-defendable numbers.
          </p>
          <button className="btn btn-light btn-lg fw-bold px-5" onClick={openBooking} style={{ borderRadius: 8, fontSize: 18 }}>
            <i className="bi bi-calendar-check me-2" />Book a Strategy Call
          </button>
          <div className="mt-3">
            <a href={advisoryUrl} className="text-decoration-none" style={{ color: 'rgba(255,255,255,0.6)', fontSize: 13 }} target="_blank" rel="noopener noreferrer">
              Or design your AI organization first &rarr;
            </a>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer style={{ padding: '2rem 1.5rem', textAlign: 'center', background: 'var(--color-bg-alt)', borderTop: '1px solid var(--color-border)' }}>
        <img src="/colaberry-icon.png" alt="Colaberry" width="24" height="24" style={{ marginBottom: 8, opacity: 0.6 }} />
        <div className="text-muted" style={{ fontSize: 12 }}>
          Colaberry Enterprise AI Division — Boston &bull; St. Louis &bull; Dallas &bull; Hyderabad
        </div>
        <div style={{ fontSize: 11, color: 'var(--color-text-light)', marginTop: 4 }}>
          AI Leadership &bull; Architecture &bull; Implementation &bull; Advisory
        </div>
      </footer>

      <StrategyCallModal
        show={showBooking}
        onClose={() => setShowBooking(false)}
        pageOrigin="/utility-iou"
      />
    </>
  );
}

export default UtilityIOULandingPage;
