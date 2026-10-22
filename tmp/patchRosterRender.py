"""Surface the estimated roster in the HTML, with its caveats impossible to miss."""
import io

p = 'scripts/artifacts/buildTurnaroundPlan.js'
s = io.open(p, encoding='utf-8').read()

anchor = """  <h2>6. Ten thousand learners: what the arithmetic allows</h2>"""

block = """  <h3>What the P&amp;L is almost certainly hiding</h3>

  <div class="callout bad">
    <p style="margin:0 0 8px"><strong>These are estimates from memory, not a payroll
    register, and they are in this document only to show the size of what is missing.</strong>
    Hours are assumed. Allocation to the school is unknown and known to be partial. Do not
    act on the total; act on getting the register.</p>
    <p style="margin:0">On that basis the people cost is at least
    <strong>${money(roster.monthly)} a month for ${roster.counted} people</strong>, which
    is more than double the ${money(D.steadyStateMonthlyCost())} the entire school P&amp;L
    records as its total cost. ${esc(roster.note)}</p>
  </div>

  <table>
    <thead><tr><th>Who</th><th>Where</th><th>Basis</th><th>Confidence</th></tr></thead>
    <tbody>
      ${D.ESTIMATED_ROSTER.people.map((x) => `<tr>
        <td><strong>${esc(x.who)}</strong>${x.role ? ' <span style="color:var(--soft)">'
          + esc(x.role) + '</span>' : ''}</td>
        <td>${esc(x.where)}</td>
        <td>${x.basis === 'salary'
          ? (x.annual != null ? money(x.annual) + ' a year'
            : money(x.annualLow) + ' to ' + money(x.annualHigh) + ' a year')
          : '$' + x.hourly + ' an hour' + (x.partTime ? ', part time' : '')}</td>
        <td style="font-size:12px;color:var(--soft)">${esc(x.confidence)}</td></tr>`).join('')}
      ${D.ESTIMATED_ROSTER.noRateGiven.map((x) => `<tr>
        <td>${esc(x.who)}</td><td>${esc(x.where)}</td>
        <td><span class="tag no">no rate given</span></td>
        <td style="font-size:12px;color:var(--soft)">${esc(x.note || 'not counted above')}</td>
        </tr>`).join('')}
    </tbody>
  </table>

  <p>${esc(D.ESTIMATED_ROSTER.whyOffshoreMatters)}</p>

"""

assert anchor in s
s = s.replace(anchor, block + anchor, 1)

# roster needs to be in scope in build()
old = """  const comp = D.assertCompIsNotCountedAsRevenue();"""
new = """  const comp = D.assertCompIsNotCountedAsRevenue();
  const roster = D.estimatedMonthlyPeopleFloor();"""
assert old in s
s = s.replace(old, new, 1)

# and the guard must run with the others
old2 = """    sequencing: P.assertRetentionPrecedesSunsetNotice(),"""
new2 = """    sequencing: P.assertRetentionPrecedesSunsetNotice(),
    roster: D.assertRosterIsLabeledAnEstimate(),"""
assert old2 in s
s = s.replace(old2, new2, 1)

old3 = """  console.log('  declared unknowns       : ' + checks.unknowns);"""
new3 = """  console.log('  declared unknowns       : ' + checks.unknowns);
  console.log('  roster (ESTIMATE only)  : $' + checks.roster.monthly.toLocaleString()
    + ' floor, ' + checks.roster.counted + ' counted, '
    + checks.roster.uncounted + ' with no rate');"""
assert old3 in s
s = s.replace(old3, new3, 1)

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('renderer updated')
