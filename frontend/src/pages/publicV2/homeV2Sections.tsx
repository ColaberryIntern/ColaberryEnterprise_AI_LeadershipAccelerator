import React from 'react';
import { Link } from 'react-router-dom';
import Icon from '../../components/publicV2/Icon';
import { Claim, canShow, SampleBadge } from '../../components/publicV2/Claim';
// SERVICE_DETAILS rather than v2Content's SERVICES: the cards carry the photograph, which
// only the detail records hold. The two lists are the same five engagements in the same
// order, and HomeV2.test asserts they stay in sync. The note moved here with the code.
import { SERVICE_DETAILS } from '../../config/v2Services';

/**
 * homeV2Sections - two of the homepage's bands, lifted out of HomeV2.
 *
 * WHY. HomeV2 reached 700 lines against CLAUDE.md's 500-line ceiling, and the rule there is
 * that the next change to an oversize file splits it before adding anything. C5.2 is that
 * next change. `storyDetailV2Sections.tsx` set the precedent for extracting V2 page bands.
 *
 * Both sections are pure: no component state, no hooks, no props. That is why they could
 * move without a prop interface, and it is worth keeping true of anything else lifted here.
 *
 * NOTHING ABOUT THE RENDERED OUTPUT CHANGES. This is a move, not a rewrite. HomeV2.test
 * asserts the section budget, the absence of blocked claims and the evidence class on every
 * figure against the rendered page, so it covers these bands wherever they live.
 */

