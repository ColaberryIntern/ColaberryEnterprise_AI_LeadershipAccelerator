import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import SEOHead from '../components/SEOHead';
import { PROGRAM_SCHEDULE } from '../config/programSchedule';

/** Intersection Observer hook for fade-in-on-scroll */
function useFadeIn() {
  const ref = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    const observer = new IntersectionObserver(
      ([entry]) => {
        if (entry.isIntersecting) {
          el.classList.add('is-visible');
          observer.unobserve(el);
        }
      },
      { threshold: 0.12 },
    );
    observer.observe(el);
    return () => observer.disconnect();
  }, []);
  return ref;
}

function FadeIn({ children, className = '' }: { children: React.ReactNode; className?: string }) {
  const ref = useFadeIn();
  return (
    <div ref={ref} className={`fade-in-section ${className}`}>
      {children}
    </div>
  );
}

const FAQ_ITEMS = [
  {
    question: 'What LLM or AI tools do I need?',
    answer: 'You can use any enterprise LLM your company approves — ChatGPT, Claude, Gemini, or another platform. There is no requirement to use a specific tool. You bring your own credentials and API access.',
  },
  {
    question: "What's the time commitment?",
    answer: `${PROGRAM_SCHEDULE.shortDescription}. Between sessions, expect 2-4 hours of applied work on your own AI initiative using your organization's tools and data.`,
  },
  {
    question: 'Do I need technical experience?',
    answer: 'No. This program is designed for enterprise leaders — directors, VPs, CTOs, and CDOs — who need to deploy AI capability, not write code. The 3-Agent Model gives you an execution framework that works regardless of your technical background.',
  },
  {
    question: 'What do I walk away with?',
    answer: 'Concrete, executive-ready artifacts: a working AI Proof of Capability scoped to your organization, an executive presentation deck for internal buy-in, a 90-Day AI expansion roadmap, and reusable architecture templates.',
  },
  {
    question: 'Is my company data safe?',
    answer: 'Yes. You use your own LLM with your own credentials throughout the program. No company data is shared with Colaberry\'s systems or other participants. All work stays within your organization\'s security perimeter.',
  },
  {
    question: "What's the class format?",
    answer: 'Live virtual sessions with hands-on exercises. Each session combines instruction with guided execution — you build your actual AI initiative during the program, not hypothetical examples.',
  },
];

