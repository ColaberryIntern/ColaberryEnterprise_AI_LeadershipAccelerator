import React, { useEffect, useState } from 'react';
import { initTracker } from '../utils/tracker';
import { captureUTMFromURL } from '../services/utmService';
import { captureCampaignFromURL } from '../services/campaignAttributionService';
import SEOHead from '../components/SEOHead';

// Config-driven vertical variants of the AI ROI Pilot landing page. One component,
// many verticals (DRY). Each variant has its own URL and lead attribution
// (source / form_type = variant.slug) so we can compare conversion by vertical.
// The offer (6-week pilot, $2,500, continuation ladder, form) is shared; only the
// hero, pains, "what we'd build", and proof are vertical-specific.

const DARK = {
  bg: '#0f1219', bgCard: '#1a1f2e', border: '#2d3748', text: '#e2e8f0',
  textMuted: '#a0aec0', accent: '#90cdf4', green: '#68d391',
};

type Pain = { icon: string; title: string; desc: string };
type Variant = {
  slug: string; seoTitle: string; seoDesc: string;
  hero: string; sub: string; audience: string;
  pains: Pain[]; builds: string[]; proof: string;
};

const VARIANTS: Record<string, Variant> = {
  transport: {
    slug: 'ai-pilot-transport',
    seoTitle: 'AI ROI Pilot for Transportation & Logistics | Colaberry',
    seoDesc: 'A 6-week AI pilot for transportation and logistics owners. Auto-quote loads, catch after-hours bookings, $2,500 credited forward.',
    hero: 'Your quoting and dispatch should not depend on you being awake.',
    sub: 'A done-with-you AI pilot for transportation and logistics owners. Six weeks, one real working system.',
    audience: 'Built for owners of 5 to 50 person transportation, logistics, courier, and delivery companies.',
    pains: [
      { icon: '\u{1F4B8}', title: 'Quoting eats your day', desc: 'Every trip or load gets priced by hand, and it pulls you and your team off the road.' },
      { icon: '⏳', title: 'After-hours requests go cold', desc: 'A booking email at 9pm sits until morning, and by then the customer booked someone else.' },
      { icon: '\u{1F5C2}️', title: 'Stuck on dated software', desc: 'Your booking and dispatch tools have not changed in years and switching feels impossible.' },
      { icon: '\u{1F465}', title: 'Short-staffed dispatch', desc: 'You need leverage on the phones and the inbox, not another hire.' },
    ],
    builds: [
      'Auto-price inbound trip and load requests in seconds against your real rate card.',
      'Catch and answer after-hours booking requests so none go cold.',
      'Surface the highest-value leads to call first.',
    ],
    proof: 'For a multi-market ground-transportation company we built a production AI system in three months that finds and contacts prospects across email and phone, and reads inbound booking requests around the clock to prepare priced quotes in seconds against their real pricing rules.',
  },
  construction: {
    slug: 'ai-pilot-construction',
    seoTitle: 'AI ROI Pilot for Construction & Trades | Colaberry',
    seoDesc: 'A 6-week AI pilot for construction and trades owners. Draft estimates from RFQs, auto-follow-up on bids, $2,500 credited forward.',
    hero: 'Win more bids without hiring an estimator.',
    sub: 'A done-with-you AI pilot for construction and trades owners. Six weeks, one real working system.',
    audience: 'Built for owners of 5 to 50 person construction, contracting, manufacturing, and trades businesses.',
    pains: [
      { icon: '\u{1F319}', title: 'Estimating eats your nights', desc: 'Bids and takeoffs get done after hours because there is no time during the day.' },
      { icon: '\u{1F4E5}', title: 'RFQs pile up', desc: 'Quote requests sit in the inbox and the slow response costs you the job.' },
      { icon: '\u{1F4DE}', title: 'Follow-up slips', desc: 'Open bids go quiet because nobody has time to chase them.' },
      { icon: '\u{1F5D3}️', title: 'Crews and schedules by hand', desc: 'Coordinating jobs and people runs on your head and a spreadsheet.' },
    ],
    builds: [
      'Draft first-pass estimates from inbound RFQs against your pricing.',
      'Auto-follow-up on open bids so none go cold.',
      'Turn plan sets and emails into structured job info in seconds.',
    ],
    proof: 'For a multi-market operations business we built a production AI system in three months that reads inbound requests around the clock and prepares priced quotes in seconds against the company real pricing rules, while finding and contacting new prospects across email and phone.',
  },
  care: {
    slug: 'ai-pilot-care',
    seoTitle: 'AI ROI Pilot for Clinics & Care Providers | Colaberry',
    seoDesc: 'A 6-week AI pilot for clinics, therapy practices, and senior care. Handle intake and scheduling around the clock, $2,500 credited forward.',
    hero: 'Free your front desk from the phones.',
    sub: 'A done-with-you AI pilot for clinics and care providers. Six weeks, one real working system.',
    audience: 'Built for owners of 5 to 50 person clinics, therapy practices, senior care, and health services.',
    pains: [
      { icon: '\u{1F4DE}', title: 'Intake and scheduling overload', desc: 'The phones and the inbox eat your team before they get to care.' },
      { icon: '\u{1F4DE}', title: 'Missed calls are lost patients', desc: 'Every unanswered call is a family that calls the next provider.' },
      { icon: '\u{1F501}', title: 'Repetitive questions', desc: 'Staff answer the same insurance, hours, and availability questions all day.' },
      { icon: '\u{1F465}', title: 'Stretched team', desc: 'You need leverage, not another front-desk hire.' },
    ],
    builds: [
      'Handle inbound intake and scheduling requests around the clock.',
      'Answer the repetitive benefit, hours, and availability questions so staff focus on care.',
      'Make sure no inquiry or referral slips through.',
    ],
    proof: 'For a service business that lives on inbound requests we built a production AI system in three months that reads incoming messages around the clock and prepares accurate, ready-to-send responses in seconds. The goal is to make your team faster, not to replace them. Your people still own every conversation.',
  },
};

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

