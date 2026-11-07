/**
 * l46Findings — what the L4.6 mutation run established beyond "all seven were killed".
 *
 * Seven kills and no survivors is the least interesting true sentence about this run. What the
 * run actually measured is how BROADLY each reversal is noticed, and the spread is wide: from
 * six tests down to one. The findings below are the places where that number, or the reason
 * behind it, is not what a reader would assume.
 *
 * Every finding here was measured, not reasoned about. Where a claim is about a test's
 * behavior it was produced by running that test under the mutation.
 */

const FINDINGS = [
  {
    key: 'single-assertion',
    heading: 'Each of the audience read\'s three rules rests on exactly one assertion',
    body: 'Count the person not the tab, only count the fresh, exclude staff and test accounts: '
      + 'these are the three things that make `watching_now` a number anyone can act on. Each '
      + 'one was reversed, and each reversal was noticed by **one** test out of 157 — all three '
      + 'in `broadcastTelemetryQuery.test.ts`, each a regex over the SQL text.\n\nThe other 156 '
      + 'tests stayed green through all three. So renaming or deleting one `it()` leaves a whole '
      + 'property of the measurement unprotected, and the suite still reports green. That is not '
      + 'an argument for more tests; it is the thing to know before trusting "the audience read '
      + 'is tested" as a statement about anything other than its SQL text.',
  },
  {
    key: 'window-test-passes',
    heading: 'A test named for the freshness window passes with the freshness window deleted',
    body: 'The describe block is called *"the freshness window is IN the query"* and holds two '
      + 'tests. Deleting `AND s.last_beat_at >= :cut` from the query kills one of them.\n\nThe '
      + 'other — `derives the cut from viewerExpirySeconds, not from a hardcoded number` — '
      + '**passes**, because it asserts the replacement VALUE rather than the predicate:\n\n'
      + '    expect((repl.cut as Date).toISOString()).toBe(...)\n\n'
      + '`cut` is still computed and still passed in the replacements object when nothing in the '
      + 'SQL refers to it. The test is correct about what it checks and is not evidence for what '
      + 'its name suggests. This is the same shape as L8.3\'s finding, in a different file: the '
      + 'assertion that reads as if it guards the rule is checking one layer to the side of it.',
  },
  {
    key: 'mock-withdraws-fixture',
    heading: 'Three of the four local kills on the lock are the mock going quiet, not evidence',
    body: 'Removing `FOR UPDATE` reddens four tests without a database. Only one of them, '
      + '`serialises concurrent tabs with FOR UPDATE`, is an assertion about the lock — and it ' // spelling-exempt
      + 'is a regex over the SQL.\n\nThe other three fail for a mechanical reason. The suite\'s '
      + 'fixture supplies the stored person row **only when the SQL matches `/FOR UPDATE/`**:\n\n'
      + '    query.mockImplementation(async (sql: string) => (\n'
      + '      /FOR UPDATE/.test(sql) ? [{ last_credited_at: lastCreditedAt, intent }] : []\n'
      + '    ));\n\n'
      + 'Take the lock out and the mock answers "this person has never been seen", so the '
      + 'service credits nothing and keeps no stored intent — and `caps a long gap`, '
      + '`a stored deliberate survives a later auto beat` and `TWO TABS FOR ONE PERSON CREDIT '
      + 'ONCE` fail because the fixture withdrew, not because the behavior is wrong.\n\n'
      + 'The mock is a reasonable way to tell the queries apart. The consequence is that '
      + 'mutating the lock perturbs the fixture, so the local tier cannot produce clean evidence '
      + 'about the lock at all. The two kills that are genuinely behavioral are both in the '
      + 'Postgres tier — which is the next finding.',
  },
  {
    key: 'postgres-tier',
    heading: 'The Postgres tier is where the dedup rule is actually proven — and it skips silently',
    body: '`broadcastTelemetryAnchorRace.integration.test.ts` is gated on `DATABASE_URL` and '
      + 'SKIPS without one, with a console warning that says in as many words that it is "NOT '
      + 'evidence ... unless it actually ran". Run the telemetry scope the ordinary way and it '
      + 'reports **5 suites, 152 tests, 5 skipped** — green, and missing the only behavioral '
      + 'evidence about the lock.\n\nMeasured, both ways: re-keying the anchor to the tab is '
      + 'noticed by **five** tests with a database and **one** without. Dropping the lock is '
      + 'noticed by six with and four without, and of those four, three are the fixture '
      + 'artifact above.\n\nIt is not hard to run — the suite\'s docblock carries a one-line '
      + '`docker run` on a dedicated port with throwaway credentials, and it takes eight '
      + 'seconds. CI runs it in the "Integration tier (Postgres)" job. A local run that omits it '
      + 'is the one that should not be quoted as evidence.',
  },
  {
    key: 'contract-vs-shape',
    heading: 'The one place the contract itself is tested, rather than its outward shape',
    body: 'The 503 branch was reversed twice: once crudely, into a 200 with a fabricated zero, '
      + 'and once subtly — keep the 503, keep `available: false`, keep the reason, and add '
      + '`watching_now: 0` beside them.\n\nBoth died, to the same single test, because that test '
      + 'does not stop at the status code:\n\n'
      + '    expect(body).not.toHaveProperty(\'watching_now\');\n'
      + '    expect(body).not.toHaveProperty(\'deliberate\');\n'
      + '    expect(body).not.toHaveProperty(\'auto\');\n\n'
      + 'That is the difference between the two halves of this record. Three of the audience '
      + 'read\'s rules rest on one assertion each, and so does this one — but this assertion '
      + 'requires the ABSENCE the requirement is actually about, and so it catches a reversal '
      + 'designed to look correct. "One test" is not the problem; what the one test asserts is.',
  },
  {
    key: 'flake-manufactures-a-kill',
    heading: 'A flaky test inside the scope can manufacture a kill',
    body: 'On the batch run, the staff-and-test reversal showed **two** failures: the real one, '
      + 'and `puts the rundown on the producer READ budget, not the command one` — a rate-limit '
      + 'test in a different file that cannot be causally affected by a line removed from a SQL '
      + 'string.\n\nIt fires 61 concurrent requests and asserts the 62nd is throttled, so it is '
      + 'timing-sensitive under CPU load, and the batch run supplied the load. Re-run on its own '
      + 'it passes (3/3), and the reversal re-run in isolation kills exactly one test. The '
      + 'record says one.\n\nWorth keeping because of the case that is not this one: if a '
      + 'reversal nothing really catches happens to coincide with a flake, the record says '
      + '"killed" and names a test that failed for an unrelated reason. **Any single failure '
      + 'outside the module under mutation should be re-run in isolation before it is believed** '
      + '— which is the same discipline as checking the suite count, applied to the kill list.',
  },
];

const TOTALS = (() => ({ findings: FINDINGS.length }))();

module.exports = { FINDINGS, TOTALS };
