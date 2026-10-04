import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import PresentationStudio from '../presentation/PresentationStudio';
import { PRESENTATION_STAGES, readSavedStage, studentTitleFor } from '../presentation/presentationStages';
import type { ProjectTask } from '../projectsStore';

// `get` is mocked too now that the Build stage fetches the deck prompt. Spread the
// actual module rather than enumerating exports — a factory that lists only what it
// thinks is used silently deletes the rest, and that failure surfaces inside unmocked
// product code where it looks like a bug in the component.
jest.mock('../../../../utils/portalApi', () => ({
  __esModule: true,
  default: { post: jest.fn(), get: jest.fn(), patch: jest.fn() },
}));
jest.mock('../projectSync', () => ({ refreshProjectsFromBackend: jest.fn().mockResolvedValue(undefined) }));

// eslint-disable-next-line @typescript-eslint/no-var-requires
const portalApi = require('../../../../utils/portalApi').default as { get: jest.Mock; patch: jest.Mock };

const TEMPLATES_OK = {
  data: [
    { id: 'project_introduction', label: 'Project introduction', prominent: true, outcome: 'Explain value clearly.', speaking_seconds: 90, qa_seconds: 0 },
    { id: 'ai_visual_presentation', label: 'AI visual presentation', prominent: true, outcome: 'Present a visual argument.', speaking_seconds: 300, qa_seconds: 120 },
    { id: 'working_system_demo', label: 'Working-system demo', prominent: true, outcome: 'Demonstrate one outcome.', speaking_seconds: 420, qa_seconds: 180 },
    { id: 'final_showcase', label: 'Final showcase', prominent: true, outcome: 'Story, proof and judgement.', speaking_seconds: 480, qa_seconds: 300 },
    { id: 'architecture_review', label: 'Architecture review', prominent: false, outcome: 'Explain tradeoffs.', speaking_seconds: 480, qa_seconds: 300 },
    { id: 'stakeholder_update', label: 'Stakeholder update', prominent: false, outcome: 'Communicate progress.', speaking_seconds: 180, qa_seconds: 120 },
    { id: 'client_handoff', label: 'Client handoff', prominent: false, outcome: 'Teach ownership.', speaking_seconds: 420, qa_seconds: 300 },
  ],
};

const LESSON_OK = {
  data: {
    id: 'ai_visual_presentation',
    label: 'AI visual presentation',
    prominent: true,
    defaultSeconds: 300,
    qaSeconds: 120,
    outcome: 'Make a visual argument someone could follow with the sound off.',
    objective: 'Show rather than describe.',
    expectedOutput: 'A five-minute slide presentation plus speaker notes.',
    preface: 'A visual presentation is not a document read aloud.',
    structure: ['The problem, shown', 'Before and after'],
    strongExample: { text: 'Example: a single slide split down the middle.', why: 'The image makes the claim.' },
    weakExample: { text: 'Example of what not to do: six bullets read aloud.', why: 'The audience reads ahead.' },
    timedOutline: [{ beat: 'The problem, shown', seconds: 40, say: 'Open on the current state as an image.' }],
    vocabulary: [{ term: 'Workflow', plain: 'The steps a job goes through.' }],
    prepare: ['Screenshot the current process first.'],
    checklist: ['Every slide makes one point'],
    practiceDrill: 'Play the deck with the sound off.',
    rubric: [{ dimension: 'Problem and audience clarity', weight: 20, lookFor: 'Opens on the problem.' }],
    reflection: 'Which slide were you tempted to add words to?',
  },
};

const ASSIGNMENT_OK = {
  data: {
    storyId: 'PREP-3',
    templateId: 'ai_visual_presentation',
    templateLabel: 'AI visual presentation',
    audience: null,
    purpose: null,
    checklist: {},
    prepState: 'not_started',
    checklistItems: ['Every slide makes one point', 'Someone could follow with the sound off'],
  },
};

const PROMPT_OK = {
  data: {
    prompt: 'PRESENTATION TYPE: AI visual presentation\n(not supplied)',
    template_id: 'ai_visual_presentation',
    template_version: 1,
    template_label: 'AI visual presentation',
    speaking_seconds: 300,
    qa_seconds: 120,
    missing: ['audience', 'purpose'],
  },
};

(globalThis as any).IS_REACT_ACT_ENVIRONMENT = true;

let container: HTMLDivElement;
let root: Root | null = null;

