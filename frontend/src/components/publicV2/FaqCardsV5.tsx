import React from 'react';

/**
 * FaqCardsV5 - the model's FAQ (`.faq`): two columns of cards that open in place.
 *
 * Shared by /services, the three service pages and /how-it-works, so every page's
 * questions read the same way. Styled by `.cbv2-faq5` in fidelityV5.css.
 */
export default function FaqCardsV5({
  items,
}: {
  items: readonly { q: string; a: string }[];
}): React.ReactElement {
  return (
    <div className="cbv2-faq5">
      {items.map((f) => (
        <details key={f.q}>
          <summary>{f.q}</summary>
          <p>{f.a}</p>
        </details>
      ))}
    </div>
  );
}
