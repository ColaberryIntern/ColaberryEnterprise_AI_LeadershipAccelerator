import React, { useState } from 'react';
import * as lp from '../../../../services/landingPageApi';

/**
 * Build a landing page without leaving the post.
 *
 * WHAT THIS REPLACES. The "Build a landing page for this brand" button used to call
 * `navigate('/admin/marketing/landing-pages')` - it abandoned the composer. Anything typed and
 * not yet saved went with it, and the operator then had to find their way back and remember what
 * they had been doing. Ali's prototype (2026-10-07) fixes exactly this, and says so on the panel
 * itself: "Nothing in this post is lost while you do this."
 *
 * TWO PHASES, BECAUSE A PAGE IS READ BEFORE IT IS PUBLISHED. Writing the brief and approving the
 * result are different decisions, and collapsing them into one button is how a page with a
 * `[START DATE]` hole in it goes live. The preview phase is the generator's own output, rendered
 * by the same code that serves the public page.
 *
 * THE HONESTY SIGNALS ARE SHOWN, NOT SWALLOWED. The draft API already reports placeholders,
 * unverified claims, dropped sections and whether it needed repairing. Every one of those is a
 * reason not to publish yet, and the panel that hides them is the panel that ships a broken page
 * - which is precisely what happened on 2026-10-05.
 *
 * THE PREVIEW IS FETCHED, NOT FRAMED. This app authenticates with a Bearer token attached by an
 * axios interceptor, and a browser does not put that header on an iframe navigation - so a
 * `src=` here would 401 every time. The HTML is fetched where the interceptor runs and handed to
 * the iframe as `srcDoc`.
 */

export interface InlineLandingPageBuilderProps {
  brandId: string;
  /** The post's message, used as the opening brief so nobody retypes it. */
  initialBrief: string;
  /** A sensible starting name - usually the post's own title. */
  initialName: string;
  busy: boolean;
  onClose: () => void;
  /** The page is live and should become this post's destination. */
  onPublished: (page: lp.LandingPage) => void;
}

export function slugify(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60);
}

/** Enough of a brief to be worth generating from. Below this the model invents, which is the bug. */
export const MIN_BRIEF = 20;

type Phase =
  | { kind: 'form' }
  | { kind: 'working' }
  | { kind: 'preview'; draft: lp.LandingPageDraft; html: string | null };

