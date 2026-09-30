import React, { useCallback, useEffect, useState } from 'react';
import portalApi from '../../utils/portalApi';
import type { TimelineFeedCard } from './TimelineCard';

/**
 * SkillsJarPanel — the Anthropic Skills Course experience, rendered identically
 * in the student feed card AND the detail drawer (one component, can't diverge).
 * Shows the branded "Anthropic · SkillsJar" panel, an Open-in-SkillsJar button,
 * and a certificate upload that AI-verifies before completing the card.
 *
 * `preview` (admin) disables the live upload. `onComplete` fires after a valid
 * certificate so the surrounding surface can mark the card done + refresh.
 */

function totalPoints(p: TimelineFeedCard['points']): number {
  return (p.learning || 0) + (p.builder || 0) + (p.community || 0);
}

interface Props {
  card: TimelineFeedCard;
  preview?: boolean;
  onComplete?: () => Promise<void> | void;
}

const SkillsJarPanel: React.FC<Props> = ({ card, preview, onComplete }) => {
  const course = card.course || null;
  // 'progress' = interim part of a split course (upload a progress screenshot);
  // default 'certificate' = whole-course completion certificate.
  const isProgress = course?.completion === 'progress';
  const pts = totalPoints(card.points);
  const done = card.status === 'completed';
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<{ valid: boolean; reason: string } | null>(null);
  const [certUrl, setCertUrl] = useState<string | null>(null); // co-branded cert (object URL)
  useEffect(() => { setResult(null); setBusy(false); }, [card.id]);

  // Fetch the co-branded certificate (Colaberry logo) for download/share.
  const loadCert = useCallback(async () => {
    if (preview) return;
    try {
      const r = await portalApi.get(`/api/portal/runtime/cards/${card.id}/certificate`, { responseType: 'blob' });
      setCertUrl((prev) => { if (prev) URL.revokeObjectURL(prev); return URL.createObjectURL(r.data); });
    } catch { /* none yet */ }
  }, [card.id, preview]);
  // Load the branded cert on open when the card is already complete (cert mode only).
  useEffect(() => { if (done && !preview && !isProgress) loadCert(); }, [done, preview, isProgress, loadCert]);
  useEffect(() => () => { if (certUrl) URL.revokeObjectURL(certUrl); }, [certUrl]);

  const onPick = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    e.target.value = '';
    if (!file || preview) return;
    setBusy(true); setResult(null);
    try {
      const fd = new FormData();
      fd.append('file', file);
      const r = await portalApi.post(`/api/portal/runtime/cards/${card.id}/certificate`, fd, { headers: { 'Content-Type': 'multipart/form-data' } });
      const d = r.data || {};
      const okMsg = isProgress ? 'Progress verified.' : 'Certificate verified.';
      const noMsg = isProgress ? 'That does not look like a course-progress screenshot.' : 'That does not look like a valid certificate.';
      setResult({ valid: !!d.valid, reason: d.reason || (d.valid ? okMsg : noMsg) });
      if (d.valid) { if (d.branded) await loadCert(); if (onComplete) await onComplete(); }
    } catch (err: any) {
      setResult({ valid: false, reason: err?.response?.data?.error || 'Upload failed — please try again.' });
    } finally { setBusy(false); }
  };

  const shareText = `I completed ${course?.name || 'an Anthropic Skills course'} — verified through the Colaberry AI Systems Architect Accelerator. 🎓`;
  const openShare = (url: string) => window.open(url, '_blank', 'noopener,noreferrer');

  return (
    <div className="tld-skilljar" onClick={(e) => e.stopPropagation()}>
      <div className="tld-jarcard">
        <span className="tld-jarbadge">● SKILLSJAR COURSE</span>
        <svg className="tld-jarcap" viewBox="0 0 24 24" fill="none" aria-hidden="true">
          <path d="M12 3l10 4.5-10 4.5L2 7.5z" stroke="currentColor" strokeWidth="1.5" strokeLinejoin="round" />
          <path d="M6 10.2v4.3c0 1.7 2.7 3 6 3s6-1.3 6-3v-4.3" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <path d="M22 7.5v5" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" />
          <circle cx="22" cy="13.2" r="1.1" fill="currentColor" />
        </svg>
        <div className="tld-jarbrand">Anthropic · SkillsJar</div>
        <div className="tld-jarfoot">
          <div className="tld-jarname">{course?.name || card.title}</div>
          <div className="tld-jarkind">{isProgress ? 'External course · progress checkpoint' : 'External course · cert required'}</div>
        </div>
      </div>

      {course?.sections && (
        <div className="tld-note" style={{ marginBottom: 8 }}><b>This part covers:</b> {course.sections}</div>
      )}

      {course?.url
        ? <a className="tl-btn primary tld-jaropen" href={course.url} target="_blank" rel="noreferrer">Open in SkillsJar ↗</a>
        : <div className="tld-note">No course link attached yet. An admin can add one from Orchestration → Timeline.</div>}

      {done && isProgress ? (
        <div className="tld-certmsg ok">✓ Progress verified — this part is complete{pts > 0 ? ` · +${pts} pts earned` : ''}.</div>
      ) : done ? (
        <>
          <div className="tld-certmsg ok">✓ Certificate verified — course complete{pts > 0 ? ` · +${pts} pts earned` : ''}.</div>
          {certUrl && (
            <div className="tld-certshare">
              <div className="tld-uplab" style={{ textAlign: 'left' }}>Your Colaberry-verified certificate</div>
              <img className="tld-certimg" src={certUrl} alt="Your co-branded certificate" />
              <div className="tld-sharerow">
                <a className="tl-btn ghost" href={certUrl} download="colaberry-certificate.png">⬇ Download</a>
                <button type="button" className="tl-btn ghost" onClick={() => openShare(`https://www.linkedin.com/feed/?shareActive=true&text=${encodeURIComponent(shareText)}`)}>Share on LinkedIn</button>
                <button type="button" className="tl-btn ghost" onClick={() => openShare(`https://twitter.com/intent/tweet?text=${encodeURIComponent(shareText)}`)}>Share on X</button>
              </div>
              <p className="tld-desc muted" style={{ margin: '8px 0 0', fontSize: 12.5 }}>Download the certificate, then attach it to your post.</p>
            </div>
          )}
        </>
      ) : preview ? (
        <div className="tld-note">For students, this has <b>Open in SkillsJar</b> and {isProgress
          ? <>a <b>progress-screenshot upload</b> (AI-verified) for this interim part of the course.</>
          : <>a <b>certificate upload</b> that AI-verifies, co-brands with the Colaberry logo, and lets them share to social.</>}</div>
      ) : isProgress ? (
        <div className="tld-upload">
          <div className="tld-uplab">Upload a screenshot of your progress to complete</div>
          <p className="tld-desc muted" style={{ margin: '0 0 12px', fontSize: 13.5 }}>
            This part of the course is on SkillsJar. Work through the sections above, then upload a screenshot of your progress (e.g. “X of N lessons completed”) to mark this complete{pts > 0 ? ` and earn +${pts} pts` : ''}. You’ll upload the full certificate in the final week.
          </p>
          <label className={`tl-btn ghost tld-choosecert${busy ? ' busy' : ''}`}>
            {busy ? 'Checking your screenshot…' : '⬆ Choose progress screenshot'}
            <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={onPick} disabled={busy} style={{ display: 'none' }} />
          </label>
          {result && <div className={`tld-certmsg ${result.valid ? 'ok' : 'err'}`}>{result.valid ? '✓ ' : '✗ '}{result.reason}</div>}
        </div>
      ) : (
        <div className="tld-upload">
          <div className="tld-uplab">Upload your certificate to complete</div>
          <p className="tld-desc muted" style={{ margin: '0 0 12px', fontSize: 13.5 }}>
            The course is delivered on SkillsJar. Take it there, then upload your completion certificate to mark this complete{pts > 0 ? ` and earn +${pts} pts` : ''}.
          </p>
          <label className={`tl-btn ghost tld-choosecert${busy ? ' busy' : ''}`}>
            {busy ? 'Checking your certificate…' : '⬆ Choose certificate'}
            <input type="file" accept="image/png,image/jpeg,image/webp,application/pdf" onChange={onPick} disabled={busy} style={{ display: 'none' }} />
          </label>
          {result && <div className={`tld-certmsg ${result.valid ? 'ok' : 'err'}`}>{result.valid ? '✓ ' : '✗ '}{result.reason}</div>}
        </div>
      )}
    </div>
  );
};

export default SkillsJarPanel;
