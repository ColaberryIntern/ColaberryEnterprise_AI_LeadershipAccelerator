import React, { useRef, useState } from 'react';
import { askGovCopilot } from '../../../../services/govProjectPortalApi';

/**
 * CopilotRail — the project copilot. It asks the backend's DETERMINISTIC copilot endpoint, which answers from the
 * same student-safe projection the page renders, and shows the exchange as a simple log. The quick buttons send the
 * canned questions; the input sends anything. Errors never throw — they land as a copilot line.
 */
type Msg = { who: 'me' | 'ai'; text: string };

const QUICK: Array<{ q: string; label: string }> = [
  { q: 'What should I do next?', label: 'What should I do next?' },
  { q: 'Review the matched commits', label: 'Review the matched commits' },
  { q: "What's at risk?", label: "What's at risk?" },
  { q: 'Draft a proposal answer', label: 'Draft a proposal answer' },
];

export default function CopilotRail({ projectId, greeting }: { projectId: string; greeting: string }): React.ReactElement {
  const [log, setLog] = useState<Msg[]>([{ who: 'ai', text: greeting }]);
  const [input, setInput] = useState('');
  const [busy, setBusy] = useState(false);
  const logRef = useRef<HTMLDivElement>(null);

  const push = (m: Msg) => setLog((l) => { const next = [...l, m]; return next; });
  const scroll = () => { requestAnimationFrame(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }); };

  const ask = async (question: string) => {
    const q = question.trim();
    if (!q || busy) return;
    push({ who: 'me', text: q }); scroll(); setBusy(true);
    try {
      const { answer } = await askGovCopilot(projectId, q);
      push({ who: 'ai', text: answer });
    } catch {
      push({ who: 'ai', text: 'I could not answer just now. Try again in a moment.' });
    } finally {
      setBusy(false); scroll();
    }
  };

  return (
    <aside className="gck-rail">
      <div className="gck-copilot">
        <header>
          <div className="gck-spark" aria-hidden="true">AI</div>
          <div><h2>Project copilot</h2><p>Knows this project&rsquo;s tasks and synced commits</p></div>
        </header>
        <div className="gck-log" ref={logRef} aria-live="polite">
          {log.map((m, i) => <div key={i} className={`gck-msg ${m.who}`}>{m.text}</div>)}
          {busy && <div className="gck-msg ai">Thinking&hellip;</div>}
        </div>
        <div className="gck-quick">
          {QUICK.map((b) => (
            <button key={b.q} type="button" disabled={busy} onClick={() => void ask(b.q)}>{b.label}</button>
          ))}
        </div>
        <form className="gck-ask" onSubmit={(e) => { e.preventDefault(); const v = input; setInput(''); void ask(v); }}>
          <input value={input} onChange={(e) => setInput(e.target.value)} placeholder="Ask about this project&hellip;" aria-label="Ask the copilot" />
          <button className="gck-btn primary" type="submit" disabled={busy || !input.trim()}>Ask</button>
        </form>
      </div>
    </aside>
  );
}
