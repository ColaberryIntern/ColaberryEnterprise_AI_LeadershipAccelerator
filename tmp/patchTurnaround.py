"""Fold the corrected account-4300 mechanism into the model.

The second ISA report resolved WHY the account is misleading: the workbook's income
columns are named after payment processors, not products. "4300 ISA Placement Income
(Paysimple)" sits under a column headed "ISA Placement (Paysimple)", and its sibling is
"4200 Training Platform Revenue (Paypal)" under "Tuition & Training (Paypal)". The chart
of accounts is organized by which processor the cash arrived through.

That is a sharper and more defensible statement than "the name is misleading", so it goes
in verbatim alongside the composition breakdown it implies.
"""
import io

p = 'scripts/artifacts/tickets/turnaroundData.js'
s = io.open(p, encoding='utf-8').read()

old = """  unexplained: 'Everything else settling through PaySimple in 2026 is $100, $149, '
    + '$181.82, $199, $250 and $400 recurring training-subscription and membership '
    + 'drafts, plus $500 and $3,000 enrollment down payments. Those are tuition.',"""

new = """  unexplained: 'Everything else settling through PaySimple in 2026 is $100, $149, '
    + '$181.82, $199, $250 and $400 recurring training-subscription and membership '
    + 'drafts, plus $500 and $3,000 enrollment down payments. Those are tuition.',
  // The mechanism, which is sharper than "the name is misleading".
  whyTheNameMisleads: 'The workbook organizes income by PAYMENT PROCESSOR, not by what '
    + 'was sold. The account is literally "4300 ISA Placement Income (Paysimple)" sitting '
    + 'under a column headed "ISA Placement (Paysimple)", and its sibling is "4200 '
    + 'Training Platform Revenue (Paypal)" under "Tuition & Training (Paypal)". Account '
    + '4300 means "cash that arrived through PaySimple". That is all it means.',
  composition: [
    { what: 'Recurring training-subscription and membership drafts', share: 0.63,
      approx: 95000 },
    { what: 'Enrollment down payments and one-offs', share: 0.16, approx: 25000 },
    { what: 'Actual post-placement ISA placement fees', share: 0.113, approx: 17211 },
    { what: 'QuickBooks timing and netting difference', share: 0.10, approx: 15000 },
  ],
  realIsaPerMonth: 2150,"""
assert old in s
s = s.replace(old, new, 1)

# PayPal collapse belongs on the record: it is the other half of the income story.
old2 = """/** Less than half of every drafted dollar clears. */"""
new2 = """/**
 * The PayPal channel has effectively stopped, which is the other half of the income story.
 *
 * Account 4200 is the PayPal column. It went from $18,301 in January to $1,254 in August
 * and was NEGATIVE in June on refunds. Read together with account 4300, the picture is
 * one processor carrying almost everything while the other has gone quiet.
 */
const PAYPAL_CHANNEL = {
  monthly: [18301, 3714, 11700, 5114, 1300, -2150, 150, 1254],
  verdict: 'effectively gone, and net negative in June',
  src: PNL_SRC,
};

/** Cross-checks against recent processor actuals, so the projection is not free-floating. */
const RECENT_ACTUALS = {
  septemberSettled: 16354,
  octoberToThe21st: 11535,
  note: 'The projection sits slightly below recent actuals because actuals still include '
    + 'one-off down payments, and those go to near zero now that legacy enrollment has '
    + 'stopped.',
  src: CCPP_SRC,
};

/** Less than half of every drafted dollar clears. */"""
assert old2 in s
s = s.replace(old2, new2, 1)

# April is the month that makes Q2 look healthy and it does not reconcile.
old3 = """  { id: 'U3', severity: 'ASK THIS WEEK',"""
new3 = """  { id: 'U4', severity: 'ASK THIS WEEK',
    what: 'April shows $30,683 in account 4300, which is $14,497 above everything '
      + 'traceable in PaySimple that month. It is the only month that diverges that hard.',
    risk: 'April is what makes the second quarter look healthy. If it is a timing artifact '
      + 'rather than cash, the eight-month trend is worse than it reads.',
    action: 'Pull the QuickBooks transaction detail for 4300 in April specifically.',
    src: CCPP_SRC },
  { id: 'U3', severity: 'ASK THIS WEEK',"""
assert old3 in s
s = s.replace(old3, new3, 1)

s = s.replace("""  ACCOUNT_4300, ISA_RUNOFF, LIVE_BOOK, REALIZATION, URGENT_FLAGS,""",
              """  ACCOUNT_4300, ISA_RUNOFF, LIVE_BOOK, REALIZATION, URGENT_FLAGS,
  PAYPAL_CHANNEL, RECENT_ACTUALS,""", 1)

io.open(p, 'w', encoding='utf-8', newline='\n').write(s)
print('model updated with the processor-column mechanism')
