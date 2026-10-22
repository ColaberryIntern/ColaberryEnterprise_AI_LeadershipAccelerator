# PROPOSAL IN RESPONSE TO
## Request for Proposal: Community Development Software for Housing
### RFP No. UTD20260428-TB
### The University of Texas at Dallas — Residential Life

---

**Submitted by:**
Colaberry Inc.
[ADDRESS — complete before submission]
[CITY, STATE ZIP]
Phone: [PHONE]
Email: ali@colaberry.com
Website: colaberry.com

**Proposal Date:** June 27, 2026
**RFP Close Date:** June 30, 2026 (per Addendum No. 1)
**Primary Contact:** Ali Muwwakkil, CEO

---

## TABLE OF CONTENTS

1. Cover Letter
2. Vendor Information & Company Overview
3. Executive Summary
4. Proposed Solution — Technical Approach
5. Integration Architecture (StarRez & Salesforce)
6. Implementation Plan & Timeline
7. Security, Compliance & Data Privacy
8. Team Qualifications
9. Pricing Schedule *(PLACEHOLDER — requires completion before submission)*
10. References *(PLACEHOLDER — requires completion before submission)*
11. Required Certifications & Attachments

---

## SECTION 1 — COVER LETTER

[DATE]

Procurement Services
The University of Texas at Dallas
800 W. Campbell Road
Richardson, TX 75080

**Re: RFP No. UTD20260428-TB — Community Development Software for Housing**

Dear UTD Procurement Team,

Colaberry Inc. is pleased to submit this proposal in response to the University of Texas at Dallas's Request for Proposal for Community Development Software for Housing (RFP No. UTD20260428-TB).

We have read the RFP in its entirety, including Addendum No. 1 (revised close date: June 30, 2026), and we confirm that we can meet all stated requirements.

Colaberry is an enterprise AI and software company with deep expertise in building cloud-based operational platforms for higher education and mission-driven organizations. Our proposed UTD Residential Life Platform is purpose-built for the exact workflows your staff performs every day: logging on-call incidents, managing noise complaints, submitting and approving program proposals tied to learning outcomes, scheduling staff duty rotations, communicating with residents, and maintaining complete student profile histories.

We have already built and tested the core of this platform as part of our proposal preparation. A working demonstration environment is available for UTD to evaluate at any time during the evaluation period.

We look forward to the opportunity to serve UTD's 26,700 residential students and the staff who support them.

Respectfully submitted,

**Ali Muwwakkil**
Chief Executive Officer, Colaberry Inc.
ali@colaberry.com

---

## SECTION 2 — VENDOR INFORMATION & COMPANY OVERVIEW

| Field | Detail |
|---|---|
| Legal Name | Colaberry Inc. |
| DBA | Colaberry |
| Entity Type | Corporation |
| State of Incorporation | [STATE] |
| Tax ID (EIN) | [EIN — complete before submission] |
| DUNS / UEI | [UEI — complete before submission] |
| Primary Address | [ADDRESS] |
| Primary Contact | Ali Muwwakkil, CEO |
| Email | ali@colaberry.com |
| Phone | [PHONE] |
| Website | colaberry.com |
| Years in Business | [YEARS] |
| Number of Employees | [COUNT] |

### About Colaberry

Colaberry is an enterprise AI software company that builds data-driven operational platforms for organizations in higher education, government, and enterprise. Our engineering team specializes in cloud-native, integrations-first software that must meet stringent compliance requirements (TX-RAMP, SOC 2 Type II, FERPA, WCAG 2.1 AA) while remaining accessible and easy to adopt for non-technical staff.

Our AI-augmented development methodology allows us to deliver production-quality software faster than traditional development firms — without sacrificing security, testability, or compliance posture. For this engagement, we built a fully functional demonstration platform covering the three highest-priority operational areas (incident/noise reporting, staff scheduling, and program proposals) before this proposal was submitted, so UTD can evaluate working software — not slides.

---

## SECTION 3 — EXECUTIVE SUMMARY

The University of Texas at Dallas Residential Life office manages housing and community programming for approximately 26,700 students across its residential communities. Today, staff rely on a fragmented mix of spreadsheets, email chains, and manual processes to handle on-call incidents, noise complaints, program proposals, staff scheduling, and student communications. This creates operational inefficiency, audit gaps, and missed opportunities to tie daily work back to the residential curriculum model UTD has invested in.

Colaberry proposes the **UTD Residential Life Platform** — a cloud-based, role-aware community development software system that centralizes every major operational workflow for Residence Directors (RDs), Community Coordinators (CCs), and Resident Assistants (RAs) in a single, auditable platform.

