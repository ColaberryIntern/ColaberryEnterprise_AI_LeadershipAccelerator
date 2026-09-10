import React, { useMemo, useState } from 'react';
import { SectionCard } from '../shell';

/**
 * CaseStudyHeroVideoPanel — put your own video at the top of the record.
 *
 * Ali, 2026-09-10: "an option somewhere in the Case Study settings to replace the default
 * video with a video of my own from youtube or vimeo that can be added and would
 * automatically replace the hero video."
 *
 * IT WRITES THE WHOLE `walkthroughVideo` SECTION, not `walkthroughVideo.embedUrl`. Overrides
 * refuse a path whose PARENT is absent — "edit a field the snapshot already carries" — and a
 * record with no generated walkthrough has no parent to hang a nested key on. Writing the
 * section always works, because its parent is the content root.
 *
 * THE SERVER IS THE AUTHORITY ON WHAT MAY BE FRAMED. The check below is for immediate
 * feedback while typing; `videoEmbed.parseVideoEmbed` re-parses on publication against a host
 * allowlist and silently drops anything that no longer passes. That is deliberate
 * duplication with a clear direction: this side may be more permissive and be corrected, it
 * must never be more permissive in a way that ships — because it cannot ship anything.
 */

export interface HeroVideoState {
  /** The generated walkthrough, when the record has one. */
  readonly url?: string | null;
  readonly title?: string | null;
  /** Set when an operator has already chosen their own video. */
  readonly embedUrl?: string | null;
  readonly provider?: string | null;
  readonly watchUrl?: string | null;
}

interface Props {
  video: HeroVideoState | null;
  busy: boolean;
  onApplyOverride: (path: string, value: unknown, note?: string) => void;
}

/**
 * A permissive shape check, for the Save button only. Deliberately looser than the server's
 * parser: this cannot enforce anything, so its job is to stop obvious typos rather than to
 * pretend to be a security boundary.
 */
export function looksLikeProviderUrl(raw: string): 'youtube' | 'vimeo' | null {
  const s = raw.trim();
  if (!s) return null;
  let host: string;
  try {
    host = new URL(/^[a-z][a-z0-9+.-]*:/i.test(s) ? s : `https://${s}`)
      .hostname.toLowerCase().replace(/^www\./, '');
  } catch {
    return null;
  }
  if (host === 'youtu.be' || host === 'youtube.com' || host === 'youtube-nocookie.com'
    || host === 'm.youtube.com') return 'youtube';
  if (host === 'vimeo.com' || host === 'player.vimeo.com') return 'vimeo';
  return null;
}

export default function CaseStudyHeroVideoPanel({ video, busy, onApplyOverride }: Props) {
  const [url, setUrl] = useState('');
  const [title, setTitle] = useState('');

  const current = video || null;
  const usingCustom = Boolean(current?.embedUrl);
  const hasGenerated = Boolean(current?.url);
  const detected = useMemo(() => looksLikeProviderUrl(url), [url]);
  const canSave = Boolean(detected) && !busy;

  const save = () => {
    if (!detected) return;
    onApplyOverride(
      'walkthroughVideo',
      {
        // The parser fills provider/embedUrl/watchUrl server-side from this. Sending only
        // what an operator actually supplied keeps this panel from being a second place
        // where embed URLs are constructed.
        embedUrl: url.trim(),
        title: title.trim() || current?.title || 'Walkthrough',
      },
      'Hero video replaced with an operator-supplied video',
    );
    setUrl('');
    setTitle('');
  };

  const restore = () => {
    if (!hasGenerated) return;
    onApplyOverride(
      'walkthroughVideo',
      { url: current?.url, title: current?.title || 'Walkthrough' },
      'Hero video restored to the generated walkthrough',
    );
  };

  return (
    <SectionCard
      title="Hero video"
      icon="movie-2-line"
      subtitle="The video at the top of the published record. Paste a YouTube or Vimeo link to use your own instead of the generated walkthrough."
    >
      <div className="mb-3 small">
        <span className="text-muted me-2">Currently showing:</span>
        {usingCustom ? (
          <>
            <span className="badge bg-primary me-2">
              {current?.provider === 'vimeo' ? 'Vimeo' : 'YouTube'}
            </span>
            {/* SHOW THE LINK THAT IS ACTUALLY STORED.
                This used to render `watchUrl`, which the SNAPSHOT never carries — it is
                derived by the public projection, not saved. So a record with a video showed
                a bare "YouTube" badge and nothing else, and the panel read as though the
                save had not taken. `embedUrl` is what was written, so it is what is shown,
                falling back to watchUrl on records that happen to carry one. */}
            <a
              href={current?.watchUrl || current?.embedUrl || undefined}
              target="_blank"
              rel="noreferrer"
              className="text-break"
            >
              {current?.watchUrl || current?.embedUrl}
            </a>
          </>
        ) : hasGenerated ? (
          <span className="badge bg-secondary">Generated walkthrough</span>
        ) : (
          <span className="text-muted">No video on this record yet.</span>
        )}
      </div>

      <div className="row g-2 align-items-end">
        <div className="col-12 col-lg-7">
          <label className="form-label small mb-1" htmlFor="cs-hero-video-url">
            YouTube or Vimeo link
          </label>
          <input
            id="cs-hero-video-url"
            className="form-control form-control-sm"
            placeholder="https://www.youtube.com/watch?v=… or https://vimeo.com/…"
            value={url}
            onChange={(e) => setUrl(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="col-12 col-lg-3">
          <label className="form-label small mb-1" htmlFor="cs-hero-video-title">
            Title <span className="text-muted">(optional)</span>
          </label>
          <input
            id="cs-hero-video-title"
            className="form-control form-control-sm"
            placeholder="Walkthrough"
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            disabled={busy}
          />
        </div>
        <div className="col-12 col-lg-2 d-grid">
          <button className="btn btn-sm btn-primary" onClick={save} disabled={!canSave}>
            Use this video
          </button>
        </div>
      </div>

      {url.trim() && !detected && (
        <p className="small text-danger mt-2 mb-0">
          That is not a YouTube or Vimeo link. Those are the two providers both published
          sites allow to be embedded.
        </p>
      )}
      {detected && (
        <p className="small text-muted mt-2 mb-0">
          Detected <strong>{detected === 'vimeo' ? 'Vimeo' : 'YouTube'}</strong>. Saving creates
          a new snapshot version, which has to be approved before it reaches the public record.
        </p>
      )}

      {usingCustom && hasGenerated && (
        <div className="mt-3 pt-3 border-top">
          <button className="btn btn-sm btn-outline-secondary" onClick={restore} disabled={busy}>
            Restore the generated walkthrough
          </button>
          <span className="small text-muted ms-2">
            Puts the platform&apos;s narrated video back in the hero.
          </span>
        </div>
      )}
    </SectionCard>
  );
}
