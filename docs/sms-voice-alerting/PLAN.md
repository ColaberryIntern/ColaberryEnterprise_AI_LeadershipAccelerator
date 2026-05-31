# SMS + Voice Alerting Plan — VIP-list + Multi-system Critical Alerts

**Drafted:** 2026-05-31 (CC-20260531-sms-voice-plan)
**Trigger:** Ali's request 2026-05-31. Current T-Mobile SMS noise is redundant with emails; needs to be re-tiered as a true "next-level" channel above email.

---

## Current state (discovered)

- **Voice:** Synthflow API integration exists. Used for Cory health-monitor alerts. `adminAlertPhone` env var. `communication_logs` table tracks per-call status, duration, voicemail/answered, end-call reason.
- **SMS:** T-Mobile-side forwarding from email triggers (likely Graph mail forwarder rule or carrier email-to-SMS gateway). NO dedicated outbound SMS service in the codebase (no Twilio, no SignalWire).
- **Mandrill webhook:** exists in `mandrillWebhookController.ts` - handles inbound email events.
- **Inbox COS:** classifies inbound email importance.

---

## What Ali wants (final)

| Channel | Trigger | Behavior | Daily cap |
|---|---|---|---|
| **Email** (existing) | Everything routine: reports, intern nudges, decision queue, "your turn" notifier, etc. | Land in `ali@colaberry.com`. CC `alimuwwakkil@gmail.com` for phone-accessible copy. | unlimited |
| **SMS** (new tier) | Email arrives FROM a VIP-list sender | Summary email to `alimuwwakkil@gmail.com` first. SMS body = "VIP sender + topic + ask" + direct link to that gmail message. Buildup notification when multiple VIP messages stack. | **7/day** |
| **Voice** (new tier on top of existing) | Critical alert from CCPP / Basecamp / email / any system requiring immediate attention | Synthflow call with full details. Q&A capability so Ali can ask follow-up questions and get answers from the system. | **3/day** |

**Anti-noise rules:**
- SMS only fires above email; never duplicate what email already says
- Voice only fires above SMS; never duplicate what SMS would catch
- Caps strict: drop notifications beyond cap, log them for the next daily digest

---

## Architecture

### 1. VIP list (data layer)

New table `vip_contacts` in Postgres:
```sql
CREATE TABLE vip_contacts (
  id SERIAL PRIMARY KEY,
  email TEXT,                  -- match inbound sender email
  domain TEXT,                 -- or match by domain
  display_name TEXT NOT NULL,
  topic_tags TEXT[],           -- e.g. ['client', 'gov-contract', 'investor']
  priority INT DEFAULT 5,      -- 1=highest, 10=lowest
  active BOOLEAN DEFAULT true,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW()
);
```

Initial seed (Ali to confirm):
- Family / personal critical contacts
- Active client contacts (Mike from ShipCES, Luda from AI Pathway, key LandJet contacts)
- Government RFP buyer contacts (per-bid)
- Investor / board contacts
- Top 5 colaberry.com colleagues (Ram, Karun, etc.)
- Anyone Ali tags `@CB VIP add <name> <email>` via the @CB tool

### 2. SMS pipeline (new)

**Inbound trigger:** Mandrill inbound webhook (or Graph mail subscription) fires for new email to `ali@colaberry.com`.

**Pipeline:**
1. Inbound email arrives
2. Match sender against `vip_contacts`
3. If VIP → check daily SMS cap from `communication_logs` (last 24h SMS count for Ali). If under 7:
   - Use gpt-4o-mini to summarize: "sender + topic + the ask"
   - Forward full email to `alimuwwakkil@gmail.com` with a stable Gmail-deep-link subject (so the link in the SMS goes straight to it)
   - Send SMS via new provider (recommend: Twilio - $0.0079/SMS, simple webhook API, will need an `npm install twilio` + env var)
   - SMS body: `"VIP <name> just emailed: <one-line summary>. Open: <gmail-link>"` (~160 chars)
4. Log to `communication_logs` (channel=sms)
5. If buildup detected (3+ VIP messages within 1 hour): consolidate next SMS to "X VIP messages stacked. Top: <name>: <summary>. See gmail."

**Provider choice:** Twilio. Telnyx and SignalWire are cheaper but Twilio's reliability + free-tier sandbox makes it the right pick for a feature where deliverability matters.

**Cost estimate:** 7 SMS/day × 30 days × $0.0079 ≈ $1.65/month + Twilio number rental $1/month = **$2.65/month** at the cap.

### 3. Voice pipeline (extension of existing)

**New "critical" tier on top of existing Cory health alerts.**

Critical triggers (any one):
- CCPP: data corruption alert, unauthorized exit, multi-active intern detected
- Basecamp: VIP message + "URGENT" / "ASAP" / "critical" keyword
- Email: VIP sender + critical keyword OR sender on a smaller "drop-everything" sublist
- System: any Sev-1 incident detected by systemHealthService

