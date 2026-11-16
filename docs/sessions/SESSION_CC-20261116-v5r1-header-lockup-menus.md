# CC-20261116-v5r1 — the header: Colaberry Enterprise lockup, one line, Proof and Government menus

Approved by Ali on 2026-11-16 from a working mock (`handoff-enterprise-site-v5/review/nav.html`):
"Build it as shown".

## What Ali asked

> "With proof and Gov the navigation is getting too extensive and needs to be redesigned. I would
> like for the Proof and Gov to be broken out into categories where our capabilities keep building
> out ... Let's do the same for the categorization of the case studies ... break them down by both
> [industry and department] and let them grow ... Everything else needs to fit neatly at the top.
> Also you are not using the corporate logo - you are using the Colaberry training logo. Fix that."

## The logo

The public header and footer drew `/colaberry-logo-transparent.png`, the red-and-green
**Colaberry Training** wordmark. The enterprise brand's own system,
`github.com/aleemcolaberry/Colaberry-Enterprise-Design-System` (Aleem owns all brand designs, Ali's
ruling of 10 Nov), defines the lockup as *"mark + Roboto 'Colaberry' + the ENTERPRISE tag"*. The
mark is the cherry pair in berry blue `#2E6A86`, with a `#6F9DB6` form for dark backgrounds.

The mark never reached this repository. The design-system sync follows `styles.css` only, and
`assets/cb-enterprise-mark.svg` isn't reachable from it. That's how the training logo stayed, and
why commit `5bf7b47bb` could write that the logo "stays cherry exactly as the enterprise system
prescribes". The colour tokens list cherry as logo artwork, but the system's actual mark is blue.

`EnterpriseLockup.tsx` draws that mark from the upstream SVG's geometry, verbatim, with
`currentColor` so it follows the accent token. Sizes are the system explorer's: mark 28px, word
19px/700, tag 10px/700 tracked 0.16em. The footer uses the dark form. The portal login keeps the
training logo, correctly: the portal is the career school's brand.

## The bar

| Before | After |
|---|---|
| 9 links + Log in, wrapping at 1440px ("How it / works", "The / book", "Start / Free", "Log / in") | 7 items + Log in, one line from 1440px down to 1081px, then the menu sheet |
| Services, How it works, Platform, Pricing, The book, Proof, Government, Start Free | Services, How it works, Platform, **Proof ▾**, **Government ▾**, Pricing, The book |

"Start Free" left the bar (S1 in the page deltas Ali approved). The free workspace stays linked from
Platform and from every page's closing band. Labels can no longer break inside themselves
(`white-space: nowrap`).

## The menus grow on their own

Neither menu is a hand-kept list (`navMenus.ts`):

- **Proof** reads `/api/public/case-study-taxonomy`, which counts published records only. It shows
  case studies by industry, with counts and links to `/proof?industry=<slug>`, the filter `/proof`
  already understands. A new industry appears in the menu when its first record publishes.
- **Government** reads `/api/public/services`, the catalog admins edit. It shows 14 services in 6
  families today, each landing on `/government/?family=<family>#gv-services`.
- **Department** doesn't exist on case studies yet. The column shows "Tagging in progress" with the
  site's six departments as plain text, not links, because a link that filters to nothing is a dead
  end. It switches to real counted links automatically once the taxonomy carries a `departments`
  facet. That facet comes in the next PR.
- **Failure behaviour:** each feed is independent. A failed feed leaves that menu with its "browse
  all" link, never an empty panel. Panels are in the server markup even when closed, so their links
  exist without JavaScript.

**A count bug avoided:** summing the industry counts gives 17, but 18 are published. **One live case
study has no industry.** The total comes from the verification-class facet, which every published
record carries exactly once.

"What we can put our name to" was in the mock's Proof menu but isn't here. The home section has no
anchor, and the single-page app wouldn't scroll to one on load.

## The government page

`public/government/index.html` is a static file with its **own copy of the header**, and it had
drifted:
- a different item order,
- a second "Talk to an Architect" button,
- the training logo, embedded as a base64 image,
- **"Design proposal · not live" in the footer of the live page.**

Now it has:
- the same seven items and both menus, in plain JavaScript; Government is filled from the catalog
  the page already loads, with no second request;
- the lockup in the header and footer (36 KB lighter, without the two embedded images);
- one call to action, and the "not live" line removed;
- `?family=` support, which selects that family's chip after the catalog renders.

`governmentHeaderParity.test.ts` holds this header to `V2_NAV`, so the two can't drift again.

## Guards, mutation-tested

| Mutation | Caught by |
|---|---|
| header back to the training logo | lockup guard + training-logo guard |
| footer back to the training logo | training-logo guard + dark-lockup guard |
| total = sum of industries (17 vs 18) | true-total guard |
| industry list hard-coded | grows-on-its-own guard (and 3 others) |
| pending departments drawn as links | **missed at first.** Added "draws pending departments as plain text" |
| Escape no longer closes a menu | Escape/focus guard |
| Start Free put back on the bar | seven-items guard + inverted Start Free guard |
| gov header: Talk to an Architect returns | one-CTA guard |
| gov header: items out of order | parity guard |
| gov footer: "not live" returns | not-live guard |

**Inverted, not deleted:** the header comment "Start Free stays" became "no longer carries Start
Free", with the reason.

## Verification

- `tsc --noEmit` clean; a planted control error was caught.
- Full frontend suite: 10,082 pass. The one failure, `publicNextOpenHouseJs`, is Windows
  line-ending noise: it fails identically on an untouched tree and passes in CI on `main`.
- Build compiles.
- **Measured on the build** with the two feeds served from the live data saved on 2026-11-16:
  - one line at 1440, 1280, 1180, 1100 and 1081; the menu sheet at 1080; 0 overflow at every width;
  - Proof shows "Browse all 18", Government shows "All 14";
  - `/government/?family=AI` lands with AI selected; no "not live" text;
  - 0 page errors.
- **Looked at:** both menus at 1280, the government page's Government menu, the phone sheet with
  Proof open, and the footer. All match the approved mock.

## Next

1. **Department field:** the field on case studies (a study can touch several), a facet and filter
   on `/proof`, and admin and builder support. The menu then fills itself.
2. **Tagging the 18:** every publish now needs a confirmed service link, and none of the 18 has one.
   Each needs: its service link, department(s), and (for one) an industry, then republish, one at a
   time.