export default function InlineLandingPageBuilder(props: InlineLandingPageBuilderProps) {
  const { brandId, initialBrief, initialName, busy, onClose, onPublished } = props;

  const [name, setName] = useState(initialName);
  const [slug, setSlug] = useState(slugify(initialName));
  const [slugTouched, setSlugTouched] = useState(false);
  const [brief, setBrief] = useState(initialBrief);
  const [feedback, setFeedback] = useState('');
  const [phase, setPhase] = useState<Phase>({ kind: 'form' });
  const [error, setError] = useState<string | null>(null);

  const canBuild = name.trim().length > 0 && brief.trim().length >= MIN_BRIEF && !busy;

  const loadPreview = async (id: string): Promise<string | null> => {
    try { return await lp.previewLandingPage(id); } catch { return null; }
  };

  const build = async () => {
    setError(null);
    setPhase({ kind: 'working' });
    try {
      const draft = await lp.createLandingPage({
        brand_id: brandId, source: brief.trim(), name: name.trim(), slug: slug.trim() || undefined,
      });
      setPhase({ kind: 'preview', draft, html: await loadPreview(draft.page.id) });
    } catch (err) {
      setError(lp.errorMessage(err, 'The page could not be built.'));
      setPhase({ kind: 'form' });
    }
  };

  const revise = async () => {
    if (phase.kind !== 'preview' || feedback.trim().length < 3) return;
    // Captured BEFORE the phase changes, so a failure can put back exactly what was on screen
    // rather than leaving the panel stuck on "working" with the draft lost.
    const current = phase;
    const id = current.draft.page.id;
    const previous = JSON.stringify(current.draft.content);

    setError(null);
    setPhase({ kind: 'working' });
    try {
      const draft = await lp.reviseLandingPage(id, feedback.trim(), brief.trim());
      setPhase({ kind: 'preview', draft, html: await loadPreview(id) });
      // Said plainly rather than implied by a silent re-render: a model that returns the same
      // page is indistinguishable from one that did the work, and the operator is left wondering
      // whether the button did anything. The feedback is KEPT in that case so it can be reworded
      // rather than retyped.
      if (JSON.stringify(draft.content) === previous) {
        setError('The model returned the same page - nothing changed. Name the section and what it should say instead.');
      } else {
        setFeedback('');
      }
    } catch (err) {
      setError(lp.errorMessage(err, 'The revision could not be applied.'));
      setPhase(current);
    }
  };

  const publish = async () => {
    if (phase.kind !== 'preview') return;
    setError(null);
    try {
      const res = await lp.publishLandingPage(phase.draft.page.id, slug.trim() || undefined);
      onPublished(res.page);
    } catch (err) {
      setError(lp.errorMessage(err, 'The page could not be published.'));
    }
  };

  const warnings = phase.kind === 'preview' ? [
    ...(phase.draft.placeholders ?? []).map((p) => `Fill in before publishing: ${p}`),
    ...(phase.draft.unverifiedClaims ?? []).map((c) => `Nothing in the brief supports this: ${c}`),
    ...(phase.draft.droppedSections ?? []).map((d) => `Left out: ${d}`),
  ] : [];

  return (
    <div className="border rounded-3 bg-light p-3 mt-2" data-testid="inline-lp-builder">
      <div className="d-flex justify-content-between align-items-start gap-2 mb-1">
        <strong className="small">
          {phase.kind === 'preview' ? 'Read it before it goes live' : 'New landing page'}
        </strong>
        <button type="button" className="btn btn-link btn-sm p-0" onClick={onClose} data-testid="inline-lp-close">
          {phase.kind === 'preview' ? 'Keep as draft' : 'Close'}
        </button>
      </div>
      <p className="small text-muted mb-3">Nothing in this post is lost while you do this.</p>

      {error && <div className="alert alert-warning py-2 small" role="alert" data-testid="inline-lp-error">{error}</div>}

      {(phase.kind === 'form' || phase.kind === 'working') && (
        <>
          <div className="row g-2">
            <div className="col-12 col-md-6">
              <label className="form-label small mb-1" htmlFor="inline-lp-name">Page name</label>
              <input
                id="inline-lp-name" className="form-control form-control-sm" value={name}
                disabled={phase.kind === 'working'} data-testid="inline-lp-name"
                onChange={(e) => {
                  setName(e.target.value);
                  // The address follows the name until somebody edits it themselves, after which
                  // it is theirs and must not be overwritten.
                  if (!slugTouched) setSlug(slugify(e.target.value));
                }}
              />
            </div>
            <div className="col-12 col-md-6">
              <label className="form-label small mb-1" htmlFor="inline-lp-slug">Web address</label>
              <input
                id="inline-lp-slug" className="form-control form-control-sm font-monospace" value={slug}
                disabled={phase.kind === 'working'} data-testid="inline-lp-slug"
                onChange={(e) => { setSlugTouched(true); setSlug(e.target.value); }}
              />
              <div className="form-text small font-monospace">/lp/&hellip;/{slug || '…'}</div>
            </div>
          </div>

          <label className="form-label small mb-1 mt-2" htmlFor="inline-lp-brief">What the page should say</label>
          <textarea
            id="inline-lp-brief" className="form-control form-control-sm" rows={4} value={brief}
            disabled={phase.kind === 'working'} data-testid="inline-lp-brief"
            onChange={(e) => setBrief(e.target.value)}
          />
          <div className="form-text small">
            Started from this post&rsquo;s message. Nothing is invented &mdash; a missing date or price
            becomes a visible placeholder.
          </div>

          <div className="d-flex align-items-center gap-2 mt-2">
            <button
              type="button" className="btn btn-sm btn-primary" disabled={!canBuild || phase.kind === 'working'}
              onClick={build} data-testid="inline-lp-build"
            >
              {phase.kind === 'working' ? 'Building…' : 'Build the page'}
            </button>
            {brief.trim().length < MIN_BRIEF && (
              <span className="small text-warning-emphasis" data-testid="inline-lp-brief-note">
                Write at least a couple of sentences.
              </span>
            )}
          </div>
        </>
      )}

      {phase.kind === 'preview' && (
        <>
          {warnings.length > 0 && (
            <div className="alert alert-warning py-2 small" data-testid="inline-lp-warnings">
              <ul className="mb-0 ps-3">{warnings.map((w) => <li key={w}>{w}</li>)}</ul>
            </div>
          )}
          {phase.draft.repaired && (
            <div className="small text-muted mb-2" data-testid="inline-lp-repaired">
              The first attempt did not validate and was repaired. Read it with that in mind.
            </div>
          )}

          {phase.html
            ? (
              <iframe
                title="Landing page preview"
                srcDoc={phase.html}
                className="w-100 border rounded bg-white"
                style={{ height: '18rem' }}
                data-testid="inline-lp-preview"
              />
            )
            : <div className="small text-muted" data-testid="inline-lp-preview-failed">The preview could not be loaded, so read it on the Landing pages screen before publishing.</div>}

          <div className="d-flex flex-wrap gap-2 mt-2">
            <input
              className="form-control form-control-sm flex-grow-1" style={{ minWidth: '12rem' }}
              placeholder="What should change? e.g. shorter headline" value={feedback}
              onChange={(e) => setFeedback(e.target.value)} data-testid="inline-lp-feedback"
            />
            <button type="button" className="btn btn-sm btn-outline-secondary" disabled={feedback.trim().length < 3} onClick={revise} data-testid="inline-lp-revise">
              Revise
            </button>
          </div>

          <button type="button" className="btn btn-sm btn-success mt-2" onClick={publish} data-testid="inline-lp-publish">
            Publish and use for this post
          </button>
        </>
      )}
    </div>
  );
}
