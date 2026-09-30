import React from 'react';

const CSS = `
.cb-carousel { position: relative; border-radius: var(--radius-xl); overflow: hidden; background: var(--surface-sunken); }
.cb-carousel__viewport { overflow: hidden; }
.cb-carousel__track { display: flex; transition: transform var(--dur-slow) var(--ease-out); }
.cb-carousel__slide { flex: 0 0 100%; min-width: 0; }
.cb-carousel__nav { position: absolute; top: 50%; transform: translateY(-50%); width: 40px; height: 40px; border-radius: 50%; border: none; background: var(--surface-card); color: var(--text-strong); box-shadow: var(--shadow-md); cursor: pointer; display: grid; place-items: center; transition: background var(--dur-fast) var(--ease-out), transform var(--dur-fast) var(--ease-out); }
.cb-carousel__nav:hover { background: var(--surface-page); }
.cb-carousel__nav:active { transform: translateY(-50%) scale(.94); }
.cb-carousel__nav--prev { left: 14px; } .cb-carousel__nav--next { right: 14px; }
.cb-carousel__dots { position: absolute; left: 0; right: 0; bottom: 14px; display: flex; justify-content: center; gap: 8px; }
.cb-carousel__dot { width: 8px; height: 8px; border-radius: 50%; border: none; background: rgba(255,255,255,.55); cursor: pointer; padding: 0; transition: width var(--dur-base) var(--ease-out), background var(--dur-base) var(--ease-out); }
.cb-carousel__dot.is-active { width: 22px; border-radius: var(--radius-pill); background: #fff; }
@media (prefers-reduced-motion: reduce){ .cb-carousel__track { transition-duration: .001ms; } }
`;

function inject() {
  if (typeof document === 'undefined' || document.getElementById('cb-carousel-css')) return;
  const s = document.createElement('style'); s.id = 'cb-carousel-css'; s.textContent = CSS; document.head.appendChild(s);
}

/**
 * Sliding carousel with prev/next controls and dot indicators. `slides` is an
 * array of nodes. Set `loop` to wrap around at the ends.
 */
export function Carousel({ slides = [], loop = true, className = '', ...rest }) {
  inject();
  const [i, setI] = React.useState(0);
  const n = slides.length;
  const go = (to) => setI(loop ? (to + n) % n : Math.max(0, Math.min(n - 1, to)));
  const Arrow = ({ d }) => <svg width="20" height="20" viewBox="0 0 24 24" fill="none"><path d={d} stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg>;
  return (
    <div className={'cb-carousel ' + className} {...rest}>
      <div className="cb-carousel__viewport">
        <div className="cb-carousel__track" style={{ transform: `translateX(-${i * 100}%)` }}>
          {slides.map((s, idx) => <div className="cb-carousel__slide" key={idx} aria-hidden={idx !== i}>{s}</div>)}
        </div>
      </div>
      {n > 1 && <React.Fragment>
        <button className="cb-carousel__nav cb-carousel__nav--prev" onClick={() => go(i - 1)} disabled={!loop && i === 0} aria-label="Previous"><Arrow d="M15 6l-6 6 6 6" /></button>
        <button className="cb-carousel__nav cb-carousel__nav--next" onClick={() => go(i + 1)} disabled={!loop && i === n - 1} aria-label="Next"><Arrow d="M9 6l6 6-6 6" /></button>
        <div className="cb-carousel__dots">
          {slides.map((_, idx) => <button key={idx} className={'cb-carousel__dot' + (idx === i ? ' is-active' : '')} onClick={() => setI(idx)} aria-label={'Go to slide ' + (idx + 1)} />)}
        </div>
      </React.Fragment>}
    </div>
  );
}
