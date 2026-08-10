/**
 * selfStudyWeek1 — the hand-authored, LOCKED Week 1 Self Study reading
 * ("Claude Code Foundations + Workspace").
 *
 * Authored in response to Ram's self-study feedback (Basecamp todos 10174075841 /
 * 10174137603, 2026-08-06): the reading was written for someone who had already sat
 * the live class, so it explained the four setup steps as *labels on a diagram* with
 * no instructions behind them, and never said how to install anything. Parts 0 and 2
 * below are the fix — Part 0 installs Claude Code + VS Code from zero, Part 2 turns
 * the four-step diagram into four real steps with commands and expected output.
 * Parts 1, 3, 4 and 5 are unchanged from the previously approved copy.
 *
 * Authoring constraints (the reader engine is `readerDoc` in CardDetailBody.tsx):
 *   • Every <section id data-nav> becomes a nav tab AND a read-gate stop — the student
 *     must dwell on each before Mark Complete appears. Adding a section raises the bar.
 *   • Diagrams/illustrations are declared by TYPE + labels (data-diagram/data-items,
 *     data-illus); the engine draws the SVG. Never hand-write SVG geometry here.
 *   • Use <ol> for steps. A bare <ul> renders WITHOUT bullets (.ss ul is list-style:none,
 *     reserved for .cardgrid) so it reads as broken — use <ol>, .cardgrid or .prereq.
 *   • <a href> needs target=_blank + rel=noopener; the reader iframe carries
 *     READER_SANDBOX (allow-popups + escape) or the click is silently swallowed.
 *   • Commands go in <pre class="cmd"> (dark, monospace, horizontally scrollable).
 *
 * Applied by scripts/seedSelfStudyWeek1.ts, which locks the card so
 * `ensureFreshContent` never regenerates over it.
 */
