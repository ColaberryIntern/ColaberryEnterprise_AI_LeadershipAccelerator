/**
 * C3.2's FAQ, selected from C2.6's sixteen objections.
 *
 * Not all sixteen. These are the seven an ANTHROPIC audience would raise, which is a different
 * set from the ones a customer raises: a lab asks whether the thing is built and whether the
 * agents are safe, not whether it beats a Coursera subscription.
 *
 * `never` is carried through deliberately. It is the line a person must NOT say when answering,
 * and it is more useful in a live meeting than the answer itself.
 *
 * RESERVED holds the three C2.6 answers still reserved to Ali. They are printed in the bundle as
 * open, not answered, because answering them in a room would commit the company to a position it
 * has not taken. They gate any pilot; they do not gate this meeting, whose ask is a demo.
 */

/** The seven a lab audience raises. */
const FAQ = [
  {
    n: 2, theme: 'Build versus buy',
    q: 'Anthropic is funding exactly this at Accenture, Bain, Capgemini, Deloitte and McKinsey. Why back you instead?',
    a: 'That is the real competitive question and it has a date on it. By early 2027 those five firms will have individually credentialed deployment engineers, paid for by Anthropic. What they will have is credentialed consultants they rent back to you. What we build is capability inside your own staff, in your own repositories, that stays when the engagement ends.',
    why: 'C1.2 flagged this as the warning to put in front of everything else and sized the window at about one quarter. Pretending it is not happening is how the meeting is lost.',
    never: 'Never claim competitors lack individual evidence as though it were durable. C1.2 says that window is roughly one quarter wide.',
  },
  {
    n: 6, theme: 'The product',
    q: 'You keep saying "verified". Verified by whom, against what?',
    a: 'Against a commit, mechanically, with no human judgment in the loop. A story is done when every acceptance criterion is ticked AND a commit names that story and changes at least one file. Both are required and neither is sufficient. Ticking boxes does not complete a story and an unrelated commit does not either. Evidence is pinned to a specific commit; evidence from an earlier commit is marked stale rather than counted, and a check that did not run is shown as not run, never as a pass.',
    why: 'This is the whole differentiator and it has to survive a technical evaluator. The rule is enforced in code, so it is demonstrable rather than assertable.',
    never: 'Never say a human reviews every story. The rule is mechanical, and claiming human review invites a question about reviewer capacity that we would fail.',
  },
  {
    n: 7, theme: 'The product',
    q: 'Nobody else does commit-level verification. Does that not tell you nobody wants it?',
    a: 'It is the best question in the deck and it has a documented answer. Pluralsight, the best capitalized technical skills vendor in the field, bought exactly this capability as GitPrime for $170 million in 2019 and renamed it Pluralsight Flow. They sold it to Appfire in February 2025. Renewals ended 30 June 2026 and it reaches end of life on 31 December 2027. The category did not overlook commit-level proof. It bought it, held it six years, and retreated from it.',
    why: '"Nobody does this" invites the reply that nobody wants it. "The category is retreating from it, and here are the dates" does not. Across twenty organizations, repository evidence scored 0 of 20, with 17 of those affirmative noes rather than unknowns.',
    never: 'Never claim we are the only company that could do this. The claim is that no one currently does, with dates, which is checkable.',
  },
  {
    n: 8, theme: 'The product',
    q: 'How much of this is actually built, and how much is a slide?',
    a: 'Of 24 capabilities audited against the production database and the running containers on 8 October 2026: 10 are live, 9 are built but switched off, 4 are designed only and 1 is roadmap. Every one carries the query or the container variable that produced the classification and the date it was read. We will show you the audit.',
    why: 'The acceptance criteria require this answer to match C0.5 exactly. It is reproduced here verbatim and must not be rounded, softened or re-counted in a meeting.',
    never: 'Never describe a built-but-dark capability as live. Nine of the 24 are in that state and the distinction is the entire credibility of the answer.',
  },
  {
    n: 9, theme: 'The product',
    q: 'Your first cohort has not finished. Why should we go first?',
    a: 'It has not, and the number we publish says so: 0 of 46 Demo Day tasks are complete for cohort one, which is in its final stretch. What has already happened is the part that matters to you. 322 stories have been verified against real commits across live learner projects, and 13 case studies are published and publicly readable. You are not betting on whether the method produces evidence. You are betting on whether a first cohort finishes on schedule.',
    why: 'Volunteering the weakest number buys the right to be believed on the others. The buyer will find it anyway.',
    never: 'Never source the Demo Day figure to the platform. No demo table exists in the database, so it is a Basecamp figure and must be labeled as one. Never print the story count without its date; it moves.',
  },
  {
    n: 10, theme: 'Governance and security',
    q: 'You run AI agents against our work. What stops them doing something we did not approve?',
    a: 'Architecture, not policy. 255 of our 257 agents sit at autonomy level "observe". Exactly two are at "communicate". The fleet watches and records; it does not act. Every agent write is audited. Across the last seven days the fleet ran 161,642 executions at a measured 99.8% success rate, with 124 agents active in the last 24 hours.',
    why: 'An enterprise buyer is nervous about autonomy, so the honest constraint is the selling point. C0.5 put it plainly: we can sell this as governance maturity, we cannot sell it as autonomy.',
    never: 'Never call the agent fleet autonomous. CLM-009 prohibits it outright. Never say Cora replies to anything; she is in shadow mode. CLM-010.',
  },
  {
    n: 11, theme: 'Governance and security',
    q: 'What happens to our code and our data?',
    a: 'Learners build in a repository they own, under your organization if you want it there. The runner that executes their work holds no production credentials and runs against a pinned commit. We do not need access to your production systems to teach someone to build for them.',
    why: 'The scariest version of this objection is "will your platform touch production", and the answer is architecturally no rather than contractually no.',
    never: 'Never claim a specific compliance certification. We hold none. SOC 2 is not a federal requirement but it does gate hosted products with some buyers, and C7.7 owns that gap. Say what is true about the architecture, not about an audit we have not had.',
  },
];

