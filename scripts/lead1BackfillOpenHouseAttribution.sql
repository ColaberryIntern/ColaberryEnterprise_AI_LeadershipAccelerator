-- LEAD-1: attribute historical Open House leads to the brand that ran the class.
--
-- RAN ONCE against production on 2026-11-25 (session CC-20261125-m4t8), approved by
-- Ali in his own words ("merged, run the backfill"). Committed because a 991-row
-- data change to a live table should be reviewable and reproducible, not only a
-- line in a session log. It is safe to re-run: the second run matches zero rows.
--
-- WHY IT WAS NEEDED
--
-- `enrollmentService.createExplorerEnrollment` never resolved a `source_id`, so
-- every lead the Explorer / Open House path captured belonged to no brand -
-- `Lead` has no brand column, and origin brand is derived only through
-- `Lead.source_id -> LeadSource.brand_id`. Measured before this ran: 991 of 992
-- `open_house` leads carried NULL, going back to 2026-07-03, against 307 of 595 on
-- the `free_signup` path which has always passed a slug. The code fix is PR 4449;
-- this is its history.
--
-- WHY IT KEYS ON THE CAPTURE PATH AND NOT THE HOSTNAME
--
-- `lead_sources.domain` is populated for all 11 rows, so matching the host of
-- `page_url` looks like the obvious rule. It is wrong, and measurably so:
-- `www.refactored.ai` resolves to brand `refactored` by domain, yet every
-- attributed lead on that exact host resolves to `training`, because the door is
-- the Colaberry Training class and the domain it is served from does not change
-- whose lead it is. Keyed on the host, this script would have written brand
-- `refactored` onto 221 leads belonging to a brand that never ran the class. The
-- door decides - which is the same rule the shipped code follows.
--
-- WHAT IT DELIBERATELY DOES NOT DO
--
--   * It does not touch `updated_at`. Anything reading that column as recent
--     activity would have seen 991 leads jump to today, which is a second piece of
--     wrong data created while fixing the first.
--   * It does not overwrite an existing `source_id`. One `open_house` lead was
--     already attributed to `ai-flotation`; the WHERE clause skips it and a
--     post-condition proves it survived.
--   * It leaves the other unattributed pools alone - 20,837 `ccpp_winback`, 2,112
--     `apollo`, 690 `ccpp_alumni`, 337 `apollo_contacts`. Those are imports and
--     alumni campaigns, different doors entirely, and nobody has measured what
--     they should resolve to.
--
-- HOW TO RUN IT
--
--   psql -U accelerator -d accelerator_prod -v ON_ERROR_STOP=1 \
--     -f lead1BackfillOpenHouseAttribution.sql
--
-- Capture the affected ids first if you want a rollback list:
--
--   \copy (SELECT id FROM leads WHERE source_id IS NULL AND source = 'open_house'
--          ORDER BY id) TO 'bf_lead_ids.csv' CSV
--
-- Rollback is then `UPDATE leads SET source_id = NULL WHERE id IN (<that list>)`.

\set ON_ERROR_STOP on

BEGIN;

-- GUARD. Exactly one active `training` source carrying a brand must exist. The
-- subquery below would raise on its own if there were two, but failing here names
-- the reason - and failing inside the transaction means nothing is written.
DO $$
DECLARE n int;
BEGIN
  SELECT count(*) INTO n FROM lead_sources
   WHERE slug = 'training' AND is_active = true AND brand_id IS NOT NULL;
  IF n <> 1 THEN
    RAISE EXCEPTION 'GUARD FAILED: expected exactly 1 active training source with a brand, found %', n;
  END IF;
END $$;

-- The source is resolved by SLUG rather than a pasted UUID, so this statement
-- cannot write an id that has stopped meaning what it meant when it was written.
UPDATE leads
SET source_id = (
      SELECT id FROM lead_sources
      WHERE slug = 'training' AND is_active = true AND brand_id IS NOT NULL
    )
WHERE source_id IS NULL AND source = 'open_house';

-- POST-CONDITIONS, checked before COMMIT. Any failure rolls the whole thing back.
DO $$
DECLARE remaining int; flotation int; brand text;
BEGIN
  SELECT count(*) INTO remaining FROM leads WHERE source_id IS NULL AND source = 'open_house';
  IF remaining <> 0 THEN
    RAISE EXCEPTION 'POSTCONDITION FAILED: % open_house leads still unattributed', remaining;
  END IF;

  -- The control: a pre-existing attribution must not have been overwritten.
  SELECT count(*) INTO flotation
    FROM leads l JOIN lead_sources ls ON ls.id = l.source_id
   WHERE l.source = 'open_house' AND ls.slug = 'ai-flotation';
  IF flotation <> 1 THEN
    RAISE EXCEPTION 'POSTCONDITION FAILED: ai-flotation open_house rows = % (expected exactly 1)', flotation;
  END IF;

  -- And the rows written must derive the brand the landing-page snack bar reads.
  SELECT b.slug INTO brand
    FROM lead_sources ls JOIN brands b ON b.id = ls.brand_id
   WHERE ls.slug = 'training';
  IF brand <> 'colaberry-training' THEN
    RAISE EXCEPTION 'POSTCONDITION FAILED: training source resolves to brand %, expected colaberry-training', brand;
  END IF;

  RAISE NOTICE 'post-conditions passed: 0 unattributed, ai-flotation row intact, brand=%', brand;
END $$;

COMMIT;

-- IDEMPOTENCY: this must now report 0, on this run and on every run after it.
SELECT count(*) AS must_be_zero
FROM leads WHERE source_id IS NULL AND source = 'open_house';
