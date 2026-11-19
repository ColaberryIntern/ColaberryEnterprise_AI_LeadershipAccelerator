import React, { useState } from 'react';
import { Outline, SECTIONS, TRIGGERS, TOOLS, UNSURE, AUTONOMY, filledCount } from './outlineModel';

// Step 1's "Guided outline" mode: the ten things a build plan needs, as a side
// outline that ticks off as they are answered and a column of short questions.
// Everything here is optional and folded into `idea` by composeIdea() in the
// wizard — see outlineModel.ts for why that is the whole contract.

const ANSWER_MAX = 2_000;
const LINE_MAX = 300;

const Check: React.FC<{ size?: number; stroke?: string }> = ({ size = 15, stroke = 'currentColor' }) => (
  <svg aria-hidden="true" width={size} height={size} viewBox="0 0 24 24" fill="none" stroke={stroke} strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg>
);

const Chip: React.FC<{ label: string; on: boolean; onClick: () => void }> = ({ label, on, onClick }) => (
  <button type="button" className={`pjg-chip${on ? ' on' : ''}`} aria-pressed={on} onClick={onClick}>
    {on && <Check stroke="var(--berry-text, #2E6A86)" />}{label}
  </button>
);

const Section: React.FC<{ title: string }> = ({ title }) => <div className="pjg-sec">{title}</div>;

