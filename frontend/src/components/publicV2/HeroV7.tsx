import React, { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';

/**
 * The hero.
 *
 * The two underlines under "system" and "people" ARE the argument: they are two
 * tracks that advance through the same four stages in lockstep, because the
 * claim of the whole page is that both things happen at once, in one platform.
 * Any decoration that did not move together would be saying something we do not
 * mean.
 *
 * WHAT IS DELIBERATE HERE:
 *  - The stage names are states of a programme, not achievements we are claiming
 *    on anyone's behalf. "Architects certified" refers to Colaberry's own
 *    certification path; nothing here attributes a credential to Anthropic,
 *    which is a standing constraint on this site.
 *  - The animation pauses when scrolled out of view, so it is not burning a
 *    frame budget in a tab nobody is looking at.
 *  - Under prefers-reduced-motion it paints the FINISHED state once and never
 *    ticks. The final frame is the honest one: it is where the story ends.
 *  - The readout is text, so what the rails encode is also available to a
 *    screen reader instead of living only in colour and width.
 */

const SYS = ['Opportunity mapped', 'Built on Claude', 'Deployed under governance', 'Running in production'];
const PPL = ['Team selected', 'Building hands-on', 'Architects certified', 'Owning the system'];
const CERT_STAGE = 2;
const N = SYS.length;
const TICK_MS = 1500;
const REPLAY_PAUSE_MS = 4500;

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

function Rail({ track, stages }: { track: 'sys' | 'ppl'; stages: number }): React.ReactElement {
  const pct = (stages / N) * 100;
  return (
    <span className={`cbv2-h7rail cbv2-h7rail--${track}`} aria-hidden="true">
      <span className="cbv2-h7rail__fill" style={{ width: `${pct}%` }} />
      <span
        className={`cbv2-h7rail__head${stages > 0 && stages < N ? ' is-on' : ''}`}
        style={{ left: `${pct}%` }}
      />
      {Array.from({ length: N }, (_, i) => {
        const cert = track === 'ppl' && i === CERT_STAGE;
        const on = i < stages;
        const now = i === stages - 1;
        return (
          <span
            key={i}
            className={`cbv2-h7pip cbv2-h7pip--${cert ? 'cer' : track}${on ? ' is-on' : ''}${now ? ' is-now' : ''}`}
            style={{ left: `${((i + 1) / N) * 100}%` }}
          />
        );
      })}
    </span>
  );
}

export default function HeroV7(): React.ReactElement {
  const reduced = prefersReducedMotion();
  const [stages, setStages] = useState(reduced ? N : 0);
  const titleRef = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    if (reduced) return undefined;
    const node = titleRef.current;
    if (!node || typeof IntersectionObserver === 'undefined') return undefined;

    let tick: ReturnType<typeof setInterval> | null = null;
    let replay: ReturnType<typeof setTimeout> | null = null;

    const stop = (): void => {
      if (tick) { clearInterval(tick); tick = null; }
      if (replay) { clearTimeout(replay); replay = null; }
    };
    const start = (): void => {
      if (tick || replay) return;
      tick = setInterval(() => {
        setStages((s) => {
          if (s < N) return s + 1;
          // Finished: hold the completed state, then run it again.
          stop();
          replay = setTimeout(() => { replay = null; setStages(0); start(); }, REPLAY_PAUSE_MS);
          return s;
        });
      }, TICK_MS);
    };

    const io = new IntersectionObserver(
      (entries) => entries.forEach((e) => (e.isIntersecting ? start() : stop())),
      { threshold: 0.3 },
    );
    io.observe(node);
    return () => { io.disconnect(); stop(); };
  }, [reduced]);

  const i = Math.max(stages - 1, 0);

  return (
    <section className="cbv2-h7" aria-labelledby="cbv2-hero-title">
      <div className="cbv2-h7__grid" aria-hidden="true" />
      <div className="cbv2-wrap cbv2-h7__cols">
        <div>
          <p className="cbv2-h7eyebrow">
            <i aria-hidden="true" />
            Systems <em>+</em> people &middot; one platform
          </p>

          <h1 id="cbv2-hero-title" className="cbv2-h7title" ref={titleRef}>
            <span className="cbv2-h7title__l">
              Build the{' '}
              <span className="cbv2-h7kw">
                system
                <Rail track="sys" stages={stages} />
              </span>
              .
            </span>
            <span className="cbv2-h7title__l">
              Build the{' '}
              <span className="cbv2-h7kw">
                people
                <Rail track="ppl" stages={stages} />
              </span>
              .
            </span>
            <span className="cbv2-h7title__sub">
              One platform. <strong>Your team owns it.</strong>
            </span>
          </h1>

          <p className="cbv2-h7readout">
            <span className="cbv2-h7seg cbv2-h7seg--sys">
              <i aria-hidden="true" />
              <b>System</b>
              <span>{SYS[i]}</span>
            </span>
            <span className={`cbv2-h7seg cbv2-h7seg--ppl${i === CERT_STAGE ? ' is-cert' : ''}`}>
              <i aria-hidden="true" />
              <b>People</b>
              <span>{PPL[i]}</span>
            </span>
            <span className={`cbv2-h7done${stages >= N ? ' is-on' : ''}`}>
              <i aria-hidden="true" />
              Handover complete
            </span>
          </p>

          <p className="cbv2-h7body">
            Most AI work leaves you with a system nobody inside your company can run. We build the
            system and certify the people who will own it, <b>in one platform, at the same time</b>
            {' '}&mdash; so the capability is still yours after we go.
          </p>
          <div className="cbv2-h7ctas">
            <Link className="cbv2-btn cbv2-btn--primary" to="/platform">
              Explore the Live Platform
            </Link>
            <Link className="cbv2-btn cbv2-btn--ghost" to="/lab">
              Map an AI Opportunity
            </Link>
          </div>
          <div className="cbv2-h7foot">
            <span>Built on Claude &amp; Claude Code</span>
            <span>Certification path included</span>
            <span>Free company workspace</span>
          </div>
        </div>

        {/*
          A photograph, not a product screenshot -- which is why it carries no
          SampleBadge. The badge exists to stop a depiction of PRODUCT DATA being
          read as a real customer's numbers; a picture of people working is not a
          claim about the product and labelling it "sample" would be noise.

          alt is empty and the figure is aria-hidden because the image is
          decorative: every claim it sits beside is already stated in the text to
          its left, so announcing it would repeat rather than add.
        */}
        <figure className="cbv2-h7photo" aria-hidden="true">
          <img
            src="/site-v2/photos/team-office-mixed.jpg"
            alt=""
            width={1600}
            height={1067}
            loading="eager"
            decoding="async"
          />
        </figure>
      </div>
    </section>
  );
}
