/**
 * Delivery modes — the "parameters that run different types of responses"
 * (UI/UX, Visual, Co-pilot, …) offered inside the project workspace.
 *
 * Ported from the advisor app's operator personas (execution/products/ops/
 * personas.py) and re-pointed at the student build context: the learner is
 * building a task in Claude Code, working in their own project repo — NOT in
 * Basecamp. Each mode contributes a "## How I want you to work" block that is
 * appended to the task prompt, so the same task can be driven as a paced
 * co-pilot, a terse answer, a visual decision sheet, a UI/UX spec, and so on.
 *
 * Pure data + tiny helpers. The selected mode is saved to localStorage so it
 * applies to every prompt the student copies, on every build.
 */

export interface DeliveryMode {
  id: string;
  label: string;
  emoji: string;
  /** one-line description shown in the selector */
  blurb: string;
  /** the "## How I want you to work" instruction block injected into the prompt */
  workingBlock: string;
}

export const DELIVERY_MODES: DeliveryMode[] = [
  {
    id: 'copilot',
    label: 'Co-pilot (paced)',
    emoji: '🧭',
    blurb: 'Step by step, confirms before each move. When you want control.',
    workingBlock:
      '## How I want you to work\n' +
      '1. Confirm you understand the task in one line.\n' +
      '2. Do step one for real (write the code / make the change), don\'t just narrate.\n' +
      '3. After each step, pause and ask if I want to continue or adjust.\n' +
      '4. Read what\'s already in my repo before writing new code; reuse over rebuild.\n' +
      '5. If the acceptance can\'t be met, stop and tell me what you found.',
  },
  {
    id: 'answer',
    label: 'Just the answer',
    emoji: '⚡',
    blurb: 'BLUF, terse, decision first. When you\'re short on time.',
    workingBlock:
      '## How I want you to work\n' +
      '1. Lead with the deliverable in the first 3 lines. No preamble.\n' +
      '2. Bullets over paragraphs; put skippable detail below a `---` divider.\n' +
      '3. Do the work; don\'t ask me to confirm each step.\n' +
      '4. Batch every question for me into ONE list at the end.\n' +
      '5. If a stop condition triggers, say so in one line and stop.',
  },
  {
    id: 'visual',
    label: 'Visual-first',
    emoji: '📊',
    blurb: 'A clean decision sheet opens in your browser — review, adjust, paste back. Dyslexia-friendly.',
    workingBlock:
      '## How I want you to work\n' +
      'I think visually. Before writing code, build me ONE self-contained, professional HTML ' +
      'decision sheet (inline CSS+JS, Mermaid CDN allowed for a flow) and open it in my browser. ' +
      'I review it, adjust what\'s wrong, then paste the generated prompt back to you to build.\n' +
      '1. LOOK — clean and executive, not a kids\' app: light background, white cards, thin borders, ' +
      'navy headings, ONE restrained accent color, generous spacing, large readable text.\n' +
      '2. SUMMARY FIRST — the task title, a compact facts row, then **What this is** and ' +
      '**What you need to do** in plain English. A small Mermaid flow of where this task sits is optional.\n' +
      '3. DECISIONS — surface only choices that change the outcome; decide the rest yourself and list ' +
      'them under one "Assumed defaults" line. Turn each real question into a gadget (toggle / radio / ' +
      'text box), pre-select your recommendation, and always include an "Other" text box.\n' +
      '4. ROUND-TRIP — put a "Copy build prompt" button at top and bottom with a live preview. On click ' +
      'it reads every control and assembles ONE ready-to-paste prompt that restates the task and my choices.',
  },
  {
    id: 'explain',
    label: 'Explain it to me',
    emoji: '🎓',
    blurb: 'Full reasoning, trade-offs, the why. When you want depth.',
    workingBlock:
      '## How I want you to work\n' +
      '1. Explain your reasoning, not just the conclusion — the why behind each choice.\n' +
      '2. Show the trade-offs you weighed and what you ruled out, and why.\n' +
      '3. Define any term or acronym the first time you use it; a short analogy is welcome.\n' +
      '4. Thoroughness over brevity — walk me through it as if teaching.\n' +
      '5. If a stop condition triggers, explain what tripped it and what you\'d need to proceed.',
  },
  {
    id: 'checklist',
    label: 'Checklist doer',
    emoji: '✅',
    blurb: 'Numbered actions plus copy-paste-ready commands. Minimal prose.',
    workingBlock:
      '## How I want you to work\n' +
      '1. Give me a numbered checklist of concrete actions, each one I can check off.\n' +
      '2. Include exact, copy-paste-ready commands, file paths, and code. No "figure out X".\n' +
      '3. Minimal explanation — just what to do, in order.\n' +
      '4. Tag anything that needs my decision with `[DECISION]`.\n' +
      '5. If a stop condition triggers, add a `[STOP]` line at that point.',
  },
  {
    id: 'plain',
    label: 'Plain & friendly',
    emoji: '💬',
    blurb: 'No jargon, just a normal conversation — I handle the tech. For non-coders who want to vibe and build.',
    workingBlock:
      '## How I want you to work\n' +
      'I\'m not technical and want this to feel like a friendly conversation, not a coding session.\n' +
      '1. Plain language only — no jargon, file paths, or code unless I ask. Talk about what we\'re ' +
      'making and why it matters to me, not how it works under the hood.\n' +
      '2. You handle the technical parts — do the building, setup, and saving yourself, and just tell ' +
      'me when it\'s done. Don\'t ask me to run commands.\n' +
      '3. Keep it warm and encouraging; celebrate the small wins.\n' +
      '4. When you truly need me to decide, ask one plain question about the outcome and recommend an ' +
      'option I can say yes to.\n' +
      '5. Show progress in small, plain-English steps: what you did, what it means, what\'s next.',
  },
  {
    id: 'social',
    label: 'Social Media',
    emoji: '📣',
    blurb: 'On-brand posts, hooks, hashtags & a calendar. Drafts only — you approve before anything goes out.',
    workingBlock:
      '## How I want you to work\n' +
      'Deliver this as a ready-to-use social content package — DRAFT ONLY: never post or schedule, and ' +
      'never invent facts, metrics, or testimonials that aren\'t in the source.\n' +
      '1. Lead with a one-line brief: audience, channel(s), and the single goal.\n' +
      '2. Give me per-channel post copy (LinkedIn, X, Instagram), each with a scroll-stopping hook, ' +
      'body, a clear CTA, and a tight hashtag set. Offer 2-3 caption directions for the main post.\n' +
      '3. Keep the voice on-brand and plain; justify each choice in one line. Flag anything you can\'t ' +
      'source as `[NEEDS APPROVAL]`.\n' +
      '4. Add a simple draft posting calendar (days/times) I can adjust, and alt text for image ideas.',
  },
  {
    id: 'design',
    label: 'UI/UX Designer',
    emoji: '🎨',
    blurb: 'Screen flows, wireframe specs, components & accessibility notes. Design thinking, not code.',
    workingBlock:
      '## How I want you to work\n' +
      'Deliver this as a UI/UX design spec, not prose or finished code — design thinking I can hand to ' +
      'a builder, not pixels you claim to render.\n' +
      '1. Start with one line on who the user is and the single job they\'re trying to do.\n' +
      '2. Give me the structure: a screen inventory (each screen + its purpose), then the user flow from ' +
      'entry to done. A small Mermaid flow diagram is welcome.\n' +
      '3. For each key screen, write a wireframe description: what\'s on it top to bottom, the primary ' +
      'action, and the empty / loading / error states.\n' +
      '4. List reusable components (buttons, cards, inputs, nav) with their interaction notes.\n' +
      '5. Include an accessibility checklist: contrast, focus order, touch-target size, labels, alt text.\n' +
      '6. Where it matters, offer 2 layout concepts for the main screen with a one-line trade-off each, ' +
      'and recommend one.',
  },
];

const DEFAULT_ID = 'copilot';
const KEY = 'te_delivery_mode_v1';

/** The student's saved delivery-mode id (applies to every prompt they copy). */
export function getModeId(): string {
  try {
    const id = localStorage.getItem(KEY);
    if (id && DELIVERY_MODES.some((m) => m.id === id)) return id;
  } catch {
    /* ignore */
  }
  return DEFAULT_ID;
}

export function setModeId(id: string): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}

export function getMode(id?: string): DeliveryMode {
  const wanted = id ?? getModeId();
  return DELIVERY_MODES.find((m) => m.id === wanted) || DELIVERY_MODES[0];
}

export function workingBlock(id?: string): string {
  return getMode(id).workingBlock;
}
