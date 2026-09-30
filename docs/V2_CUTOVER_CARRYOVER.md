# Cutover carry-over inventory

What exists on the live `enterprise.colaberry.ai` that V2 does not have, sorted by
whether it can be carried across as-is. Compiled 2026-08-12 by crawling the live
public site (7 routes) and reading every image.

The point of this document is the middle column. Switching over should not lose a
real asset, and it should not carry a fabricated one across by accident.

---

## 1. Carry across — real assets, no claim attached

| Asset | Where it lives now | Note |
|---|---|---|
| `book-cover.jpg` (334x500) | homepage, `/program` | **"Trust Before Intelligence", by Ram Katamaraja, CEO of Colaberry.** A real book by a real author. The strongest owned asset on the site and V2 has nothing like it. |
| `team-collab.jpg` (1280x960) | homepage | Good quality, warm, natural. |
| `member-home.jpg` (1280x960) | `/case-studies` | Good quality. |
| `mentor-coaching.jpg` (1280x960) | `/case-studies` | Good quality. |
| `presentation.jpg` (1280x960) | `/demo-day` | Good quality. See the caption warning below. |

All five are copied to `frontend/public/site-v2/photos/`. They are already
published on the live site, so carrying them creates **no new licensing exposure** —
it is the same asset on the same company's site.

**V2 currently contains zero photography.** Every image is a product screenshot.
That is the single biggest visual gap against the live site, and these five close it.

### Caption rule for the photographs

These read as licensed stock, not photographs of Colaberry people or events. That
is fine as atmosphere and not fine as evidence. Concretely:

- Acceptable: a photograph beside a section about how teams work together.
- **Not acceptable:** captioning `presentation.jpg` as a Demo Day presenter, or
  `team-collab.jpg` as "our team". The person in `presentation.jpg` is
  identifiable and is almost certainly not one of your builders; putting him on a
  Demo Day page implies he presented there.

The rule is the same one the claims registry applies to numbers: a picture
presented as evidence of something that did not happen is a fabricated claim, it
just happens to be made of pixels.

---

## 2. Carry the idea, rewrite the copy — real concepts V2 is missing

| Concept | Live source | Why it is worth keeping |
|---|---|---|
| **Demo Day** | `/demo-day` (whole page) | "The day builders stop talking about AI and show what they shipped." Five minutes on stage, real deployed projects, judged, framed as *talent discovery* for the sponsor. Distinctive, concrete, and an obvious sales asset. V2 has nothing equivalent. **Verify it actually runs before describing it in the present tense.** |
| **The self-paced program** | `/program` (whole page) | Learn on your own time, build on your own workflows rather than toy problems, weekly live events, a cross-company network. V2 describes engagements but never the programme a licensed seat actually buys. |
| **"From AI Aware to AI Architect"** | homepage, `/program` | The maturity ladder as a narrative. V2 has the nine-rank ladder in product screenshots but never explains the journey in words. |
| **"When your CIO logs in, they see momentum, not courses"** | homepage | The sharpest single line on the live site. It is the same argument as V2's "readiness comes from evidence, not course completion", better phrased. |
| **"One score that measures it all"** | homepage | Readiness as a single number an executive can hold. |
| **"From a block of seats to proven builders"** | homepage | The sponsor's journey, which is exactly the buyer V2's pricing targets. |
| **"Every organization already has its future AI leaders"** | homepage | Talent-discovery framing; pairs with Demo Day. |
| **"How the free trial works"** | homepage | An explicit trial explainer. V2 now has `/v2/start`, but no equivalent step-by-step. |
| **Licence model in plain words** | `/pricing` | "Start free, invite your team free, activate licences when ready." Clear, and it matches the registry-approved free-tier claim. |

---

## 3. Do NOT carry — these are the claims the audit blocked

| Content | Live source | Why |
|---|---|---|
| "Priya Nair shipped the Claims Triage Copilot" | `/case-studies` | Fabricated case study with invented client quotations. `casestudy.fabricated` is `DO_NOT_PUBLISH`. |
| "Marcus Bell shipped the Maintenance Knowledge Agent" | `/case-studies` | Same. |
| **"We put your people in Anthropic-partner hands"** | `/case-studies` | The unverified partner designation. `anthropic.partner` is blocked; the application was submitted, admission is not evidenced. |
| **"Get certified as an Anthropic AI Systems Architect"** | `/program` | `credential.cca` is blocked. The safe wording — certification *preparation*, credential issued by the certifying body — is already in V2. |
| "95% of AI pilots fail" as a bare fact | homepage, book cover | `research.book95` is `NEEDS_VERIFICATION` **but its registry note says it may ship once rendered as an attributed citation rather than a bare fact.** So: usable as *"the thesis of Trust Before Intelligence, by Ram Katamaraja"*, not as a statistic in our own voice. |
| "477% ROI in 90 days" | book marketing | `DO_NOT_PUBLISH`. It is a case study *inside the book*, not a Colaberry client outcome, and next to platform copy it reads as ours. |

---

## 4. Separate defect found while crawling

`sitemap.xml` on `enterprise.colaberry.ai` lists **eight `www.colaberry.com` URLs** and
none of its own. Search engines are being pointed at a different domain entirely,
and `/case-studies` — the fabricated one — is among the URLs listed. Worth fixing
at cutover regardless of what else happens.

---

## Recommended order

1. **Book section** — highest value, lowest risk. Real asset, real author, and the
   registry already describes how to cite the thesis safely.
2. **Photography** into the existing section splits, under the caption rule above.
3. **Demo Day page** — verify it runs, then build it. Best sales asset on the old
   site and the one V2 most obviously lacks.
4. **Programme page** — what a licensed seat actually buys.
5. **Sitemap** — fix the domain, drop the withdrawn routes.
