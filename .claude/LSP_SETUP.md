# LSP Setup for Claude Code

## What's installed
- `typescript-language-server@^4.x` — installed as a devDependency (see `package.json`)
- Binary available at `node_modules/.bin/typescript-language-server`
- `tsserver` (the underlying TS server) bundled by TypeScript itself

## Why
Per Anthropic's [Claude Code best-practices article](https://claude.com/blog/how-claude-code-works-in-large-codebases-best-practices-and-where-to-start):

> LSP gives Claude symbol-level precision: it can follow a function call to its definition, trace references across files, and distinguish between identically named functions. Without LSP, Claude pattern-matches on text and can land on the wrong symbol. For multi-language codebases, this is one of the highest-value investments.

Our repo is heavily TypeScript (backend + frontend), with some JavaScript scripts. LSP improves refactor accuracy: when renaming a symbol like `findOrCreateVisitor`, grep matches every comment / log line / string literal that contains those words. LSP returns only the actual call sites of that exact symbol.

## Current state of integration

**Claude Code does not yet have a first-class LSP integration that this repo can self-install.** The article references LSP as a Claude Code platform feature (delivered via plugin marketplace), not a per-repo configuration. So today this directory just makes sure the language server binary exists, ready to be wired up when:
- Claude Code's LSP plugin lands (then Ali installs it user-side), OR
- We build a custom MCP server that wraps the LSP and exposes symbol-search tools.

## Manual LSP query (today, for sanity-checking)
You can hand-query the language server from the CLI:

```bash
# Start the server in stdio mode (waits for LSP JSON-RPC on stdin)
npx typescript-language-server --stdio
```

That gets you a live LSP session. Anyone wanting a CLI tool today can write a Node script that opens the binary, sends an `initialize` request, then `textDocument/references` for a specific symbol, and parses the JSON response.

## Why we didn't build that script
- Per the article, LSP is an integration feature of Claude Code itself, expected to land through the plugin marketplace, not custom per-repo wrapping.
- Until that lands, the existing `Grep` workflow remains the practical search path; LSP is a future improvement.
- When Claude Code's official LSP plugin arrives, Ali installs it user-side and points it at this repo's `tsconfig.json` files (one in `backend/`, one in `frontend/`). No further config needed because both directories already have `tsconfig.json` per `backend/CLAUDE.md` and `frontend/CLAUDE.md`.

## Roadmap
| Step | Status |
|---|---|
| 1. Install `typescript-language-server` as devDependency | ✓ done 2026-05-19 |
| 2. Verify `node_modules/.bin/typescript-language-server` exists | ✓ done |
| 3. Wait for Claude Code's official LSP plugin OR build a custom MCP wrapper | — pending |
| 4. (When step 3 lands) confirm both `backend/tsconfig.json` and `frontend/tsconfig.json` are discovered and indexed | — pending |

## If you want to build a custom MCP LSP wrapper sooner
The path forward:
- Use `vscode-languageclient` or the lower-level `vscode-jsonrpc` to talk to `typescript-language-server --stdio`.
- Expose 3 MCP tools: `find_references(symbol_name, file_path, line, column)`, `goto_definition(symbol_name, ...)`, `find_workspace_symbols(query)`.
- Register the wrapper in `.claude/settings.json` alongside `colaberry-portal-api` and `colaberry-postgres-analytics`.
- Estimated effort: 4-6 hours (LSP init handshake, document sync protocol, JSON-RPC handling).

That work isn't done yet because it's a meaningful investment that should wait for the official Claude Code plugin to avoid duplicate maintenance.
