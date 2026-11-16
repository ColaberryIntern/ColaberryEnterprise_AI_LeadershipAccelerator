import React from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import HeroV8 from '../../components/publicV2/HeroV8';
import { Claim, canShow, SampleBadge } from '../../components/publicV2/Claim';
import Icon from '../../components/publicV2/Icon';
import ClosingCtaV5 from '../../components/publicV2/ClosingCtaV5';
// ENGINE was imported here and never used, from before this split. Removed rather than
// carried across, since a dead import is one more thing a reader has to rule out.
import { DemoPilotSection } from './homeV2Sections';
import { ThreeServicesSection } from './homeV2Bands';
import './homeV2.css';
import '../../components/publicV2/heroV8.css';
import '../../components/publicV2/engineModel.css';

/**
 * HomeV2 — the V2 homepage.
 *
 * Ten sections maximum. The approved design said nine; the tenth was added on
 * 2026-08-17 for the story-build band at Ali's direction. All marketing copy
 * resolves through the claims registry.
 *
 * NOTE ON WHAT IS ABSENT: the prototype's "Four roles, one system" console is
 * deliberately NOT here. It is the most striking element of the approved design,
 * but the capability does not exist yet, and the build-then-show decision
 * (BUILD_PLAN §0 option A) bars describing unbuilt capability in the present
 * tense. It returns when Phase 2 builds it. `surface.fourview.console` is
 * registry-blocked on `capability: 'unbuilt'`, so re-adding it here would render
 * nothing rather than silently over-claim.
 */

const ROUTE = '/';