beforeEach(() => {
  container = document.createElement('div');
  document.body.appendChild(container);
  try { window.localStorage.clear(); } catch { /* ignore */ }
  portalApi.get.mockReset();
  portalApi.patch.mockReset();
  // Route by URL: the Studio calls three different GET endpoints.
  portalApi.get.mockImplementation((url: string) => {
    if (url.includes('presentation-assignment')) return Promise.resolve(ASSIGNMENT_OK);
    // The LIST endpoint has no id segment; the lesson read does. Order matters.
    if (url.endsWith('/presentation-templates')) return Promise.resolve(TEMPLATES_OK);
    if (url.includes('presentation-templates/')) return Promise.resolve(LESSON_OK);
    return Promise.resolve(PROMPT_OK);
  });
  portalApi.patch.mockResolvedValue({ data: { ...ASSIGNMENT_OK.data, audience: 'Hiring managers', prepState: 'preparing' } });
});
afterEach(() => { act(() => root?.unmount()); root = null; container.remove(); });

function mount(storyId: string, extra: Partial<ProjectTask> = {}) {
  const task = { id: 't1', storyId, title: 'x', state: 'todo', due: 'today', ...extra } as unknown as ProjectTask;
  act(() => {
    const r = createRoot(container);
    root = r;
    r.render(<PresentationStudio task={task} projectId="p1" taskId={storyId} points={40} />);
  });
}

const click = (el: Element | null) => act(() => {
  el?.dispatchEvent(new MouseEvent('click', { bubbles: true }));
});

/** Lets the prompt fetch's promise chain settle and React re-render. */
const flush = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

const stageBtn = (id: string) => container.querySelector(`[data-testid="ps-stage-${id}"]`);
const currentStage = () => container.querySelector('[aria-current="step"]')?.textContent || '';

/**
 * The Studio is a workspace laid OVER a demo-prep task. The thing most worth proving
 * is not that the new chrome renders — it is that none of the old guarantees were
 * quietly dropped on the way: the evidence panel still does the handing in, PREP-6 is
 * still staff-only, and a stage with no machinery yet offers no button that lies.
 */