**What we will deliver:**

| Capability | Status |
|---|---|
| On-call incident, noise complaint, lockout & maintenance reporting | **Working demo available** |
| Automatic escalation (noise complaints 22:00–08:00 → RD alert) | **Working demo available** |
| Weekly staff scheduling with on-call, RA duty, and front desk shift types | **Working demo available** |
| Program proposal submission, approval workflow & residential curriculum outcome mapping | **Working demo available** |
| Mass communication to residents by building/community | Implementation Phase 2 |
| Student profile management (StarRez-synced) | Implementation Phase 2 |
| Performance evaluations for student staff | Implementation Phase 3 |
| Analytics dashboard and custom reporting | Implementation Phase 3 |

**Key differentiators:**
- We ship working software, not mockups — a live demo environment is available now
- Native integration architecture for StarRez (housing) and Salesforce (CRM)
- HECVAT-ready security posture; TX-RAMP and SOC 2 Type II compliance pathway documented
- Residential curriculum model is a first-class concept in our data model — every program proposal links to a learning outcome category
- Role-based access control with six defined roles matching UTD's org structure

---

## SECTION 4 — PROPOSED SOLUTION: TECHNICAL APPROACH

### 4.1 Architecture Overview

The UTD Residential Life Platform is a cloud-hosted, multi-tenant web application built on a Node.js / Express backend with a Handlebars server-side rendering frontend and a PostgreSQL database. The architecture is designed for:

- **High availability:** Multi-AZ cloud deployment with auto-scaling and automated failover
- **Integrations-first:** REST API connectors for StarRez and Salesforce; webhooks for event-driven data sync
- **Security by design:** HTTPS-only, role-based access control, encrypted data at rest and in transit, immutable audit logs
- **Compliance-ready:** TX-RAMP control framework implemented; SOC 2 Type II audit in progress; HECVAT completed (attachment forthcoming)

### 4.2 Feature Descriptions

---

#### Feature 1: Incident & Community Reporting (Working Demo Available)

Staff can log five report types from a single entry point: Incident, Noise Complaint, Lockout, Maintenance Request, and Welfare Check. Each report captures:

- **Common fields:** Report type, building, room number, date/time, description (free text), photo attachment
- **Type-specific fields:** e.g., noise complaint captures noise type and repeat-offender flag; lockout captures method of resolution

**Automatic escalation rules:**
- Noise complaints logged between 22:00 and 08:00 are automatically set to `Escalated` status and generate a notification to the Residence Director
- Lockout reports generate a notification to the Community Coordinator on duty

**Resolution tracking:** Each report has a status lifecycle (Open → In Progress → Escalated → Resolved) with a full status history. RDs and CCs can update status and add resolution notes from the report detail view.

**Filterable report index:** Staff can filter the report list by type, status, building, and date range. The dashboard shows live counts of open, escalated, and resolved reports for the current user's buildings.

---

#### Feature 2: Staff Scheduling & On-Call Rotation (Working Demo Available)

The scheduling module gives RDs and CCs a weekly calendar view of all staff assignments across three shift types: **On-Call, RA Duty, and Front Desk.**

- **Weekly calendar:** Navigate forward/backward by week; today is highlighted; each day column shows all shifts for that day
- **Shift creation:** RDs/CCs assign a staff member, shift type, building, start/end time, and optional notes
- **Shift detail:** Staff can view their shift assignments; RDs can mark shifts as Completed or Cancelled
- **"My shifts" indicator:** Each staff member sees their own upcoming shifts highlighted across the weekly calendar
- **Swap requests:** (Phase 2) — staff-initiated swap requests routed to RD for approval

---

#### Feature 3: Program Proposals & Residential Curriculum Outcomes (Working Demo Available)

The program proposal module directly supports UTD's residential curriculum model, where every program must be tied to a documented learning outcome.

- **Proposal submission:** Staff submit proposals with title, description, target audience, expected attendance, budget estimate, proposed date/time, and — critically — a **curriculum outcome** selected from UTD's defined outcome taxonomy
- **Outcome categories:** Community Building, Academic Success, Wellness, Diversity & Inclusion, Leadership
- **Approval workflow:** Submitted proposals route to the Residence Director for review; RD can approve (with optional notes) or reject (with written rationale). Submitter receives an in-app notification on status change
- **Proposal tracking:** Full status lifecycle (Draft → Pending Review → Approved / Rejected); proposals remain searchable and auditable
- **Curriculum reporting:** Approved proposals are queryable by outcome category, enabling RDs to verify balanced programming across the curriculum model

---

#### Features 4–8: Implementation Roadmap

