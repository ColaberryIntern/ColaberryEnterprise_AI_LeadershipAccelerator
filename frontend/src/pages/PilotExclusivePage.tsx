import React, { useState, useEffect } from 'react'; // eslint-disable-line
import SEOHead from '../components/SEOHead';
import { captureUTMFromURL } from '../services/utmService';
import { initTracker, trackEvent } from '../utils/tracker';

const HERO_BG = '#0a0e17';
const DARK_CARD = '#111827';
const WHITE = '#ffffff';
const BG = '#f8fafc';
const TEXT = '#0f172a';
const TEXT2 = '#1e293b';
const MUTED = '#64748b';
const BORDER = '#e2e8f0';
const GOLD = '#d4a574';
const GOLD_LIGHT = 'rgba(212,165,116,0.15)';
const GREEN = '#38a169';
const ACCENT = '#3b82f6';

const btnGreen: React.CSSProperties = {
  background: `linear-gradient(135deg, ${GREEN}, #2f855a)`,
  color: '#fff',
  border: 'none',
  borderRadius: 8,
  padding: '16px 44px',
  fontSize: 18,
  fontWeight: 700,
  cursor: 'pointer',
  letterSpacing: 0.5,
  transition: 'transform 0.2s, box-shadow 0.2s',
};

interface FormData {
  name: string;
  email: string;
  company: string;
  title: string;
  phone: string;
  company_size: string;
}