Pipeline:
1. Trigger fires
2. Check daily voice cap (last 24h, `communication_logs` channel=voice). If under 3:
   - Generate Synthflow call with TTS prompt: full details + structured Q&A invitation
   - On answer, Synthflow's IVR captures Ali's questions (speech-to-text)
   - System uses Claude/gpt-4o to answer from the source data (CCPP query / BC fetch / email content)
   - Logged to `communication_logs` (channel=voice)

**Q&A capability:** Synthflow supports custom voice agents with retrieval. Build a "CB Voice" agent with access to:
- CCPP read-only queries
- Basecamp read-only queries
- Recent email summaries
- Internal report data

When Ali asks "what's the InternID?", the agent does a CCPP lookup and reads it back.

### 4. Caps + rate limiting

Centralized `notification_caps.js` module:
```js
async function canSendSms(userId) {
  const sentToday = await pg.query(`SELECT COUNT(*) FROM communication_logs WHERE channel='sms' AND recipient_user_id=$1 AND created_at > NOW() - INTERVAL '24 hours'`, [userId]);
  return sentToday < 7;
}
async function canMakeVoiceCall(userId) {
  const sentToday = await pg.query(`SELECT COUNT(*) FROM communication_logs WHERE channel='voice' AND recipient_user_id=$1 AND created_at > NOW() - INTERVAL '24 hours'`, [userId]);
  return sentToday < 3;
}
```

When cap hit: log the would-be notification to `notifications_deferred` table. Daily 6am digest includes "Yesterday we suppressed X SMS / Y calls due to cap. Here's what they were."

### 5. @CB tools

| Tool | Purpose |
|---|---|
| `vip_add(name, email, priority?)` | Add to VIP list. Triggers SMS routing for that sender. |
| `vip_remove(email)` | Remove from VIP list. |
| `vip_list()` | Show current VIP contacts. |
| `trigger_critical_alert(reason, source_system, details)` | For internal services to trigger a voice call. Honors daily cap. |
| `mute_sms(hours)` | Temporary quiet window if Ali's in a meeting. |

---

## Buildout phases

### Phase 1: VIP SMS routing (~1 week)
- New `vip_contacts` table + Sequelize model
- Mandrill inbound webhook hook OR Graph mail subscription poller (check what's currently triggering T-Mobile forwarding and replace)
- gpt-4o-mini summarizer
- Twilio integration (account setup, number purchase, SDK install)
- Cap enforcement
- `@CB vip add` tool
- Disable existing T-Mobile email→SMS forwarding (the noise source)

### Phase 2: Voice Q&A (~2 weeks)
- Synthflow agent setup: build "CB Voice" agent with retrieval over CCPP + BC + email
- Critical-alert trigger registration from systemHealthService + new sources
- Cap enforcement
- `@CB trigger_critical_alert` tool wired

### Phase 3: Polish + deferred-digest (~3 days)
- `notifications_deferred` table
- Daily 6am digest of suppressed alerts (replaces current Cory digest if appropriate)
- `@CB mute_sms` tool
- Admin UI page at `/admin/notifications` showing recent SMS + voice + deferred

---

## Open questions for Ali

1. **VIP seed list:** can you give me 10-20 names + emails to start? Or should I pull from your last 90 days of inbound and suggest likely VIPs?
2. **What's currently sending T-Mobile SMS?** Carrier email-to-SMS gateway (e.g., `<number>@tmomail.net`) or a built-in service? Need to disable it before turning on the new pipeline to avoid double-buzz.
3. **Critical-alert sources:** CCPP / Basecamp / email is the headline. Anything from Mandrill webhooks (campaign failures)? Any external monitoring (Pingdom, etc.)?
4. **Synthflow Q&A:** today the voice calls are one-way (system → Ali). Adding bidirectional Q&A is a meaningful build. Confirm priority.
5. **Cap behavior on overflow:** drop silently + log? Or escalate to email "we tried to SMS you but you've hit your daily cap"?
6. **Daily 6am digest:** should this be a new email, or fold into the existing Cory daily briefing?

---

## Recommendation on scope

Given the size:
- **Phase 1 (VIP SMS) is buildable in one focused sprint** and would immediately reduce T-Mobile noise + give you actionable VIP alerts.
- **Phase 2 (Voice Q&A) is meaningful work** - 1-2 weeks for the Q&A agent build alone. Worth doing but should be its own sprint.
- **Phase 3 is fast polish.**

**Suggested sequencing:** Phase 1 next week, Phase 2 the week after, Phase 3 same week as Phase 2.

If you want me to start Phase 1 immediately on next session, reply with: (a) the VIP seed list (or "you pull a suggestion list"), (b) confirmation to install Twilio + buy a number, (c) which carrier-side SMS forwarder is currently noisy so we can disable it.
