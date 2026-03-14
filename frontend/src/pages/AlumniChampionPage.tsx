import React, { useEffect } from 'react';
import { initTracker } from '../utils/tracker';
import { captureUTMFromURL } from '../services/utmService';
import { captureCampaignFromURL } from '../services/campaignAttributionService';
import SEOHead from '../components/SEOHead';
import MayaChatWidget from '../components/MayaChatWidget';

const DARK = {
  bg: '#0f1219',
  bgCard: '#1a1f2e',
  border: '#2d3748',
  text: '#e2e8f0',
  textMuted: '#a0aec0',
  accent: '#90cdf4',
  green: '#68d391',
  navy: '#1a365d',
};

const ARTIFACTS = [
  { icon: '\u{1F4CA}', title: 'AI Readiness Assessment', desc: "Evaluate your organization's AI deployment readiness across 6 dimensions" },
  { icon: '\u{1F5FA}\uFE0F', title: 'Enterprise AI Roadmap', desc: 'A 90-day prioritized deployment plan tailored to your organization' },
  { icon: '\u{1F6E1}\uFE0F', title: 'Governance Framework', desc: 'Enterprise AI governance policies, risk controls, and compliance templates' },
  { icon: '\u26A1', title: 'Claude Code Execution Blueprint', desc: 'Production-ready AI coding workflows with security and audit controls' },
  { icon: '\u{1F680}', title: '90-Day Deployment Plan', desc: 'Week-by-week execution milestones with resource allocation and KPIs' },
];

