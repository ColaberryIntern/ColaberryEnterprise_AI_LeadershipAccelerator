# Connecting every network: what each platform needs

The platform can now connect **LinkedIn (personal)**, **LinkedIn Company Pages**, **Facebook Pages**,
**Instagram**, **YouTube**, **TikTok** and **X** to a brand. Each network only works once
Colaberry has a developer app registered with that platform, the same way LinkedIn needed app
`86e3lkpm791ybb`. Creating those apps needs a person's login and the business's identity, so
this document is the checklist for doing it.

**Connecting is not the same as posting.** A connected account stores the sign-in securely and
shows up on the Overview and the Brands page. Posts to that network are still **handed off**:
the platform prepares the exact post and a person publishes it. That continues until the
network's publishing adapter is built and switched on in `LIVE_CONNECTORS`. As of 2026-09-18,
direct posting is BUILT for LinkedIn personal profiles (live in production), LinkedIn Company
Pages, Facebook Pages and Instagram; it is switched ON only for `linkedin_member`. YouTube, TikTok
and X connect but still hand off. The Overview's "Posted by hand" line always shows which
networks are still handoff.

All times Central.

---

## Before any of them: the redirect URLs

Every platform asks for an **authorized redirect URL**. It must match character for character:
no trailing slash, and `https`. These are the exact values:

| Network | Redirect URL to register |
|---|---|
| LinkedIn Company Page | `https://www.refactored.ai/api/marketing/oauth/linkedin_org/callback` |
| Facebook & Instagram | `https://www.refactored.ai/api/marketing/oauth/meta/callback` |
| YouTube | `https://www.refactored.ai/api/marketing/oauth/youtube/callback` |
| TikTok | `https://www.refactored.ai/api/marketing/oauth/tiktok/callback` |
| X | `https://www.refactored.ai/api/marketing/oauth/x/callback` |

The Brands page shows the same URL under each network's **What it needs**. Copy it from there
if in doubt; it is computed by the server, so it cannot drift from what the server expects.

**Do the connecting on `www.refactored.ai`**, not `enterprise.colaberry.ai`. The networks send
the browser back to refactored.ai, and sign-ins are per host.

## Getting the credentials onto the server

Each network produces an ID and a secret. Either:

- put them in a text file in your Downloads folder and tell Claude the file name (the LinkedIn
  pattern), or
- SSH to `root@95.216.199.47` and add them to the backend env file yourself (the same file that
  holds `SOCIAL_CREDENTIAL_MASTER_KEY`), then restart the backend.

Never paste a secret into Basecamp, email, chat or a screenshot. After the restart, the Brands
page's **Connect a network** list shows the network as **Ready to connect**.

---

## LinkedIn Company Page

**Why a second LinkedIn app:** posting as a Company Page needs LinkedIn's **Community Management
API**. LinkedIn only accepts that request on a **new app that has no other products**, so the
existing app (which also serves a Bubble app) cannot be reused and must not be touched.

1. https://www.linkedin.com/developers/apps → **Create app**, associated with the Colaberry
   Company Page.
2. **Products** tab → request **Community Management API**. This is vetted; LinkedIn grants the
   *Development* tier first (500 calls per app per day), then *Standard* after a screencast review.
3. **Auth** tab → add the redirect URL above. Copy the Client ID and Primary Client Secret.
4. Server variables: `LINKEDIN_ORG_CLIENT_ID`, `LINKEDIN_ORG_CLIENT_SECRET`.
5. The person connecting must be a **Super admin** or **Content admin** of the Company Page.
6. To post directly once connected, add `linkedin_organization` to `LIVE_CONNECTORS`
   (currently `linkedin_member`), then restart.

## Facebook Pages and Instagram (one Meta app covers both)

1. https://developers.facebook.com/apps → **Create app** → type **Business**, attached to
   Colaberry's Meta Business portfolio.
2. Add the **Facebook Login for Business** product.
   - **Settings** → **Valid OAuth Redirect URIs** → add the Meta redirect URL above.
   - **Configurations** → create one: token type **User access token**, with the permissions
     `pages_show_list`, `pages_read_engagement`, `pages_manage_posts`, `instagram_basic`,
     `instagram_content_publish`, `business_management`. Copy the configuration's **ID**.
