"""Add Ali's headcount estimate to the model, fenced off from the measured figures.

This is the first visibility into the cost the school P&L hides. It is also the least
reliable data in the whole model: Ali gave rates from memory, hedged several of them in
his own words, and said the web team is only partially billed to the school. So it gets
its own block, its own guard, and a label that cannot be removed without the build
failing.
"""
import io

p = 'scripts/artifacts/tickets/turnaroundData.js'
s = io.open(p, encoding='utf-8').read()

anchor = "/* ── what remains unmeasured ──"

block = '''/* ── the roster, ESTIMATED by Ali, not measured ───────────────────────────── */

/**
 * Ali's own estimate of who is on the team and what they cost, given 22 October 2026.
 *
 * THIS IS NOT THE PAYROLL REGISTER AND MUST NEVER BE PRESENTED AS ONE. Ali supplied these
 * from memory and hedged several of them in his own words. It is here because it is the
 * first visibility into the cost the school P&L hides, and because the shape of it - a
 * largely offshore team with four US salaries on top - changes what a cost decision even
 * looks like. It is not here to be added up and acted on.
 *
 * TWO THINGS MAKE EVERY TOTAL BELOW SOFT. Hours are assumed, because Ali gave rates and
 * not hours; and allocation is unknown, because the web team is "only partially billed to
 * the school" and nobody has said what the split is. A number that is wrong in both its
 * quantity and its allocation is a direction, not a figure.
 */
const ESTIMATED_ROSTER = {
  estimatedBy: 'Ali, from memory, 2026-10-22',
  measured: false,
  assumedHoursPerMonth: 160,
  people: [
    { who: 'Ali', where: 'US', basis: 'salary', annual: 100000, confidence: 'stated' },
    { who: 'Kes', where: 'US', basis: 'salary', annual: 50000, confidence: 'stated' },
    { who: 'Jackie', where: 'US', basis: 'salary', annualLow: 40000, annualHigh: 50000,
      confidence: 'range' },
    { who: 'Taiwo', where: 'US', basis: 'salary', annualLow: 40000, annualHigh: 50000,
      confidence: 'range' },
    { who: 'Farhat', where: 'US', basis: 'hourly', hourly: 10, role: 'support',
      confidence: 'approximate' },
    { who: 'Dhee', where: 'India', basis: 'hourly', hourly: 7, role: "Ali's assistant",
      confidence: 'approximate' },
    { who: 'Rob', where: 'Indonesia', basis: 'hourly', hourly: 8, confidence: 'approximate' },
    { who: 'Rose', where: 'Indonesia', basis: 'hourly', hourly: 8, partTime: true,
      confidence: 'hedged - Ali said do not quote him on the location' },
  ],
  // Named, but with no rate given. They are the reason the total below is a floor.
  noRateGiven: [
    { who: 'Swati', where: 'India' },
    { who: 'Bala', where: 'India', role: 'support', note: 'two people share this name' },
    { who: 'Aleem', where: 'India' },
    { who: 'Web team', where: 'India', note: 'ONLY PARTIALLY billed to the school' },
    { who: 'Marketing team', where: 'offshore',
      note: 'Ali estimates the equivalent of $5/hr or less; headcount not stated' },
  ],
  whyOffshoreMatters: 'Most of the team is in India or Indonesia, which is why a '
    + 'fourteen-person organization does not cost what a fourteen-person US organization '
    + 'would. It also means a headcount cut saves far less per person than the org chart '
    + 'suggests, while costing the same amount of capability.',
  src: 'Ali, 2026-10-22, estimates not records',
};

/**
 * A floor, not a total. Everything about it is soft and the name should keep saying so.
 */
function estimatedMonthlyPeopleFloor() {
  const r = ESTIMATED_ROSTER;
  let monthly = 0;
  for (const p of r.people) {
    if (p.basis === 'salary') {
      const annual = p.annual != null ? p.annual : (p.annualLow + p.annualHigh) / 2;
      monthly += annual / 12;
    } else {
      monthly += p.hourly * r.assumedHoursPerMonth * (p.partTime ? 0.5 : 1);
    }
  }
  return {
    monthly: Math.round(monthly),
    counted: r.people.length,
    uncounted: r.noRateGiven.length,
    note: 'A FLOOR. Excludes ' + r.noRateGiven.length + ' named people or teams with no '
      + 'rate given, and assumes full allocation to the school, which is known to be wrong.',
  };
}

/**
 * This estimate may never be dressed up as the payroll register.
 *
 * The whole reason the register is being requested is that nobody can currently see
 * salaried cost. If this block ever loses its `measured: false`, the plan would be
 * presenting a CEO's recollection as accounting, which is precisely the failure the
 * request is meant to end.
 */
function assertRosterIsLabeledAnEstimate() {
  if (ESTIMATED_ROSTER.measured !== false) {
    throw new Error('turnaround: the roster is marked measured. It is Ali recalling rates, '
      + 'not a payroll register, and the register is still outstanding.');
  }
  if (!/estimates not records/i.test(ESTIMATED_ROSTER.src)) {
    throw new Error('turnaround: the roster source no longer says these are estimates');
  }
  const stillOpen = OPEN_MEASUREMENTS.some((o) => /payroll register/i.test(o.what));
  if (!stillOpen) {
    throw new Error('turnaround: the payroll register left the unknown list while the '
      + 'roster is still an estimate. One of the two is wrong.');
  }
  return estimatedMonthlyPeopleFloor();
}

'''

assert anchor in s
s = s.replace(anchor, block + anchor, 1)

s = s.replace("""  PEOPLE, PNL_GAP, OPEN_MEASUREMENTS,""",
              """  PEOPLE, PNL_GAP, OPEN_MEASUREMENTS,
  ESTIMATED_ROSTER, estimatedMonthlyPeopleFloor, assertRosterIsLabeledAnEstimate,""", 1)

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('roster added as an estimate')
