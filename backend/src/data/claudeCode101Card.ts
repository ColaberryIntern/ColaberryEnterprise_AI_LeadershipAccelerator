/**
 * claudeCode101Card — corrected content for the Week 1 "Claude Code 101" card
 * (curriculum type `anthropic_skills_jar`).
 *
 * Why: the card is titled "Claude Code 101" and its `course` link is correct, but its
 * authored body described *Claude the chat assistant* ("leverage Claude in your daily
 * work", "core features of Claude") — a different product from Claude Code, and the
 * first thing a self-study learner reads when they open the card. Ram flagged the
 * surrounding gap in Basecamp todo 10174137603. Only the body copy is wrong here, so
 * only the body copy changes; `course.url` and `course.name` were already right.
 *
 * Rendering note: this body goes through `lessonDoc()` in an iframe sandboxed
 * `allow-same-origin` with NO `allow-popups`, so an <a href> here would be silently
 * swallowed. Deliberately link-free — the SkillsJarPanel renders its own real
 * "Open in SkillsJar" button outside the iframe, which is what actually opens the course.
 */
export const CLAUDE_CODE_101_CARD = {
  /** Merged into the card's top-level metadata (SkillsJarPanel reads `card.course`). */
  course: {
    name: 'Claude Code 101',
    url: 'https://anthropic.skilljar.com/claude-code-101',
    sections: 'Installing Claude Code, running your first session, working with files in your own project, and the explore-plan-code-commit workflow.',
  },
  content: {
    title: 'Claude Code 101',
    summary:
      'Anthropic\'s own free course on Claude Code - the terminal tool you will use all program, not the Claude chat assistant. Take it alongside this week\'s Self Study reading; between them you should be installed, signed in, and running your first session.',
    body_html: `
<h2>What this course is</h2>
<p>Claude Code 101 is Anthropic's free introduction to <strong>Claude Code</strong> - the tool that runs in your terminal, reads the files in your project, and makes changes with your approval. That is a different thing from the Claude chat assistant you may have used in a browser, and it is the one this program is built around.</p>
<p>It is taught on Anthropic's SkillsJar platform. Use the <strong>Open in SkillsJar</strong> button on this card to take it, then come back and upload your certificate to mark this complete.</p>

<h2>Why it is worth your hour</h2>
<p>The course covers the same ground as this week's Self Study reading, but on video and from the people who built the tool. If you learn better by watching someone do a thing before you try it, take this first and read second. If you would rather read and try, do the reverse. Either order works.</p>
<ul>
  <li>Getting Claude Code installed and signed in on your own machine</li>
  <li>Running your first session and pointing it at a real folder</li>
  <li>How it reads, proposes, and applies changes - and where you approve them</li>
  <li>The explore, plan, code, commit rhythm you will use every week from here</li>
</ul>

<h2>How it fits this week</h2>
<p>Treat this as the companion to Part 0 of your Self Study reading, which walks through installation in writing and adds the VS Code setup. Once you can run <strong>claude</strong> in your own project folder and get an answer about your own files, you are ready for the rest of Week 1.</p>
<p>One honest note: Anthropic's material is written for people who already write software for a living, so it moves quickly and assumes vocabulary. The Workshop card in this week's practice section slows the same loop down and walks you through it step by step, including the parts the course raises but does not demonstrate.</p>`.trim(),
    questions: [
      'What can Claude Code do in your project that a browser chat window cannot?',
      'At which points does Claude Code ask for your approval before it changes anything?',
      'What are the four steps of the explore, plan, code, commit loop, and why does skipping the first two cause problems?',
    ],
    reflection:
      'Think of one task you do by hand today that involves reading or changing files. What would it take to hand the first step of it to Claude Code?',
  },
};

export default CLAUDE_CODE_101_CARD;
