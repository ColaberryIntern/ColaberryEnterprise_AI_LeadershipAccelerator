import React, { useState } from 'react';
import { copyText } from '../../../utils/clipboard';
import { troubleshootingPrompt } from './troubleshootingPrompt';

/**
 * "If you get stuck": two doors, named by the KIND OF PROBLEM rather than by the tool, because a student who knew which tool to
 * pick was never stuck in the first place. Rendered even on a blocked story: being blocked is one of the things people need to
 * ask about. Lifted out of ProjectWorkspacePage unchanged when the page passed the 500-line ceiling (Campus C19).
 */
export default function WorkspaceStuckHelp({ taskTitle }: { taskTitle: string }): React.ReactElement {
  const [helpCopied, setHelpCopied] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  // The troubleshooting prompt names the open story so the student does not have
  // to explain which piece of work they are on.
  const helpPrompt = troubleshootingPrompt(taskTitle);
  const copyTroubleshooting = () => {
    // `copyText`, not `navigator.clipboard` directly: the latter is undefined on
    // a plain-http origin and would no-op silently, which for a stuck student
    // reads as one more thing that does not work.
    copyText(helpPrompt).catch(() => { /* the prompt is on screen to select by hand */ });
    setHelpCopied(true);
    window.setTimeout(() => setHelpCopied(false), 1600);
  };

  return (
    <section className="rt-step" aria-labelledby="rt-help-h">
      <div className="rt-step-h">
        <span className="rt-step-t" id="rt-help-h">If you get stuck</span>
      </div>

      <p className="rt-help-lead">
        You can ask <strong>either Cory or Claude</strong>. When the trouble is inside the
        project you are building, <strong>Claude Code</strong> is the more direct route,
        because it can read and change the code on your computer. <strong>Cory</strong> can
        see this page, your story, your steps, and what the portal has recorded.
      </p>

      <div className="rt-doors">
        <div className="rt-door">
          <div className="rt-door-h">Something on this page looks wrong</div>
          <p className="rt-door-p">Ask Cory, in the chat box on this page.</p>
          <ul className="rt-door-eg">
            <li>The page says 0 of 3 finished, but you think you are done.</li>
            <li>A step is locked and you do not know why.</li>
            <li>You cannot work out what the story is asking you for.</li>
            <li>A button does not seem to do anything.</li>
          </ul>
          <p className="rt-door-p">
            You do not have to type the problem out. Take a screenshot and paste it straight
            into Cory&apos;s box, or drag the image onto it, and Cory will read it.
          </p>
        </div>

        <div className="rt-door">
          <div className="rt-door-h">Your own code is not working</div>
          <p className="rt-door-p">Ask Claude Code, in the terminal where you build.</p>
          <ul className="rt-door-eg">
            <li>You get an error when you run your project.</li>
            <li>A test will not pass.</li>
            <li>Something you wrote does not do what you expected.</li>
          </ul>
          <p className="rt-door-p">
            Copy the prompt below, paste it into Claude Code, and fill in the two lines it
            asks you for.
          </p>
          {/* Collapsed on arrival for the same reason the build prompt is:
              at half screen a tall slab of text IS the column. Copy stays
              visible, so collapsing costs the student nothing. */}
          {helpOpen && (
            <pre id="rt-troubleshoot-prompt" className="rt-in mono rt-troubleshoot">
              {helpPrompt}
            </pre>
          )}
          <div className="rt-door-acts">
            <button className={`rt-btn${helpCopied ? ' pri' : ''}`} onClick={copyTroubleshooting}>
              {helpCopied ? 'Copied' : 'Copy the troubleshooting prompt'}
            </button>
            <button
              className="rt-btn"
              onClick={() => setHelpOpen((o) => !o)}
              aria-expanded={helpOpen}
              aria-controls="rt-troubleshoot-prompt"
            >
              {helpOpen ? 'Hide the prompt' : 'Show the prompt'}
            </button>
          </div>
        </div>
      </div>

      {/* The caveat, kept deliberately as a short note rather than a warning.
          It has to point a portal question at Cory without reading as a
          reason to avoid Claude Code, which is what the previous wording
          did — reviewed and approved by Swati Raman. */}
      <p className="rt-door-warn">
        One note: Claude Code cannot see the portal, so if your question is about what this
        page is showing you, ask Cory instead.
      </p>
    </section>
  );
}
