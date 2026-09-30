# LinkedIn go-live: from credentials to the first direct post

Everything the composer offers - text, image, multi-image, video, PDF document, poll - already
has a LinkedIn wire path, tested without a network. What turns it on is one LinkedIn app and
four environment variables. This is the checklist, in order. Times below are Central.

## 1. Ali: create the LinkedIn app (about ten minutes, once)

1. Go to https://www.linkedin.com/developers/apps and **Create app**. Associate it with the
   Colaberry company page (the app must belong to a page; this does not post to that page).
2. On the **Products** tab, request **Share on LinkedIn** and **Sign In with LinkedIn using
   OpenID Connect**. Both are self-serve: they activate without a review.
3. On the **Auth** tab:
   - Copy the **Client ID** and **Primary Client Secret**.
   - Under **Authorized redirect URLs for your app**, add exactly:
     `https://www.refactored.ai/api/marketing/linkedin/callback`
     (No trailing slash. LinkedIn matches this character for character.)
   - Confirm the OAuth 2.0 scopes shown include `openid`, `profile`, `w_member_social`.

The client secret is a credential. Send it to the box, not to a chat: SSH in and paste it into
the env file directly (step 2). Never into Basecamp, email, or a screenshot.

## 2. On the box: four variables and a restart

On `ssh root@95.216.199.47`, in the backend's environment file used by
`docker-compose.production.yml` (the one `SOCIAL_CREDENTIAL_MASTER_KEY` already lives in):

```
LINKEDIN_CLIENT_ID=<from the Auth tab>
LINKEDIN_CLIENT_SECRET=<from the Auth tab>
LINKEDIN_REDIRECT_URI=https://www.refactored.ai/api/marketing/linkedin/callback
LIVE_CONNECTORS=linkedin_member
```

Then `docker compose -f docker-compose.production.yml up -d backend` (no `--build`: nothing in
the image changes). The backend logs `live_connector_*` warnings at boot if a key is misspelled
or names a provider with no adapter; a correct value logs nothing.

`LIVE_CONNECTORS` is the ON switch. Leave it unset and the app credentials still let people
connect accounts, but every post stays a handoff package. Set it and LinkedIn (personal
profile) posts publish directly. `linkedin_organization` (company page) can be added later; it
needs the Community Management API product, which LinkedIn reviews.

## 3. Sohail or Aleem: connect a profile (two minutes)

1. Admin -> **Brands** (`/admin/brands`). Select the brand.
2. Under **Connected accounts**, click **Connect**. The whole window goes to LinkedIn.
3. Approve. LinkedIn returns to the Brands page with "LinkedIn account connected."
   - The row shows the profile name and the scopes granted. If `w_member_social` is listed
     under **missing**, the member declined posting permission: disconnect and connect again.

Whoever connects their profile is whose profile the brand's LinkedIn posts publish FROM.
If two people connect, the most recently connected profile is used; the composer's
confirmation screen names which one before every publish.

## 4. The first post: watch it

1. Compose as usual. On the confirmation screen, **Accounts** now reads
   "LinkedIn (personal profile) - Direct publish - Account: <name>". If it says "none
   connected", step 3 did not complete.
2. **Schedule it two minutes out** rather than "Publish now", so the worker's path is the one
   exercised, and watch **Publishing** on the same page: the job goes pending -> publishing ->
   published, with the LinkedIn post URL on the receipt.
3. Open the URL. Then click the tracked link in the post and confirm the click lands in the
   Campaign graph.

If the job dead-letters, the reason on the row is the fix: `NoAccount` (step 3),
`ProviderValidationError` (the composer's Validate would have said the same),
`426` (LinkedIn retired the API version in `LINKEDIN_API_VERSION`; a code change),
`401/403` (the token was revoked on LinkedIn's side; reconnect).

## What is deliberately not on this list

- Company-page posting (`linkedin_organization`): needs LinkedIn's Community Management API
  review. The adapter is built; the switch waits for the approval.
- X, Meta, TikTok, YouTube: no live adapters. They remain handoff packages by design until
  each has an approved app and a paid-tier decision where one applies.
- Token refresh: LinkedIn member tokens last about 60 days. The account row shows the expiry;
  reconnecting is the refresh. An expiring-soon warning on the Brands page is a follow-up.
