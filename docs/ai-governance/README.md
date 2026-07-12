# AI Governance (TBI Compliance)

The single home for how Colaberry governs AI. **TBI is the standard of record** — see
[`github.com/colaberry/trust-before-intelligence-book`](https://github.com/colaberry/trust-before-intelligence-book).

This folder replaces the scattered one-off AI audit / phase-validation docs elsewhere in `docs/`.

## Contents

| File | What it is |
|---|---|
| [`TBI_COMPLIANCE_PROGRAM.md`](TBI_COMPLIANCE_PROGRAM.md) | **The plan.** The standard (INPACT/GOALS/7-Layer), risk tiers, governance structure, audit SOP, monitoring spec, and the 5-phase roadmap to get every AI process to a passing score. |
| [`ai-systems-registry.csv`](ai-systems-registry.csv) | **The source of truth.** Every AI process with its tier, owner, HITL level, data sensitivity, provisional score, target, and remediation phase. Nothing ships AI without a row here. |

## The bar, in one line

A system is compliant when it meets its **tier's INPACT % and GOALS /25** with evidence, has a named owner and HITL level in the registry, and reports live to the AI Trust Dashboard. Production gate = **INPACT ≥ 86% · GOALS ≥ 21/25** (Tier 1).

## Start here

1. Read §0 (TL;DR) and §8 (decisions for Ali) of the program doc.
2. Assign a Governance Lead + Security reviewer.
3. Fill in owners in the registry (Phase 0).