/** "Your team does not just learn it. They ship it." The build-pipeline band. */
export function BuildPipelineSection(): React.ReactElement {
  return (

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
          THE FOUR BEATS, each with the picture that proves it.

          Order is deliberate and was set by Ali: the Command Center comes
          FIRST and on the left, because it is the thing a buyer should see
          before anything else -- the window onto their own build.

          Every capture is of a REAL build in Colaberry's own public repo,
          shown in the Command Center's Sample mode. Each page carries its own
          "sample data" banner and a SampleBadge sits in every caption
          regardless, so the labelling survives an image failing to load.

          The Command Center is described as something the team BUILDS, not
          something we generate. `commandCenterStory.ts` opens "STORY-000 --
          the Command Center every student builds first": the platform injects
          the story and writes its prompt out of their own plan, and their
          people build it with Claude Code. Claiming we generate it would be
          false and disprovable by opening the repo.
        */}
        <div className="cbv2-bstack">

          <article className="cbv2-brow">
            <figure className="cbv2-brow__shot">
              <img
                className="cbv2-shot"
                src="/site-v2/shot-command-center.png"
                alt="The Command Center overview: nine numbered tabs from Overview through Data model, and a live-status list showing source systems, AI agents, stories shipped, guardrails enforced and outcome measures, each with a checked date."
                loading="lazy"
                decoding="async"
              />
              <figcaption className="cbv2-shot-caption">
                <SampleBadge />
                <span>Nine sections, one window onto the build.</span>
              </figcaption>
            </figure>
            <div className="cbv2-brow__say">
              <p className="cbv2-eyebrow cbv2-eyebrow--info">One window on the whole build</p>
              <h3>Your Command Center is the first thing your team ships</h3>
              <p>
                Overview, Outcomes, Users, Guardrails, Systems, Project, AI agents,
                Knowledge and Data model &mdash; wired to your plan, not a template. It is
                STORY-000: we write the brief from your own requirements and your people
                build it with Claude Code, which is why they can maintain it afterwards.
                Nothing on it turns green until something real reports in.
              </p>
            </div>
          </article>

          <article className="cbv2-brow cbv2-brow--flip">
            <figure className="cbv2-brow__shot">
              <img
                className="cbv2-shot"
                src="/site-v2/shot-agents.png"
                alt="The agent roster: eight cards including Opportunity Scorer, AI Assessment Generator, Research Agent and Negotiation Agent, each stating what event fires it, what it produces and which skills it uses, with a connected or needs-attention state."
                loading="lazy"
                decoding="async"
              />
              <figcaption className="cbv2-shot-caption">
                <SampleBadge />
                <span>Every agent, what fires it, and what it owes you.</span>
              </figcaption>
            </figure>
            <div className="cbv2-brow__say">
              <p className="cbv2-eyebrow cbv2-eyebrow--info">The work, split by who does it</p>
              <h3>We do not stop at the software. We staff the operation</h3>
              <p>
                The same interview that produces the plan also inventories the work of
                actually running it, and separates what an agent should do from what a
                person should. Each agent position becomes a defined role: the event that
                fires it, what it produces, the skills it needs, and whether it is
                connected or wants attention right now.
              </p>
            </div>
          </article>

          <article className="cbv2-brow">
            <figure className="cbv2-brow__shot">
              <img
                className="cbv2-shot"
                src="/site-v2/shot-build-schedule.png"
                alt="A generated build schedule: five releases from Initial Property Analysis through Trust and Monetization, fifteen stories plotted against dates, with markers for today, the end of the build and demo day."
                loading="lazy"
                decoding="async"
              />
              <figcaption className="cbv2-shot-caption">
                <SampleBadge />
                <span>Releases, stories, and the day it is due.</span>
              </figcaption>
            </figure>
            <div className="cbv2-brow__say">
              <p className="cbv2-eyebrow cbv2-eyebrow--info">Project management, built in</p>
              <h3>You are never waiting on a status report</h3>
              <p>
                The schedule is part of the platform, not a spreadsheet somebody keeps
                beside it. Releases, stories and due dates come out of the same plan the
                build runs on, so progress is something you watch rather than something you
                ask for &mdash; and a slipped date is visible the day it slips, not at the
                end of the month.
              </p>
            </div>
          </article>

          {/*
            BUILT, NOT CAPTURED. The obvious screenshot here is the repo panel
            inside the workspace -- but that panel prints a per-repo webhook
            SIGNING SECRET, and these repos are public. Shipping a crop of it
            on a marketing page is a credential leak waiting to happen, and no
            crop stays safe from a later re-capture that includes it.

            So it is drawn in markup instead: the connected repo and the mentor
            beside it, which is the part that matters anyway.
          */}
          <article className="cbv2-brow cbv2-brow--flip">
            <div className="cbv2-brow__shot cbv2-repocard" aria-hidden="true">
              <div className="cbv2-repocard__bar">
                <span className="cbv2-repocard__dot" />
                <span className="cbv2-repocard__path">Your repo</span>
                <span className="cbv2-repocard__ok">Connected</span>
              </div>
              <div className="cbv2-repocard__body">
                <p className="cbv2-repocard__name">ColaberryIntern/AcceleratorTesting</p>
                <ul className="cbv2-repocard__checks">
                  <li><i />Repo connected</li>
                  <li><i />Webhook registered</li>
                  <li><i />Pushes arriving</li>
                </ul>
                <div className="cbv2-repocard__cory">
                  <span className="cbv2-repocard__avatar">C</span>
                  <p>
                    <b>Cory</b>
                    <span>
                      I am here to help on this build. Architecture, a decision you want a
                      second opinion on, or a push that will not go through.
                    </span>
                  </p>
                </div>
              </div>
            </div>
            <div className="cbv2-brow__say">
              <p className="cbv2-eyebrow cbv2-eyebrow--info">And it lands in your own repo</p>
              <h3>The plan is written into the repository you connect</h3>
              <p>
                Requirements, stories and a traceability matrix, committed alongside your
                code, with an architect alongside the work when someone gets stuck. We
                never write your code, and the evidence lives in the platform &mdash; so
                deleting the repo never costs anyone their credit.
              </p>
            </div>
          </article>

        </div>
      </div>
    </section>
  );
}

/** "Five ways an engagement starts." The services band. */
export function ServicesSection(): React.ReactElement {
  return (

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
  );
}
