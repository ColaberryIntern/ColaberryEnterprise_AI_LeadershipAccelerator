# CC-20261102-k9r4 - TWC-1 closed: the zero-price claim is gone from both surfaces

**Date:** 2026-11-17 (Central)
**Workstream:** Marketing ops
**Ticket:** TWC-1 (10516188891), due 2026-11-18 - **CLOSED**

## The task I was given, and why it was the wrong task

The instruction was to draft a second email to Sohail asking him to rename three Colaberry TV
videos whose titles advertised a zero price, which 40 TAC 807.172(d) bars a career school from
doing. TWC-1 was due the next day and recorded as blocked on him.

**He had already done it.** Reading the live channel before writing the email is what showed that,
and it is the only reason an email asking him to do a finished job was not sent to a staff member.

Two reads, in this order, before any drafting:

1. **The mailbox.** The ticket comment claimed a rename sheet had been emailed. Ali is BCC'd on
   every outbound send and that copy stays in his inbox, so the mirror is the evidence. It held
   three messages to Sohail on 16 Nov from 18:04 Central: the original and two follow-ups. So the
   email I had been asked to draft would have been the *fourth*, not the second.
2. **The channel.** All three videos had been renamed.

## What the live channel says

Read through YouTube's public oEmbed endpoint, which needs no auth:

| Video | The phrase that claimed a zero price | YouTube now reads |
|---|---|---|
| `sBfP9CyNe9Y` | "for free." | "with Colaberry ." |
| `oyBEKJn_bpM` | "Start free:" | "Know more:" |
| `qKvnQkahU-U` | "today at $0." | "with Colaberry ." |

**Control:** a video id that cannot exist returned **HTTP 400**, not a title. Without that, three
returned titles prove only that something answered.

## The other surface, and the divergence worth recording

A Colaberry TV title has two surfaces with different owners, and a viewer of our own campus page
reads both: our `media_assets.alt_text` under the video, and YouTube's own title drawn inside the
embedded `youtube-nocookie.com` frame. Our half was corrected on 16 Nov; the channel half closed
only now.

The two no longer match word for word. Sohail chose his own replacement wording rather than the
one the rename sheet proposed. Both are clean, so this is recorded as a fact rather than raised as
a defect - **but a future audit can no longer infer one surface from the other**, which it could
on 16 Nov when all nine stored titles were byte-identical to the live ones.

## The sweep, and why its zero means something

TWC-1's third condition was a brand-wide sweep returning no rows. Re-run on production:

- **11** live media library rows across **every** brand, searched for `free` as a word, `$0`,
  `no cost`, `zero cost`, `no charge`, over `alt_text`, `source_url` and `original_filename`.
- **0** matched. **Positive control 3, negative control 0**, so the zero is a reading and not a
  broken matcher.
- All **9** YouTube-backed rows were printed and read in full, not only the rows that matched, so
  the six previously-clean titles were re-checked instead of assumed.
- Of **12** live content items, **3** mention a zero price and **0** of those are published.

The earlier audit had under-counted: a search for the word `free` found two bad titles when there
were three, because the third said `$0` as a number. The pattern above exists because of that.

## Closed with two artifacts

Per the two-PDF rule for a non-code deliverable, both are embedded on the ticket and the script
read each comment back to confirm the attachment rendered rather than trusting the 201:

- `TWC-1-both-surfaces-clear.pdf` - one-page landscape visual, the three-video by two-surface
  matrix and the control beside each check
- `TWC-1-completion-record.pdf` - full before and after text, the evidence, and what this does
  not establish

The one-pager was refused twice by the renderer's own page-count guard before it fitted. Content
was cut rather than the limit raised, and the rendered page was looked at as a PNG, because a
height check passing has previously coexisted with a label clipped off the right edge.

## Carried out of this ticket, not solved by it

- The Meta ad campaign is still named **"Oct- Start with $0 today Lead Camapign"** - the same
  claim in a system this ticket does not reach.
- Three `content_items` still mention a zero price in their body. All are drafts, so nothing
  reaches a prospect today, but publishing one would re-create the exposure.
- oEmbed reports the titles as they stand now. Nothing prevents a future rename, so this is a
  point-in-time verification.
- `media_assets.mime_type` is still `NOT NULL` on production although LIB-1 called for relaxing it
  alongside `storage_key`. Observed while reading the table; not touched here.

## Not done, deliberately

**No email was sent.** The one I was asked to draft would have asked a staff member to do
something he had already finished, after three earlier messages on the same subject.
