# DOC 05 — Studio, Equipment, OBS, Zoom & Piyush Requirements

| | |
|---|---|
| **Required by** | `docs/requirements/COLABERRY_LIVE_BASECAMP_BOOTSTRAP_v2.md` §3.1, which requires every requirement in its §10 |
| **Source** | Piyush Prajapati — *"Guides for Improving Video Production Quality and AI Avatar Creation"*, 2026-10-08 |
| **Basecamp ticket** | L11.8 (this document) · L6.1–L6.4 (the work) |
| **Owner** | **Piyush Prajapati** — videography, studio production, recording quality |
| **Written** | 2026-11-03 |
| **Start here** | DOC 00 · the operator manual is DOC 13 (L11.3, not yet written) |

**This document is the requirement. It is not the operator manual.** DOC 13 — the Ali + Piyush
Studio Operator Manual — is the followable procedure, and it cannot be written until the studio is
installed, because a manual for equipment nobody has yet is untested prose.

**Nothing in this document can be satisfied from repository code.** It is hardware, physical setup
and vendor configuration. No ticket may claim any of it was verified by reading the repo.

---

## Piyush's order of operations

The source email sets the sequence, and it should not be reordered:

1. Buy and set up the recommended equipment.
2. Proceed with HeyGen recording.
3. Piyush sets up and creates a short avatar-video sample.
4. Then move into regular production.

Avatar work (step 2 onward) is **DOC 06**. This document is step 1 plus the OBS and Zoom
configuration that makes the studio usable for a live class.

---

## Equipment to research, approve, buy, receive and validate

### Camera — Logitech MX Brio

- USB to computer;
- mount close to eye level;
- configure 1080p/30 for the production baseline.

### Microphone and boom arm — FIFINE K688 + BM88 boom arm bundle

- USB to computer;
- mic approximately 4–6 inches from Ali's mouth;
- **placement cannot cover his face**;
- validate no clipping and no noise.

### Light — Elgato Key Light with desk mount

- wall power;
- slightly above eye level;
- approximately 30–45 degrees to one side;
- validate even face lighting and no harsh glare.

### Network — Cat6 Ethernet cable

- router to computer;
- adapter if the workstation lacks Ethernet;
- **wired network preferred for live classes.**

### Listening — Ali's existing earbuds

- used as the **Zoom speaker output only.**

---

## Purchase research tasks

Before ordering, verify — at the time of ordering, not from memory:

- current USA availability;
- the exact compatible models;
- the return policy;
- current pricing;
- desk and mount compatibility;
- required USB ports and adapters;
- Ethernet distance and adapter requirements;
- Windows compatibility;
- that **no additional capture card or audio mixer is required**;
- documented approved purchase links.

**Ali approves purchases.**

> **Do not hardcode a price from memory.** Use current vendor and product pages at execution time.
> A price in a document is a snapshot; a price in a purchase decision has to be live. The artifact
> for this work is an equipment research matrix with dated vendor links, not a figure typed into a
> ticket.

**Current state: L6.1 is DONE** — the equipment list is researched and approved with live pricing.
This document deliberately does not restate those prices, for the reason above.

---

## OBS and Zoom setup requirements

The twelve steps below are the requirement in full. DOC 13 turns them into a checklist somebody can
follow under time pressure.

1. **Connect camera and microphone directly to USB.**
2. **Use the K688 via USB.**
3. **Connect Ethernet.**
4. **Turn on and configure lighting.**
5. **Create an OBS teaching scene:**
   - Display Capture for the **teaching monitor only**;
   - MX Brio camera source;
   - camera resized and positioned;
   - OBS controls kept on a separate monitor where possible.
6. **Audio:**
   - Audio Input Capture → K688;
   - Application Audio Capture → Zoom, for participant and student voices;
   - capture browser or player audio when required;
   - **disable global Desktop Audio**;
   - **disable global Mic/Aux** where duplicate capture would occur;
   - **avoid duplicate audio**;
   - leave monitoring off unless a validated production reason requires it.
