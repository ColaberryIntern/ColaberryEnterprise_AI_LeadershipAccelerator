/**
 * Foundation Files Service
 *
 * An end-user's repo does not ship with the two files the kickoff prompt
 * depends on: a spec and an operating contract. The portal already HAS the
 * spec (the generated requirements document) and can derive a right-sized
 * operating contract from the project. This service produces both as plain
 * Markdown so the portal can offer them as downloads the user drops at their
 * repo root before running the kickoff in Claude Code.
 *
 * Decision (2026-05-22, DRI): spec = the requirements document (NOT a separate
 * "Build Guide"); planning happens in Claude Code, directed by the portal
 * prompt. These files are the inputs that make that handoff self-contained.
 *
 * Pure string builders — no I/O, no DB. Callers pass the project + capability
 * rows they already loaded.
 */

interface CapabilityLite {
  name?: string | null;
  description?: string | null;
  total_requirements?: number | null;
  matched_requirements?: number | null;
}

interface ProjectLite {
  organization_name?: string | null;
  name?: string | null;
}

function projectTitle(project: ProjectLite): string {
  return project.name || project.organization_name || 'This Project';
}

/**
 * A compact, human-readable project summary + capability list. Embedded inline
 * in the kickoff prompt so Claude Code is oriented even before it opens any
 * files, and reused at the top of the generated CLAUDE.md.
 */
export function buildProjectSummary(project: ProjectLite, capabilities: CapabilityLite[]): string {
  const title = projectTitle(project);
  const named = capabilities.filter(c => (c.name || '').trim().length > 0);
  if (named.length === 0) {
    return `**${title}** — requirements captured; capabilities will be clustered as the build proceeds.`;
  }
  const lines = named.slice(0, 40).map(c => {
    const reqs = typeof c.total_requirements === 'number' && c.total_requirements > 0
      ? ` (${c.total_requirements} requirement${c.total_requirements === 1 ? '' : 's'})`
      : '';
    const desc = (c.description || '').trim().replace(/\s+/g, ' ').slice(0, 120);
    return `- **${c.name}**${reqs}${desc ? ` — ${desc}` : ''}`;
  });
  const more = named.length > 40 ? `\n- …and ${named.length - 40} more` : '';
  return `**${title}** breaks down into ${named.length} capabilit${named.length === 1 ? 'y' : 'ies'}:\n${lines.join('\n')}${more}`;
}

/**
 * A right-sized operating contract for the user's repo. NOT the full Colaberry
 * CLAUDE.md — a project-agnostic contract that points at REQUIREMENTS.md as the
 * spec and encodes the autonomy / DoD / testing / idempotency rules the kickoff
 * prompt relies on.
 */
export function generateStarterClaudeMd(project: ProjectLite, capabilities: CapabilityLite[]): string {
  const title = projectTitle(project);
  const summary = buildProjectSummary(project, capabilities);
  return `# CLAUDE.md — ${title}

Operating contract for AI coding agents (Claude Code and others) working in this
repository. These rules override default behavior.

## What this project is

${summary}

The full specification lives in **\`REQUIREMENTS.md\`** at the repo root. Treat it
as the source of truth for what to build. This file (CLAUDE.md) is the rules of
engagement for HOW to build it.

## Core principle

Reason, plan, build real code, and prove it with tests. No stubs where the spec
calls for real behavior. Code is read far more than it is written — keep modules
small, single-responsibility, and understandable in one sitting.

## Autonomy

**Proceed by default.** Pause only when:
- A decision is strategic and hard to reverse (data model redesign, a new paid
  external dependency, a security/compliance posture, a cost-model shift).
- You genuinely cannot proceed without user input (a credential, or a business
  rule the requirements document does not specify).
- A test keeps failing after a focused diagnostic pass.

For everything else: choose the simplest, lowest-blast-radius path, log the
assumption in your report, and keep moving. Do not stop to ask permission for
reversible implementation details.

## Definition of done (per phase)

A phase is done only when:
- The real thing is built (schemas, services, handlers, UI, integrations) — not
  placeholders.
- Tests exist and pass: happy path, one failure path, and boundary cases.
- Side effects are **idempotent** — running the same operation twice produces
  the same end state, no duplicates.
- External calls have explicit timeouts and bounded retries; failures are logged
  with context, never silently swallowed.
- Inputs from outside the trust boundary are validated before use; no secrets in
  code, logs, or commit history.

## Directives

If the requirements document references procedures, runbooks, or SOPs, capture
them as Markdown under \`/directives\` and wire the code to follow them. Keep
business logic in code, not in directives.

## Reporting

At the end of a kickoff or build session, deliver ONE consolidated report: the
commit SHA, phases shipped, files created/modified, routes, database changes,
tests added (with pass/fail), assumptions made, and anything that genuinely
needs the user. Do not split reports across phases.
`;
}
