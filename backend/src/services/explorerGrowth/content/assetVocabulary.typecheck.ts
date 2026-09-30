import type { ExplorerAssetPurpose, ExplorerAssetType } from '../../../types/explorerGrowth';
import type { ContentAssetQuery } from '../governor/types';

/**
 * Compile-time assertions for the purpose/kind seam. EPIC 5 T001.
 *
 * WHY THIS IS A SOURCE FILE AND NOT A TEST. `backend/tsconfig.json` excludes
 * `**\/__tests__/**`, so `tsc --noEmit` never reads anything in a test
 * directory — `--listFiles` shows zero `.test.ts` files in a 4,661-file
 * program. And ts-jest runs with `isolatedModules`, which transpiles without
 * type information: a file containing a blatant `const n: number = 'str'`
 * passes green through this repo's own jest config.
 *
 * So the first version of these assertions lived in `__tests__/` and was read
 * by NOTHING. Both gates were green, and reverting `ContentAssetQuery.asset_type`
 * to `string` would have kept them green — the narrowing had no regression guard
 * at all, while two tests named as type checks asserted only that a string
 * equals itself.
 *
 * That is trap #4 from this epic's own contract — a guard that cannot fire —
 * reproduced inside the fix for it. Hence this file: `include: ["src/**\/*"]`
 * matches it, neither exclude pattern does, so the directives below are live in
 * the local gate AND in CI's `backend-typecheck` job.
 *
 * NO RUNTIME EFFECT. Nothing here is exported for use or imported anywhere; the
 * declarations exist so the compiler has something to check. Deleting this file
 * changes no behaviour and removes the guard, which is the point of saying so.
 */

/* eslint-disable @typescript-eslint/no-unused-vars */

// A real purpose is accepted. If THIS line ever errors, the union has drifted
// away from what the generators emit.
const validPurpose: ExplorerAssetPurpose = 'weekly_digest';

// @ts-expect-error a KIND is not a PURPOSE. If this directive ever reports
// "unused", the seam has been widened back to `string` and the Governor can
// once again ask for something the registry cannot answer.
const kindIsNotAPurpose: ExplorerAssetPurpose = 'LESSON';

// @ts-expect-error and the mirror: a PURPOSE is not a KIND.
const purposeIsNotAKind: ExplorerAssetType = 'weekly_digest';

// @ts-expect-error the seam itself — an arbitrary string must not satisfy a query.
const arbitraryStringRejected: ContentAssetQuery = { asset_type: 'totally_made_up_purpose' };

// The same query with a declared purpose compiles.
const declaredPurposeAccepted: ContentAssetQuery = { asset_type: 'activation_first_step' };

/**
 * Exhaustiveness: assigning the full union to itself member-by-member means
 * removing a purpose from the union without removing it here is a compile error,
 * and adding one here that the union lacks is too.
 */
const everyPurpose: Record<ExplorerAssetPurpose, true> = {
  activation_first_step: true,
  activation_restart: true,
  lesson_recommendation: true,
  weekly_digest: true,
  community_digest: true,
  friction_recovery: true,
  enrollment_offer: true,
  referral_invite: true,
};

void validPurpose;
void kindIsNotAPurpose;
void purposeIsNotAKind;
void arbitraryStringRejected;
void declaredPurposeAccepted;
void everyPurpose;
