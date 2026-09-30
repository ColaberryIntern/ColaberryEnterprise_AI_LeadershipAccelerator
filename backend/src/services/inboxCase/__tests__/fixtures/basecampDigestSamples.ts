// Real production Basecamp "N to-dos due soon" digest email bodies, captured
// verbatim (via extractBodyText against the live Gmail message) during the
// build of loop-architect run 20260802-093200-digest-text-todo-parsing.
// Confirmed live message ids: 19f517efe23e5c15 (12 real to-do lines, despite
// the case title saying "5 To Dos" — Basecamp's subject-line count and the
// body's actual line count are independent, not something the parser needs
// to reconcile), 19f60f50da620e08 (12 lines), 19f661b797299776 (42 lines,
// the largest real sample — multiple todolists per project, the real
// structural stress test for the parser's line-state-machine).
//
// Used verbatim as test fixtures rather than synthetic approximations, per
// this run's execution-contract.md.

export const DIGEST_SAMPLE_12A = `These to-dos are due…\r
\r
From: AI Systems Architect Accelerator ---\r
\r
Website - enterprise.colaberry.ai\r
▢ Final review and approval of enterprise.colaberry.ai • Due: Jul 10 • Assigned to: Ali M. \r
\r
From: Anthropic Partner Network - 10-Person Onboarding ---\r
\r
CCA Fast-Track - Ali Muwwakkil\r
▢ Day 5 (Jul 10) — D3 Prompt Engineering pt 1 (PRECISE) [WEAK] • Due: Jul 10 • Assigned to: Ali M. \r
▢ Day 6 (Jul 11) — D3 Prompt Engineering pt 2 [WEAK] • Due: Jul 11 • Assigned to: Ali M. \r
\r
From: Gov Contracts ---\r
\r
Gov Contracting Eligibility - Story-Driven Program (SAM.gov, Certifications, Veteran/Minority Entity, First Wins): R2 - Keystone Certifications - SOC 2 and Its Reciprocity Chain\r
▢ 🧑 Ali: review ISO 27001 + SOC 2 approach & roadmap → send feedback to Metasoft before kickoff • Due: Jul 12 • Assigned to: Ali M. \r
\r
From: Internship / Apprenticeship Projects ---\r
\r
Social Pilot AI - BUILD (story-driven): HIGH-LEVEL APPROVALS - Ali (phase gates)\r
▢ 🧑 Approve Phase 1 (Foundation): R0, R1, R2 • Due: Jul 11 • Assigned to: Ali M. Sohail S. \r
\r
From: LandJet Growth Engine ---\r
\r
Outreach Engine\r
▢ [Ryan] Cold outreach: track Apollo license + wire lead pull • Due: Jul 4 • Assigned to: Ali M. \r
▢ [Ryan] Positive-response handling flow (lead replies "yes" -> clean handoff) • Due: Jul 11 • Assigned to: Ali M. \r
▢ [Ryan] Wire LandJet Investor Deck onto Investor Outreach step 1 • Due: Jul 4 • Assigned to: Ali M. \r
▢ [Ryan] Wire LandJet intro deck onto industry outreach step 1 • Due: Jul 4 • Assigned to: Ali M. \r
▢ [Ryan] Test campaign attachments end-to-end (preview + actual send) • Due: Jul 4 • Assigned to: Ali M. \r
▢ [Ryan] Vertical lists approval (per-vertical lead lists) • Due: Jul 4 • Assigned to: Ali M. \r
▢ [Platform] LLM-backed category validation (company vs assigned vertical) • Due: Jul 11 • Assigned to: Ali M. \r
\r
\r
View all your assignments on Basecamp:\r
https://app.basecamp.com/3945211/my/assignments\r
`;

