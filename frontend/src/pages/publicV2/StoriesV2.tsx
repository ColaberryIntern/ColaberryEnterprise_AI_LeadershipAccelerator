import React from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import Icon from '../../components/publicV2/Icon';
import { EvidenceBadge } from '../../components/publicV2/Claim';
import { STORIES, STORIES_NOTICE } from '../../config/v2Stories';
import './storiesV2.css';

/**
 * StoriesV2 -- the case-study format, carrying placeholders until real stories
 * replace them.
 *
 * Every card renders an "Illustrative demo" badge through the shared
 * EvidenceBadge, and each one states the evidence a real version would need. The
 * live /case-studies page uses this same format with invented people presented
 * as real, which is why it is DO_NOT_PUBLISH -- the difference is the label, not
 * the layout.
 */
function StoriesV2(): React.ReactElement {
  return (
    <>
      <SeoV2
        title="What builders shipped"
        description={
          'The case-study format: the problem, what was built, and what changed. Currently ' +
          'worked examples, each labelled as an illustration.'
        }
      />

      <section className="cbv2-pagehero" aria-labelledby="cbv2-stories-title">
        <div className="cbv2-wrap">
          <p className="cbv2-eyebrow cbv2-eyebrow--onDark">Stories</p>
          <h1 id="cbv2-stories-title">Most people consume AI. These people build with it.</h1>
          <p className="cbv2-pagehero__lede">{STORIES_NOTICE}</p>
        </div>
      </section>

      <section className="cbv2-rv cbv2-section" aria-label="Builder stories">
        <div className="cbv2-wrap cbv2-stories">
          {STORIES.map((s) => (
            <article className="cbv2-story" key={s.slug}>
              <header className="cbv2-story__head">
                <span className="cbv2-icon-tile cbv2-icon-tile--blue">
                  <Icon name={s.icon} size={22} />
                </span>
                <div>
                  <p className="cbv2-story__who">
                    {s.who} <span className="cbv2-story__sector">{s.sector}</span>
                  </p>
                  <h2 className="cbv2-story__headline">{s.headline}</h2>
                </div>
                <EvidenceBadge evidence="illustrative" />
              </header>

              <div className="cbv2-story__body">
                <div className="cbv2-story__part">
                  <h3>The problem</h3>
                  <p>{s.problem}</p>
                </div>
                <div className="cbv2-story__part">
                  <h3>What they built</h3>
                  <p>{s.built}</p>
                </div>
                <div className="cbv2-story__part">
                  <h3>What changed</h3>
                  <p>{s.result}</p>
                </div>
              </div>

              {/* The part the live case studies omit, and the reason they are blocked. */}
              <p className="cbv2-story__needed">
                <strong>To publish this for real:</strong> {s.evidenceNeeded}
              </p>
            </article>
          ))}
        </div>
      </section>

      <section
        className="cbv2-rv cbv2-section cbv2-section--inverse"
        aria-labelledby="cbv2-stories-cta"
      >
        <div className="cbv2-wrap cbv2-wrap--narrow" style={{ textAlign: 'center' }}>
          <h2 id="cbv2-stories-cta">Write the next one.</h2>
          <p className="cbv2-lede" style={{ marginInline: 'auto' }}>
            Map the workflow you would want on this page, and a person will reply.
          </p>
          <div className="cbv2-hero__ctas" style={{ justifyContent: 'center' }}>
            <Link className="cbv2-btn cbv2-btn--primary" to="/v2/lab">
              Map an opportunity
            </Link>
            <Link className="cbv2-btn cbv2-btn--ghost" to="/v2/proof">
              Read the proof standard
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export default StoriesV2;
