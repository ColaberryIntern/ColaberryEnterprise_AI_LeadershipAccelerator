import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import portalApi from '../../utils/portalApi';
import { copyText } from '../../utils/clipboard';
import { trackEvent } from '../../utils/tracker';
import {
  parseClaudeStudio, ParsedStudio, StageKey, STAGE_ORDER, STAGE_LABELS,
  loadDraft, saveDraft, clearDraft, StudioDraft, EMPTY_DRAFT,
} from './claudeStudioParse';

/**
 * ClaudeStudioRender — the bespoke renderer for the `claude_studio` curriculum
 * type (render_band `claude_studio`). Shared by the card drawer
 * (CardDetailBody) and the workspace (RuntimeWorkspace), exactly like
 * SetupLabRender / PromptCatalogRender / BuildArtifactsRender.
 *
 * What it is: the Claude.ai counterpart to the Claude Code spine. A student
 * walks four stages — explore, organize a Project, create an Artifact, prove and
 * publish — copying prompts into THEIR OWN Claude account, then comes back and
 * submits the Artifact link plus their reflection.
 *
 * Why native DOM rather than the generic sandboxed iframe: the stage checkboxes,
 * the real clipboard Copy buttons, and the submission form all need JavaScript,
 * and `body_html` runs sandboxed with scripts disabled. Same reasoning as the
 * Setup Lab.
 *
 * Claude.ai is NEVER embedded. Authentication, framing rules, and the platform's
 * own terms all forbid it, and doing so would also put us between a student and
 * their private conversations. The launch controls are plain outbound links to
 * the student's own authorized account, opened in a new tab, and nothing here
 * reads, requests, or stores what happens on the other side.
 *
 * Completion is earned, not clicked: all four stages acknowledged, every
 * reflection check confirmed, a well-formed Artifact link, and a written
 * reflection. The server re-validates all of it (claudeStudioService) — this
 * form is the courtesy, not the gate. Points come from the idempotent
 * progression path, so revising a submission never awards more.
 *
 * Accessibility: every control is a real, labelled, focusable element; state is
 * carried by text and shape as well as colour; the stage list is a group of
 * checkboxes with an associated legend; and errors are announced via a live
 * region rather than colour alone.
 */
interface Props {
  bodyHtml: string;
  title?: string | null;
  summary?: string | null;
  estMin?: number | null;
  points?: number | null;
  difficulty?: string | null;
  variant?: 'drawer' | 'workspace';
  cardId?: string;
  completed?: boolean;
  /** Called after a successful submit so the host can refresh progress. */
  onSubmitted?: () => Promise<void> | void;
  /** Fires when the student copies any prompt, so the host can reveal completion affordances. */
  onCopied?: () => void;
  /** Read-only preview (admin Studio / instructor view): no submission, no drafts. */
  preview?: boolean;
}

const ACCENT = '#6C5CE7';

