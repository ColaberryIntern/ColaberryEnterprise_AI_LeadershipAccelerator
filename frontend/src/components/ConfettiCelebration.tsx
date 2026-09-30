import React, { useEffect, useRef } from 'react';
import { onPointsEarned } from '../services/pointsFx';

/**
 * ConfettiCelebration — a full-screen, pointer-through confetti splash that fires
 * whenever points are earned (subscribes to the same `te-points-changed` signal
 * as the HUD). The splash scales with the size of the award: more points ⇒ more
 * particles, more origins, wider spray — a small win is a gentle sprinkle, a big
 * one is a screen-filling celebration. Pure Canvas (no deps / CSP-safe) and
 * suppressed under OS reduced-motion, matching the chime.
 *
 * Mount once near the top of the portal shell; it renders nothing until points land.
 */
const COLORS = ['#FB2832', '#E8920C', '#5BA63C', '#367895', '#D97757', '#2E6A86', '#F6C445'];

interface P { x: number; y: number; vx: number; vy: number; g: number; w: number; h: number; color: string; rot: number; vr: number; life: number; ttl: number; }

const ConfettiCelebration: React.FC = () => {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    const ctx = canvas?.getContext('2d');
    if (!canvas || !ctx) return;
    const reduced = typeof window.matchMedia === 'function' && window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    let dpr = Math.min(2, window.devicePixelRatio || 1);
    const resize = () => {
      dpr = Math.min(2, window.devicePixelRatio || 1);
      canvas.width = Math.floor(window.innerWidth * dpr);
      canvas.height = Math.floor(window.innerHeight * dpr);
    };
    resize();
    window.addEventListener('resize', resize);

    let particles: P[] = [];
    let raf = 0;

    const burst = (delta: number) => {
      if (reduced || delta <= 0) return;
      const W = canvas.width, H = canvas.height;
      // Splash size scales with the award.
      const count = Math.min(460, Math.round(60 + delta * 8));
      const power = Math.min(2.3, 0.85 + delta / 40);
      // Bigger awards fire from multiple origins for a wider, fuller splash.
      const origins = delta >= 100 ? [0.24, 0.5, 0.76] : delta >= 40 ? [0.38, 0.62] : [0.5];
      const per = Math.ceil(count / origins.length);
      for (const ox of origins) {
        const cx = W * ox, cy = H * 0.4;
        for (let i = 0; i < per; i++) {
          const angle = Math.random() * Math.PI * 2;
          const speed = (2 + Math.random() * 7) * power * dpr;
          particles.push({
            x: cx + (Math.random() - 0.5) * 120 * dpr,
            y: cy + (Math.random() - 0.5) * 50 * dpr,
            vx: Math.cos(angle) * speed,
            vy: Math.sin(angle) * speed - (3.5 + Math.random() * 4.5) * dpr, // initial upward pop
            g: (0.14 + Math.random() * 0.08) * dpr,
            w: (5 + Math.random() * 7) * dpr,
            h: (3 + Math.random() * 5) * dpr,
            color: COLORS[(Math.random() * COLORS.length) | 0],
            rot: Math.random() * Math.PI,
            vr: (Math.random() - 0.5) * 0.35,
            life: 0,
            ttl: 90 + Math.random() * 70,
          });
        }
      }
      // Cap total so rapid awards can't balloon the particle set.
      if (particles.length > 1400) particles = particles.slice(-1400);
      if (!raf) raf = requestAnimationFrame(loop);
    };

    const loop = () => {
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      const next: P[] = [];
      for (const p of particles) {
        p.life++;
        p.vy += p.g;
        p.vx *= 0.99;
        p.x += p.vx;
        p.y += p.vy;
        p.rot += p.vr;
        if (p.life >= p.ttl || p.y > canvas.height + 40) continue;
        const alpha = Math.max(0, 1 - p.life / p.ttl);
        ctx.save();
        ctx.globalAlpha = alpha;
        ctx.translate(p.x, p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.color;
        ctx.fillRect(-p.w / 2, -p.h / 2, p.w, p.h);
        ctx.restore();
        next.push(p);
      }
      particles = next;
      if (particles.length) { raf = requestAnimationFrame(loop); }
      else { raf = 0; ctx.clearRect(0, 0, canvas.width, canvas.height); }
    };

    const unsub = onPointsEarned(({ delta }) => burst(delta));
    return () => {
      unsub();
      window.removeEventListener('resize', resize);
      if (raf) cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      style={{ position: 'fixed', inset: 0, width: '100vw', height: '100vh', pointerEvents: 'none', zIndex: 2147483000 }}
    />
  );
};

export default ConfettiCelebration;
