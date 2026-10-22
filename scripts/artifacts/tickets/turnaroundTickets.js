/**
 * The turnaround decisions as proper C-tickets, in this project's own format.
 *
 * WHY THIS FILE REPLACES A STANDALONE LIST. I first created these as a separate todolist
 * with thin bodies. That was wrong twice over: they are not a separate initiative, and
 * they did not carry the structure every other ticket in this project carries, so nobody
 * opening one could tell what to do. These slot into the existing groups, continue each
 * group's numbering, and use the same scaffold as C7.8.
 *
 * THE SCAFFOLD IS GENERATED, NOT RETYPED. Every ticket in this project opens with the
 * source-of-truth line, the canonical artifact folder, the initiative header, dependencies,
 * an objective, the context questions, an execution prompt, acceptance criteria and the
 * review-state footer. `renderBody` emits all of that from the per-ticket specifics below,
 * so thirteen tickets cannot drift from each other or from the house format.
 */

/** The groups these land in, read from the live list. */
const GROUPS = {
  governance: { id: 10379236025, name: '00 - Control, Source of Truth & Governance' },
  pricing: { id: 10379236039, name: '02 - Positioning, Offer, Pricing & Unit Economics' },
  website: { id: 10379236079, name: '05 - Website, Demo & Proof Experience' },
  campaigns: { id: 10379236084, name: '06 - Target Accounts, Apollo & Campaign Engine' },
  launch: { id: 10379236118, name: '09 - Launch, Meetings, Conversion & Learning Loop' },
};

/** Artifact vault folders already in use by this project. */
const FOLDERS = {
  governance: '00 - Control & Governance',
  pricing: '02 - Positioning & Pricing',
  website: '05 - Website & Demo',
  campaigns: '06 - Target Accounts & Campaigns',
  launch: '09 - Launch & Conversion',
};

/**
 * The thirteen tickets.
 *
 * `priority` follows the plan's own sequencing rather than enthusiasm: P1 is this week
 * and next, P2 is the transition through January, P3 is the 2027 motion. `irreversible`
 * carries through from the plan because it is what tells Ram where to spend attention.
 */