export const DIGEST_SAMPLE_12B = `These to-dos are due…\r
\r
From: AI Systems Architect Accelerator ---\r
\r
Student Platform Build\r
▢ Rebrand Student Platform as Powered by Refactored AI • Due: Jul 13 • Assigned to: Ali M. \r
\r
TWC Compliance\r
▢ Legal review of TWC compliance documents • Due: Jul 7 • Assigned to: Ali M. \r
\r
From: Anthropic Partner Network - 10-Person Onboarding ---\r
\r
CCA Fast-Track - Ali Muwwakkil\r
▢ Day 2 (Jul 7) — D1 Agentic pt 2 (learn SPIDER) • Due: Jul 7 • Assigned to: Ali M. \r
▢ Day 7 (Jul 13) — D3 Prompt Engineering pt 3 [WEAK] • Due: Jul 13 • Assigned to: Ali M. \r
▢ Day 8 (Jul 14) — D4 Tool Design & MCP, pt 1 • Due: Jul 14 • Assigned to: Ali M. \r
▢ Day 9 (Jul 15) — D4 Tool Design & MCP, pt 2 • Due: Jul 15 • Assigned to: Ali M. \r
\r
From: Gov Contracts ---\r
\r
Gov Contracting Eligibility - Story-Driven Program (SAM.gov, Certifications, Veteran/Minority Entity, First Wins): R0 - Federal Foundation - SAM.gov + Eligibility (the master key)\r
▢ 🧑 S8 - Run the SBA set-aside eligibility check (SDVOSB / 8(a) / HUBZone / WOSB) + Ali self-check • Due: Jul 13 • Assigned to: Ali M. \r
\r
Gov Contracting Eligibility - Story-Driven Program (SAM.gov, Certifications, Veteran/Minority Entity, First Wins): R2 - Keystone Certifications - SOC 2 and Its Reciprocity Chain\r
▢ 🧑 Submit existing security evidence, policies & procedures to Metasoft (mark available vs. not) - before Wed gap-review • Due: Jul 15 • Assigned to: Ali M. Srinivas B. \r
\r
From: LandJet Growth Engine ---\r
\r
Multi-tenant & Onboarding\r
▢ [Ali] Get Ryan to accept Basecamp invite + clean up his task assignments • Due: Jul 15 • Assigned to: Ali M. \r
▢ [Ali] Provision Iowa owner account when Ryan provides the name • Due: Jul 15 • Assigned to: Ali M. \r
\r
Platform & Infrastructure\r
▢ [Ali] Daily 5-min LandJet system health-check dashboard • Due: Jul 15 • Assigned to: Ali M. \r
\r
Pricing & Quoting\r
▢ [Ryan] Calibrate Quote Tester cost inputs from real trip P&L • Due: Jul 15 • Assigned to: Ali M. \r
\r
\r
View all your assignments on Basecamp:\r
https://app.basecamp.com/3945211/my/assignments\r
`;

