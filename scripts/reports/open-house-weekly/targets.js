/**
 * C123: the targets that drive the report's conditional formatting. EDIT HERE, nowhere else.
 *
 * Each rate is a percent. `good` and `ok` are the green and amber floors; below `ok` is red. For a rate where lower is
 * better (bounce), set `lowerIsBetter: true` and `good`/`ok` become ceilings.
 *
 * These are starting assumptions set on 11 Nov 2026, the day after launch, NOT benchmarks: re-set them once four weeks
 * of real data exist. A rate whose denominator is under `minSample` people is shown grey ("too few to judge"), never
 * green or red, so one person cannot paint a step.
 */
module.exports = {
  minSample: 5,
  rates: {
    bounce: { label: 'Bounced (left before 25% of the page)', good: 40, ok: 60, lowerIsBetter: true },
    seatClick: { label: 'Visitors who clicked Save my seat', good: 25, ok: 15 },
    formFinish: { label: 'Save my seat clickers who signed up', good: 70, ok: 50 },
    signup: { label: 'Visitors who signed up', good: 20, ok: 10 },
    enter: { label: 'New accounts that entered', good: 70, ok: 40 },
    play: { label: 'Entered who pressed play', good: 80, ok: 50 },
    finish: { label: 'Played who finished the video', good: 50, ok: 30 },
    credit: { label: 'Watched 75%+ who collected the credit', good: 90, ok: 70 },
    check: { label: 'Credit collectors who took the Quick check', good: 70, ok: 40 },
    ace: { label: 'Quick check takers who scored 5/5', good: 70, ok: 50 },
    keepGoing: { label: 'Entered who opened another assignment', good: 40, ok: 20 },
    emailOpen: { label: 'Welcome emails opened', good: 40, ok: 20 },
    emailClick: { label: 'Welcome emails clicked', good: 15, ok: 5 },
  },
};
