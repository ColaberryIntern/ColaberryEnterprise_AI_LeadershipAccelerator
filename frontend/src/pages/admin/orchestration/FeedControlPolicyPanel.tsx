/**
 * FeedControlPolicyPanel — the Global Feed Policy drawer, extracted out of
 * FeedControlTab.tsx (which was at the CLAUDE.md modular-composition hard
 * ceiling of 500 lines) so the Type Analytics stats/slider addition had
 * somewhere to land without pushing the tab file further over. Pure
 * extraction — behavior unchanged from the inline version.
 */
import React, { useState } from 'react';
import { AMBIENT, Badge, type Policy } from './feedControlShared';

export default function FeedControlPolicyPanel({ policy, busy, live, onClose, onSave }: { policy: Policy; busy: boolean; live: boolean; onClose: () => void; onSave: (p: Partial<Policy>) => void; }) {
  const [p, setP] = useState<Policy>(policy);
  const set = (k: keyof Policy, v: any) => setP((x) => ({ ...x, [k]: v }));
  const toggleProv = (prov: string) => setP((x) => ({ ...x, ambientProviders: x.ambientProviders.includes(prov) ? x.ambientProviders.filter((a) => a !== prov) : [...x.ambientProviders, prov] }));
  return (
    <div className="fc-scrim" onClick={onClose}>
      <aside className="fc-drawer wide" onClick={(e) => e.stopPropagation()}>
        <div className="fc-drawer-h"><b>Global Feed Policy</b> {live ? <Badge kind="live" /> : <Badge kind="preview" />}<button className="fc-x" onClick={onClose}>✕</button></div>
        {!live && <div className="fc-policy-note">These settings shape the <b>preview</b> below, but the live student feed still uses the built-in defaults. They start governing real students the moment Feed Control is switched on.</div>}
        <label className="fc-f">Today cadence — curriculum items between each ambient injection
          <input type="number" min={1} max={20} value={p.todayCadence} onChange={(e) => set('todayCadence', parseInt(e.target.value, 10) || 1)} /></label>
        <div className="fc-f">Ambient providers (rotate into Today)
          <div className="fc-provs">{AMBIENT.map((a) => (
            <button key={a} className={`fc-chip-btn ${p.ambientProviders.includes(a) ? 'on' : ''}`} onClick={() => toggleProv(a)}>{a}</button>
          ))}</div>
        </div>
        <div className="fc-f3">
          <label className="fc-f">Default freq cap<input type="number" min={0} value={p.defaultFrequencyCap} onChange={(e) => set('defaultFrequencyCap', parseInt(e.target.value, 10) || 0)} /></label>
          <label className="fc-f">Default cooldown d<input type="number" min={0} value={p.defaultCooldownDays} onChange={(e) => set('defaultCooldownDays', parseInt(e.target.value, 10) || 0)} /></label>
          <label className="fc-f">Recency half-life d<input type="number" min={1} value={p.recencyHalfLifeDays} onChange={(e) => set('recencyHalfLifeDays', parseInt(e.target.value, 10) || 1)} /></label>
        </div>
        <label className="fc-f">Exploration ({Math.round(p.explorationPct * 100)}%) — fresh/exploratory share
          <input type="range" min={0} max={100} value={Math.round(p.explorationPct * 100)} onChange={(e) => set('explorationPct', (parseInt(e.target.value, 10) || 0) / 100)} /></label>
        <label className="fc-f">Priority weight ({p.priorityWeight}) — how strongly a card's priority boosts rank
          <input type="range" min={0} max={10} value={Math.round(p.priorityWeight * 100)} onChange={(e) => set('priorityWeight', (parseInt(e.target.value, 10) || 0) / 100)} /></label>
        <div className="fc-drawer-foot">
          <button className="fc-btn ghost" onClick={onClose}>Cancel</button>
          <button className="fc-btn" disabled={busy} onClick={() => onSave(p)}>{busy ? 'Saving…' : 'Save policy'}</button>
        </div>
      </aside>
    </div>
  );
}