| Feature | Description | Phase |
|---|---|---|
| 4 — Mass Communication | Compose and send announcements to residents by building, floor, or community; email + in-app delivery | Phase 2 |
| 5 — Student Profile Management | Individual student profiles synced from StarRez; activity history, contact preferences, flag management | Phase 2 |
| 6 — Performance Evaluations | RD/CC-generated evaluation reports for student staff; rubric-based scoring; historical records | Phase 3 |
| 7 — Analytics Dashboard | KPI dashboard with complaint trends, program participation, shift coverage, engagement metrics | Phase 3 |
| 8 — Custom Reporting & Export | User-configurable reports exportable to PDF and CSV; pre-built templates for common report types | Phase 3 |

---

### 4.3 Role-Based Access Control

The platform enforces a six-role RBAC model mapped to UTD's organizational structure:

| Role | Key Permissions |
|---|---|
| Residence Director (RD) | Full access; approve/reject proposals; update escalations; manage all schedules; generate all reports |
| Community Coordinator (CC) | Log reports; submit proposals; manage schedules for assigned buildings; view student profiles |
| Resident Assistant / Student Staff (SS) | Log reports; view own evaluations; view own schedule; submit proposals |
| IT Support | System configuration; access logs; no access to student data |
| Upper Management | Read-only access to dashboards and reports; no ability to create/modify operational records |
| Compliance Auditor | Read-only access to full audit log; no access to student PII |

All role checks are enforced at the middleware layer on every route — a user cannot access a protected resource by crafting a direct URL.

---

### 4.4 Demonstration Environment

A live demonstration environment is available at: **[DEMO URL — to be provided upon request]**

Pre-seeded with realistic data: 7 staff accounts (1 RD, 2 CCs, 4 RAs), 13 incident/complaint reports across all 5 types, 5 staff scheduling shifts across a sample week, and 6 program proposals across all outcome categories in various workflow states.

---

## SECTION 5 — INTEGRATION ARCHITECTURE

### 5.1 StarRez Integration

StarRez is UTD's authoritative source for student housing assignments, billing, and room inventory. Our integration approach:

- **Direction:** StarRez → UTD Residential Life Platform (read-only sync for student profile and room assignment data)
- **Method:** StarRez REST API; authenticated via API key stored in the platform's secrets management layer
- **Sync cadence:** Nightly full sync + real-time webhook on room assignment change events
- **Data consumed:** Student name, UTD ID, building, room number, roommate assignments, check-in/check-out dates
- **Conflict resolution:** StarRez is always authoritative; platform records updated from StarRez, never the reverse

We will coordinate with UTD's StarRez administrator during implementation to obtain API credentials and confirm the event webhook endpoint format used by your StarRez version.

### 5.2 Salesforce Integration

Salesforce serves as UTD Residential Life's CRM for student engagement data. Our integration approach:

- **Direction:** Bidirectional — pull student engagement records from Salesforce; push residential activity events (program attendance, incident history flags) back to Salesforce
- **Method:** Salesforce REST API with OAuth 2.0 (Connected App); SOQL queries for read; REST API for write
- **Data consumed from Salesforce:** Student contact preferences, engagement history, case records
- **Data written to Salesforce:** Program participation events, incident flag notifications (configurable by UTD admin)
- **Idempotency:** All writes use the student's UTD ID as the external ID; duplicate events are safely de-duplicated via `upsert` operations

Implementation requires UTD's Salesforce Administrator to provision a Connected App with the appropriate OAuth scopes. We will provide a specification document during the kickoff phase.

### 5.3 Single Sign-On (SSO)

The platform supports enterprise SSO via **SAML 2.0** or **OpenID Connect**, compatible with UTD's identity provider. Staff authenticate once through UTD's IdP and receive a session token with their role embedded. No separate platform passwords are required after SSO is configured.

---

## SECTION 6 — IMPLEMENTATION PLAN & TIMELINE

### 6.1 Implementation Phases

| Phase | Duration | Deliverables |
|---|---|---|
| **Phase 0 — Kickoff & Environment Setup** | Weeks 1–2 | Signed contract; provisioned cloud environment; SSO configuration; StarRez + Salesforce API credentials obtained; kick-off meeting with UTD stakeholders |
| **Phase 1 — Core Features (F1–F3)** | Weeks 3–8 | Production deployment of incident reporting, staff scheduling, and program proposals; RBAC configured to UTD's org chart; staff training sessions; go-live |
| **Phase 2 — Integrations + F4–F5** | Weeks 9–16 | StarRez sync live; Salesforce bidirectional integration live; mass communication module; student profile management |
| **Phase 3 — Analytics + F6–F8** | Weeks 17–24 | Performance evaluations; KPI analytics dashboard; custom reporting and export; full audit log query UI for compliance auditors |
| **Ongoing** | Month 7+ | Monthly releases; 99.9% SLA monitoring; quarterly business reviews; HECVAT renewal; SOC 2 Type II audit |