describe('Presentation Studio — six stages over the existing prep task', () => {
  it('renders all six stages, in order, as a navigable rail', () => {
    mount('PREP-3');
    const labels = Array.from(container.querySelectorAll('.ps-rail button'))
      .map((b) => (b.textContent || '').replace(/Step \d+/, '').trim());
    expect(labels).toEqual(['Learn', 'Prepare', 'Build', 'Practice', 'Present', 'Reflect & Share']);
    expect(PRESENTATION_STAGES).toHaveLength(6);
  });

  it.each([
    ['PREP-1', 'Prepare'],
    ['PREP-3', 'Build'],
    ['PREP-4', 'Practice'],
    ['PREP-6', 'Present'],
  ])('%s opens on the stage that matches what it actually asks for (%s)', (storyId, expected) => {
    mount(storyId);
    expect(currentStage()).toContain(expected);
  });

  it('the evidence panel — the thing that actually hands work in — is mounted on the opening stage', () => {
    mount('PREP-3');
    // The guide heading and the submit control both come from DemoEvidencePanel.
    expect(container.textContent).toContain('Hand it in');
    expect(container.querySelector('input, textarea')).not.toBeNull();
  });

  it('PREP-6 stays staff-marked inside the Studio — no form appears anywhere on it', () => {
    // The whole point of PREP-6 is that nobody can vouch for themselves. Wrapping it
    // in a nicer workspace must not hand the student a box to type into.
    mount('PREP-6');
    expect(container.querySelector('input, textarea')).toBeNull();
    expect(container.textContent).toMatch(/staff/i);
  });

  it('moving between stages works, and coming back resumes where the student left off', () => {
    mount('PREP-3');
    expect(currentStage()).toContain('Build');

    click(stageBtn('learn'));
    expect(currentStage()).toContain('Learn');
    expect(readSavedStage('p1', 'PREP-3')).toBe('learn');

    // Remount, as a page refresh would.
    act(() => root?.unmount());
    root = null;
    mount('PREP-3');
    expect(currentStage()).toContain('Learn');
  });

  it('a stage whose machinery has not shipped says so and offers NO control', () => {
    mount('PREP-3');
    click(stageBtn('present'));
    const pending = container.querySelector('[data-testid="ps-pending"]');
    expect(pending).not.toBeNull();
    // Nothing clickable inside the honest placeholder — a dead button teaches a
    // student the platform is broken; a plain sentence does not.
    expect(pending!.querySelector('button, a, input')).toBeNull();
  });

  it('boundary: an unrecognised story id still renders a usable workspace', () => {
    mount('PREP-99');
    expect(currentStage()).toContain('Learn');
    expect(container.querySelector('.ps-rail')).not.toBeNull();
  });

  it('failure path: localStorage throwing does not take the workspace down', () => {
    const spy = jest.spyOn(window.localStorage.__proto__ as Storage, 'getItem')
      .mockImplementation(() => { throw new Error('private window'); });
    try {
      expect(() => mount('PREP-3')).not.toThrow();
      expect(currentStage()).toContain('Build');
    } finally {
      spy.mockRestore();
    }
  });

  it('shows the student-facing title AND keeps the PREP id visible', () => {
    // The title is a DISPLAY override — the stored task, its id, its evidence and its
    // points are untouched. The id stays on screen so a student saying "PREP-3" to a
    // mentor and a mentor searching for it still meet in the middle.
    mount('PREP-3', { title: 'Build the slides — what it does, who for, the number it moves' } as any);
    expect(container.textContent).toContain('Build Your AI Presentation');
    expect(container.textContent).toContain('PREP-3');
  });

  it.each([
    ['PREP-1', "Tell Your Project's Story"],
    ['PREP-2', 'Your First Recorded Walkthrough'],
    ['PREP-4', 'Rehearse With an Audience'],
    ['PREP-5', 'Create Your Portfolio Demo'],
    ['PREP-6', 'Present Your Project Live'],
  ])('%s shows its student-facing title', (storyId, expected) => {
    mount(storyId);
    expect(container.textContent).toContain(expected);
  });

  it('falls back to the stored title rather than inventing one', () => {
    // An unknown id has no override. Showing a made-up name would be worse than
    // showing the real stored one.
    expect(studentTitleFor('PREP-99')).toBeNull();
    mount('PREP-99', { title: 'Some stored task name' } as any);
    expect(container.textContent).toContain('Some stored task name');
  });

  it('the Build stage offers the deck prompt, so it is no longer a dead stage', async () => {
    mount('PREP-3');
    await flush();
    expect(container.querySelector('[data-testid="ps-prompt"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ps-copy"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ps-download"]')).not.toBeNull();
    expect(portalApi.get).toHaveBeenCalledWith(
      expect.stringContaining('/presentation-prompt'),
    );
  });

  it('tells the student what the prompt could NOT fill, rather than hiding it', async () => {
    // A student who pastes a prompt full of "(not supplied)" without noticing gets a
    // deck full of invented detail — the exact failure the accuracy rules prevent.
    mount('PREP-3');
    await flush();
    const warn = container.querySelector('[data-testid="ps-prompt-missing"]');
    expect(warn).not.toBeNull();
    expect(warn!.textContent).toContain('audience');
    expect(warn!.textContent).toContain('purpose');
  });

  it('failure path: a prompt that cannot load says why and does not break the stage', async () => {
    portalApi.get.mockRejectedValue({ response: { status: 404 } });
    mount('PREP-3');
    await flush();
    const err = container.querySelector('[data-testid="ps-prompt-error"]');
    expect(err).not.toBeNull();
    expect(err!.getAttribute('role')).toBe('alert');
    // The rail still works — one failed fetch must not strand the student.
    expect(container.querySelectorAll('.ps-rail button')).toHaveLength(6);
  });

  it('a preview account never calls the API for a prompt', async () => {
    // The prompt is built from a real student's own project; there is nothing to
    // generate for Explorer, and calling anyway would 404 noisily.
    act(() => {
      const r = createRoot(container);
      root = r;
      r.render(<PresentationStudio task={{ id: 't1', storyId: 'PREP-3' } as any} projectId="p1" taskId="PREP-3" demo />);
    });
    await flush();
    expect(portalApi.get).not.toHaveBeenCalled();
    expect(container.querySelector('[data-testid="ps-prompt-demo"]')).not.toBeNull();
  });

  it('the Prepare stage collects the audience, and the checklist comes from the template', async () => {
    mount('PREP-3');
    click(stageBtn('prepare'));
    await flush();
    expect(container.querySelector('[data-testid="ps-prepare"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ps-audience"]')).not.toBeNull();
    // The UI never invents checklist items — they arrive with the assignment.
    const items = container.querySelectorAll('[data-testid="ps-checklist"] li');
    expect(items).toHaveLength(2);
    expect(container.textContent).toContain('Every slide makes one point');
  });

  it('the server decides readiness — a save response replaces local state', async () => {
    jest.useFakeTimers();
    try {
      mount('PREP-3');
      click(stageBtn('prepare'));
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });

      const input = container.querySelector('[data-testid="ps-audience"]') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      act(() => {
        setter.call(input, 'Hiring managers');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      // Debounced: nothing has been sent yet.
      expect(portalApi.patch).not.toHaveBeenCalled();

      act(() => { jest.advanceTimersByTime(800); });
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });
      expect(portalApi.patch).toHaveBeenCalledTimes(1);
      expect(portalApi.patch.mock.calls[0][1]).toEqual({ audience: 'Hiring managers' });
    } finally {
      jest.useRealTimers();
    }
  });

  it('failure path: a save that fails keeps the student\'s text on screen', async () => {
    jest.useFakeTimers();
    try {
      portalApi.patch.mockRejectedValue({ response: { data: { error: 'Could not save.' } } });
      mount('PREP-3');
      click(stageBtn('prepare'));
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });

      const input = container.querySelector('[data-testid="ps-audience"]') as HTMLInputElement;
      const setter = Object.getOwnPropertyDescriptor(window.HTMLInputElement.prototype, 'value')!.set!;
      act(() => {
        setter.call(input, 'Some audience');
        input.dispatchEvent(new Event('input', { bubbles: true }));
      });
      act(() => { jest.advanceTimersByTime(800); });
      await act(async () => { await Promise.resolve(); await Promise.resolve(); });

      // Losing what they typed because the network blipped would be the worst
      // possible response to a failed save.
      expect((container.querySelector('[data-testid="ps-audience"]') as HTMLInputElement).value).toBe('Some audience');
      expect(container.querySelector('[data-testid="ps-save-state"]')!.textContent).toContain('Could not save.');
    } finally {
      jest.useRealTimers();
    }
  });

  it('a preview account never saves preparation', async () => {
    act(() => {
      const r = createRoot(container);
      root = r;
      r.render(<PresentationStudio task={{ id: 't1', storyId: 'PREP-1' } as any} projectId="p1" taskId="PREP-1" demo />);
    });
    await flush();
    expect(container.querySelector('[data-testid="ps-prepare-demo"]')).not.toBeNull();
    expect(portalApi.patch).not.toHaveBeenCalled();
  });

  it('the Learn stage shows the authored lesson, not a placeholder', async () => {
    mount('PREP-3');
    click(stageBtn('learn'));
    await flush();
    await flush();
    expect(container.querySelector('[data-testid="ps-learn"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ps-pending"]')).toBeNull();
    expect(container.textContent).toContain('Make a visual argument');
    expect(container.textContent).toContain('A visual presentation is not a document read aloud.');
  });

  it('Learn gives the weak example equal weight — that is where judgement is taught', async () => {
    mount('PREP-3');
    click(stageBtn('learn'));
    await flush();
    await flush();
    expect(container.textContent).toContain('Example: a single slide split down the middle.');
    expect(container.textContent).toContain('Why it works:');
    expect(container.textContent).toContain('Example of what not to do: six bullets read aloud.');
    expect(container.textContent).toContain('Why it fails:');
    // Both rendered as examples, so neither can read as a real student's work.
    expect(container.querySelectorAll('.ps-eg')).toHaveLength(2);
  });

  it('Learn shows the timed outline and the rubric weights', async () => {
    mount('PREP-3');
    click(stageBtn('learn'));
    await flush();
    await flush();
    expect(container.querySelector('[data-testid="ps-outline"]')).not.toBeNull();
    expect(container.textContent).toContain('40s');
    expect(container.querySelector('[data-testid="ps-rubric"]')).not.toBeNull();
    expect(container.textContent).toContain('20%');
  });

  it('Learn resolves the template from the assignment, never guesses it client-side', async () => {
    // Guessing would let the lesson a student reads drift from the template their
    // deck prompt is actually built from.
    mount('PREP-3');
    click(stageBtn('learn'));
    await flush();
    await flush();
    const urls = portalApi.get.mock.calls.map((c: any[]) => String(c[0]));
    expect(urls.some((u) => u.includes('presentation-assignment'))).toBe(true);
    expect(urls.some((u) => u.includes('presentation-templates/ai_visual_presentation'))).toBe(true);
  });

  it('announces the stage change — switching stages moves no focus, so silence is the default', async () => {
    mount('PREP-3');
    const live = container.querySelector('[data-testid="ps-announce"]')!;
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(live.getAttribute('role')).toBe('status');
    expect(live.textContent).toContain('Build');

    click(stageBtn('practice'));
    expect(container.querySelector('[data-testid="ps-announce"]')!.textContent).toContain('Practice');

    // Visually hidden, NOT `hidden` — the hidden attribute is not announced at all,
    // which would make this region useless.
    expect(live.hasAttribute('hidden')).toBe(false);
    expect(live.className).toContain('ps-sr');
  });

  it('announces whether preparation saved, rather than leaving it to be noticed', async () => {
    mount('PREP-3');
    click(stageBtn('prepare'));
    await flush();
    const status = container.querySelector('[data-testid="ps-save-state"]')!;
    expect(status.getAttribute('role')).toBe('status');
    expect(status.getAttribute('aria-live')).toBe('polite');
  });

  it('Prepare offers a template chooser — without it a student is locked to one type', async () => {
    // The gap this closes: someone on PREP-3 preparing for the Capstone Expo could only
    // ever generate a 5-minute visual presentation, never the 8-minute final showcase.
    mount('PREP-3');
    click(stageBtn('prepare'));
    await flush();
    expect(container.querySelector('[data-testid="ps-chooser"]')).not.toBeNull();
    expect(container.querySelector('[data-testid="ps-choice-final_showcase"]')).not.toBeNull();
  });

  it('leads with the four prominent types and hides the rest behind "more"', async () => {
    mount('PREP-3');
    click(stageBtn('prepare'));
    await flush();
    // Seven exist; four prominent are shown (the current selection is among them).
    expect(container.querySelectorAll('.ps-choice')).toHaveLength(4);
    expect(container.querySelector('[data-testid="ps-choice-architecture_review"]')).toBeNull();

    click(container.querySelector('[data-testid="ps-chooser-more"]'));
    expect(container.querySelectorAll('.ps-choice')).toHaveLength(7);
    expect(container.querySelector('[data-testid="ps-choice-architecture_review"]')).not.toBeNull();
  });

  it('marks the current type with aria-checked, not colour alone', async () => {
    mount('PREP-3');
    click(stageBtn('prepare'));
    await flush();
    const current = container.querySelector('[data-testid="ps-choice-ai_visual_presentation"]')!;
    expect(current.getAttribute('aria-checked')).toBe('true');
    expect(current.getAttribute('role')).toBe('radio');
    // Exactly one selected at a time.
    expect(container.querySelectorAll('[aria-checked="true"]')).toHaveLength(1);
  });

  it('switching the type saves IMMEDIATELY — a click is a choice, not typing', async () => {
    // Debouncing a deliberate click by 700ms reads as the control being broken, and the
    // response rewrites the checklist on screen.
    mount('PREP-3');
    click(stageBtn('prepare'));
    await flush();

    click(container.querySelector('[data-testid="ps-choice-final_showcase"]'));
    await flush();

    expect(portalApi.patch).toHaveBeenCalledTimes(1);
    expect(portalApi.patch.mock.calls[0][1]).toEqual({ template: 'final_showcase' });
  });

  it('clicking the already-selected type does not fire a pointless save', async () => {
    mount('PREP-3');
    click(stageBtn('prepare'));
    await flush();
    click(container.querySelector('[data-testid="ps-choice-ai_visual_presentation"]'));
    await flush();
    expect(portalApi.patch).not.toHaveBeenCalled();
  });

  it('every stage button is reachable and labelled for assistive tech', () => {
    mount('PREP-1');
    const nav = container.querySelector('nav[aria-label="Presentation stages"]');
    expect(nav).not.toBeNull();
    const buttons = container.querySelectorAll('.ps-rail button');
    expect(buttons).toHaveLength(6);
    buttons.forEach((b) => {
      expect(b.tagName).toBe('BUTTON');            // focusable natively, not a div
      expect((b.textContent || '').trim().length).toBeGreaterThan(0);
    });
    // Exactly one current step at a time.
    expect(container.querySelectorAll('[aria-current="step"]')).toHaveLength(1);
  });
});