7. **Send video to Zoom using OBS Virtual Camera**, where that production mode is used.
8. **Zoom inputs:** OBS Virtual Camera; K688 microphone; earbuds as speaker.
9. **Zoom screen sharing:**
   - share the teaching monitor separately;
   - **Share Sound** when playing clips;
   - leave *Optimize for video sharing* **off** for slides, code and websites unless a test proves
     otherwise.
10. **OBS local recording baseline:**
    - canvas 1920×1080;
    - output 1920×1080;
    - 30 FPS;
    - webcam 1080p/30;
    - high-quality recording;
    - hardware H.264 if supported;
    - **MKV as the primary local-record format**;
    - save to a local SSD;
    - **remux to MP4 for sharing.**
11. **Run at least one 5-minute Zoom + OBS recording test before the first real production class.**
12. **Validate:** Ali's voice; a student reply; shared-text readability; lip sync; no duplicate
    audio; no clipping; free disk space; appropriate CPU/GPU use; a stable network; and Zoom mute
    behavior versus OBS recording behavior.

### The one warning that goes in the operator checklist

> # Zoom mute does not mute OBS.
>
> Piyush's guide calls this out explicitly. A presenter who mutes himself in Zoom to cough, take a
> call, or say something off the record **is still being recorded by OBS**, and the local MKV is
> the file that goes to the editor. This belongs in DOC 13's checklist at the top, not buried in a
> settings list.

MKV is the primary local format for a related reason: MKV survives a crash mid-recording where MP4
does not, and the remux to MP4 is a cheap post step. Record MKV, ship MP4.

---

## Relationship to the broadcast path

This document covers the **production source**. The delivery path is DOC 02:

```
Zoom → RTMP → Cloudflare Stream Live → HLS → signed/expiring playback → Colaberry persistent player
```

Two consequences for whoever sets up the studio:

- **The OBS local recording is not the broadcast.** It is the editor's master for the long-form and
  Shorts work in DOC 07. The viewer sees the Cloudflare stream.
- **Zoom's custom RTMP is the handoff point, and it is the program's cheapest open blocker.** The
  Zoom *account setting* is enabled (L1.1). The *operator* half is unverified: which client, signed
  in as whom, on what license. On 2026-10-29 the host was signed in from something other than the
  Zoom desktop client and had **no way to start the stream**, so the airing did not stream at all.
  Until the host has seen the Custom Live Streaming menu item in a throwaway meeting **on the
  machine they will actually teach from**, this is unmet and R9 is blocked.

---

## Current state and what is not done

| Item | Ticket | Owner | State |
|---|---|---|---|
| Equipment list researched and approved, with live pricing | L6.1 | Piyush | **DONE** |
| Ali's AI workstation laptop specified and sourced | L6.4 | Ali | **DONE** |
| **Install and validate camera, microphone, light and wired network** | **L6.2** | **Piyush** | **OPEN** |
| **OBS scene package and Zoom audio routing with no duplicate audio** | **L6.3** | **Piyush** | **OPEN** |
| The 5-minute Zoom + OBS recording test (step 11) | part of L6.3 | Piyush | **Not run** |
| The twelve-point validation (step 12) | part of L6.3 | Piyush | **Not run** |
| **DOC 13, the operator manual** | L11.3 | Piyush | **Not written** — needs L6.3 |

**L6.2 and L6.3 are the longest dependency chain on the board.** Together they block Test 4 (the
full dress rehearsal, L10.3), the operator manual (L11.3), and through those, L6.4's downstream
launch tickets — five launch tickets in total wait behind them.

**What this means for planning:** no amount of repository work advances this document. It needs
Piyush, a room, and the hardware. A Claude Code session reading this should pick a different ticket
(see DOC 00, *How to choose the next ticket*) and should not mark anything here as progressing.
