import React, { useEffect, useRef, useState } from 'react';

/**
 * Type-to-filter over the published records.
 *
 * IT IS A CONTROLLED INPUT WITH A LOCAL DRAFT, AND THE DRAFT IS THE POINT.
 * The committed value lives in the URL, because filter state on this page is
 * shareable (`?q=audit&stack=typescript`). But writing every keystroke to the
 * URL would push a history entry per character and re-issue a request per
 * character. So the box keeps what the reader is typing, and commits it after a
 * pause.
 *
 * `DEBOUNCE_MS` is 250: long enough that a typed word is one request rather than
 * five, short enough that the list feels like it is reacting to typing rather
 * than to submitting. There is no search button, and that is deliberate - a
 * button implies the list is stale until you press it.
 *
 * THE PROP RESYNCS THE DRAFT. `value` changing from outside - Clear filters, the
 * back button, a pasted URL - has to win over whatever is in the box, or the
 * input keeps showing a query the results no longer reflect. The effect below is
 * that resync, and it is why this is not simply `useState(value)`.
 */

const DEBOUNCE_MS = 250;

export interface StoriesSearchProps {
  /** The committed query, from the URL. */
  value: string;
  /** Called with the trimmed query when typing settles. */
  onCommit: (next: string) => void;
  /** Rendered under the field: what the current query matched. */
  resultNote?: string | null;
}

export function StoriesSearch({
  value,
  onCommit,
  resultNote = null,
}: StoriesSearchProps): React.ReactElement {
  const [draft, setDraft] = useState(value);
  /* The committed value this component last saw, so an outside change can be
     told apart from the echo of our own commit coming back through the URL. */
  const committed = useRef(value);

  useEffect(() => {
    if (value !== committed.current) {
      committed.current = value;
      setDraft(value);
    }
  }, [value]);

  useEffect(() => {
    if (draft === committed.current) return undefined;
    const timer = window.setTimeout(() => {
      committed.current = draft;
      onCommit(draft.trim());
    }, DEBOUNCE_MS);
    return () => window.clearTimeout(timer);
  }, [draft, onCommit]);

  return (
    <div className="cbv2-stories__search" data-testid="stories-search">
      <label className="cbv2-stories__search-label" htmlFor="cbv2-stories-q">
        Search the records
      </label>
      <input
        id="cbv2-stories-q"
        className="cbv2-stories__search-input"
        type="search"
        /* `search` rather than `text` so a browser offers its own clear control,
           and autoComplete off because a proof library is not a form field a
           reader wants their previous entries suggested into. */
        autoComplete="off"
        placeholder="e.g. audit trail, SQL Server, typescript"
        value={draft}
        onChange={(event) => setDraft(event.target.value)}
      />
      {/* Polite, not assertive: the count changing under a reader who is still
          typing should not interrupt what their screen reader is saying. */}
      <p className="cbv2-stories__search-note" aria-live="polite">
        {resultNote ?? ''}
      </p>
    </div>
  );
}

export default StoriesSearch;