const GuidedOutline: React.FC<{
  outline: Outline;
  onChange: (o: Outline) => void;
  freeText: string;
  onFreeText: (s: string) => void;
  freeMax: number;
  children?: React.ReactNode;   // the name field + Sharpen button, at the foot of the question column
}> = ({ outline: o, onChange, freeText, onFreeText, freeMax, children }) => {
  const [adding, setAdding] = useState(false);
  const [custom, setCustom] = useState('');
  const set = <K extends keyof Outline>(k: K, v: Outline[K]) => onChange({ ...o, [k]: v });
  const pickOne = (k: 'trigger' | 'unsure', v: string) => set(k, o[k] === v ? '' : v);
  const toggle = (k: 'tools' | 'autonomy', v: string) =>
    set(k, o[k].includes(v) ? o[k].filter((x) => x !== v) : [...o[k], v]);

  function addCustom(): void {
    const v = custom.trim();
    if (v && !o.tools.includes(v)) set('tools', [...o.tools, v]);
    setCustom('');
    setAdding(false);
  }

  function jump(e: React.MouseEvent, id: string): void {
    e.preventDefault();
    const el = document.getElementById(`pjg-${id}`);
    el?.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
    (el?.querySelector('textarea, input, button') as HTMLElement | null)?.focus({ preventScroll: true });
  }

  const done = filledCount(o);
  const customTools = o.tools.filter((t) => !TOOLS.includes(t));

  const text = (id: string, k: keyof Outline, label: string, hint?: string, placeholder?: string) => (
    <div id={`pjg-${id}`} className="pjg-q">
      <label htmlFor={`pjg-f-${id}`} className="pjg-ql">{label}</label>
      {hint && <div className="pjg-hint">{hint}</div>}
      <textarea id={`pjg-f-${id}`} rows={2} maxLength={ANSWER_MAX} value={o[k] as string} placeholder={placeholder}
        onChange={(e) => set(k, e.target.value as Outline[typeof k])} />
    </div>
  );

  const line = (k: keyof Outline, id: string, label: string, placeholder: string) => (
    <div className="pjg-half">
      <label htmlFor={`pjg-f-${id}`} className="pjg-hint">{label}</label>
      <input id={`pjg-f-${id}`} type="text" className="txt" maxLength={LINE_MAX} value={o[k] as string} placeholder={placeholder}
        onChange={(e) => set(k, e.target.value as Outline[typeof k])} />
    </div>
  );

  return (
    <div className="pjg-wrap">
      <nav aria-label="Your outline" className="pjg-nav">
        <div className="pjg-navt">Your outline</div>
        <div className="pjg-prog">
          <span className="pjg-bar" aria-hidden="true"><i style={{ width: `${done * 10}%` }} /></span>
          <span className="pjg-count">{done} of {SECTIONS.length}</span>
        </div>
        <div className="pjg-links">
          {SECTIONS.map((s, i) => {
            const f = s.filled(o);
            return (
              <a key={s.id} href={`#pjg-${s.id}`} className={f ? 'on' : ''} onClick={(e) => jump(e, s.id)}>
                {f
                  ? <span className="pjg-dot on"><svg role="img" aria-label="Filled in" width="13" height="13" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="3" strokeLinecap="round" strokeLinejoin="round"><path d="M5 12.5l4.5 4.5L19 7.5" /></svg></span>
                  : <span className="pjg-dot">{i + 1}</span>}
                {s.short}
              </a>
            );
          })}
        </div>
      </nav>

      <div className="pjg-main">
        <Section title="The basics" />
        {text('q1', 'produce', '1. In one sentence, what should this produce — and for whom?', undefined, 'e.g. An AI agent that triages my support inbox and drafts replies for my team.')}
        {text('q2', 'users', '2. Who is actually using it, and how comfortable are they with tools like this?',
          'Include anything they should never have to understand to use it.',
          "e.g. Two support reps who live in Gmail. They shouldn't have to write prompts.")}

        <div id="pjg-q3" className="pjg-q">
          <div className="pjg-ql">3. What makes it start?</div>
          <div role="group" aria-label="What makes it start?" className="pjg-chips">
            {TRIGGERS.map((t) => <Chip key={t} label={t} on={o.trigger === t} onClick={() => pickOne('trigger', t)} />)}
          </div>
          <label htmlFor="pjg-f-q3" className="pjg-hint" style={{ marginTop: 4 }}>How many in a normal week, and on your busiest?</label>
          <input id="pjg-f-q3" type="text" className="txt" maxLength={LINE_MAX} value={o.volume}
            placeholder="e.g. Around 200 emails a week, 80 on a Monday" onChange={(e) => set('volume', e.target.value)} />
        </div>

        <Section title="How it works" />
        <div id="pjg-q4" className="pjg-q">
          <div className="pjg-ql">4. Which tools does it need to work with?</div>
          <div className="pjg-hint">Tick everything it must read from or write to. "I don't know how we'd connect it" is a perfectly good answer.</div>
          <div role="group" aria-label="Tools it works with" className="pjg-chips">
            {[...TOOLS, ...customTools].map((t) => <Chip key={t} label={t} on={o.tools.includes(t)} onClick={() => toggle('tools', t)} />)}
            {adding ? (
              <input
                autoFocus type="text" className="txt pjg-addin" aria-label="Add a tool" maxLength={60} value={custom}
                placeholder="Type a tool, press Enter"
                onChange={(e) => setCustom(e.target.value)}
                onKeyDown={(e) => { if (e.key === 'Enter') { e.preventDefault(); addCustom(); } if (e.key === 'Escape') { setCustom(''); setAdding(false); } }}
                onBlur={addCustom}
              />
            ) : (
              <button type="button" className="pjg-chip add" onClick={() => setAdding(true)}>
                <svg aria-hidden="true" width="15" height="15" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round"><path d="M12 5v14M5 12h14" /></svg>Add your own
              </button>
            )}
          </div>
        </div>
        {text('q5', 'call', "5. What's the call you're handing over?",
          'The thing you currently work out in your head — and what you look at when you make it.',
          'e.g. Deciding which emails are urgent. I look at who sent it and whether an order number is mentioned.')}

        <Section title="Keeping you in control" />
        {text('q6', 'check', '6. What would you want to look at yourself before it goes out?',
          'What would be bad if it got it wrong and nobody checked?',
          'e.g. Any reply that mentions a refund or a cancellation.')}
        <div id="pjg-q7" className="pjg-q">
          <div className="pjg-ql">7. When it isn't sure, what should it do?</div>
          <div className="pjg-hint">Think about what you do when you aren't sure about one of these.</div>
          <div role="group" aria-label="When it isn't sure" className="pjg-chips">
            {UNSURE.map((t) => <Chip key={t} label={t} on={o.unsure === t} onClick={() => pickOne('unsure', t)} />)}
          </div>
        </div>
        <div id="pjg-q8" className="pjg-q">
          <div className="pjg-ql">8. What would you need to see before you'd let it run on its own?</div>
          <div className="pjg-hint">Pick any that would help. All of these are things it can do.</div>
          <div role="group" aria-label="Before it runs on its own" className="pjg-chips">
            {AUTONOMY.map((t) => <Chip key={t} label={t} on={o.autonomy.includes(t)} onClick={() => toggle('autonomy', t)} />)}
          </div>
        </div>

        <Section title="What good looks like" />
        <div id="pjg-q9" className="pjg-q">
          <div className="pjg-ql">9. How will you know it's working?</div>
          <div className="pjg-pair">
            {line('today', 'q9a', 'How long it takes today, or how often it goes wrong', 'e.g. About 2 hours every morning')}
            {line('good', 'q9b', 'What good would look like', 'e.g. Inbox cleared in 20 minutes')}
          </div>
        </div>
        <div id="pjg-q10" className="pjg-q">
          <div className="pjg-ql">10. The standout, and the cut</div>
          <div className="pjg-pair">
            {line('standout', 'q10a', 'What would make someone watching say "I didn\'t know it could do that"?', 'e.g. It spots a repeat complaint and links the earlier thread')}
            {line('cut', 'q10b', 'What would you drop to get it?', 'e.g. Handling attachments can wait')}
          </div>
        </div>

        <div className="pjg-q pjg-else">
          <label htmlFor="pjg-f-else" className="pjg-ql">Anything else?</label>
          <div className="pjg-hint">Whatever didn't fit a box above. This is the same space as the brain-dump.</div>
          <textarea id="pjg-f-else" rows={3} style={{ minHeight: 96 }} maxLength={freeMax} value={freeText}
            placeholder="Edge cases, things you've tried before, what you've always wished existed…"
            onChange={(e) => onFreeText(e.target.value)} />
        </div>
        {children}
      </div>
    </div>
  );
};

export default GuidedOutline;