3. **App roles** → add Ali, Sohail and Aleem as **Administrators** or **Testers**. Until Meta
   grants Advanced Access (App Review, plus Business Verification), only people with a role on
   the app can connect. For Colaberry posting to its own Pages, that is enough indefinitely.
4. **Settings → Basic** → copy the **App ID** and **App Secret**.
5. Server variables: `META_APP_ID`, `META_APP_SECRET`, `META_LOGIN_CONFIG_ID` (the
   configuration ID from step 2).
6. **Instagram** must be a **Business or Creator** account, linked to a Facebook Page you
   administer. In the Facebook sign-in window, tick the Pages to connect; each one's linked
   Instagram account connects with it.
7. To post directly once connected, add `meta_facebook_page` and/or `meta_instagram` to
   `LIVE_CONNECTORS` and restart. Facebook also needs its App Review submitted before the
   platform will treat it as direct - the Composer says so on the post itself.

What Facebook and Instagram accept once switched on: text, one photo, up to 10 photos as a
carousel, or one MP4. Instagram has no text-only post. Meta FETCHES each attachment from a
short-lived signed URL on `www.refactored.ai`, so that host must stay reachable at publish time.

Limits: Instagram allows 100 API-published posts per account per 24 hours. Instagram has no
text-only posts; every post needs an image or video.

## YouTube

1. https://console.cloud.google.com → use the existing Colaberry project (it already holds the
   YouTube API key) or create one.
2. **APIs & Services → Library** → enable **YouTube Data API v3**.
3. **OAuth consent screen** → External; add the scopes `youtube.upload` and `youtube.readonly`;
   while the app is in *Testing*, add every account that will connect as a **test user**.
4. **Credentials → Create credentials → OAuth client ID** → type **Web application** → add the
   YouTube redirect URL above. Copy the Client ID and Client secret.
5. Server variables: `YOUTUBE_OAUTH_CLIENT_ID`, `YOUTUBE_OAUTH_CLIENT_SECRET`.

**The rule that matters:** until the project passes YouTube's API compliance audit, every video
uploaded through the API is **locked to private**. Connecting works at once; public uploads
need the audit, which is applied for from the Google Cloud console.

## TikTok

1. https://developers.tiktok.com → **Manage apps → Connect an app**.
2. Add **Login Kit** (redirect URI: the TikTok URL above) and the **Content Posting API**
   (scopes `user.info.basic`, `video.upload`, `video.publish`).
3. Copy the **Client key** and **Client secret**.
4. Server variables: `TIKTOK_CLIENT_KEY`, `TIKTOK_CLIENT_SECRET`.

**The rule that matters:** until TikTok audits the app, everything it posts is **private**
(visible only to the account owner). Apply for the audit from the developer portal.

## X

1. https://developer.x.com → **Projects & Apps** → create an app.
2. **User authentication settings** → OAuth 2.0 **on**, type **Web App, Automated App or Bot**
   (a confidential client), permissions **Read and write**, callback URL: the X URL above.
3. Copy the **OAuth 2.0 Client ID** and **Client Secret** (not the older API Key and Secret).
4. Server variables: `X_OAUTH_CLIENT_ID`, `X_OAUTH_CLIENT_SECRET`.

**Cost, because X is the only network that charges:** the X API is pay-per-use with prepaid
credits bought in the developer console. As of 2026-09-18: about **$0.015 per post**, and
**$0.20 per post that contains a link**. Marketing posts usually carry a tracked link, so budget
at the $0.20 rate: 60 posts a month is about $12. Connecting costs one account lookup.

---

## After connecting

- The **Brands** page lists the new accounts under the brand, with their status.
- The **Overview → Accounts** panel shows the same accounts. Networks with no direct posting yet
  stay on its "Posted by hand" line.
- Sign-ins do not last forever:
  - LinkedIn personal: 60 days, no renewal. Reconnect before the date shown.
  - Meta Pages: tokens that do not expire.
  - X, YouTube and TikTok: short sign-ins with long-lived renewal keys, so their connections
    stay alive. Renewing is built with each network's publishing adapter.
