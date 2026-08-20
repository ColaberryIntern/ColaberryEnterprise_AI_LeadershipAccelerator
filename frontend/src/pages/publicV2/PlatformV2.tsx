import React from 'react';
import SeoV2 from '../../components/publicV2/SeoV2';
import HeroPlatformV8 from '../../components/publicV2/HeroPlatformV8';
import CapabilityOS from '../../components/publicV2/CapabilityOS';
import TwoExperiences from '../../components/publicV2/TwoExperiences';
import ReceiptsDrilldown from '../../components/publicV2/ReceiptsDrilldown';
import BuildPipeline from '../../components/publicV2/BuildPipeline';
import CapabilityEarned from '../../components/publicV2/CapabilityEarned';
import ArchitectExperience from '../../components/publicV2/ArchitectExperience';
import OpenPlatform from '../../components/publicV2/OpenPlatform';
import './platformV2.css';
import '../../components/publicV2/heroV8.css';

/**
 * PlatformV2 — the Platform Showroom.
 *
 * Ali's call (2026-08-20): the page runs thesis -> the nine-section argument ->
 * close. The surface showroom, the role-based-views notice, the duplicate
 * maturity ladder, the 12-week roadmap and the Experience Studio block were all
 * removed from here; the argument carries the page now, and the roadmap's home
 * is /program.
 */

function PlatformV2(): React.ReactElement {
  return (
    <>
      <SeoV2
        title="The platform your team logs into"
        description={
          'Organization AI readiness, the team roster and ladder, and a free company ' +
          'workspace. Readiness is earned from evidence, evaluations and shipped work, not ' +
          'from course completion.'
        }
      />

      <HeroPlatformV8 />

      {/*
        THE THESIS, STATED BEFORE THE TOUR.

        This page used to open straight into a showroom of six surfaces, which
        answers "what screens do I get" -- a question nobody asks until after
        they have decided. The objection actually in the room is "why would I put
        my own people on this instead of hiring a vendor", and the page never
        engaged it.

        So the argument comes first and the surfaces become evidence for it.

        CLAIM BOUNDARIES, settled with Ali on 2026-08-19 and deliberately narrow:
         - Claude Code is NOT claimed as an embedded runtime. What is true, and
           what is written here, is that every story ships with a Claude Code
           prompt written from the team's own requirements, and the platform
           reads their repository to confirm each acceptance criterion against a
           real commit. Both halves are disprovable by opening a repo, which is
           what makes them worth saying.
         - "Production-grade" is NOT used. The honest claim is real systems
           against real workflows, with governance and evidence.
      */}
      <section className="cbv2-rv cbv2-section" aria-labelledby="cbv2-thesis-title">
        <div className="cbv2-wrap">
          <div className="cbv2-section__head">
            <p className="cbv2-eyebrow">Why your own people</p>
            <h2 id="cbv2-thesis-title">
              The best people to work on your AI already work for you
            </h2>
            <p className="cbv2-lede">
              They know the workflow, the exceptions, and which numbers matter. What they have
              not had is a way to build with AI on the job. That is what this platform is:
              they become architects <strong>by building your systems</strong>, not by
              finishing a course and hoping it transfers.
            </p>
          </div>

          <div className="cbv2-thesis">
            <article className="cbv2-thesiscard">
              <span className="cbv2-thesiscard__n" aria-hidden="true">1</span>
              <h3>They learn on the real thing</h3>
              <p>
                The build is not a capstone bolted onto a syllabus. It is a real system on your
                own workflows, and the curriculum is the scaffolding around it &mdash;
                requirements, releases, stories and a schedule that fits the weeks you have.
              </p>
            </article>

            <article className="cbv2-thesiscard">
              <span className="cbv2-thesiscard__n" aria-hidden="true">2</span>
              <h3>Every story arrives with its prompt</h3>
              <p>
                Each story ships with a Claude Code prompt written from{' '}
                <strong>your own requirements</strong> &mdash; not a generic exercise. Your
                people write the code. That is the point, and it is why the capability is real
                once we leave.
              </p>
            </article>

            <article className="cbv2-thesiscard">
              <span className="cbv2-thesiscard__n" aria-hidden="true">3</span>
              <h3>Done is proven, not claimed</h3>
              <p>
                The platform reads the repository they connect and confirms every acceptance
                criterion against a real commit before a story counts. Nobody marks their own
                homework, which is what makes the record worth showing a board.
              </p>
            </article>
          </div>

          <p className="cbv2-thesis__foot">
            What comes out is a system running against your workflows, under governance, with
            the evidence trail behind it &mdash; and the people who built it still on your
            payroll.
          </p>
        </div>
      </section>

      <CapabilityOS />
      <TwoExperiences />
      <BuildPipeline />
      <ReceiptsDrilldown />
      <ArchitectExperience />
      <CapabilityEarned />

      <OpenPlatform />

    </>
  );
}

export default PlatformV2;
