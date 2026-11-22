/**
 * A typed handle on `jsdom`, for the two demo suites that boot the rendered engine and read the
 * DOM rather than grepping the HTML.
 *
 * ## Why this file exists rather than an import
 *
 * `import { JSDOM } from 'jsdom'` fails the `test-typecheck` CI gate with TS7016: jsdom ships no
 * types, `@types/jsdom` is not installed, and **jsdom is not a declared dependency of this repo
 * at all** - it arrives transitively through `jest-environment-jsdom`. `tsc --noEmit` never saw
 * the error because `backend/tsconfig.json` excludes `__tests__`.
 *
 * Declaring jsdom and `@types/jsdom` as devDependencies is the proper fix and is a deliberate
 * dependency add, which CLAUDE.md puts outside what this change decides on its own. So this
 * follows the repo's own precedent instead: `portfolioReport/__tests__/dashboard.test.ts` has
 * typed its `require('jsdom')` in-file since before this change, and `src/types/qrcode.d.ts`
 * says the same thing about the same tradeoff - "keep tsc clean without adding a devDependency
 * or churning package-lock".
 *
 * The one improvement on that precedent: it is in ONE place, imported by both suites, rather
 * than two copies of a hand-written type that could drift from each other.
 *
 * ## What it does NOT claim
 *
 * This is a type shim, not an endorsement of importing a transitive dependency. If
 * `jest-environment-jsdom` stops depending on jsdom, these suites break at runtime and no type
 * check will have warned. Declaring it remains the right follow-up.
 */

/** The surface these suites use. `Window & typeof globalThis` gives the real DOM types. */
export interface JsdomInstance {
  window: Window & typeof globalThis;
}

export interface JsdomVirtualConsole {
  /** The engine's own script errors, which are the ones worth surfacing. */
  on(event: 'jsdomError', listener: (error: Error) => void): JsdomVirtualConsole;
}

export interface JsdomOptions {
  runScripts?: 'dangerously' | 'outside-only';
  virtualConsole?: JsdomVirtualConsole;
  url?: string;
}

/* eslint-disable @typescript-eslint/no-var-requires */
const jsdom = require('jsdom') as {
  JSDOM: new (html: string, options?: JsdomOptions) => JsdomInstance;
  VirtualConsole: new () => JsdomVirtualConsole;
};

export const { JSDOM, VirtualConsole } = jsdom;
