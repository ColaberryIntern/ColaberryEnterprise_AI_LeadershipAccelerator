# Cluster B reconciliation emails — DRAFT, awaiting Ali's approval to send

All 5: verified paid via real PaySimple order-confirmation emails in Ali's own
inbox, then manually reconciled (payment_status='paid', portal_enabled=true).
Login path corrected + validated end-to-end per Ali (2026-07-30): direct
students to training.colaberry.com and click Log In, NOT enterprise.colaberry.ai
directly. Tested the full click-through (training.colaberry.com -> Log In ->
portal login -> real access-link email) for Abirahim's account and it works —
"Check your email" success screen, not the "pending admin approval" rejection.
Also confirmed his classmates in the sidebar are Francis Chukwuma, Regina
Asafor, and Britiana Akhile — all in the same real "Cohort - July 2026",
consistent with the reconciliation.

CAVEAT found while validating: Abirahim's Settings > Subscription tab still
shows "FREE - EXPLORER ... Your plan" as the current-plan badge, even though
payment_status=paid in the DB. His actual classroom CONTENT is unlocked
(portal_enabled=true is the thing his complaint was about), but the
Subscription tab's own "current plan" display appears to read a different
signal than what was corrected. Not blocking these emails (the thing they
complained about — locked classroom — is genuinely fixed) but flagging so
nobody is surprised if a student mentions their plan still shows as Free.

---

## 1. Mohsin Ali <mohsinali43@gmail.com>
Reply on thread "Mohsin Ali Access: Your receipt from Colaberry Inc"

Subject: Re: Your access is fixed — you're in

Hi Mohsin,

Sorry for the delay here. Your payment (order #N13022, $199) had gone through
on our end, but a bug meant a confirmed payment wasn't actually unlocking
classroom access. That's fixed now, and I've activated your account directly.

Please sign in again — go to training.colaberry.com and click Log In, then
enter mohsinali43@gmail.com to get your access link. You should have full
access to Week 1 and beyond. On the QR check-in issue during class: we're
still looking into that one separately and I'll follow up once it's resolved.

Ali Muwwakkil
Managing Director, AI Systems Architect
Colaberry Inc.
ali@colaberry.com | enterprise.colaberry.ai

---

## 2. Abirahim Nur <abdinur2468@gmail.com>
Reply on thread "I can't access my week 1 class work"

Subject: Re: Your access is fixed — Week 1 is open

Hi Abirahim,

Your annual plan payment (order #N13015, $1,788) had gone through, but a bug
on our side meant a confirmed payment wasn't actually unlocking the
classroom. That's fixed now, and I've activated your account directly.

Please sign in again — go to training.colaberry.com and click Log In, then
enter abdinur2468@gmail.com to get your access link. Week 1 should be fully
open now. Sorry for the run-around with the cache/browser troubleshooting
earlier; the problem was never on your end.

Ali Muwwakkil
Managing Director, AI Systems Architect
Colaberry Inc.
ali@colaberry.com | enterprise.colaberry.ai

---

## 3. Liza Ayele <bfglz@yahoo.com>
Reply on thread "Unable to Access Classroom After Payment"

Subject: Re: Your access is fixed

Hi Liza,

Your payment from July 22 (order #N12987, $199) had gone through, but a bug
on our side meant a confirmed payment wasn't actually unlocking the
classroom. That's fixed now, and I've activated your account directly.

Please sign in again — go to training.colaberry.com and click Log In, then
enter bfglz@yahoo.com to get your access link. You should have full access
now. Sorry for the delay in getting this sorted.

Ali Muwwakkil
Managing Director, AI Systems Architect
Colaberry Inc.
ali@colaberry.com | enterprise.colaberry.ai

---

## 4. Britania Okoduwa <bitania3@gmail.com>
Reply on thread "Classroom restriction"

Subject: Re: Classroom restriction — fixed

Hi Britania,

Your payment (order #N12994, $199) had gone through, but a bug on our side
meant a confirmed payment wasn't actually unlocking the classroom — and
separately, your account had gotten pointed at the wrong cohort, which I've
also corrected. Both are fixed now and I've activated your account directly.

Please sign in again — go to training.colaberry.com and click Log In, then
enter bitania3@gmail.com to get your access link. You should be fully
caught up with your peers now.

Ali Muwwakkil
Managing Director, AI Systems Architect
Colaberry Inc.
ali@colaberry.com | enterprise.colaberry.ai

---

## 5. Regina Asafor <regina.asafor@gmail.com>
Reply on thread "I am being asked to enroll to unlock"

Subject: Re: I am being asked to enroll to unlock — fixed

Hi Regina,

Your payment (order #N12993, $199) had gone through, but a bug on our side
meant a confirmed payment wasn't actually unlocking the curriculum. That's
fixed now, and I've activated your account directly.

Please sign in again — go to training.colaberry.com and click Log In, then
enter regina.asafor@gmail.com to get your access link. The curriculum
should be fully unlocked now.

Ali Muwwakkil
Managing Director, AI Systems Architect
Colaberry Inc.
ali@colaberry.com | enterprise.colaberry.ai

---

## 6. Million Abate <millionabate19@gmail.com> — RETRY, not confirmation
Reply on thread "Issues for payment and login to classroom"

No matching PaySimple order found for Million (consistent with his own email
describing a failed "Could not start checkout" attempt — he never completed
payment). Confirmed in the DB: his account already has portal_enabled=true
on the correct cohort, so he CAN already log in — he just needs to finish
paying from inside the portal. Not a "you're fixed" email; an invite to
finish checkout, with the exact path (Settings gear icon -> Subscription tab
-> Choose Monthly/Annual -> PaySimple checkout), verified live via screenshot.

Subject: Re: Issues for payment and login to classroom — please try again

Hi Million,

I'm sorry this has dragged on, and sorry the Zoom room was unattended when
you tried to get live help. Here's the real story: our checkout page was
broken site-wide from July 24 to yesterday, so the "Could not start
checkout" error you kept hitting was never something wrong with your $50
deposit or your device. That's fixed now.

Please go to training.colaberry.com and click Log In, then enter
millionabate19@gmail.com. Once you're in, click the gear icon (top right) to
open Settings, then the Subscription tab — you'll see Free / Annual / Monthly
plans there. Choose whichever works for you and complete payment through
PaySimple; access unlocks the moment it clears.

If you hit any issue at all this time, reply directly to this email and I
will personally check it within the hour, not route you back through general
support.

Ali Muwwakkil
Managing Director, AI Systems Architect
Colaberry Inc.
ali@colaberry.com | enterprise.colaberry.ai
