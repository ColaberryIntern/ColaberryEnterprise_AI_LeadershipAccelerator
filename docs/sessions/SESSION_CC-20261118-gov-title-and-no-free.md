# CC-20261118: government title at the site-wide size, and no "free" on the signed-in company page

Asked by Ali on 2026-11-17, after W18-W22 went live. Basecamp tickets: W23 10521090737 and W24 10521090747.

## W23: the /government title

- The title moves out of the catalog toolbar (31px; 25px on a phone) into a page header.
- The header has a HOME / GOVERNMENT breadcrumb and the home-page title size: 96px on desktop, 46px on a phone.
- The one-screen catalog follows below, unchanged.
- The size rule sits in the page's last design-system style block, so the earlier `!important` toolbar sizes cannot override it.
- Test: `heroTitleScale.test.ts`, W23 block.

## W24: no "free" on the company page

- `CompanyPage.tsx` loses all 8 "free" strings.
- The copy-lint baseline drops from 238 to 230.
- The invite email this page sends was already clean.

## Verification

- **Local /government:** title is 96px at 1440 and 46px at 390. Breadcrumb present, no sideways scroll, no page errors.
- **Frontend full suite:** 10,301 passed and 1 failed. The failure (`publicNextOpenHouseJs`) also fails on clean main.
- **Frontend tsc:** clean.
- **Backend:** copy and typography lints pass.
