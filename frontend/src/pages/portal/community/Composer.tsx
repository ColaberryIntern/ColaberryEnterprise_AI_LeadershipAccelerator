import React, { useRef, useState } from 'react';
import Avatar from './Avatar';
import { CommunityMemberProfile } from '../../../services/communityApi';

export interface ComposerSubmit {
  body: string;
  category: string;
  media_urls: string[];
}

// Collapsed -> expanded composer (Design E). Collapsed is a single "write
// something" affordance; clicking anywhere expands to the full editor. onSubmit
// returns whether the post succeeded so the composer only clears/collapses on
// success and otherwise preserves the draft (no lost text on a failed post).
const Composer: React.FC<{
  me: CommunityMemberProfile | null;
  categories: readonly string[];
  defaultCategory: string;
  onSubmit: (input: ComposerSubmit) => Promise<boolean>;
}> = ({ me, categories, defaultCategory, onSubmit }) => {
  const [expanded, setExpanded] = useState(false);
  const [body, setBody] = useState('');
  const [category, setCategory] = useState(defaultCategory);
  const [media, setMedia] = useState<string[]>([]);
  const [showMediaInput, setShowMediaInput] = useState(false);
  const [mediaUrl, setMediaUrl] = useState('');
  const [busy, setBusy] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  const expand = () => {
    setExpanded(true);
    // Focus after the textarea has actually mounted.
    setTimeout(() => textareaRef.current?.focus(), 0);
  };

  const reset = () => {
    setBody('');
    setMedia([]);
    setMediaUrl('');
    setShowMediaInput(false);
    setCategory(defaultCategory);
    setExpanded(false);
  };

  const addMedia = () => {
    const url = mediaUrl.trim();
    if (!url) return;
    // Cheap client-side guard; the backend re-validates every url and caps at 10.
    let ok = false;
    try { const u = new URL(url); ok = u.protocol === 'http:' || u.protocol === 'https:'; } catch { ok = false; }
    if (!ok || media.length >= 10 || media.includes(url)) { setMediaUrl(''); return; }
    setMedia((m) => [...m, url]);
    setMediaUrl('');
  };

  const canPost = !!body.trim() && !busy;

  const submit = async () => {
    if (!canPost) return;
    setBusy(true);
    try {
      const ok = await onSubmit({ body: body.trim(), category, media_urls: media });
      if (ok) reset();
    } finally {
      setBusy(false);
    }
  };

  if (!expanded) {
    return (
      <div className="te-card cm-composer collapsed">
        <Avatar name={me?.display_name || 'You'} src={me?.avatar_url} />
        <button type="button" className="cm-composer-trigger" onClick={expand}>
          Share a win, ask for help, or start a discussion…
        </button>
      </div>
    );
  }

  return (
    <div className="te-card cm-composer expanded">
      <div className="cm-composer-head">
        <Avatar name={me?.display_name || 'You'} src={me?.avatar_url} />
        <div>
          <div className="cm-composer-name">{me?.display_name || 'You'}</div>
          <div className="cm-composer-audience">Posting to your cohort</div>
        </div>
      </div>

      <textarea
        ref={textareaRef}
        value={body}
        onChange={(e) => setBody(e.target.value)}
        placeholder="What do you want to share with your cohort?"
        maxLength={10000}
        aria-label="Post body"
      />

      {media.length > 0 && (
        <div className="cm-composer-media">
          {media.map((url) => (
            <div className="cm-composer-media-item" key={url}>
              <img src={url} alt="" />
              <button type="button" aria-label="Remove image" onClick={() => setMedia((m) => m.filter((u) => u !== url))}>×</button>
            </div>
          ))}
        </div>
      )}

      {showMediaInput && (
        <div className="cm-composer-media-input">
          <input
            value={mediaUrl}
            onChange={(e) => setMediaUrl(e.target.value)}
            onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addMedia(); } }}
            placeholder="Paste an image or video URL…"
            aria-label="Media URL"
          />
          <button type="button" onClick={addMedia}>Add</button>
        </div>
      )}

      <div className="cm-composer-actions">
        <button
          type="button"
          className={`cm-composer-tool${showMediaInput ? ' active' : ''}`}
          onClick={() => setShowMediaInput((v) => !v)}
        >
          <svg viewBox="0 0 24 24" fill="none"><rect x="3" y="4" width="18" height="16" rx="2" stroke="currentColor" strokeWidth="2" /><circle cx="8.5" cy="9.5" r="1.5" fill="currentColor" /><path d="M4 17l5-5 4 4 3-3 4 4" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /></svg>
          Photo / video
        </button>
        <select value={category} onChange={(e) => setCategory(e.target.value)} aria-label="Post category">
          {categories.map((c) => <option key={c} value={c}>{c}</option>)}
        </select>
        <span className="spacer" />
        <span className="cm-composer-count">{body.length}/10000</span>
        <button type="button" className="cm-composer-cancel" onClick={reset} disabled={busy}>Cancel</button>
        <button type="button" className="te-btn cherry sm" onClick={submit} disabled={!canPost}>
          {busy ? 'Posting…' : 'Post'}
        </button>
      </div>
    </div>
  );
};

export default Composer;