const CSS = `
.st-render{--st-line:#e4e9f1;--st-tx:#1a2233;--st-mut:#5b6675;--st-ink:#0b2b4a;--st-accent:${ACCENT};--st-accent2:#5546c9;
  --st-soft:#f3f1fe;--st-softline:#ded8fb;--st-green:#0b6e3f;--st-greenbg:#eafaf1;--st-greenline:#bfe6cd;--st-err:#b3261e;
  background:#fff;color:var(--st-tx);display:flex;flex-direction:column;flex:1;min-height:0;overflow-y:auto;
  font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;font-size:14.5px;line-height:1.62}
.st-render .st-inner{padding:20px 22px 32px;max-width:820px;margin:0 auto;width:100%}
.st-render.st-workspace .st-inner{padding:26px 30px 44px}
.st-render :focus-visible{outline:3px solid var(--st-accent);outline-offset:2px;border-radius:6px}
.st-badge{display:inline-flex;align-items:center;gap:7px;font-size:10px;font-weight:800;letter-spacing:1.2px;color:#fff;
  background:linear-gradient(90deg,var(--st-accent),#8B7BF0);padding:4px 11px;border-radius:20px;margin:0 0 12px}
.st-title{font-size:20px;font-weight:800;color:var(--st-ink);margin:0 0 8px;letter-spacing:-.2px}
.st-meta{display:flex;flex-wrap:wrap;gap:8px;margin:0 0 14px;padding:0;list-style:none}
.st-meta li{font-size:10.5px;font-weight:700;letter-spacing:.4px;color:var(--st-mut);background:#f2f5fa;
  border:1px solid var(--st-line);border-radius:20px;padding:3px 10px;text-transform:uppercase}
.st-asset{background:var(--st-soft);border:1px solid var(--st-softline);border-left:3px solid var(--st-accent);
  border-radius:0 10px 10px 0;padding:12px 15px;margin:0 0 14px;font-size:13.5px;color:#332a6b}
.st-sum{color:#42506a;margin:0 0 16px;font-size:14px}
.st-launch{display:flex;flex-wrap:wrap;gap:9px;margin:0 0 8px}
.st-launch a{display:inline-flex;align-items:center;gap:7px;font-size:13px;font-weight:750;text-decoration:none;
  color:var(--st-accent2);background:var(--st-soft);border:1px solid var(--st-softline);border-radius:9px;padding:9px 14px}
.st-launch a:hover{background:var(--st-accent);color:#fff;border-color:var(--st-accent)}
.st-privacy{font-size:12.4px;color:var(--st-mut);margin:0 0 18px;line-height:1.55}
.st-h{font-size:11.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--st-accent2);
  margin:24px 0 10px;padding-bottom:6px;border-bottom:1px solid #ece9fb}
.st-scenario{background:#fbfcfe;border:1px solid var(--st-line);border-radius:12px;padding:14px 16px;margin:0 0 6px;font-size:13.8px;color:#33415c}
.st-role{display:block;margin-top:8px;font-size:12.6px;color:var(--st-mut)}
.st-list{margin:0;padding-left:20px;color:#33415c}
.st-list li{margin:5px 0}
.st-fs{border:0;padding:0;margin:0;min-width:0}
.st-fs legend{padding:0;font-size:11.5px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:var(--st-accent2);
  margin:24px 0 10px;width:100%;padding-bottom:6px;border-bottom:1px solid #ece9fb}
.st-prog{display:flex;align-items:center;gap:10px;margin:0 0 12px;font-size:12.6px;color:var(--st-mut);font-weight:650}
.st-bar{flex:1;height:7px;border-radius:99px;background:#eceef4;overflow:hidden;min-width:80px}
.st-bar i{display:block;height:100%;background:var(--st-accent);transition:width .25s}
.st-stage{border:1px solid var(--st-line);border-radius:13px;padding:0;margin:0 0 10px;background:#fff;overflow:hidden}
.st-stage.done{border-color:var(--st-greenline);background:#fbfffd}
.st-stage-lbl{display:flex;align-items:flex-start;gap:11px;padding:14px 16px;cursor:pointer;margin:0}
.st-stage-lbl input{margin:2px 0 0;width:18px;height:18px;flex:0 0 auto;accent-color:${ACCENT};cursor:pointer}
.st-stage-hd{flex:1;min-width:0}
.st-stage-top{display:flex;align-items:baseline;gap:9px;flex-wrap:wrap}
.st-stage-n{font-size:11px;font-weight:800;color:var(--st-accent);text-transform:uppercase;letter-spacing:.05em}
.st-stage-t{font-size:14.5px;font-weight:750;color:var(--st-ink)}
.st-min{margin-left:auto;font-size:11px;font-weight:700;color:var(--st-mut);background:#f2f5fa;border:1px solid var(--st-line);
  border-radius:20px;padding:2px 9px;white-space:nowrap}
.st-stage-body{padding:0 16px 15px 45px}
.st-inst{color:#33415c;font-size:13.8px;margin:0 0 8px}
.st-steps{margin:0;padding-left:19px;color:#33415c;font-size:13.5px}
.st-steps li{margin:4px 0}
.st-donetag{display:inline-flex;align-items:center;gap:5px;font-size:11px;font-weight:800;color:var(--st-green);
  background:var(--st-greenbg);border:1px solid var(--st-greenline);border-radius:20px;padding:2px 9px}
.st-prompt{margin:0 0 14px}
.st-plabel{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:var(--st-accent2);margin:0 0 3px}
.st-kind{font-size:10px;font-weight:800;letter-spacing:.06em;color:#fff;background:var(--st-accent);border-radius:20px;padding:2px 8px;margin-left:7px;text-transform:uppercase}
.st-why{font-size:12.8px;color:var(--st-mut);margin:0 0 7px}
.st-pre{background:#141a2e;border-left:3px solid var(--st-accent);color:#e7eefc;padding:13px 15px;border-radius:9px 9px 0 0;
  overflow:auto;font-family:Consolas,Menlo,monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;margin:0;max-height:340px}
.st-copy{display:block;width:100%;border:1px solid var(--st-accent);border-top:0;background:#fff;color:var(--st-accent2);
  font-weight:800;font-size:12.5px;padding:11px;border-radius:0 0 9px 9px;cursor:pointer;letter-spacing:.3px;font-family:inherit}
.st-copy:hover{background:var(--st-accent);color:#fff}
.st-copy.done{background:var(--st-greenbg);border-color:var(--st-greenline);color:var(--st-green)}
.st-block{border:1px solid var(--st-line);border-radius:13px;padding:15px 17px;margin:0 0 12px;background:#fbfcfe}
.st-block h4{font-size:13.5px;font-weight:750;margin:0 0 8px;color:var(--st-ink)}
.st-block ul,.st-block ol{margin:0;padding-left:19px;color:#33415c;font-size:13.5px}
.st-block li{margin:5px 0}
.st-trust{background:#fff8f2;border-color:#f3ddc7}
.st-trust h4{color:#8a4b16}
.st-trust li{color:#6d4520}
.st-sub{border:1px solid var(--st-softline);border-radius:14px;background:var(--st-soft);padding:18px 20px;margin:18px 0 0}
.st-sub h3{font-size:15px;font-weight:800;color:var(--st-ink);margin:0 0 4px}
.st-sub-p{font-size:12.8px;color:#4a4270;margin:0 0 14px;line-height:1.55}
.st-field{margin:0 0 13px}
.st-lbl{display:block;font-size:12.4px;font-weight:750;color:var(--st-ink);margin:0 0 5px}
.st-hint{display:block;font-weight:500;color:var(--st-mut);font-size:11.8px;margin-top:2px}
.st-render input[type=url],.st-render textarea{width:100%;padding:10px 12px;border:1px solid var(--st-line);border-radius:9px;
  font-size:14px;color:var(--st-tx);background:#fff;font-family:inherit;line-height:1.55}
.st-render textarea{min-height:120px;resize:vertical}
.st-checks{list-style:none;margin:0 0 13px;padding:0}
.st-checks li{margin:0 0 7px}
.st-checks label{display:flex;align-items:flex-start;gap:9px;font-size:13.3px;color:#33415c;cursor:pointer}
.st-checks input{margin:2px 0 0;width:17px;height:17px;flex:0 0 auto;accent-color:${ACCENT};cursor:pointer}
.st-submit{border:0;border-radius:10px;padding:13px 16px;font-weight:800;font-size:13.5px;cursor:pointer;
  background:var(--st-accent);color:#fff;width:100%;font-family:inherit}
.st-submit:hover:not(:disabled){background:var(--st-accent2)}
.st-submit:disabled{opacity:.55;cursor:not-allowed}
.st-gate{font-size:12.4px;color:#6d4520;background:#fff8f2;border:1px solid #f3ddc7;border-radius:9px;padding:9px 12px;margin:0 0 11px}
.st-err{color:var(--st-err);background:#fdeceb;border:1px solid #f5c6c2;border-radius:9px;padding:9px 12px;font-size:12.8px;margin:11px 0 0}
.st-ok{border:1px solid var(--st-greenline);background:var(--st-greenbg);color:var(--st-green);border-radius:12px;
  padding:14px 16px;margin:18px 0 0;font-size:13.5px}
.st-ok b{display:block;margin-bottom:4px}
.st-pending{font-size:12.6px;color:#5c4a1a;background:#fff7e6;border:1px solid #ffe0a3;border-radius:9px;padding:9px 12px;margin:10px 0 0;line-height:1.5}
.st-draft{font-size:11.8px;color:var(--st-mut);margin:8px 0 0;text-align:right}
.st-rubric table{width:100%;border-collapse:collapse;font-size:12.6px}
.st-rubric th,.st-rubric td{border:1px solid var(--st-line);padding:7px 9px;text-align:left;vertical-align:top}
.st-rubric th{background:#f4f6fb;font-weight:750;color:var(--st-ink);font-size:11.4px;text-transform:uppercase;letter-spacing:.04em}
.st-rubric td:first-child{font-weight:700;color:#332a6b;white-space:nowrap}
.st-scroll{overflow-x:auto}
@media(max-width:600px){
  .st-render .st-inner{padding:16px 14px 28px}
  .st-stage-body{padding:0 14px 14px 14px}
  .st-min{margin-left:0}
  .st-rubric table,.st-rubric tbody,.st-rubric tr,.st-rubric td{display:block;width:100%}
  .st-rubric thead{display:none}
  .st-rubric td{border-top:0}
  .st-rubric tr{margin-bottom:10px;border-top:1px solid var(--st-line)}
}
@media(prefers-reduced-motion:reduce){.st-bar i{transition:none}}
/* single-scroll, light drawer body when it hosts a Claude Studio */
.tld-body--claudestudio{padding:0 !important;background:#fff !important;overflow:hidden !important;display:flex !important}
`;

