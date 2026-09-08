/**
 * claudeStudioFormat — the single source of truth for what a Claude Studio card
 * LOOKS like, used by three consumers that must never drift apart:
 *
 *   • `seedClaudeStudioCards.ts` — renders the 13 hand-authored studios to
 *     `body_html` for the real cards.
 *   • `seedComponentAuthoring.ts` — the `claude_studio` generation prompt pins
 *     this exact `<style>` and structure so an LLM-generated studio for a new
 *     week matches the authored ones.
 *   • `ClaudeStudioRender.tsx` — parses the emitted data attributes back out to
 *     drive the native stage/prompt/submission UI.
 *
 * Same pattern as `intelCardFormats.ts`. The markup is self-contained (its own
 * `<style>`, no scripts, no external assets) so that if the bespoke renderer is
 * ever unavailable the card still renders correctly through the generic
 * `lessonDoc` iframe — the renderer is an enhancement, not a dependency.
 *
 * CONTRACT (read before changing any class name or data attribute):
 *   root      <div class="cs" data-claude-studio="1" data-chat-url data-projects-url
 *                  data-cert-active data-career-asset data-week-theme>
 *   stage     <section class="cs-stage" data-stage="explore|organize|create|prove"
 *                  data-title data-min>  <p class="cs-inst">  <ol class="cs-steps">
 *   prompt    <div class="cs-prompt" data-prompt="starter|improve|followup"
 *                  data-label data-why>  <pre class="cs-pre">
 *   project   <section class="cs-block" data-block="project">
 *   trust     <section class="cs-block" data-block="trust">  <li>
 *   deliver   <section class="cs-block" data-block="deliverables">  <li>
 *   reflect   <section class="cs-block" data-block="reflection"> <li data-check>
 *             + <p class="cs-free" data-free-response>
 *   rubric    <section class="cs-block" data-block="rubric"> <tr data-dimension>
 *
 * ClaudeStudioRender reads these attributes. Renaming one without updating the
 * renderer degrades the card to the HTML fallback — visible, not silent, but a
 * regression all the same. The `claudeStudioFormat.test.ts` suite asserts the
 * contract in both directions.
 */
import { ClaudeStudioWeek, STAGE_LABELS, STAGE_ORDER, StageKey, CLAUDE_LAUNCH } from '../data/claudeStudios/types';

