import React, { useEffect, useRef, useState } from 'react';
import { emojiFor, moonPhase, skyClasses, tempFor, WORDS, type Condition, type TimeOfDay } from './weatherModel';
import type { CampusWeather } from './useCampusWeather';
import { WindowView, lookingOut, viewTitle, type ViewItem } from './windowView';
import './weather.css';

/**
 * What the campus shows of the weather (Campus v9 W2-W4, Basecamp C37):
 *  - WeatherSky: a layer over the map and under the panels (pointer-events none): the time-of-day tint (night, dusk, dawn, the grey
 *    wash on an overcast day) and particles on one canvas (rain about 180 streaks, snow about 140 flakes, storm adds a rare flash),
 *    scaled to the viewport, paused when the tab is hidden; reduced motion or "effects off": no particles, no flash (the tint stays
 *    unless effects are off);
 *  - WeatherChip: "‹emoji› ‹temp›°" in the top bar; its popover says what it is, where, the local time and time of day, the line about
 *    the sky, 📍 Use my exact location and the effects toggle;
 *  - RoomWindow: a window on a room's right wall (cream frame, mullions, sill, the sign), its sky by time of day and weather: sun,
 *    the moon in its real phase with stars, clouds, rain, snow or fog. Not a click target; its title says what is outside.
 * With no reading (flag off, or Open-Meteo down) only the time of day is drawn.
 */
type Drop = { x: number; y: number; v: number; l: number };

export function WeatherSky({ wx, reduceMotion, paused }: { wx: CampusWeather; reduceMotion: boolean; paused?: boolean }): React.ReactElement | null {
  const ref = useRef<HTMLCanvasElement>(null);
  const [flash, setFlash] = useState(false);
  const c = wx.w.condition;
  const moving = wx.effects && !reduceMotion && !paused && (c === 'rain' || c === 'snow' || c === 'storm');
  useEffect(() => {
    const cv = ref.current;
    const ctx = cv?.getContext?.('2d');
    if (!cv || !ctx || !moving) { if (cv && ctx) ctx.clearRect(0, 0, cv.width, cv.height); return undefined; }
    const resize = () => { cv.width = window.innerWidth; cv.height = window.innerHeight; };
    resize(); window.addEventListener('resize', resize);
    const area = (cv.width * cv.height) / (1440 * 900);
    const n = Math.round((c === 'snow' ? 140 : 180) * Math.min(1.5, Math.max(0.3, area)));
    const drops: Drop[] = Array.from({ length: n }, () => ({ x: Math.random() * cv.width, y: Math.random() * cv.height, v: c === 'snow' ? 30 + Math.random() * 40 : 500 + Math.random() * 300, l: c === 'snow' ? 2 + Math.random() * 2 : 10 + Math.random() * 10 }));
    const ink = getComputedStyle(cv).color;
    let raf = 0; let last = performance.now(); let nextFlash = performance.now() + 4000;
    const frame = (t: number) => {
      const dt = Math.min(0.05, (t - last) / 1000); last = t;
      if (document.hidden) { raf = requestAnimationFrame(frame); return; }
      ctx.clearRect(0, 0, cv.width, cv.height);
      ctx.strokeStyle = ink; ctx.fillStyle = ink; ctx.globalAlpha = c === 'snow' ? 0.8 : 0.45; ctx.lineWidth = 1;
      for (const d of drops) {
        d.y += d.v * dt; d.x += (c === 'snow' ? Math.sin(t / 900 + d.y / 50) * 12 : -d.v * 0.18) * dt;
        if (d.y > cv.height) { d.y = -d.l; d.x = Math.random() * cv.width; }
        if (c === 'snow') { ctx.beginPath(); ctx.arc(d.x, d.y, d.l, 0, Math.PI * 2); ctx.fill(); }
        else { ctx.beginPath(); ctx.moveTo(d.x, d.y); ctx.lineTo(d.x - d.l * 0.18, d.y + d.l); ctx.stroke(); }
      }
      if (c === 'storm' && t > nextFlash) { setFlash(true); window.setTimeout(() => setFlash(false), 120); nextFlash = t + 5000 + Math.random() * 7000; }
      raf = requestAnimationFrame(frame);
    };
    raf = requestAnimationFrame(frame);
    return () => { cancelAnimationFrame(raf); window.removeEventListener('resize', resize); };
  }, [moving, c]);
  const classes = wx.effects ? skyClasses(c, wx.tod) : [];
  return (
    <div className={`cm-wx ${classes.join(' ')}${flash ? ' is-flash' : ''}`} aria-hidden="true" data-testid="cm-wx" data-condition={c ?? 'none'} data-tod={wx.tod}>
      <canvas ref={ref} className="cm-wx-cv" data-testid="cm-wx-canvas" data-moving={moving || undefined} />
    </div>
  );
}