const ClaudeStudioRender: React.FC<Props> = ({
  bodyHtml, title, summary, estMin, points, difficulty, variant,
  cardId, completed, onSubmitted, onCopied, preview,
}) => {
  const studio: ParsedStudio | null = useMemo(() => parseClaudeStudio(bodyHtml || ''), [bodyHtml]);

  const [draft, setDraft] = useState<StudioDraft>(EMPTY_DRAFT);
  const [copied, setCopied] = useState<Set<number>>(new Set());
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [serverState, setServerState] = useState<{ submitted: boolean; attempt: number; review_state: string | null } | null>(null);
  const [draftSaved, setDraftSaved] = useState(false);
  const onCopiedRef = useRef(onCopied);
  onCopiedRef.current = onCopied;

  // Resume a saved draft. Preview never touches storage — an instructor looking
  // at a student's studio must not inherit or overwrite anyone's draft.
  useEffect(() => {
    if (!cardId || preview) return;
    setDraft(loadDraft(cardId));
  }, [cardId, preview]);

  // Load any existing submission so a returning student sees their own state
  // rather than an empty form over a completed card.
  useEffect(() => {
    if (!cardId || preview) return;
    let alive = true;
    portalApi.get(`/api/portal/runtime/cards/${cardId}/claude-studio`)
      .then((r: any) => {
        if (!alive || !r?.data?.submitted) return;
        setServerState({ submitted: true, attempt: Number(r.data.attempt) || 1, review_state: r.data.review_state || null });
        setDraft((d) => ({
          ...d,
          artifactUrl: r.data.artifact_url || d.artifactUrl,
          projectProofUrl: r.data.project_proof_url || d.projectProofUrl,
          reflection: r.data.reflection || d.reflection,
          stages: STAGE_ORDER.slice(),
        }));
      })
      .catch(() => { /* no submission yet, or offline — the form still works */ });
    return () => { alive = false; };
  }, [cardId, preview]);

  /**
   * Analytics — METADATA ONLY, and deliberately so.
   *
   * We record that a stage was ticked, that a prompt of a given kind was copied,
   * that a launch link was clicked, and that a submission happened. We never send
   * prompt text, reflection text, the Artifact URL, or anything the student wrote
   * or pasted. A studio's whole premise is that their Claude work stays theirs,
   * and an analytics call is exactly the sort of place that promise leaks.
   *
   * `trackEvent` already no-ops under Do Not Track and when the tracker never
   * initialised, so these are safe to fire unconditionally.
   */
  const track = useCallback((event: string, props: Record<string, unknown> = {}) => {
    if (preview) return;   // an instructor previewing is not a student doing the work
    trackEvent(`claude_studio_${event}`, { card_id: cardId || null, variant: variant || 'drawer', ...props });
  }, [cardId, variant, preview]);

  // Studio opened. Fires once per mount; `resumed` distinguishes a returning
  // student from a first open, which is the signal worth having here.
  const viewedRef = useRef(false);
  useEffect(() => {
    if (viewedRef.current || !studio || preview) return;
    viewedRef.current = true;
    track('viewed', { cert_active: studio.certActive, stages: studio.stages.length });
  }, [studio, preview, track]);

  const persist = useCallback((next: StudioDraft) => {
    setDraft(next);
    if (cardId && !preview) {
      saveDraft(cardId, next);
      setDraftSaved(true);
      window.setTimeout(() => setDraftSaved(false), 1600);
    }
  }, [cardId, preview]);

  const toggleStage = (key: StageKey) => {
    const has = draft.stages.includes(key);
    const stages = has ? draft.stages.filter((s) => s !== key) : [...draft.stages, key];
    persist({ ...draft, stages });
    if (!has) track('stage_completed', { stage: key, done: stages.length, total: stagesTotal });
  };

  const toggleCheck = (i: number) => {
    const has = draft.checks.includes(i);
    persist({ ...draft, checks: has ? draft.checks.filter((c) => c !== i) : [...draft.checks, i] });
  };

  const copy = (index: number, text: string) => {
    const done = () => {
      setCopied((s) => { const n = new Set(s); n.add(index); return n; });
      // Kind and position only. The prompt body never leaves the page.
      track('prompt_copied', { kind: studio?.prompts[index]?.kind || 'unknown', index });
      onCopiedRef.current?.();
      window.setTimeout(() => setCopied((s) => { const n = new Set(s); n.delete(index); return n; }), 2400);
    };
    copyText(text).then(done, done);
  };

  const isDone = !!completed || !!serverState?.submitted;
  const stagesDone = studio ? studio.stages.filter((s) => draft.stages.includes(s.key)).length : 0;
  const stagesTotal = studio ? studio.stages.length : 0;
  const checksTotal = studio ? studio.checks.length : 0;
  const checksDone = draft.checks.length;

  // The reasons the submit button is disabled, in the order a student would fix
  // them. Shown as text, not implied by a greyed-out button.
  const gaps: string[] = [];
  if (stagesTotal && stagesDone < stagesTotal) gaps.push(`tick all ${stagesTotal} stages (${stagesDone} done)`);
  if (checksTotal && checksDone < checksTotal) gaps.push(`confirm all ${checksTotal} reflection checks (${checksDone} done)`);
  if (!draft.artifactUrl.trim()) gaps.push('paste your Artifact link');
  if (draft.reflection.trim().length < 120) gaps.push('write your reflection (a couple of sentences at least)');
  const canSubmit = gaps.length === 0 && !submitting;

  const submit = async () => {
    if (!cardId || !canSubmit) return;
    setSubmitting(true); setError('');
    try {
      const res: any = await portalApi.post(`/api/portal/runtime/cards/${cardId}/claude-studio`, {
        artifact_url: draft.artifactUrl.trim(),
        project_proof_url: draft.projectProofUrl.trim() || null,
        stages_completed: draft.stages,
        checks_confirmed: draft.checks,
        checks_total: checksTotal,
        reflection: draft.reflection.trim(),
        ai_disclosure: draft.aiDisclosure.trim() || null,
      });
      const attempt = Number(res?.data?.attempt) || 1;
      setServerState({
        submitted: true,
        attempt,
        review_state: res?.data?.review_state || 'pending_review',
      });
      // Whether it happened and whether it was a revision — not what was written.
      track(attempt > 1 ? 'revised' : 'submitted', { attempt, has_project_proof: !!draft.projectProofUrl.trim() });
      clearDraft(cardId);
      if (onSubmitted) await onSubmitted();
    } catch (e: any) {
      setError(e?.response?.data?.error || 'Submission failed — please try again.');
    } finally {
      setSubmitting(false);
    }
  };

  // Contract not met (hand-edited body, or a type mismatch): render the HTML as
  // authored rather than a blank panel. A visible downgrade beats a silent one.
  if (!studio) {
    return (
      <div className={`st-render st-${variant || 'drawer'}`}>
        <style>{CSS}</style>
        <div className="st-inner">
          <span className="st-badge">&#9670; CLAUDE.AI &middot; STUDIO</span>
          {title && <h2 className="st-title">{title}</h2>}
          <div dangerouslySetInnerHTML={{ __html: bodyHtml || '' }} />
        </div>
      </div>
    );
  }

  const block = (name: string) => studio.blocks[name];

  return (
    <div className={`st-render st-${variant || 'drawer'}`}>
      <style>{CSS}</style>
      <div className="st-inner">
        <span className="st-badge">&#9670; CLAUDE.AI &middot; STUDIO</span>
        {title && <h2 className="st-title">{title}</h2>}

        {(estMin || points || difficulty) && (
          <ul className="st-meta">
            {estMin ? <li>Length {estMin} min</li> : null}
            {points ? <li>Points +{points} pts</li> : null}
            {difficulty ? <li>Level {difficulty}</li> : null}
            {studio.certActive ? <li>Certification prep active</li> : null}
          </ul>
        )}

        {studio.careerAsset && (
          <div className="st-asset"><b>What you walk away with:</b> {studio.careerAsset}</div>
        )}
        {/* The studio's authored intro wins over the card summary. The summary is
            a generic one-liner built for the feed tile ("<asset>, built in Claude
            across four stages…") and it duplicates the asset callout directly
            above; the intro is the hand-written hook for this specific week. */}
        {(studio.intro || summary) && <p className="st-sum">{studio.intro || summary}</p>}

        <div className="st-launch">
          <a href={studio.chatUrl} target="_blank" rel="noopener noreferrer" onClick={() => track('launched', { target: 'conversation' })}>Open Claude &rarr;</a>
          <a href={studio.projectsUrl} target="_blank" rel="noopener noreferrer" onClick={() => track('launched', { target: 'projects' })}>Open Claude Projects &rarr;</a>
        </div>
        <p className="st-privacy">
          These open Claude.ai in a new tab and use your own authorized Claude account. Nothing you type
          there is read by or sent back to this platform &mdash; you submit only the Artifact link and your
          own written work.
        </p>

        {studio.scenario && (
          <>
            <h3 className="st-h">The situation</h3>
            <div className="st-scenario">
              {studio.scenario}
              {studio.role && <span className="st-role"><b>Your role:</b> {studio.role}</span>}
            </div>
          </>
        )}

        {studio.objectives.length > 0 && (
          <>
            <h3 className="st-h">What you&rsquo;ll be able to do</h3>
            <ul className="st-list">{studio.objectives.map((o, i) => <li key={i}>{o}</li>)}</ul>
          </>
        )}

        <fieldset className="st-fs">
          <legend>The four stages</legend>
          <div className="st-prog">
            <span>{stagesDone} of {stagesTotal} stages</span>
            <span className="st-bar" aria-hidden="true">
              <i style={{ width: `${stagesTotal ? (stagesDone / stagesTotal) * 100 : 0}%` }} />
            </span>
          </div>
          {studio.stages.map((stage, i) => {
            const done = draft.stages.includes(stage.key);
            const id = `st-stage-${cardId || 'preview'}-${stage.key}`;
            return (
              <section className={`st-stage${done ? ' done' : ''}`} key={stage.key}>
                <label className="st-stage-lbl" htmlFor={id}>
                  <input
                    id={id}
                    type="checkbox"
                    checked={done}
                    disabled={!!preview}
                    onChange={() => toggleStage(stage.key)}
                  />
                  <span className="st-stage-hd">
                    <span className="st-stage-top">
                      <span className="st-stage-n">{i + 1} &middot; {STAGE_LABELS[stage.key]}</span>
                      {done && <span className="st-donetag">&#10003; Done</span>}
                      {stage.minutes ? <span className="st-min">{stage.minutes} min</span> : null}
                    </span>
                    <span className="st-stage-t">{stage.title}</span>
                  </span>
                </label>
                <div className="st-stage-body">
                  {stage.instruction && <p className="st-inst">{stage.instruction}</p>}
                  {stage.steps.length > 0 && (
                    <ol className="st-steps">{stage.steps.map((s, si) => <li key={si}>{s}</li>)}</ol>
                  )}
                </div>
              </section>
            );
          })}
        </fieldset>

        {block('project') && (
          <>
            <h3 className="st-h">Set up your Project</h3>
            <section className="st-block">
              {block('project').heading && <h4>{block('project').heading}</h4>}
              <div dangerouslySetInnerHTML={{ __html: block('project').html }} />
            </section>
          </>
        )}

        {studio.prompts.length > 0 && (
          <>
            <h3 className="st-h">Prompts to start from</h3>
            {studio.prompts.map((p, i) => (
              <div className="st-prompt" key={i}>
                <div className="st-plabel">
                  {p.label}<span className="st-kind">{p.kind}</span>
                </div>
                {p.why && <p className="st-why">{p.why}</p>}
                <pre className="st-pre">{p.text}</pre>
                <button
                  type="button"
                  className={`st-copy${copied.has(i) ? ' done' : ''}`}
                  onClick={() => copy(i, p.text)}
                >
                  {copied.has(i) ? '✓  Copied — paste it into Claude' : '\u{1F4CB}  Copy prompt'}
                </button>
              </div>
            ))}
          </>
        )}

        {block('artifact') && (
          <>
            <h3 className="st-h">What the Artifact must contain</h3>
            <section className="st-block">
              {block('artifact').heading && <h4>{block('artifact').heading}</h4>}
              <div dangerouslySetInnerHTML={{ __html: block('artifact').html }} />
            </section>
          </>
        )}

        {block('trust') && (
          <>
            <h3 className="st-h">Trust checkpoints</h3>
            <section className="st-block st-trust">
              <div dangerouslySetInnerHTML={{ __html: block('trust').html }} />
            </section>
          </>
        )}

        {block('deliverables') && (
          <>
            <h3 className="st-h">What you submit</h3>
            <section className="st-block">
              <div dangerouslySetInnerHTML={{ __html: block('deliverables').html }} />
            </section>
          </>
        )}

        {!preview && (
          <div className="st-sub">
            <h3>Submit your studio</h3>
            <p className="st-sub-p">
              Paste the share link for the Artifact you built in Claude, confirm the checks, and write your
              reflection. We check that the link is well formed &mdash; we do not open it, and reviewers see
              it marked as an unverified link until someone reviews your work.
            </p>

            {studio.freeResponse && (
              <div className="st-field">
                <span className="st-lbl">The question your reflection answers</span>
                <p className="st-inst">{studio.freeResponse}</p>
              </div>
            )}

            <div className="st-field">
              <label className="st-lbl" htmlFor={`st-art-${cardId}`}>
                Artifact link
                <span className="st-hint">The share link from Claude, starting with https://</span>
              </label>
              <input
                id={`st-art-${cardId}`}
                type="url"
                inputMode="url"
                placeholder="https://claude.ai/..."
                value={draft.artifactUrl}
                onChange={(e) => persist({ ...draft, artifactUrl: e.target.value })}
              />
            </div>

            <div className="st-field">
              <label className="st-lbl" htmlFor={`st-proj-${cardId}`}>
                Project proof link <span style={{ fontWeight: 500 }}>(optional)</span>
                <span className="st-hint">A link showing your Project setup, if you have one to share</span>
              </label>
              <input
                id={`st-proj-${cardId}`}
                type="url"
                inputMode="url"
                placeholder="https://..."
                value={draft.projectProofUrl}
                onChange={(e) => persist({ ...draft, projectProofUrl: e.target.value })}
              />
            </div>

            {studio.checks.length > 0 && (
              <fieldset className="st-fs">
                <legend style={{ margin: '0 0 8px', border: 0, fontSize: '12.4px' }}>
                  Confirm before you submit ({checksDone} of {checksTotal})
                </legend>
                <ul className="st-checks">
                  {studio.checks.map((c, i) => {
                    const id = `st-check-${cardId}-${i}`;
                    return (
                      <li key={i}>
                        <label htmlFor={id}>
                          <input
                            id={id}
                            type="checkbox"
                            checked={draft.checks.includes(i)}
                            onChange={() => toggleCheck(i)}
                          />
                          <span>{c}</span>
                        </label>
                      </li>
                    );
                  })}
                </ul>
              </fieldset>
            )}

            <div className="st-field">
              <label className="st-lbl" htmlFor={`st-refl-${cardId}`}>
                Your reflection
                <span className="st-hint">Your own words. Do not paste a Claude conversation &mdash; we do not store those.</span>
              </label>
              <textarea
                id={`st-refl-${cardId}`}
                value={draft.reflection}
                onChange={(e) => persist({ ...draft, reflection: e.target.value })}
              />
            </div>

            <div className="st-field">
              <label className="st-lbl" htmlFor={`st-ai-${cardId}`}>
                How you used AI here <span style={{ fontWeight: 500 }}>(optional)</span>
                <span className="st-hint">What you decided versus what Claude drafted. This travels with the evidence.</span>
              </label>
              <textarea
                id={`st-ai-${cardId}`}
                style={{ minHeight: 70 }}
                value={draft.aiDisclosure}
                onChange={(e) => persist({ ...draft, aiDisclosure: e.target.value })}
              />
            </div>

            {gaps.length > 0 && !isDone && (
              <p className="st-gate">Before you can submit: {gaps.join('; ')}.</p>
            )}

            <button type="button" className="st-submit" disabled={!canSubmit} onClick={submit}>
              {submitting ? 'Submitting…' : isDone ? 'Update my submission' : 'Submit studio'}
            </button>

            <p className="st-draft" aria-live="polite">{draftSaved ? 'Draft saved' : ' '}</p>

            <div role="alert" aria-live="assertive">
              {error && <p className="st-err">{error}</p>}
            </div>

            {isDone && (
              <>
                <div className="st-ok">
                  <b>&#10003; Studio submitted{serverState && serverState.attempt > 1 ? ` (revision ${serverState.attempt})` : ''}.</b>
                  You can revise it any time. Points are awarded once, on your first submission &mdash; revising
                  does not add more.
                </div>
                {serverState?.review_state === 'pending_review' && (
                  <p className="st-pending">
                    Awaiting review. Your Artifact link was checked for format only &mdash; nobody has opened it
                    yet, so this is not marked as verified work until a reviewer looks at it.
                  </p>
                )}
              </>
            )}
          </div>
        )}

        {block('rubric') && (
          <>
            <h3 className="st-h">How this is assessed</h3>
            <section className="st-block st-rubric">
              <div className="st-scroll" dangerouslySetInnerHTML={{ __html: block('rubric').html }} />
            </section>
          </>
        )}
      </div>
    </div>
  );
};

export default ClaudeStudioRender;