const TICKETS = [
  /* ── what Ram needs next week ─────────────────────────────────────────── */
  {
    code: 'C0.7', group: 'governance', priority: 'P1', due: '2026-10-29',
    title: 'Obtain and reconcile the QuickBooks transaction detail for account 4300',
    objective: 'Establish what is actually inside the largest income line, so the runway '
      + 'can be forecast from cash rather than from an account name.',
    why: 'Account 4300 carries $151,841 across Jan to Aug and is named "ISA Placement '
      + 'Income (Paysimple)". Only $17,211 of it, 11.3%, traces to post-placement ISA '
      + 'fees from four named students. The workbook organizes income by payment '
      + 'processor rather than by product, so 4300 means "cash that arrived through '
      + 'PaySimple" and nothing more. April is the sharpest case: it shows $30,683, about '
      + '$14,500 above anything traceable that month, and it is what makes Q2 look healthy.',
    audience: 'Ram, and anyone making a staffing decision on these numbers.',
    decision: 'Whether the income line is a receivable winding down or a subscription '
      + 'book that can cancel. Those imply opposite plans.',
    reuse: 'The measured PaySimple reconciliation already in the turnaround model.',
    haveEvidence: 'Eight months of P&L, PaySimple settlement data, a measured 46.3% '
      + 'realization rate.',
    missingEvidence: 'The QuickBooks transaction detail itself, with payee and memo.',
    outOfScope: 'Re-deriving the figures from PaySimple. This ticket is about getting the '
      + 'ledger truth, not rebuilding it.',
    artifact: 'A reconciliation of account 4300 by category, Jan to Aug, with April '
      + 'explained.',
    metric: 'The runway forecast stops carrying a caveat.',
    risk: 'Describing 4300 as placement income to a lender, buyer or board when 89% of it '
      + 'is something else.',
    aliDecides: 'Nothing to decide. This is a request already sent to accounting; the '
      + 'ticket tracks receiving and reconciling it.',
    acceptance: [
      'Transaction detail received for Jan to Aug 2026 with payee and memo',
      'April\'s $30,683 explained, and stated as cash or as a timing entry',
      'Each category of 4300 sized, with placement fees separated from subscriptions',
      'The turnaround model updated and its UNKNOWN for 4300 removed',
    ],
    deps: 'C0.6', blocks: 'C0.9',
    prompt: 'The request has been sent to Aishwarya C and Durga Siralam, copying Ram. '
      + 'When the detail arrives, reconcile it against the PaySimple settlement data '
      + 'already measured and update scripts/artifacts/tickets/turnaroundData.js. Remove '
      + 'the account-4300 entry from OPEN_MEASUREMENTS only when the composition is '
      + 'actually known. Do not estimate the categories if the report is incomplete; say '
      + 'what is still missing.',
  },
  {
    code: 'C0.8', group: 'governance', priority: 'P1', due: '2026-10-29',
    title: 'Obtain the payroll register by employee with class coding',
    objective: 'Make the real cost base visible, so a headcount decision can be taken on '
      + 'evidence rather than on recollection.',
    why: 'The school P&L shows almost no salary while carrying about $1,500 a month of '
      + 'health, dental, life and disability. You cannot insure people who do not exist. '
      + 'Separately, commission actually paid Jan to Aug was about $90,614 while the '
      + 'school P&L carries about $31,827, a gap of $58,787 that appears to be a '
      + 'reclassification to another class.',
    audience: 'Ram, for the headcount decision.',
    decision: 'Which costs belong to the school, and therefore what a cut would actually '
      + 'save.',
    reuse: 'The commission ledger reconciliation, which is already complete and measured.',
    haveEvidence: '44 months of commission workbooks, a 14-person contractor roster, and '
      + "Ali's own estimate of the salaried team.",
    missingEvidence: 'Gross wages, taxes and benefits per employee, and the class each is '
      + 'booked to.',
    outOfScope: 'Deciding anything about headcount. That is C0.9.',
    artifact: 'The payroll register, plus a note stating which class school payroll was '
      + 'reclassified to and when that started.',
    metric: 'The school\'s true monthly cost base is known to within a few hundred dollars.',
    risk: 'Acting on an estimate. The roster currently in the model is Ali recalling rates '
      + 'from memory, is explicitly labeled as such, and must not be mistaken for this.',
    aliDecides: 'Nothing. The request is sent; this tracks receipt.',
    acceptance: [
      'Register received for Jan to Oct 2026, per employee, with class coding',
      'The class that school payroll was reclassified to is named, with a start date',
      'The $58,787 commission gap is explained or attributed',
      'The estimated roster in the model is replaced by measured figures',
    ],
    deps: 'C0.6', blocks: 'C0.9',
    prompt: 'The request has been sent. On receipt, replace ESTIMATED_ROSTER in '
      + 'turnaroundData.js with measured figures and remove the payroll entry from '
      + 'OPEN_MEASUREMENTS. The guard assertRosterIsLabeledAnEstimate will fail if the '
      + 'estimate is marked measured while the register is still outstanding, which is '
      + 'intentional. Never print or forward individual compensation beyond what the task '
      + 'requires.',
  },
  {
    code: 'C0.11', group: 'governance', priority: 'P1', due: '2026-10-28',
    title: 'Suspend PaySimple schedule 4319082 before the 2 November draft',
    objective: 'Stop a collection that would take money past a settlement already granted.',
    why: 'Fikru Cheklie is closed as Paid Off Early with $12,000 collected, which is '
      + 'exactly the settlement figure. Schedule 4319082 is still Active and has one more '
      + '$1,000 draft queued for 2 November. The October draft already returned NSF.',
    audience: 'Internal. The student, if it fires.',
    decision: 'None. This is a correction.',
    reuse: 'The PaySimple read-only audit path already used for the ISA measurement.',
    haveEvidence: 'The contract is status 11, Paid Off Early. The schedule is Active with '
      + 'an end date of 17 November.',
    missingEvidence: 'Nothing.',
    outOfScope: 'Reviewing other settlements. Worth doing, separately.',
    artifact: 'Confirmation the schedule is suspended, with the date.',
    metric: 'No draft fires on 2 November.',
    risk: 'Collecting past a settlement is the kind of thing that becomes a complaint '
      + 'rather than a ledger entry.',
    aliDecides: 'Confirm the settlement was granted at $12,000, then suspend.',
    acceptance: [
      'Schedule 4319082 shows as suspended or canceled in PaySimple before 2 November',
      'No payment is drafted against Fikru Cheklie after the settlement date',
      'Any other status-11 contract with a live schedule is listed, checked the same way',
    ],
    deps: '', blocks: '',
    prompt: 'Read-only verification first: confirm the contract is status 11 and the '
      + 'settlement total. Then suspend the schedule through PaySimple. Also enumerate '
      + 'every other Paid Off Early contract that still carries an Active schedule, '
      + 'because if this one slipped through, others may have too.',
  },
  /* ── protect the book ─────────────────────────────────────────────────── */
  {
    code: 'C6.11', group: 'campaigns', priority: 'P1', due: '2026-11-07',
    title: 'Retention offer to the 124 legacy subscribers, before any sunset announcement',
    objective: 'Keep the book that funds the company paying, by giving subscribers '
      + 'somewhere to go before they hear their program is ending.',
    why: 'THIS IS THE HIGHEST-VALUE ACTION IN THE TURNAROUND PLAN. 124 live schedules '
      + 'produce about $13,877 a month realized, roughly four times the entire new '
      + 'business. On paper the book runs into 2028, but schedule end dates are the wrong '
      + 'risk model: a subscription book does not expire, it cancels. It is protected by '
      + 'subscribers believing they still receive something. "The program is ending" with '
      + 'no offer attached is a cancellation notice we wrote ourselves.',
    audience: '124 existing paying subscribers, mostly on $250 a month.',
    decision: 'What they are offered, and at what price, to move into the AI membership.',
    reuse: 'The existing membership and the campaign engine. No new product.',
    haveEvidence: 'The full schedule book, amounts, and the 46.3% realization rate.',
    missingEvidence: 'What these subscribers currently believe they receive.',
    outOfScope: 'The teach-out notice itself, which is C9.14 and must come AFTER this.',
    artifact: 'An approved retention offer and the segmented list it goes to.',
    metric: 'Cancellations do not spike in the month following the teach-out notice.',
    risk: 'Sending this and the sunset notice in the wrong order, or close enough together '
      + 'that they read as one message.',
    aliDecides: 'The offer, the price, and the wording. Nothing sends without approval.',
    acceptance: [
      'Every one of the 124 schedules is segmented and accounted for',
      'An offer exists that a subscriber can act on without talking to anyone',
      'The send date is BEFORE the C9.14 teach-out notice, verifiably',
      'Nothing is sent until Ali approves the copy',
    ],
    deps: 'C0.7', blocks: 'C9.14',
    prompt: 'Segment the 124 live schedules by plan, amount and payment health. Draft the '
      + 'retention offer. Do not send anything. The ordering against C9.14 is the point of '
      + 'this ticket: the turnaround model carries a guard asserting the retention date '
      + 'precedes the notice date, and the same ordering must hold in reality.',
  },
  /* ── stop the leaks ───────────────────────────────────────────────────── */
  {
    code: 'C2.8', group: 'pricing', priority: 'P1', due: '2026-11-07',
    title: 'Correct the advertised price and move every monthly member onto autopay',
    objective: 'Stop two leaks on the only engine that earns anything.',
    why: 'The site advertises $149 "cancel anytime" in roughly 70 places. The '
      + 'month-to-month rate is $199 and $149 is the committed rate, so every new '
      + 'month-to-month member is sold at a 25% discount nobody chose to offer, on a price '
      + 'advertised under TWC rules. Separately, new checkouts create one-time payments '
      + 'rather than recurring schedules, so only 12 of 24 monthly members are on autopay '
      + 'and the rest are re-collected by hand every month.',
    audience: 'Prospective and existing members.',
    decision: 'None on price. This is a correctness fix, not a pricing change.',
    reuse: 'The frontend copy-lint ratchet already tracks the banned-word surface.',
    haveEvidence: 'The copy baseline and the subscription service header comment, which '
      + 'documents the one-time-payment behavior itself.',
    missingEvidence: 'Nothing.',
    outOfScope: 'Changing what we charge. Only what we advertise and how we collect it.',
    artifact: 'A merged PR and a production-verified price, plus a migration report.',
    metric: 'Autopay coverage reaches every monthly member; no page quotes $149 as the '
      + 'month-to-month rate.',
    risk: 'Migrating a member onto a schedule at the wrong amount, or double-charging '
      + 'during the migration.',
    aliDecides: 'Confirm $199 month-to-month and $149 committed is correct before the '
      + 'copy changes ship.',
    acceptance: [
      'No page advertises $149 as the month-to-month rate',
      'Every active monthly member is on a recurring schedule',
      'New checkouts create a schedule, verified on a live test checkout',
      'No member is charged twice during the migration',
    ],
    deps: 'C0.6', blocks: '',
    prompt: 'Two workstreams, one ticket because they share the same surface. Fix the copy '
      + 'via the existing ratchet so it cannot regress. Then change checkout to create a '
      + 'recurring schedule and migrate the existing one-time payers. Idempotency is the '
      + 'acceptance criterion that matters: running the migration twice must not charge '
      + 'anyone twice.',
  },
  {
    code: 'C5.11', group: 'website', priority: 'P1', due: '2026-11-14',
    title: 'Put a paywall between the free Explorer tier and the paid curriculum',
    objective: 'Give the free tier something to convert into.',
    why: '396 explorers are served the entire curriculum today. There is nothing material '
      + 'to upgrade to, which caps conversion structurally no matter what is spent on '
      + 'acquisition, and it is why the pool converts at roughly one in eighteen. The free '
      + 'tier is not a funnel into the product. It is the product, given away.',
    audience: '396 current explorers and every future one.',
    decision: 'Where the line sits: what stays free and what moves behind the wall.',
    reuse: 'The existing entitlement concept, which exists in code and has never gated a '
      + 'real viewer.',
    haveEvidence: 'Explorer counts, conversion rate, and the curriculum structure.',
    missingEvidence: 'Which content actually drives conversion, which only a change will '
      + 'reveal.',
    outOfScope: 'Repricing. The wall decides what is included, not what it costs.',
    artifact: 'A deployed paywall with the free and paid boundary documented.',
    metric: 'Explorer-to-paid conversion, measured before and after.',
    risk: 'Drawing the line too high and suppressing the top of funnel. It is tunable, '
      + 'which is why this is reversible, but it should be watched for a fortnight.',
    aliDecides: 'The boundary. Everything else is implementation.',
    acceptance: [
      'An explorer cannot reach the paid curriculum without paying',
      'The free tier still delivers enough to be worth signing up for',
      'The boundary is documented so support can answer "why can I not see this"',
      'Conversion is instrumented before the change ships, so the effect is measurable',
    ],
    deps: '', blocks: '',
    prompt: 'The entitlement concept already exists and has never been exercised against a '
      + 'real viewer. Use it rather than building a second one. Instrument conversion '
      + 'BEFORE shipping, or the change cannot be evaluated. Ali picks the boundary; bring '
      + 'him a proposal with the content split, not a blank question.',
  },
  /* ── the transition ───────────────────────────────────────────────────── */
  {
    code: 'C9.13', group: 'launch', priority: 'P1', due: '2026-11-05',
    title: 'Confirm the November AI cohort starts on 12 November as scheduled',
    objective: 'Settle, explicitly, that the sunset date applies to Data Analytics and not '
      + 'to the cohort replacing it.',
    why: 'THIS CONFLICTS WITH THE BRIEF AS WRITTEN. "End the class by the end of the year" '
      + 'is right for Data Analytics. The November AI cohort has 37 active learners, 12 of '
      + 'whom have paid, and starts on 12 November, so it does not finish in December. '
      + 'Canceling it to hit a calendar date would refund the only new revenue in the '
      + 'building and remove the delivered-cohort proof that every 2027 institutional sale '
      + 'depends on.',
    audience: '37 enrolled learners, and Ram.',
    decision: 'Go or no-go on the 12 November start.',
    reuse: 'The cohort is already built, enrolled and scheduled.',
    haveEvidence: 'Enrollment and payment state for all 37, measured in production.',
    missingEvidence: 'Nothing.',
    outOfScope: 'The Data Analytics teach-out, which is C9.14.',
    artifact: 'A written go or no-go, and if go, the confirmed start communication.',
    metric: 'The cohort starts and completes with its enrollment intact.',
    risk: 'IRREVERSIBLE. Canceling means refunds, reputational damage among 37 people, and '
      + 'no delivered cohort to point at in 2027.',
    aliDecides: 'This one is Ram and Ali jointly.',
    acceptance: [
      'A written decision exists, dated, with the reasoning',
      'If go, all 37 learners have been told the start is confirmed',
      'If no-go, a refund and communication plan exists before anyone is told',
    ],
    deps: '', blocks: 'C9.14',
    prompt: 'Bring the decision, not the analysis. The enrollment and payment state is '
      + 'already measured. The single question is whether the 12 November start holds, and '
      + 'it needs answering before the teach-out notice goes out, because the two messages '
      + 'will be read together by anyone who receives both.',
  },
  {
    code: 'C9.14', group: 'launch', priority: 'P1', due: '2026-11-21',
    title: 'Publish the dated Data Analytics teach-out plan',
    objective: 'Close a fourteen-year program without damaging the book that funds the '
      + 'company.',
    why: 'The sunset is correct. How it is communicated decides whether the legacy '
      + 'subscribers keep paying, because they are the same people. This must land AFTER '
      + 'the C6.11 retention offer, so that everyone who hears "the program is ending" has '
      + 'already been offered somewhere to go.',
    audience: 'Every remaining Data Analytics learner and the 124 legacy subscribers.',
    decision: 'The close-out date, what each learner still receives, and what subscribers '
      + 'keep.',
    reuse: 'The retention offer from C6.11.',
    haveEvidence: 'The subscription book and its payment health.',
    missingEvidence: 'The count of learners still mid-program, which lives in CCPP.',
    outOfScope: 'The retention offer itself.',
    artifact: 'A published teach-out plan with dates, and the communication sent.',
    metric: 'Cancellations in the following month, against the prior baseline.',
    risk: 'IRREVERSIBLE. This directly addresses the one asset still producing cash, and a '
      + 'badly worded version of it is the single fastest way to lose the runway.',
    aliDecides: 'The wording, the dates, and what is promised. Nothing sends without him.',
    acceptance: [
      'Every remaining learner has a dated close-out they have acknowledged',
      'The notice goes out AFTER the C6.11 retention offer, verifiably',
      'Subscribers are told what they keep, not only what is ending',
      'Cancellation rate is measured for 30 days after',
    ],
    deps: 'C6.11, C9.13', blocks: '',
    prompt: 'Sequencing is the acceptance criterion. Confirm C6.11 has actually landed '
      + 'before drafting the send. Count the learners still mid-program from CCPP first, '
      + 'because the plan has to say something true to each of them. Draft only; Ali sends.',
  },
  {
    code: 'C0.9', group: 'governance', priority: 'P2', due: '2026-11-30',
    title: 'Take the headcount decision on the fixed-versus-variable split',
    objective: 'Right-size the cost base once, deliberately, rather than across the board.',
    why: 'On the measured side there is very little left to cut. Commission has fallen 78% '
      + 'since 2023, from $27,690 a month across 40 to 50 people to $6,175 across 14. '
      + 'Teaching and TA reached zero in August with nobody dismissed, because the classes '
      + 'ended. Of the $5,750 that remains, $3,500 is ten mentor retainers, and those '
      + 'mentors support the learners inside the book that pays four times their cost. '
      + 'Most of the team is in India or Indonesia, so a headcount cut saves far less per '
      + 'person than the org chart implies while costing the same capability.',
    audience: 'Ram.',
    decision: 'Who, if anyone, and in what order relative to the book they support.',
    reuse: 'The commission reconciliation and the fixed-versus-variable split, both done.',
    haveEvidence: 'A 14-person contractor roster with per-person cost and a 44-month trend.',
    missingEvidence: 'The W2 payroll register. Until C0.8 lands, the salaried side is '
      + 'invisible and no decision on it can be made on evidence.',
    outOfScope: 'Any decision on the salaried side before C0.8 is received.',
    artifact: 'A written decision with its reasoning, and if there are cuts, a sequenced '
      + 'plan against the receivable book.',
    metric: 'Monthly cost base after the decision, against the book it has to support.',
    risk: 'HIGHEST IN THE PLAN AND IRREVERSIBLE. People do not come back, and cutting ten '
      + 'mentors to save $3,500 could strand $13,877 a month in collections.',
    aliDecides: 'Ram decides. Ali supplies the split and the sequencing.',
    acceptance: [
      'The decision is taken once, in writing, with the evidence attached',
      'No salaried decision is taken before the C0.8 register is in hand',
      'Any mentor reduction is sequenced against the subscription book, not independent of it',
      'The fixed and per-session components are treated separately, not as one number',
    ],
    deps: 'C0.8, C6.11', blocks: '',
    prompt: 'Do not bring options without the register. The measured contractor side is '
      + 'already complete and says there is little left to cut; the salaried side is the '
      + 'real question and it is blocked on C0.8. If the register has not arrived by the '
      + 'due date, say so and move the date rather than deciding on an estimate.',
  },
  /* ── the 2027 motion ──────────────────────────────────────────────────── */
  {
    code: 'C6.12', group: 'campaigns', priority: 'P2', due: '2027-01-15',
    title: 'Name the first ten target institutions for the seat-block motion',
    objective: 'Commit to the beachhead and give the institutional motion a target list.',
    why: 'Sixteen seat-block deals at 500 seats carry 80% of the 10,000-learner target and '
      + 'no other channel comes close. Selling 100 companies 100 seats is a motion this '
      + 'company has run for fourteen years; selling 10,000 individuals one at a time is '
      + 'not, and October produced one new paying subscription. C2.5 already names higher-'
      + 'education continuing education as the beachhead.',
    audience: 'Continuing-education deans and workforce directors.',
    decision: 'Which ten, and who owns the first conversation.',
    reuse: 'The Apollo and campaign engine, and the C2.5 beachhead work.',
    haveEvidence: 'The segment is already chosen. The economics are modeled.',
    missingEvidence: 'A reference customer. There is none, which is why deal one is the '
      + 'entire risk.',
    outOfScope: 'Hiring a seller. That is C2.9 and it sits deliberately after proof.',
    artifact: 'A named list of ten institutions with a contact and a reason for each.',
    metric: 'First meetings booked, then first signed seat block.',
    risk: 'A wrong segment costs two quarters, not the company.',
    aliDecides: 'The list and the sequencing.',
    acceptance: [
      'Ten institutions named, each with a verified contact and a stated reason',
      'The offer they would be sold is written down, with the seat price',
      'No contact data is invented; Apollo or a verified source only',
    ],
    deps: 'C2.5', blocks: 'C2.9',
    prompt: 'Use Apollo for contact data and never guess an email address. The offer has '
      + 'to exist in writing before the list is useful: 500-seat blocks at $300 a seat is '
      + 'the modeled shape, and it needs validating against what a continuing-education '
      + 'budget actually looks like.',
  },
  {
    code: 'C2.9', group: 'pricing', priority: 'P3', due: '2027-02-28',
    title: 'Decide whether to fund an enterprise seller',
    objective: 'Match the institutional target to the selling capacity that exists.',
    why: 'Sixteen block deals in twenty-four months is one closed every six weeks. That is '
      + 'a job. The honest alternative is a smaller target, not the same target with nobody '
      + 'selling it. This sits after the first reference deal on purpose: funding a seller '
      + 'against an unproven motion is how a small company spends a quarter of runway on a '
      + 'hypothesis.',
    audience: 'Ram.',
    decision: 'Fund the role, or restate the target at founder speed.',
    reuse: 'Nothing. This is a hiring decision.',
    haveEvidence: 'The scale model and what one deal is worth.',
    missingEvidence: 'A close rate, which only exists after deal one.',
    outOfScope: 'Hiring before a reference customer exists.',
    artifact: 'A written decision with the target restated to match it.',
    metric: 'Deals closed per quarter after the decision.',
    risk: 'A real cost against an unproven motion, which is why the sequencing matters '
      + 'more than the decision.',
    aliDecides: 'Ram.',
    acceptance: [
      'The decision references an actual close rate from at least one completed deal',
      'If no seller is funded, the 10,000 target is restated to match founder capacity',
    ],
    deps: 'C6.12', blocks: '',
    prompt: 'Do not bring this before a reference deal exists. If the due date arrives and '
      + 'deal one has not closed, the correct output is a restated target, not a hire.',
  },
  {
    code: 'C0.10', group: 'governance', priority: 'P2', due: '2027-03-31',
    title: 'Cap government contracts to one owner and a fixed budget',
    objective: 'Stop an unproven channel consuming the attention the institutional motion '
      + 'needs.',
    why: 'Government contracts have zero submissions, zero contracts and zero revenue in '
      + 'the system. The one real bid, DOL AI Literacy via Essnova, was lost. Three '
      + '"proposals" describe themselves in their own descriptions as rehearsals that '
      + 'assume a SOC 2 we do not hold. It feels like current business because of its large '
      + 'Basecamp footprint, and that is exactly what makes it expensive to keep believing '
      + 'in. The realistic first dollar is Q3 2027, as an Essnova subcontract.',
    audience: 'Internal.',
    decision: 'The owner, the budget, and the explicit exclusion from the 2027 revenue plan.',
    reuse: 'The existing Gov Contracts project structure, which stays as a training and '
      + 'option-value apparatus.',
    haveEvidence: 'A full inventory: submissions, contracts, qualifications, bid outcomes.',
    missingEvidence: 'Nothing.',
    outOfScope: 'Shutting it down. This caps it; it does not kill it.',
    artifact: 'A written cap with a named owner and a budget figure.',
    metric: 'Hours and dollars spent on gov work per month, against the cap.',
    risk: 'Low to cap. High to leave uncapped, because focus is the scarcest input here.',
    aliDecides: 'The owner and the number.',
    acceptance: [
      'One named owner',
      'A budget in dollars and hours per month',
      'Government revenue appears nowhere in the 2027 plan',
      'The SOC 2 and set-aside dependencies are stated as the gate they are',
    ],
    deps: 'C7.0', blocks: '',
    prompt: 'This is a governance decision, not an analysis task. The inventory is already '
      + 'done and is in the turnaround plan. Write the cap, get it agreed, and make sure '
      + 'the 2027 revenue model has no government line in it.',
  },
  {
    code: 'C9.15', group: 'launch', priority: 'P3', due: '2027-06-30',
    title: 'Go or no-go on the 10,000-learner target against measured conversion',
    objective: 'Hold the target if the evidence supports it, and restate it publicly if it '
      + 'does not.',
    why: 'By mid-2027 there will be real numbers for seat-block close rate and self-serve '
      + 'conversion. A target nobody believes is worse than a smaller one everybody does, '
      + 'and the current gap is large: 10,000 over 24 months is 417 learners a month, '
      + 'against a best month ever of 63 and an October of one.',
    audience: 'The team, and any partner the target has been quoted to.',
    decision: 'Hold, restate, or extend.',
    reuse: 'The scale model, which already states what each channel must deliver.',
    haveEvidence: 'The model and the channel mix.',
    missingEvidence: 'Measured close and conversion rates, which accrue between now and '
      + 'then.',
    outOfScope: 'Abandoning the ambition. This is about the number and the date.',
    artifact: 'A written decision with the measured rates it rests on.',
    metric: 'Whether the restated target is subsequently met.',
    risk: 'Low if taken on evidence, high if deferred indefinitely.',
    aliDecides: 'Ram and Ali jointly.',
    acceptance: [
      'The decision cites measured seat-block close rate and self-serve conversion',
      'If the target changes, everyone it was quoted to is told',
    ],
    deps: 'C6.12', blocks: '',
    prompt: 'Measure first. The decision is only worth taking if the two rates are real by '
      + 'then; if they are not, the honest output is that the experiment has not run long '
      + 'enough, with a new date.',
  },
];

