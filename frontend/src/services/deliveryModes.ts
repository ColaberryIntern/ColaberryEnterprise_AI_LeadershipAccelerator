// Delivery modes — how the student wants Claude Code to work with them on a
// build task. Pure data (no side effects on import). The selected mode is a
// per-student preference persisted to localStorage so it carries across tasks
// and sessions. Each `workingBlock` is a concise, build/repo-oriented
// "## How I want you to work" block that gets appended to the copied Claude
// Code prompt (see projectWorkspacePrompt.ts).

export type DeliveryModeId =
  | 'copilot'
  | 'answer'
  | 'visual'
  | 'explain'
  | 'checklist'
  | 'plain'
  | 'social'
  | 'design';

export interface DeliveryMode {
  id: DeliveryModeId;
  label: string;
  emoji: string;
  /** One-line description shown in the mode selector. */
  blurb: string;
  /** The "## How I want you to work" block appended to the Claude Code prompt. */
  workingBlock: string;
}

export const DELIVERY_MODES: DeliveryMode[] = [
  {
    id: 'copilot',
    label: 'Co-pilot (paced)',
    emoji: '🧭',
    blurb: 'Step by step, confirm each move.',
    workingBlock:
      '## How I want you to work\nWork as a paced co-pilot. Move one step at a time: propose the next change to the repo, wait for me to confirm, then make it. Never batch several edits together. After each step, tell me what you did and what the next step is.',
  },
  {
    id: 'answer',
    label: 'Just the answer',
    emoji: '⚡',
    blurb: 'BLUF, terse, deliverable first.',
    workingBlock:
      '## How I want you to work\nBLUF: lead with the deliverable. Give me the code, the command, or the answer first, in the fewest words. Skip preamble and restating the task. Only add reasoning if I ask.',
  },
  {
    id: 'visual',
    label: 'Visual-first',
    emoji: '📊',
    blurb: 'Build a clean HTML decision sheet, open it, paste back.',
    workingBlock:
      '## How I want you to work\nWhen a choice or a status matters, build a clean self-contained HTML decision sheet in the repo, open it in my browser, and then paste the key takeaways back into the chat. Prefer a rendered visual over a wall of text.',
  },
  {
    id: 'explain',
    label: 'Explain it to me',
    emoji: '🎓',
    blurb: 'Full reasoning + trade-offs.',
    workingBlock:
      '## How I want you to work\nTeach as you build. Show your full reasoning, the alternatives you considered, and the trade-offs of the path you chose. I want to understand the "why" behind each change to the repo, not just the diff.',
  },
  {
    id: 'checklist',
    label: 'Checklist doer',
    emoji: '✅',
    blurb: 'Numbered actions + copy-paste commands.',
    workingBlock:
      '## How I want you to work\nGive me a numbered checklist of concrete actions, each with an exact copy-paste command or code block. Keep prose to a minimum. I will run the steps against the repo and report back.',
  },
  {
    id: 'plain',
    label: 'Plain & friendly',
    emoji: '💬',
    blurb: 'No jargon, you handle the tech.',
    workingBlock:
      '## How I want you to work\nUse plain, friendly language and no jargon. You handle all the technical work in the repo yourself; just tell me in simple terms what you are doing and what I will see when it works.',
  },
  {
    id: 'social',
    label: 'Social Media',
    emoji: '📣',
    blurb: 'Draft-only content package.',
    workingBlock:
      '## How I want you to work\nProduce a draft-only social content package (posts, captions, hooks) as files in the repo. Do NOT publish or post anywhere. Everything is a draft for me to review and send myself.',
  },
  {
    id: 'design',
    label: 'UI/UX Designer',
    emoji: '🎨',
    blurb: 'Screens/flows/components spec, not code.',
    workingBlock:
      '## How I want you to work\nAct as a UI/UX designer. Deliver a screens / flows / components spec (layout, states, copy, interaction notes) written into the repo as design docs. Describe the interface, do not write application code unless I ask.',
  },
];

const KEY = 'te_delivery_mode_v1';
export const DEFAULT_MODE_ID: DeliveryModeId = 'copilot';

/** Look up a mode by id, falling back to the default. */
export function getMode(id: DeliveryModeId | string | null | undefined): DeliveryMode {
  return DELIVERY_MODES.find((m) => m.id === id) || DELIVERY_MODES[0];
}

/** Read the student's saved delivery-mode preference (default if unset). */
export function loadDeliveryMode(): DeliveryModeId {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw && DELIVERY_MODES.some((m) => m.id === raw)) return raw as DeliveryModeId;
  } catch {
    /* ignore — private mode / disabled storage falls back to default */
  }
  return DEFAULT_MODE_ID;
}

/** Persist the student's delivery-mode preference. */
export function saveDeliveryMode(id: DeliveryModeId): void {
  try {
    localStorage.setItem(KEY, id);
  } catch {
    /* ignore */
  }
}