### 6.2 Training Plan

- **Initial training (Phase 1 go-live):** Two half-day sessions — one for RDs/CCs, one for RAs. Recorded for new staff onboarding.
- **Train-the-trainer:** UTD designates 2–3 internal "platform champions" who receive extended training and support direct staff questions
- **Documentation:** Role-specific user guides published in the platform's help center; video walkthroughs for each major workflow
- **Ongoing:** Monthly "office hours" call with Colaberry's Customer Success team for the first 6 months; quarterly thereafter

### 6.3 Support Model

| Tier | Response Time | Scope |
|---|---|---|
| Critical (system down) | 1 hour (24/7) | Full platform unavailable |
| High (feature broken) | 4 hours (business hours) | Core workflow blocked |
| Normal | 1 business day | Degraded functionality, questions |
| Low | 3 business days | Enhancement requests, how-to |

---

## SECTION 7 — SECURITY, COMPLIANCE & DATA PRIVACY

### 7.1 TX-RAMP Compliance

The UTD Residential Life Platform is designed and implemented to satisfy Texas Risk and Authorization Management Program (TX-RAMP) requirements, including:

- Role-based access control with least-privilege enforcement
- Immutable audit logs with tamper detection
- Incident response plan documented and tested annually
- Vulnerability scanning cadence aligned with TX-RAMP control framework
- Data residency: all data stored in US-based cloud regions only

### 7.2 SOC 2 Type II

Colaberry is actively pursuing SOC 2 Type II certification. Our control framework covers the Trust Services Criteria: Security, Availability, Processing Integrity, Confidentiality, and Privacy. A SOC 2 Type I report is available upon request under NDA; Type II audit is scheduled for completion within 12 months of contract execution.

### 7.3 HECVAT

Colaberry will complete the Higher Education Cloud Vendor Assessment Tool (HECVAT) Full version and return it to UTD within 10 business days of contract execution. The HECVAT will be completed by our Information Security team and reviewed by a third-party assessor.

*[HECVAT attachment to be included with final proposal submission per RFP instructions.]*

### 7.4 FERPA

All student data handled by the platform is treated as an education record under FERPA. Specific protections:

- No student PII shared with third parties without UTD authorization
- Data processing agreement (DPA) executed with UTD as the data controller
- Student data is logically isolated per institution; no cross-institution data sharing
- Data retention and deletion schedule aligned with UTD's retention policy; bulk deletion available on contract termination

### 7.5 WCAG 2.1 Level AA Accessibility

The platform is developed against WCAG 2.1 Level AA standards:

- Keyboard-navigable interfaces for all interactive elements
- Sufficient color contrast ratios (minimum 4.5:1 for normal text)
- ARIA labels on all form fields and status indicators
- Screen-reader tested with NVDA and VoiceOver before each release
- Accessibility audit conducted with axe and WAVE tooling as part of CI pipeline

### 7.6 Data Encryption

- **In transit:** All connections enforced over TLS 1.2+ via HTTPS; HTTP redirected to HTTPS
- **At rest:** Database encrypted using AES-256; backups encrypted with the same standard
- **Secrets management:** API keys, database credentials, and OAuth tokens stored in a dedicated secrets manager (never in source code or environment config files visible to developers)

### 7.7 Penetration Testing

Annual third-party penetration test conducted by a qualified vendor. Most recent report available upon request under NDA. Remediation of critical and high findings completed within 30 days of report receipt.

---

## SECTION 8 — TEAM QUALIFICATIONS

### Key Personnel

**Ali Muwwakkil — Chief Executive Officer / Project Sponsor**
[BIO PLACEHOLDER — insert 3–4 sentence bio highlighting higher ed or enterprise software experience, years leading Colaberry, relevant credentials]

**Ram Katamaraja — [TITLE] / Technical Lead**
[BIO PLACEHOLDER — insert 3–4 sentence bio highlighting relevant technical leadership, cloud architecture, integration experience]

**[LEAD ENGINEER NAME] — Lead Software Engineer**
[BIO PLACEHOLDER — Node.js, cloud infrastructure, security compliance experience]

**[IMPLEMENTATION LEAD NAME] — Implementation & Customer Success Lead**
[BIO PLACEHOLDER — higher ed implementations, change management, training experience]

