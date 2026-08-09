/**
 * claudeCodeWorkshopWeek1 — the hand-authored Week 1 Explore/Plan/Code/Commit
 * workshop, applied to the canonical program's week-1 `prompt_lab` card.
 *
 * Why: Ram's 2026-08-06 review (Basecamp todo 10174283832) said Anthropic's own
 * explore-plan-code-commit video "is not enough" — it raises success criteria,
 * tools, test suites and code-review agents without ever walking you through doing
 * them. Week 1's existing prompt_lab and implementation_task cards were checked and
 * covered NONE of those four. Each is now an explicit stage below.
 *
 * Format is dictated by the prompt-catalog renderer (`PromptCatalogRender.tsx`,
 * render_band `prompt_catalog`), which parses only DIRECT children of the body:
 *   <h3> = category   <h4> = prompt title   <p> = explanation   <pre> = the prompt
 * Anything else is ignored, and a category with no <h4> is dropped. Completion is
 * copy-gated — the student must copy every prompt — so keep the count deliberate.
 *
 * Applied by scripts/seedWeek1ClaudeCodeCards.ts.
 */
export const CLAUDE_CODE_WORKSHOP_WEEK1 = {
  title: 'Workshop - Explore, Plan, Code, Commit',
  summary:
    'The full Explore - Plan - Code - Commit loop, done for real: success criteria, the right tools, a test suite that would actually catch a regression, and a code-review agent. Anthropic\'s course explains the concepts; this walks you through doing them. Work top to bottom, copying each prompt into Claude Code as you reach it.',
  body_html: `
<h3>Start by exploring, not coding</h3>
<h4>Map the ground before you build on it</h4>
<p>The single biggest difference between people who get good results and people who fight the tool is that the first group spends the opening minutes looking around. You are asking for an orientation, not a change - and you are explicitly telling it to admit what it could not work out, which is how you find the gaps early.</p>
<pre>Before we change anything, explore this project and give me a short orientation:
- what this codebase does, in three sentences
- the main folders, and what each one is responsible for
- how it runs locally, and how the tests are run
- the three files most likely to matter for the work I am about to do

Do not write or modify any code yet. If something is unclear, tell me what you could not determine rather than guessing.</pre>

<h3>Plan with a definition of done</h3>
<h4>Turn the goal into a plan with success criteria</h4>
<p>This is the step most people skip. Success criteria are the difference between "it seems to work" and "we can both check whether it works." Write them so a stranger could verify each one without asking you what you meant.</p>
<pre>I want to build: [describe your feature in one or two sentences].

Before writing any code, produce a plan with:
1. The steps, in order, each small enough to verify on its own.
2. Explicit SUCCESS CRITERIA - a numbered list of statements that must be true when this is done. Write them so someone else could check each one without asking me.
3. What is explicitly OUT of scope.
4. The riskiest assumption in the plan, and how we would find out early if it is wrong.

Do not start coding. Show me the plan and wait for my go-ahead.</pre>
<h4>Pressure-test the plan before you build on it</h4>
<p>A plan you never argued with is just a first draft. Asking the assistant to attack its own plan surfaces the vague criterion - the one you could claim to have met without really meeting it - while changing it is still free.</p>
<pre>Now argue against the plan you just wrote. Specifically:
- Which success criterion is vague enough that we could claim it is met without it really being met?
- Where would this break if the input were empty, enormous, or malformed?
- What is the simplest version that still delivers the value, and what would we give up by building that instead?

Then show me the revised plan.</pre>

<h3>Give Claude Code the right tools</h3>
<h4>Set up the tools this project actually needs</h4>
<p>An assistant with no way to run your tests is guessing. Giving it a test runner, a linter, and one health-check command turns "I think this works" into something it can verify by itself before it comes back to you.</p>
<pre>Look at this project and tell me which tools you need in order to work on it effectively - for example a test runner, a linter, a formatter, a type checker, or a way to run it locally.

For each one: say whether it is already set up, and if not, what you would add and why.

Then set up the ones I approve, and show me the single command I can run to check the project is healthy.</pre>

<h3>Build one slice at a time</h3>
<h4>Build the smallest slice that proves the idea</h4>
<p>Small steps are not slower - they are how you keep the ability to tell what broke. Notice the instruction to stop if it needs a file the plan never mentioned: that is your early warning that the plan was wrong, not the code.</p>
<pre>Implement step 1 of the plan only. Nothing else.

Rules:
- Make the smallest change that satisfies step 1's success criteria.
- Show me the diff before you apply it.
- If you find yourself needing to change a file the plan did not mention, stop and tell me why.

When you are done, tell me which success criteria are now met, and which are still outstanding.</pre>

<h3>Prove it works with a real test suite</h3>
<h4>Write tests that would actually catch a regression</h4>
<p>A happy-path test proves the code ran once. What you want is the failure paths and the boundaries. The last line matters most: a test that cannot fail is worse than no test, because it buys false confidence.</p>
<pre>Write a test suite for what we just built. I want more than a happy path:
- one test for the normal case
- one for each failure mode you can think of (bad input, missing data, a dependency being unavailable)
- one for the boundaries (empty, maximum size, off-by-one)

Then run the suite and show me the output.

Finally, review your own tests: is there any test here that would pass even if the feature were broken? If so, tell me which, and fix it.</pre>

<h3>Review it like a senior engineer, then ship</h3>
<h4>Create a code-review agent you can reuse</h4>
<p>This is the piece the introductory material mentions and never shows you. You are building a reusable reviewer with an opinion and a priority order - and, importantly, permission to say the change is fine rather than inventing problems to look useful.</p>
<pre>Create a code-review agent for this project.

It should review a change the way a senior engineer would - correctness first, then error handling, then whether the tests actually prove the behaviour, then readability. It should quote specific lines and say what would break, not give general advice. It must be willing to say "this is fine" instead of inventing problems.

Save it so I can reuse it on future changes, and tell me how to invoke it.</pre>
<h4>Act on the review, then commit</h4>
<p>Disagreeing with a review finding, out loud and with a reason, is part of the job. You are asking for judgement rather than compliance - and for a commit message that explains why the change exists, since the diff already shows what changed.</p>
<pre>Run the code-review agent on everything we changed in this session.

For each finding, tell me whether you agree and why. Fix the ones that are real. For any you disagree with, say so and explain your reasoning - do not just comply.

Once the review is clean, commit the work. The commit message should explain WHY this change exists, not restate what the diff already shows.</pre>`.trim(),
};

export default CLAUDE_CODE_WORKSHOP_WEEK1;
