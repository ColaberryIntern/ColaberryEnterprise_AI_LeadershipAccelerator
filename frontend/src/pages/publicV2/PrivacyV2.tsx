import React from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import { TRACKING_KEYS } from '../../config/v2Consent';
import './privacyV2.css';

/**
 * PrivacyV2 -- what this site collects, described from the code that collects it.
 *
 * WHY IT IS WORDED AS A TECHNICAL NOTICE AND NOT A PRIVACY POLICY
 * Every statement below was read out of `utils/tracker.ts`, `services/utmService.ts`,
 * `services/campaignAttributionService.ts` and `services/leadService.ts`, so it is
 * verifiable by anyone with the repository. What it deliberately does NOT contain
 * is legal position-taking -- retention periods, lawful basis, processor lists,
 * data-subject rights procedures, or promises about sale and sharing. Those are
 * commitments the business makes, not facts I can read out of the source, and
 * inventing them would be the same defect as inventing a customer testimonial.
 *
 * This page therefore satisfies "tell people what is collected" and explicitly
 * does not claim to be the complete policy. The footer said a Privacy Policy
 * existed and linked to a route that did not resolve, which was worse than
 * silence because it implied a document nobody had written.
 */

const ROUTE = '/privacy';

function PrivacyV2(): React.ReactElement {
  return (
    <>
      <SeoV2
        title="What we collect"
        description={
          'A plain description of what this site records, when it records it, and how to ' +
          'stop it. Written from the code that does the collecting.'
        }
        route={ROUTE}
      />

      <section className="cbv2-pagehero" aria-labelledby="cbv2-priv-title">
        <div className="cbv2-wrap">
          <p className="cbv2-eyebrow cbv2-eyebrow--onDark">Data</p>
          <h1 id="cbv2-priv-title">What this site collects</h1>
          <p className="cbv2-pagehero__lede">
            Described from the code that does the collecting, so you can check it rather
            than trust it.
          </p>
        </div>
      </section>

      <section className="cbv2-section" aria-labelledby="cbv2-priv-nothing">
        <div className="cbv2-wrap cbv2-wrap--narrow">
          <h2 id="cbv2-priv-nothing">If you decline, nothing starts</h2>
          <p className="cbv2-prose">
            Measurement is off until you allow it. Declining also deletes anything a
            previous visit stored. No measurement runs on this page while your answer is
            still outstanding.
          </p>
        </div>
      </section>

      <section className="cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-priv-allow">
        <div className="cbv2-wrap cbv2-wrap--narrow">
          <h2 id="cbv2-priv-allow">If you allow it</h2>
          <p className="cbv2-prose">Each page view sends the following to our own servers:</p>
          <ul className="cbv2-list">
            <li>
              <strong>A device id.</strong> Your browser name and version string, screen
              size, timezone and language are hashed into a 64-character identifier. It is
              stored in your browser and is stable across visits until it is deleted.
            </li>
            <li>
              <strong>Your full browser identification string</strong>, plus the device
              category, browser and operating system derived from it.
            </li>
            <li>
              <strong>The address of each page you view</strong>, including anything in the
              query string, along with the time, how long the page was visible and how far
              you scrolled.
            </li>
            <li>
              <strong>Your email address, if the link you followed contained one.</strong>{' '}
              Links in our email campaigns carry it. When one does, the record above is
              connected to you by name, not held anonymously. This is the part people are
              usually surprised by, which is why it is stated here rather than buried.
            </li>
            <li>
              <strong>A campaign identifier</strong> where you arrived from a specific
              campaign, retained in your browser for 30 days.
            </li>
          </ul>
        </div>
      </section>

      <section className="cbv2-section" aria-labelledby="cbv2-priv-forms">
        <div className="cbv2-wrap cbv2-wrap--narrow">
          <h2 id="cbv2-priv-forms">If you fill in a form</h2>
          <p className="cbv2-prose">
            The Opportunity Lab sends what you typed: your name, work email, organization,
            role, the size band and timeline you selected, your description of the process,
            and the fact that you agreed to be contacted. It does <strong>not</strong> attach
            the device id described above, and it computes no score about you.
          </p>
          <p className="cbv2-prose">
            Form submissions are limited to five in fifteen minutes from one address, which
            is a spam control rather than a measurement.
          </p>
        </div>
      </section>

      <section className="cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-priv-stop">
        <div className="cbv2-wrap cbv2-wrap--narrow">
          <h2 id="cbv2-priv-stop">How to stop it</h2>
          <p className="cbv2-prose">
            Clearing site data for this domain removes everything listed here. The specific
            entries are:
          </p>
          <ul className="cbv2-list cbv2-list--mono">
            {TRACKING_KEYS.map((k) => (
              <li key={k}>{k}</li>
            ))}
          </ul>
          <p className="cbv2-prose">
            Declining the banner removes all of them for you and stops new ones being
            written.
          </p>
        </div>
      </section>

      <section className="cbv2-section" aria-labelledby="cbv2-priv-scope">
        <div className="cbv2-wrap cbv2-wrap--narrow">
          <h2 id="cbv2-priv-scope">What this page is not</h2>
          <p className="cbv2-prose">
            This is a factual description of what the software does. It is not a complete
            privacy policy: it does not set retention periods, name the lawful basis for
            processing, list processors, or describe how to exercise data-subject rights.
            Those are commitments that need to be written and signed off by the business,
            and stating them here without that would be inventing them.
          </p>
          <p className="cbv2-prose">
            Questions about any of it, or a request to remove your data, go to{' '}
            <Link to="/v2/lab">the contact form</Link>.
          </p>
        </div>
      </section>
    </>
  );
}

export default PrivacyV2;
