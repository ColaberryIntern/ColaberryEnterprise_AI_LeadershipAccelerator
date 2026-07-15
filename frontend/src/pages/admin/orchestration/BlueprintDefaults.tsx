import React from 'react';
import { BlueprintContextDTO } from './composer/composerKit';

/**
 * BlueprintDefaults — the read-only "auto-included in AI generation" block shared
 * by the Experience Studio and the Timeline editor, so the two surfaces can never
 * drift. It shows the week's Blueprint (title, purpose, topic tags, objectives,
 * domains, level) exactly as it is injected into every ✦ generation.
 *
 * Two modes:
 *  - Studio: pass `picker` (an editable Course/Week selector). The author chooses
 *    which week to design for; the VALUES are still read-only.
 *  - Timeline: pass `locked` (+ the card's `week`). There is NO picker — the week
 *    is fixed to whatever the card is assigned to, and the author can neither
 *    change the auto-included values nor drill into them.
 *
 * The block carries its own scoped styles (`.bpx-*`) so it renders identically
 * wherever it is dropped, without depending on the host tab's stylesheet.
 */

const bpxCss = `
  .bpx{border:1px solid #DDE3E6;background:#F4F6F7;border-radius:11px;padding:11px 13px;margin:0 0 14px}
  .bpx-head{display:flex;align-items:center;gap:8px;flex-wrap:wrap}
  .bpx-tag{display:inline-flex;align-items:center;gap:6px;font-size:10px;font-weight:800;letter-spacing:.04em;text-transform:uppercase;color:#5E7A88}
  .bpx-tag svg{width:12px;height:12px;flex:none}
  .bpx-right{margin-left:auto;display:flex;align-items:center;gap:6px;flex-wrap:wrap}
  .bpx-right label{font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.04em;color:#8A979D}
  .bpx-right select{font-size:12px;font-weight:600;border:1px solid #CBD5DA;border-radius:7px;padding:3px 6px;background:#fff;color:#37474F;max-width:230px}
  .bpx-lock{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:700;color:#5E7A88;background:#E4EAED;border:1px solid #CBD5DA;border-radius:999px;padding:3px 10px;cursor:not-allowed;user-select:none}
  .bpx-lock svg{width:11px;height:11px;flex:none}
  .bpx-vals{margin-top:9px;cursor:not-allowed;user-select:none}
  .bpx-title{font-size:13px;font-weight:700;color:#37474F}
  .bpx-purpose{font-size:12px;margin-top:2px;line-height:1.45;color:#5B6B72}
  .bpx-grid{display:flex;flex-direction:column;gap:5px;margin-top:8px}
  .bpx-line{font-size:11.5px;color:#5B6B72;line-height:1.45}
  .bpx-line .k{font-weight:800;text-transform:uppercase;letter-spacing:.03em;font-size:9.5px;color:#8A979D;margin-right:6px}
  .bpx-chips{display:inline-flex;gap:4px;flex-wrap:wrap;vertical-align:middle}
  .bpx-chip{font-size:10px;font-weight:600;padding:1px 7px;border-radius:999px;background:#E4EAED;color:#4A5C64}
  .bpx-empty{font-size:12px;color:#8A979D;margin-top:8px;cursor:not-allowed;user-select:none}
`;

const BookIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none"><path d="M9 5h9a1 1 0 0 1 1 1v13a1 1 0 0 1-1 1H6a1 1 0 0 1-1-1V6a1 1 0 0 1 1-1h1" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" /><rect x="9" y="3" width="6" height="4" rx="1" stroke="currentColor" strokeWidth="2" /></svg>
);
const LockIcon: React.FC = () => (
  <svg viewBox="0 0 24 24" fill="none"><rect x="4" y="10" width="16" height="11" rx="2" stroke="currentColor" strokeWidth="2" /><path d="M8 10V7a4 4 0 0 1 8 0v3" stroke="currentColor" strokeWidth="2" /></svg>
);

const BlueprintDefaults: React.FC<{
  ctx: BlueprintContextDTO | null;
  week: number | null;
  /** Studio: an editable Course/Week selector. Omit for the Timeline (locked). */
  picker?: React.ReactNode;
  /** Timeline: the week is fixed to the card — show a locked chip, no picker. */
  locked?: boolean;
}> = ({ ctx, week, picker, locked }) => (
  <div className="bpx" title={locked
    ? 'The week’s Blueprint is auto-included in every AI generation for this card. Locked to this card’s week and read-only — edit it in the Curriculum Composer.'
    : 'These Blueprint values are auto-included in the system prompt for every ✦ generation below. Read-only — edit them in the Curriculum Composer.'}>
    <style>{bpxCss}</style>
    <div className="bpx-head">
      <span className="bpx-tag">
        <BookIcon />
        Auto-included in every ✦ generation · read-only
      </span>
      <div className="bpx-right">
        {picker}
        {locked && (
          <span className="bpx-lock" title="Locked to this card’s week — set the week in the Controls below; the Blueprint follows it.">
            <LockIcon />
            {week != null ? `Week ${week} · locked to this card` : 'No week assigned'}
          </span>
        )}
      </div>
    </div>
    {ctx ? (
      <div className="bpx-vals">
        <div className="bpx-title">Week {ctx.week} · {ctx.title}</div>
        {ctx.purpose && <div className="bpx-purpose">{ctx.purpose}</div>}
        <div className="bpx-grid">
          {ctx.competencies.length > 0 && (
            <div className="bpx-line"><span className="k">Topics</span><span className="bpx-chips">{ctx.competencies.map((t) => <span key={t} className="bpx-chip">{t}</span>)}</span></div>
          )}
          {ctx.learning_objectives.length > 0 && (
            <div className="bpx-line"><span className="k">Objectives</span>{ctx.learning_objectives.join(' · ')}</div>
          )}
          {ctx.architect_domains.length > 0 && (
            <div className="bpx-line"><span className="k">Domains</span>{ctx.architect_domains.join(', ')}</div>
          )}
          {(ctx.difficulty || ctx.estimated_hours != null) && (
            <div className="bpx-line"><span className="k">Level</span>{ctx.difficulty || '—'}{ctx.estimated_hours != null ? ` · ~${ctx.estimated_hours}h` : ''}</div>
          )}
        </div>
      </div>
    ) : (
      <div className="bpx-empty">{week == null
        ? 'Assign a week to auto-include its Blueprint (topics, objectives, level) in every generation.'
        : `No Blueprint for Week ${week} yet — add topics & objectives in the Curriculum Composer.`}</div>
    )}
  </div>
);

export default BlueprintDefaults;
