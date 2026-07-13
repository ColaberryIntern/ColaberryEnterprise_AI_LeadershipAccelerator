import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import PortalShell from '../today/PortalShell';
import { useParticipantAuth } from '../../../contexts/ParticipantAuthContext';
import portalApi from '../../../utils/portalApi';
import { fetchPoints, levelFor, ingestBackground, PointsSummary } from '../../../services/onboardingApi';
import {
  fetchSettings, updateProfile, uploadAvatar, removeAvatar,
  uploadResume, removeResume, downloadResume,
  fileToBase64, downscaleImageToSquare, formatBytes,
  SettingsView, ProfilePatch,
} from '../../../services/portalSettingsApi';
import './SettingsPage.css';

const RESUME_EXT = ['.pdf', '.doc', '.docx', '.rtf', '.txt', '.md'];
const RESUME_MAX = 3 * 1024 * 1024;

const EVENT_LABELS: Record<string, string> = {
  account_created: 'Account created',
  profile_completed: 'Profile completed',
  open_house_rsvp: 'RSVP’d to an open house',
  open_house_attended: 'Attended an open house',
  project_dna_completed: 'Defined your project',
  first_task_complete: 'Completed your first task',
};
const humanize = (s: string) => s.replace(/_/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const initialsOf = (name: string, email: string) => {
  const src = (name || email || 'You').trim();
  const parts = src.split(/[\s@.]+/).filter(Boolean);
  return ((parts[0]?.[0] || 'Y') + (parts[1]?.[0] || '')).toUpperCase();
};

const SettingsPage: React.FC = () => {
  const navigate = useNavigate();
  const { logout } = useParticipantAuth();
  const [settings, setSettings] = useState<SettingsView | null>(null);
  const [points, setPoints] = useState<PointsSummary | null>(null);
  const [form, setForm] = useState<Required<ProfilePatch>>({
    full_name: '', title: '', company: '', company_size: '', phone: '', linkedin_url: '',
  });
  const [savingProfile, setSavingProfile] = useState(false);
  const [avatarBusy, setAvatarBusy] = useState(false);
  const [resumeBusy, setResumeBusy] = useState(false);
  const [linkBusy, setLinkBusy] = useState(false);
  const [toast, setToast] = useState('');
  const [theme, setTheme] = useState<'light' | 'dark'>(() => {
    try { return (localStorage.getItem('te-theme') as 'light' | 'dark') || 'light'; } catch { return 'light'; }
  });
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
  }, []);

  const load = useCallback(async () => {
    const [s, p] = await Promise.allSettled([fetchSettings(), fetchPoints()]);
    if (s.status === 'fulfilled') applySettings(s.value);
    if (p.status === 'fulfilled') setPoints(p.value);
  }, [applySettings]);

  useEffect(() => { load(); }, [load]);

  const setField = (k: keyof ProfilePatch, v: string) => setForm((f) => ({ ...f, [k]: v }));

  const onSaveProfile = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!form.full_name.trim()) { flash('Name cannot be empty'); return; }
    setSavingProfile(true);
    try {
      const updated = await updateProfile(form);
      applySettings(updated);
      flash('Profile saved');
    } catch (err: any) {
      flash(err?.response?.data?.error || 'Could not save your profile');
    } finally { setSavingProfile(false); }
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
      const updated = await uploadResume({ file_name: file.name, mime, data_base64 });
      applySettings(updated);
      // Text resumes also feed the background personalization (parity with the
      // Today onboarding step); non-fatal if the extractor is unavailable.
      if (ext === '.txt' || ext === '.md') {
        try { await ingestBackground({ resume_text: await file.text() }); } catch { /* best effort */ }
      }
      flash('Resume uploaded');
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

  const total = points?.total ?? 0;
  const lvl = useMemo(() => levelFor(total), [total]);
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
        <div className="sub">Update your photo, background, and preferences. Changes save to your Colaberry profile.</div>
      </div>

      <div className="set-wrap">
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

        {/* ── Profile ── */}
        <section className="te-card set-section">
          <h3>Profile</h3>
          <p className="set-sub">This personalizes your program and how mentors see you.</p>
          <form onSubmit={onSaveProfile}>
            <div className="set-grid">
              <div className="set-field">
                <label className="set-label" htmlFor="s-name">Full name</label>
                <input id="s-name" className="set-input" value={form.full_name} onChange={(e) => setField('full_name', e.target.value)} placeholder="Your name" />
              </div>
              <div className="set-field">
                <label className="set-label" htmlFor="s-title">Title / role</label>
                <input id="s-title" className="set-input" value={form.title} onChange={(e) => setField('title', e.target.value)} placeholder="e.g. Director of Operations" />
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
            <div className="set-actions">
              <button className="te-btn cherry" type="submit" disabled={savingProfile}>{savingProfile ? 'Saving…' : 'Save changes'}</button>
            </div>
          </form>
        </section>

        {/* ── Background: resume + LinkedIn ── */}
        <section className="te-card set-section">
          <h3>Resume &amp; LinkedIn</h3>
          <p className="set-sub">Upload your resume, or export your LinkedIn profile to PDF (profile → More → Save to PDF) and upload that. We tailor your experience from it in the background.</p>
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
            <span className="set-sub" style={{ margin: '2px 0 0' }}>Saved with “Save changes” above.</span>
          </div>
        </section>

        {/* ── Points & level ── */}
        <section className="te-card set-section">
          <h3>Points &amp; level</h3>
          <p className="set-sub">You earn points as you set up, show up, and build.</p>
          <div className="te-stat"><span className="lab">{lvl.name}</span><span className="num">{total.toLocaleString()} pts</span></div>
          <div className="te-ribbon"><i style={{ width: `${lvl.pct}%`, background: 'var(--leaf)' }} /></div>
          <div className="set-sub" style={{ margin: '-2px 0 0' }}>{lvl.next ? `${lvl.next.min - total} pts to ${lvl.next.name}` : 'Top level reached'}</div>
          {points && points.events.length > 0 && (
            <div className="set-events">
              {points.events.slice(0, 8).map((ev, i) => (
                <div className="set-event" key={`${ev.event_key}-${i}`}>
                  <span className="lb">{EVENT_LABELS[ev.event_type] || humanize(ev.event_type)}
                    <small>{ev.created_at ? new Date(ev.created_at).toLocaleDateString() : ''}</small>
                  </span>
                  <span className={`pt${ev.points ? '' : ' zero'}`}>{ev.points ? `+${ev.points}` : '0'} pts</span>
                </div>
              ))}
            </div>
          )}
        </section>

        {/* ── Preferences ── */}
        <section className="te-card set-section">
          <h3>Preferences</h3>
          <div className="set-row">
            <div>
              <div className="lab">Appearance</div>
              <div className="desc">Switch between light and dark. Your choice is remembered on this device.</div>
            </div>
            <button className="te-btn ghost sm" onClick={toggleTheme}>{theme === 'dark' ? 'Switch to light' : 'Switch to dark'}</button>
          </div>
        </section>

        {/* ── Security (passwordless) ── */}
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
      </div>
    </PortalShell>
  );
};

export default SettingsPage;
