"""Surface the processor-column mechanism and the 4300 composition in the HTML."""
import io

p = 'scripts/artifacts/buildTurnaroundPlan.js'
s = io.open(p, encoding='utf-8').read()

old = """    <p style="margin:0">${esc(D.ACCOUNT_4300.unexplained)}</p>
  </div>"""

new = """    <p style="margin:0">${esc(D.ACCOUNT_4300.unexplained)}</p>
  </div>

  <div class="callout">
    <p style="margin:0 0 8px"><strong>Why the name misleads, precisely.</strong>
    ${esc(D.ACCOUNT_4300.whyTheNameMisleads)}</p>
    <p style="margin:0">Real ISA placement income is about
    <strong>${money(D.ACCOUNT_4300.realIsaPerMonth)} a month</strong> and ends
    ${esc(D.ISA_RUNOFF.zeroBy)}. It is a line item, not the business.</p>
  </div>

  <h3>What is actually inside account 4300</h3>
  <table>
    <thead><tr><th>Component</th><th class="num">Share</th><th class="num">Jan&ndash;Aug</th></tr></thead>
    <tbody>${D.ACCOUNT_4300.composition.map((c) => `<tr>
      <td>${esc(c.what)}</td>
      <td class="num">${(c.share * 100).toFixed(1)}%</td>
      <td class="num">${money(c.approx)}</td></tr>`).join('')}</tbody>
  </table>
  <p class="cap">Cross-check against the processor: September settled
  ${money(D.RECENT_ACTUALS.septemberSettled)}, October to the 21st
  ${money(D.RECENT_ACTUALS.octoberToThe21st)}. ${esc(D.RECENT_ACTUALS.note)}</p>

  <div class="callout bad">
    <p style="margin:0"><strong>The other channel has stopped.</strong> Account 4200, the
    PayPal column, went from ${money(D.PAYPAL_CHANNEL.monthly[0])} in January to
    ${money(D.PAYPAL_CHANNEL.monthly[7])} in August, and was
    <strong>negative ${money(Math.abs(D.PAYPAL_CHANNEL.monthly[5]))}</strong> in June on
    refunds. One processor is carrying almost everything.</p>
  </div>"""

assert old in s
s = s.replace(old, new, 1)
io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('renderer updated')
