import React from 'react';
import { Link, useParams } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import { Claim } from '../../components/publicV2/Claim';
import { getSegment, type Segment } from '../../config/v2Segments';
import { trackEvent } from '../../utils/tracker';
import './segmentPageV2.css';

/**
 * SegmentPageV2 - one template, five buyer segments.
 *
 * WHY ONE COMPONENT. C5.1 settled the structure: the homepage tells one story and routes
 * five segments onward, and the segment pages share a template so they cannot drift into
 * five different arguments. The category noun moves per C2.1; the promise under it does
 * not. Four bands, in the order the wireframe set them.
 *
 * WHAT MAY APPEAR HERE. Every externally visible claim resolves through the C0.6 registry
 * via `<Claim>`, which renders nothing when a claim may not ship, so an unpublishable claim
 * becomes silence rather than a liability. Prose in `v2Segments` is deliberately
 * claim-free: it describes what the page offers, never a figure or a credential.
 *
 * THE SINGLE CALL TO ACTION carries `?segment=`, which C5.1 found the contact page does not
 * yet read. The parameter is emitted now so the attribution exists the moment ContactPage
 * learns to carry it into its metadata; until then the enquiry still arrives, just without
 * the door it came through. The click is instrumented either way.
 */

const CONTACT = '/contact';

function Band({ children, label }: { children: React.ReactNode; label: string }) {
  return (
    <section className="cbv2-section cbv2-seg__band" aria-label={label}>
      <div className="cbv2-wrap">{children}</div>
    </section>
  );
}

export function SegmentPageBody({ segment }: { segment: Segment }): React.ReactElement {
  const href = `${CONTACT}?segment=${encodeURIComponent(segment.slug)}`;

  const onEnquire = () => {
    trackEvent('cta_click', {
      cta_name: 'segment_enquiry',
      segment: segment.slug,
      page: `/${segment.slug}`,
    });
  };

  return (
    <>
      <SeoV2
        title={segment.seoTitle}
        description={segment.seoDescription}
        route={`/${segment.slug}`}
      />

      {/* Band 1 - the promise, in this segment's noun. */}
      <Band label="What we do for this segment">
        <p className="cbv2-seg__noun">{segment.noun}</p>
        <h1 className="cbv2-seg__lede">{segment.lede}</h1>
        {/* The locked C2.1 positioning, through the registry rather than retyped here. */}
        <p className="cbv2-seg__claim"><Claim claimKey="positioning.primary" /></p>
      </Band>

      {/* Band 2 - what this buyer gets. Three, not five. */}
      <Band label="What you get">
        <div className="cbv2-seg__gets">
          {segment.gets.map((g) => (
            <article className="cbv2-seg__get" key={g.h}>
              <h2>{g.h}</h2>
              <p>{g.body}</p>
            </article>
          ))}
        </div>
      </Band>

      {/* Band 3 - proof, framed as this buyer would check it. */}
      <Band label="Proof you can check">
        <h2 className="cbv2-seg__proofh">Proof you can check yourself</h2>
        <p className="cbv2-seg__proof">{segment.proof}</p>
        <p>
          <Link to="/proof" className="cbv2-seg__link">
            See the published records
          </Link>
        </p>
      </Band>

      {/* Band 4 - exactly one call to action, so the path is countable. */}
      <Band label="Talk to us">
        <div className="cbv2-seg__cta">
          <Link to={href} onClick={onEnquire} className="cbv2-seg__btn"
            data-track={`segment_${segment.slug}_enquiry`}>
            {segment.ctaLabel}
          </Link>
        </div>
      </Band>
    </>
  );
}

/**
 * The routed component.
 *
 * The slug comes in as a PROP rather than from the URL. Each segment is a static route, so
 * there is no `:slug` param to read: a dynamic route would have to sit above the other
 * public pages and would shadow them. The `useParams` fallback is there only so the
 * component still works if a dynamic route is ever added.
 *
 * Renders nothing for a slug that is not ready, which is what keeps an unwritten page off
 * the site even if somebody routes it early.
 */
export default function SegmentPageV2({ slug }: { slug?: string }): React.ReactElement | null {
  const params = useParams<{ slug: string }>();
  const key = slug ?? params.slug;
  const segment = key ? getSegment(key) : undefined;
  if (!segment) return null;
  return <SegmentPageBody segment={segment} />;
}