function HomeV2(): React.ReactElement {
  return (
    <>
      <SeoV2
        title="We build, guide and train your company into AI."
        description={
          'A custom application designed around your business, or workflows that automate ' +
          'your processes inside the systems you already run. We find where the ROI is, ' +
          'prove it with a demo pilot, then keep going department by department.'
        }
      />

      {/* 1 ─────────────────────────────────────────────────────────── hero ── */}
      <HeroV8 />

      {/*
        THE OPERATING MODEL, MOVED UP. It used to sit below the goal chooser,
        five sections down. It is the thesis the hero states -- two engines, one
        owned capability -- so it now answers the hero directly instead of
        making a reader scroll past four other things to find out what we mean.
      */}
{/*
        THE "TWO ENGINES" BAND WAS REMOVED HERE, not moved.

        It explained the operating model -- two engines, one owned capability --
        as an abstraction, directly under a hero that now names the three
        services outright. The v5 site model replaces that abstraction with two
        concrete things: the three "we build it / we guide you / we train you"
        chips in the hero, and the department map immediately below, which shows
        the rollout rather than describing it.

        EngineModel is unrouted from this page but NOT deleted. Check what else
        imports it before removing the component.

        THE ROLLOUT GRID MOVED INTO THE HERO, it did not leave. The model puts
        "Your company, moving to AI / Department by department" inside the
        opening band; here it was a second dark band under a dark hero, reading
        as a chapter of its own. See `HeroV8.tsx`.
      */}

      {/*
          WHAT IS FOR SALE COMES THIRD, right after the rollout picture and
          before any proof or claims material. It used to sit two thirds of the
          way down, behind the book, the segment doors and the accolades, so a
          visitor met the evidence for the offer before the offer itself.
      */}
      <ThreeServicesSection />

      {/*
          HOW IT STARTS, immediately after WHAT IS SOLD. The three services
          raise the obvious question -- how does any of this begin -- and this
          band is the answer, so it belongs next to them rather than five
          sections further down behind the book and the accolades.

          The band itself replaced the second of two CTA interrupts rather than
          being added alongside it; both interrupts are now gone, so the page
          pushes to the workspace from the hero and the final CTA only.
      */}
      <DemoPilotSection />

      {/* 2a ─────────────────────────────────────────────────────────── book ── */}
      {/*
        MOVED here from below the engine section (was 6b) at Ali's direction
        2026-08-15. The book is the thesis the whole platform rests on, so it
        reads as the premise for "what we can put our name to" immediately
        below it -- rather than as a footnote after the reader has already
        been asked to act.
      */}
      {/*
        The strongest owned asset on the old site and V2 had no equivalent. The
        statistic is rendered as an ATTRIBUTED CITATION -- what the book argues --
        which is the only form the registry permits. `research.book95`, the same
        number stated as a bare fact in our own voice, stays blocked.
      */}
      {canShow('book.trust.attributed', ROUTE) ? (
        <section className="cbv2-rv cbv2-section cbv2-book" aria-labelledby="cbv2-book-title">
          <div className="cbv2-wrap cbv2-book__grid">
            <figure className="cbv2-book__cover">
              <img
                src="/site-v2/photos/book-cover.jpg"
                alt="Cover of Trust Before Intelligence, a book by Ram Katamaraja, CEO of Colaberry Inc., subtitled: why 95% of AI pilots fail, how 5% succeed."
                width={334}
                height={500}
                loading="lazy"
                decoding="async"
              />
            </figure>
            <div>
              <p className="cbv2-eyebrow cbv2-eyebrow--onDark">The book behind the method</p>
              <h2 id="cbv2-book-title" className="cbv2-book__h">
                Trust before <span className="cbv2-it">intelligence.</span>
              </h2>
              {/* The model's subtitle line states the 95% figure in our own voice, which is
                  `research.book95` and stays blocked. The attributed form sits in its place. */}
              <p className="cbv2-book__sub">
                <Claim claimKey="book.trust.attributed" route={ROUTE} />
              </p>
              <p className="cbv2-book__body">
                Ram Katamaraja&rsquo;s argument is the reason we work the way we do: an
                organization comes to trust its AI the same way it comes to trust its people, by
                seeing what they have actually shipped. That is why we start with a demo pilot you
                can see running, and why we move one leader at a time instead of announcing a
                transformation.
              </p>
              <ul className="cbv2-book__lessons">
                <li><b>In practice</b>Prove one process before scaling to ten.</li>
                <li><b>In practice</b>Work inside the systems you already run.</li>
                <li><b>In practice</b>Measure readiness by what shipped, not who attended.</li>
              </ul>
              <div className="cbv2-book__by">
                <span className="cbv2-book__av" aria-hidden="true">RK</span>
                <div>
                  <strong>Ram Katamaraja</strong>
                  <span>CEO, Colaberry &middot; author of Trust Before Intelligence</span>
                </div>
              </div>
              <p className="cbv2-book__btns">
                <Link className="cbv2-btn cbv2-btn--primary" to="/book">
                  About the book
                  <Icon name="arrowRight" size={16} />
                </Link>
              </p>
            </div>
          </div>
        </section>
      ) : null}

      {/*
        THE MID-PAGE CTA INTERRUPT WAS REMOVED.

        It pushed to the free workspace from the middle of the page, while the
        hero and the final CTA both already offer a way in, and the demo-pilot
        band below answers the same "what do I do next" question with an actual
        answer. Two interrupts on one page was the thing cut when the demo-pilot
        band landed; this is the last of them.
      */}

      {/*
        THE PLATFORM TEASER. Home had no band for it at all, while the model
        gives it one between the book and the claims. It is the only place on
        the home page that answers "and where does all of this show up".
      */}
      <section className="cbv2-rv cbv2-section cbv2-plat5" aria-labelledby="cbv2-plat-title">
        {/* `cbv2-split5`, not `cbv2-split`: platformV2.css also defines `.cbv2-split` (a
            bordered, clipped box), and once /platform had loaded it restyled this band. */}
        <div className="cbv2-wrap cbv2-split5">
          <div>
            <p className="cbv2-eyebrow">The platform</p>
            <h2 id="cbv2-plat-title" className="cbv2-h2">
              Every department&rsquo;s AI work, <span className="cbv2-it">in one place.</span>
            </h2>
            <p className="cbv2-lede">
              Which processes are automated, which are in pilot, who is building what, and
              what each leader&rsquo;s department has shipped, without anyone writing a status
              report.
            </p>
            <ul className="cbv2-ticks">
              <li>
                <span className="cbv2-ticks__ic"><Icon name="layers" size={19} /></span>
                <div><strong>Every project, by department</strong><span>Owner, status, and what it is waiting on.</span></div>
              </li>
              <li>
                <span className="cbv2-ticks__ic"><Icon name="shieldCheck" size={19} /></span>
                <div><strong>Confirmed from the work</strong><span>Progress read from commits, not self-reported.</span></div>
              </li>
              <li>
                <span className="cbv2-ticks__ic"><Icon name="trend" size={19} /></span>
                <div><strong>Your people&rsquo;s growth</strong><span>Training and readiness, earned from what they ship.</span></div>
              </li>
            </ul>
            <p className="cbv2-plat__go">
              <Link className="cbv2-lnk" to="/platform">
                Tour the platform
                <Icon name="arrowRight" size={15} />
              </Link>
            </p>
          </div>
          {/*
            The readiness dashboard, which moved here with the band it used to
            sit in. It still renders ONLY behind `surface.readiness.rollup`: it
            depicts a live product surface, and the gate that licenses that
            depiction travels with the image rather than being left behind. If
            that claim regresses this falls back to the accomplishments feed
            rather than showing an unlicensed surface.
          */}
          <figure className="cbv2-plat5__fig">
            {canShow('surface.readiness.rollup', ROUTE) ? (
              <img
                className="cbv2-shot"
                src="/site-v2/shot-hero-dashboard.png"
                alt="The organization readiness dashboard, showing average architect readiness, builder XP and evidence shipped for a sample company."
                loading="lazy"
                decoding="async"
              />
            ) : (
              <img
                className="cbv2-shot"
                src="/site-v2/shot-accomplishments.png"
                alt="The team accomplishments feed: a promotion to Architect after clearing the final evidence gate, a shipped portfolio artifact, validated evidence logged from a GitHub pull request, an evaluation passed at 86 percent, a seven-day build streak, and a most-improved entry."
                loading="lazy"
                decoding="async"
              />
            )}
            <figcaption className="cbv2-cap">
              <SampleBadge />
              <span>The company view, before your own work replaces it.</span>
            </figcaption>
          </figure>
        </div>
      </section>

      {/*
        ONE CLAIMS BAND, NOT TWO.

        "What we can state today" (the three cards) and "What we can put our
        name to" (the governed accolade tiles) were two consecutive bands saying
        the same thing twice. The model merges them, and names the merged band
        for what it is: short on purpose.

        THE FIVE DOORS CAME OFF THIS PAGE. The picker-replacement band (C5.2)
        routed by segment, which is right, but the model has no equivalent and
        home was three bands over. The segment pages are NOT orphaned by this:
        `PublicFooterV2` now carries them, generated from the same
        `readySegments()` the doors used and that `App.tsx` maps to routes, so a
        footer link still cannot point at a page that is not mounted.
        `SegmentDoors` is unrouted, not deleted.
      */}
      {/*
        THE STATS ROW CAME OFF (delta H6, Ali 2026-11-16). <Accolades /> rendered
        "8k+ data students / 2,500+ certified / 1,000+ hires / 12+ years" directly under
        a card saying track-record claims are withheld, and the model has no such row.
        The component is unrouted from this page, not deleted.
      */}
      <section
        className="cbv2-rv cbv2-section cbv2-section--soft"
        aria-labelledby="cbv2-shortonpurpose-title"
      >
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">What we can put our name to</p>
            <h2 id="cbv2-shortonpurpose-title">Short on purpose.</h2>
            <p className="cbv2-lede">
              Everything absent from this section is absent because it has not been verified
              yet.
            </p>
            <p className="cbv2-head-link">
              <Link className="cbv2-lnk" to="/proof">
                See the published case records
                <Icon name="arrowRight" size={15} />
              </Link>
            </p>
          </div>

          <div className="cbv2-pcs">
            <article className="cbv2-pc">
              <span className="cbv2-pc__ic"><Icon name="cpu" size={21} /></span>
              <h3 className="cbv2-pc__h">
                <Claim claimKey="anthropic.capability" route={ROUTE} />
              </h3>
              <p>Systems designed, built and governed on Anthropic&rsquo;s models, with the same tools your team will use.</p>
            </article>

            <article className="cbv2-pc">
              <span className="cbv2-pc__ic"><Icon name="medal" size={21} /></span>
              <h3 className="cbv2-pc__h">Claude Certified Architect, Foundations</h3>
              <p>
                <Claim claimKey="credential.cca.safe" route={ROUTE} />
              </p>
            </article>

            {/* Stating the absence is itself the honest move. It is not a placeholder. */}
            <article className="cbv2-pc cbv2-pc--w">
              <span className="cbv2-pc__ic"><Icon name="scale" size={21} /></span>
              <h3 className="cbv2-pc__h">Track-record claims withheld</h3>
              <p>
                Volume, partner and outcome claims stay off this page until they are verified,
                then they appear with the basis beside them.
              </p>
            </article>
          </div>
        </div>
      </section>

      {/*
        THE FREE-WORKSPACE BAND CAME OFF THIS PAGE.

        It was a third push to /try on a page whose hero and closing band both
        already offer it, and the model has no equivalent. Its figure was the
        only thing on it that was not a repeat, and that figure is now the
        platform teaser's, under the same `surface.readiness.rollup` gate it
        always carried. The `surface.free.workspace` claim still renders on
        /platform, so nothing left the site with the band.
      */}

      {/* 7 ── final CTA: the model's one closing band (delta S5), shared by every page that adopts it. */}
      <ClosingCtaV5 />
    </>
  );
}

export default HomeV2;

