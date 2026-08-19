import React from 'react';
import { linkify } from './communityUtils';

// Renders a member-authored plain-text body with its URLs and email addresses
// promoted to real anchors, so students can act on an announcement instead of
// copy-pasting out of it.
//
// Deliberately builds React elements from typed segments rather than setting
// innerHTML: post bodies are user input, so the only markup that ever reaches
// the DOM is the anchor constructed here. Whitespace is preserved by the
// caller's `white-space:pre-wrap`, which is why the text segments are emitted
// verbatim rather than trimmed or re-joined.
const RichText: React.FC<{ text: string }> = ({ text }) => (
  <>
    {linkify(text).map((segment, i) => {
      if (segment.kind === 'text') {
        return <React.Fragment key={i}>{segment.value}</React.Fragment>;
      }
      if (segment.kind === 'email') {
        // Same tab: a mailto: hand-off to the mail client should not leave an
        // orphaned blank tab behind in the browser.
        return (
          <a key={i} className="cm-link cm-link-email" href={segment.href}>
            {segment.value}
          </a>
        );
      }
      return (
        <a key={i} className="cm-link" href={segment.href} target="_blank" rel="noopener noreferrer">
          {segment.value}
        </a>
      );
    })}
  </>
);

export default RichText;
