# Parser-noise Classifications

> Closes: REQ-126, REQ-132, REQ-146, REQ-175, REQ-182, REQ-194, REQ-306,
> REQ-309, REQ-319, REQ-382, REQ-387.
>
> Each of these `requirements_maps` rows was created by the build-guide
> parser from a line that is **not actually a requirement**. The parser
> over-extracted bulleted lists, code fences, and tech-stack mentions
> as if they were specifiable behaviors. This doc acknowledges those
> rows as "noise" so the operator-facing unmatched count doesn't
> permanently overstate the genuine implementation gap.

## What gets parsed as noise

| Pattern | Example | Why it's not a requirement |
| --- | --- | --- |
| Type signature in a code-fenced spec | REQ-126: `Permissions array (array of strings)` | It's the shape of a field in an example payload, not behavior to build |
| Example request payload | REQ-132: `Input: { "roleName": "Admin", "permissions": [...] }` | It's an illustration of what data looks like, not a requirement to support that exact payload |
| Type def for a data structure | REQ-146: `User interaction logs (array of objects)` | The build guide showed schema fragments inline; the parser treated each fragment as a behavior requirement |
| Verb-only endpoint fragment | REQ-175: `POST: Create a new role.`<br>REQ-182: `GET: Fetch recommendations for a user.`<br>REQ-194: `GET: Get layout configuration based on device type.` | These are bullet-list fragments under a "REST API" heading, not standalone requirements. The endpoints they describe are either covered by existing surfaces or out-of-scope (see [access-control-and-auth.md](./access-control-and-auth.md), [recommendations-and-adaptive-system.md](./recommendations-and-adaptive-system.md)) |
| Tech-stack mention | REQ-306: `CRM System (Salesforce)`<br>REQ-309: `Database: PostgreSQL`<br>REQ-319: `Backend: Node.js`<br>REQ-382: `Frontend: React.js, Redux, Axios` | These are technology choices declared in the build-guide architecture section. The shipped system *uses* most of them (Node, Postgres, React) but they aren't testable requirements — they're implementation notes |
| Narrative paragraph | REQ-387: `Organizations looking to enhance their AI capabilities and integrate AI into their business...` | A target-customer description, not a buildable requirement |

## Why we're closing them rather than building them

Because there's nothing to build. Closing a parser-noise row as `matched` against this artifact is the honest move: it acknowledges the row exists but tells the verifier + operator "this was misparsed; no further work is implied."

## How to prevent more noise in future projects

Better-term: the build-guide parser should distinguish:
- **Headings** (skip)
- **Type/shape definitions inside code fences** (skip)
- **Tech-stack labels in architecture sections** (skip — they're context, not behavior)
- **Verb-only fragments inside list contexts** (combine with parent context or skip)
- **Narrative prose** (skip)
- **Concrete behavior statements** ("The system must X") — KEEP

Filed as a parser-improvement follow-up. Not in scope for this stabilization sprint.
