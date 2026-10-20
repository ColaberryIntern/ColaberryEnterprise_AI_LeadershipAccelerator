import React, { useEffect, useId, useRef, useState } from 'react';
import { useCampus } from './CampusContext';
import type { MotionChoice } from './campusSettings';
import { prefersReducedMotion } from './campusSettings';
import './campusSettings.css';

/**
 * Campus settings (C11): Workplace names, Reduce motion and the classic menu, reachable from the map
 * bar (so phones reach it: the side nav is hidden under 820 px) and the side nav footer.
 *
 * A disclosure, not a dialog: the button carries aria-expanded, the panel follows it in the DOM, and
 * Esc closes the panel and returns focus to the button without closing the map around it.
 * Not on the portal Settings page: SettingsPage.tsx is over the 500-line ceiling (logged deviation, as C9's My look).
 */
const MOTION_OPTIONS: { value: MotionChoice; label: string }[] = [
  { value: 'device', label: 'Follow my device' },
  { value: 'on', label: 'On' },
  { value: 'off', label: 'Off' },
];

export default function CampusSettingsPanel({ variant = 'bar' }: { variant?: 'bar' | 'nav' }): React.ReactElement {
  const { settings, updateSettings } = useCampus();
  const [open, setOpen] = useState(false);
  const button = useRef<HTMLButtonElement | null>(null);
  const panel = useRef<HTMLDivElement | null>(null);
  const id = useId();
  const panelId = `cm-settings-${id}`;

  useEffect(() => { if (open) panel.current?.querySelector<HTMLElement>('input')?.focus(); }, [open]);

  const close = () => { setOpen(false); button.current?.focus(); };
  const onKeyDown = (e: React.KeyboardEvent) => {
    // Closed panel: Esc belongs to the map (it closes the map), so it is not touched here.
    if (e.key !== 'Escape' || !open) return;
    e.stopPropagation(); // the map's own Esc must not also close the map
    close();
  };
  const device = prefersReducedMotion();

  return (
    <div className={`cm-settings is-${variant}`} onKeyDown={onKeyDown}>
      <button type="button" ref={button} className="cm-link cm-settings-btn" aria-expanded={open} aria-controls={panelId}
        onClick={() => (open ? close() : setOpen(true))} data-testid={`cm-settings-${variant}`}>
        Settings
      </button>
      {open && (
        <div className="cm-settings-panel" id={panelId} ref={panel} role="group" aria-label="Campus settings" data-testid="cm-settings-panel">
          <label className="cm-settings-row">
            <input type="checkbox" checked={settings.workplaceNames} onChange={(e) => updateSettings({ workplaceNames: e.target.checked })}
              data-testid="cm-setting-workplace" />
            <span>Workplace names<small>Show building names for a workplace instead of a campus.</small></span>
          </label>
          <fieldset className="cm-settings-row">
            <legend>Reduce motion</legend>
            {MOTION_OPTIONS.map((o) => (
              <label key={o.value} className="cm-settings-choice">
                <input type="radio" name={`${panelId}-motion`} value={o.value} checked={settings.motion === o.value}
                  onChange={() => updateSettings({ motion: o.value })} data-testid={`cm-setting-motion-${o.value}`} />
                <span>{o.value === 'device' ? `${o.label} (${device ? 'reduced' : 'full motion'})` : o.label}</span>
              </label>
            ))}
          </fieldset>
          {/* The side nav footer already carries "Use classic menu"; the map bar (phones) needs its own. */}
          {variant === 'bar' && (
            <button type="button" className="cm-link" onClick={() => updateSettings({ nav: 'classic' })} data-testid="cm-use-classic-bar">
              Use classic menu
            </button>
          )}
          <button type="button" className="cm-link cm-settings-done" onClick={close}>Done</button>
        </div>
      )}
    </div>
  );
}
