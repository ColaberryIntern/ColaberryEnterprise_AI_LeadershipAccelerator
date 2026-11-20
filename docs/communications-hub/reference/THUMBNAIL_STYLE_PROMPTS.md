# Thumbnail style prompts (reverse-engineered 2026-11-20)

Source: every Eventbrite promo image (`EventBrite_Events.Logo_url`, CCPP) for live, started or
completed events in the 12 months to 2026-11-20. That was 42 event rows and 34 unique images. The
recent ones are AI-generated. The older ones (Center of Excellence meetups, Career Switch Open
House, CAP, Good Life, Data Talent Showcase) were hand-built in Canva or a slide tool.

Ali's ruling (2026-11-20): the Hub generates thumbnails with an AI image model, using the
uploaded photo(s) as input and these style families as prompt templates. The deterministic
branded templates remain as the fallback.

Rules for every family (enforced by code, not by the model):
- `[BRACKETED]` slots are filled by code from the event record: title, weekday, Central time
  with the zone written out ("9:00 AM CST" or "CDT"), hosts, platform ("Live on Zoom").
- Never the word "free" (TWC rule). Use "$0 to attend" only if the event record says so, and
  only in body copy, never in the image.
- No QR codes: models draw ones that do not scan.
- No invented attendee names or fake participant tiles that could be read as real people.
- Show the prompt that produced an image next to it in the studio, so Jackie can edit it.

## Family A: Dark-tech recurring-session poster (AI Friday, AI Strategy, AI Internship)

Inputs: 0 to 3 presenter headshots.

```
Create a [ASPECT] event banner for a recurring Colaberry session called "[TITLE]".
Dark navy / near-black background with faint glowing circuit or neural-network line art.
LEFT HALF: two pill badges at top: "[CADENCE e.g. EVERY FRIDAY]" with a calendar icon and
"[TIME CENTRAL e.g. 9:00 AM CST]" with a clock icon. A giant heavy condensed sans-serif
headline "[SHORT TITLE]" with the first word in Colaberry red and the rest in white. Subhead
"[SUPPORTING LINE]". A row of 3 to 5 outline icons with short labels: [AGENDA ITEMS].
RIGHT HALF: [N] tall slanted diagonal panels, one per attached presenter, each cut out
waist-up with a thin glowing edge, a simple line icon above each head that matches their
topic, and a name card at the bottom: [NAME - ROLE] for each.
BOTTOM STRIP: "Interactive session", "[PLATFORM e.g. Live on Zoom]", "All questions welcome",
and an angled red call-to-action block: "Join us [CADENCE] at [TIME CENTRAL]".
Colaberry logo top-left. Polished tech-conference look, crisp legible text, high contrast.
Keep every presenter's face and identity exactly as in the attached photos.
```

## Family B: Staged presenter headshot (Interview Prep, SQL After Dark, help sessions)

Input: one casual photo of the presenter.

```
Using the attached photo, keep the person's face, hair, beard and identity exactly the same.
Re-stage them as a professional portrait: seated at a warm wooden desk in a modern, softly lit
office, smiling at the camera, hands clasped, [SHIRT e.g. navy button-up, sleeves rolled].
Desk props: an open silver laptop, a small potted plant, a notebook with a pen, a black mug
with a simple [TOPIC ICON e.g. database] icon. Background: [SCENE e.g. dark navy wall, framed
poster reading "KEEP LEARNING KEEP GROWING", wooden shelves with books, a warm lamp].
Shallow depth of field, cinematic lighting, photorealistic. Leave the left 45% of the frame
open and slightly darker for text. Overlay on the left in heavy white condensed sans-serif:
"[TITLE LINE 1]" very large, "[TITLE LINE 2]" in Colaberry blue below. [ASPECT].
```

## Family C: Open House / info session overlay

Inputs: none, or a team photo.

```
[ASPECT] event banner. Photoreal background: a diverse team of five or six engineers in a
glass-walled modern office. One points at a whiteboard of architecture diagrams, two sit at a
large monitor showing code and a system diagram, one leans in to coach, and one works on a
laptop in the foreground. Apply a dark navy-teal overlay, heaviest on the left so the text
reads cleanly. Text, left-aligned: white Colaberry wordmark top-left; a red rounded pill at
top center in monospace caps "REGISTER"; a lime-green monospace eyebrow "[PROGRAM NAME]";
huge white bold sans "[HEADLINE e.g. Open House & info session]"; at the bottom a lime globe
icon and "[LOCATION e.g. Online, join from anywhere]".
```

## Family D: Weekly Live / video-frame thumbnail

Input: a frame or photo of the host.

```
[ASPECT] YouTube-style thumbnail from the attached frame of the host. Fade the left half into
flat dark navy. Left text: small coral caps "[SERIES e.g. WEEKLY LIVE · EP 3]"; large white
bold "[HOOK LINE 1]"; "[HOOK WORD]" in white caps on a red rounded highlight box; subtitle
"[TITLE]"; small line "[DAY DATE · TIME CENTRAL · Live]". Small "colaberry" tag bottom-right.
```

## Family E: Infographic poster (Financial Literacy style)

Inputs: none.

```
Wide infographic poster, white background with navy and gold accents. Header "[TITLE]" in
heavy navy caps with a gold second line "[SUBTITLE]". Tagline "[SUPPORTING LINE]". Glossy 3D
props that fit the topic: [PROPS]. Four white cards with an icon, a title and one line each:
[FOUR TOPICS]. Footer: "Hosted by Colaberry", "Everyone is welcome", "[CADENCE]". No QR code.
```

## Sizes

Generate at the largest needed aspect (16:9). Derive 1:1 and 3:1 with `sharp` (attention crop
or extend with the background colour). If a crop would cut text, regenerate at that aspect
instead of cropping.

## Observed problems to avoid repeating

- A "FREE · REGISTER" pill on the current Forward Deployed AI Engineer Open House image breaks
  the never-"free" rule.
- The Financial Literacy image carries a QR code that the model drew. It will not scan.
- AI Strategy & Collaboration shows eight invented attendee names in a fake Zoom grid.
- "Budgeting / Budgeting" (a duplicated label) in the August Financial Literacy image shows that
  the model will repeat text. The studio has to show the image for human approval before use.
