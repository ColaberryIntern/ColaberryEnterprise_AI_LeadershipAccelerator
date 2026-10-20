import React from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import CtaInterrupt from '../../components/publicV2/CtaInterrupt';
import HeroV8 from '../../components/publicV2/HeroV8';
import EngineModel from '../../components/publicV2/EngineModel';
import { Claim, canShow, SampleBadge } from '../../components/publicV2/Claim';
import Icon from '../../components/publicV2/Icon';
import Accolades from '../../components/publicV2/Accolades';
import SegmentDoors from '../../components/publicV2/SegmentDoors';
// ENGINE was imported here and never used, from before this split. Removed rather than
// carried across, since a dead import is one more thing a reader has to rule out.
import { BuildPipelineSection, ServicesSection } from './homeV2Sections';
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
        title="Build the system. Build the people. Prove the capability."
        description={
          'Colaberry helps organizations identify high-value AI opportunities, deploy governed ' +
          'Claude-powered systems, and develop the people who will own them, through one ' +
          'connected platform.'
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
{/* 4 ────────────────────────────────────────── dual transformation ──── */}
      <section className="cbv2-rv cbv2-section cbv2-section--berry" aria-labelledby="cbv2-engine-title">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">The operating model</p>
            <h2 id="cbv2-engine-title">Two engines, one owned capability</h2>
            <p className="cbv2-lede">
              Most programmes build a system nobody can maintain, or train people with nothing
              real to build. These run together &mdash; and every stage hands off to the one
              beside it.
            </p>
          </div>

          <EngineModel />
        </div>
      </section>


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

      {/* 3 ─────────────────────────────────────────────────── goal chooser ── */}
      <CtaInterrupt
        eyebrow="Heard enough?"
        title="Stop reading about it. Go stand inside it."
        body="The workspace opens on sample data so there is something to look at on day one. No credit card, and no procurement conversation required to look."
      />

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

            {/* 4b ───────────────────────────────────────────────── idea to build ── */}
      {/*
        The story-build system. Three beats -- plan, build, verified -- ending on
        the repo, because the repo is the part a sceptical buyer can check.

        THE COPY IS BOUNDED BY WHAT THE PIPELINE DOES. It plans, prompts and
        verifies; the human writes the code. `renderDocs.ts` emits markdown and
        JSON and `repoWriter.ts` is path-allowlisted to docs/**, CLAUDE.md and
        .colaberry/**, so any wording implying the platform builds the project
        would be false and disprovable by opening the repo. Gated on
        `surface.storybuild`, so if that claim ever regresses the section
        disappears rather than going stale.
      */}
      {canShow('surface.storybuild', ROUTE) ? (
        <BuildPipelineSection />
      ) : null}

      {/* 5 ──────────────────────────────────────────────────────── services ── */}
      <CtaInterrupt
        eyebrow="Still with us?"
        title="The fastest way to judge this is to open it."
        body="Both experiences in one account: the management view, and the one your team actually works in. Invite people when it has earned it."
        primary={{ label: 'Open my company workspace, no card needed', to: '/try' }}
      />

        <ServicesSection />

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
              Talk to an Architect
            </Link>
          </div>
        </div>
      </section>
    </>
  );
}

export default HomeV2;
