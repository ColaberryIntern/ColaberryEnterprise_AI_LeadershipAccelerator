import React, { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalShell from '../today/PortalShell';
import { useParticipantAuth } from '../../../contexts/ParticipantAuthContext';
import portalApi from '../../../utils/portalApi';
import { fetchOnboardingProfile, ResumeProfileFields, ResumePersonalization } from '../../../services/onboardingApi';
import {
  fetchSettings, updateProfile, uploadAvatar, removeAvatar,
  uploadResume, removeResume, downloadResume,
  fileToBase64, downscaleImageToSquare, formatBytes,
  SettingsView, SettingsPreferences,
} from '../../../services/portalSettingsApi';
import SubscriptionSection from './SubscriptionSection';
import PointsDrilldown from '../points/PointsDrilldown';
import './SettingsPage.css';

const RESUME_EXT = ['.pdf', '.doc', '.docx', '.rtf', '.txt', '.md'];
const RESUME_MAX = 3 * 1024 * 1024;

type ProfileForm = { full_name: string; title: string; company: string; company_size: string; phone: string; linkedin_url: string };
const EMPTY_FORM: ProfileForm = { full_name: '', title: '', company: '', company_size: '', phone: '', linkedin_url: '' };

type PersonalForm = { industry: string; role: string; seniority: string; years_experience: string; location: string; goals: string; skills: string };
const EMPTY_PERSONAL: PersonalForm = { industry: '', role: '', seniority: '', years_experience: '', location: '', goals: '', skills: '' };

const DEFAULT_PREFS: SettingsPreferences = {
  email_updates: true, event_reminders: true, weekly_digest: true, community_visible: true,
  timezone: null, weekly_hours: null, primary_goal: null, preferred_contact: null, experience_level: null,
};

type SetTab = 'subscription' | 'profile' | 'points' | 'preferences' | 'account';
const SET_TABS: { id: SetTab; label: string }[] = [
  { id: 'subscription', label: 'Subscription' },
  { id: 'profile', label: 'Profile' },
  { id: 'points', label: 'Points' },
  { id: 'preferences', label: 'Preferences' },
  { id: 'account', label: 'Account' },
];
const initialsOf = (name: string, email: string) => {
  const src = (name || email || 'You').trim();
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] || 'Y') + (parts[1]?.[0] || '')).toUpperCase();
};

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useParticipantAuth();
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [form, setForm] = useState<ProfileForm>(EMPTY_FORM);
  const [personal, setPersonal] = useState<PersonalForm>(EMPTY_PERSONAL);
  const [prefs, setPrefs] = useState<SettingsPreferences>(DEFAULT_PREFS);
  const [showMore, setShowMore] = useState(false);
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return (localStorage.getItem('te-theme') as 'light' | 'dark') || 'light'; } catch { return 'light'; }
  });
  const [tab, setTab] = useState<SetTab>('subscription');
  const avatarRef = useRef<HTMLInputElement>(null);
  const resumeRef = useRef<HTMLInputElement>(null);

  const flash = (msg: string) => { setToast(msg); window.setTimeout(() => setToast(''), 2800); };

  const applySettings = useCallback((s: SettingsView) => {
    setSettings(s);
    setForm({
      full_name: s.account.full_name || '',
      title: s.profile.title || '',
      company: s.profile.company || '',
      company_size: s.profile.company_size || '',
      phone: s.profile.phone || '',
      linkedin_url: s.profile.linkedin_url || '',
    });
    const p = s.personalization || ({} as SettingsView['personalization']);
    setPersonal({
      industry: p.industry || '', role: p.role || '', seniority: p.seniority || '',
      years_experience: p.years_experience || '', location: p.location || '', goals: p.goals || '', skills: p.skills || '',
    });
    if (s.preferences) setPrefs({ ...DEFAULT_PREFS, ...s.preferences });
  }, []);

  // Fill ONLY empty fields from parsed resume/LinkedIn data — never overwrite
  // what the student already typed or saved. Powers "fill the profile from your
  // resume, fewer steps". Returns whether anything was actually filled.
  const prefillEmpty = useCallback((profile?: ResumeProfileFields, personalization?: ResumePersonalization, linkedin?: string | null): boolean => {
    const pf = profile || {};
    const pe = personalization || {};
    const hit = Object.values(pf).some(Boolean) || Object.values(pe).some(Boolean) || !!linkedin;
    setForm((f) => ({
      ...f,
      full_name: f.full_name || pf.full_name || '',
      title: f.title || pf.title || '',
      company: f.company || pf.company || '',
      company_size: f.company_size || pf.company_size || '',
      phone: f.phone || pf.phone || '',
      linkedin_url: f.linkedin_url || pf.linkedin_url || linkedin || '',
    }));
    setPersonal((f) => ({
      ...f,
      industry: f.industry || pe.industry || '',
      role: f.role || pe.role || '',
      seniority: f.seniority || pe.seniority || '',
      years_experience: f.years_experience || pe.years_experience || '',
      location: f.location || pe.location || '',
      goals: f.goals || pe.goals || '',
      skills: f.skills || pe.skills || '',
    }));
    return hit;
  }, []);

  const load = useCallback(async () => {
    const [s, op] = await Promise.allSettled([fetchSettings(), fetchOnboardingProfile()]);
    if (s.status === 'fulfilled') applySettings(s.value);
    // Prefill any still-empty fields from previously parsed resume/LinkedIn data.
    if (op.status === 'fulfilled') prefillEmpty(op.value.profile, op.value.personalization, op.value.linkedin_url);
    // We REQUIRE industry — if we don't have it yet, open the extra-details
    // section so the student is prompted to fill it in.
    const industry = (s.status === 'fulfilled' && s.value.personalization?.industry)
      || (op.status === 'fulfilled' && op.value.personalization?.industry) || '';
    if (!industry) setShowMore(true);
  }, [applySettings, prefillEmpty]);

  useEffect(() => { load(); }, [load]);

  const setField = (k: keyof ProfileForm, v: string) => setForm((f) => ({ ...f, [k]: v }));
  const setPersonalField = (k: keyof PersonalForm, v: string) => setPersonal((f) => ({ ...f, [k]: v }));

  const onSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    // Required checks: we always want the name, current/last title, and industry.
    if (!form.full_name.trim()) { flash('Name cannot be empty'); return; }
    if (!form.title.trim()) { flash('Please add your current or last job title'); return; }
    if (!personal.industry.trim()) { setShowMore(true); flash('Please add your industry — it helps us tailor your program'); return; }
    setSavingProfile(true);
    try {
      const updated = await updateProfile({ ...form, personalization: personal });
      applySettings(updated);
      flash('Profile saved');
    } catch (err: any) {
      flash(err?.response?.data?.error || 'Could not save your profile');
    } finally { setSavingProfile(false); }
  };

  // Preferences auto-save on change (no separate button); reverts on failure.
  const savePref = async (patch: Partial<SettingsPreferences>) => {
    const prev = prefs;
    setPrefs((p) => ({ ...p, ...patch }));
    try { await updateProfile({ preferences: patch }); }
    catch { flash('Could not save that preference'); setPrefs(prev); }
  };

  const onPickAvatar = async (file: File | null) => {
    if (!file || avatarBusy) return;
    if (!file.type.startsWith('image/')) { flash('Please choose an image file'); return; }
    setAvatarBusy(true);
    try {
      const dataUrl = await downscaleImageToSquare(file, 256);
      const updated = await uploadAvatar(dataUrl);
      applySettings(updated);
      flash('Photo updated');
    } catch (err: any) {
      flash(err?.response?.data?.error || 'Could not update your photo');
    } finally { setAvatarBusy(false); if (avatarRef.current) avatarRef.current.value = ''; }
  };

  const onRemoveAvatar = async () => {
    if (avatarBusy || !settings?.avatar_data_url) return;
    setAvatarBusy(true);
    try { applySettings(await removeAvatar()); flash('Photo removed'); }
    catch { flash('Could not remove your photo'); }
    finally { setAvatarBusy(false); }
  };

  const onPickResume = async (file: File | null) => {
    if (!file || resumeBusy) return;
    const ext = file.name.slice(file.name.lastIndexOf('.')).toLowerCase();
    if (!RESUME_EXT.includes(ext)) { flash('Accepted: PDF, Word, RTF, Text, Markdown'); return; }
    if (file.size > RESUME_MAX) { flash('Resume must be 3 MB or smaller'); return; }
    setResumeBusy(true);
    try {
      const data_base64 = await fileToBase64(file);
      const mime = file.type || (ext === '.pdf' ? 'application/pdf' : 'text/plain');
      // The server parses the file (pdf/docx/rtf/txt) during upload and stores
      // the extracted profile/personalization — so re-read it and prefill.
      const updated = await uploadResume({ file_name: file.name, mime, data_base64 });
      applySettings(updated);
      try {
        const op = await fetchOnboardingProfile();
        const filled = prefillEmpty(op.profile, op.personalization, op.linkedin_url);
        flash(filled ? 'Resume uploaded — we filled in what we could below' : 'Resume uploaded');
      } catch { flash('Resume uploaded'); }
    } catch (err: any) {
      flash(err?.response?.data?.error || 'Could not upload that file');
    } finally { setResumeBusy(false); if (resumeRef.current) resumeRef.current.value = ''; }
  };

  const onRemoveResume = async () => {
    if (resumeBusy) return;
    setResumeBusy(true);
    try { applySettings(await removeResume()); flash('Resume removed'); }
    catch { flash('Could not remove your resume'); }
    finally { setResumeBusy(false); }
  };

  const onSendSignInLink = async () => {
    if (linkBusy || !settings) return;
    setLinkBusy(true);
    try {
      await portalApi.post('/api/portal/request-link', { email: settings.account.email });
      flash('Check your email for a fresh sign-in link');
    } catch { flash('Could not send a link right now'); }
    finally { setLinkBusy(false); }
  };

  const onSignOut = () => { logout(); navigate('/portal/login', { replace: true }); };

  const toggleTheme = () => {
    const next = theme === 'dark' ? 'light' : 'dark';
    setTheme(next);
    try { document.documentElement.setAttribute('data-theme', next); localStorage.setItem('te-theme', next); } catch { /* ignore */ }
  };

  const acct = settings?.account;
  const avatarUrl = settings?.avatar_data_url ?? null;
  const resume = settings?.resume ?? null;
  const memberSince = acct?.member_since ? new Date(acct.member_since).toLocaleDateString('en-US', { month: 'long', year: 'numeric' }) : null;

  return (
    <PortalShell>
      {toast && <div className="te-toast">{toast}</div>}

      <div className="te-page-h">
        <div className="crumb">Settings</div>
        <h1>Your account</h1>
        <div className="sub">Manage your subscription, profile, points, and preferences — each in its own place.</div>
      </div>

      <div className="set-shell">
        <div className="set-tabs" role="tablist" aria-label="Settings sections">
          {SET_TABS.map((t) => (
            <button
              key={t.id}
              type="button"
              role="tab"
              aria-selected={tab === t.id}
              className={`set-tab${tab === t.id ? ' active' : ''}`}
              onClick={() => setTab(t.id)}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="set-panel">
        {tab === 'subscription' && <SubscriptionSection onToast={flash} />}

        {tab === 'profile' && (<>
        {/* ── Uploads first: resume/LinkedIn (prefills the form) + photo ── */}
        <section className="te-card set-section">
          <h3>Start here — resume &amp; LinkedIn</h3>
          <p className="set-sub">Upload your resume, or export your LinkedIn profile to PDF (profile → More → Save to PDF) and upload that. We read it and fill in your profile below for you — fewer steps.</p>
          <input ref={resumeRef} type="file" accept=".pdf,.doc,.docx,.rtf,.txt,.md" style={{ display: 'none' }}
            onChange={(e) => onPickResume(e.target.files?.[0] || null)} />
          {resume ? (
            <div className="set-file">
              <span className="fic"><svg viewBox="0 0 24 24" width="20" height="20" fill="none"><path d="M14 3v5h5" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><path d="M14 3H6a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg></span>
              <div className="meta">
                <div className="nm">{resume.file_name}</div>
                <div className="sb">{formatBytes(resume.size_bytes)}{resume.uploaded_at ? ` · uploaded ${new Date(resume.uploaded_at).toLocaleDateString()}` : ''}</div>
              </div>
              <div className="acts">
                <button className="te-btn ghost sm" disabled={resumeBusy} onClick={() => downloadResume(resume.file_name)}>Download</button>
                <button className="te-btn berry sm" disabled={resumeBusy} onClick={() => resumeRef.current?.click()}>Replace</button>
                <button className="te-btn danger sm" disabled={resumeBusy} onClick={onRemoveResume}>Remove</button>
              </div>
            </div>
          ) : (
            <div className="set-empty">
              <div style={{ marginBottom: 12 }}>No resume on file yet.</div>
              <button className="te-btn cherry sm" disabled={resumeBusy} onClick={() => resumeRef.current?.click()}>{resumeBusy ? 'Uploading…' : 'Upload resume / LinkedIn PDF'}</button>
            </div>
          )}
          <div className="set-field full" style={{ marginTop: 16 }}>
            <label className="set-label" htmlFor="s-linkedin">LinkedIn URL</label>
            <input id="s-linkedin" className="set-input" value={form.linkedin_url} onChange={(e) => setField('linkedin_url', e.target.value)} placeholder="https://www.linkedin.com/in/you" />
            <span className="set-sub" style={{ margin: '2px 0 0' }}>Saved with “Save changes” below.</span>
          </div>
        </section>

        {/* ── Photo ── */}
        <section className="te-card set-section">
          <h3>Profile photo</h3>
          <p className="set-sub">A square headshot looks best. Large images are automatically resized.</p>
          <div className="set-photo-row">
            <div className="set-avatar">
              {avatarUrl
                ? <img src={avatarUrl} alt="Your profile" />
                : <span>{initialsOf(form.full_name, acct?.email || '')}</span>}
            </div>
            <div className="set-photo-actions">
              <div className="row">
                <input ref={avatarRef} type="file" accept="image/*" style={{ display: 'none' }}
                  onChange={(e) => onPickAvatar(e.target.files?.[0] || null)} />
                <button className="te-btn berry sm" disabled={avatarBusy} onClick={() => avatarRef.current?.click()}>
                  {avatarBusy ? 'Working…' : avatarUrl ? 'Change photo' : 'Upload photo'}
                </button>
                {avatarUrl && (
                  <button className="te-btn ghost sm" disabled={avatarBusy} onClick={onRemoveAvatar}>Remove</button>
                )}
              </div>
              <span className="set-sub" style={{ margin: 0 }}>PNG, JPEG, WEBP or GIF.</span>
            </div>
          </div>
        </section>

        {/* ── Profile (prefilled from the resume where we can) ── */}
        <section className="te-card set-section">
          <h3>Your details</h3>
          <p className="set-sub">We fill in what we can from your resume — just review and tweak. This personalizes your program and how mentors see you.</p>
          <form onSubmit={onSaveProfile}>
            <div className="set-grid">
              <div className="set-field">
                <label className="set-label" htmlFor="s-name">Full name</label>
                <input id="s-name" className="set-input" value={form.full_name} onChange={(e) => setField('full_name', e.target.value)} placeholder="Your name" />
              </div>
              <div className="set-field">
                <label className="set-label" htmlFor="s-title">Title / role <span className="set-req">required</span></label>
                <input id="s-title" className="set-input" value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder="Your current or last job title" />
              </div>
              <div className="set-field">
                <label className="set-label" htmlFor="s-company">Company</label>
                <input id="s-company" className="set-input" value={form.company} onChange={(e) => setField('company', e.target.value)} placeholder="Where you work" />
              </div>
              <div className="set-field">
                <label className="set-label" htmlFor="s-size">Company size</label>
                <input id="s-size" className="set-input" value={form.company_size} onChange={(e) => setField('company_size', e.target.value)} placeholder="e.g. 51-200" />
              </div>
              <div className="set-field">
                <label className="set-label" htmlFor="s-phone">Phone</label>
                <input id="s-phone" className="set-input" value={form.phone} onChange={(e) => setField('phone', e.target.value)} placeholder="Optional" />
              </div>
              <div className="set-field">
                <label className="set-label">Email</label>
                <span className="set-readonly"><span className="lock">🔒</span>{acct?.email || '—'}</span>
              </div>
            </div>

            {/* Optional, expandable — mostly captured from the resume/LinkedIn */}
            <button type="button" className="set-more-toggle" onClick={() => setShowMore((v) => !v)}>
              <span className="chev" style={{ transform: showMore ? 'rotate(90deg)' : 'none' }}>›</span>
              {showMore ? 'Hide extra details' : 'Add more details (optional)'}
              <span className="set-more-hint">helps us personalize your program</span>
            </button>
            {showMore && (
              <div className="set-grid" style={{ marginTop: 6 }}>
                <div className="set-field">
                  <label className="set-label">Industry <span className="set-req">required</span></label>
                  <input className="set-input" value={personal.industry} onChange={(e) => setPersonalField('industry', e.target.value)} placeholder="e.g. Healthcare, Financial Services" />
                </div>
                <div className="set-field">
                  <label className="set-label">Function / focus area</label>
                  <input className="set-input" value={personal.role} onChange={(e) => setPersonalField('role', e.target.value)} placeholder="e.g. Operations, Data, Product" />
                </div>
                <div className="set-field">
                  <label className="set-label">Seniority</label>
                  <input className="set-input" value={personal.seniority} onChange={(e) => setPersonalField('seniority', e.target.value)} placeholder="e.g. Director, VP, IC" />
                </div>
                <div className="set-field">
                  <label className="set-label">Years of experience</label>
                  <input className="set-input" value={personal.years_experience} onChange={(e) => setPersonalField('years_experience', e.target.value)} placeholder="e.g. 8" />
                </div>
                <div className="set-field">
                  <label className="set-label">Location</label>
                  <input className="set-input" value={personal.location} onChange={(e) => setPersonalField('location', e.target.value)} placeholder="City, State" />
                </div>
                <div className="set-field">
                  <label className="set-label">Top skills</label>
                  <input className="set-input" value={personal.skills} onChange={(e) => setPersonalField('skills', e.target.value)} placeholder="Comma-separated" />
                </div>
                <div className="set-field full">
                  <label className="set-label">What do you want to get out of the program?</label>
                  <textarea className="set-input" style={{ minHeight: 68 }} value={personal.goals} onChange={(e) => setPersonalField('goals', e.target.value)} placeholder="Your main goal, in a sentence" />
                </div>
              </div>
            )}

            <div className="set-actions">
              <button className="te-btn cherry" type="submit" disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        </section>
        </>)}

        {tab === 'points' && <PointsDrilldown showHistoryLink />}

        {tab === 'preferences' && (<>
        <section className="te-card set-section">
          <h3>Notifications</h3>
          <p className="set-sub">Choose what lands in your inbox. Changes save automatically.</p>
          {([
            ['email_updates', 'Program updates', 'Important announcements about your cohort and the program.'],
            ['event_reminders', 'Event reminders', 'A nudge before live classes and events you can join.'],
            ['weekly_digest', 'Weekly digest', 'A Monday summary of your progress, points, and what’s next.'],
            ['community_visible', 'Show me in the community', 'Let other members see your profile in Community.'],
          ] as [keyof SettingsPreferences, string, string][]).map(([key, lab, desc]) => (
            <div className="set-row" key={key}>
              <div>
                <div className="lab">{lab}</div>
                <div className="desc">{desc}</div>
              </div>
              <button
                type="button"
                className={`set-toggle${prefs[key] ? ' on' : ''}`}
                role="switch"
                aria-checked={!!prefs[key]}
                onClick={() => savePref({ [key]: !prefs[key] } as Partial<SettingsPreferences>)}
              >
                <span className="knob" />
              </button>
            </div>
          ))}
        </section>

        <section className="te-card set-section">
          <h3>Personalize your experience</h3>
          <p className="set-sub">The more we know, the better we tailor your path. All optional.</p>
          <div className="set-grid">
            <div className="set-field">
              <label className="set-label">Experience with AI</label>
              <select className="set-input" value={prefs.experience_level || ''} onChange={(e) => savePref({ experience_level: e.target.value || null })}>
                <option value="">Select…</option>
                {['New to AI', 'Some exposure', 'Hands-on', 'Advanced'].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="set-field">
              <label className="set-label">Time you can commit weekly</label>
              <select className="set-input" value={prefs.weekly_hours || ''} onChange={(e) => savePref({ weekly_hours: e.target.value || null })}>
                <option value="">Select…</option>
                {['1–2 hrs', '3–5 hrs', '6–10 hrs', '10+ hrs'].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="set-field">
              <label className="set-label">Timezone</label>
              <input className="set-input" value={prefs.timezone || ''} onChange={(e) => setPrefs((p) => ({ ...p, timezone: e.target.value }))} onBlur={(e) => savePref({ timezone: e.target.value || null })} placeholder="e.g. Central (CT)" />
            </div>
            <div className="set-field">
              <label className="set-label">Preferred contact</label>
              <select className="set-input" value={prefs.preferred_contact || ''} onChange={(e) => savePref({ preferred_contact: e.target.value || null })}>
                <option value="">Select…</option>
                {['Email', 'Phone', 'Either'].map((o) => <option key={o} value={o}>{o}</option>)}
              </select>
            </div>
            <div className="set-field full">
              <label className="set-label">Your #1 goal for the program</label>
              <input className="set-input" value={prefs.primary_goal || ''} onChange={(e) => setPrefs((p) => ({ ...p, primary_goal: e.target.value }))} onBlur={(e) => savePref({ primary_goal: e.target.value || null })} placeholder="e.g. Ship an AI agent for my team" />
            </div>
          </div>
        </section>

        <section className="te-card set-section">
          <h3>Appearance</h3>
          <div className="set-row">
            <div>
              <div className="lab">Theme</div>
              <div className="desc">Switch between light and dark. Remembered on this device.</div>
            </div>
            <button className="te-btn ghost sm" onClick={toggleTheme}>{theme === 'dark' ? 'Switch to light' : 'Switch to dark'}</button>
          </div>
        </section>
        </>)}

        {tab === 'account' && (
        <section className="te-card set-section">
          <h3>Sign-in &amp; security</h3>
          <div className="set-row">
            <div>
              <div className="lab">Sign-in method: magic link</div>
              <div className="desc">Colaberry doesn’t use passwords. To sign in, request a secure one-time link sent to <b>{acct?.email || 'your email'}</b> — it expires after use.</div>
            </div>
            <button className="te-btn berry sm" disabled={linkBusy} onClick={onSendSignInLink}>{linkBusy ? 'Sending…' : 'Email me a sign-in link'}</button>
          </div>
          <div className="set-row">
            <div>
              <div className="lab">Sign out</div>
              <div className="desc">Sign out of the portal on this device.</div>
            </div>
            <button className="te-btn danger sm" onClick={onSignOut}>Sign out</button>
          </div>
          {(acct?.tier || memberSince) && (
            <div className="set-row">
              <div>
                <div className="lab">Account</div>
                <div className="desc">
                  {acct?.tier === 'guest' ? 'Free preview account' : 'Member'}
                  {acct?.cohort_name ? ` · ${acct.cohort_name}` : ''}
                  {memberSince ? ` · since ${memberSince}` : ''}
                </div>
              </div>
            </div>
          )}
        </section>
        )}
        </div>
      </div>
    </PortalShell>
  );
};

export default SettingsPage;
