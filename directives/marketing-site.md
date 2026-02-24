# Marketing Site Directive

## Goal
Deliver a public-facing enterprise marketing website that positions the Colaberry Enterprise AI Leadership Accelerator as an executive AI capability-building platform and land-and-expand consulting entry engine. Capture leads from Directors, VPs, CTOs, CIOs, and CDOs evaluating enrollment, corporate sponsorship, or advisory services.

## Pages (10 active + 1 redirect)
- **Home** (`/`) — Hero, executive problem statement, enterprise solution, value props, 8 industries, executive overview download form, CTA
- **Program** (`/program`) — 5-Day Executive Accelerator structure, day-by-day schedule, outcomes, who should attend
- **Pricing** (`/pricing`) — Single $4,500 tier, corporate group pricing, enterprise sponsorship pathway, FAQ
- **Sponsorship** (`/sponsorship`) — ROI comparison, internal capability benefits, security overview, cost justification framework, approval checklist, sponsorship kit download form
- **Advisory** (`/advisory`) — Land-and-expand services: AI Roadmap Workshops, Architecture Design, Agent Implementation, Governance Advisory, AI Talent Deployment
- **Case Studies** (`/case-studies`) — 3 illustrative enterprise case studies (Finance, Healthcare, Manufacturing)
- **Enroll** (`/enroll`) — Cohort enrollment form with Stripe credit card checkout and corporate invoice request
- **Enroll Success** (`/enroll/success`) — Post-payment confirmation with cohort details, schedule, pre-class requirements, .ics calendar download
- **Enroll Cancel** (`/enroll/cancel`) — Stripe cancellation with retry link and contact info
- **Contact** (`/contact`) — Full lead capture form with executive-focused role and interest dropdowns
- **About** (`/about`) — Redirects to `/` (retired)

## Admin Pages (behind JWT authentication)
- **Admin Login** (`/admin/login`) — Email/password login form
- **Admin Dashboard** (`/admin/dashboard`) — Overview stats (revenue, enrollments, seats, upcoming cohorts), cohort table
- **Admin Cohort Detail** (`/admin/cohorts/:id`) — Participant list, CSV export, close enrollment

## Inputs
- Content from Build Guide (Chapters 1-3, 10)
- Brand assets (logo, colors, imagery) — to be provided
- Enterprise positioning strategy document

## Outputs
- Responsive React SPA served at root domain
- Lead data stored in PostgreSQL `leads` table via `POST /api/leads`
- Leads include `form_type` field: `'contact'`, `'executive_overview_download'`, `'sponsorship_kit_download'`, `'advisory_inquiry'`
- Shared `LeadCaptureForm` component used across HomePage, SponsorshipPage, and ContactPage
- Enrollment data stored in PostgreSQL `enrollments` table
- Cohort data stored in PostgreSQL `cohorts` table
- Admin users stored in PostgreSQL `admin_users` table
- Stripe Checkout (hosted) for credit card payments at $4,500 per participant
- Stripe webhook (`POST /api/webhook`) for payment confirmation
- Nodemailer SMTP for enrollment confirmation emails
- CSV export of enrollment data per cohort

## Database Schema (New Tables)
- **cohorts** — id (UUID), name, start_date, core_day, core_time, optional_lab_day, max_seats, seats_taken, status (open/closed/completed)
- **enrollments** — id (UUID), full_name, email, company, title, phone, company_size, cohort_id (FK), stripe_session_id, payment_status (paid/pending_invoice/failed), payment_method (credit_card/invoice)
- **admin_users** — id (UUID), email, password_hash, role

## API Endpoints
### Public
- `GET /api/cohorts` — List open cohorts
- `POST /api/create-checkout-session` — Create Stripe Checkout session, return URL
- `POST /api/create-invoice-request` — Create enrollment with pending_invoice status
- `POST /api/webhook` — Stripe webhook (raw body, signature verified)
- `GET /api/enrollment/verify` — Verify enrollment by session_id for success page

### Admin (JWT required)
- `POST /api/admin/login` — Authenticate, return JWT
- `POST /api/admin/logout` — Client-side token discard
- `GET /api/admin/stats` — Dashboard overview stats
- `GET /api/admin/cohorts` — List all cohorts
- `GET /api/admin/cohorts/:id` — Cohort detail with participants
- `PATCH /api/admin/cohorts/:id` — Update cohort (status, max_seats)
- `GET /api/admin/cohorts/:id/export` — CSV download

## Constraints
- Must be responsive (mobile, tablet, desktop)
- Must meet WCAG 2.1 AA accessibility standards
- Must include SEO meta tags and Google Analytics
- No authentication required for public pages
- Admin pages require JWT authentication
- Stripe webhook requires raw body parsing and signature verification
- Tone: Executive, calm, strategic, authority-driven
- Avoid: "Learn AI", "Develop skills", "Modules", "Certification", "Developer training"

## Future Integrations (TODO — not yet implemented)
- CRM integration (HubSpot/Salesforce webhook on lead POST)
- Automated email sequences on sponsorship/overview downloads
- Calendly/booking integration for strategy calls
- CMS migration for case studies (Contentful or Sanity)
- Real case study attribution after client consent

## Verification
- All 10 public pages render and navigate correctly
- `/about` redirects to `/`
- Lead capture forms submit with correct `form_type` values
- Contact form role dropdown lists Director/VP first
- Zero developer-bootcamp language across all pages
- Emojis present throughout all page sections
- 8 industries displayed on HomePage and AdvisoryPage
- Sitemap contains 8 URLs matching active public routes
- Lighthouse accessibility > 90, performance > 80
- Renders correctly at 320px, 768px, 1024px, 1920px
- `/enroll` displays open cohorts, form validates, Stripe checkout redirects
- `/enroll/success` verifies enrollment and displays cohort details
- Admin routes reject unauthenticated requests (401)
- Admin dashboard shows stats and cohort table
- Admin cohort detail shows participants, CSV export works
- Stripe webhook validates signatures and processes payments
