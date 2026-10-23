import React, { useState } from 'react';
import type { PortfolioSlot } from './presentationApi';

/**
 * SHARING A DEMO OUTSIDE THE COHORT.
 *
 * WHY THIS IS NOT A ROW OF "SHARE TO LINKEDIN" BUTTONS THAT PASS A URL.
 * Every recording sits behind a signed, audience-checked URL that expires in ten
 * minutes, and the portal gallery it lives in needs a login. Handing LinkedIn
 * either address produces a post whose link shows a sign-in page to everyone who
 * clicks it — worse than no share button, because it looks like it worked.
 *
 * So the flow is the one that actually reaches an audience: the learner takes
 * their own file and uploads it natively, with a caption they can edit. Native
 * video is also what those platforms rank; a link out of a post is throttled on
 * every one of them.
 *
 * The composer links open the platform's own box with the caption prefilled. The
 * file cannot be attached programmatically — no platform permits that from a web
 * page — so the copy says plainly that they attach the download. Pretending
 * otherwise would be the same lie in a different place.
 */

export interface ShareSheetProps {
  slots: PortfolioSlot[];
  /** Overridable so a test does not depend on a real clipboard. */
  copy?: (text: string) => Promise<void>;
}

/** Public means published AND not withdrawn — the one state a peer can watch. */
export const publicSlots = (slots: PortfolioSlot[]): PortfolioSlot[] =>
  slots.filter((s) => s.recorded && s.shareState === 'published');

export const shareLabel = (n: number): string => {
  if (n === 0) return 'Share videos';
  return n === 1 ? 'Share 1 public video' : `Share ${n} public videos`;
};

export const captionFor = (typeLabel: string): string =>
  `Here is my ${typeLabel.toLowerCase()} for the AI project I am building. `
  + 'Feedback welcome.';

const LINKEDIN = 'https://www.linkedin.com/feed/?shareActive=true&text=';
const X_COMPOSER = 'https://twitter.com/intent/tweet?text=';

const defaultCopy = async (text: string): Promise<void> => {
  await navigator.clipboard.writeText(text);
};

const ShareSheet: React.FC<ShareSheetProps> = ({ slots, copy = defaultCopy }) => {
  const [open, setOpen] = useState(false);
  const [copied, setCopied] = useState<string | null>(null);
  const [copyFailed, setCopyFailed] = useState(false);

  const shareable = publicSlots(slots);
  const none = shareable.length === 0;

  const onCopy = async (typeId: string, text: string) => {
    setCopyFailed(false);
    try {
      await copy(text);
      setCopied(typeId);
    } catch {
      // A denied clipboard permission is the common case, not an exception.
      setCopyFailed(true);
    }
  };

  return (
    <div data-testid="ps-share">
      <button
        type="button"
        className="ps-btn ps-btn--soft"
        data-testid="ps-share-open"
        disabled={none}
        aria-expanded={open}
        onClick={() => setOpen((v) => !v)}
      >
        {shareLabel(shareable.length)}
      </button>

      {none && (
        <p className="ps-note ps-note--soft" data-testid="ps-share-none" style={{ margin: '8px 0 0' }}>
          Nothing is public yet. Switch a video to <strong>Public</strong> above and it becomes
          shareable here.
        </p>
      )}

      {open && !none && (
        <div className="ps-card" data-testid="ps-share-sheet" style={{ marginTop: 10 }}>
          <p className="ps-note ps-note--soft" style={{ margin: '0 0 10px' }}>
            Download the file and attach it to your post. Your classmates can watch it in the
            portal, but a link out of here asks everyone else to sign in — the file does not.
          </p>

          {shareable.map((s) => {
            const caption = captionFor(s.typeLabel);
            return (
              <div
                key={s.typeId}
                data-testid={`ps-share-row-${s.typeId}`}
                style={{
                  display: 'flex', flexWrap: 'wrap', alignItems: 'center', gap: 8,
                  padding: '10px 0', borderTop: '1px solid var(--ps-line, #e2e8f0)',
                }}
              >
                <strong style={{ flex: '1 1 160px' }}>{s.typeLabel}</strong>

                {s.downloadUrl && (
                  <a
                    className="ps-btn"
                    data-testid={`ps-share-download-${s.typeId}`}
                    href={s.downloadUrl}
                  >
                    ⬇ Download
                  </a>
                )}

                <button
                  type="button"
                  className="ps-btn ps-btn--quiet"
                  data-testid={`ps-share-caption-${s.typeId}`}
                  onClick={() => void onCopy(s.typeId, caption)}
                >
                  {copied === s.typeId ? 'Caption copied' : 'Copy caption'}
                </button>

                <a
                  className="ps-btn ps-btn--quiet"
                  data-testid={`ps-share-linkedin-${s.typeId}`}
                  href={`${LINKEDIN}${encodeURIComponent(caption)}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  LinkedIn
                </a>

                <a
                  className="ps-btn ps-btn--quiet"
                  data-testid={`ps-share-x-${s.typeId}`}
                  href={`${X_COMPOSER}${encodeURIComponent(caption)}`}
                  target="_blank"
                  rel="noreferrer noopener"
                >
                  X
                </a>
              </div>
            );
          })}

          {copyFailed && (
            <p className="ps-note" role="alert" data-testid="ps-share-copy-failed" style={{ margin: '8px 0 0' }}>
              Your browser would not let us use the clipboard. The caption is in the post box once
              you open LinkedIn or X.
            </p>
          )}
        </div>
      )}
    </div>
  );
};

export default ShareSheet;