function FAQAccordion() {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="accordion accordion-flush" id="programFAQ">
      {FAQ_ITEMS.map((item, i) => (
        <div className="accordion-item" key={i}>
          <h3 className="accordion-header">
            <button
              className={`accordion-button ${openIndex === i ? '' : 'collapsed'}`}
              type="button"
              onClick={() => setOpenIndex(openIndex === i ? null : i)}
              aria-expanded={openIndex === i}
              aria-controls={`faq-collapse-${i}`}
            >
              {item.question}
            </button>
          </h3>
          <div
            id={`faq-collapse-${i}`}
            className={`accordion-collapse collapse ${openIndex === i ? 'show' : ''}`}
          >
            <div className="accordion-body text-muted">
              {item.answer}
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

function ProgramPage() {
  return (
    <>
      <SEOHead
        title="Program"
        description="The 3-Week Enterprise AI Execution Journey — from strategic alignment to executive-ready AI deployment. Architecture, governance, POC, and 90-Day roadmap for enterprise leaders."
      />

      {/* Hero */}
      <section
        className="hero-bg text-light py-5"
        aria-label="Page Header"
        style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1531482615713-2afd69097998?auto=format&fit=crop&w=1920&q=80)' }}
      >
        <div className="container text-center py-5">
          <img src="/colaberry-icon.png" alt="" width="44" height="44" className="mb-3 logo-hero" />
          <span className="badge-label bg-white text-primary mb-3">
            EXECUTIVE AI ENABLEMENT PROGRAM
          </span>
          <h1 className="display-5 fw-bold text-light mt-3">
            🧠 The 3-Week Enterprise AI Execution Journey
          </h1>
          <p className="lead mb-0" style={{ maxWidth: '720px', margin: '0 auto' }}>
            From Strategic Alignment to Executive-Ready AI Deployment
          </p>
        </div>
      </section>

      {/* Journey Overview — Horizontal Timeline */}
      <section className="section-spacer" aria-label="Journey Overview">
        <div className="container">
          <FadeIn>
            <h2 className="text-center mb-3">Your Transformation in {PROGRAM_SCHEDULE.totalWeeks} Weeks</h2>
            <p className="text-center text-muted mb-4" style={{ maxWidth: '680px', margin: '0 auto' }}>
              A structured progression that turns enterprise leaders into AI architects
              inside their organization.
            </p>
            <div className="d-flex justify-content-center gap-3 flex-wrap mb-5">
              {PROGRAM_SCHEDULE.summaryBadges.map((badge: string, i: number) => (
                <span key={badge} className={`badge ${i < 3 ? 'bg-primary' : 'bg-secondary'} px-3 py-2`}>{badge}</span>
              ))}
            </div>
          </FadeIn>
          <FadeIn>
            <div className="timeline-horizontal">
              <div className="timeline-step">
                <div className="timeline-marker">W1</div>
                <h3 className="h6 mb-1">🔎 Define &amp; Architect</h3>
                <p className="text-muted small mb-0">Strategic Alignment &amp; Architecture</p>
              </div>
              <div className="timeline-step">
                <div className="timeline-marker">W2</div>
                <h3 className="h6 mb-1">⚙ Prototype &amp; Position</h3>
                <p className="text-muted small mb-0">Guided Build &amp; Executive Positioning</p>
              </div>
              <div className="timeline-step">
                <div className="timeline-marker timeline-marker-active">W3</div>
                <h3 className="h6 mb-1">🚀 Operationalize &amp; Present</h3>
                <p className="text-muted small mb-0">Executive Readiness &amp; Expansion</p>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      <hr className="week-divider" />

      {/* ────────── WEEK 1 ────────── */}
      <section className="section-spacer-alt" aria-label="Week 1">
        <div className="container">
          <FadeIn>
            <div className="d-flex align-items-center mb-5">
              <span className="badge bg-primary fs-6 me-3 px-3 py-2">📍 Week 1</span>
              <h2 className="mb-0">Strategic Alignment &amp; Architecture</h2>
            </div>
          </FadeIn>

          {/* Day 1 */}
          <FadeIn>
            <div className="card border-0 shadow-sm mb-4 card-lift">
              <div className="card-body p-4 p-lg-5">
                <div className="d-flex align-items-center mb-3">
                  <span className="badge bg-secondary me-3 fs-6">{PROGRAM_SCHEDULE.dayLabels[0]}</span>
                  <h3 className="h5 mb-0">🧭 The Enterprise AI Mandate</h3>
                </div>
                <div className="row g-4">
                  <div className="col-lg-8">
                    <ul className="text-muted mb-3">
                      <li>Understanding where AI creates enterprise leverage</li>
                      <li>Identifying viable use cases within your organization</li>
                      <li>Governance, risk, and internal alignment</li>
                      <li>Selecting your initial AI Proof of Capability (POC)</li>
                    </ul>
                    <p className="mb-0">
                      <strong>✔ Deliverable:</strong>{' '}
                      <span className="text-muted">Defined high-impact AI initiative aligned to business objectives</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </FadeIn>

          {/* Day 2 */}
          <FadeIn>
            <div className="card border-0 shadow-sm mb-4 card-lift">
              <div className="card-body p-4 p-lg-5">
                <div className="d-flex align-items-center mb-3">
                  <span className="badge bg-secondary me-3 fs-6">{PROGRAM_SCHEDULE.dayLabels[1]}</span>
                  <h3 className="h5 mb-0">🏗 Architecture &amp; 3-Agent Environment Setup</h3>
                </div>
                <div className="row g-4">
                  <div className="col-lg-12">
                    <p className="text-muted mb-3">
                      Introduce the <strong>3-Agent Model</strong> — the operating system for your AI execution:
                    </p>
                    <div className="row g-3 mb-4">
                      <div className="col-md-4">
                        <div className="agent-card card-lift">
                          <span className="agent-card-icon" aria-hidden="true">👤</span>
                          <div className="fw-bold mb-1">The Enterprise Leader</div>
                          <small className="text-muted">You — strategy &amp; decisions</small>
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div className="agent-card card-lift">
                          <span className="agent-card-icon" aria-hidden="true">🤖</span>
                          <div className="fw-bold mb-1">Claude Code</div>
                          <small className="text-muted">Execution engine</small>
                        </div>
                      </div>
                      <div className="col-md-4">
                        <div className="agent-card card-lift">
                          <span className="agent-card-icon" aria-hidden="true">🧠</span>
                          <div className="fw-bold mb-1">Your Custom LLM</div>
                          <small className="text-muted">ChatGPT, Claude, Gemini, or your company's approved LLM</small>
                        </div>
                      </div>
                    </div>
                    <ul className="text-muted mb-3">
                      <li>Establish technical environment</li>
                      <li>Document problem, architecture, data sources, and risks</li>
                      <li>Define measurable success criteria</li>
                      <li>Align POC scope for execution</li>
                    </ul>
                    <p className="mb-0">
                      <strong>✔ Deliverable:</strong>{' '}
                      <span className="text-muted">Approved architecture blueprint and execution plan</span>
                    </p>
                  </div>
                </div>
              </div>
            </div>
          </FadeIn>

          {/* Pre-Work Callout */}
          <FadeIn>
            <div className="callout-box mb-0">
              <h4 className="h6 mb-2">📘 Executive Action Required — Between Week 1 &amp; Week 2</h4>
              <div className="row g-2">
                <div className="col-md-6">
                  <ul className="text-muted small mb-0">
                    <li className="deliverable-item">Secure LLM access — use any LLM your organization approves (ChatGPT, Claude, Gemini, etc.)</li>
                    <li className="deliverable-item">Confirm tech stack and data access</li>
                    <li className="deliverable-item">Identify internal stakeholders</li>
                  </ul>
                </div>
                <div className="col-md-6">
                  <ul className="text-muted small mb-0">
                    <li className="deliverable-item">Complete architecture documentation</li>
                    <li className="deliverable-item">Complete custom LLM learning phase</li>
                  </ul>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      <hr className="week-divider" />

      {/* ────────── WEEK 2 ────────── */}
      <section className="section-spacer" aria-label="Week 2">
        <div className="container">
          <FadeIn>
            <div className="d-flex align-items-center mb-5">
              <span className="badge bg-primary fs-6 me-3 px-3 py-2">⚙ Week 2</span>
              <h2 className="mb-0">Guided Prototype &amp; Executive Positioning</h2>
            </div>
          </FadeIn>

          {/* Day 3 */}
          <FadeIn>
            <div className="card border-0 shadow-sm mb-4 card-lift">
              <div className="card-body p-4 p-lg-5">
                <div className="d-flex align-items-center mb-3">
                  <span className="badge bg-secondary me-3 fs-6">{PROGRAM_SCHEDULE.dayLabels[2]}</span>
                  <h3 className="h5 mb-0">💻 Guided POC Launch</h3>
                </div>
                <ul className="text-muted mb-3">
                  <li>Stand up repository and project architecture</li>
                  <li>Implement core architecture patterns</li>
                  <li>Deploy to GitHub with CI foundations</li>
                  <li>Validate working system foundation</li>
                </ul>
                <p className="mb-0">
                  <strong>✔ Goal:</strong>{' '}
                  <span className="text-muted">Functional prototype framework operational</span>
                </p>
              </div>
            </div>
          </FadeIn>

          {/* Day 4 */}
          <FadeIn>
            <div className="card border-0 shadow-sm mb-4 card-lift">
              <div className="card-body p-4 p-lg-5">
                <div className="d-flex align-items-center mb-3">
                  <span className="badge bg-secondary me-3 fs-6">{PROGRAM_SCHEDULE.dayLabels[3]}</span>
                  <h3 className="h5 mb-0">📊 Refinement &amp; Executive Positioning</h3>
                </div>
                <div className="row g-4">
                  <div className="col-lg-6">
                    <h4 className="h6 mb-2" style={{ color: 'var(--color-primary)' }}>
                      Production-Ready Refinement
                    </h4>
                    <ul className="text-muted mb-0">
                      <li>Error handling and resilience patterns</li>
                      <li>Structured logging and observability</li>
                      <li>Edge case handling</li>
                      <li>Architecture cleanup and documentation</li>
                    </ul>
                  </div>
                  <div className="col-lg-6">
                    <h4 className="h6 mb-2" style={{ color: 'var(--color-primary)' }}>
                      Internal Influence &amp; Communication
                    </h4>
                    <ul className="text-muted mb-0">
                      <li>Using AI tools to create executive-ready materials</li>
                      <li>Demo video creation and narrative framing</li>
                      <li>Executive narrative and ROI communication strategy</li>
                      <li>Internal buy-in positioning</li>
                    </ul>
                  </div>
                </div>
                <p className="mt-3 mb-0">
                  <strong>✔ Deliverable:</strong>{' '}
                  <span className="text-muted">Polished prototype + executive presentation draft</span>
                </p>
              </div>
            </div>
          </FadeIn>

          {/* Week 2 Pre-Work Callout */}
          <FadeIn>
            <div className="callout-box mb-0">
              <h4 className="h6 mb-2">📘 Executive Action Required — Between Week 2 &amp; Week 3</h4>
              <div className="row g-2">
                <div className="col-md-6">
                  <ul className="text-muted small mb-0">
                    <li className="deliverable-item">Finalize POC to production-ready state</li>
                    <li className="deliverable-item">Refine live demonstration</li>
                  </ul>
                </div>
                <div className="col-md-6">
                  <ul className="text-muted small mb-0">
                    <li className="deliverable-item">Complete executive slide deck</li>
                    <li className="deliverable-item">Prepare 90-Day expansion roadmap outline</li>
                  </ul>
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      <hr className="week-divider" />

      {/* ────────── WEEK 3 ────────── */}
      <section className="section-spacer-alt" aria-label="Week 3">
        <div className="container">
          <FadeIn>
            <div className="d-flex align-items-center mb-5">
              <span className="badge bg-primary fs-6 me-3 px-3 py-2">🎯 Week 3</span>
              <h2 className="mb-0">Executive Readiness &amp; Expansion</h2>
            </div>
          </FadeIn>

          {/* Day 5 */}
          <FadeIn>
            <div className="card border-0 shadow-sm border-start border-4 border-primary mb-4 card-lift">
              <div className="card-body p-4 p-lg-5">
                <div className="d-flex align-items-center mb-3">
                  <span className="badge bg-primary me-3 fs-6">{PROGRAM_SCHEDULE.dayLabels[4]}</span>
                  <h3 className="h5 mb-0">🎤 Executive Demonstrations &amp; Expansion Strategy</h3>
                </div>
                <p className="text-muted mb-3">
                  Participants present to the cohort and advisory panel:
                </p>
                <div className="row g-3 mb-4">
                  {[
                    'Business problem and organizational context',
                    'Architecture approach and technical decisions',
                    'Live demonstration of working POC',
                    'ROI narrative and cost-benefit analysis',
                    '90-Day expansion roadmap',
                  ].map((item) => (
                    <div className="col-md-6" key={item}>
                      <div className="d-flex align-items-start deliverable-item">
                        <span className="text-success me-2" aria-hidden="true">✔</span>
                        <span className="text-muted">{item}</span>
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* Expansion Bridge */}
      <section className="section-spacer" aria-label="Expansion Bridge">
        <div className="container">
          <FadeIn>
            <h2 className="text-center mb-3">🚀 From Proof of Capability to Enterprise Execution</h2>
            <p className="text-center text-muted mb-5" style={{ maxWidth: '680px', margin: '0 auto' }}>
              The accelerator is the beginning, not the destination. Participants
              retain ecosystem access for continued support as they scale AI
              across their organization.
            </p>
          </FadeIn>
          <FadeIn>
            <div className="expansion-flow mb-5">
              <span className="expansion-flow-step">🎓 Accelerator</span>
              <span className="expansion-flow-arrow" aria-hidden="true">→</span>
              <span className="expansion-flow-step">🗺 Roadmap Workshop</span>
              <span className="expansion-flow-arrow" aria-hidden="true">→</span>
              <span className="expansion-flow-step">🏗 Architecture Design</span>
              <span className="expansion-flow-arrow" aria-hidden="true">→</span>
              <span className="expansion-flow-step">🤖 Implementation</span>
              <span className="expansion-flow-arrow" aria-hidden="true">→</span>
              <span className="expansion-flow-step">🚀 Enterprise Scale</span>
            </div>
          </FadeIn>
          <FadeIn>
            <div className="row align-items-center g-5">
              <div className="col-lg-6">
                <ul className="list-unstyled">
                  {[
                    'AI Roadmap Workshops',
                    'Enterprise AI Architecture Engagements',
                    'Implementation Support',
                    'AI Talent Deployment',
                    'Ongoing Advisory Labs',
                  ].map((item) => (
                    <li className="mb-2 d-flex align-items-center deliverable-item" key={item}>
                      <span className="text-primary me-2 fw-bold" aria-hidden="true">&#8594;</span>
                      {item}
                    </li>
                  ))}
                </ul>
                <Link to="/advisory" className="btn btn-outline-primary mt-2">
                  Explore Advisory Services
                </Link>
              </div>
              <div className="col-lg-6">
                <div className="img-accent-frame">
                  <img
                    src="https://images.unsplash.com/photo-1600880292089-90a7e086ee0c?auto=format&fit=crop&w=800&q=80"
                    alt="Executive leaders in a strategic planning session"
                    className="img-feature img-feature-tall"
                  />
                </div>
              </div>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* What You Will Have in 21 Days */}
      <section className="section-spacer-alt" aria-label="Outcomes">
        <div className="container">
          <FadeIn>
            <h2 className="text-center mb-5">📦 What You Will Have in {PROGRAM_SCHEDULE.totalWeeks} Weeks</h2>
          </FadeIn>
          <div className="row g-4">
            {[
              { icon: '💻', title: 'Working AI Proof of Capability', description: 'Production-architecture quality — scoped to your organization\'s highest-priority use case' },
              { icon: '🎤', title: 'Executive AI Presentation Deck', description: 'Board and C-suite ready — structured for internal buy-in and budget approval' },
              { icon: '📅', title: '90-Day AI Expansion Roadmap', description: 'Prioritized, resourced, and governed — ready for immediate execution' },
              { icon: '🏗', title: 'Enterprise AI Architecture Templates', description: 'Reusable patterns, governance frameworks, and risk assessment tools' },
              { icon: '🛡', title: 'Governance & Risk Alignment', description: 'Frameworks aligned to your regulatory environment and compliance posture' },
              { icon: '🌐', title: 'Advisory Ecosystem Access', description: 'Ongoing access to Colaberry\'s Enterprise AI Advisory Labs and peer network' },
            ].map((item) => (
              <div className="col-md-4" key={item.title}>
                <FadeIn>
                  <div className="card h-100 border-0 shadow-sm p-4 card-lift">
                    <div className="fs-2 mb-2" aria-hidden="true">{item.icon}</div>
                    <h3 className="h6 mb-2">{item.title}</h3>
                    <p className="text-muted small mb-0">{item.description}</p>
                  </div>
                </FadeIn>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Who Should Attend */}
      <section className="section-spacer" aria-label="Who Should Attend">
        <div className="container" style={{ maxWidth: '800px' }}>
          <FadeIn>
            <h2 className="text-center mb-4">👔 Who This Is Designed For</h2>
          </FadeIn>
          <div className="row g-3">
            {[
              'Directors and VPs of Engineering, Technology, or Data',
              'Chief Technology Officers and Chief Data Officers',
              'Senior Technical Architects responsible for AI adoption',
              'Technical leaders at organizations with $50M+ in revenue',
              'Leaders whose teams are being asked to deliver AI outcomes now',
            ].map((item) => (
              <div className="col-12" key={item}>
                <FadeIn>
                  <div className="d-flex align-items-center p-3 bg-white rounded shadow-sm card-lift">
                    <span className="text-primary me-3 fw-bold" aria-hidden="true">&#8250;</span>
                    <span>{item}</span>
                  </div>
                </FadeIn>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Security & Governance */}
      <section className="section-spacer-alt" aria-label="Security and Governance">
        <div className="container" style={{ maxWidth: '800px' }}>
          <FadeIn>
            <h2 className="text-center mb-4">🛡 Security &amp; Governance</h2>
            <div className="card border-0 shadow-sm p-4">
              <h3 className="h6 mb-3" style={{ color: 'var(--color-primary)' }}>Bring Your Own LLM</h3>
              <p className="text-muted mb-3">
                Participants use their organization's approved AI platform throughout the program. We support
                ChatGPT, Claude, Gemini, and other enterprise LLMs — you choose the tool that meets your
                company's security and compliance requirements.
              </p>
              <ul className="text-muted mb-0">
                <li>Your data stays in your environment — no information is shared with Colaberry's systems</li>
                <li>Use your own API keys and credentials under your organization's policies</li>
                <li>All exercises are designed to work with any major enterprise LLM</li>
                <li>Governance frameworks are tailored to your regulatory environment</li>
              </ul>
            </div>
          </FadeIn>
        </div>
      </section>

      {/* FAQ */}
      <section className="section-spacer" aria-label="Frequently Asked Questions">
        <div className="container" style={{ maxWidth: '800px' }}>
          <FadeIn>
            <h2 className="text-center mb-4">Frequently Asked Questions</h2>
          </FadeIn>
          <FadeIn>
            <FAQAccordion />
          </FadeIn>
        </div>
      </section>

      {/* CTA */}
      <section
        className="cta-bg text-light text-center py-5"
        aria-label="Call to Action"
        style={{ backgroundImage: 'url(https://images.unsplash.com/photo-1517245386807-bb43f82c33c4?auto=format&fit=crop&w=1920&q=80)' }}
      >
        <div className="container py-4">
          <h2 className="text-light mb-3">🚀 Begin Your Enterprise AI Execution Journey</h2>
          <p className="mb-4" style={{ maxWidth: '600px', margin: '0 auto' }}>
            {PROGRAM_SCHEDULE.totalWeeks} weeks from strategic alignment to a working Proof of Capability,
            executive deck, and 90-day expansion roadmap.
          </p>
          <div className="d-flex justify-content-center gap-3 flex-wrap">
            <a href="/#download-overview" className="btn btn-accent btn-lg">
              📥 Download Executive Overview
            </a>
            <Link to="/sponsorship" className="btn btn-outline-light btn-lg">
              🤝 Request Corporate Sponsorship Kit
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export default ProgramPage;