function AIPilotVerticalPage({ variantKey }: { variantKey: keyof typeof VARIANTS }) {
  const v = VARIANTS[variantKey];
  const [form, setForm] = useState({ name: '', email: '', company: '', company_size: '', message: '', consent_contact: false });
  const [status, setStatus] = useState<'idle' | 'submitting' | 'success' | 'error'>('idle');
  const [errorMsg, setErrorMsg] = useState('');

  useEffect(() => { initTracker(); captureUTMFromURL(); captureCampaignFromURL(); }, []);

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
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name, email: form.email, company: form.company, company_size: form.company_size,
          message: form.message, consent_contact: form.consent_contact,
          source: v.slug, form_type: v.slug, interest_area: 'ai_roi_pilot',
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
      <SEOHead title={v.seoTitle} description={v.seoDesc} />
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
            <h1 className="display-4 fw-bold mb-3" style={{ color: '#fff' }}>{v.hero}</h1>
            <p className="lead mb-4" style={{ color: DARK.textMuted, fontSize: '1.25rem' }}>
              {v.sub} <strong style={{ color: '#fff' }}>$2,500, credited toward whatever we build next.</strong>
            </p>
            <div className="d-flex justify-content-center gap-3 flex-wrap">
              <a href="#start" className="btn btn-lg fw-bold px-4" style={{ background: DARK.accent, color: DARK.bg, border: 'none' }}>Start your pilot</a>
              <a href="#how" className="btn btn-lg px-4" style={{ background: 'transparent', color: DARK.accent, border: `1px solid ${DARK.accent}` }}>See how it works</a>
            </div>
            <p className="mt-3 mb-0 small" style={{ color: DARK.textMuted }}>{v.audience}</p>
          </div>
        </section>

        {/* Pains */}
        <section style={{ padding: '4rem 0' }}>
          <div className="container" style={{ maxWidth: '960px' }}>
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>If this sounds like you, keep reading</h2>
            <p className="text-center mb-5" style={{ color: DARK.textMuted, maxWidth: '640px', margin: '0 auto' }}>
              Most owners we work with are not short on ideas. They are short on a low-risk way to prove one.
            </p>
            <div className="row g-4">
              {v.pains.map((p) => (
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

        {/* Pilot steps (shared) */}
        <section id="how" style={{ padding: '4rem 0', background: '#111827' }}>
          <div className="container" style={{ maxWidth: '960px' }}>
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>The 6-Week AI ROI Pilot</h2>
            <p className="text-center mb-5" style={{ color: DARK.textMuted, maxWidth: '680px', margin: '0 auto' }}>
              One flat fee. One real win. We start with the project most likely to return value, so you see what it is like to work with us before any bigger commitment.
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

        {/* What we'd build (vertical) */}
        <section style={{ padding: '4rem 0' }}>
          <div className="container" style={{ maxWidth: '780px' }}>
            <h2 className="text-center fw-bold mb-4" style={{ color: '#fff' }}>What we would build first</h2>
            <div className="p-4 p-md-5 rounded-3" style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}>
              {v.builds.map((b) => (
                <div key={b} className="d-flex align-items-start gap-3 py-2" style={{ borderBottom: `1px solid ${DARK.border}` }}>
                  <span style={{ color: DARK.green, fontSize: '1.1rem', lineHeight: '1.5' }}>{'✓'}</span>
                  <span style={{ color: DARK.text }}>{b}</span>
                </div>
              ))}
              <p className="small mb-0 mt-3" style={{ color: DARK.textMuted, fontStyle: 'italic' }}>
                In the pilot we pick the one with the clearest payback and build it.
              </p>
            </div>
          </div>
        </section>

        {/* Proof (vertical) */}
        <section style={{ padding: '4rem 0', background: '#111827' }}>
          <div className="container" style={{ maxWidth: '780px' }}>
            <h2 className="text-center fw-bold mb-4" style={{ color: '#fff' }}>This is not theory</h2>
            <div className="p-4 p-md-5 rounded-3" style={{ background: DARK.bgCard, border: `1px solid ${DARK.border}` }}>
              <p className="mb-3" style={{ color: DARK.text, fontSize: '1.05rem' }}>{v.proof}</p>
              <p className="mb-0" style={{ color: DARK.textMuted }}>Same team. Same method. We start small, prove the value, and scale only what works.</p>
            </div>
          </div>
        </section>

        {/* Continuation (shared) */}
        <section style={{ padding: '4rem 0' }}>
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
          </div>
        </section>

        {/* Lead capture (shared, attributed to variant) */}
        <section id="start" style={{ padding: '4rem 0', background: '#111827' }}>
          <div className="container" style={{ maxWidth: '620px' }}>
            <h2 className="text-center fw-bold mb-2" style={{ color: '#fff' }}>Start your AI ROI Pilot</h2>
            <p className="text-center mb-4" style={{ color: DARK.textMuted }}>
              Tell us a little about your business. We will set up a 20-minute fit call to find your first win.
            </p>
            {status === 'success' ? (
              <div className="p-4 rounded-3 text-center" style={{ background: 'rgba(104,211,145,0.1)', border: '1px solid rgba(104,211,145,0.3)' }}>
                <div className="fs-1 mb-2" aria-hidden="true">{'✅'}</div>
                <h3 className="h5 fw-bold" style={{ color: '#fff' }}>You are in. Talk soon.</h3>
                <p className="mb-0" style={{ color: DARK.textMuted }}>We will reach out within one business day to schedule your fit call. Need us sooner? Email ali@colaberry.com.</p>
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
                  <label className="form-check-label small" htmlFor="consent" style={{ color: DARK.textMuted }}>I agree to be contacted by Colaberry about the AI ROI Pilot.</label>
                </div>
                {status === 'error' && <div className="alert alert-danger py-2 small" role="alert">{errorMsg}</div>}
                <button type="submit" className="btn btn-lg fw-bold w-100" style={{ background: DARK.accent, color: DARK.bg, border: 'none' }} disabled={status === 'submitting'}>
                  {status === 'submitting' ? 'Sending...' : 'Request my fit call'}
                </button>
              </form>
            )}
          </div>
        </section>

        <footer className="text-center py-4" style={{ borderTop: `1px solid ${DARK.border}` }}>
          <img src="/colaberry-icon.png" alt="" width="28" height="28" className="mb-2" style={{ filter: 'brightness(1.2)', opacity: 0.7 }} />
          <p className="small mb-0" style={{ color: DARK.textMuted }}>&copy; {new Date().getFullYear()} Colaberry Inc. All rights reserved.</p>
        </footer>
      </div>
    </>
  );
}

export default AIPilotVerticalPage;
