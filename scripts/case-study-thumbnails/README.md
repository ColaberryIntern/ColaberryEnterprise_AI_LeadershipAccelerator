# Case study covers and video thumbnails

Every case study gets a cover that works like a YouTube thumbnail: one face or one object,
colours that fight each other on purpose, a hook of four words at most. Ali picks it from
three concepts. The same file is the record's cover (index cards, social preview) and its
walkthrough video's poster, which is the picture the masthead shows until play is pressed.

The real screenshots do not go away. They stay on the record as evidence and, because the
cover is the one image the renderers skip in the body, the screenshot that used to be the
cover appears in the body. Ali, 2026-09-18: *"The old picture can be used as an artifact
inside the case study, don't throw it away."*

Ruled by `.claude/skills/build-case-study/SKILL.md` section 8f. First run: 2026-09-18,
five published records plus Case 03, picks in `prompts.example.json` under `picked`.

## Steps

1. **Write three concepts per record** in a `prompts.json` shaped like
   `prompts.example.json`: the shared `style` line, `records` (slug, label, current cover)
   and three `items` per record (A, B, C). Make each concept a different idea, not three
   crops of one: a person reacting, an object or metaphor with no words, a before and
   after. Words in the picture: at most four, in quotes after `reading exactly:`. Never a
   figure, a date, a client name or a screenshot of a real interface.

2. **Generate** on the production host, inside `accelerator-backend` (the OpenAI key never
   leaves it), then copy the PNGs out and delete them from the container:

   ```bash
   scp generate.js prompts.json root@95.216.199.47:/root/thumbs/
   ssh root@95.216.199.47 'docker cp /root/thumbs/generate.js accelerator-backend:/tmp/ && docker cp /root/thumbs/prompts.json accelerator-backend:/tmp/ \
     && docker exec accelerator-backend node /tmp/generate.js /tmp/prompts.json /tmp/thumbs-out 3 \
     && docker cp accelerator-backend:/tmp/thumbs-out /root/thumbs/out && docker exec accelerator-backend rm -rf /tmp/thumbs-out /tmp/generate.js /tmp/prompts.json'
   scp -r root@95.216.199.47:/root/thumbs/out . && ssh root@95.216.199.47 'rm -rf /root/thumbs'
   ```

   About 20 seconds per image, three at a time. 2026-09-18: 18 images, 24,696 image tokens.

3. **Build the review page and look at every image yourself first:**
   `python build_review.py --prompts prompts.json --out-dir out --html thumbnails-review.html`.
   Read each hook word by word. Any word the prompt did not ask for (the model invents
   slogans on cards, screens and signs) gets a `notes` entry so the page flags it. Open the
   page for Ali; he picks one per record (the page builds the line to paste back).

4. **Fix invented words on a pick** without changing anything else:
   `python finalize.py mask <pick.png> mask.png --poly "x,y x,y ..."`, then `edit.js` in the
   container, then `python finalize.py composite <pick.png> <edited.png> <fixed.png> --poly "..."`.
   The composite is not optional: the model redraws outside the mask (measured: it dropped
   the photograph from the card it was asked to reword).

5. **Crop to 16:9** (`python finalize.py crop <pick.png> frontend/public/site-v2/thumb-<name>.jpg --top N`),
   choosing `--top` so the hook words stay in frame, and check every crop on one sheet
   (`python finalize.py sheet sheet.jpg thumb-*.jpg`). Commit the JPEGs in the assets PR;
   Ali merges; deploy nginx through `scripts/deploy-prod.sh`; confirm each URL answers 200.

6. **Point the record at it** with `apply-cover.js` inside `accelerator-backend`: dry run
   first, then `--apply`. It writes the `photo` artifact (captioned from
   `cover-caption.json`), the cover, the video poster and a re-stamped visual story in one
   snapshot, and republishes only where the record is already live. A record that is not
   live is left as a draft.

7. **Look at the live pages** on all three sites: the masthead poster is the new picture,
   the old cover is in the body, the index card shows the new picture.

## What the caption may say

The picture is published as `artifact_type: 'photo'`, which the projection always stamps
`presentation: 'atmosphere'`: it can never be read as evidence of the work. Its title
starts `Illustration: ` and describes what is in the picture (it is the image's alt text).
Neither the title nor the description may contain a word from `DELIVERED_WORK_CLAIMS` in
`caseStudyArtifactPresentation.ts` ("the system", "the dashboard", "proof", "production"
and the rest): the projection drops an atmosphere picture that claims to show the work,
and a dropped cover silently falls back to a screenshot. `apply-cover.js` refuses such a
caption before writing, and `backend/src/__tests__/caseStudyCoverThumbnail.test.ts` pins
the default description against the list.
