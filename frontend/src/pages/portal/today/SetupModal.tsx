import React from 'react';

export interface SetupStep {
  key: string;
  title: string;
  done: boolean;
  meta: string;
  pts: number;
  action: (() => void) | null;
}

export interface ReferralFriend {
  name: string;
  email: string;
}

interface SetupModalProps {
  onClose: () => void;
  steps: SetupStep[];
  busy: boolean;
  showUpload: boolean;
  setShowUpload: (v: boolean) => void;
  uploadName: string;
  fileRef: React.RefObject<HTMLInputElement>;
  onFilePicked: (file: File | null) => void;
  showReferral: boolean;
  setShowReferral: (v: boolean) => void;
  referralFriends: ReferralFriend[];
  referralSubmitted: boolean;
  addReferralRow: () => void;
  updateReferralRow: (i: number, field: 'name' | 'email', value: string) => void;
  removeReferralRow: (i: number) => void;
  submitReferralFriends: () => void;
  resetReferralForm: () => void;
}

/**
 * The onboarding checklist modal — extracted from TodayShell.tsx (which had
 * grown past the CLAUDE.md 500-line file ceiling) since this block is a
 * large, self-contained UI unit. All state stays owned by TodayShell; this
 * component is purely presentational plumbing for it.
 */
const SetupModal: React.FC<SetupModalProps> = ({
  onClose, steps, busy,
  showUpload, setShowUpload, uploadName, fileRef, onFilePicked,
  showReferral, setShowReferral, referralFriends, referralSubmitted,
  addReferralRow, updateReferralRow, removeReferralRow, submitReferralFriends, resetReferralForm,
}) => (
  <div className="te-setup-backdrop" onClick={onClose}>
    <div className="te-setup-modal" onClick={(e) => e.stopPropagation()} role="dialog" aria-modal="true" aria-label="Get set up">
      <div className="te-setup-modal-head">
        <div className="te-sec-title" style={{ margin: 0 }}>Get set up · earn your first points</div>
        <button type="button" className="te-setup-close" onClick={onClose} aria-label="Close">×</button>
      </div>

      <div className="te-queue">
        {steps.map((s) => (
          <button key={s.key} className={`te-step${s.done ? ' done' : ''}`} disabled={!s.action} onClick={s.action || undefined}>
            <span className="te-check">{s.done ? '✓' : ''}</span>
            <span className="b">
              <span className="tt">{s.title}</span>
              <span className="mt">
                {s.pts > 0 && <span className={`te-pts${s.done ? ' earned' : ''}`}>+{s.pts} pts</span>}
                {s.meta}
              </span>
            </span>
            {s.action && !s.done && <span style={{ color: 'var(--cherry)', fontWeight: 700 }}>→</span>}
          </button>
        ))}
      </div>

      {/* background upload — both resume and LinkedIn are uploads */}
      {showUpload && (
        <div className="te-card te-upload" style={{ marginTop: 14 }}>
          <div className="te-sec-title" style={{ margin: '0 0 4px' }}>Upload your background</div>
          <p className="te-muted" style={{ margin: '0 0 14px' }}>
            Two options, both uploads: your <b>resume</b>, or your <b>LinkedIn profile exported to PDF</b> (on LinkedIn:
            your profile → More → Save to PDF). We can't read your LinkedIn from a link.
          </p>
          <input ref={fileRef} type="file" accept=".pdf,.doc,.docx,.txt,.md" style={{ display: 'none' }}
            onChange={(e) => onFilePicked(e.target.files?.[0] || null)} />
          <button className="te-drop" type="button" onClick={() => fileRef.current?.click()} disabled={busy}>
            <span className="ic"><svg viewBox="0 0 24 24" width="22" height="22" fill="none"><path d="M12 16V4m0 0L8 8m4-4 4 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" /><path d="M4 16v2a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2v-2" stroke="currentColor" strokeWidth="2" strokeLinecap="round" /></svg></span>
            <span className="t">{uploadName || 'Choose a file'}</span>
            <span className="s">Resume or LinkedIn PDF · PDF, DOCX, or TXT</span>
          </button>
          <div style={{ display: 'flex', gap: 10, marginTop: 12 }}>
            <button className="te-btn ghost sm" onClick={() => setShowUpload(false)} disabled={busy}>Cancel</button>
          </div>
        </div>
      )}

      {/* recommend a friend — add 1+, submit once, celebrate with the same HUD burst */}
      {showReferral && (
        <div className="te-card te-upload" style={{ marginTop: 14 }}>
          {referralSubmitted ? (
            <div style={{ textAlign: 'center', padding: '8px 0' }}>
              <div className="te-check" style={{ background: 'var(--leaf)', borderColor: 'var(--leaf)', margin: '0 auto 10px' }}>✓</div>
              <div style={{ fontWeight: 700, fontSize: 15, color: 'var(--strong)' }}>Thanks! +25 points</div>
              <div className="te-muted" style={{ marginTop: 4 }}>We'll let them know you sent them.</div>
              <button type="button" className="te-btn ghost sm" style={{ marginTop: 14 }} onClick={resetReferralForm}>
                Close
              </button>
            </div>
          ) : (
            <>
              <div className="te-sec-title" style={{ margin: '0 0 4px' }}>Recommend a friend</div>
              <p className="te-muted" style={{ margin: '0 0 14px' }}>
                Know someone who'd love this program? Add their name and email — we'll do the rest.
              </p>
              {referralFriends.map((f, i) => (
                <div key={i} style={{ display: 'flex', gap: 8, marginBottom: 8 }}>
                  <input className="te-input" placeholder="Friend's name" value={f.name} disabled={busy}
                    onChange={(e) => updateReferralRow(i, 'name', e.target.value)} style={{ flex: 1 }} />
                  <input className="te-input" placeholder="Friend's email" type="email" value={f.email} disabled={busy}
                    onChange={(e) => updateReferralRow(i, 'email', e.target.value)} style={{ flex: 1 }} />
                  {referralFriends.length > 1 && (
                    <button type="button" className="te-setup-close" aria-label="Remove" disabled={busy}
                      onClick={() => removeReferralRow(i)}>×</button>
                  )}
                </div>
              ))}
              <button type="button" className="te-btn ghost sm" onClick={addReferralRow} disabled={busy} style={{ marginTop: 4 }}>
                + Add another friend
              </button>
              <div style={{ display: 'flex', gap: 10, marginTop: 14 }}>
                <button className="te-btn cherry sm" onClick={submitReferralFriends} disabled={busy}>Submit</button>
                <button className="te-btn ghost sm" onClick={() => setShowReferral(false)} disabled={busy}>Cancel</button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  </div>
);

export default SetupModal;
