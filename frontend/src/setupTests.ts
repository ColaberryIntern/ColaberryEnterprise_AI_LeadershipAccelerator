/**
 * Global Jest setup. react-scripts picks this file up automatically when it exists
 * (`setupFilesAfterEnv`), which is why there is no config change beside it.
 *
 * ── WHY IT EXISTS: react-markdown is ESM and this repo cannot transform it ───────
 *
 * `react-markdown` v10 and `remark-gfm` v4 are pure ESM with a large transitive tree
 * (unified, remark, micromark, vfile). CRA's default Jest config does not transform
 * anything in `node_modules`, and this repo has **no `transformIgnorePatterns` override**,
 * so any test that renders a component importing them dies with
 * `SyntaxError: Unexpected token 'export'` before a single assertion runs.
 *
 * `AgentTalkTab.test.tsx` already names this: *"a real, pre-existing gap RecordProse.tsx's
 * own untested consumers never surfaced"*. On 2026-11-13 `ProjectWorkspacePage` became such
 * a consumer -- it now renders the story brief through `RecordProse`, because the brief is
 * generated Markdown and a bare `<p>` showed every `**` literally -- and the gap surfaced
 * as five whole suites failing to load.
 *
 * Mocking here rather than in each suite: `jest.mock` is hoisted per file, so a shared
 * helper module would only work when its import happened to precede the component's. A
 * setup file has no ordering to get wrong, and it covers suites written later that would
 * otherwise rediscover this the same way.
 *
 * ── WHAT THIS DOES NOT FIX ──────────────────────────────────────────────────────
 *
 * The real remedy is a `transformIgnorePatterns` override so the ESM is transformed and
 * Markdown genuinely renders under test. That is a wider change -- it pulls a large
 * dependency tree through Babel on every run -- and it is deliberately NOT bundled into a
 * fix for the story brief. **So Markdown rendering remains unverified by tests**: bold,
 * lists and preserved line breaks are checked in production, the same as any other purely
 * visual behaviour this suite cannot assert on. The passthrough below keeps the text
 * itself assertable, which is what the brief tests actually need.
 */

jest.mock('react-markdown', () => ({
  __esModule: true,
  default: ({ children }: { children: string }) => children,
}));

jest.mock('remark-gfm', () => ({ __esModule: true, default: () => {} }));

// RecordProse also loads this local plugin, which imports from the same ESM tree.
jest.mock('./utils/remarkPreserveGeneratedLineBreaks', () => ({
  __esModule: true,
  remarkPreserveGeneratedLineBreaks: () => {},
}));

export {};