/** HTML-escape text content. */
export function esc(s: unknown): string {
  return String(s ?? '')
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

/** HTML-escape an attribute value (adds quote escaping on top of `esc`). */
export function escAttr(s: unknown): string {
  return esc(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;');
}

const li = (items: string[]) => items.map((x) => `<li>${esc(x)}</li>`).join('');

/**
 * The pinned stylesheet. The generation prompt tells the model to copy this
 * VERBATIM, which is why it is exported rather than inlined — a model can
 * reliably reproduce a fixed block, and the seed and the prompt then agree by
 * construction rather than by discipline.
 *
 * Design: light, portal-consistent, Claude.ai identity carried by the violet
 * accent (#6C5CE7) so it reads as a sibling of — and distinct from — the coral
 * (#D97757) Claude Code spine (Setup Lab, Prompt Lab, Build Artifact(s) Lab).
 */
export const CLAUDE_STUDIO_STYLE = `
*{box-sizing:border-box}
body{margin:0;font-family:'Inter','Segoe UI',system-ui,-apple-system,sans-serif;color:#1a2233;background:#fff;font-size:14.5px;line-height:1.62}
.cs{max-width:780px;margin:0 auto;padding:22px 20px 36px}
.cs h2,.cs h3,.cs h4{margin:0;line-height:1.28;letter-spacing:-.01em;color:#0b2b4a}
.cs p{margin:0 0 10px}
.cs-kick{font-size:10.5px;font-weight:800;letter-spacing:.13em;text-transform:uppercase;color:#6C5CE7;margin:0 0 6px}
.cs-asset{background:#f3f1fe;border:1px solid #ded8fb;border-left:3px solid #6C5CE7;border-radius:0 10px 10px 0;padding:12px 15px;margin:0 0 18px;font-size:13.5px;color:#332a6b}
.cs-asset b{color:#241d52}
.cs-scenario{background:#fbfcfe;border:1px solid #e4e9f1;border-radius:12px;padding:14px 16px;margin:0 0 18px;font-size:13.8px;color:#33415c}
.cs-scenario .cs-role{display:block;margin-top:8px;font-size:12.5px;color:#5b6675}
.cs-h{font-size:12px;font-weight:800;letter-spacing:.09em;text-transform:uppercase;color:#6C5CE7;margin:26px 0 10px;padding-bottom:6px;border-bottom:1px solid #ece9fb}
.cs-obj{margin:0 0 4px;padding-left:19px}
.cs-obj li{margin:5px 0}
.cs-stage{border:1px solid #e4e9f1;border-radius:13px;padding:15px 17px;margin:0 0 12px;background:#fff}
.cs-stage-hd{display:flex;align-items:baseline;gap:10px;flex-wrap:wrap;margin:0 0 8px}
.cs-num{flex:0 0 auto;width:23px;height:23px;border-radius:50%;background:#6C5CE7;color:#fff;font-size:12px;font-weight:800;display:inline-flex;align-items:center;justify-content:center}
.cs-stage-t{font-size:14.5px;font-weight:750;color:#0b2b4a}
.cs-stage-k{font-size:11px;font-weight:700;color:#6C5CE7;text-transform:uppercase;letter-spacing:.05em}
.cs-min{margin-left:auto;font-size:11px;font-weight:700;color:#5b6675;background:#f2f5fa;border:1px solid #e4e9f1;border-radius:20px;padding:2px 9px;white-space:nowrap}
.cs-inst{color:#33415c;font-size:13.8px;margin:0 0 8px}
.cs-steps{margin:0;padding-left:19px;color:#33415c;font-size:13.5px}
.cs-steps li{margin:4px 0}
.cs-prompt{margin:0 0 14px}
.cs-plabel{font-size:11px;font-weight:800;text-transform:uppercase;letter-spacing:.06em;color:#5546c9;margin:0 0 3px}
.cs-why{font-size:12.8px;color:#5b6675;margin:0 0 7px}
.cs-pre{background:#141a2e;border-left:3px solid #6C5CE7;color:#e7eefc;padding:13px 15px;border-radius:9px;overflow:auto;
  font-family:Consolas,Menlo,monospace;font-size:12px;line-height:1.6;white-space:pre-wrap;margin:0}
.cs-block{border:1px solid #e4e9f1;border-radius:13px;padding:15px 17px;margin:0 0 12px;background:#fbfcfe}
.cs-block h4{font-size:13.5px;font-weight:750;margin:0 0 8px}
.cs-block ul,.cs-block ol{margin:0;padding-left:19px;color:#33415c;font-size:13.5px}
.cs-block li{margin:5px 0}
.cs-src{font-size:12.8px;color:#5b6675;margin:8px 0 0}
.cs-trust{background:#fff8f2;border-color:#f3ddc7}
.cs-trust h4{color:#8a4b16}
.cs-trust li{color:#6d4520}
.cs-warn{background:#fdf3f2;border:1px solid #f3ccc7;border-radius:10px;padding:11px 14px;margin:10px 0 0;font-size:12.8px;color:#8c2f26}
.cs-free{background:#fff;border:1px solid #e4e9f1;border-radius:9px;padding:11px 13px;margin:9px 0 0;font-size:13.5px;color:#2b3648;font-style:italic}
.cs-tbl{width:100%;border-collapse:collapse;font-size:12.8px;margin:0}
.cs-tbl th,.cs-tbl td{border:1px solid #e4e9f1;padding:7px 9px;text-align:left;vertical-align:top}
.cs-tbl th{background:#f4f6fb;font-weight:750;color:#0b2b4a;font-size:11.5px;text-transform:uppercase;letter-spacing:.04em}
.cs-tbl td:first-child{font-weight:700;color:#332a6b;white-space:nowrap}
.cs-launch{display:flex;flex-wrap:wrap;gap:9px;margin:0 0 18px}
.cs-launch a{display:inline-flex;align-items:center;gap:7px;font-size:12.8px;font-weight:750;text-decoration:none;
  color:#5546c9;background:#f3f1fe;border:1px solid #ded8fb;border-radius:9px;padding:8px 13px}
.cs-note{font-size:12.5px;color:#5b6675;margin:0 0 18px}
@media(max-width:560px){.cs{padding:18px 15px 30px}.cs-min{margin-left:0}.cs-tbl,.cs-tbl tbody,.cs-tbl tr,.cs-tbl td{display:block;width:100%}.cs-tbl thead{display:none}.cs-tbl td{border-top:0}.cs-tbl tr{margin-bottom:10px;border-top:1px solid #e4e9f1}}
`.trim();

/**
 * Plain-language description of the body structure, handed to the LLM in the
 * generation prompt. Kept next to the renderer so the two cannot drift.
 */
export const CLAUDE_STUDIO_STRUCTURE = [
  'A four-stage studio walkthrough. Do NOT repeat the card title as a heading — the app shows it above.',
  'Order: (1) a career-asset callout, (2) the launch links, (3) the scenario and role, (4) learning objectives,',
  '(5) the FOUR stage sections in order explore → organize → create → prove, (6) the Project setup block,',
  '(7) the copyable prompts, (8) the Artifact requirements, (9) the trust checkpoints, (10) deliverables,',
  '(11) the reflection block, (12) the rubric table.',
  'Every stage MUST carry data-stage, data-title and data-min. Every prompt MUST carry data-prompt, data-label',
  'and data-why, with the prompt text inside a <pre class="cs-pre">. These attributes drive the student renderer.',
].join(' ');

/** The four-stage section for one stage. */
function renderStage(stage: ClaudeStudioWeek['stages'][number], index: number): string {
  return `<section class="cs-stage" data-stage="${escAttr(stage.key)}" data-title="${escAttr(stage.title)}" data-min="${escAttr(stage.minutes)}">
  <div class="cs-stage-hd">
    <span class="cs-num">${index + 1}</span>
    <span class="cs-stage-t">${esc(stage.title)}</span>
    <span class="cs-stage-k">${esc(STAGE_LABELS[stage.key])}</span>
    <span class="cs-min">${esc(stage.minutes)} min</span>
  </div>
  <p class="cs-inst">${esc(stage.instruction)}</p>
  <ol class="cs-steps">${li(stage.steps)}</ol>
</section>`;
}

function renderPrompt(p: ClaudeStudioWeek['prompts'][number]): string {
  return `<div class="cs-prompt" data-prompt="${escAttr(p.kind)}" data-label="${escAttr(p.label)}" data-why="${escAttr(p.why)}">
  <div class="cs-plabel">${esc(p.label)}</div>
  <p class="cs-why">${esc(p.why)}</p>
  <pre class="cs-pre">${esc(p.text)}</pre>
</div>`;
}

function renderRubric(rows: ClaudeStudioWeek['rubric']): string {
  const body = rows.map((r) => `<tr data-dimension="${escAttr(r.dimension)}">
    <td>${esc(r.dimension)}</td><td>${esc(r.strong)}</td><td>${esc(r.developing)}</td>
  </tr>`).join('');
  return `<table class="cs-tbl"><thead><tr><th>Dimension</th><th>Strong work</th><th>Developing</th></tr></thead><tbody>${body}</tbody></table>`;
}

/**
 * Render one studio to self-contained `body_html`.
 *
 * `launch` is injectable so a deployment can retarget the outbound Claude.ai
 * links without a code change (Part 3C: configurable, safe outbound links —
 * Claude.ai is never embedded, and nothing here automates authentication).
 */
export function renderClaudeStudio(
  s: ClaudeStudioWeek,
  launch: { conversation: string; projects: string } = CLAUDE_LAUNCH,
): string {
  const stages = STAGE_ORDER
    .map((key: StageKey) => s.stages.find((st) => st.key === key))
    .filter((st): st is ClaudeStudioWeek['stages'][number] => !!st);

  return `<style>${CLAUDE_STUDIO_STYLE}</style>
<div class="cs" data-claude-studio="1" data-chat-url="${escAttr(launch.conversation)}" data-projects-url="${escAttr(launch.projects)}" data-cert-active="${s.certification_active ? '1' : '0'}" data-career-asset="${escAttr(s.career_asset)}" data-week-theme="${escAttr(s.week_theme)}">

  <div class="cs-kick">Claude Studio &middot; ${esc(s.title)}</div>
  <div class="cs-asset"><b>What you walk away with:</b> ${esc(s.career_asset)}</div>
  <p>${esc(s.intro)}</p>

  <div class="cs-launch">
    <a href="${escAttr(launch.conversation)}" target="_blank" rel="noopener noreferrer">Open Claude &rarr;</a>
    <a href="${escAttr(launch.projects)}" target="_blank" rel="noopener noreferrer">Open Claude Projects &rarr;</a>
  </div>
  <p class="cs-note">These open Claude.ai in a new tab and use your own authorized Claude account. Nothing you type there is read by or sent back to this platform &mdash; you submit only the Artifact link and your own written work.</p>

  <div class="cs-scenario">${esc(s.scenario)}<span class="cs-role"><b>Your role:</b> ${esc(s.role)}</span></div>

  <div class="cs-h">What you'll be able to do</div>
  <ul class="cs-obj">${li(s.objectives)}</ul>

  <div class="cs-h">The four stages &middot; about ${esc(s.estimated_minutes)} minutes</div>
  ${stages.map(renderStage).join('\n  ')}

  <div class="cs-h">Set up your Project</div>
  <section class="cs-block" data-block="project">
    <h4>${esc(s.project.name)}</h4>
    <p class="cs-inst">${esc(s.project.instructions)}</p>
    <p class="cs-src"><b>Add these sources to the Project:</b></p>
    <ul>${li(s.project.sources)}</ul>
  </section>

  <div class="cs-h">Prompts to start from</div>
  ${s.prompts.map(renderPrompt).join('\n  ')}

  <div class="cs-h">What the Artifact must contain</div>
  <section class="cs-block" data-block="artifact">
    <h4>${esc(s.artifact.type)}</h4>
    <ul>${li(s.artifact.requirements)}</ul>
  </section>

  <div class="cs-h">Trust checkpoints</div>
  <section class="cs-block cs-trust" data-block="trust">
    <h4>Judgment you do not delegate</h4>
    <ul>${li(s.trust_checkpoints)}</ul>
    <div class="cs-warn"><b>These do not count as finishing:</b><ul>${li(s.prohibited_shortcuts)}</ul></div>
  </section>

  <div class="cs-h">What you submit</div>
  <section class="cs-block" data-block="deliverables">
    <ul>${li(s.deliverables)}</ul>
  </section>

  <div class="cs-h">Reflection</div>
  <section class="cs-block" data-block="reflection">
    <h4>Confirm before you submit</h4>
    <ul>${s.reflection.checks.map((c) => `<li data-check="1">${esc(c)}</li>`).join('')}</ul>
    <p class="cs-free" data-free-response="1">${esc(s.reflection.free_response)}</p>
  </section>

  <div class="cs-h">How this is assessed</div>
  <section class="cs-block" data-block="rubric">
    ${renderRubric(s.rubric)}
  </section>

</div>`;
}

/** One-sentence card summary, used for the card's `summary` field. */
export function studioSummary(s: ClaudeStudioWeek): string {
  return `${s.career_asset}, built in Claude across four stages: explore, organize a Project, create an Artifact, then prove and publish.`;
}

/** The card title format: "Claude Studio — {studio title}". */
export function studioCardTitle(s: ClaudeStudioWeek): string {
  return `Claude Studio — ${s.title}`;
}
