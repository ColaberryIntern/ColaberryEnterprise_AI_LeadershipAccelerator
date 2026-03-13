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
        title="Become the AI Champion Inside Your Company"
        description="As a Colaberry graduate, champion AI transformation at your company. Refer leaders to the Enterprise AI Leadership Accelerator and earn $250 per enrollment."
      />

      <div style={{ background: DARK.bg, color: DARK.text, minHeight: '100vh' }}>

        {/* Hero */}
        <section
          style={{
            background: `linear-gradient(135deg, ${DARK.bg} 0%, #1a2332 50%, ${DARK.navy} 100%)`,
            padding: '5rem 0 4rem',
          }}
        >
          <div className="container text-center" style={{ maxWidth: '800px' }}>
            <img src="/colaberry-icon.png" alt="" width="56" height="56" className="mb-4" style={{ filter: 'brightness(1.2)' }} />
            <h1 className="display-4 fw-bold mb-3" style={{ color: '#fff' }}>
              Become the AI Champion Inside Your Company
            </h1>
            <p className="lead mb-4" style={{ color: DARK.textMuted, fontSize: '1.25rem' }}>
              As a Colaberry graduate, you're uniquely positioned to champion AI transformation in your organization. Refer corporate leaders to our Enterprise AI Leadership Accelerator and earn $250 per successful enrollment.
            </p>
            <div className="d-flex justify-content-center gap-3 flex-wrap">
              <a
                href="/referrals/login"
                className="btn btn-lg fw-bold px-4"
                style={{ background: DARK.accent, color: DARK.bg, border: 'none' }}
              >
                Activate My Referral Account
              </a>
            </div>
          </div>
        </section>

        {/* How It Works */}
        <section style={{ padding: '4rem 0' }}>
          <div className="container">
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>How It Works</h2>
            <p className="text-center mb-5" style={{ color: DARK.textMuted }}>
              Three simple steps to start earning.
            </p>
            <div className="row g-4">
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
          </div>
        </section>

        {/* Three Referral Paths */}
        <section style={{ padding: '4rem 0' }}>
          <div className="container">
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>Earn $250 Per Referral</h2>
            <p className="text-center mb-5" style={{ color: DARK.textMuted, maxWidth: '600px', margin: '0 auto' }}>
              Know a company that could benefit from enterprise AI training? Refer them and earn a commission for every successful enrollment.
            </p>
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
                Activate My Alumni Referral Account
              </a>
            </div>
          </div>
        </section>

        {/* What the Program Offers (artifacts) */}
        <section style={{ padding: '4rem 0', background: '#111827' }}>
          <div className="container">
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>What Your Referrals Will Walk Away With</h2>
            <p className="text-center mb-5" style={{ color: DARK.textMuted, maxWidth: '650px', margin: '0 auto' }}>
              Every participant in the Enterprise AI Leadership Accelerator leaves with production-ready artifacts — not slide decks.
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

        {/* CTA */}
        <section style={{ padding: '4rem 0' }}>
          <div className="container text-center" style={{ maxWidth: '600px' }}>
            <h2 className="fw-bold mb-3" style={{ color: '#fff' }}>Ready to Start Earning?</h2>
            <p className="mb-4" style={{ color: DARK.textMuted }}>
              Activate your alumni referral account in seconds. Just log in with your Colaberry email — no forms, no hassle.
            </p>
            <a
              href="/referrals/login"
              className="btn btn-lg fw-bold px-5"
              style={{ background: DARK.accent, color: DARK.bg, border: 'none' }}
            >
              Activate My Referral Account
            </a>
          </div>
        </section>

        {/* Footer */}
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
