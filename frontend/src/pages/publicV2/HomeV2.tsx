import React, { useState, useRef } from 'react';
import { Link } from 'react-router-dom';
import SeoV2 from '../../components/publicV2/SeoV2';
import HeroV8 from '../../components/publicV2/HeroV8';
import EngineModel from '../../components/publicV2/EngineModel';
import GoalDiagram, { GoalKey } from '../../components/publicV2/GoalDiagram';
import { Claim, canShow, SampleBadge } from '../../components/publicV2/Claim';
import Icon from '../../components/publicV2/Icon';
import Accolades from '../../components/publicV2/Accolades';
import { GOALS, ENGINE } from '../../config/v2Content';
// SERVICE_DETAILS rather than v2Content's SERVICES: the cards now carry the
// photograph, which only the detail records hold. The two lists are the same
// five engagements in the same order, and HomeV2.test asserts they stay in sync.
import { SERVICE_DETAILS } from '../../config/v2Services';
import './homeV2.css';
import '../../components/publicV2/heroV8.css';
import '../../components/publicV2/engineModel.css';
import '../../components/publicV2/goalDiagram.css';

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
  const [goalKey, setGoalKey] = useState<string>(GOALS[0].key);
  const goal = GOALS.find((g) => g.key === goalKey) ?? GOALS[0];
  const tabRefs = useRef<Array<HTMLButtonElement | null>>([]);

  /**
   * Keyboard navigation for the goal tablist, per the WAI-ARIA tabs pattern.
   *
   * Arrows wrap in both directions and Home/End jump to the ends. Selection
   * follows focus (the panel changes as you arrow), which is the right choice
   * here because switching panels is instant and local -- nothing is fetched, so
   * there is no cost to landing on a tab you did not want.
   *
   * Vertical arrows are handled as well as horizontal because this row collapses
   * to a single column on narrow screens, where Down is the direction the layout
   * implies.
   */
  const onTabKeyDown = (e: React.KeyboardEvent<HTMLButtonElement>, index: number): void => {
    const last = GOALS.length - 1;
    let next: number | null = null;
    if (e.key === 'ArrowRight' || e.key === 'ArrowDown') next = index === last ? 0 : index + 1;
    else if (e.key === 'ArrowLeft' || e.key === 'ArrowUp') next = index === 0 ? last : index - 1;
    else if (e.key === 'Home') next = 0;
    else if (e.key === 'End') next = last;
    if (next === null) return;
    e.preventDefault(); // stop Arrow/Home/End from scrolling the page instead
    setGoalKey(GOALS[next].key);
    tabRefs.current[next]?.focus();
  };

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

      {/* 2b ──────────────────────────────────────────────────── accolades ── */}
      {/*
        The live site's "built for outcomes" band, governed. Tiles render only
        while their claim is publishable, so the three currently-unevidenced
        accolades (careers launched, since-2012, the credential wording) appear
        the moment someone records the evidence, and stay absent until then.
      */}
      <section className="cbv2-rv cbv2-section" aria-labelledby="cbv2-accolades-title">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">Built for outcomes</p>
            <h2 id="cbv2-accolades-title">What we can put our name to</h2>
          </div>
          <Accolades />
        </div>
      </section>

      {/* 3 ─────────────────────────────────────────────────── goal chooser ── */}
      <section className="cbv2-rv cbv2-section" aria-labelledby="cbv2-goal-title">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">Start where you are</p>
            <h2 id="cbv2-goal-title">What are you trying to accomplish?</h2>
            <p className="cbv2-lede">
              Pick the outcome you need next. The recommended service, the proof we would show
              you, and the next step all adapt.
            </p>
          </div>

          {/*
            Tabs rather than four loose buttons: the selected one connects to the
            panel below with a notch, so the answer is visibly the consequence of
            the choice. `role="tablist"` because that is what this is -- one
            selection revealing one panel.

            The role is a PROMISE about keyboard behaviour, not a free upgrade:
            declaring it tells a screen-reader user "arrows move between tabs and
            Tab leaves the group", so both halves have to be built by hand --
            onKeyDown below, and the roving tabindex that makes the group a
            single tab stop. Shipped without them, the role is worse than no role
            at all, because it advertises navigation that does not respond.
          */}
          <div className="cbv2-goalpicker" role="tablist" aria-label="Choose a goal">
            {GOALS.map((g, i) => (
              <button
                key={g.key}
                type="button"
                role="tab"
                id={`cbv2-goal-tab-${g.key}`}
                ref={(el) => { tabRefs.current[i] = el; }}
                aria-selected={g.key === goalKey}
                aria-controls="cbv2-goal-panel"
                tabIndex={g.key === goalKey ? 0 : -1}
                className={`cbv2-goalcard${g.key === goalKey ? ' is-active' : ''}`}
                onClick={() => setGoalKey(g.key)}
                onKeyDown={(e) => onTabKeyDown(e, i)}
              >
                <span className="cbv2-goalcard__icon">
                  <Icon name={g.icon} size={22} />
                </span>
                <span className="cbv2-goalcard__label">{g.label}</span>
                <span className="cbv2-goalcard__hint">{g.hint}</span>
              </button>
            ))}
          </div>

          {/*
            One composed answer rather than four equal boxes. The previous version
            put each field in its own card of equal height, which left the short
            ones (the service name) with a large hole beneath the text. Here the
            recommendation leads at display size, the reasoning and the proof sit
            beside it as a numbered read, and the next step is its own footer.

            `key={goal.key}` re-mounts the panel on change, which is what drives
            the entrance animation -- and it means the animation cannot get stuck
            mid-transition if someone clicks quickly.
          */}
          <div
            className="cbv2-answer"
            id="cbv2-goal-panel"
            role="tabpanel"
            aria-labelledby={`cbv2-goal-tab-${goal.key}`}
            aria-live="polite"
            key={goal.key}
          >
            <div className="cbv2-answer__lead">
              <p className="cbv2-answer__eyebrow">Recommended</p>
              <p className="cbv2-answer__service">{goal.service}</p>
              <p className="cbv2-answer__why">{goal.explain}</p>

              {/*
                The figure for this goal. It draws the SHAPE of the engagement --
                no numbers, no outcomes -- because it sits directly under a
                recommended service, where a diagram implying more than the
                service delivers would be a claim like any other.
              */}
              <GoalDiagram goal={goal.key as GoalKey} />
            </div>

            <div className="cbv2-answer__side">
              <div className="cbv2-answer__row">
                <span className="cbv2-answer__n" aria-hidden="true">
                  <Icon name="check" size={14} />
                </span>
                <div>
                  <h3>What you would get</h3>
                  <p>{goal.proof}</p>
                </div>
              </div>
              <div className="cbv2-answer__row">
                <span className="cbv2-answer__n" aria-hidden="true">
                  <Icon name="arrowRight" size={14} />
                </span>
                <div>
                  <h3>Suggested next step</h3>
                  <p>{goal.next}</p>
                </div>
              </div>
            </div>

            <div className="cbv2-answer__foot">
              <Link className="cbv2-btn cbv2-btn--primary" to={goal.ctaRoute}>
                {goal.cta}
              </Link>
              <Link className="cbv2-btn cbv2-btn--ghost" to="/services">
                Compare all five services
              </Link>
            </div>
          </div>
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
        <section className="cbv2-rv cbv2-section cbv2-section--sunken" aria-labelledby="cbv2-build-title">
          <div className="cbv2-wrap">
            <div className="cbv2-section__head">
              <p className="cbv2-eyebrow">From idea to shipped</p>
              <h2 id="cbv2-build-title">Your team does not just learn it. They ship it.</h2>
              <p className="cbv2-lede">
                Someone describes what they want to build. What comes back is a plan they can
                actually work from &mdash; and, at the end, proof they did.
              </p>
            </div>

            <div className="cbv2-buildflow">
              <article className="cbv2-buildstep">
                <span className="cbv2-buildstep__n" aria-hidden="true">1</span>
                <h3>It gets planned</h3>
                <p>
                  An interview turns the idea into requirements, releases and stories, every
                  story traceable to a requirement it fulfils, on a schedule that fits the
                  weeks you have.
                </p>
              </article>
              <article className="cbv2-buildstep">
                <span className="cbv2-buildstep__n" aria-hidden="true">2</span>
                <h3>They build it</h3>
                <p>
                  Each story arrives with a Claude Code prompt written from their own
                  requirements. Your people write the code &mdash; that is the point, and it is
                  why the skill is real at the end of it.
                </p>
              </article>
              <article className="cbv2-buildstep">
                <span className="cbv2-buildstep__n" aria-hidden="true">3</span>
                <h3>It gets confirmed</h3>
                <p>
                  Done is not a checkbox they tick. The platform reads their repository and
                  confirms every acceptance criterion against a real commit before the story
                  counts.
                </p>
              </article>
            </div>

            {/*
              WHAT THE PLAN ACTUALLY LOOKS LIKE, and then the window onto it.

              Both captures are of a REAL build in Colaberry's own public repo,
              shown in the Command Center's Sample mode -- the page carries its
              own "sample data" banner, and a SampleBadge sits in each caption
              regardless, so the labelling survives the image failing to load.

              The Command Center is deliberately described as something the team
              BUILDS, not something we generate. `commandCenterStory.ts` opens
              "STORY-000 -- the Command Center every student builds first": the
              platform injects the story and writes its prompt out of their own
              plan, and their people build it with Claude Code. Saying we
              generate it would be false and disprovable by opening the repo.
            */}
            <div className="cbv2-buildshots">
              <figure className="cbv2-shot-frame">
                <img
                  className="cbv2-shot"
                  src="/site-v2/shot-build-schedule.png"
                  alt="A generated build schedule: five releases from Initial Property Analysis through Trust and Monetization, fifteen stories plotted against dates, with markers for today, the end of the build and demo day."
                  loading="lazy"
                  decoding="async"
                />
                <figcaption className="cbv2-shot-caption">
                  <SampleBadge />
                  <span>The schedule, written from the interview. Every bar opens its own detail.</span>
                </figcaption>
              </figure>

              <figure className="cbv2-shot-frame">
                <img
                  className="cbv2-shot"
                  src="/site-v2/shot-command-center.png"
                  alt="The Command Center overview: nine numbered tabs from Overview through Data model, and a live-status list showing source systems, AI agents, stories shipped, guardrails enforced and outcome measures, each with a checked date."
                  loading="lazy"
                  decoding="async"
                />
                <figcaption className="cbv2-shot-caption">
                  <SampleBadge />
                  <span>
                    The Command Center: nine sections &mdash; Overview, Outcomes, Users,
                    Guardrails, Systems, Project, AI agents, Knowledge and Data model. It is
                    STORY-000, the first thing your team builds, from a brief written out of
                    your own plan. Nothing turns green until something real reports in.
                  </span>
                </figcaption>
              </figure>
            </div>

            <div className="cbv2-buildrepo">
              <div>
                <p className="cbv2-eyebrow cbv2-eyebrow--info">And it lands in your own repo</p>
                <p className="cbv2-buildrepo__body">
                  The plan is written into the repository <strong>you</strong> connect &mdash;
                  requirements, stories and a traceability matrix, committed alongside your
                  code. We keep a pointer to it and the record of what was finished. We never
                  write your code, and the evidence lives in the platform, so deleting the repo
                  never costs anyone their credit.
                </p>
              </div>
              {/*
                EXTERNAL evidence, not a product screenshot. This is a real
                public GitHub repository showing the files the pipeline commits
                and the `chore(colaberry):` bot commit that put them there. A
                reader can open it themselves, which is the whole point -- it is
                the most checkable claim on the page.

                Colaberry's OWN repo, deliberately: a student's personal repo is
                theirs, and publishing it is not ours to do.
              */}
              <figure className="cbv2-buildrepo__shot cbv2-buildrepo__shot--repo">
                <img
                  src="/site-v2/shot-repo-evidence.png"
                  alt="A GitHub repository listing showing REQUIREMENTS.md, STORIES.md, TRACEABILITY.md and a stories folder, each last touched by a commit reading chore(colaberry): sync build plan."
                  width={943}
                  height={426}
                  loading="lazy"
                  decoding="async"
                />
                <figcaption className="cbv2-buildrepo__cap">
                  A real repository, committed by the pipeline. Open it and check.
                </figcaption>
              </figure>
            </div>
          </div>
        </section>
      ) : null}

      {/* 5 ──────────────────────────────────────────────────────── services ── */}
      <section className="cbv2-rv cbv2-section" aria-labelledby="cbv2-services-title">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">Services</p>
            <h2 id="cbv2-services-title">Five ways an engagement starts</h2>
          </div>
          {/*
            Five picture cards on a six-column grid: the first three span two
            columns, the last two span three. Five items in an even grid always
            leaves a hole in the final row; spanning the last pair wider fills it
            by construction, so the layout reads as composed rather than as a row
            that ran out.

            The photographs depict the mode of work each engagement involves.
            They are not captioned as customers, engagements or results, because
            they are not -- see the sourcing note on ServicePhoto in
            config/v2Services.ts.
          */}
          <div className="cbv2-svcgrid">
            {SERVICE_DETAILS.map((s) => (
              <Link className="cbv2-svccard" to={`/services/${s.slug}`} key={s.slug}>
                <span className="cbv2-svccard__media">
                  <img
                    src={s.photo.src}
                    alt={s.photo.alt}
                    width={1280}
                    height={960}
                    loading="lazy"
                    decoding="async"
                  />
                  <span className="cbv2-svccard__n" aria-hidden="true">
                    {s.number}
                  </span>
                </span>
                <span className="cbv2-svccard__text">
                  <span className="cbv2-svccard__title">{s.name}</span>
                  <span className="cbv2-svccard__body">{s.fit}</span>
                  <span className="cbv2-svccard__go">
                    <span>See what it includes</span>
                    <Icon name="arrowRight" size={15} />
                  </span>
                </span>
              </Link>
            ))}
          </div>
          <p style={{ marginTop: 'var(--space-8)' }}>
            <Link className="cbv2-btn cbv2-btn--secondary" to="/services">
              Compare all five services
            </Link>
          </p>
        </div>
      </section>

      {/* 6 ────────────────────────────────────────────── free workspace ────── */}
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
                <Link className="cbv2-btn cbv2-btn--primary" to="/start">
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
            <Link className="cbv2-btn cbv2-btn--primary" to="/start">
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