function AlumniChampionPage() {
  useEffect(() => {
    initTracker();
    captureUTMFromURL();
    captureCampaignFromURL();
  }, []);

  return (
    <>
      <SEOHead
        title="Alumni AI Champion Program | Learn Enterprise AI & Earn Referral Income"
        description="Advance your career with enterprise AI leadership skills. Learn how to deploy AI inside companies — and earn $250 per enrollment when you introduce it."
      />

      <div style={{ background: DARK.bg, color: DARK.text, minHeight: '100vh' }}>

        {/* ── Hero ── */}
        <section
          style={{
            background: `linear-gradient(135deg, ${DARK.bg} 0%, #1a2332 50%, ${DARK.navy} 100%)`,
            padding: '5rem 0 4rem',
          }}
        >
          <div className="container text-center" style={{ maxWidth: '800px' }}>
            <img src="/colaberry-logo.png" alt="Colaberry" height="48" className="mb-4" style={{ filter: 'brightness(1.2)' }} />
            <h1 className="display-4 fw-bold mb-3" style={{ color: '#fff' }}>
              Become the AI Champion &mdash; And Lead AI Inside Your Company
            </h1>
            <p className="lead mb-4" style={{ color: DARK.textMuted, fontSize: '1.25rem' }}>
              Advance your career with enterprise-level AI execution skills.
              Then introduce the program to your organization and earn $250 per enrollment.
            </p>
            <div className="d-flex justify-content-center gap-3 flex-wrap">
              <a
                href="#why-alumni"
                className="btn btn-lg fw-bold px-4"
                style={{ background: DARK.accent, color: DARK.bg, border: 'none' }}
              >
                Start Your AI Champion Journey
              </a>
              <a
                href="/referrals/login"
                className="btn btn-lg px-4"
                style={{ background: 'transparent', color: DARK.accent, border: `1px solid ${DARK.accent}` }}
              >
                Already Enrolled? Activate Referral Benefits
              </a>
            </div>
          </div>
        </section>

        {/* ── Why This Program Is Built for Alumni ── */}
        <section id="why-alumni" style={{ padding: '4rem 0' }}>
          <div className="container">
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>Why This Program Is Built for Alumni</h2>
            <p className="text-center mb-5" style={{ color: DARK.textMuted, maxWidth: '650px', margin: '0 auto' }}>
              You already have the technical foundation. This program gives you the enterprise-level AI strategy skills to lead transformation inside any organization.
            </p>
            <div className="row g-4">
              {[
                {
                  icon: '\u{1F4C8}',
                  title: 'Enterprise AI Strategy Skills',
                  desc: 'Learn how organizations evaluate ROI, governance, and AI execution roadmaps.',
                },
                {
                  icon: '\u{1F9E0}',
                  title: 'Executive-Level Thinking',
                  desc: 'Understand AI from the leadership perspective \u2014 not just technical.',
                },
                {
                  icon: '\u{1F3AF}',
                  title: 'AI Execution Blueprint',
                  desc: 'Gain a structured model for deploying AI inside real companies.',
                },
                {
                  icon: '\u{1F680}',
                  title: 'Career Acceleration',
                  desc: 'Position yourself as the internal AI transformation leader.',
                },
              ].map((card) => (
                <div className="col-md-6 col-lg-3" key={card.title}>
                  <div
                    className="h-100 p-4 rounded-3 text-center"
                    style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}
                  >
                    <div className="fs-1 mb-3" aria-hidden="true">{card.icon}</div>
                    <h3 className="h5 fw-bold" style={{ color: '#fff' }}>{card.title}</h3>
                    <p className="small mb-0" style={{ color: DARK.textMuted }}>{card.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center mt-4">
              <a
                href="/"
                className="btn fw-bold px-4"
                style={{ background: DARK.accent, color: DARK.bg, border: 'none' }}
              >
                View Program Curriculum
              </a>
            </div>
          </div>
        </section>

        {/* ── Who This Program Is For ── */}
        <section style={{ padding: '4rem 0', background: '#111827' }}>
          <div className="container" style={{ maxWidth: '700px' }}>
            <h2 className="text-center fw-bold mb-4" style={{ color: '#fff' }}>Who This Program Is For</h2>
            <div
              className="p-4 rounded-3"
              style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}
            >
              {[
                'Alumni ready to move into leadership roles',
                'Technical professionals who want executive AI fluency',
                'Managers exploring AI strategy for their teams',
                'Consultants wanting enterprise AI frameworks',
                'Professionals who want to champion AI internally',
              ].map((item) => (
                <div
                  key={item}
                  className="d-flex align-items-start gap-3 py-2"
                  style={{ borderBottom: `1px solid ${DARK.border}` }}
                >
                  <span style={{ color: DARK.green, fontSize: '1.1rem', lineHeight: '1.5' }}>{'\u2713'}</span>
                  <span style={{ color: DARK.text }}>{item}</span>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Turn Your Learning Into Influence ── */}
        <section style={{ padding: '4rem 0' }}>
          <div className="container" style={{ maxWidth: '700px' }}>
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>Turn Your Learning Into Influence</h2>
            <p className="text-center mb-4" style={{ color: DARK.textMuted }}>
              After completing the program, you'll be equipped to:
            </p>
            <div className="row g-3">
              {[
                'Present AI opportunities to leadership',
                'Identify high-ROI automation areas',
                'Propose governance frameworks',
                'Guide enterprise AI adoption',
              ].map((item) => (
                <div className="col-md-6" key={item}>
                  <div
                    className="p-3 rounded-3 d-flex align-items-center gap-3"
                    style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}
                  >
                    <span style={{ color: DARK.accent, fontSize: '1.25rem' }}>{'\u2192'}</span>
                    <span style={{ color: DARK.text }}>{item}</span>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center mt-4">
              <a
                href="/"
                className="btn fw-bold px-4"
                style={{ background: 'transparent', color: DARK.accent, border: `1px solid ${DARK.accent}` }}
              >
                See Program Structure
              </a>
            </div>
          </div>
        </section>

        {/* ── If You Want To… Comparison ── */}
        <section style={{ padding: '4rem 0', background: '#111827' }}>
          <div className="container" style={{ maxWidth: '800px' }}>
            <h2 className="text-center fw-bold mb-4" style={{ color: '#fff' }}>If You Want To&hellip;</h2>
            <div className="row g-0">
              {/* Left column */}
              <div className="col-md-6">
                <div className="p-4" style={{ borderRight: '1px solid ' + DARK.border }}>
                  <h3 className="h6 fw-bold mb-3" style={{ color: DARK.accent }}>You Want</h3>
                  {[
                    'AI strategy skills',
                    'Influence in your organization',
                    'Career growth',
                    'Additional income',
                  ].map((item) => (
                    <div key={item} className="d-flex align-items-center gap-2 py-2" style={{ borderBottom: `1px solid ${DARK.border}` }}>
                      <span style={{ color: DARK.textMuted }}>{'\u25CB'}</span>
                      <span style={{ color: DARK.text }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Right column */}
              <div className="col-md-6">
                <div className="p-4">
                  <h3 className="h6 fw-bold mb-3" style={{ color: DARK.green }}>You Get</h3>
                  {[
                    'Build enterprise AI strategy',
                    'Present AI initiatives to leadership',
                    'Become the AI Champion',
                    'Earn through internal referrals',
                  ].map((item) => (
                    <div key={item} className="d-flex align-items-center gap-2 py-2" style={{ borderBottom: `1px solid ${DARK.border}` }}>
                      <span style={{ color: DARK.green }}>{'\u2713'}</span>
                      <span style={{ color: DARK.text }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* ── What Participants Walk Away With (artifacts) ── */}
        <section style={{ padding: '4rem 0' }}>
          <div className="container">
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>What You'll Walk Away With</h2>
            <p className="text-center mb-5" style={{ color: DARK.textMuted, maxWidth: '650px', margin: '0 auto' }}>
              Every participant in the Enterprise AI Leadership Accelerator leaves with production-ready artifacts &mdash; not slide decks.
            </p>
            <div className="row g-4 justify-content-center">
              {ARTIFACTS.map((item) => (
                <div className="col-6 col-lg-4" key={item.title}>
                  <div
                    className="h-100 text-center p-4 rounded-3"
                    style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}
                  >
                    <div className="fs-1 mb-3" aria-hidden="true">{item.icon}</div>
                    <h3 className="h6 fw-bold" style={{ color: '#fff' }}>{item.title}</h3>
                    <p className="small mb-0" style={{ color: DARK.textMuted }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* ── Referral Opportunity ── */}
        <section style={{ padding: '4rem 0', background: '#111827' }}>
          <div className="container">
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>
              Earn $250 When You Introduce It to Your Organization
            </h2>
            <p className="text-center mb-5" style={{ color: DARK.textMuted, maxWidth: '650px', margin: '0 auto' }}>
              Once you're part of the program, you can introduce it to other leaders inside your company or network.
              Earn a commission for every successful enrollment.
            </p>

            {/* How It Works */}
            <div className="row g-4 mb-5">
              {[
                {
                  step: '1',
                  title: 'Activate Your Account',
                  desc: 'Log in with the email you used at Colaberry. We verify you in our alumni database and set up your referral dashboard.',
                },
                {
                  step: '2',
                  title: 'Submit Referrals',
                  desc: 'Add corporate contacts who could benefit from AI leadership training. Choose from three referral paths below.',
                },
                {
                  step: '3',
                  title: 'Track & Earn',
                  desc: 'Monitor your referrals in real time. Earn $250 for every leader who enrolls through your referral.',
                },
              ].map((item) => (
                <div className="col-md-4" key={item.step}>
                  <div
                    className="h-100 p-4 rounded-3 text-center"
                    style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}
                  >
                    <div
                      className="d-inline-flex align-items-center justify-content-center rounded-circle mb-3"
                      style={{ width: 48, height: 48, background: DARK.accent, color: DARK.bg, fontWeight: 'bold', fontSize: '1.25rem' }}
                    >
                      {item.step}
                    </div>
                    <h3 className="h5 fw-bold" style={{ color: '#fff' }}>{item.title}</h3>
                    <p className="small mb-0" style={{ color: DARK.textMuted }}>{item.desc}</p>
                  </div>
                </div>
              ))}
            </div>

            {/* Three Referral Paths */}
            <div className="row g-4">
              {[
                {
                  icon: '\u{1F3E2}',
                  title: 'Corporate Sponsor',
                  desc: 'Introduce the program to your company leadership. Add your referral contact, then download a sponsor kit to share internally.',
                },
                {
                  icon: '\u{1F91D}',
                  title: 'Introduced Referral',
                  desc: 'Submit a contact and we reach out mentioning your name and Colaberry experience. The personal touch drives results.',
                },
                {
                  icon: '\u{1F575}\uFE0F',
                  title: 'Anonymous Referral',
                  desc: 'Submit a company lead anonymously. They enter our standard corporate outreach \u2014 your name is never mentioned.',
                },
              ].map((path) => (
                <div className="col-md-4" key={path.title}>
                  <div
                    className="h-100 p-4 rounded-3 text-center"
                    style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}
                  >
                    <div className="fs-1 mb-3" aria-hidden="true">{path.icon}</div>
                    <h3 className="h5 fw-bold" style={{ color: DARK.accent }}>{path.title}</h3>
                    <p className="small mb-0" style={{ color: DARK.textMuted }}>{path.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center mt-4">
              <a
                href="/referrals/login"
                className="btn fw-bold px-4"
                style={{ background: DARK.accent, color: DARK.bg, border: 'none' }}
              >
                Activate Referral Account
              </a>
            </div>
          </div>
        </section>

        {/* ── Final Dual CTA ── */}
        <section style={{ padding: '4rem 0' }}>
          <div className="container text-center" style={{ maxWidth: '650px' }}>
            <h2 className="fw-bold mb-3" style={{ color: '#fff' }}>Ready to Lead AI at Your Organization?</h2>
            <p className="mb-4" style={{ color: DARK.textMuted }}>
              Build the skills to champion AI transformation &mdash; and earn when you spread the word.
            </p>
            <div className="d-flex justify-content-center gap-3 flex-wrap">
              <a
                href="/"
                className="btn btn-lg fw-bold px-4"
                style={{ background: DARK.accent, color: DARK.bg, border: 'none' }}
              >
                Enroll in the AI Leadership Accelerator
              </a>
              <a
                href="/referrals/login"
                className="btn btn-lg px-4"
                style={{ background: 'transparent', color: DARK.accent, border: `1px solid ${DARK.accent}` }}
              >
                Activate Referral Account
              </a>
            </div>
          </div>
        </section>

        {/* ── Footer ── */}
        <footer className="text-center py-4" style={{ borderTop: `1px solid ${DARK.border}` }}>
          <img src="/colaberry-icon.png" alt="" width="28" height="28" className="mb-2" style={{ filter: 'brightness(1.2)', opacity: 0.7 }} />
          <p className="small mb-0" style={{ color: DARK.textMuted }}>
            &copy; {new Date().getFullYear()} Colaberry Inc. All rights reserved.
          </p>
        </footer>
      </div>

      <MayaChatWidget />
    </>
  );
}

export default AlumniChampionPage;
