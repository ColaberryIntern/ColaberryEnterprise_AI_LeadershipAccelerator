import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import InternshipProjectGenerator from '../InternshipProjectGenerator';
import * as api from '../../../../services/adminInternshipApi';

/**
 * Generating an intern's project instead of typing it.
 *
 * The two rules worth a test here are the ones a reasonable person would
 * "simplify" away:
 *
 *   1. The interview is not skippable. It is the difference between a plan that
 *      names the real system (14/14 in the pipeline's own study) and one that
 *      does not (0/14). A Generate button next to the idea box would quietly
 *      delete that.
 *   2. Assign carries the hash of the plan ON SCREEN. A regeneration between
 *      reading and assigning must not be able to ship a plan nobody reviewed.
 */

jest.mock('../../../../services/adminInternshipApi');
const mocked = api as jest.Mocked<typeof api>;

const APP = 'app-1';
const PROJECT = 'proj-1';
const SHA = 'a'.repeat(64);

const QUESTIONS: api.IntakeQuestionsResponse = {
  questions: [
    { id: 'q1', question: 'Who uses it every day?', why: 'Names the real user.', placeholder: 'e.g. listing agents' },
    { id: 'q2', question: 'What must it never get wrong?', why: 'Becomes a guardrail.', placeholder: 'e.g. stale prices' },
  ],
  covered: [],
  generated: true,
  model: 'gpt-4o',
  attempts: 1,
};

const PLAN: api.GeneratedPlan = {
  project_name: 'PropertyPulse AI',
  descriptor: 'Listing velocity for agents',
  requirements: [{ id: 'REQ-001', statement: 'An agent sees velocity by street.', kind: 'FUNC', priority: 'must' }],
  releases: [{ key: 'r0', name: 'Release 0 · Foundations', goal: 'Stand it up', demo: 'd', week_start: 1, week_end: 2 }],
  stories: [{
    id: 'STORY-001', release: 'r0', title: 'Ingest the listing feed',
    narrative: 'n', fulfills: ['REQ-001'], owner_agent: 'Ingest', acceptance: ['a'],
  }],
};

const buildView = (over: Partial<api.InternProjectBuildView> = {}): api.InternProjectBuildView => ({
  project_id: PROJECT, enrollment_id: 'enr-1', status: 'drafted',
  plan: PLAN, version: 1, blocking: [], advisory: [], plan_sha256: SHA, assigned: false,
  // Null by default: this suite's builds come from a typed brief, which has no
  // recorded conversation to compare the plan against. The coverage panel's own
  // suite covers the populated case.
  coverage: null, coverage_summary: null,
  ...over,
});

let container: HTMLDivElement;
let root: Root;

const render = (props: Partial<React.ComponentProps<typeof InternshipProjectGenerator>> = {}) => {
  act(() => {
    root.render(
      <InternshipProjectGenerator
        applicationId={APP}
        onAssigned={props.onAssigned ?? jest.fn()}
        onManual={props.onManual ?? jest.fn()}
      />,
    );
  });
};

const byText = (text: string): HTMLElement | undefined =>
  Array.from(container.querySelectorAll('button, a')).find(
    (el) => (el.textContent || '').trim().toLowerCase().includes(text.toLowerCase()),
  ) as HTMLElement | undefined;