/** The standard context-question block every ticket in this project carries. */
function contextQuestions(t) {
  return [
    ['Why does this task exist now?', t.why],
    ['What business hypothesis does it test or strengthen?',
      'That the business survives the sunset and replaces the legacy book.'],
    ['Who is the target audience or economic buyer?', t.audience],
    ['What decision should this artifact enable?', t.decision],
    ['What current platform capability should be reused rather than rebuilt?', t.reuse],
    ['What evidence already exists?', t.haveEvidence],
    ['What evidence is missing?', t.missingEvidence],
    ['What outside research is required?', 'None beyond what is named above.'],
    ['What is explicitly out of scope?', t.outOfScope],
    ['What is the exact artifact that must exist when this task is done?', t.artifact],
    ['Where will the artifact live?', FOLDERS[t.group]],
    ['If the artifact is a website/platform surface, what route and production URL should exist?',
      t.group === 'website' ? 'The affected routes must be production-verified.'
        : 'Not a website surface.'],
    ['What metric tells us this task was commercially useful?', t.metric],
    ['What could make the work misleading or untrustworthy?', t.risk],
    ['What does Ali need to personally review or decide?', t.aliDecides],
  ];
}

const esc = (s) => String(s)
  .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');

/** Render one ticket body in the project's house format. */
function renderBody(t) {
  const folder = FOLDERS[t.group];
  return [
    '<div>Source of truth: COMMERCIALIZATION MASTER INDEX - read this before working the '
      + 'ticket.</div>',
    `<div>Canonical folder for this ticket's artifact: ${esc(folder)} - upload once here, `
      + 'then link. Never re-upload into another folder.</div>',
    '<div>Initiative folders: AI Capability Commercialization Initiative</div>',
    `<div>Initiative: AI Capability Commercialization &middot; Task ID: ${esc(t.code)} `
      + `&middot; Priority: ${esc(t.priority)} &middot; Due: ${esc(t.due)} &middot; `
      + 'Human approver: Ali &middot; Execution mode: '
      + `${t.group === 'website' || t.group === 'pricing' ? 'Build' : 'Document'}</div>`,
    '<div>Required skill: /loop-architect if the work becomes multi-step</div>',
    `<div>Dependencies: ${esc(t.deps || 'none')} &middot; Blocks: ${esc(t.blocks || 'none')}</div>`,
    '<br>',
    `<div><strong>OBJECTIVE</strong></div><div>${esc(t.objective)}</div>`,
    '<br>',
    '<div><strong>CONTEXT QUESTIONS</strong></div>',
    '<ul>' + contextQuestions(t).map(([q, a]) =>
      `<li><strong>${esc(q)}</strong> ${esc(a)}</li>`).join('') + '</ul>',
    '<div><strong>CLAUDE CODE EXECUTION PROMPT</strong></div>',
    `<div>${esc(t.prompt)}</div>`,
    '<br>',
    '<div><strong>ACCEPTANCE CRITERIA</strong></div>',
    '<ul>' + t.acceptance.map((a) => `<li>${esc(a)}</li>`).join('') + '</ul>',
    `<div><strong>ARTIFACT:</strong> ${esc(t.artifact)}</div>`,
    `<div><strong>ARTIFACT LOCATION:</strong> ${esc(folder)}</div>`,
    '<br>',
    '<div><strong>REVIEW STATE (set exactly one at end of execution, then stop)</strong></div>',
    '<div>BLOCKED - ALI DECISION REQUIRED &middot; READY FOR ALI REVIEW - DOCUMENT &middot; '
      + 'READY FOR ALI REVIEW - PR OPEN &middot; READY FOR ALI REVIEW - PROD VERIFIED</div>',
    '<div>Never auto-close this ticket. Ali closes it after validating the artifact.</div>',
  ].join('');
}

