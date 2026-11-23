import React from 'react';

/**
 * "This tab ignores the brand selector."
 *
 * ─── WHY A SAFETY NOTICE IS A COMPONENT AND NOT A PARAGRAPH ─────────────────
 *
 * Every other tab on this page is brand-scoped: it either shows that brand's
 * data or refuses. Two are not - Brain and Settings - because the surfaces
 * behind them are global by construction, not partitioned by brand.
 *
 * A global tab sitting underneath a brand selector is read as filtered by it.
 * That is the same misreading this entire workstream exists to prevent: the
 * first draft of `ScopeState` answered a 403 with "Showing all brands", which in
 * production would have rendered Colaberry Training's 1,191 learners under the
 * Colaberry Enterprise label. The failure there was not the fetch, it was a
 * label that did not match the data. Silence about scope is the same bug with
 * better manners.
 *
 * So it is one component rather than two paragraphs: the notice is
 * safety-critical copy, and two copies of safety-critical copy drift. When the
 * Brain's rules become brand-keyed, exactly one place stops saying this.
 *
 * ─── WHY IT IS A WARNING TONE AND NOT AN INFO TONE ──────────────────────────
 *
 * On the Brain tab, saving the rules changes what Maya says to EVERY brand. An
 * operator who believes they are editing Colaberry Enterprise's voice and is
 * actually editing Colaberry Training's as well needs to be stopped and read,
 * not gently informed. `warning` is the honest tone for an action with a wider
 * blast radius than the page implies.
 */

interface Props {
  /** What is global, in a few words: "Maya's rules", "the operating mode". */
  what: string;
  /** Whether a brand is currently chosen, which is when the mismatch can mislead. */
  brandName: string | null;
  /** The specifics for this tab. Kept as children so each one states its own facts. */
  children: React.ReactNode;
}

export default function GlobalScopeNotice({ what, brandName, children }: Props) {
  return (
    <div
      className="alert alert-warning d-flex gap-3 align-items-start"
      role="note"
      data-testid="gj-global-scope-notice"
    >
      <i className="ri-information-line fs-4 mt-1 flex-shrink-0" aria-hidden="true" />
      <div>
        <div className="fw-semibold mb-1">
          {what} {brandName ? 'is not scoped to this brand' : 'is shared by every brand'}
        </div>
        {/* The selected brand is NAMED when there is one. "This is not brand-scoped"
            is abstract; "the selector says Colaberry Enterprise and this is not
            Colaberry Enterprise's" is the sentence that actually stops someone. */}
        {brandName && (
          <div className="mb-2">
            The brand selector reads <strong>{brandName}</strong>, and this tab does not follow
            it.
          </div>
        )}
        <div className="small mb-0">{children}</div>
      </div>
    </div>
  );
}
