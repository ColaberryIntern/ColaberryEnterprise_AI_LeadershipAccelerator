import React from 'react';
import { Link } from 'react-router-dom';

/**
 * The closing offer on the published-records index.
 *
 * EXTRACTED, NOT INVENTED. `storiesV2Contract.test.ts` holds `StoriesV2.tsx` under
 * 400 lines, and adding the evidence-standard band pushed it past that. The
 * repo's rule for a file at its ceiling is to split before adding, not to raise
 * the number - so the band's arrival paid for this extraction rather than
 * charging it to the budget.
 *
 * This block is the right thing to lift: it takes no props, reads no state and
 * has no relationship to the records above it. It is the page's last section and
 * nothing else on the page depends on it.
 *
 * THE SECOND BUTTON POINTS AT `/platform`, NOT `/proof`. It read "Read the proof
 * standard" and pointed at `/proof` back when that was a different page. The
 * records took that route over, so the link became a self-link - and the standard
 * it offered to go and read is now a band a few screens up.
 */
export function StoriesCta(): React.ReactElement {
  return (
    <section
      className="cbv2-rv cbv2-section cbv2-section--inverse"
      aria-labelledby="cbv2-stories-cta"
    >
      <div className="cbv2-wrap cbv2-wrap--narrow cbv2-stories__cta">
        <h2 id="cbv2-stories-cta">Bring us a workflow worth improving.</h2>
        <p className="cbv2-lede">
          Map the workflow you would want recorded here, and a person will reply.
        </p>
        <div className="cbv2-stories__actions">
          <Link className="cbv2-btn cbv2-btn--primary" to="/lab">
            Map an opportunity
          </Link>
          <Link className="cbv2-btn cbv2-btn--ghost" to="/platform">
            See the platform
          </Link>
        </div>
      </div>
    </section>
  );
}

export default StoriesCta;