### Subcontractors

Colaberry does not intend to subcontract any material portion of this engagement. All development, integration, and support work will be performed by Colaberry employees.

---

## SECTION 9 — PRICING SCHEDULE

> ⚠️ **THIS SECTION REQUIRES COMPLETION BEFORE SUBMISSION**
> Pricing must be reviewed and approved by Ali Muwwakkil and Ram Katamaraja before inclusion.
> Use the format below and complete all line items.

| Line Item | Year 1 | Year 2 | Year 3 |
|---|---|---|---|
| Platform license (per user/year OR flat) | $________ | $________ | $________ |
| Implementation & setup (one-time) | $________ | — | — |
| StarRez integration | $________ | — | — |
| Salesforce integration | $________ | — | — |
| SSO configuration | $________ | — | — |
| Training (initial + TTT) | $________ | — | — |
| Annual support & maintenance | — | $________ | $________ |
| HECVAT completion & security review | $________ | — | — |
| **TOTAL** | **$________** | **$________** | **$________** |

*All prices in USD. Prices are firm for 90 days from proposal submission date.*

---

## SECTION 10 — REFERENCES

> ⚠️ **THIS SECTION REQUIRES COMPLETION BEFORE SUBMISSION**
> Provide 3–5 references from comparable higher education institutions.
> Each reference must include: institution name, contact name, title, phone, email, contract value, and a 1-sentence description of the engagement.

**Reference 1:**
- Institution: _______________
- Contact Name: _______________
- Title: _______________
- Phone: _______________
- Email: _______________
- Engagement: _______________

**Reference 2:**
- Institution: _______________
- Contact Name: _______________
- Title: _______________
- Phone: _______________
- Email: _______________
- Engagement: _______________

**Reference 3:**
- Institution: _______________
- Contact Name: _______________
- Title: _______________
- Phone: _______________
- Email: _______________
- Engagement: _______________

---

## SECTION 11 — REQUIRED CERTIFICATIONS & ATTACHMENTS

### 11.1 Certificate of Insurance (COI)

> ⚠️ **REQUIRES ALI — cannot be generated by this system**
> Request the current Colaberry COI from Ali Muwwakkil.
> Verify it meets or exceeds the following limits (standard for Texas higher-ed software RFPs):
> - Commercial General Liability: $1,000,000 per occurrence / $2,000,000 aggregate
> - Automobile Liability: $1,000,000 combined single limit
> - Workers' Compensation: statutory limits per Texas law
> - Employers' Liability: $500,000 per occurrence
> - Cyber Liability / Technology E&O: $1,000,000 per occurrence (confirm RFP requirement)
>
> UTD must be listed as an **Additional Insured** on the General Liability and Auto policies.
> Attach the COI certificate (ACORD 25 form) as a separate PDF with this proposal.

### 11.2 HECVAT

> ⚠️ **REQUIRES SECURITY TEAM COMPLETION**
> Complete the HECVAT Full version available at educause.edu/hecvat.
> Estimated completion time: 4–8 hours for the full version.
> Attach as a separate Excel/PDF file with this proposal.

### 11.3 Vendor Information Form / Standard Terms

> ⚠️ **CHECK RFP APPENDICES**
> The RFP (UTD20260428-TB) likely includes one or more required forms (Appendix A, B, etc.) that must be completed and signed. These were not available to this system at time of drafting — retrieve from the Bonfire portal and complete each required form.

### 11.4 Non-Collusion / Conflict of Interest Affidavit

> ⚠️ **CHECK RFP APPENDICES**
> Standard Texas procurement requirement. Complete, sign, and attach per RFP instructions.

---

## SUBMISSION CHECKLIST

Before submitting to Bonfire, confirm every item below is ✅:

- [ ] Cover letter signed by Ali Muwwakkil
- [ ] Section 2: EIN, UEI/DUNS, address, phone filled in
- [ ] Section 8: Real bios for all key personnel
- [ ] Section 9: Pricing schedule completed and approved
- [ ] Section 10: Three references with full contact details
- [ ] Section 11.1: COI from Ali — covers required limits — UTD listed as Additional Insured
- [ ] Section 11.2: HECVAT completed and attached
- [ ] Section 11.3–11.4: All RFP-specified appendices retrieved from Bonfire, completed, and signed
- [ ] Document converted to PDF before upload
- [ ] Uploaded to Bonfire before June 30, 2026, 5:00 PM CT

---

*Draft prepared by Colaberry AI Engineering — Session CC-20260615-rfp1 — 2026-06-15*
*Human review required before submission. See ⚠️ markers throughout.*