/** Still Ali's. Do not answer these in the room. */
const RESERVED = [
  {
    n: 14, theme: 'Reserved for Ali',
    q: 'Who owns the intellectual property in what our people build?',
    a: 'PROPOSED, NOT SETTLED. Recommended position: the learner and the sponsoring employer own the work product and the repository; Colaberry retains no rights to it and claims no license. Colaberry owns the platform, the curriculum and the verification method. We ask only for permission to reference the engagement by name, granted separately and revocably, never bundled into the main agreement.',
    why: 'The ticket records that the legal position on IP ownership does not yet exist, and names it as a decision Ali must make personally. This is a drafting recommendation for counsel, not an answer a salesperson may give yet.',
    never: 'Do not answer this in a live meeting until Ali has signed it off. Say that it is addressed in the agreement and route it to C7.3.',
  },
  {
    n: 15, theme: 'Reserved for Ali',
    q: 'If what our people build breaks in production, whose problem is that?',
    a: 'PROPOSED, NOT SETTLED. Recommended position: the employer owns deployment and operation. We teach, verify and evidence the build; we do not deploy to your production and the runner holds no production credentials, which already makes this true architecturally. The agreement should say so explicitly rather than rely on that.',
    why: 'The ticket records the legal position as missing and reserves it to Ali. The architectural fact is defensible today; the liability position is not ours to state.',
    never: 'Never accept production responsibility in conversation, and never imply we operate what learners build.',
  },
  {
    n: 16, theme: 'Reserved for Ali',
    q: 'You are built around Claude. We are a Microsoft shop. What happens when we switch?',
    a: 'PROPOSED, NOT SETTLED. Recommended position: the method is model-neutral and the current implementation is not. The pipeline, the commit rule and the evidence trail do not depend on which model writes the code; the build labs currently use Claude Code specifically. What we should not do is claim portability we have not built and cannot demonstrate.',
    why: 'Reserved to Ali because it is a positioning commitment with engineering cost attached, not a sales answer. Claiming neutrality we cannot demonstrate is the kind of confident answer this ticket exists to prevent.',
    never: 'Never claim the platform is model-agnostic today. No evidence supports it and a technical evaluator will ask for a demonstration.',
  },
];

module.exports = { FAQ, RESERVED };
