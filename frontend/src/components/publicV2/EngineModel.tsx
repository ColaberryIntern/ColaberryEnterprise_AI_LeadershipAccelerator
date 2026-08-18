import React, { useCallback, useEffect, useRef, useState } from 'react';
import { ENGINE } from '../../config/v2Content';

/**
 * The operating model: two engines that hand off to each other.
 *
 * The previous version drew two independent lists side by side, which said
 * "here are ten things we do". The claim is narrower and more specific than
 * that: the two tracks are COUPLED, stage for stage, and the numbered gate
 * between each pair is the handoff. That coupling is the product, so it is what
 * the component draws.
 *
 * The step copy is read from ENGINE rather than restated here, so the lanes
 * cannot drift from the rest of the site. Only the handoff lines are local,
 * because they describe the JOIN between the two tracks and belong to nothing
 * else.
 *
 * Reduced motion lands on the final stage immediately and never runs the
 * sequence: the completed state is the one that carries the argument, so a
 * reader who does not get the animation still gets the point rather than an
 * empty frame waiting for a timer that will not fire.
 */

/** Why each pair is a pair. Indexed alongside the ENGINE stages. */
const HANDOFF = [
  'what the work is, and who can already do it',
  'the architecture decides the curriculum',
  'one build, not two',
  'the same evidence on both sides',
  'the team that owns it owns the number',
];

const STAGE_MS = 1600;
const AUTOSTART_MS = 500;
const LAST = ENGINE.system.length - 1;

const pad = (n: number): string => (n < 10 ? `0${n}` : `${n}`);

const prefersReducedMotion = (): boolean =>
  typeof window !== 'undefined'
  && typeof window.matchMedia === 'function'
  && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

export default function EngineModel(): React.ReactElement {
  const reduced = prefersReducedMotion();
  const [stage, setStage] = useState(reduced ? LAST : -1);
  const [running, setRunning] = useState(false);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  const halt = useCallback(() => {
    if (timer.current) { clearInterval(timer.current); timer.current = null; }
    setRunning(false);
  }, []);

  const start = useCallback(() => {
    if (reduced || timer.current) return;
    setRunning(true);
    setStage((s) => (s >= LAST ? 0 : s + 1));
    timer.current = setInterval(() => {
      setStage((s) => {
        if (s >= LAST) {
          if (timer.current) { clearInterval(timer.current); timer.current = null; }
          setRunning(false);
          return s;
        }
        return s + 1;
      });
    }, STAGE_MS);
  }, [reduced]);

  // Autoplay once, shortly after mount, so the model demonstrates itself.
  useEffect(() => {
    if (reduced) return undefined;
    const t = setTimeout(start, AUTOSTART_MS);
    return () => clearTimeout(t);
  }, [reduced, start]);

  // Never leave an interval behind.
  useEffect(() => () => { if (timer.current) clearInterval(timer.current); }, []);

  const pick = (i: number): void => { halt(); setStage(i); };

  const done = stage === LAST;
  const sys = ENGINE.system;
  const ppl = ENGINE.people;

  const readout = stage < 0
    ? 'Idle — press run'
    : `${pad(stage + 1)} / ${pad(sys.length)} · ${sys[stage].title.toLowerCase()} ⇄ ${ppl[stage].title.toLowerCase()}`;

  return (
    <div className={`cbv2-eg${running ? ' is-on' : ''}${done ? ' is-done' : ''}`}>
      <div className="cbv2-eg__bar">
        <span className="cbv2-eg__pip" aria-hidden="true" />
        <span className="cbv2-eg__read">
          {stage < 0 ? readout : (
            <>
              <b>{readout}</b>
              {' · '}
              {HANDOFF[stage]}
            </>
          )}
        </span>
        <button
          type="button"
          className="cbv2-eg__btn"
          onClick={() => (running ? halt() : start())}
        >
          {running ? 'Pause' : (done ? 'Run again' : 'Run the model')}
        </button>
      </div>

      <div className="cbv2-eg__heads" aria-hidden="true">
        <p className="cbv2-eg__h cbv2-eg__h--s">
          System engine
          <span>what gets built</span>
        </p>
        <div />
        <p className="cbv2-eg__h cbv2-eg__h--p">
          <span>who runs it after</span>
          People engine
        </p>
      </div>

      <div className="cbv2-eg__rows">
        <div className="cbv2-eg__rail cbv2-eg__rail--s" aria-hidden="true"><i /></div>
        <div className="cbv2-eg__rail cbv2-eg__rail--p" aria-hidden="true"><i /></div>

        {sys.map((step, i) => {
          const on = i <= stage;
          const live = i === stage;
          const cls = (lane: 's' | 'p'): string =>
            `cbv2-eg__st cbv2-eg__st--${lane}${on ? ' is-hit' : ''}${live ? ' is-live' : ''}`;
          return (
            <div className="cbv2-eg__row" key={step.title}>
              <button type="button" className={cls('s')} onClick={() => pick(i)}>
                <span className="cbv2-eg__n">{i + 1}</span>
                <span>
                  <span className="cbv2-eg__t">{step.title}</span>
                  <span className="cbv2-eg__d">{step.detail}</span>
                </span>
              </button>

              <div className={`cbv2-eg__gate${on ? ' is-hit' : ''}${live ? ' is-live' : ''}`}>
                <span className="cbv2-eg__node">{pad(i + 1)}</span>
              </div>

              <button type="button" className={cls('p')} onClick={() => pick(i)}>
                <span className="cbv2-eg__n">{i + 1}</span>
                <span>
                  <span className="cbv2-eg__t">{ppl[i].title}</span>
                  <span className="cbv2-eg__d">{ppl[i].detail}</span>
                </span>
              </button>
            </div>
          );
        })}
      </div>

      <div className="cbv2-eg__out">
        <div className="cbv2-eg__meter" aria-hidden="true">
          {sys.map((step, i) => (
            <span className={`cbv2-eg__seg${i <= stage ? ' is-hit' : ''}`} key={step.title}><i /></span>
          ))}
        </div>
        <div className="cbv2-eg__outrow">
          <strong>Owned enterprise AI capability</strong>
          <span className="cbv2-eg__chip">{done ? 'Handover complete' : 'In progress'}</span>
          <p>The system runs in production, and your own people own it.</p>
        </div>
      </div>
    </div>
  );
}
