import React, { useState } from 'react';
import SEOHead from '../components/SEOHead';
import StrategyCallModal from '../components/StrategyCallModal';
import { PROGRAM_SCHEDULE } from '../config/programSchedule';

function InstructorPage() {
  const [showBooking, setShowBooking] = useState(false);

  return (
    <>
      <SEOHead
        title="Your Instructor — Ali Muwwakkil | Colaberry Enterprise AI"
        description="Meet Ali Muwwakkil, Managing Director of Colaberry Enterprise AI. Learn about the instructor behind the Enterprise AI Leadership Accelerator."
      />

      {/* Hero */}
      <section
        className="text-center"
        style={{
          background: 'linear-gradient(rgba(15, 23, 42, 0.85), rgba(15, 23, 42, 0.9)), url("https://images.unsplash.com/photo-1551434678-e076c223a692?auto=format&fit=crop&w=1920&q=80") center/cover no-repeat',
          color: '#fff',
          padding: '5rem 1.5rem 4rem',
        }}
      >
        <div className="container" style={{ maxWidth: 700 }}>
          <div className="mx-auto mb-4" style={{ width: 120, height: 120, borderRadius: '50%', background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 48, fontWeight: 700 }}>
            AM
          </div>
          <h1 className="fw-bold mb-2" style={{ fontSize: 'clamp(28px, 5vw, 42px)' }}>Ali Muwwakkil</h1>
          <p className="mb-1" style={{ fontSize: 18, color: '#93c5fd' }}>Managing Director, Colaberry Enterprise AI</p>
          <p className="mb-4" style={{ fontSize: 15, color: '#94a3b8' }}>Instructor & AI System Architect</p>
          <button
            className="btn btn-lg text-white fw-semibold"
            onClick={() => setShowBooking(true)}
            style={{ background: 'linear-gradient(135deg, #3b82f6, #8b5cf6)', border: 'none', borderRadius: 8, padding: '14px 36px', fontSize: 17 }}
          >
            Book a Strategy Call with Ali
          </button>
        </div>
      </section>

      {/* Bio */}
      <section className="section">
        <div className="container" style={{ maxWidth: 800 }}>
          <h2 className="fw-bold mb-4" style={{ color: 'var(--color-primary)', fontSize: 28 }}>About Ali</h2>
          <div style={{ fontSize: 15, lineHeight: 1.8, color: 'var(--color-text)' }}>
            <p>
              Ali Muwwakkil leads Colaberry's Enterprise AI division, where he works directly with directors, VPs, and CTOs
              to design, build, and deploy production AI systems inside their organizations. He's not a theorist teaching
              frameworks — he's an operator who builds systems that run in production.
            </p>
            <p>
              His approach is simple: every participant in the Accelerator leaves with a working system, not a slide deck.
              The {PROGRAM_SCHEDULE.totalWeeks}-week program is structured around real deployment — from architecture design
              on day one to a production-ready AI system by the final session.
            </p>
            <p>
              Ali personally leads every cohort, provides direct feedback on system architecture decisions, and stays
              involved through post-deployment support. When you book a strategy call, you're talking to the person
              who will guide your build — not a sales rep.
            </p>
          </div>
        </div>
      </section>

      {/* What Makes This Different */}
      <section className="section-alt">
        <div className="container" style={{ maxWidth: 900 }}>
          <h2 className="text-center fw-bold mb-5" style={{ color: 'var(--color-primary)', fontSize: 28 }}>What Makes This Different</h2>
          <div className="row g-4">
            {[
              {
                icon: '\u{1F6E0}\uFE0F',
                title: 'Builder, Not Lecturer',
                desc: 'Ali has designed and deployed multi-agent AI systems across healthcare, finance, logistics, manufacturing, and professional services. The Accelerator teaches what he builds.',
              },
              {
                icon: '\u{1F3AF}',
                title: 'Production Focus',
                desc: 'Every session is oriented toward deployment. Architecture patterns, agent design, orchestration, validation, and governance — the things that matter when a system needs to work.',
              },
              {
                icon: '\u{1F91D}',
                title: 'Direct Access',
                desc: 'Ali leads every cohort personally. Architecture reviews, system design feedback, and deployment support come directly from the person who designed the program.',
              },
              {
                icon: '\u26A1',
                title: 'Speed to Production',
                desc: `${PROGRAM_SCHEDULE.totalWeeks} weeks from first session to production deployment. Participants don't study AI — they ship AI systems that run their business operations.`,
              },
            ].map((item, i) => (
              <div key={i} className="col-md-6">
                <div className="card border-0 shadow-sm h-100" style={{ borderRadius: 12 }}>
                  <div className="card-body p-4">
                    <div style={{ fontSize: 32, marginBottom: 8 }}>{item.icon}</div>
                    <h5 className="fw-bold" style={{ color: 'var(--color-primary)', fontSize: 18 }}>{item.title}</h5>
                    <p className="text-muted mb-0" style={{ fontSize: 14, lineHeight: 1.7 }}>{item.desc}</p>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Areas of Expertise */}
      <section className="section">
        <div className="container" style={{ maxWidth: 800 }}>
          <h2 className="text-center fw-bold mb-4" style={{ color: 'var(--color-primary)', fontSize: 28 }}>Areas of Expertise</h2>
          <div className="row g-3">
            {[
              'Multi-Agent AI System Architecture',
              'Enterprise AI Strategy & Governance',
              'Production LLM Deployment',
              'AI-Driven Business Operations',
              'Intelligent Automation & Orchestration',
              'Data Pipeline Architecture (Azure, AWS)',
              'Executive AI Readiness Assessment',
              'AI Workforce Design & ROI Modeling',
            ].map((skill, i) => (
              <div key={i} className="col-md-6">
                <div className="d-flex align-items-center gap-2 p-3" style={{ background: 'var(--color-bg-alt)', borderRadius: 8, border: '1px solid var(--color-border)' }}>
                  <i className="bi bi-check-circle-fill" style={{ color: 'var(--color-accent)' }} />
                  <span style={{ fontSize: 14, fontWeight: 500 }}>{skill}</span>
                </div>
              </div>
            ))}
          </div>
        </div>
      </section>

      {/* Industries */}
      <section className="section-alt">
        <div className="container" style={{ maxWidth: 800 }}>
          <h2 className="text-center fw-bold mb-4" style={{ color: 'var(--color-primary)', fontSize: 28 }}>Industries Served</h2>
          <p className="text-center text-muted mb-4" style={{ fontSize: 15 }}>
            Ali has designed and deployed AI systems across a range of industries, each with unique regulatory,
            operational, and data requirements.
          </p>
          <div className="d-flex flex-wrap justify-content-center gap-2">
            {[
              'Healthcare & Life Sciences',
              'Financial Services',
              'Manufacturing',
              'Logistics & Supply Chain',
              'Professional Services',
              'Retail & E-Commerce',
              'Energy & Utilities',
              'Government & Public Sector',
              'Insurance',
              'Education & Training',
              'Real Estate',
              'Technology & SaaS',
            ].map((ind, i) => (
              <span key={i} className="badge bg-light text-dark border px-3 py-2" style={{ fontSize: 13 }}>{ind}</span>
            ))}
          </div>
        </div>
      </section>

      {/* The Program */}
      <section className="section">
        <div className="container" style={{ maxWidth: 800 }}>
          <h2 className="text-center fw-bold mb-4" style={{ color: 'var(--color-primary)', fontSize: 28 }}>The Program Ali Leads</h2>
          <div className="card border-0 shadow" style={{ borderRadius: 12, overflow: 'hidden' }}>
            <div className="card-header text-white text-center fw-bold py-3" style={{ background: 'linear-gradient(135deg, #1a365d 0%, #2b6cb0 100%)', fontSize: 18 }}>
              Enterprise AI Leadership Accelerator
            </div>
            <div className="card-body p-4">
              <div className="row g-4 text-center mb-4">
                <div className="col-4">
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-primary)' }}>{PROGRAM_SCHEDULE.totalWeeks}</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>Weeks</div>
                </div>
                <div className="col-4">
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-primary)' }}>{PROGRAM_SCHEDULE.totalSessions}</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>Sessions</div>
                </div>
                <div className="col-4">
                  <div style={{ fontSize: 28, fontWeight: 800, color: 'var(--color-accent)' }}>1</div>
                  <div className="text-muted" style={{ fontSize: 12 }}>Production System</div>
                </div>
              </div>
              <h5 className="fw-bold mb-3" style={{ color: 'var(--color-primary)', fontSize: 16 }}>What You Deploy</h5>
              <ul className="list-unstyled">
                {[
                  'A working multi-agent AI system tailored to your business',
                  'Production-grade architecture with governance controls',
                  'Executive-ready ROI analysis and 90-day roadmap',
                  'Internal AI capability your team owns and operates',
                  'Post-deployment support and peer cohort access',
                ].map((item, i) => (
                  <li key={i} className="d-flex align-items-start gap-2 mb-2" style={{ fontSize: 14 }}>
                    <i className="bi bi-check-circle-fill flex-shrink-0" style={{ color: 'var(--color-accent)', marginTop: 3 }} />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          </div>
        </div>
      </section>

      {/* CTA */}
      <section
        className="text-light text-center"
        style={{
          background: 'linear-gradient(135deg, #0f1b2d 0%, #1a365d 50%, #1e3a5f 100%)',
          padding: '5rem 1.5rem',
        }}
      >
        <div style={{ maxWidth: 600, margin: '0 auto' }}>
          <h2 className="text-white fw-bold mb-3" style={{ fontSize: 28 }}>Talk to Ali Directly</h2>
          <p className="mb-4" style={{ color: 'rgba(255,255,255,0.75)', fontSize: 15 }}>
            Book a 30-minute strategy call. Ali will walk through your specific situation, map your AI system,
            and show you exactly what it would take to deploy.
          </p>
          <button
            className="btn btn-light btn-lg fw-bold px-5"
            onClick={() => setShowBooking(true)}
            style={{ borderRadius: 8, fontSize: 18 }}
          >
            <i className="bi bi-calendar-check me-2" />Book a Strategy Call
          </button>
          <p className="mt-3" style={{ color: 'rgba(255,255,255,0.5)', fontSize: 13 }}>
            Free. No obligations. You'll talk to Ali, not a sales rep.
          </p>
        </div>
      </section>

      <StrategyCallModal
        show={showBooking}
        onClose={() => setShowBooking(false)}
        pageOrigin="/ai-architect/instructor"
      />
    </>
  );
}

export default InstructorPage;
