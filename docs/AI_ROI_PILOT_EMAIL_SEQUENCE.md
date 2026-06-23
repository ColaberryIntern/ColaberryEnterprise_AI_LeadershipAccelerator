# AI ROI Pilot: 7-Email Cold Campaign

**Send-from:** ali@colaberry.com
**Format:** plain text, personalized, no em-dashes, real opt-out + mailing address (CAN-SPAM)
**Goal of every touch:** earn a reply so we can scope and build their AI application (the $2,500 pilot).
**Batch:** 100 leads, staggered across the business day (Mandrill scheduled sends).
**Cadence:** 7 touches over ~3 weeks. Anyone who replies is pulled out of the sequence immediately.
**Used by:** `backend/src/scripts/sendAiPilotOutreach.js` (`TOUCH=1..7`).

Tokens: `{{first_name}}`, `{{company}}`. Keep each short. We are selling a 20-minute fit call and a low-risk pilot, not a retainer.

---

## Touch 1 (Day 0) — The idea
**Subject:** a quick AI idea for {{company}}
```
Hi {{first_name}},

I run a small team that builds AI systems for owner-led companies, and {{company}} is exactly the kind of business we tend to help most.

Most CEOs I talk to are not short on AI ideas. They are short on a low-risk way to prove one. So we do a 6-week AI ROI Pilot: $2,500 flat, and we build one real working system against the workflow most likely to return time or money for you. If you continue after that, the $2,500 is credited forward.

Worth a 20-minute call to find your first win?

Ali
```

## Touch 2 (Day 2) — Proof
**Subject:** re: a quick AI idea for {{company}}
```
Hi {{first_name}},

Quick proof this is real and not a pitch. For one transportation company we built a system that finds and contacts prospects across email and phone, and reads inbound requests around the clock to prepare priced quotes in seconds. Production software, in about three months.

The same method would look different for {{company}}, which is the whole point of starting with a small pilot.

Open to a short call?

Ali
```

## Touch 3 (Day 5) — Their build
**Subject:** two things we would build for {{company}}
```
Hi {{first_name}},

I took a few minutes on {{company}}. Two places AI usually pays off fastest for a business like yours:

1. The repetitive inbox or intake work that eats your team's hours.
2. The follow-up that quietly slips through the cracks and costs you deals.

In a pilot we would pick the one with the clearest payback and build it. Want me to send a third idea specific to {{company}}, or just grab 20 minutes?

Ali
```

## Touch 4 (Day 8) — De-risk
**Subject:** why the pilot is only $2,500
```
Hi {{first_name}},

In case the price made you wonder where the catch is: there is none. The pilot is $2,500 because it is meant to be a low-risk way to see what it is like to work with us before any bigger commitment. We pick the one project most likely to pay off, build it, and measure the result. No retainer until you have seen it work, and the $2,500 credits forward if you continue.

Reply with one line about your biggest time sink and I will tell you, honestly, whether a pilot makes sense for it.

Ali
```

## Touch 5 (Day 12) — Scarcity
**Subject:** pilot slots this cycle
```
Hi {{first_name}},

A quick honest note: we only take a handful of new pilots at a time so each one gets real attention, and this cycle is filling up.

If building your first AI win is something you want to move on in the next few weeks, let us talk before the slots are gone. If the timing is wrong, no problem, just let me know.

Ali
```

## Touch 6 (Day 16) — Make it easy
**Subject:** 20 minutes to map your first AI win?
```
Hi {{first_name}},

Making this as easy as possible: a 20-minute call where we find the one workflow at {{company}} worth building first. No prep, no slides.

Grab whatever time works here: {{calendar_link}}

Or just reply with two or three times and I will send an invite.

Ali
```

## Touch 7 (Day 21) — Break-up
**Subject:** should I close this out?
```
Hi {{first_name}},

I do not want to crowd your inbox, so this is my last note for now. If the timing is off I will close this out and check back later in the year.

If there is even one workflow at {{company}} you have wished AI could handle, reply with one line and I will tell you whether a pilot makes sense for it.

Either way, thanks for the time.

Ali
```

---

## Compliance footer (appended to every send)
```
Colaberry Inc. | Reply STOP or "unsubscribe" and I will remove you immediately.
[mailing address to be confirmed before send]
```
The send script refuses to run live until the address placeholder is replaced (ADDRESS env). Confirm `{{calendar_link}}` (Touch 6) before send, or it is dropped automatically.