/* ── assertions ───────────────────────────────────────────────────────────── */

/** No code may collide with one already in the list, and each group must exist. */
function assertCodesAreFreeAndGroupsExist(inUse) {
  for (const t of TICKETS) {
    if (inUse && inUse.includes(t.code)) {
      throw new Error(`turnaround tickets: ${t.code} is already in use in the project`);
    }
    if (!GROUPS[t.group]) throw new Error(`turnaround tickets: ${t.code} has no group`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(t.due)) {
      throw new Error(`turnaround tickets: ${t.code} has no usable due date`);
    }
    if (!/^P[123]$/.test(t.priority)) {
      throw new Error(`turnaround tickets: ${t.code} has priority "${t.priority}"`);
    }
  }
  return TICKETS.length;
}

/**
 * The retention offer must be dated before the teach-out notice, here too.
 *
 * The plan enforces this ordering and so does the model. If the tickets disagree with
 * both, the tickets are what people will actually work from, so they are what would hurt.
 */
function assertRetentionPrecedesTeachOut() {
  const r = TICKETS.find((t) => t.code === 'C6.11');
  const n = TICKETS.find((t) => t.code === 'C9.14');
  if (!(r.due < n.due)) {
    throw new Error(`turnaround tickets: retention (${r.due}) must precede the teach-out `
      + `notice (${n.due}). Reversed it is a cancellation notice.`);
  }
  if (!/C6\.11/.test(n.deps)) {
    throw new Error('turnaround tickets: C9.14 must declare C6.11 as a dependency');
  }
  return { retention: r.due, notice: n.due };
}

/** Every ticket must carry the full scaffold, not a shortened one. */
function assertBodiesAreComplete() {
  const required = ['Source of truth', 'Canonical folder', 'OBJECTIVE', 'CONTEXT QUESTIONS',
    'CLAUDE CODE EXECUTION PROMPT', 'ACCEPTANCE CRITERIA', 'ARTIFACT LOCATION',
    'REVIEW STATE'];
  for (const t of TICKETS) {
    const body = renderBody(t);
    for (const r of required) {
      if (!body.includes(r)) {
        throw new Error(`turnaround tickets: ${t.code} is missing the "${r}" section. `
          + 'A thin ticket is the thing this file exists to prevent.');
      }
    }
    if (t.acceptance.length < 2) {
      throw new Error(`turnaround tickets: ${t.code} has fewer than two acceptance criteria`);
    }
  }
  return TICKETS.length;
}

module.exports = {
  GROUPS, FOLDERS, TICKETS, renderBody,
  assertCodesAreFreeAndGroupsExist, assertRetentionPrecedesTeachOut, assertBodiesAreComplete,
};
