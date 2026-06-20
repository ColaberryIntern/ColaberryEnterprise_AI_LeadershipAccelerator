# AI ROI Pilot: Cold Email Sequence

**Send-from:** ali@colaberry.com (decision 2026-06-20)
**Format:** plain text, personalized, no em-dashes, real opt-out + mailing address (CAN-SPAM)
**Cadence:** 3 touches over ~10 days. Stop the sequence the moment someone replies.
**Used by:** `backend/src/scripts/sendAiPilotOutreach.js` (Touch 1). Touches 2-3 sent on follow-up runs.

Personalization tokens: `{{first_name}}`, `{{company}}`. Keep it short. The goal of touch 1 is a reply,
not a sale. We are selling a 20-minute fit call and a low-risk pilot, not a retainer.

---

## Touch 1 (Day 0) — the opener

**Subject:** a quick AI idea for {{company}}

```
Hi {{first_name}},

I run a small team that builds AI systems for owner-led companies, and {{company}} is exactly the kind
of business we tend to help most.

Most CEOs I talk to are not short on AI ideas. They are short on a low-risk way to prove one. So we do a
6-week AI ROI Pilot: $2,500 flat, and we build one real working system against the workflow most likely
to return time or money for you. If you continue after that, the $2,500 is credited forward.

For one transportation company we built a system that finds and contacts prospects and prices inbound
quotes in seconds. Same approach would look different for {{company}}, which is the point of the pilot.

Worth a 20-minute call to find your first win?

Ali
```

---

## Touch 2 (Day 3) — the proof nudge (only if no reply)

**Subject:** re: a quick AI idea for {{company}}

```
Hi {{first_name}},

Quick follow-up. The reason the pilot is only $2,500 is that it is meant to be a low-risk way to see what
it is like to work with us before any bigger commitment. We pick the one project most likely to pay off,
build it, and measure the result. No retainer until you have seen it work.

If now is not the time, just say so and I will stop following up. If you are curious, I will send two or
three ideas specific to {{company}} before we even talk.

Ali
```

---

## Touch 3 (Day 10) — the break-up (only if no reply)

**Subject:** should I close this out?

```
Hi {{first_name}},

I do not want to crowd your inbox. If the timing is off I will close this out and check back later in the year.

If there is even one workflow at {{company}} you have wished AI could handle, reply with one line and I
will tell you, honestly, whether a pilot makes sense for it.

Either way, thanks for the time.

Ali
```

---

## Compliance footer (appended to every send)

```
Colaberry Inc. | Reply STOP or "unsubscribe" and I will remove you immediately.
[mailing address to be confirmed before send]
```

Note: confirm the physical mailing address line with Ali before the first live send. The send script will
refuse to run live until the address placeholder is replaced.
