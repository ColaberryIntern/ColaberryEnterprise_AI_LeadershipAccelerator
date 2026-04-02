import React, { useEffect } from 'react';
import { initTracker } from '../utils/tracker';
import { captureUTMFromURL } from '../services/utmService';
import { captureCampaignFromURL } from '../services/campaignAttributionService';
import SEOHead from '../components/SEOHead';
import IndustryDemoGrid from '../components/IndustryDemoGrid';
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

const COMMISSION_TIERS = [
  { participants: '1', commission: '$250' },
  { participants: '4', commission: '$1,000' },
  { participants: '10', commission: '$2,500' },
  { participants: '20', commission: '$5,000' },
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
        title="Alumni AI Champion Program | Enroll or Earn $250 Per Participant"
        description="Enroll in the AI Leadership Accelerator or refer leaders and teams. Earn $250 per enrolled participant - including yourself if sponsored."
      />

      <div style={{ background: DARK.bg, color: DARK.text, minHeight: '100vh' }}>

        {/* ── Hero ── */}
        <section
          style={{
            position: 'relative',
            padding: '5rem 0 4rem',
            overflow: 'hidden',
          }}
        >
          {/* Background image */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              backgroundImage: 'url("/hero-bg-team.jpg")',
              backgroundSize: 'cover',
              backgroundPosition: 'center',
            }}
          />
          {/* Dark overlay for readability */}
          <div
            style={{
              position: 'absolute',
              inset: 0,
              background: `linear-gradient(135deg, rgba(15,18,25,0.88) 0%, rgba(26,35,50,0.85) 50%, rgba(26,54,93,0.88) 100%)`,
            }}
          />
          <div className="container text-center" style={{ maxWidth: '800px', position: 'relative', zIndex: 1 }}>
            <div className="d-flex align-items-center justify-content-center gap-2 mb-4">
              <img src="/colaberry-icon.png" alt="" width="36" height="36" />
              <span className="fw-bold" style={{ color: '#fff', fontSize: '1.5rem' }}>Colaberry Enterprise AI</span>
            </div>
            <h1 className="display-4 fw-bold mb-3" style={{ color: '#fff' }}>
              Become the AI Champion - Or Introduce One Inside Your Company
            </h1>
            <p className="lead mb-4" style={{ color: DARK.textMuted, fontSize: '1.25rem' }}>
              Enroll yourself, get sponsored by your company, or refer leaders and teams.
              Earn $250 for every participant who enrolls - including yourself if your company pays.
            </p>
            <div className="d-flex justify-content-center gap-3 flex-wrap">
              <a
                href="#how-it-works"
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
                Activate Referral Benefits
              </a>
              <a
                href="/pricing"
                className="btn btn-lg px-4"
                style={{ background: 'transparent', color: DARK.textMuted, border: `1px solid ${DARK.border}` }}
              >
                View Pricing
              </a>
            </div>
          </div>
        </section>

        {/* ── How This Opportunity Works ── */}
        <section id="how-it-works" style={{ padding: '4rem 0' }}>
          <div className="container" style={{ maxWidth: '900px' }}>
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>How This Opportunity Works</h2>
            <p className="text-center mb-5" style={{ color: DARK.textMuted, maxWidth: '650px', margin: '0 auto' }}>
              Two paths. No required order. You can do one, the other, or both.
            </p>
            <div className="row g-4">
              {/* Path 1 */}
              <div className="col-md-6">
                <div
                  className="h-100 p-4 rounded-3"
                  style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}
                >
                  <h3 className="h5 fw-bold mb-3" style={{ color: DARK.accent }}>Path 1 - Enroll Yourself</h3>
                  <div className="mb-3" style={{ background: 'rgba(59,130,246,0.08)', borderRadius: 8, padding: '10px 14px', border: '1px solid rgba(59,130,246,0.15)' }}>
                    <span style={{ color: DARK.accent, fontWeight: 700, fontSize: '1.1rem' }}>$4,500</span>
                    <span style={{ color: DARK.textMuted, fontSize: '0.85rem', marginLeft: 8 }}>per participant</span>
                    <a href="/pricing" target="_blank" rel="noopener noreferrer" style={{ color: DARK.accent, fontSize: '0.85rem', marginLeft: 12, textDecoration: 'underline' }}>View full pricing</a>
                  </div>
                  {[
                    'Join the AI Leadership Accelerator',
                    'Ask your company to sponsor you',
                    'Earn $250 if your company pays',
                    'Become the AI Champion inside your organization',
                  ].map((item) => (
                    <div key={item} className="d-flex align-items-start gap-2 py-2" style={{ borderBottom: `1px solid ${DARK.border}` }}>
                      <span style={{ color: DARK.green, fontSize: '1rem', lineHeight: '1.5' }}>{'\u2713'}</span>
                      <span style={{ color: DARK.text, fontSize: '0.95rem' }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
              {/* Path 2 */}
              <div className="col-md-6">
                <div
                  className="h-100 p-4 rounded-3"
                  style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}
                >
                  <h3 className="h5 fw-bold mb-3" style={{ color: DARK.accent }}>Path 2 - Refer Others</h3>
                  {[
                    'Refer your boss',
                    'Refer a leader or manager',
                    'Refer a team',
                    'Refer an entire department',
                    'Earn $250 per enrolled participant',
                  ].map((item) => (
                    <div key={item} className="d-flex align-items-start gap-2 py-2" style={{ borderBottom: `1px solid ${DARK.border}` }}>
                      <span style={{ color: DARK.green, fontSize: '1rem', lineHeight: '1.5' }}>{'\u2713'}</span>
                      <span style={{ color: DARK.text, fontSize: '0.95rem' }}>{item}</span>
                    </div>
                  ))}
                </div>
              </div>
            </div>
            <p className="text-center mt-4 mb-0" style={{ color: DARK.textMuted, fontStyle: 'italic' }}>
              There is no required order. You can enroll yourself, refer others, or do both.
            </p>
          </div>
        </section>

        {/* ── Commission Multiplier ── */}
        <section style={{ padding: '4rem 0', background: '#111827' }}>
          <div className="container" style={{ maxWidth: '800px' }}>
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>Your Commission Multiplies With Every Enrollment</h2>
            <p className="text-center mb-4" style={{ color: DARK.textMuted }}>
              You earn <strong style={{ color: DARK.green }}>$250 per enrolled participant</strong> - no cap.
            </p>

            {/* Commission table */}
            <div
              className="rounded-3 overflow-hidden mb-4"
              style={{ border: `1px solid ${DARK.border}` }}
            >
              <div
                className="d-flex fw-bold small"
                style={{ background: DARK.border, padding: '0.75rem 1.5rem' }}
              >
                <div style={{ flex: 1, color: DARK.textMuted }}>Participants Enrolled</div>
                <div style={{ flex: 1, textAlign: 'right', color: DARK.textMuted }}>Your Commission</div>
              </div>
              {COMMISSION_TIERS.map((tier, i) => (
                <div
                  key={tier.participants}
                  className="d-flex align-items-center"
                  style={{
                    padding: '0.75rem 1.5rem',
                    background: i === COMMISSION_TIERS.length - 1 ? 'rgba(104, 211, 145, 0.1)' : DARK.bgCard,
                    borderTop: `1px solid ${DARK.border}`,
                  }}
                >
                  <div style={{ flex: 1, color: DARK.text, fontWeight: 600 }}>{tier.participants}</div>
                  <div
                    style={{
                      flex: 1,
                      textAlign: 'right',
                      color: i === COMMISSION_TIERS.length - 1 ? DARK.green : DARK.accent,
                      fontWeight: 'bold',
                      fontSize: i === COMMISSION_TIERS.length - 1 ? '1.1rem' : '1rem',
                    }}
                  >
                    {tier.commission}
                  </div>
                </div>
              ))}
            </div>

            {/* Scenario examples */}
            <div
              className="p-4 rounded-3"
              style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}
            >
              <h3 className="h6 fw-bold mb-3" style={{ color: '#fff' }}>Real Scenarios</h3>
              <div className="mb-3 pb-3" style={{ borderBottom: `1px solid ${DARK.border}` }}>
                <p className="small mb-1" style={{ color: DARK.text }}>
                  <strong style={{ color: DARK.accent }}>Your company sponsors you + 3 teammates</strong>
                </p>
                <p className="small mb-0" style={{ color: DARK.textMuted }}>
                  4 enrollments = <strong style={{ color: DARK.green }}>$1,000</strong>
                </p>
              </div>
              <div>
                <p className="small mb-1" style={{ color: DARK.text }}>
                  <strong style={{ color: DARK.accent }}>A department enrolls 10 leaders</strong>
                </p>
                <p className="small mb-0" style={{ color: DARK.textMuted }}>
                  10 enrollments = <strong style={{ color: DARK.green }}>$2,500</strong>
                </p>
              </div>
            </div>
          </div>
        </section>

        {/* ── Use Your Position to Create Opportunity ── */}
        <section style={{ padding: '4rem 0' }}>
          <div className="container" style={{ maxWidth: '700px' }}>
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>Use Your Position to Create Opportunity</h2>
            <p className="text-center mb-4" style={{ color: DARK.textMuted }}>
              Whether you take the program yourself or refer it to others, you are positioned to drive AI transformation inside organizations.
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
                href="/program"
                target="_blank"
                rel="noopener noreferrer"
                className="btn fw-bold px-4"
                style={{ background: 'transparent', color: DARK.accent, border: `1px solid ${DARK.accent}` }}
              >
                See Program Structure
              </a>
            </div>
          </div>
        </section>

        {/* ── Who the AI Leadership Accelerator Is Designed For ── */}
        <section style={{ padding: '4rem 0', background: '#111827' }}>
          <div className="container" style={{ maxWidth: '700px' }}>
            <h2 className="text-center fw-bold mb-4" style={{ color: '#fff' }}>Who the AI Leadership Accelerator Is Designed For</h2>
            <div
              className="p-4 rounded-3"
              style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}
            >
              {[
                'Executives exploring AI strategy',
                'Directors leading digital transformation',
                'Managers building AI-capable teams',
                'Senior technical leaders bridging tech and strategy',
                'Internal AI champions driving adoption',
                'Innovation leaders evaluating enterprise AI',
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
            <p className="text-center mt-3 mb-0 small" style={{ color: DARK.textMuted }}>
              This is a leadership-focused enterprise AI execution program. Alumni can enroll or introduce it to leadership.
            </p>
          </div>
        </section>

        <div className="container" style={{ maxWidth: 900 }}>
          <IndustryDemoGrid trackContext="alumni" />
        </div>

        {/* ── What Participants Walk Away With (artifacts) ── */}
        <section style={{ padding: '4rem 0' }}>
          <div className="container">
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>What You'll Walk Away With</h2>
            <p className="text-center mb-5" style={{ color: DARK.textMuted, maxWidth: '650px', margin: '0 auto' }}>
              Every participant in the Enterprise AI Leadership Accelerator leaves with production-ready artifacts you can deploy immediately.
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

        {/* ── Earn $250 Per Enrolled Participant ── */}
        <section style={{ padding: '4rem 0', background: '#111827' }}>
          <div className="container">
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>
              Earn $250 Per Enrolled Participant
            </h2>
            <div className="text-center mb-5" style={{ maxWidth: '650px', margin: '0 auto' }}>
              <p className="mb-2" style={{ color: DARK.textMuted }}>You earn commission when:</p>
              <div className="d-flex flex-wrap justify-content-center gap-2 mb-3">
                {[
                  'You enroll and your company pays',
                  'A leader enrolls',
                  'A manager enrolls',
                  'A team enrolls',
                  'A department enrolls',
                ].map((item) => (
                  <span
                    key={item}
                    className="badge px-3 py-2"
                    style={{ background: 'rgba(104, 211, 145, 0.15)', color: DARK.green, fontSize: '0.85rem', fontWeight: 500 }}
                  >
                    {'\u2713'} {item}
                  </span>
                ))}
              </div>
              <p className="small mb-0" style={{ color: DARK.textMuted }}>
                Commission is calculated per enrolled participant. <strong style={{ color: DARK.green }}>No cap. No dependency.</strong>
              </p>
            </div>

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
                  desc: 'Monitor your referrals in real time. Earn $250 for every participant who enrolls through your referral.',
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
                  desc: "Submit a contact and we reach out mentioning that you\u2019ve taken Colaberry corporate training in the past. The personal touch drives results.",
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
              Enroll in the program or start earning by referring leaders and teams.
            </p>
            <div className="d-flex justify-content-center gap-3 flex-wrap">
              <a
                href="/enroll"
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
