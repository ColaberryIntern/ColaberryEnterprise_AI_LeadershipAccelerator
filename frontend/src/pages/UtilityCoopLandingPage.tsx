import React, { useEffect, useState, useCallback } from 'react';
import { initTracker } from '../utils/tracker';
import { captureUTMFromURL, getAdvisoryUrl, getDemoWalkthroughUrl } from '../services/utmService';
import { captureCampaignFromURL } from '../services/campaignAttributionService';
import SEOHead from '../components/SEOHead';
import InlineDemoPlayer from '../components/InlineDemoPlayer';
import StrategyCallModal from '../components/StrategyCallModal';
import { UTILITY_SCENARIOS } from '../config/utilityScenarios';

const HERO_BG = 'https://images.unsplash.com/photo-1473341304170-971dccb5ac1e?auto=format&fit=crop&w=1920&q=80';

const SCENARIO_EMOJIS: Record<string, string> = {
  'outage-prediction': '\u26A1',
  'storm-response': '\u{1F329}\uFE0F',
  'smart-metering': '\u{1F4CA}',
  'vegetation-mgmt': '\u{1F333}',
  'rate-case': '\u{1F4C4}',
  'member-services': '\u{1F4DE}',
  'fleet-dispatch': '\u{1F69A}',
  'regulatory-compliance': '\u{1F6E1}\uFE0F',
};

// Role-based hero content for personalized email campaigns
const ROLE_HEROES: Record<string, { badge: string; headline: string; subhead: string; bullets: string[] }> = {
  ceo: {
    badge: 'For Co-op CEOs and General Managers',
    headline: 'Your Board Is Asking About AI. Do You Have an Answer?',
    subhead: 'See exactly what AI does for a co-op your size, with real numbers your board can act on:',
    bullets: [
      '$1.5M annual savings on a $15M field ops budget',
      'Go from "talking about AI" to production in 3 weeks',
      'Board-ready ROI projections with transparent methodology',
    ],
  },
  cio: {
    badge: 'For Co-op CIOs and IT Directors',
    headline: 'Your Data Is in NISC and Azure. Now What?',
    subhead: 'An AI layer that works with your existing infrastructure, not against it:',
    bullets: [
      'Connects to NISC, Azure, Oracle, and your existing data stack',
      'No data migration required. AI agents read from your systems.',
      'SOC 2 aligned audit trails and full explainability',
    ],
  },
  cfo: {
    badge: 'For Co-op CFOs and Finance Leaders',
    headline: 'Can You Justify the AI Investment to Your Board?',
    subhead: 'Every number traces to a verifiable benchmark. See the math before you commit:',
    bullets: [
      '3-month payback on a $15M field ops budget',
      'Conservative estimates: 10-15% efficiency, not inflated projections',
      'Implementation costs that scale with your co-op size',
    ],
  },
  ops: {
    badge: 'For VP Operations and Engineering Directors',
    headline: 'Are You Thinking About Using AI to Get 10-15% Daily Operational Efficiency?',
    subhead: 'You are at the right place. Here is how:',
    bullets: [
      'Reduce unnecessary truck rolls',
      'Optimize trimming schedules',
      'Optimized crew schedules and daily work plans',
    ],
  },
};

