# CC-20261102-k9r4 - BUG-7: say who may press Connect, before they press it

**Date:** 2026-11-17 (Central)
**Workstream:** Marketing ops (BC list 10467338643)
**Ticket:** BUG-7 (10518690041), due 2026-11-24

## The bug, stated precisely

The Brands page rendered Meta as **"Ready to connect"** with a live Connect button. The one thing
that would actually stop an operator - *you personally need a role on our Meta app* - was already
in the codebase, in `metaConnector.requirements`, but it was:

1. inside a `<details>` that is **closed by default**,
2. labeled **"Platform rules"** once the server is configured, which reads as background reading,
3. and buried mid-paragraph between `META_LOGIN_CONFIG_ID` and Instagram's rate limits.

So the product said "Ready", Sohail pressed Connect three times on 13 Nov, Facebook refused him at
its own screen, and he learned nothing from any of the three attempts.

## Two findings that changed the plan

**1. The ticket proposed an option that does not exist.** BUG-7's description offered "detect a
started-but-never-returned attempt from the oauth state record". There is no such record.
`oauthState.ts` is explicit: the state is an **HMAC, signed and not stored** - "the callback
verifies it with no table, no sweep, and no cleanup job". Detecting an abandoned attempt would mean
adding storage, which is a schema change for a message we can state up front for free. Not done,
deliberately.

**2. The field was already there and already documented as belonging where it was not.**
`connectorTypes.ts` says `requirements` is "shown on the Brands page next to the button, so nobody
discovers a platform rule by being refused". The intent was right; the rendering buried it. So this
is a separation, not an invention: who may sign in is now its own field.

## What changed

| File | Change |
|---|---|
| `oauth/connectorTypes.ts` | new optional `accessNote` - what the PERSON needs, vs what the server needs |
| `oauth/providers/meta.ts` | `accessNote` set; the role sentence removed from `requirements` so it lives in one place |
| `oauth/connectorRegistry.ts` | `access_note: string \| null` on `ConnectorStatus`, mapped from `accessNote` |
| `services/channelAccountApi.ts` | same field on the frontend type |
| `marketing/ConnectNetworks.tsx` | renders it **above** the `<details>`, and a network with an access note says "Set up on the server" instead of "Ready to connect" |
| `oauth/__tests__/connectors.test.ts` | 4 new cases |
| `marketing/__tests__/ConnectNetworks.test.tsx` | **new**, 5 cases |
| `marketing/__tests__/ChannelAccountsPanel.test.tsx` | fixture given the new field (see below) |
| `docs/marketing/CONNECT_NETWORKS.md` | new section: "Set up on the server" is not "you can connect" |

## Why the test asserts position, not presence

The note was *already present in the DOM* before this change, inside the collapsed detail. A test
that only searched the markup for the text **would have passed against the bug**. So the test
asserts `details.contains(note) === false` and that the detail is genuinely `open === false`.

## A typecheck trap caught before pushing

`ChannelAccountsPanel.test.tsx` declares `const CONNECTORS: ConnectorStatus[] = [...]` with an
explicit annotation and **no `as` cast**. Adding a required `access_note` to the interface would
have failed the **Frontend typecheck** gate, which is the authoritative frontend gate. Found by
searching for other constructors of the type rather than by waiting for CI. Its row-level
assertions use the TikTok row, so giving Meta an access note does not disturb them.

## Deliberately not claimed

The text says only what is true of every attempt: a role is required, here is who grants it, here
is where to accept it. It does **not** say that a missing role caused any particular failure.
Sohail's 17 Nov screenshot read **"App not active"**, which is about the app rather than the
signer, so the role is a necessary condition and not provably the only one. BUG-6 still owns that
question.

## Not done

- **Nothing is deployed.** A merged frontend change is not live until nginx rebuilds.
- BUG-6 remains open and still needs Ali to press Connect; that is the discriminating test.