const type = (el: Element, value: string) => {
  act(() => {
    const setter = Object.getOwnPropertyDescriptor(
      el instanceof HTMLTextAreaElement ? HTMLTextAreaElement.prototype : HTMLInputElement.prototype,
      'value',
    )!.set!;
    setter.call(el, value);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
};

const settle = async () => { await act(async () => { await Promise.resolve(); await Promise.resolve(); }); };

beforeEach(() => {
  jest.clearAllMocks();
  (global as any).IS_REACT_ACT_ENVIRONMENT = true;
  container = document.createElement('div');
  document.body.appendChild(container);
  act(() => { root = createRoot(container); });
  mocked.internProjectQuestions.mockResolvedValue(QUESTIONS);
  mocked.generateInternProject.mockResolvedValue({
    project_id: PROJECT, enrollment_id: 'enr-1', correlation_id: 'c1', status: 'generating',
  });
  mocked.internProjectBuild.mockResolvedValue(buildView());
  mocked.assignInternProject.mockResolvedValue({
    status: 'awaiting_repo', planVersion: 1, commitSha: null, filesWritten: 0, repoUrl: null,
  });
});

afterEach(() => {
  act(() => root.unmount());
  container.remove();
});

describe('the idea step', () => {
  it('will not move on from an idea too thin to interview against', () => {
    render();
    type(container.querySelector('textarea')!, 'a dashboard');
    expect((byText('sharpen it') as HTMLButtonElement).disabled).toBe(true);
  });

  it('asks the pipeline for questions rather than generating straight away', async () => {
    render();
    type(container.querySelector('textarea')!, 'A tool that tracks local listing velocity so an agent knows which street is moving.');
    await act(async () => { (byText('sharpen it') as HTMLButtonElement).click(); });
    await settle();
    expect(mocked.internProjectQuestions).toHaveBeenCalledTimes(1);
    // The rule: no route from the idea box to a generated plan that skips this.
    expect(mocked.generateInternProject).not.toHaveBeenCalled();
  });
});

describe('the interview', () => {
  const reachQuestions = async () => {
    render();
    type(container.querySelector('textarea')!, 'A tool that tracks local listing velocity so an agent knows which street is moving.');
    await act(async () => { (byText('sharpen it') as HTMLButtonElement).click(); });
    await settle();
  };

  it('shows the generated questions', async () => {
    await reachQuestions();
    expect(container.textContent).toContain('Who uses it every day?');
    expect(container.textContent).toContain('What must it never get wrong?');
  });

  it('says so when the model failed and the GENERIC set was substituted', async () => {
    // A plan built on the generic set is measurably worse; hiding that would
    // let a reviewer assign it believing it was tailored.
    mocked.internProjectQuestions.mockResolvedValue({ ...QUESTIONS, generated: false, model: null });
    await reachQuestions();
    expect(container.textContent).toContain('generic questions');
  });

  it('carries the answers into the generation', async () => {
    await reachQuestions();
    const boxes = container.querySelectorAll('textarea');
    type(boxes[0], 'Listing agents.');
    type(boxes[1], 'Showing a stale price.');
    await act(async () => { (byText('Generate the plan') as HTMLButtonElement).click(); });
    await settle();
    expect(mocked.generateInternProject).toHaveBeenCalledWith(APP, expect.objectContaining({
      answers: [
        expect.objectContaining({ id: 'q1', answer: 'Listing agents.' }),
        expect.objectContaining({ id: 'q2', answer: 'Showing a stale price.' }),
      ],
    }));
  });

  it('drops unanswered questions rather than sending empty answers', async () => {
    await reachQuestions();
    type(container.querySelectorAll('textarea')[0], 'Listing agents.');
    await act(async () => { (byText('Generate the plan') as HTMLButtonElement).click(); });
    await settle();
    const sent = mocked.generateInternProject.mock.calls[0][1].answers!;
    expect(sent).toHaveLength(1);
    expect(sent[0].id).toBe('q1');
  });
});

describe('the review step', () => {
  const reachReview = async (view: api.InternProjectBuildView = buildView()) => {
    mocked.internProjectBuild.mockResolvedValue(view);
    render();
    type(container.querySelector('textarea')!, 'A tool that tracks local listing velocity so an agent knows which street is moving.');
    await act(async () => { (byText('sharpen it') as HTMLButtonElement).click(); });
    await settle();
    await act(async () => { (byText('Generate the plan') as HTMLButtonElement).click(); });
    await settle();
    await settle();
  };

  it('renders the releases and stories that came back', async () => {
    await reachReview();
    expect(container.textContent).toContain('PropertyPulse AI');
    expect(container.textContent).toContain('Release 0 · Foundations');
    expect(container.textContent).toContain('Ingest the listing feed');
  });

  it('assigns with the hash of the plan ON SCREEN', async () => {
    await reachReview();
    await act(async () => { (byText('Assign to intern') as HTMLButtonElement).click(); });
    await settle();
    expect(mocked.assignInternProject).toHaveBeenCalledWith(APP, {
      project_id: PROJECT, expected_sha256: SHA,
    });
  });

  it('refuses to assign a plan with a blocking violation, and says which', async () => {
    await reachReview(buildView({
      blocking: [{ rule: 'must_uncovered', message: 'REQ-002 is fulfilled by no story.' }],
    }));
    expect(container.textContent).toContain('cannot be assigned yet');
    expect(container.textContent).toContain('REQ-002 is fulfilled by no story.');
    expect((byText('Assign to intern') as HTMLButtonElement).disabled).toBe(true);
  });

  it('does not let an advisory note block the assignment', async () => {
    await reachReview(buildView({
      advisory: [{ rule: 'story_redundant', message: 'STORY-004 restates STORY-003.' }],
    }));
    expect((byText('Assign to intern') as HTMLButtonElement).disabled).toBe(false);
  });

  it('will not assign the same plan twice', async () => {
    await reachReview(buildView({ status: 'published', assigned: true }));
    expect((byText('Already assigned') as HTMLButtonElement).disabled).toBe(true);
  });

  it('tells the reviewer when no repo took the documents', async () => {
    await reachReview();
    await act(async () => { (byText('Assign to intern') as HTMLButtonElement).click(); });
    await settle();
    // awaiting_repo is the normal outcome today: no project has a provisioned
    // repo, so saying "assigned" alone would overstate what happened.
    expect(container.textContent).toContain('No repo is connected');
  });
});

describe('the manual form', () => {
  it('is still reachable, as the escape hatch', () => {
    const onManual = jest.fn();
    render({ onManual });
    (byText('Author manually instead') as HTMLElement).click();
    expect(onManual).toHaveBeenCalled();
  });
});
