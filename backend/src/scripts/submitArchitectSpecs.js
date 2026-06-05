#!/usr/bin/env node
// Fire 4 AI Project Architect "Professional" mode generate jobs in
// parallel - one per gov-bid RFP. Each takes ~15 min. Writes job_ids
// to /tmp/architect-jobs.json so a follow-up poller can wait + download.

const path = require('path');
const fs = require('fs');
require('dotenv').config({ path: path.resolve(__dirname, '../../../.env') });
const axios = require(path.resolve(__dirname, '../../../node_modules/axios'));

const ARCHITECT = 'https://advisor.colaberry.ai';

const PROJECTS = [
  {
    rfp: 4,
    intern: 'Akiwam',
    bcListId: 9967405074,
    project_name: 'TDHCA Multifamily Management System - Colaberry Build',
    closeDate: '2026-06-29',
    requirements: `BUILD CONTEXT
This is a working demo / pilot tool to accompany our government RFP response to the Texas Department of Housing and Community Affairs (TDHCA) RFO 332-RFO26-1007 for a Multifamily Management System. The agency manages 9% / 4% LIHTC (Low-Income Housing Tax Credit), HOME, NHTF (National Housing Trust Fund), and tax-exempt bond programs. They are replacing manual paper / spreadsheet workflows.

We need to build a functional web app demo we can show TDHCA evaluators, with seeded sample data (10-20 fake multifamily applications) so the demo shows real screens with real-looking data flowing through them. Live deployable URL is the priority.

THE SOFTWARE WE'RE BUILDING

Core capabilities:
1. Application intake portal - developer applies for an affordable housing tax credit allocation. Multi-page form with property details (address, units, AMI mix, construction type), sponsor information, financial pro forma upload, supporting documents upload, deadline gating per allocation cycle.
2. Underwriting workbench - TDHCA underwriter reviews applications. Side-by-side application + scoring criteria. Threshold tests, scoring rubric, conditional approval flow, deficiency letters with editable templates.
3. Asset management - once an allocation is awarded, properties enter the long-term compliance period (15-30 years). Track lease-up status, tenant income certifications, annual owner certifications, physical inspection schedules.
4. Compliance monitoring - automatic generation of LURAs (Land Use Restriction Agreements), IRS Forms 8823 (Tenant Income Certification) and 8609 (Tax Credit Allocation Certification). Workflow rules trigger when inspections lapse or income limits are exceeded.
5. Document generation - generate signed PDF contracts, LURAs, deficiency letters, award letters, regulatory agreements from configurable templates. Template editor for TDHCA admin to modify wording.
6. Pipeline dashboard - admin view of all applications, status (intake / underwriting / awarded / monitoring), deadlines coming up, exceptions and overdue items.
7. Public lookup - search-only view for the public to see awarded properties, allocation amounts, period of affordability.

User roles:
- Developer applicant (external, self-registered)
- TDHCA application admin (intake, deadline management)
- TDHCA underwriter (scoring, threshold tests)
- TDHCA asset manager (post-award monitoring, compliance)
- TDHCA supervisor (override / approve / configure)
- Public (read-only search)

Integrations:
- E-signature provider (DocuSign or Adobe Sign) for LURA execution
- Payment processor for application fees
- ESRI / mapping for property location verification
- Texas Comptroller for sponsor entity verification (test/mock for demo)
- Email / SMS for deadline reminders

Technical baseline:
- Web app, responsive (mobile-aware but desktop-first since this is back-office)
- AuthN: SSO + traditional login. AuthZ: role-based.
- Data: PostgreSQL or SQL Server compatible.
- Document storage: S3-compatible blob store.
- Audit log: every state transition logged with actor + timestamp.
- API-first - all UI calls go through a documented REST/JSON API; future TDHCA in-house tools can integrate.
- Hosted: a single dev URL (we'll redirect this to a fake-TDHCA-branded landing page so the demo is convincing).

Demo storyline we need the build to support:
1. A developer named "Riverside Apartments LLC" submits an application for 120-unit LIHTC project in Travis County
2. The underwriter logs in, sees the new application in the queue, runs the threshold tests, scores it
3. Compliance fires a LURA generation, generates a signed PDF
4. Dashboard shows the property entering the 30-year compliance period
5. A second view shows the public lookup of the same property

Build-out priorities for the 2-week sprint:
- Working UI for steps 1-5 of the storyline (real screens, real data flow)
- 10-20 seeded fake applications across different statuses
- LURA generation with sample template
- Pipeline dashboard with charts
- Public lookup page
- Deployed to a public URL we can include in the proposal documentation

Out-of-scope for the 2-week build:
- Real e-signature integration (mock it)
- Real Comptroller integration (mock it)
- Real payment processing (mock it)
- Long-term compliance period accruals (just show the screen)`,
  },
  {
    rfp: 8,
    intern: 'OBI',
    bcListId: 9967406450,
    project_name: 'TDCJ-OIG Records Management System - Colaberry Build',
    closeDate: '2026-11-01',
    requirements: `BUILD CONTEXT
Working demo / pilot tool to accompany our RFO response to the Texas Department of Criminal Justice - Office of Inspector General (TDCJ-OIG) solicitation 696-IG-26-O012 for a cloud-based Records Management System. TDCJ-OIG investigates crimes inside Texas state prisons. They need a multi-jurisdictional RMS that meets CJIS, TX-RAMP, and NIST 800-53/800-88 standards.

This is a law-enforcement RMS. The demo will be shown to OIG investigators + legal team. Live deployable URL with realistic synthetic case data is the goal. CJIS-grade UX cues throughout.

THE SOFTWARE WE'RE BUILDING

Core capabilities:
1. Case management - investigators create cases, attach evidence, log interviews, track chain of custody. Cases have status (open / under review / closed / referred).
2. Evidence locker - upload digital evidence (photos, documents, audio, video). Each evidence item has chain-of-custody log; transfers logged with timestamp + officer ID. Hash verification on upload.
3. Interview / statement intake - structured forms for witness / suspect statements. Audio attachment, transcription field, signature block.
4. Incident report builder - law-enforcement-grade incident report with standard sections (subject, scene, narrative, attached evidence, charges). Auto-fill from case data. PDF export.
5. Multi-jurisdictional search - search across the inmate population (mocked Texas inmate data feed) by name, TDCJ ID, alias, tattoo, last known unit. Results show in a unified record.
6. Built-in reports - dashboards for OIG leadership: open cases, by region, by case type, by investigator. Report templates that pre-populate (e.g., monthly OIG summary).
7. Audit log - every read of a record + every write logged with actor / timestamp / reason. Searchable by investigator for accountability.
8. CJIS-compliant authentication - MFA required, automatic session expiry, IP allowlist, certificate-based admin auth.

User roles:
- Investigator (creates cases, attaches evidence)
- Supervising investigator (approves case closures, reassigns)
- OIG Director (read-only across all cases + reports)
- Records clerk (intake, scanning, evidence cataloging)
- Auditor (read-only across audit log)
- System admin (user management, configuration)

Integrations:
- Texas TDCJ inmate database (mock for demo; structured similar to real export)
- Texas DPS criminal history (mock)
- Email / SMS for case-update alerts
- LDAP / SSO for state government workforce identity

Technical baseline:
- Web app + secure mobile (read-only) companion
- AuthN: SSO via SAML; MFA mandatory; role-based authZ
- Data: PostgreSQL with row-level encryption for sensitive fields
- Evidence storage: S3-compatible blob store with object lock (immutable evidence)
- Audit log: append-only, immutable, queryable
- All inbound + outbound traffic over TLS 1.3
- Hosted: a dev URL we'll style as fake-OIG-portal
- Backup + disaster recovery design (described, not necessarily executed in the 2-week sprint)

Demo storyline:
1. An investigator "Officer Martinez" creates a new case "Internal Complaint - Coffield Unit 2026-04"
2. Uploads 3 evidence items (1 photo, 1 PDF, 1 audio file) with chain-of-custody fields
3. Adds 2 witness statements
4. Generates an incident report draft
5. Supervisor reviews and closes the case
6. Director sees the case appear in the monthly OIG dashboard
7. Audit log shows every action

Build-out priorities for the 2-week sprint:
- Working UI for steps 1-6 (real screens, real data flow)
- 5-10 seeded fake cases in different statuses
- Evidence upload + chain-of-custody log working end-to-end
- Incident report PDF generation with TDCJ-OIG-style header
- OIG dashboard with at least 3 charts
- Audit log viewer
- Deployed to a public URL

Out-of-scope:
- Real CJIS certification (we'll describe how we'd achieve it)
- Real DPS criminal history integration (mock)
- Real SSO with state IdP (mock)
- Real long-term evidence retention policies (just describe)`,
  },
  {
    rfp: 14,
    intern: 'Omolola',
    bcListId: 9967407307,
    project_name: 'UTD Residential Life Platform - Colaberry Build',
    closeDate: '2026-06-30',
    requirements: `BUILD CONTEXT
Working demo / pilot tool to accompany our RFP response to the University of Texas at Dallas (UTD) Residential Life RFP UTD20260428-TB for a Community Development Software for Housing. UTD has 26,700 students; this software is used by residential life staff for daily operations across all on-campus housing.

The current incumbent is a residential-curriculum-specific software (Roompact or similar) that the UTD team has used since 2019. We need a working alternative that shows we understand the actual day-to-day workflows.

Demo URL will be shown to UTD Residential Life leadership and student-staff users. Real working screens with fake student data.

THE SOFTWARE WE'RE BUILDING

Core capabilities:
1. Forms for reporting - structured forms for on-call logs, noise complaints, evaluations, lock-outs, roommate agreements. Each form has its own fields, save-in-progress, photo attachment, escalation rules.
2. Staff scheduling - calendar UI for front desk hours, on-call rotation, RA duty schedule. Shift swap requests. Auto-reminders.
3. Program proposals - student staff submit program ideas (movie night, study session, mental health workshop). Each links back to the residential curriculum learning outcomes. Approval workflow.
4. Performance evaluations - student staff (RA, peer mentor) get end-of-semester evaluations. Both self + supervisor; comparison view.
5. Activity attendance tracking - students RSVP to programs, check in via QR. Attendance recorded against student record.
6. Communications hub - mass-text / email / inner-platform messaging. Target by hall, floor, demographic, or individual student. Survey support (simple multi-question).
7. Student profile - holistic view of one student: program attendance, conversations with staff, noise complaints, roommate agreement, photo. Note privacy levels (some fields RA-visible, some only pro-staff visible).
8. Insight reports - data dashboards: program attendance by category, noise complaints per hall, RA conversations per week. Auto-snapshot at semester end.
9. Tiered user access - different visibility for student staff vs professional staff vs leadership.
10. Macro / micro views - drill from community area > hall > floor > individual student.
11. Student of concern flag - any staff member can flag; triggers a workflow to professional staff.

User roles:
- Resident student (sees own profile, RSVPs to programs)
- RA / student leader (sees floor, can write logs, attends programs)
- Pro staff (Hall Director, RD) - sees hall, can run reports
- Residential Life leadership - sees all, configures
- Auditor / privacy officer - read-only across audit log

Integrations:
- StarRez (housing assignment data) - mandatory
- Salesforce (student CRM) - mandatory
- Email / SMS gateway
- QR check-in via mobile camera

Technical baseline:
- Web app (responsive), with a mobile-friendly RA-on-duty view
- AuthN: SSO via SAML (UTD NetID); role-based authZ
- Data: PostgreSQL
- File storage: S3-compatible (incident photos)
- TX-RAMP / FedRAMP / SOC2 Type II / HECVAT - we will note that we have / are pursuing these
- API-first, OpenAPI-documented
- Hosted: a dev URL we'll style as UTD-Residential-Life-portal

Demo storyline:
1. RA "Jordan" logs in via SSO, sees the floor dashboard for South Hall 3rd floor
2. Writes a noise complaint log linked to specific student
3. Proposes a Friday program "Stress Relief Bingo" linked to wellness curriculum learning outcome
4. Hall Director approves, mass-text goes to floor
5. Students RSVP, attend, check in via QR
6. Attendance feeds the individual student profile
7. Hall Director runs an end-of-semester report showing attendance + complaints

Build-out priorities for the 2-week sprint:
- Working UI for steps 1-7 (real screens, real data flow)
- 30-40 seeded fake students, 5-10 fake RAs, 2-3 fake Hall Directors
- 3-5 sample programs with real-looking attendance
- Noise complaint form working with photo upload
- Student of concern flag triggering email
- Reports dashboard with at least 4 charts
- Deployed to a public URL

Out-of-scope:
- Real SSO with UTD NetID (mock)
- Real StarRez integration (mock)
- Real Salesforce integration (mock with sample CRM data)
- Real TX-RAMP / SOC2 cert (we have the path, not the cert)`,
  },
  {
    rfp: 2,
    intern: 'samrawit',
    bcListId: 9967409301,
    project_name: 'Harris County Agenda + Meeting Management - Colaberry Build',
    closeDate: '2026-06-22',
    requirements: `BUILD CONTEXT
Working demo / pilot tool to accompany our RFP response to Harris County (Texas) solicitation 26/0075 for an Agenda and Meeting Management System. The county's elected boards and commissions hold weekly public meetings. They publish agendas, take votes, capture minutes, distribute action items, and stream the meeting publicly. They need a single web platform to replace fragmented Word/PDF workflows.

The competitor space is dominated by Granicus / CivicClerk / Diligent. To win we need to show a working, public-meeting-ready product. Demo URL will be shown to the Harris County Office of Management and Budget and the County Clerk's office.

THE SOFTWARE WE'RE BUILDING

Core capabilities:
1. Agenda builder - drag-and-drop meeting agenda construction. Each item has a number, title, description, supporting documents, presenter, suggested action (vote / receive / refer). Auto-numbering. Auto-publish.
2. Document management - staff upload supporting docs per agenda item. Version control (revision history). Access control: draft items visible to staff only, published to public.
3. Voting workflow - during the live meeting, a clerk can call a vote per item. Each member's vote (yes/no/abstain/absent) captured. Vote totals shown live. Vote record auto-archived.
4. Minutes generation - auto-build draft minutes from agenda + votes + clerk's notes. Edit, finalize, sign, publish.
5. Action item tracker - any motion or board direction becomes a trackable action item assigned to a staff division with a deadline. Status tracking.
6. Public portal - residents see upcoming meetings, agendas, materials, vote results, minutes, action item status. Search by topic, date range, board member.
7. Live meeting view - while the meeting is in session, a public "now showing" page shows the current agenda item, presenter, projected docs. Optionally integrates with the video stream.
8. Member portal - elected officials log in, see their upcoming meeting, request agenda items, review materials, declare conflicts of interest.
9. Compliance + open meetings - Texas Open Meetings Act compliance: posting timestamps, advance notice, executive session tracking with required confidentiality.
10. APIs aligned to Harris County Universal Services Reference Architecture (USRA).

User roles:
- Public (read-only, no auth)
- Clerk / agenda staff
- Department liaison (submits items)
- Board member (reviews, votes)
- Board chair / county judge (special privileges)
- System admin

Integrations:
- SQL Server backend (Harris County standard)
- SSO via Harris County AD/SAML
- Video streaming (Granicus or YouTube-style mock)
- Document management with version control
- Compliance with Harris County MWBE rules in vendor evaluation

Technical baseline:
- Web app + mobile-aware public portal
- AuthN: SSO + traditional. AuthZ: role-based.
- Data: SQL Server compatible (PostgreSQL OK for demo, note SQL Server migration path)
- API-first, REST/JSON, aligned to USRA
- Audit log for every agenda item change + every vote
- Hosted: dev URL styled as Harris-County-Meeting-Portal

Demo storyline:
1. Clerk logs in, builds an agenda for next Tuesday's Commissioners Court (8 items)
2. Department liaisons upload supporting docs per item
3. Members log in, review materials, declare a conflict on item 4
4. Live meeting view: chair calls vote on item 3, members vote, motion carries 4-1
5. Action item auto-created from a motion in item 5: "Public Works to report back in 60 days"
6. Public portal shows the meeting with all votes + draft minutes
7. Action item dashboard shows the open item assigned to Public Works

Build-out priorities for the 2-week sprint:
- Working UI for steps 1-7
- 3-5 fake meetings with fake agendas
- 8-10 fake board members
- Voting flow working live-style
- Public portal with agendas + materials + vote results
- Member portal with conflicts-of-interest flow
- Reports dashboard
- Deployed to public URL

Out-of-scope:
- Real SQL Server (demo on Postgres, note migration)
- Real SSO with Harris County AD (mock)
- Real video streaming (mock with embedded YouTube placeholder)
- Real Open Meetings Act timing constraints (describe + show UI for it)`,
  },
];

(async () => {
  const jobs = [];
  for (const p of PROJECTS) {
    console.log(`Submitting: ${p.project_name}`);
    const r = await axios.post(`${ARCHITECT}/api/v1/generate`, {
      project_name: p.project_name,
      requirements: p.requirements,
      depth_mode: 'professional',
      blueprint: 'standard',
    }, { timeout: 30000 });
    console.log(`  job_id=${r.data.job_id} status=${r.data.status}`);
    jobs.push({
      rfp: p.rfp,
      intern: p.intern,
      bcListId: p.bcListId,
      project_name: p.project_name,
      closeDate: p.closeDate,
      job_id: r.data.job_id,
      poll_url: r.data.poll_url,
      download_url: r.data.download_url,
      submitted_at: new Date().toISOString(),
    });
  }
  const outFile = path.resolve(__dirname, '../../../tmp/architect-jobs.json');
  fs.mkdirSync(path.dirname(outFile), { recursive: true });
  fs.writeFileSync(outFile, JSON.stringify(jobs, null, 2));
  console.log(`\n${jobs.length} jobs queued. Polling state -> ${outFile}`);
})().catch(e => { console.error('FAIL:', e.response?.data || e.message); process.exit(1); });