export const SELF_STUDY_WEEK1 = {
  title: 'Self Study - Claude Code Foundations + Workspace',
  summary:
    'Start from zero: install Claude Code, wire it into VS Code, and run your first session - then how it actually works. The agentic loop, the Explore-Plan-Code-Commit rhythm, CLAUDE.md, and managing context. Optional, self-paced, not tested.',
  body_html: `
<section id="intro" data-nav="Overview">
<p class="lead">Claude Code turns AI from a chat window into a hands-on collaborator that can read your files, run steps, and help you build - inside your own workspace.</p>
<figure class="illus" data-illus="terminal"><figcaption>Claude Code works alongside you, where the work actually happens.</figcaption></figure>
<p>Read at your own pace; nothing here is graded or timed. By the end you will recognize the core ideas that make an AI assistant genuinely useful for real work.</p>
<p>Never used Claude Code before? Start with <b>Part 0</b> - it sets everything up from scratch and assumes you have not attended a class.</p>
</section>
<section id="p0" data-nav="Before You Start">
<h2>Part 0 - Before You Start</h2>
<p class="lead">If you have never installed Claude Code, start here. This part assumes no prior setup and no prior class - you will go from an empty machine to a working assistant.</p>
<p>Everything after this part assumes Claude Code is installed and answering you. Setting it up takes about ten minutes, and you only ever do it once.</p>
<div class="prereq"><div><b>A computer you can install software on</b>Windows, macOS, or Linux. You will use a terminal - the app called Terminal on macOS and Linux, or PowerShell on Windows.</div></div>
<div class="prereq"><div><b>Node.js 18 or newer</b>Claude Code installs through Node's package manager. Get the LTS build from <a href="https://nodejs.org" target="_blank" rel="noopener noreferrer">nodejs.org</a> and run the installer.</div></div>
<div class="prereq"><div><b>Visual Studio Code (free)</b>Your editor, from <a href="https://code.visualstudio.com" target="_blank" rel="noopener noreferrer">code.visualstudio.com</a>. Claude Code runs fine in a plain terminal, but the rest of this program uses VS Code.</div></div>
<div class="prereq"><div><b>A Claude account</b>The same login you use for Claude.ai. The first run opens your browser to sign in.</div></div>
<h3>Install Claude Code</h3>
<ol>
<li><b>Install Node.js</b> using the link above, then close your terminal and open a new one so it picks up the change. Check it worked:
<pre class="cmd">node --version</pre>
<p class="why">You should see a version number of v18 or higher. If you get "command not found", Node did not install - run the installer again.</p></li>
<li><b>Install Claude Code:</b>
<pre class="cmd">npm install -g @anthropic-ai/claude-code</pre>
<p class="why">This downloads it once and makes the claude command available everywhere on your machine.</p></li>
<li><b>Confirm it landed:</b>
<pre class="cmd">claude --version</pre></li>
<li><b>Start it and sign in.</b> The first run opens your browser to authorize your Claude account:
<pre class="cmd">claude</pre>
<p class="why">Once you are signed in, you are done - it will remember you next time.</p></li>
</ol>
<h3>Using Claude Code inside VS Code</h3>
<p>There is no plugin to configure. VS Code holds your files, its built-in terminal runs Claude Code, and you watch every change land live in the editor.</p>
<ol>
<li>Open VS Code.</li>
<li>Open your project folder: <b>File &gt; Open Folder</b>, then pick the folder you want to work in.</li>
<li>Open the built-in terminal: <b>View &gt; Terminal</b>. It opens already pointed at that folder.</li>
<li>Type <code>claude</code> and press Enter.</li>
</ol>
<p>Claude Code now runs beside your files. When it edits one, the file updates in the editor in front of you.</p>
<div class="warn"><p><b>Prefer to watch someone do it?</b> Anthropic's free <a href="https://anthropic.skilljar.com/claude-code-101/469790" target="_blank" rel="noopener noreferrer">Claude Code 101</a> course covers installation and first use on video, and this week's Learn section has a Claude Code 101 card that points at the same course. The official written guide lives in the <a href="https://docs.claude.com/en/docs/claude-code/overview" target="_blank" rel="noopener noreferrer">Claude Code documentation</a>.</p></div>
<h3>Video walkthroughs</h3>
<p>If you would rather watch someone set this up before you try it, start with the one from Anthropic. Each link below names the channel it comes from, so you always know whether you are watching the makers of the tool or a community teacher. The written steps above remain the source of truth if anything differs.</p>
<div class="prereq"><div><b>From Anthropic</b><a href="https://www.youtube.com/watch?v=6eBSHbLKuN0" target="_blank" rel="noopener noreferrer">Mastering Claude Code in 30 minutes</a> - the makers' own walkthrough, from installing it to working in a real project.</div></div>
<div class="prereq"><div><b>Community walkthroughs</b>Anthropic has no dedicated install or VS Code video, so these are from independent teachers: <a href="https://www.youtube.com/watch?v=ntDIxaeo3Wg" target="_blank" rel="noopener noreferrer">Tech With Tim's full beginner tutorial</a>, <a href="https://www.youtube.com/watch?v=SUysp3sJHbA" target="_blank" rel="noopener noreferrer">Net Ninja's intro and setup</a>, and for the editor, <a href="https://www.youtube.com/watch?v=ph5DRCX_g6s" target="_blank" rel="noopener noreferrer">Nic Conley's Claude Code in VS Code in 3 minutes</a>.</div></div>
</section>
<section id="p1" data-nav="Agentic Loop">
<h2>Part 1 - Understanding the Agentic Loop</h2>
<p class="lead">An "agentic" tool does not just answer - it works in a loop: take in context, use tools to act, and stay within the permissions you set.</p>
<p>That loop is what lets Claude Code do more than reply. It can look at a file, make a change, check the result, and adjust - repeating until the task is done.</p>
<figure class="figure" data-diagram="cycle" data-items="Context|Tools|Permissions"><figcaption>The three parts of the loop that repeat as the assistant works.</figcaption></figure>
<div class="cardgrid">
<div class="term" data-icon="bulb"><h3>Agent</h3><p class="why">An AI that can take actions toward a goal, not just produce text. It decides the next step and carries it out.</p></div>
<div class="term" data-icon="check"><h3>Permissions</h3><p class="why">The guardrails that decide what the assistant may do on its own versus what needs your OK. They keep you in control.</p></div>
</div>
</section>
<section id="p2" data-nav="Setup">
<h2>Part 2 - Setting Up Your Workspace</h2>
<p class="lead">Getting started is a short, repeatable setup: open your project, point the assistant at it, and confirm it can see your files.</p>
<figure class="illus" data-illus="automation"><figcaption>A little setup up front makes every session after it smoother.</figcaption></figure>
<figure class="figure" data-diagram="steps" data-items="Open your project|Start the assistant|Confirm it sees your files|Ask for a small first task"><figcaption>A simple on-ramp for your very first session.</figcaption></figure>
<p>Here are those four steps in full, the first time you run them.</p>
<ol>
<li><b>Open your project.</b> A "project" is just a folder. Make one for this course and move into it:
<pre class="cmd">mkdir my-first-project
cd my-first-project</pre>
<p class="why">In VS Code, the same thing is File &gt; Open Folder, then View &gt; Terminal.</p></li>
<li><b>Start the assistant.</b> From inside that folder, run:
<pre class="cmd">claude</pre>
<p class="why">The prompt changes to Claude Code's own. Whichever folder you were standing in is the folder it can now see - this is the single most common thing people get wrong, so check you are in the right one before you start.</p></li>
<li><b>Confirm it sees your files.</b> Ask it in plain English - no special syntax:
<pre class="cmd">What files are in this folder?</pre>
<p class="why">A brand-new folder is empty and it will say so. That is a correct answer. The point is that it answered about YOUR folder, which proves it is looking in the right place.</p></li>
<li><b>Ask for a small first task.</b> Give it something real but tiny:
<pre class="cmd">Create a README.md that explains what this project is for.</pre>
<p class="why">It will show you what it intends to write and ask for your OK before touching anything - that is the permissions step from Part 1, in practice. Approve it, then open the file in VS Code. You just made your first change through an agent.</p></li>
</ol>
<div class="warn"><p><b>If "claude" is not recognized.</b> Either the install did not finish or your terminal is stale. Close it, open a new one, and run <code>claude --version</code> again. Still nothing? Re-run the install step in Part 0.</p></div>
</section>
<section id="p3" data-nav="E-P-C-C">
<h2>Part 3 - Explore, Plan, Code, Commit</h2>
<p class="lead">The most reliable way to work is a steady rhythm: explore the problem, plan the change, make it, then save it.</p>
<p>Skipping straight to "make the change" is where things go wrong. A moment of exploring and planning first leads to smaller, safer steps you can actually trust.</p>
<figure class="figure" data-diagram="flow" data-items="Explore|Plan|Code|Commit"><figcaption>A dependable loop for getting real work done well.</figcaption></figure>
<div class="stats"><div class="stat"><b>4</b><span>steps, repeated</span></div><div class="stat"><b>1</b><span>small change at a time</span></div></div>
<h3>Watch the loop being run</h3>
<p>Seeing someone work this rhythm on a real change makes it click faster than reading about it. Both of these come straight from the people who build Claude Code.</p>
<div class="prereq"><div><b>The workflow itself</b><a href="https://www.youtube.com/watch?v=xJQuF02NAK8" target="_blank" rel="noopener noreferrer">The Explore, Plan, Code, Commit workflow in Claude Code</a> - the same lesson the Claude Code 101 card links, on Claude's own channel.</div></div>
<div class="prereq"><div><b>A longer worked session</b><a href="https://www.youtube.com/watch?v=gv0WHhKelSE" target="_blank" rel="noopener noreferrer">Claude Code best practices</a> from Anthropic's Code w/ Claude talk, for how the loop holds up on bigger work.</div></div>
<div class="warn"><p><b>Then go and do it.</b> Watching is not the same as running it. The <b>Workshop - Explore, Plan, Code, Commit</b> card in this week's practice section walks you through the whole loop on your own project, including the parts these videos raise but do not demonstrate: writing success criteria, giving Claude Code the right tools, building a real test suite, and setting up a code-review agent.</p></div>
</section>
<section id="p4" data-nav="CLAUDE.md">
<h2>Part 4 - Establishing CLAUDE.md</h2>
<p class="lead">A CLAUDE.md file is a plain-language note that tells the assistant how your project works - so it follows your conventions without being reminded each time.</p>
<figure class="illus" data-illus="documents"><figcaption>Written-down context the assistant reads before it acts.</figcaption></figure>
<div class="cardgrid">
<div class="term" data-icon="book"><h3>CLAUDE.md</h3><p class="why">Project notes the assistant reads automatically: your standards, do's and don'ts, and how things are organized.</p></div>
<div class="term" data-icon="flag"><h3>Convention</h3><p class="why">An agreed way of doing something on your team. Writing it down once keeps the assistant's work consistent with yours.</p></div>
</div>
<div class="warn"><p><b>Caution.</b> Keep this note focused. Too much text buries the important rules and wastes the assistant's limited working memory.</p></div>
</section>
<section id="p5" data-nav="Context">
<h2>Part 5 - Managing the Context Window</h2>
<p class="lead">The assistant can only hold so much at once. Managing that working memory keeps its help sharp instead of scattered.</p>
<p>Long sessions fill up. Clearing or summarizing when you switch tasks - and sharing only the files that matter - keeps responses fast and on point.</p>
<div class="cardgrid">
<div class="term" data-icon="window"><h3>Context window</h3><p class="why">The assistant's working memory. Once it is full, older details drop off, so what you keep in it matters.</p></div>
<div class="term" data-icon="scissors"><h3>Compacting</h3><p class="why">Summarizing the session so far to free up room while keeping the important thread - resetting clutter without losing the plot.</p></div>
</div>
<figure class="illus" data-illus="ai-network"><figcaption>Give the assistant the right context, and it gives you better help.</figcaption></figure>
</section>`.trim(),
};

export default SELF_STUDY_WEEK1;
