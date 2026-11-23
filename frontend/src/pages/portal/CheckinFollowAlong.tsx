import React, { useEffect, useState } from 'react';
import type { FollowAlong } from '../../services/onboardingApi';

/**
 * The follow-along pieces of the class check-in page (2026-11-23).
 *
 * Ali asked for a class a beginner can follow from their own screen, on a phone (scan the QR)
 * or on a computer (click the link, then pop it out into a narrow window beside the broadcast):
 *   - FollowCard: the deck's plain-words card for the current slide (what is happening, what
 *     to do). Rendered as text nodes only; the backend has already capped every field.
 *   - GetClaudeHelp: how to get the Claude app or open Claude on the web, for someone who has
 *     never used it. Collapsed unless the slide asks for it (follow.install).
 *   - PopOutButton: on a wide screen, reopen this same page in a narrow side window, so the
 *     live broadcast keeps the rest of the screen. The pop-out shares this page's storage, so a
 *     guest pass or sign-in carries over and nobody checks in twice.
 *   - claudePromptUrl: a link that opens Claude on the web with the prompt already typed in.
 *
 * House style for new frontend files (frontendTypographyLint): no emoji and no dashes in the
 * copy written here. The card's icon comes from the deck's data, not from this file.
 */

const CLAUDE_NEW = 'https://claude.ai/new';
export const CLAUDE_INSTALL = {
  iphone: 'https://apps.apple.com/app/claude-by-anthropic/id6473753684',
  android: 'https://play.google.com/store/apps/details?id=com.anthropic.claude',
  web: 'https://claude.ai',
  desktop: 'https://claude.ai/download',
};

/** Claude on the web, with the prompt prefilled. Browsers cap URLs far above any class prompt. */
export function claudePromptUrl(prompt: string): string {
  return `${CLAUDE_NEW}?q=${encodeURIComponent(prompt)}`;
}

/** The window name the pop-out uses, so a second click reuses the same window. */
export const POPOUT_NAME = 'cb-follow';

export function FollowCard({ follow }: { follow: FollowAlong }): React.ReactElement {
  return (
    <div className="cbfa-card" data-testid="follow-card">
      {follow.step && <p className="cbfa-step">{follow.step}</p>}
      <div className="cbfa-head">
        {follow.icon && <span className="cbfa-icon" aria-hidden="true">{follow.icon}</span>}
        <h2 className="cbfa-heading">{follow.heading}</h2>
      </div>
      {follow.body && <p className="cbfa-body">{follow.body}</p>}
      {follow.bullets && follow.bullets.length > 0 && (
        <ol className="cbfa-list">
          {follow.bullets.map((b, i) => <li key={i}>{b}</li>)}
        </ol>
      )}
    </div>
  );
}

export function GetClaudeHelp({ openByDefault }: { openByDefault: boolean }): React.ReactElement {
  const [open, setOpen] = useState(openByDefault);
  // A slide that asks for the helper opens it; moving on does not snap it shut on someone reading.
  useEffect(() => { if (openByDefault) setOpen(true); }, [openByDefault]);
  return (
    <div className="cbfa-help" data-testid="get-claude">
      <button type="button" className="cbfa-help-toggle" onClick={() => setOpen((v) => !v)} aria-expanded={open}>
        {open ? 'Hide: how to get Claude' : 'New to Claude? Get it in one minute'}
      </button>
      {open && (
        <div className="cbfa-help-body">
          <p className="cbfa-help-title">On your phone</p>
          <ol className="cbfa-list">
            <li>Install the Claude app: <a href={CLAUDE_INSTALL.iphone} target="_blank" rel="noopener noreferrer">iPhone</a> or <a href={CLAUDE_INSTALL.android} target="_blank" rel="noopener noreferrer">Android</a>.</li>
            <li>Open it and sign in with your email.</li>
            <li>Come back to this page. When a prompt appears, tap Copy, then paste it into a new chat in Claude.</li>
          </ol>
          <p className="cbfa-help-title">On a computer</p>
          <ol className="cbfa-list">
            <li>Open <a href={CLAUDE_INSTALL.web} target="_blank" rel="noopener noreferrer">claude.ai</a> and sign in with your email. The <a href={CLAUDE_INSTALL.desktop} target="_blank" rel="noopener noreferrer">desktop app</a> works too.</li>
            <li>When a prompt appears here, click Open in Claude. It opens Claude with the prompt already typed. Press Enter.</li>
          </ol>
        </div>
      )}
    </div>
  );
}

/** True on a screen wide enough that a side window makes sense, and not already inside one. */
function canPopOut(): boolean {
  if (typeof window === 'undefined') return false;
  return window.innerWidth >= 900 && window.name !== POPOUT_NAME;
}

export function PopOutButton(): React.ReactElement | null {
  const [show, setShow] = useState(canPopOut);
  useEffect(() => {
    const onResize = () => setShow(canPopOut());
    window.addEventListener('resize', onResize);
    return () => window.removeEventListener('resize', onResize);
  }, []);
  if (!show) return null;
  const popOut = () => {
    const sw = window.screen?.availWidth || 1440;
    const sh = window.screen?.availHeight || 900;
    const w = Math.max(380, Math.round(sw / 4));
    window.open(window.location.href, POPOUT_NAME, `popup=yes,width=${w},height=${sh},left=${sw - w},top=0`);
  };
  return (
    <div className="cbfa-popout" data-testid="follow-popout">
      <button type="button" className="cbck-btn cbck-btn-ghost" onClick={popOut}>
        Open as a side window
      </button>
      <p className="cbck-text cbck-text-sub">Keep the live class on the rest of your screen and follow the steps here.</p>
    </div>
  );
}

export const CBFA_CSS = `
.cbfa-card{ width:100%; text-align:left; margin-top:18px; padding:16px 16px 14px; border-radius:16px;
  background:var(--surface-subtle); border:1px solid var(--border-subtle); border-left:5px solid var(--brand-accent, #E5121D); }
.cbfa-step{ margin:0 0 6px; font-size:12px; font-weight:800; letter-spacing:.06em; text-transform:uppercase; color:var(--brand-accent, #E5121D); }
.cbfa-head{ display:flex; align-items:center; gap:12px; }
.cbfa-icon{ font-size:30px; line-height:1; flex:none; }
.cbfa-heading{ margin:0; font-size:19px; line-height:1.3; font-weight:800; color:var(--text-strong); }
.cbfa-body{ margin:10px 0 0; font-size:15px; line-height:1.55; color:var(--text-body); }
.cbfa-list{ margin:10px 0 0; padding-left:22px; font-size:15px; line-height:1.55; color:var(--text-body); }
.cbfa-list li{ margin:4px 0; }
.cbfa-help{ width:100%; text-align:left; margin-top:14px; }
.cbfa-help-toggle{ width:100%; min-height:48px; border-radius:12px; border:1px dashed var(--border-subtle);
  background:transparent; color:var(--text-body); font-weight:700; font-size:15px; cursor:pointer; }
.cbfa-help-body{ margin-top:10px; padding:14px 16px; border-radius:12px; background:var(--surface-card); border:1px solid var(--border-subtle); }
.cbfa-help-title{ margin:6px 0 0; font-weight:800; font-size:14px; color:var(--text-strong); }
.cbfa-help a{ color:var(--brand-accent, #E5121D); font-weight:700; }
.cbfa-open{ display:flex; align-items:center; justify-content:center; width:100%; min-height:52px; margin-top:10px;
  border-radius:999px; background:#1f2937; color:#fff; font-weight:800; font-size:16px; text-decoration:none; }
.cbfa-popout{ width:100%; margin-top:14px; }
`;