function UtilityCoopLandingPage() {
  const [showBooking, setShowBooking] = useState(false);
  const [demoKey, setDemoKey] = useState(0);
  const [selectedScenario, setSelectedScenario] = useState<string | null>(null);
  const [completedScenarios, setCompletedScenarios] = useState<Set<string>>(new Set());
  const [showPicker, setShowPicker] = useState(false);
  const advisoryUrl = getAdvisoryUrl();

  // Detect role from URL param for personalized hero + demo
  // If no role param, randomly alternate between all 4 roles each page load
  const urlRole = new URLSearchParams(window.location.search).get('role');
  const role = urlRole || (['ceo', 'cio', 'ops', 'cfo'][Math.floor(Math.random() * 4)]);
  const heroContent = ROLE_HEROES[role] || ROLE_HEROES.ops;

  // Map each role to the most relevant demo to auto-play first
  const ROLE_DEFAULT_DEMOS: Record<string, string[]> = {
    ceo: ['utility-outage', 'utility-storm'],           // Board-level: reliability, member satisfaction
    cio: ['utility-metering', 'utility-compliance'],     // Data/IT: NISC integration, analytics, compliance
    ops: ['utility-fleet', 'utility-vegetation'],         // Field ops: crew productivity, vegetation
    cfo: ['utility-ratecase', 'utility-fleet'],           // Finance: rate case automation, cost savings
  };
  const roleDefaultDemos = ROLE_DEFAULT_DEMOS[role] || ROLE_DEFAULT_DEMOS.ops;

  useEffect(() => {
    initTracker();
    captureUTMFromURL();
    captureCampaignFromURL();
    // Track which role variant was viewed
    try { (window as any).trackBookingEvent?.('role_variant_view', { role }); } catch {}
  }, []);

  const openBooking = () => setShowBooking(true);

  // Find the currently selected scenario's display info
  const activeScenario = UTILITY_SCENARIOS.find(s => s.demoId === selectedScenario);

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
      { icon: 'bi-people', title: 'Not Enough Crews', problem: 'You don\'t have enough linemen and the ones you have waste time on low-value work.', solution: 'AI prioritizes the 12 highest-impact jobs each day so the same crew covers 15% more line per week.' },
      { icon: 'bi-truck', title: 'Wasted Truck Rolls', problem: 'Crews dispatched with incomplete info. Multiple visits to the same area. Poor routing.', solution: 'Even a 5-10% reduction in unnecessary truck rolls on a $15M field ops budget saves $750K-$1.5M/year.' },
      { icon: 'bi-tree', title: 'Blunt Trimming Cycles', problem: 'You trim every X years regardless of risk. High-risk corridors grow unchecked while you trim low-risk areas.', solution: 'AI targets where risk and cost justify it. 10-20% reduction in trimming spend, or same spend with fewer outages.' },
      { icon: 'bi-clipboard-data', title: 'No Daily Work Plan', problem: 'Your crews don\'t get a prioritized list each morning. Supervisors spend hours on the phone assigning jobs.', solution: 'AI generates: here are the 12 highest-value jobs today, in order. Trim here. Inspect here. Don\'t bother going here.' },
    ],
    ceo: [
      { icon: 'bi-chat-square-dots', title: 'Talking, Not Adopting', problem: 'Most co-ops are talking about AI but not adopting. Risk, cost, and internal buy-in are central to dragging feet.', solution: 'See the ROI before you commit. Our demos show exactly what AI does for your co-op, with real numbers.' },
      { icon: 'bi-graph-up-arrow', title: 'Board Wants Results', problem: 'Your board has heard about AI from every conference. They want a plan, not another vendor pitch.', solution: 'Walk into the next board meeting with a concrete AI deployment plan, projected savings, and a 3-week timeline.' },
      { icon: 'bi-shield-check', title: 'Risk of Getting It Wrong', problem: 'AI projects fail when discovery takes too long, data is not ready, or the solution does not fit co-op operations.', solution: 'Pre-built co-op data structures eliminate discovery. Human oversight at every critical decision point.' },
      { icon: 'bi-people', title: 'Workforce Concerns', problem: 'Your team worries AI means job cuts. That slows adoption.', solution: 'AI handles the 95% routine work. Your team moves from operator to supervisor. Same people, higher leverage.' },
    ],
    cio: [
      { icon: 'bi-database', title: 'NISC Controls the Data', problem: 'Your data lives in NISC (iVue, Oracle, EDC) with 15-minute latency. Getting data out for AI is the first challenge.', solution: 'We connect to NISC, Azure, Oracle, and your existing systems. No data migration. AI agents read from your infrastructure.' },
      { icon: 'bi-shield-lock', title: 'Security and Compliance', problem: 'NERC CIP, data governance, and member privacy are non-negotiable. Any AI solution must meet these standards.', solution: 'SOC 2 aligned audit trails. Every AI decision is explainable, replayable, and traceable. Full compliance monitoring.' },
      { icon: 'bi-puzzle', title: 'Integration Complexity', problem: 'You have ABS, CIS, OMS, NAM, TMS, MDM, IVCM, Power BI dashboards. Adding another system is the last thing you need.', solution: 'This is an overlay, not a replacement. It sits on top of your existing stack and makes it smarter.' },
      { icon: 'bi-code-square', title: 'No AI Team', problem: 'You have IT staff who manage NISC and networks. You do not have a team of data scientists or ML engineers.', solution: 'You do not need one. The AI agents are pre-built for co-op operations. Your IT team manages the system, not the models.' },
    ],
    cfo: [
      { icon: 'bi-calculator', title: 'Prove the ROI', problem: 'Every dollar spent on technology needs board-level justification. "AI is the future" is not a business case.', solution: 'Fully deterministic ROI calculation. Every number traces to BLS data, industry benchmarks, and your co-op size. See the math.' },
      { icon: 'bi-piggy-bank', title: '$8M-$25M Controllable Spend', problem: 'Vegetation management ($3-10M) and truck rolls ($5-15M) are your largest controllable costs. Both are visibly inefficient.', solution: '10% efficiency gain on a $15M field ops budget = $1.5M/year. That is board-level meaningful.' },
      { icon: 'bi-clock-history', title: 'Payback Period', problem: 'Long implementation timelines mean years before you see returns. That does not work for your budget cycle.', solution: '3-month payback. Implementation cost scales with your co-op size. Production system delivered in weeks, not years.' },
      { icon: 'bi-file-earmark-bar-graph', title: 'Audit-Ready Numbers', problem: 'You need numbers you can defend in a rate case or board presentation. Not vendor marketing.', solution: 'Our ROI methodology is fully transparent and expandable. Adjust inputs with your actual numbers to validate.' },
    ],
  };
  const painPoints = painPointsByRole[role] || painPointsByRole.ops;

  return (
    <>
      <SEOHead
        title="Get 10-15% More Work Done Without Adding Headcount | Colaberry Enterprise AI"
        description="Help your crews get 10-15% more work done without adding headcount. AI-powered crew productivity, vegetation management, and truck roll optimization for electric cooperatives."
      />

      {/* ── Navbar ── */}
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

      {/* ── Hero ── */}
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
          <ul className="list-unstyled mb-4" style={{ fontSize: 17, color: '#e2e8f0', maxWidth: 500, margin: '0 auto', textAlign: 'left', textShadow: '0 1px 4px rgba(0,0,0,0.3)' }}>
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

      {/* ── Live Demo — THE MAIN ATTRACTION ── */}
      <section id="demo" style={{ background: 'var(--color-bg-alt)', padding: '4rem 1.5rem' }}>
        <div className="container" style={{ maxWidth: 900 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)', fontSize: 28 }}>
            {activeScenario ? `See AI ${activeScenario.title} in Action` : role === 'ceo' ? 'See How AI Improves Grid Reliability' : role === 'cio' ? 'See AI Work With Your Data Infrastructure' : role === 'cfo' ? 'See the ROI Math in Action' : 'See a Crew Productivity Engine Built in Seconds'}
          </h2>
          <p className="text-center text-muted mb-4" style={{ fontSize: 15 }}>
            {activeScenario ? activeScenario.description : role === 'ceo' ? 'Watch AI predict outages, coordinate storm response, and deliver board-ready reliability metrics.' : role === 'cio' ? 'Watch AI analyze meter data, detect anomalies, and generate compliance reports from your existing systems.' : role === 'cfo' ? 'Watch AI automate rate case preparation and optimize field operations spend.' : 'Watch AI generate daily work plans, optimize routes, and prioritize jobs by impact for your field crews.'}
          </p>

          <InlineDemoPlayer
            key={demoKey}
            allowedScenarios={selectedScenario ? [selectedScenario] : roleDefaultDemos}
            trackContext="utility_landing"
            onDemoComplete={onDemoComplete}
            autoPlay={!!selectedScenario}
          />

          {/* 8 Scenario Picker — shows after demo completes */}
          {showPicker && (
            <div className="mt-4 text-center">
              <h5 className="fw-bold mb-3" style={{ color: 'var(--color-primary)', fontSize: 18 }}>Explore More Co-Op AI Scenarios</h5>
              <div className="d-flex flex-wrap justify-content-center gap-2 mb-4">
                {UTILITY_SCENARIOS.map(s => {
                  const done = completedScenarios.has(s.id);
                  return (
                    <button
                      key={s.id}
                      className={`btn btn-sm rounded-pill px-3 ${done ? 'btn-success' : 'btn-outline-primary'}`}
                      onClick={() => playScenario(s.demoId)}
                      style={{ fontSize: 13 }}
                      data-track={`utility_scenario_pick_${s.id}`}
                    >
                      <span className="me-1">{SCENARIO_EMOJIS[s.id] || '\u2699\uFE0F'}</span>
                      {s.title}
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

      {/* ── Stats Bar ── */}
      <section style={{ background: 'var(--color-bg-alt)', padding: '2.5rem 1.5rem', borderBottom: '1px solid var(--color-border)' }}>
        <div className="container" style={{ maxWidth: 800 }}>
          <div className="row g-3 text-center">
            {[
              { value: '$1.5M', label: 'Annual savings from 10% field ops efficiency', color: 'var(--color-accent)' },
              { value: '15%', label: 'More line covered per crew per week', color: 'var(--color-primary)' },
              { value: '$8-25M', label: 'Controllable field ops spend per co-op', color: 'var(--color-primary-light)' },
            ].map((st, i) => (
              <div key={i} className="col-md-4">
                <div style={{ fontSize: 36, fontWeight: 800, color: st.color, lineHeight: 1 }}>{st.value}</div>
                <div className="text-muted mt-1" style={{ fontSize: 13 }}>{st.label}</div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Pain Points ── */}
      <section style={{ padding: '4rem 1.5rem' }}>
        <div className="container" style={{ maxWidth: 960 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)', fontSize: 28 }}>The Field Ops Problem Every Co-Op Has</h2>
          <p className="text-center text-muted mb-4" style={{ fontSize: 15 }}>Your biggest controllable spend is field operations. $8-25M annually. And everyone knows it's not optimized.</p>
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

      {/* ── The Real Numbers ── */}
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
                    <span className="fw-bold" style={{ color: 'var(--color-primary)', fontSize: 14 }}>$3-10M/yr</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center mb-2 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: 13 }}>Truck rolls (labor, fuel, wear)</span>
                    <span className="fw-bold" style={{ color: 'var(--color-primary)', fontSize: 14 }}>$5-15M/yr</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center">
                    <span className="fw-bold" style={{ fontSize: 14 }}>Total controllable spend</span>
                    <span className="fw-bold" style={{ color: 'var(--color-accent)', fontSize: 16 }}>$8-25M/yr</span>
                  </div>
                </div>
                <div className="col-md-6">
                  <h6 className="fw-bold mb-3" style={{ color: 'var(--color-primary)', fontSize: 14 }}>What AI Saves</h6>
                  <div className="d-flex justify-content-between align-items-center mb-2 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: 13 }}>10% efficiency gain</span>
                    <span className="fw-bold" style={{ color: 'var(--color-accent)', fontSize: 14 }}>$1.5M/yr saved</span>
                  </div>
                  <div className="d-flex justify-content-between align-items-center mb-2 pb-2" style={{ borderBottom: '1px solid var(--color-border)' }}>
                    <span style={{ fontSize: 13 }}>5% efficiency gain</span>
                    <span className="fw-bold" style={{ color: 'var(--color-accent)', fontSize: 14 }}>$750K/yr saved</span>
                  </div>
                  <div className="text-muted mt-2" style={{ fontSize: 12, fontStyle: 'italic' }}>
                    Based on $15M mid-size co-op field ops budget. That's board-level meaningful.
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── 8 Scenario Cards ── */}
      <section style={{ padding: '4rem 1.5rem' }}>
        <div className="container" style={{ maxWidth: 960 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)', fontSize: 28 }}>8 Ways AI Transforms Co-Op Operations</h2>
          <p className="text-center text-muted mb-4" style={{ fontSize: 15 }}>Each scenario shows a specific AI capability built for cooperative utilities.</p>
          <div className="row g-3">
            {UTILITY_SCENARIOS.map(s => (
              <div key={s.id} className="col-md-6 col-lg-3">
                <button
                  className="card border-0 shadow-sm h-100 text-start w-100"
                  data-track={`utility_card_${s.id}`}
                  onClick={() => playScenario(s.demoId)}
                  style={{ borderRadius: 12, transition: 'transform 0.2s, box-shadow 0.2s', cursor: 'pointer', background: '#fff' }}
                  onMouseEnter={e => { e.currentTarget.style.transform = 'translateY(-3px)'; e.currentTarget.style.boxShadow = '0 8px 25px rgba(0,0,0,0.12)'; }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'none'; e.currentTarget.style.boxShadow = ''; }}
                >
                  <div className="card-body p-3">
                    <span className="d-block mb-2" style={{ fontSize: 28 }}>{SCENARIO_EMOJIS[s.id] || '\u2699\uFE0F'}</span>
                    <h6 className="fw-bold mb-1" style={{ color: 'var(--color-primary)', fontSize: 14 }}>{s.title}</h6>
                    <p className="text-muted mb-2" style={{ fontSize: 12, lineHeight: 1.5 }}>{s.description}</p>
                    <div className="d-flex justify-content-between align-items-center">
                      <span style={{ fontSize: 11, color: 'var(--color-accent)', fontWeight: 600 }}>{s.kpi}</span>
                      <span className="text-muted" style={{ fontSize: 10 }}>{s.agentCount} agents</span>
                    </div>
                  </div>
                </button>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* ── Two Paths ── */}
      <section style={{ background: 'var(--color-bg-alt)', padding: '4rem 1.5rem' }}>
        <div className="container" style={{ maxWidth: 900 }}>
          <h2 className="text-center fw-bold mb-2" style={{ color: 'var(--color-primary)', fontSize: 28 }}>Two Paths to AI at Your Co-Op</h2>
          <p className="text-center text-muted mb-4" style={{ fontSize: 15 }}>We can show your team how to build it, or we can build it for you.</p>
          <div className="row g-4">
            <div className="col-md-6">
              <div className="card border-0 shadow h-100" style={{ borderRadius: 12, overflow: 'hidden' }}>
                <div className="card-header text-white fw-bold text-center py-3" style={{ background: 'var(--color-primary)', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' }}>
                  Path 1 — Your Team Builds It
                </div>
                <div className="card-body p-4">
                  <h4 className="fw-bold mb-2" style={{ fontSize: 20, color: 'var(--color-primary)' }}>Enterprise AI Accelerator</h4>
                  <p className="text-muted mb-3" style={{ fontSize: 14 }}>Your crew supervisors learn to deploy AI that generates daily work plans, optimizes routes, and prioritizes jobs by impact.</p>
                  <ul className="list-unstyled mb-0">
                    {['3-week hands-on program with your ops team', 'Deploy a Crew Productivity Engine on your data', 'Daily work plans, route optimization, risk-based trimming', 'Executive sponsorship kit with ROI projections', 'Post-deployment support and optimization'].map((item, i) => (
                      <li key={i} className="d-flex align-items-start gap-2 mb-2" style={{ fontSize: 13 }}>
                        <i className="bi bi-check-circle-fill flex-shrink-0" style={{ color: 'var(--color-accent)', marginTop: 2 }} />{item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="card-footer bg-white border-0 p-4 pt-0">
                  <button className="btn btn-primary w-100 fw-semibold" onClick={openBooking}>Discuss Training &rarr;</button>
                </div>
              </div>
            </div>
            <div className="col-md-6">
              <div className="card border-0 shadow h-100" style={{ borderRadius: 12, overflow: 'hidden' }}>
                <div className="card-header text-white fw-bold text-center py-3" style={{ background: 'var(--color-primary-light)', fontSize: 13, letterSpacing: 1, textTransform: 'uppercase' }}>
                  Path 2 — We Build It For You
                </div>
                <div className="card-body p-4">
                  <h4 className="fw-bold mb-2" style={{ fontSize: 20, color: 'var(--color-primary)' }}>Advisory & Custom Build</h4>
                  <p className="text-muted mb-3" style={{ fontSize: 14 }}>We embed with your ops team and deliver a Crew Productivity Engine powered by the <strong>AIXcelerator</strong> platform. Smarter vegetation scheduling, fewer truck rolls, more work per crew.</p>
                  <ul className="list-unstyled mb-0">
                    {['Dedicated AI architects embedded with your ops team', 'AIXcelerator platform to augment delivery speed', 'Pre-built co-op field ops data structures', 'Crew routing, vegetation scheduling, daily work plans', 'Flex up/down with contracting support', 'Production system delivered in weeks'].map((item, i) => (
                      <li key={i} className="d-flex align-items-start gap-2 mb-2" style={{ fontSize: 13 }}>
                        <i className="bi bi-check-circle-fill flex-shrink-0" style={{ color: 'var(--color-primary-light)', marginTop: 2 }} />{item}
                      </li>
                    ))}
                  </ul>
                </div>
                <div className="card-footer bg-white border-0 p-4 pt-0">
                  <button className="btn btn-primary w-100 fw-semibold" onClick={openBooking}>Discuss Custom Build &rarr;</button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </section>

      {/* ── Design Your Own ── */}
      <section style={{ padding: '4rem 1.5rem', textAlign: 'center' }}>
        <div className="container" style={{ maxWidth: 600 }}>
          <h3 className="fw-bold mb-2" style={{ color: 'var(--color-primary)', fontSize: 24 }}>Want to See What AI Looks Like for YOUR Co-Op?</h3>
          <p className="text-muted mb-3" style={{ fontSize: 14 }}>Design your own AI organization in 5 minutes — free, no signup required.</p>
          <a href={advisoryUrl} className="btn btn-lg fw-bold px-4" target="_blank" rel="noopener noreferrer" style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', color: '#fff', border: 'none', borderRadius: 8 }}>
            Design My AI Organization &rarr;
          </a>
        </div>
      </section>

      {/* ── Final CTA ── */}
      <section
        className="text-light text-center"
        style={{ background: 'linear-gradient(135deg, #0f1b2d 0%, #1a365d 50%, #1e3a5f 100%)', padding: '5rem 1.5rem' }}
      >
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h2 className="text-white fw-bold mb-3" style={{ fontSize: 28 }}>Ready to Bring AI to Your Cooperative?</h2>
          <p className="mb-4" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15 }}>
            Schedule a 30-minute strategy call. We'll walk through your specific operations and show you what's possible.
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

      {/* ── Footer ── */}
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
        pageOrigin="/utility-ai"
      />
    </>
  );
}

export default UtilityCoopLandingPage;
