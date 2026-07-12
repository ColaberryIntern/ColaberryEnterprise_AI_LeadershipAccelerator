import React from 'react';
import VideoEmbed from '../../../../components/timeline/VideoEmbed';
import { parseVideoUrl } from '../../../../utils/videoEmbed';

/**
 * StudentPreview — renders the REAL student experience for a component, by
 * render_band, instead of a generic text article. This is what makes the Studio
 * preview match the classroom: a Video shows the actual in-app player + notes; a
 * Prompt Lab shows the prompt workspace + evaluation; a Reflection shows the
 * reflection flow; a Mock Interview shows the interview flow. Interactive parts
 * are shown but inert in the preview (labelled "live for students").
 *
 * `parts` are the component's capabilities (Phase 2 toggles) — sections only
 * appear when their capability is enabled (or when parts is undefined = show all).
 */

const VIDEO = ['media', 'live_class', 'video_feedback'];
const REFLECT = ['reflection', 'survey', 'question'];
const QUIZ = ['quiz', 'exam'];

interface Experience {
  title?: string; summary?: string; body_html?: string;
  questions?: string[]; reflection?: string;
}

interface Props {
  band: string;
  label: string;
  experience?: Experience | null;
  videoUrl?: string;
  parts?: string[] | null; // capability ids; undefined => show every section
}

/** body_html in a SANDBOXED iframe — sandbox="" runs no scripts, so LLM markup is inert. */
function lessonDoc(bodyHtml: string): string {
  return `<!doctype html><meta name=viewport content="width=device-width,initial-scale=1"><style>
    body{font-family:Roboto,system-ui,sans-serif;margin:0;padding:2px;color:#1A1A1A;font-size:13.5px;line-height:1.6}
    h1,h2,h3{line-height:1.3;margin:12px 0 6px} h1{font-size:17px} h2{font-size:15px} h3{font-size:13.5px}
    p{margin:0 0 9px} ul,ol{padding-left:20px;margin:0 0 9px} li{margin-bottom:3px} a{color:#367895} img{max-width:100%}
    pre,code{font-family:ui-monospace,Menlo,Consolas,monospace;font-size:12px;background:#F2F2F2;border-radius:6px}
    pre{padding:9px;overflow:auto} code{padding:1px 4px}
  </style>${bodyHtml}`;
}

const Notes: React.FC<{ exp?: Experience | null }> = ({ exp }) => (
  <>
    {exp?.summary && <p className="sp-body">{exp.summary}</p>}
    {exp?.body_html && <iframe className="sp-frame" title="Lesson" sandbox="" srcDoc={lessonDoc(exp.body_html)} />}
    {Array.isArray(exp?.questions) && exp!.questions!.length > 0 && (
      <><div className="sp-sub">Questions to consider</div>
        <ul className="sp-list">{exp!.questions!.map((q, i) => <li key={i}>{q}</li>)}</ul></>
    )}
  </>
);

const StudentPreview: React.FC<Props> = ({ band, label, experience, videoUrl, parts }) => {
  const has = (cap: string) => !parts || parts.includes(cap);
  const exp = experience || null;
  const title = exp?.title || label;
  const source = videoUrl ? parseVideoUrl(videoUrl) : null;

  let body: React.ReactNode;

  if (VIDEO.includes(band)) {
    body = (
      <>
        <div className="sp-title">{title}</div>
        <div className="sp-player">
          {source ? <VideoEmbed source={source} title={title} /> : <div className="sp-novideo">▶ Video player — add a link in the inputs above to preview playback</div>}
        </div>
        {has('transcript') && <div className="sp-chip">Transcript</div>}
        {has('reflection') || !parts ? <Notes exp={exp} /> : null}
        <div className="sp-interactive">✦ Make it interactive <span className="sp-live">live for students — AI summary · key moments · quiz</span></div>
      </>
    );
  } else if (band === 'promptlab') {
    body = (
      <>
        <div className="sp-title">{title}</div>
        {exp?.summary && <p className="sp-body">{exp.summary}</p>}
        <div className="sp-sub">Your prompt</div>
        <div className="sp-fauxinput mono">Write your prompt here…</div>
        <div className="sp-row"><span className="sp-fauxbtn">▶ Run &amp; evaluate</span><span className="sp-live">live for students</span></div>
        {has('scoring') || !parts ? (
          <div className="sp-evalcard">
            <div className="sp-scores"><div><b>—</b><span>craft</span></div><div><b>—</b><span>architect</span></div></div>
            <div className="sp-sub">Strengths · Gaps · Suggestions</div>
            <div className="sp-body sp-muted">The AI scores each attempt and coaches the student toward a stronger prompt.</div>
          </div>
        ) : null}
      </>
    );
  } else if (REFLECT.includes(band)) {
    body = (
      <>
        <div className="sp-title">{title}</div>
        {exp?.summary && <p className="sp-body">{exp.summary}</p>}
        <div className="sp-sub">Reflect</div>
        <ul className="sp-list">{(exp?.questions && exp.questions.length ? exp.questions : ['What surprised you?', 'What would you build with this?', 'How would you explain it to a teammate?']).map((q, i) => <li key={i}>{q}</li>)}</ul>
        <div className="sp-fauxtext">Write your reflection…</div>
      </>
    );
  } else if (band === 'interview') {
    body = (
      <>
        <div className="sp-title">{title}</div>
        <div className="sp-sub">The scenario</div>
        <p className="sp-body">{exp?.summary || 'The AI interviewer sets a role and scenario, then asks the student questions one at a time.'}</p>
        <div className="sp-sub">Interview</div>
        <div className="sp-qa"><span className="sp-qadot" />{(exp?.questions && exp.questions[0]) || 'Tell me about a system you would design for this problem…'}</div>
        <div className="sp-fauxtext">Type or record your answer…</div>
        <div className="sp-row"><span className="sp-fauxbtn">Answer →</span><span className="sp-live">live for students — the AI probes follow-ups &amp; scores you</span></div>
      </>
    );
  } else if (QUIZ.includes(band)) {
    body = (
      <>
        <div className="sp-title">{title}</div>
        {exp?.summary && <p className="sp-body">{exp.summary}</p>}
        <div className="sp-sub">Knowledge check</div>
        {(exp?.questions && exp.questions.length ? exp.questions : ['Which statement is correct?']).map((q, i) => (
          <div key={i} className="sp-quizq"><div style={{ fontWeight: 600, fontSize: 13 }}>{q}</div>
            <div className="sp-opt">○ Option A</div><div className="sp-opt">○ Option B</div><div className="sp-opt">○ Option C</div></div>
        ))}
      </>
    );
  } else {
    // reading / overview / announcement / deepdive / generic
    body = (
      <>
        <div className="sp-title">{title}</div>
        <Notes exp={exp} />
      </>
    );
  }

  return (
    <div className="sp-card">
      {body}
      <div className="sp-foot"><span className="sp-cta">Mark complete</span>{has('discussion') && <span className="sp-chip">💬 Discussion</span>}{has('ai_chat') && <span className="sp-chip">AI Mentor</span>}</div>
    </div>
  );
};

export default StudentPreview;
