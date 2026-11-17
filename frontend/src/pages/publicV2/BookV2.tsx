import React from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import Icon from '../../components/publicV2/Icon';
import { Claim, canShow } from '../../components/publicV2/Claim';
import ClosingCtaV5 from '../../components/publicV2/ClosingCtaV5';

/**
 * BookV2: /book. Trust Before Intelligence, and the three ideas from it that
 * shape every engagement.
 *
 * WHY A PAGE AND NOT JUST THE HOME BAND. The home band states the thesis and
 * stops. This page shows how the argument turns into the way an engagement runs:
 * idea, then "so we do this".
 *
 * LAYOUT IS THE MODEL'S (2026-11-16, page group 3). The hero is the same dark
 * book band Home uses (`.cbv2-book`, fidelityV5.css section 6), with an `h1` at
 * the model's 84px; then the three idea cards, the author band with the "Get
 * your copy" card, and the shared closing band (ClosingCtaV5).
 *
 * THE STATISTIC IS NOT OURS TO STATE. The model writes the subtitle as a
 * standalone line: "Why 95% of AI pilots fail. How 5% succeed." In the claims
 * registry that bare form may not ship on any route. What may ship is
 * `book.trust.attributed`: the same number as a statement about what the book
 * argues. So the subtitle goes through <Claim>, and it is dropped, not
 * rewritten, if that claim is ever pulled.
 *
 * TWO THINGS THE MODEL ASKS FOR THAT ARE DELIBERATELY ABSENT. It has
 * "[Add a two-to-three sentence bio from Ram's approved materials.]" and
 * "[Add the purchase or download link.]". Neither is invented here: a bio and a
 * buy link are facts about a real person and a real product. The author band
 * keeps the parts that are known (name, role, how to ask for a copy) and
 * "Get the book" goes to that card rather than to a store that is not named yet.
 */

const ROUTE = '/book';

interface Idea {
  readonly n: string;
  readonly title: string;
  readonly why: string;
  readonly soWe: string;
}

/**
 * The three ideas. Descriptions of how Colaberry works, the same category of
 * statement as the service copy, not claims about the world.
 */
const IDEAS: readonly Idea[] = [
  {
    n: '01',
    title: 'Prove one before you scale ten.',
    why:
      'Pilots fail when they are announced as transformations. Trust comes from seeing one ' +
      'thing work.',
    soWe: 'Start every Build and Guide engagement with a demo pilot on one real process.',
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
    soWe: 'Compute readiness from what your people build, not from course completion.',
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

      <section className="cbv2-section cbv2-book cbv2-bookpage5" aria-labelledby="cbv2-book-title">
        <div className="cbv2-wrap cbv2-book__grid">
          <figure className="cbv2-book__cover">
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
            <p className="cbv2-crumb5 cbv2-bookpage5__crumb">
              <Link to="/">Home</Link> / The book
            </p>
            <p className="cbv2-eyebrow cbv2-eyebrow--onDark">The book behind the method</p>
            <h1 id="cbv2-book-title" className="cbv2-book__h cbv2-bookpage5__h">
              Trust before <span className="cbv2-it">intelligence.</span>
            </h1>
            {thesisPublishable ? (
              <p className="cbv2-book__sub">
                <Claim claimKey="book.trust.attributed" route={ROUTE} />
              </p>
            ) : null}
            <p className="cbv2-book__body">
              Ram Katamaraja&rsquo;s argument is the reason we work the way we do: an
              organization comes to trust its AI the same way it comes to trust its people, by
              seeing what they have actually shipped. That is why we start with a demo pilot you
              can see running, and why we move one leader at a time instead of announcing a
              transformation.
            </p>
            <div className="cbv2-book__by">
              <span className="cbv2-book__av" aria-hidden="true">RK</span>
              <div>
                <strong>Ram Katamaraja</strong>
                <span>CEO, Colaberry &middot; author of Trust Before Intelligence</span>
              </div>
            </div>
            <p className="cbv2-book__btns cbv2-btns5">
              <a className="cbv2-btn cbv2-btn--primary" href="#cbv2-book-copy">
                Get the book
                <Icon name="arrowRight" size={16} />
              </a>
              <a className="cbv2-btn cbv2-btn--line cbv2-btn--onDark" href="#cbv2-ideas">
                The ideas in practice
              </a>
            </p>
          </div>
        </div>
      </section>

      <section className="cbv2-section" id="cbv2-ideas" aria-labelledby="cbv2-ideas-h">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">From the page to the work</p>
            <h2 id="cbv2-ideas-h">
              Three ideas from the book{' '}
              <span className="cbv2-it">that shape every engagement.</span>
            </h2>
          </div>

          <ol className="cbv2-ideas5">
            {IDEAS.map((idea) => (
              <li className="cbv2-idea5" key={idea.n}>
                <span className="cbv2-idea5__n" aria-hidden="true">
                  {idea.n}
                </span>
                <h3 className="cbv2-idea5__t">{idea.title}</h3>
                <p className="cbv2-idea5__p">{idea.why}</p>
                <p className="cbv2-idea5__then">
                  <b>So we</b>
                  {idea.soWe}
                </p>
              </li>
            ))}
          </ol>
        </div>
      </section>

      <section className="cbv2-section cbv2-section--soft" aria-labelledby="cbv2-author-h">
        <div className="cbv2-wrap cbv2-split5">
          <div>
            <p className="cbv2-eyebrow">About the author</p>
            <h2 id="cbv2-author-h" className="cbv2-h2 cbv2-author5__h">
              Ram Katamaraja
            </h2>
            <p className="cbv2-lede">CEO of Colaberry, and the author of Trust Before Intelligence.</p>
            <p className="cbv2-btns5">
              <Link className="cbv2-btn cbv2-btn--primary" to="/demo-pilot">
                Talk to us about the ideas
                <Icon name="arrowRight" size={16} />
              </Link>
            </p>
          </div>
          <div className="cbv2-pc cbv2-copy5" id="cbv2-book-copy">
            <p className="cbv2-k5">Where to get it</p>
            <h3 className="cbv2-copy5__h">Get your copy</h3>
            <p>
              Leaders who book a demo pilot can ask for a copy as part of the first
              conversation.
            </p>
            <p className="cbv2-copy5__go">
              <Link className="cbv2-lnk" to="/demo-pilot">
                Book a demo pilot
                <Icon name="arrowRight" size={16} />
              </Link>
            </p>
          </div>
        </div>
      </section>

      <ClosingCtaV5 />
    </>
  );
}

export default BookV2;
