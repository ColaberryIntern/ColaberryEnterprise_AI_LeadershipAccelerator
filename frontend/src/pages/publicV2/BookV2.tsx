import React from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import { Claim, canShow } from '../../components/publicV2/Claim';
import './bookV2.css';

/**
 * BookV2 — /book. Trust Before Intelligence, and the three ideas from it that
 * shape every engagement.
 *
 * WHY A PAGE AND NOT JUST THE HOME BAND. The home page carries a short band
 * about the book already. It states the thesis and stops, which is right for a
 * home page; what it cannot do is show how the argument turns into the way an
 * engagement actually runs. That connection -- idea, then "so we do this" -- is
 * this page's whole job, and it is the reason the v5 site model adds /book as a
 * tenth page rather than extending the band.
 *
 * THE STATISTIC IS NOT OURS TO STATE. The model writes the book's subtitle as a
 * standalone line: "Why 95% of AI pilots fail. How 5% succeed." In the claims
 * registry that bare form is `research.95pct` -- NEEDS_VERIFICATION, with an
 * empty approvedRoutes list, meaning it may not ship on any route. What may
 * ship is `book.trust.attributed`: the same number as a statement about what
 * the book argues, which is VERIFIED against the published cover art. So the
 * citation below goes through <Claim>, and the whole hero is wrapped in
 * canShow() -- if that claim is ever pulled, this page's thesis disappears
 * rather than quietly degrading into an unattributed statistic.
 *
 * TWO THINGS THE MODEL ASKS FOR THAT ARE DELIBERATELY ABSENT. It has
 * "[Add a two-to-three sentence bio from Ram's approved materials.]" and
 * "[Add the purchase or download link.]". Neither is invented here. A bio and a
 * buy link are facts about a real person and a real product; writing plausible
 * ones would be fabrication, and shipping the bracketed placeholder text would
 * be worse. The page is coherent without them, and both are listed as the
 * outstanding inputs for this page.
 */

const ROUTE = '/book';

interface Idea {
  readonly n: string;
  readonly title: string;
  readonly why: string;
  readonly soWe: string;
}

/**
 * The three ideas. These are descriptions of how Colaberry works -- the same
 * category of statement as the service copy -- not claims about the world, and
 * each "so we" is something the site can already show you elsewhere.
 */
const IDEAS: readonly Idea[] = [
  {
    n: '01',
    title: 'Prove one before you scale ten.',
    why:
      'Pilots fail when they are announced as transformations. Trust comes from seeing one ' +
      'thing work.',
    soWe:
      'Start every Build and Guide engagement with a demo pilot on one real process.',
  },
  {
    n: '02',
    title: 'Work where the work already lives.',
    why:
      'AI that sits beside the business, in a separate tool, rarely becomes how the business ' +
      'runs.',
    soWe:
      'Build workflows inside your current systems, and applications designed around how ' +
      'you work.',
  },
  {
    n: '03',
    title: 'Measure what shipped, not who attended.',
    why: 'Capability that cannot be evidenced is not capability.',
    soWe:
      'Compute readiness from what your people build, rather than from course completion.',
  },
];

export function BookV2(): React.ReactElement {
  const thesisPublishable = canShow('book.trust.attributed', ROUTE);

  return (
    <>
      <SeoV2
        title="Trust before intelligence"
        description={
          'The book behind the method, and the three ideas from it that shape every ' +
          'Colaberry engagement: prove one before you scale ten, work where the work ' +
          'already lives, and measure what shipped rather than who attended.'
        }
      />

      <section className="cbv2-pagehero" aria-labelledby="cbv2-book-title">
        <div className="cbv2-wrap cbv2-bookhero">
          <figure className="cbv2-bookhero__cover">
            <img
              src="/site-v2/photos/book-cover.jpg"
              alt="Cover of Trust Before Intelligence, a book by Ram Katamaraja, CEO of Colaberry Inc., subtitled: why 95% of AI pilots fail, how 5% succeed."
              width={334}
              height={500}
              loading="eager"
              decoding="async"
            />
          </figure>
          <div>
            <p className="cbv2-breadcrumb">
              <Link to="/">Home</Link> / The book
            </p>
            <p className="cbv2-eyebrow cbv2-eyebrow--onDark">The book behind the method</p>
            <h1 id="cbv2-book-title">Trust before intelligence.</h1>

            {thesisPublishable ? (
              <p className="cbv2-pagehero__lede">
                <Claim claimKey="book.trust.attributed" route={ROUTE} />
              </p>
            ) : null}

            <p className="cbv2-bookhero__body">
              Ram Katamaraja&rsquo;s argument is the reason we work the way we do: an
              organization comes to trust its AI the same way it comes to trust its people,
              by seeing what they have actually shipped. That is why we start with a demo
              pilot you can watch running, and why we move one leader at a time instead of
              announcing a transformation.
            </p>
            <p className="cbv2-bookhero__by">
              Ram Katamaraja &middot; CEO, Colaberry
            </p>
          </div>
        </div>
      </section>

      <section className="cbv2-section" aria-labelledby="cbv2-ideas-h">
        <div className="cbv2-wrap">
          <p className="cbv2-eyebrow">From the page to the work</p>
          <h2 id="cbv2-ideas-h">Three ideas from the book that shape every engagement.</h2>

          <ol className="cbv2-ideas">
            {IDEAS.map((idea) => (
              <li className="cbv2-idea" key={idea.n}>
                <span className="cbv2-idea__n" aria-hidden="true">
                  {idea.n}
                </span>
                <h3 className="cbv2-idea__title">{idea.title}</h3>
                <p className="cbv2-idea__why">{idea.why}</p>
                <p className="cbv2-idea__so">
                  <span className="cbv2-idea__solabel">So we</span> {idea.soWe}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-book-cta">
        <div className="cbv2-wrap cbv2-wrap--narrow">
          <p className="cbv2-eyebrow">Start here</p>
          <h2 id="cbv2-book-cta">See the argument applied to one of your own processes.</h2>
          <p className="cbv2-lede">
            Bring one process and two numbers: what it costs you today, and what you need it
            to return. That is the demo pilot, and it is the first idea in the book doing its
            job.
          </p>
          <p style={{ marginTop: 'var(--space-6)' }}>
            <Link className="cbv2-btn cbv2-btn--primary" to="/contact">
              Book a demo pilot
            </Link>
          </p>
        </div>
      </section>
    </>
  );
}

export default BookV2;
