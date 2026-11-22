# Communications Hub: switching WhatsApp on

The hub can post approved announcements and reminders into WhatsApp groups. It ships **switched off**. This page covers the one-time setup, the first test send, and what to do if WhatsApp pauses or disconnects the number.

**Who does what**

| Who | Steps |
|---|---|
| Ali | 1, 3 and 7 |
| Ops (whoever deploys) | 4 |
| Jackie | 2, 5, 6 and 8 |

**Cost:** Whapi.Cloud Developer Premium is about $29 a month per number. Ali approved it on 2026-11-21.

**The risk:** Whapi connects through a linked phone, as WhatsApp Web does; it is not Meta's official business API. WhatsApp can restrict a number that sends like a bot. The hub is built to send like a person:
- one message at a time, 40 to 80 seconds apart at random;
- only 8 AM to 8 PM Central;
- at most 40 a day;
- only to groups the number is already in;
- never to anyone one to one.

---

## 1. Get a company number (Ali)

- Use a new SIM or eSIM on a company phone, and install **WhatsApp Business** on it.
- **Never use the office landline** or anyone's personal number.
- Keep the phone charged and online. If the phone is off for long, the hub shows "Disconnected" and waits.

## 2. Warm the number up for 3 to 10 days (Jackie)

A brand-new number that starts posting to groups looks like spam. Before connecting the hub, use the number by hand:
- set a profile photo and name ("Colaberry Community");
- join the groups it will post in;
- send a few normal messages each day and reply when people write.

## 3. Create the Whapi channel (Ali)

1. Sign up at whapi.cloud and choose **Developer Premium**.
2. Create a channel. A QR code appears.
3. On the company phone: WhatsApp Business, then **Linked devices**, then **Link a device**, then scan the QR code.
4. The channel shows **Authorized**. Copy the channel's **API token**.

The token is a password. Send it to ops privately. Never put it in an email thread, Basecamp, a document or the repo.

## 4. Switch WhatsApp on in production (ops)

In the production backend's environment (not in the repository), set:

```
WHAPI_TOKEN=<the token from step 3>
COMMS_HUB_WHATSAPP_ENABLED=true
```

Then redeploy the backend the usual way (`scripts/deploy-prod.sh backend`).

Do **not** set `WHAPI_BASE_URL` in production. The hub only talks to `https://gate.whapi.cloud` there and refuses any other address, so the token can never be sent anywhere else.

**Check:** in the hub, Schedule & history shows the WhatsApp card as **Connected as the number ending ####**.

## 5. Put the number in ONE test group (Jackie)

Make a small WhatsApp group with the company number and two or three staff phones, for example "Comms Hub test".

## 6. Sync, switch on only the test group, and send one test (Jackie)

1. Schedule & history, WhatsApp card: select **Sync groups**. Every group the number is in is listed, and every one starts **off**.
2. Turn on the switch for the test group only.
   - Groups marked "Can't send here" cannot be turned on: the number is not an admin of an admins-only group, the group is suspended or closed, or the number left it.
3. Compose a message about an upcoming event. The **WhatsApp** tab shows the message as it will look, with a character count (at most 1,000, plain text, no emoji).
4. Under **Who gets it**, tick **WhatsApp group: Comms Hub test**, choose **As soon as I approve**, and approve.

**The test send passes when all three are true:**
- the test group shows the message **exactly once**, from the company number, within about two minutes;
- in Schedule & history, the message's WhatsApp line reads **Sent**;
- the WhatsApp card still reads **Connected**.

If any of these is not true, stop and tell Ali before going further.

## 7. Turn on real groups, one at a time (Ali decides, Jackie does it)

Only after the test send passes, and only when Ali says so, turn on one real group at a time. Send to it for a few days before adding the next. The hub never adds a WhatsApp group to a message by itself: someone has to choose it in Compose.

## 8. When something goes wrong

**"Paused by WhatsApp until <time>"**
- **What it means:** WhatsApp limited the number. The hub stopped sending to WhatsApp for 48 hours and emailed the alert recipients once.
- **What still happens:** messages waiting for WhatsApp go out by themselves after the pause. Feed posts and in-app notifications keep sending.
- **What to do:** wait. "Resume WhatsApp early" exists, but resuming early can get the number blocked for longer. Only an owner, admin or community organizer can use it, and it asks to confirm.
- **If it happens again soon:** slow down. Send to fewer groups and post fewer messages a day.

**"Disconnected" or "Waiting for QR scan"**
- **What it means:** the phone is off, offline, or was unlinked.
- **What to do:** charge the phone and connect it to the internet. If the card says "Waiting for QR scan", re-link from step 3 (Linked devices, then scan).
- **What happens to waiting messages:** they hold and go out once the card reads Connected again. If WhatsApp cannot be checked for a whole day, a message fails and the failure alert says so. Use Retry once things are connected.

**A group shows "Can't send here"**
- **What it means:** WhatsApp refused a message there, or the number lost permission. The hub switched the group off.
- **What to do:** fix it in WhatsApp (make the number an admin, or re-add it), then **Sync groups** and turn it back on.

**"Already in the WhatsApp group, so it was not sent again"**
- **What it means:** the hub found the same text already posted by the number. That happens when an earlier try got through, or when someone pasted it by hand. It does not send a second copy.

**To switch WhatsApp off completely**
- **How:** ops sets `COMMS_HUB_WHATSAPP_ENABLED=false` and redeploys the backend.
- **What happens:** nothing more is sent to WhatsApp, and messages still waiting for WhatsApp fail with the reason. Every other channel is untouched.
