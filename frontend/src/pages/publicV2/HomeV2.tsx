import React from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import HeroV8 from '../../components/publicV2/HeroV8';
import { Claim, canShow, SampleBadge } from '../../components/publicV2/Claim';
import Icon from '../../components/publicV2/Icon';
import Accolades from '../../components/publicV2/Accolades';
import SegmentDoors from '../../components/publicV2/SegmentDoors';
// ENGINE was imported here and never used, from before this split. Removed rather than
// carried across, since a dead import is one more thing a reader has to rule out.
import { DemoPilotSection } from './homeV2Sections';
import { DepartmentMapSection, ThreeServicesSection } from './homeV2Bands';
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
      */}

      <DepartmentMapSection />

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

      {/* 2 ──────────────────────────────────────── what we can state today ── */}
      <section className="cbv2-rv cbv2-section cbv2-section--sunken" aria-label="What we can state today">
        <div className="cbv2-wrap cbv2-grid cbv2-grid--3">
          <article className="cbv2-card">
            <span className="cbv2-icon-tile cbv2-icon-tile--blue">
              <Icon name="cpu" size={22} />
            </span>
            <p className="cbv2-eyebrow cbv2-eyebrow--info">Capability</p>
            <h2 className="cbv2-card__title">
              <Claim claimKey="anthropic.capability" route={ROUTE} />
            </h2>
            <p className="cbv2-card__body">
              Production systems designed, built and governed on Anthropic&rsquo;s models.
            </p>
          </article>

          <article className="cbv2-card">
            <span className="cbv2-icon-tile cbv2-icon-tile--green">
              <Icon name="medal" size={22} />
            </span>
            <p className="cbv2-eyebrow cbv2-eyebrow--info">Credential path</p>
            <h2 className="cbv2-card__title">Claude Certified Architect, Foundations</h2>
            <p className="cbv2-card__body">
              <Claim claimKey="credential.cca.safe" route={ROUTE} />
            </p>
          </article>

          {/* Stating the absence is itself the honest move, and it is the thing
              reviewers scored 9/10. It is not a placeholder. */}
          <article className="cbv2-card cbv2-card--dashed">
            <span className="cbv2-icon-tile cbv2-icon-tile--amber">
              <Icon name="scale" size={22} />
            </span>
            <p className="cbv2-eyebrow cbv2-eyebrow--warn">Pending verification</p>
            <h2 className="cbv2-card__title">Track-record claims withheld</h2>
            <p className="cbv2-card__body">
              Volume, partner-status and outcome claims are deliberately absent until verified.
            </p>
          </article>
        </div>
      </section>

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
              <p className="cbv2-eyebrow">The thesis behind the work</p>
              <h2 id="cbv2-book-title">Trust before intelligence</h2>
              <p className="cbv2-lede" style={{ marginTop: 'var(--space-4)' }}>
                <Claim claimKey="book.trust.attributed" route={ROUTE} />
              </p>
              <p className="cbv2-book__body">
                The argument the platform is built on: capability that cannot be evidenced is
                not capability, and an organization earns trust in its AI the same way it
                earns trust in its people, by seeing what they have actually shipped. That is
                why readiness here is computed from evidence rather than from attendance.
              </p>
              <p className="cbv2-book__by">Ram Katamaraja, CEO, Colaberry</p>
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
        THE FIVE DOORS, replacing the goal picker (C5.2).

        The picker asked "what are you trying to accomplish?" and routed by GOAL. The C5.1
        information architecture routes by SEGMENT, so it was the right job on the wrong
        axis. The section budget's standing rule is that the next section added must replace
        one rather than raise the count a third time, so this is a swap and the budget holds
        at twelve.

        The doors are GENERATED from readySegments(), the same source App.tsx maps to routes,
        so a door cannot point at a page that is not mounted.
      */}
      <section className="cbv2-rv cbv2-section" aria-labelledby="cbv2-doors-title">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">Start where you are</p>
            <h2 id="cbv2-doors-title">Who is this for?</h2>
            <p className="cbv2-lede">
              Four ways in, each written for the people who run that kind of program. They
              differ in what counts as proof, not in what we do.
            </p>
          </div>
          <SegmentDoors />
        </div>
      </section>

      {/*
        MOVED BELOW THE GOAL CHOOSER, and onto the sunken surface.

        Two white sections ran back to back here, so "Built for outcomes" and
        "Start where you are" bled into one another with nothing dividing them.
        The page alternates surfaces everywhere else; this restores that rhythm
        and gives the figures a ground of their own.
      */}
      {/* 3b ──────────────────────────────────────────────────── accolades ── */}
      {/*
        The live site's "built for outcomes" band, governed. Tiles render only
        while their claim is publishable, so the three currently-unevidenced
        accolades (careers launched, since-2012, the credential wording) appear
        the moment someone records the evidence, and stay absent until then.
      */}
      <section
        className="cbv2-rv cbv2-section cbv2-section--sunken"
        aria-labelledby="cbv2-accolades-title"
      >
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">Built for outcomes</p>
            <h2 id="cbv2-accolades-title">What we can put our name to</h2>
          </div>
          <Accolades />
        </div>
      </section>

            {/*
        THE BUILD-PIPELINE BAND WAS REMOVED from the home page. It is detail
        about how a build is planned and verified, which belongs on the service
        pages rather than in the first scroll. BuildPipelineSection still exists
        and is still gated on `surface.storybuild`.
      */}



      {/* 6 ────────────────────────────────────────── workspace ────── */}
      {canShow('surface.free.workspace', ROUTE) ? (
        <section
          className="cbv2-rv cbv2-section cbv2-section--sunken cbv2-section--spot"
          aria-labelledby="cbv2-free-title"
        >
          <div className="cbv2-wrap cbv2-split">
            <div>
              <p className="cbv2-eyebrow">Free to start</p>
              <h2 id="cbv2-free-title">
                <Claim claimKey="surface.free.workspace" route={ROUTE} />
              </h2>
              <p className="cbv2-lede" style={{ marginTop: 'var(--space-4)' }}>
                It opens on sample data, arranged in the metrics the product actually captures,
                so you are judging the real shape of the thing before anyone signs anything.
                Invite your team and the sample gives way to their own progress.
              </p>
              <p style={{ marginTop: 'var(--space-6)' }}>
                <Link className="cbv2-btn cbv2-btn--primary" to="/try">
                  Open the Free Company Workspace
                </Link>
              </p>
            </div>
            {/*
              The accomplishments feed: promotions, validated evidence, evaluations
              passed and streaks, each attached to a person. Chosen here over
              another chart because this is the screen that shows movement, which
              is what a manager is actually buying.
            */}
            {/*
              The readiness dashboard moved here when the hero became typographic.
              It still renders ONLY behind `surface.readiness.rollup`: it depicts a
              live product surface, and the gate that licenses that depiction has to
              travel with the image rather than being left behind in the hero. If
              that claim ever regresses, this falls back to the accomplishments feed
              rather than showing an unlicensed surface.
            */}
            <figure className="cbv2-shot-frame">
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
              <figcaption className="cbv2-shot-caption">
                <SampleBadge />
                <span>The company view, on sample data.</span>
              </figcaption>
            </figure>
          </div>
        </section>
      ) : null}

      {/* 7 ────────────────────────────────────────────────────── final CTA ── */}
      <section className="cbv2-rv cbv2-section cbv2-section--inverse" aria-labelledby="cbv2-cta-title">
        <div className="cbv2-wrap cbv2-wrap--narrow" style={{ textAlign: 'center' }}>
          <h2 id="cbv2-cta-title">See what AI could become inside your company.</h2>
          <p className="cbv2-lede" style={{ marginInline: 'auto' }}>
            Start free, or bring one workflow to an architect.
          </p>
          <div className="cbv2-hero__ctas" style={{ justifyContent: 'center' }}>
            <Link className="cbv2-btn cbv2-btn--primary" to="/try">
              Open the Free Company Workspace
            </Link>
            <Link className="cbv2-btn cbv2-btn--ghost" to="/contact">
              Book a demo pilot
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export default HomeV2;

