# CC-20261120: Enterprise client intake, Phase 1 (W28)

Ali, 2026-11-20: "I want to create an AI intake process similar to how I did it on aiflotation.com... starts from the moment they decide to fill out the form... upon completing that they can have the AI call them. Also tell them how much time is going to save them."

Plan page: `C:\Users\ali_m\visual-decisions\2026-11-20-enterprise-client-intake-plan\plan.html`. It has 5 phases, one PR each.

Ali's answers:
- **Q1 A:** the AI interview runs right after the form.
- **Q2 A:** the time figure comes from their own numbers.
- **Q3 A:** a new Enterprise agent with its own number.
- **Q4 A:** Ali owns every client list (Phase 2).
- **Interview length:** "is 10 minutes enough?" Yes. The interview stops at 12 exchanges, and the call script now aims for under 10 minutes.

Basecamp: W28, todo 10532293119.

## Change

- **The form (`/demo-pilot`):**
  - Adds mobile number, with its own "the AI may call me" tick that only appears beside a number. Also adds company website, when they want to start, and who else decides.
  - The cost question becomes two numbers: people, and hours a week in total.
  - Company is now required, because we research the company before we meet.
  - "What happens next" now reads: AI for 10 minutes, then we do the homework, then the first meeting starts with your options.
- **`POST /api/enterprise/intake`:**
  - Writes the same lead `/api/leads` wrote: same form type, every answer in the message, the phone grant recorded first.
  - Opens an `enterprise_intakes` row. Its random id is the visitor's token and sits in the URL as `?intake=`, so a reload, or a link emailed later, resumes the interview.
- **After the form:**
  - Their figure: hours a week times 52, shown as hours a year, with "10 minutes now replaces our discovery meeting".
  - Then **Call me now** or **Type it instead**.
  - Both run the ONE intake that AI Flotation uses (`runIntakeTurn` and `finishIntake`), with `buildFor: none`, so no student project is built.
  - The brief is composed on the server from the stored form, so the interviewer never re-asks it and the browser cannot rewrite it.
- **The call:**
  - Uses the new `enterprise-intake` source and `ENTERPRISE_BRAND`: it speaks as Colaberry, aims for under 10 minutes, and ends by promising a first meeting with pilot options.
  - Uses the new `SYNTHFLOW_ENTERPRISE_INTAKE_AGENT_ID` with NO fallback. While it is unset, the page offers typing only.
  - A finished call runs the shared completion (webhook, poll or sweep), which records the write-up on the intake.

## Verification

- **Backend:** 1,896 tests pass, including the new `enterpriseIntake.test.ts` and the Enterprise cases added to the prompt, agent and completion suites. One suite fails locally only because `playwright` is not installed in this worktree. tsc is clean apart from the known missing playwright and exceljs types.
- **Frontend:** 1,204 tests pass, including the new `DemoPilotIntake.test.tsx` and the updated `DemoPilotV2.test.tsx`. tsc is clean and `npm run build` compiles.
- **Edge, local build at 1440 and 390, with the intake API faked:**
  - the form posts the structured body;
  - the step shows "1,040 hours a year" for 4 people and 20 hours a week;
  - Call me now and Type it instead both show;
  - the typed interview runs two turns to the next steps;
  - no sideways scroll and no page errors.
- **Not yet verified:**
  - the live endpoints, which need the deploy;
  - a real typed interview on production;
  - a real call, which needs the Synthflow agent and number (Ali).