// The largest real sample (42 real ▢ lines) — multiple todolists per
// project, the real structural stress test for the parser.
export const DIGEST_SAMPLE_42 = `These to-dos are due…\r
\r
From: AI Systems Architect Accelerator ---\r
\r
Student Platform Build: Epic 4 - Community + Gamification [Kes + Aleem]\r
▢ 🧍 APPROVE (Ali): sign off Community + Gamification • Due: Jul 16 • Assigned to: Ali M. \r
\r
From: Anthropic Partner Network - 10-Person Onboarding ---\r
\r
CCA Fast-Track - Ali Muwwakkil\r
▢ Day 3 (Jul 8) — D2 Claude Code Config, pt 1 • Due: Jul 8 • Assigned to: Ali M. \r
▢ Day 8 (Jul 14) — D4 Tool Design & MCP, pt 1 • Due: Jul 14 • Assigned to: Ali M. \r
▢ Day 9 (Jul 15) — D4 Tool Design & MCP, pt 2 • Due: Jul 15 • Assigned to: Ali M. \r
▢ Day 10 (Jul 16) — D5 Context Management pt 1 (CALM) [WEAK] • Due: Jul 16 • Assigned to: Ali M. \r
\r
From: Family Goals & Life Planning ---\r
\r
2026 Tax Planning\r
▢ Make offsetting adjustments on my side so the tax responsibility is shared • Due: Jul 16 • Assigned to: Ali M. \r
\r
Marriage Goals\r
▢ Be ready to walk through the conflict rules whenever Addie wants to (she sets the time) • Due: Jul 16 • Assigned to: Ali M. \r
▢ Adopt the agreed ground rules and put them where we both can reference them • Due: Jul 16 • Assigned to: Ali M. \r
\r
From: Gov Contracts ---\r
\r
Gov Contracting Eligibility - Story-Driven Program (SAM.gov, Certifications, Veteran/Minority Entity, First Wins): R2 - Keystone Certifications - SOC 2 and Its Reciprocity Chain\r
▢ 🧑 Submit existing security evidence, policies & procedures to Metasoft (mark available vs. not) - before Wed gap-review • Due: Jul 15 • Assigned to: Ali M. Srinivas B. \r
\r
From: LandJet Growth Engine ---\r
\r
Multi-tenant & Onboarding\r
▢ [Ali] Get Ryan to accept Basecamp invite + clean up his task assignments • Due: Jul 15 • Assigned to: Ali M. \r
▢ [Ali] Provision Iowa owner account when Ryan provides the name • Due: Jul 15 • Assigned to: Ali M. \r
\r
Platform & Infrastructure\r
▢ [Ali] Daily 5-min LandJet system health-check dashboard • Due: Jul 15 • Assigned to: Ali M. \r
\r
Pricing & Quoting\r
▢ [Ryan] Calibrate Quote Tester cost inputs from real trip P&L • Due: Jul 15 • Assigned to: Ali M. \r
\r
From: ShipCES - Autonomous Brokerage ---\r
\r
Cadence + Weekly Demo Prep\r
▢ Cadence: Tuesday 15:00 CST - Karun + Ali sync call (30 min) • Due: Jul 15 • Assigned to: Ali M. Karun S. \r
▢ Cadence: Wednesday EOD - Ali drafts Thursday agenda + names the architecture block to deep-dive • Due: Jul 15 • Assigned to: Ali M. \r
▢ Cadence: Thursday 09:00 CST - demo dry-run before the 10am call • Due: Jul 16 • Assigned to: Ali M. Karun S. \r
▢ Cadence: Thursday 18:00 CST - write call digest + spawn action items into new tickets • Due: Jul 16 • Assigned to: Ali M. \r
▢ Delivery report + Gantt: deliverable-anchored, PMBOK standard, dependency icons (Brett Jul 9 ask) • Due: Jul 16 • Assigned to: Ali M. \r
▢ Jul 16 demo prep: forward (replicate Karun's email piece) + backward (BMS on fake data) • Due: Jul 16 • Assigned to: Ali M. \r
\r
Governance + Managing-Project Integration\r
▢ Gov: Weekly status sync to managing-project todo (recurring Thursday) • Due: Jul 16 • Assigned to: Ali M. \r
▢ Gov: Define escalation path from this project to managing project • Due: Jul 16 • Assigned to: Ali M. \r
▢ Gov: Approval-gate workflow definition (Karun gate 1, Ram + Ali gate 2) • Due: Jul 16 • Assigned to: Ali M. Karun S. Ram K. \r
▢ Guardrail: automated closures must respect open approval gates (Gate-1 bypass on Jun 18 backlog audit) • Due: Jul 16 • Assigned to: Ali M. \r
\r
OMS - Order staging + tender\r
▢ OMS: Canonical shipment record schema (Zod / TS contract) • Due: Jul 16 • Assigned to: Ali M. \r
▢ OMS: State machine (Received - Parsed - Priced - QuoteSent - Won/Lost - Tendered) • Due: Jul 16 • Assigned to: Ali M. \r
▢ OMS: RMS-to-OMS handoff (idempotent, dedup by email hash) • Due: Jul 16 • Assigned to: Ali M. \r
▢ OMS: Tender shape (EDI 910 alignment) • Due: Jul 16 • Assigned to: Ali M. \r
▢ OMS: Demo for Jul 16 Thursday call - OMS staging + RMS handoff • Due: Jul 16 • Assigned to: Ali M. \r
\r
Releases + Demo Schedule (R0 to R6)\r
▢ R1 - Thursday Demo + Governance Cadence • Due: Jul 16 • Assigned to: Ali M. \r
\r
RMS - Email + RFQ intake (W1 forward track)\r
▢ RMS-W1: Adopt Karun's D1-D33 parser as W1 baseline (port from aiXNegotiator repo) • Due: Jul 16 • Assigned to: Ali M. Karun S. \r
▢ RMS-W1: Build email ingestion pipeline (webhook receiver + queue + dead-letter) • Due: Jul 16 • Assigned to: Ali M. \r
▢ RMS-W1: Wire D1-D33 parser to ingestion pipeline + write to OMS shipment record • Due: Jul 16 • Assigned to: Ali M. \r
▢ RMS-W1: Forward demo (Jul 16) - live email to canonical RFQ • Due: Jul 16 • Assigned to: Ali M. Karun S. \r
▢ RMS-W1: Lock canonical RFQ payload contract (Zod schema, v1) • Due: Jul 16 • Assigned to: Ali M. \r
▢ RMS-W1: Sylectus carrier-reply catchment (cross-link by load-id) • Due: Jul 16 • Assigned to: Ali M. \r
\r
Sense Layer - Adapters\r
▢ Adapter: Email + RFQ intake (overlaps with RMS W1 list, this is the adapter contract) • Due: Jul 16 • Assigned to: Ali M. \r
▢ Adapter: Contract pattern enforcement across all 5 adapters • Due: Jul 16 • Assigned to: Ali M. \r
▢ Adapter: Test harness with mocked external systems (no live calls in tests) • Due: Jul 16 • Assigned to: Ali M. \r
\r
TMS - Transportation lifecycle\r
▢ TMS: Transportation state machine (Sourcing - CarrierAssigned - Dispatched - InTransit - Delivered - Exception) • Due: Jul 16 • Assigned to: Ali M. \r
▢ TMS: Milestone tracking (EDI 214 alignment) • Due: Jul 16 • Assigned to: Ali M. \r
▢ TMS: Exception handling state (sub-types + recovery paths) • Due: Jul 16 • Assigned to: Ali M. \r
▢ TMS: Delivered triggers BMS handoff (Delivered - Invoiced) • Due: Jul 16 • Assigned to: Ali M. \r
\r
\r
View all your assignments on Basecamp:\r
https://app.basecamp.com/3945211/my/assignments\r
`;
