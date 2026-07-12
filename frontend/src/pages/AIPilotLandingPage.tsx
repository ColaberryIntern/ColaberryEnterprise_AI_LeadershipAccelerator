import React, { useEffect, useState } from 'react';
import { initTracker } from '../utils/tracker';
import { captureUTMFromURL } from '../services/utmService';
import { captureCampaignFromURL } from '../services/campaignAttributionService';
import SEOHead from '../components/SEOHead';

// Standalone landing page for the SMB CEO "6-Week AI ROI Pilot" initiative.
// Targets owner-operators of 5-50 person, operations-heavy companies. Low-barrier
// paid pilot ($2,500, credited forward) that converts into a flexible retainer or
// revenue-share deal. Mirrors the AlumniChampionPage standalone pattern.

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

const PAINS = [
  { icon: '\u{1F4A1}', title: 'Ideas, no bandwidth', desc: 'You can see where AI would help, but your team is already maxed out running the business.' },
  { icon: '\u{1F4B8}', title: 'Big quotes scare you off', desc: 'Every agency wants a five-figure retainer before they prove a single dollar of value.' },
  { icon: '⏳', title: 'Stuck on legacy tools', desc: 'You are running on software that has not changed in years, and switching feels impossible.' },
  { icon: '\u{1F465}', title: 'Short-staffed', desc: 'You need leverage, not another hire. The work is there; the hands are not.' },
];

const PILOT_STEPS = [
  { week: 'Week 1', title: 'Discovery', desc: 'We map your operation and find the one workflow where AI returns the most money or time the fastest.' },
  { week: 'Weeks 2-4', title: 'Build', desc: 'We build a real, working system against that workflow. Not a slide deck. Production software you can use.' },
  { week: 'Week 5', title: 'Measure', desc: 'We put it in front of your team, measure the win against a baseline, and tune it.' },
  { week: 'Week 6', title: 'Roadmap', desc: 'You get a prioritized AI roadmap and a clear, flexible path to scale what works.' },
];

const CONTINUATION = [
  { title: 'Monthly retainer', desc: 'A predictable monthly fee to keep building and running your systems. Best when you have a backlog of ideas.' },
  { title: 'Revenue share', desc: 'A lower fixed fee plus a share of the revenue the system generates. We win when you win.' },
  { title: 'Pay per outcome', desc: 'A set fee for each result the system produces, like each new booked client. Pure performance.' },
];