function PilotExclusivePage() {
  const [form, setForm] = useState<FormData>({ name: '', email: '', company: '', title: '', phone: '', company_size: '' });
  const [submitting, setSubmitting] = useState(false);
  const [submitted, setSubmitted] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    captureUTMFromURL();
    initTracker();
    const params = new URLSearchParams(window.location.search);
    const lid = params.get('lid');
    if (lid) { try { localStorage.setItem('cb_lead_id', lid); } catch {} }
  }, []);

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
    setForm(prev => ({ ...prev, [e.target.name]: e.target.value }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    trackEvent('form_submit', { form_name: 'pilot_exclusive_apply', page: '/pilot/exclusive' });

    try {
      const res = await fetch((process.env.REACT_APP_API_URL || '') + '/api/leads', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          name: form.name,
          email: form.email,
          company: form.company,
          title: form.title,
          phone: form.phone,
          company_size: form.company_size,
          form_type: 'pilot_exclusive_apply',
          source: 'pilot_program',
        }),
      });
      if (!res.ok) throw new Error('Submission failed');
      setSubmitted(true);
    } catch {
      setError('Something went wrong. Please try again or email ali@colaberry.com directly.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <>
      <SEOHead
        title="Exclusive AI Build Program - 10 Companies Selected"
        description="We're selecting 10 companies to build AI into from the inside. 12-week embedded engagement. Apply now."
      />

      <div style={{ background: HERO_BG, color: WHITE, fontFamily: "'Inter', -apple-system, sans-serif", minHeight: '100vh' }}>

        {/* HERO */}
        <section style={{ background: HERO_BG, padding: '80px 20px 70px', textAlign: 'center' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <div style={{ display: 'inline-block', background: GOLD_LIGHT, borderRadius: 20, padding: '6px 18px', fontSize: 13, color: GOLD, marginBottom: 24, fontWeight: 500, border: `1px solid rgba(212,165,116,0.3)` }}>
              Exclusive Build Program
            </div>
            <h1 style={{ fontSize: 'clamp(32px, 5vw, 52px)', fontWeight: 800, lineHeight: 1.1, marginBottom: 20, color: '#fff' }}>
              We're Building 10 AI-Driven Companies{' '}
              <span style={{ color: GOLD }}>From the Inside</span>
              {' '}-- Want In?
            </h1>
            <p style={{ fontSize: 'clamp(16px, 2.2vw, 20px)', color: '#94a3b8', lineHeight: 1.7, marginBottom: 36, maxWidth: 640, margin: '0 auto 36px' }}>
              This is not a service. It's a 12-week embedded partnership that transforms how your company operates.
            </p>
            <a href="#apply" style={{ ...btnGreen, display: 'inline-block', textDecoration: 'none', padding: '18px 48px', fontSize: 20 }}
              onMouseEnter={e => { e.currentTarget.style.transform = 'scale(1.03)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(56,161,105,0.4)'; }}
              onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
              APPLY FOR A SPOT
            </a>
          </div>
        </section>

        {/* SELECTION / DIFFERENTIATORS */}
        <section style={{ background: DARK_CARD, padding: '70px 20px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 12, textAlign: 'center', color: '#fff' }}>
              This Is Not a Service. It's a Partnership.
            </h2>
            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 15, marginBottom: 40 }}>
              We are selecting companies, not accepting customers.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))', gap: 20 }}>
              {[
                {
                  icon: '\u{1F3AF}',
                  title: 'We Embed With Your Team',
                  desc: 'Our engineers and AI architects work alongside your leadership for 12 weeks. Not outsourced. Not consultants dropping off a report. Embedded.',
                },
                {
                  icon: '\u{1F527}',
                  title: 'We Build 3-5 AI Systems',
                  desc: 'Not POCs. Not demos. Production AI systems running on your infrastructure, solving your specific operational bottlenecks.',
                },
                {
                  icon: '\u{1F91D}',
                  title: 'We Transfer Full Ownership',
                  desc: 'Documentation, runbooks, training. Your team manages and extends the systems independently. Zero vendor lock-in.',
                },
              ].map((item, i) => (
                <div key={i} style={{ background: 'rgba(255,255,255,0.03)', borderRadius: 12, padding: '32px 24px', border: '1px solid rgba(255,255,255,0.08)' }}>
                  <div style={{ fontSize: 32, marginBottom: 12 }}>{item.icon}</div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{item.title}</h3>
                  <p style={{ fontSize: 14, color: '#94a3b8', lineHeight: 1.7, margin: 0 }}>{item.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* TIMELINE */}
        <section style={{ background: HERO_BG, padding: '70px 20px' }}>
          <div style={{ maxWidth: 900, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 12, textAlign: 'center', color: '#fff' }}>
              The 12-Week Transformation
            </h2>
            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 15, marginBottom: 40 }}>
              Four phases. One outcome: an AI-capable company.
            </p>
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(200px, 1fr))', gap: 16 }}>
              {[
                { phase: 'Weeks 1-2', title: 'Audit', desc: 'Map every process. Identify highest-impact automation targets. Build the business case.', color: ACCENT },
                { phase: 'Weeks 3-6', title: 'Build', desc: 'Deploy 3-5 AI systems targeting the processes identified in the audit. Daily standups.', color: GOLD },
                { phase: 'Weeks 7-10', title: 'Train', desc: 'Train your team to manage, monitor, and extend the AI systems independently.', color: GREEN },
                { phase: 'Weeks 11-12', title: 'Transfer', desc: 'Full ownership transfer. Documentation, runbooks, and ongoing advisory access.', color: '#e53e3e' },
              ].map((step, i) => (
                <div key={i} style={{ background: DARK_CARD, borderRadius: 12, padding: '28px 20px', border: `1px solid rgba(255,255,255,0.08)`, borderTop: `3px solid ${step.color}` }}>
                  <div style={{ fontSize: 12, color: step.color, fontWeight: 700, marginBottom: 8, textTransform: 'uppercase', letterSpacing: 0.5 }}>{step.phase}</div>
                  <h3 style={{ fontSize: 18, fontWeight: 700, color: '#fff', marginBottom: 8 }}>{step.title}</h3>
                  <p style={{ fontSize: 13, color: '#94a3b8', lineHeight: 1.7, margin: 0 }}>{step.desc}</p>
                </div>
              ))}
            </div>
          </div>
        </section>

        {/* FOUNDER STORY */}
        <section style={{ background: DARK_CARD, padding: '70px 20px' }}>
          <div style={{ maxWidth: 700, margin: '0 auto' }}>
            <div style={{ background: 'rgba(212,165,116,0.05)', borderRadius: 12, padding: '40px 32px', border: `1px solid rgba(212,165,116,0.2)`, borderLeft: `4px solid ${GOLD}` }}>
              <div style={{ fontSize: 48, color: GOLD, marginBottom: 16, lineHeight: 1, fontFamily: 'Georgia, serif' }}>"</div>
              <p style={{ fontSize: 18, color: '#e2e8f0', lineHeight: 1.8, marginBottom: 20, fontStyle: 'italic' }}>
                We invested $36K in the build program. In 12 weeks, we deployed AI systems that reduced route planning time by 85% and automated customer quoting from 45 minutes to 90 seconds per quote. The annualized operational savings: $2M. That is not a typo.
              </p>
              <div style={{ display: 'flex', alignItems: 'center', gap: 12 }}>
                <div style={{ width: 48, height: 48, borderRadius: '50%', background: `linear-gradient(135deg, ${GOLD}, #b8956a)`, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 20, fontWeight: 700, color: '#fff' }}>
                  J
                </div>
                <div>
                  <div style={{ fontSize: 15, fontWeight: 700, color: '#fff' }}>Logistics CEO</div>
                  <div style={{ fontSize: 13, color: '#94a3b8' }}>200-person company, Southeast US</div>
                </div>
              </div>
            </div>
          </div>
        </section>

        {/* APPLICATION FORM */}
        <section id="apply" style={{ background: HERO_BG, padding: '70px 20px' }}>
          <div style={{ maxWidth: 560, margin: '0 auto' }}>
            <h2 style={{ fontSize: 'clamp(24px, 3.5vw, 36px)', fontWeight: 700, marginBottom: 12, textAlign: 'center', color: '#fff' }}>
              Apply for a Spot
            </h2>
            <p style={{ textAlign: 'center', color: '#94a3b8', fontSize: 15, marginBottom: 36 }}>
              3 of 10 founding spots remaining. We review every application.
            </p>

            {submitted ? (
              <div style={{ background: 'rgba(56,161,105,0.1)', borderRadius: 12, padding: '40px 32px', border: `1px solid rgba(56,161,105,0.3)`, textAlign: 'center' }}>
                <div style={{ fontSize: 48, marginBottom: 16 }}>{'\u2705'}</div>
                <h3 style={{ fontSize: 22, fontWeight: 700, color: GREEN, marginBottom: 12 }}>Application Received</h3>
                <p style={{ fontSize: 15, color: '#94a3b8', lineHeight: 1.7 }}>
                  Ali Muwwakkil will personally review your application and reach out within 48 hours.
                </p>
              </div>
            ) : (
              <form onSubmit={handleSubmit} style={{ background: DARK_CARD, borderRadius: 12, padding: '36px 28px', border: '1px solid rgba(255,255,255,0.08)' }}>
                <div style={{ display: 'grid', gap: 16 }}>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Full Name *</label>
                    <input
                      type="text" name="name" required value={form.name} onChange={handleChange}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Work Email *</label>
                    <input
                      type="email" name="email" required value={form.email} onChange={handleChange}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Company *</label>
                    <input
                      type="text" name="company" required value={form.company} onChange={handleChange}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Title *</label>
                    <input
                      type="text" name="title" required value={form.title} onChange={handleChange}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Phone</label>
                    <input
                      type="tel" name="phone" value={form.phone} onChange={handleChange}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: '#fff', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
                    />
                  </div>
                  <div>
                    <label style={{ display: 'block', fontSize: 13, fontWeight: 600, color: '#94a3b8', marginBottom: 6 }}>Company Size *</label>
                    <select
                      name="company_size" required value={form.company_size} onChange={handleChange}
                      style={{ width: '100%', padding: '12px 14px', borderRadius: 8, border: '1px solid rgba(255,255,255,0.15)', background: 'rgba(255,255,255,0.05)', color: form.company_size ? '#fff' : '#94a3b8', fontSize: 15, outline: 'none', boxSizing: 'border-box' }}
                    >
                      <option value="" disabled>Select company size</option>
                      <option value="11-50">11-50 employees</option>
                      <option value="51-100">51-100 employees</option>
                      <option value="101-200">101-200 employees</option>
                      <option value="201-500">201-500 employees</option>
                      <option value="500+">500+ employees</option>
                    </select>
                  </div>
                </div>

                {error && (
                  <div style={{ marginTop: 16, padding: '12px 16px', borderRadius: 8, background: 'rgba(229,62,62,0.1)', border: '1px solid rgba(229,62,62,0.3)', color: '#fc8181', fontSize: 14 }}>
                    {error}
                  </div>
                )}

                <button type="submit" disabled={submitting} style={{ ...btnGreen, width: '100%', marginTop: 24, opacity: submitting ? 0.7 : 1 }}
                  onMouseEnter={e => { if (!submitting) { e.currentTarget.style.transform = 'scale(1.02)'; e.currentTarget.style.boxShadow = '0 8px 30px rgba(56,161,105,0.4)'; } }}
                  onMouseLeave={e => { e.currentTarget.style.transform = 'scale(1)'; e.currentTarget.style.boxShadow = 'none'; }}>
                  {submitting ? 'SUBMITTING...' : 'APPLY FOR A SPOT'}
                </button>

                <p style={{ textAlign: 'center', color: '#475569', fontSize: 12, marginTop: 12 }}>
                  We review every application. Ali Muwwakkil responds personally within 48 hours.
                </p>
              </form>
            )}
          </div>
        </section>

        {/* FOOTER */}
        <footer style={{ padding: '24px 20px', textAlign: 'center', borderTop: '1px solid rgba(255,255,255,0.08)' }}>
          <p style={{ color: '#475569', fontSize: 12, margin: 0 }}>
            Colaberry Enterprise AI Division
          </p>
        </footer>
      </div>
    </>
  );
}

export default PilotExclusivePage;