const TOD_WORDS: Record<TimeOfDay, string> = { dawn: 'dawn', day: 'daytime', dusk: 'dusk', night: 'night' };

export function WeatherChip({ wx }: { wx: CampusWeather }): React.ReactElement {
  const [open, setOpen] = useState(false);
  const t = tempFor(wx.w, wx.celsius);
  const label = `${emojiFor(wx.w.condition, wx.tod)}${t !== null ? ` ${t}°` : ''}`;
  const time = wx.now.toLocaleTimeString('en-US', { hour: 'numeric', minute: '2-digit' });
  return (
    <span className="cm-wx-chipwrap">
      <button type="button" className="cm-wx-chip" aria-expanded={open} onClick={() => setOpen((o) => !o)} data-testid="cm-wx-chip"
        aria-label={wx.w.condition ? `Weather: ${WORDS[wx.w.condition]}${t !== null ? `, ${t} degrees` : ''}` : `Local time ${time}`}>{label}</button>
      {open && (
        <div className="cm-wx-pop" role="dialog" aria-label="Weather and time of day" data-testid="cm-wx-pop">
          <b>{wx.w.condition ? `${WORDS[wx.w.condition][0].toUpperCase()}${WORDS[wx.w.condition].slice(1)}${t !== null ? ` · ${t}°${wx.celsius ? 'C' : 'F'}` : ''}${wx.w.city ? ` · ${wx.w.city}` : ''}` : 'Weather is off; the sky follows your clock'}</b>
          <span>{time} · {TOD_WORDS[wx.tod]}</span>
          <p>The campus sky, the windows in every room and the light follow your local weather and time of day.</p>
          <button type="button" className="cm-btn-line" onClick={wx.useExact}>📍 Use my exact location</button>
          <label className="cm-wx-toggle"><input type="checkbox" checked={!wx.effects} onChange={(e) => wx.setEffects(!e.target.checked)} /> Turn weather effects off</label>
        </div>
      )}
    </span>
  );
}

const CLOUDS: Partial<Record<Condition, number>> = { partly: 2, cloudy: 4, rain: 4, storm: 4, snow: 4 };

/** C38 (v10 W5): with `view`, the glass shows the real buildings east of the room and the sign says what you are looking out at. */
export function RoomWindow({ wx, small = false, view }: { wx: CampusWeather; small?: boolean; view?: ViewItem[] }): React.ReactElement {
  const c = wx.w.condition;
  const showSun = wx.tod !== 'night' && (!c || c === 'clear' || c === 'partly');
  const showMoon = wx.tod === 'night' && (!c || c === 'clear' || c === 'partly');
  const phase = moonPhase(wx.now);
  const lit = Math.cos(phase * 2 * Math.PI); // 1 new .. -1 full: the shadow's offset
  const t = tempFor(wx.w, wx.celsius);
  const where = wx.w.city ?? 'outside';
  const outside = c ? `Outside: ${WORDS[c][0].toUpperCase()}${WORDS[c].slice(1)} in ${where}` : `Outside: ${wx.tod === 'night' ? 'night' : 'daylight'}`;
  const title = view ? `${outside}; ${viewTitle(view)}` : outside;
  return (
    <div className={`cm-win${small ? ' is-small' : ''} sky-${wx.tod}${c ? ` wx-${c}` : ''}`} title={title} aria-label={title} role="img" data-testid="cm-room-window">
      <div className="glass">
        {showSun && <i className="sun" />}
        {showMoon && <>
          <i className="moon" data-testid="cm-win-moon" style={{ ['--shadow' as string]: `${Math.round(lit * 14)}px` }} />
          <span className="stars" data-testid="cm-win-stars" />
        </>}
        {Array.from({ length: CLOUDS[c as Condition] ?? 0 }, (_, i) => <i key={i} className={`cloud c${i}`} />)}
        <i className="hills" />
        {view && <WindowView items={view} lit={wx.tod === 'dusk' || wx.tod === 'night'} />}
        {(c === 'rain' || c === 'storm') && <span className="rain" data-testid="cm-win-rain" />}
        {c === 'snow' && <span className="snow" />}
        {c === 'fog' && <span className="fog" />}
        <i className="mullion v" /><i className="mullion h" />
      </div>
      <div className="sill" />
      <div className="sign">{emojiFor(c, wx.tod)}{t !== null ? ` ${t}°` : ''}{wx.w.city ? ` · ${wx.w.city}` : ''}{view && <small data-testid="cm-win-looking">{lookingOut(view)}</small>}</div>
    </div>
  );
}