function AIPilotLandingPage() {
  const [form, setForm] = useState({
    name: '',
    email: '',
    company: '',
    company_size: '',
    message: '',
    consent_contact: false,
  });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => {
    initTracker();
    captureUTMFromURL();
    captureCampaignFromURL();
  }, []);

  const update = <K extends keyof typeof form>(field: K, value: (typeof form)[K]) =>
    setForm((prev) => ({ ...prev, [field]: value }));

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.name || !form.email || !form.consent_contact) {
      setErrorMsg('Please add your name, work email, and check the consent box.');
      setStatus('error');
      return;
    }
    setStatus('submitting');
    setErrorMsg('');
    try {
      const res = await fetch('/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          company: form.company,
          company_size: form.company_size,
          message: form.message,
          consent_contact: form.consent_contact,
          source: 'ai-pilot',
          form_type: 'ai_pilot',
          interest_area: 'ai_roi_pilot',
          page_url: typeof window !== 'undefined' ? window.location.href : '',
        }),
      });
      if (!res.ok) throw new Error('Request failed');
      setStatus('success');
    } catch {
      setErrorMsg('Something went wrong. Please email ali@colaberry.com directly.');
      setStatus('error');
    }
  };

  return (
    <>
      <SEOHead
        title="The 6-Week AI ROI Pilot for Small-Business CEOs | Colaberry"
        description="You have the AI ideas. We build the first one that pays for itself, in 6 weeks, for $2,500 credited forward. A done-with-you AI pilot for CEOs of 5-50 person companies."
      />

      <div style={{ background: DARK.bg, color: DARK.text, minHeight: '100vh' }}>

        {/* Hero */}
        <section style={{ position: 'relative', padding: '5rem 0 4rem', overflow: 'hidden' }}>
          <div style={{ position: 'absolute', inset: 0, backgroundImage: 'url("/hero-bg-team.jpg")', backgroundSize: 'cover', backgroundPosition: 'center' }} />
          <div style={{ position: 'absolute', inset: 0, background: 'linear-gradient(135deg, rgba(15,18,25,0.90) 0%, rgba(26,35,50,0.86) 50%, rgba(26,54,93,0.90) 100%)' }} />
          <div className="container text-center" style={{ maxWidth: '820px', position: 'relative', zIndex: 1 }}>
            <div className="d-flex align-items-center justify-content-center gap-2 mb-4">
              <img src="/colaberry-icon.png" alt="" width="36" height="36" />
              <span className="fw-bold" style={{ color: '#fff', fontSize: '1.5rem' }}>Colaberry AI</span>
            </div>
            <h1 className="display-4 fw-bold mb-3" style={{ color: '#fff' }}>
              You have the AI ideas. We build the first one that pays for itself.
            </h1>
            <p className="lead mb-4" style={{ color: DARK.textMuted, fontSize: '1.25rem' }}>
              A done-with-you AI ROI Pilot for small-business CEOs. Six weeks. One real working system.
              <strong style={{ color: '#fff' }}> $2,500, credited toward whatever we build next.</strong>
            </p>
            <div className="d-flex justify-content-center gap-3 flex-wrap">
              <a href="#start" className="btn btn-lg fw-bold px-4" style={{ background: DARK.accent, color: DARK.bg, border: 'none' }}>
                Start your pilot
              </a>
              <a href="#how" className="btn btn-lg px-4" style={{ background: 'transparent', color: DARK.accent, border: `1px solid ${DARK.accent}` }}>
                See how it works
              </a>
            </div>
            <p className="mt-3 mb-0 small" style={{ color: DARK.textMuted }}>
              Built for owners of 5 to 50 person, operations-heavy companies.
            </p>
          </div>
        </section>

        {/* The problem */}
        <section style={{ padding: '4rem 0' }}>
          <div className="container" style={{ maxWidth: '960px' }}>
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>If this sounds like you, keep reading</h2>
            <p className="text-center mb-5" style={{ color: DARK.textMuted, maxWidth: '640px', margin: '0 auto' }}>
              Most CEOs we work with are not short on ideas. They are short on a low-risk way to prove one.
            </p>
            <div className="row g-4">
              {PAINS.map((p) => (
                <div className="col-md-6" key={p.title}>
                  <div className="h-100 p-4 rounded-3 d-flex gap-3" style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}>
                    <div className="fs-2" aria-hidden="true">{p.icon}</div>
                    <div>
                      <h3 className="h6 fw-bold mb-1" style={{ color: '#fff' }}>{p.title}</h3>
                      <p className="small mb-0" style={{ color: DARK.textMuted }}>{p.desc}</p>
                    </div>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* The pilot */}
        <section id="how" style={{ padding: '4rem 0', background: '#111827' }}>
          <div className="container" style={{ maxWidth: '960px' }}>
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>The 6-Week AI ROI Pilot</h2>
            <p className="text-center mb-5" style={{ color: DARK.textMuted, maxWidth: '680px', margin: '0 auto' }}>
              One flat fee. One real win. We start with the project most likely to return value, so you see what it is like
              to work with us before any bigger commitment.
            </p>
            <div className="row g-4">
              {PILOT_STEPS.map((s) => (
                <div className="col-md-6 col-lg-3" key={s.title}>
                  <div className="h-100 p-4 rounded-3" style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}>
                    <div className="small fw-bold mb-2" style={{ color: DARK.accent }}>{s.week}</div>
                    <h3 className="h6 fw-bold mb-2" style={{ color: '#fff' }}>{s.title}</h3>
                    <p className="small mb-0" style={{ color: DARK.textMuted }}>{s.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <div className="text-center mt-5">
              <div className="d-inline-block p-4 rounded-3" style={{ background: 'rgba(104,211,145,0.08)', border: '1px solid rgba(104,211,145,0.25)' }}>
                <span style={{ color: DARK.green, fontWeight: 700, fontSize: '1.6rem' }}>$2,500</span>
                <span style={{ color: DARK.text, marginLeft: 10 }}>for the full 6-week pilot.</span>
                <div className="small mt-1" style={{ color: DARK.textMuted }}>
                  100% credited toward your first months if you continue. If we cannot find a worthwhile win, we tell you up front.
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* Proof */}
        <section style={{ padding: '4rem 0' }}>
          <div className="container" style={{ maxWidth: '780px' }}>
            <h2 className="text-center fw-bold mb-4" style={{ color: '#fff' }}>This is not theory</h2>
            <div className="p-4 p-md-5 rounded-3" style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}>
              <p className="mb-3" style={{ color: DARK.text, fontSize: '1.05rem' }}>
                For a multi-market ground-transportation company, we built a production AI growth and quoting system in
                three months. It finds and contacts executive prospects across email, phone, and LinkedIn, and it reads
                inbound booking requests around the clock and prepares priced quotes in seconds against the company's
                real pricing rules.
              </p>
              <p className="mb-0" style={{ color: DARK.textMuted }}>
                Same team. Same method. We start small, prove the value, and scale only what works.
              </p>
            </div>
          </div>
        </section>

        {/* After the pilot */}
        <section style={{ padding: '4rem 0', background: '#111827' }}>
          <div className="container" style={{ maxWidth: '960px' }}>
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>After the pilot, you choose how to grow</h2>
            <p className="text-center mb-5" style={{ color: DARK.textMuted, maxWidth: '680px', margin: '0 auto' }}>
              No lock-in. We structure the next phase around how your business actually makes money. Pick one, or blend them.
            </p>
            <div className="row g-4">
              {CONTINUATION.map((c) => (
                <div className="col-md-4" key={c.title}>
                  <div className="h-100 p-4 rounded-3 text-center" style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}>
                    <h3 className="h5 fw-bold mb-2" style={{ color: DARK.accent }}>{c.title}</h3>
                    <p className="small mb-0" style={{ color: DARK.textMuted }}>{c.desc}</p>
                  </div>
                </div>
              ))}
            </div>
            <p className="text-center mt-4 mb-0" style={{ color: DARK.textMuted, fontStyle: 'italic' }}>
              You only scale spend when the system is already producing.
            </p>
          </div>
        </section>

        {/* Lead capture */}
        <section id="start" style={{ padding: '4rem 0' }}>
          <div className="container" style={{ maxWidth: '620px' }}>
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>Start your AI ROI Pilot</h2>
            <p className="text-center mb-4" style={{ color: DARK.textMuted }}>
              Tell us a little about your business. We will set up a 20-minute fit call to find your first win.
            </p>

            {status === 'success' ? (
              <div className="p-4 rounded-3 text-center" style={{ background: 'rgba(104,211,145,0.1)', border: '1px solid rgba(104,211,145,0.3)' }}>
                <div className="fs-1 mb-2" aria-hidden="true">{'✅'}</div>
                <h3 className="h5 fw-bold" style={{ color: '#fff' }}>You are in. Talk soon.</h3>
                <p className="mb-0" style={{ color: DARK.textMuted }}>
                  We will reach out within one business day to schedule your fit call. Need us sooner? Email ali@colaberry.com.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} className="p-4 rounded-3" style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}>
                <div className="mb-3">
                  <label className="form-label small fw-bold" style={{ color: DARK.text }}>Your name *</label>
                  <input type="text" className="form-control" value={form.name} onChange={(e) => update('name', e.target.value)} required />
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-bold" style={{ color: DARK.text }}>Work email *</label>
                  <input type="email" className="form-control" value={form.email} onChange={(e) => update('email', e.target.value)} required />
                </div>
                <div className="row g-3 mb-3">
                  <div className="col-md-7">
                    <label className="form-label small fw-bold" style={{ color: DARK.text }}>Company</label>
                    <input type="text" className="form-control" value={form.company} onChange={(e) => update('company', e.target.value)} />
                  </div>
                  <div className="col-md-5">
                    <label className="form-label small fw-bold" style={{ color: DARK.text }}>Team size</label>
                    <select className="form-select" value={form.company_size} onChange={(e) => update('company_size', e.target.value)}>
                      <option value="">Select</option>
                      <option value="1-10">1-10</option>
                      <option value="11-50">11-50</option>
                      <option value="51-200">51-200</option>
                      <option value="200+">200+</option>
                    </select>
                  </div>
                </div>
                <div className="mb-3">
                  <label className="form-label small fw-bold" style={{ color: DARK.text }}>What would you build first?</label>
                  <textarea className="form-control" rows={3} value={form.message} onChange={(e) => update('message', e.target.value)} placeholder="The workflow, idea, or bottleneck you would point AI at." />
                </div>
                <div className="form-check mb-3">
                  <input className="form-check-input" type="checkbox" id="consent" checked={form.consent_contact} onChange={(e) => update('consent_contact', e.target.checked)} />
                  <label className="form-check-label small" htmlFor="consent" style={{ color: DARK.textMuted }}>
                    I agree to be contacted by Colaberry about the AI ROI Pilot.
                  </label>
                </div>
                {status === 'error' && (
                  <div className="alert alert-danger py-2 small" role="alert">{errorMsg}</div>
                )}
                <button type="submit" className="btn btn-lg fw-bold w-100" style={{ background: DARK.accent, color: DARK.bg, border: 'none' }} disabled={status === 'submitting'}>
                  {status === 'submitting' ? 'Sending...' : 'Request my fit call'}
                </button>
              </form>
            )}
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
    </>
  );
}

export default AIPilotLandingPage;
