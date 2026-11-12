# Session CC-20261111-r7m2 — the student delete control says "Delete"

Follow-on from the admin soft-delete work. Swati emailed Ali on 2026-11-11 asking him to delete a
project because she could not find a delete option in Project Studio.

## She was right, and the control was there the whole time

The student-facing control existed, on the Projects page, labelled **Remove**. The archived list
was headed **Removed builds**. The confirmation dialog said **Remove "..."?** and asked an unnamed
build to be confirmed by typing **REMOVE**.

The word "delete" appeared exactly once in the whole surface, in a sentence reading *"Nothing is
deleted"*. So someone searching for a delete option found nothing, which is precisely what happened.

- [x] Rename the student control to the word people search for
  - Date: 2026-11-11 · Session: CC-20261111-r7m2
  - What changed: the button and its aria-label, the archived-list heading, the dialog heading, the
    loss-list heading, and the confirmation word. `ProjectsPage.tsx` and `ArchiveProjectDialog.tsx`.
  - Verification: frontend `tsc` 0 errors in `src/`; `CI=true npm run build:frontend` compiled with
    no warnings; **853 tests pass** across the 74 projects suites.

### The bug this introduced, and caught

Renaming the rendered instruction to "type DELETE" left `requiredPhrase` comparing against
`'REMOVE'`. The confirm box would have asked for one word and accepted only another, so an unnamed
build could never be deleted at all.

Fixed by extracting `CONFIRM_WORD` and using it in **both** the comparison and the copy, so they
cannot drift apart again. A shared constant is the fix; noticing twice is not.

### Honesty, relocated rather than removed

The dialog used to say "Nothing is deleted", which was true when the button said Remove and becomes
a contradiction when the button says Delete. It now reads:

> This takes it off your Projects page. **It is recoverable** — nothing is erased, and you can put
> it back from *Deleted builds* at the bottom of this page.

That is a stronger sentence than the one it replaced: it says where the project goes and how to get
it back, rather than only what did not happen.

### Two tests updated, neither relaxed

`ArchiveProjectDialog.test.tsx` asserted the literal strings "Nothing is deleted" and
`Remove "Student Early Warning"?`. The PROPERTIES they guard - the dialog leads with reversibility,
and the heading names the project - are unchanged and still asserted; the reversibility test is now
stricter, checking three separate claims instead of one phrase.

### Not done

- **Project Studio still has no delete control.** The rename makes the existing control findable
  for anyone on the Projects page; it does not put one where Swati actually looked. That is a
  larger change and is Ali's call.
- Not deployed.
