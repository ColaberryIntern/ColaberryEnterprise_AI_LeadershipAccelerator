import React, { useState } from 'react';
import type { GovProposalDocument, GovReviewApi } from '../../../../services/govProjectPortalApi';

/**
 * AgentPanel — the cockpit's AGENT tab (Proposal Studio P5). A reviewer runs the agent review cycle on a document
 * (draft → check → revise toward the 95 bar, stopping at a pass or an open question) and answers the questions the
 * agent could not resolve from grounded facts. Answering saves to the company library and resolves every gap that
 * asked it, so the question is never asked twice. The deterministic copilot rail stays as the fallback.
 *
 * Gates and pricing are never driven here (reviewer-only actions live on Review); this panel is the agent's
 * draft/revise + the human answer loop.
 */
export default function AgentPanel({ projectId, docs, reviewApi }: { projectId: string; docs: GovProposalDocument[]; reviewApi?: GovReviewApi }): React.ReactElement {
  const [busy, setBusy] = useState<string | null>(null);
  const [cycleMsg, setCycleMsg] = useState<string | null>(null);
  const [question, setQuestion] = useState('');
  const [answer, setAnswer] = useState('');
  const [answerMsg, setAnswerMsg] = useState<string | null>(null);

  if (!reviewApi) {
    return <div className="gck-empty" style={{ padding: 16 }}>The agent review cycle and question answering are run by a reviewer. Open questions a reviewer records will appear on your documents.</div>;
  }

  const runCycle = async (docKey: string) => {
    setBusy(docKey); setCycleMsg(null);
    try { const r = await reviewApi.runReviewCycle(projectId, docKey); setCycleMsg(`Review cycle started on "${docKey}" (up to ${r.maxIterations} iterations). New versions will appear in Review.`); }
    catch (e: any) { setCycleMsg(e?.response?.data?.error ?? 'Could not start the cycle.'); }
    finally { setBusy(null); }
  };

  const submitAnswer = async () => {
    if (!question.trim() || !answer.trim()) return;
    setBusy('answer'); setAnswerMsg(null);
    try { const r = await reviewApi.answerQuestion(projectId, question.trim(), answer.trim()); setAnswerMsg(`Saved to the library and resolved ${r.gapsResolved} open question(s).`); setQuestion(''); setAnswer(''); }
    catch (e: any) { setAnswerMsg(e?.response?.data?.error ?? 'Could not save the answer.'); }
    finally { setBusy(null); }
  };

  return (
    <div>
      <div className="gck-panel" style={{ marginBottom: 12 }}>
        <div className="gck-eyebrow" style={{ marginBottom: 6 }}>Run the agent</div>
        <p className="gck-hint" style={{ marginTop: 0 }}>The agent drafts and revises toward 95%, stopping on a pass or an open question. Each iteration writes a version you can review.</p>
        {docs.length === 0 ? <p className="gck-hint">No documents yet.</p> : docs.map((d) => (
          <div key={d.key} className="gck-reqrow">
            <span className="gck-reqtext">{d.title}</span>
            <button type="button" className="gck-btn" disabled={busy === d.key} onClick={() => runCycle(d.key)}>{busy === d.key ? 'Starting…' : 'Run review cycle'}</button>
          </div>
        ))}
        {cycleMsg && <p className="gck-hint" style={{ marginTop: 8 }}>{cycleMsg}</p>}
      </div>

      <div className="gck-panel">
        <div className="gck-eyebrow" style={{ marginBottom: 6 }}>Answer a question</div>
        <p className="gck-hint" style={{ marginTop: 0 }}>Answer a question the agent raised. The answer is saved to the company library and resolves every open gap that asked it.</p>
        <input type="text" className="gck-input" style={{ display: 'block', width: '100%', marginBottom: 8 }} placeholder="The question (e.g. Who signs the Execution of Offer?)" value={question} onChange={(e) => setQuestion(e.target.value)} />
        <textarea className="gck-input" style={{ display: 'block', width: '100%', minHeight: 70, marginBottom: 8 }} placeholder="The answer (a verifiable fact)" value={answer} onChange={(e) => setAnswer(e.target.value)} />
        <button type="button" className="gck-btn" disabled={busy === 'answer' || !question.trim() || !answer.trim()} onClick={submitAnswer}>{busy === 'answer' ? 'Saving…' : 'Save answer'}</button>
        {answerMsg && <p className="gck-hint" style={{ marginTop: 8 }}>{answerMsg}</p>}
      </div>
    </div>
  );
}
