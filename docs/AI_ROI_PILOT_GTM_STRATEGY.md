# AI ROI Pilot: SMB CEO Growth Engine (Go-To-Market Strategy)

**Owner:** Ali Muwwakkil
**Created:** 2026-06-20 (Session CC-20260620-r7x2)
**Status:** Launch sprint, first cold emails target Monday 2026-06-22

---

## 1. The thesis

Our first client, LandJet (Ryan Landry, CEO; Percy Kapadia, COO), is the template for an entire market.
They are a small, lean, operations-heavy company. They have real AI ideas. They are short-staffed.
And when we presented a full engagement ($25,000 upfront + $5,000/mo retainer + $2,000 per new client),
their response was the most useful thing they could have said:

> "We can't afford that, but we would do an incentivized deal based on what the system produces."
> Percy asked to see it "through a more incentivized lens," tying our pay to the revenue we generate.

That is not a rejection. That is a pricing instruction from the market. The CEOs who say it are our
ideal customers: they have great ideas or they are short-staffed, and they want to reach their AI goals
without betting the company on a vendor that has not proven anything yet.

**The play:** come in for a small, fixed amount, prove ROI on a real project first, then convert into a
flexible deal (retainer, revenue share, or pay-per-outcome). Make it repeatable. Make it teachable.
Run many of these at once, and migrate training-program people into delivery and adjacent lanes
(for example Gov Contracts).

---

## 2. The offer: the 6-Week AI ROI Pilot

| | |
|---|---|
| **Price** | **$2,500 flat**, 100% credited toward the first months of any continuation deal |
| **Duration** | 6 weeks |
| **Promise** | One real, working AI system against the highest-ROI workflow we can find, plus a prioritized roadmap |
| **Why $2,500** | Low enough for an SMB CEO to say yes without a committee, high enough to signal commitment and filter tire-kickers. It is a foot in the door, not a profit center. The profit is the continuation deal. |

**The 6 weeks:**
1. **Week 1, Discovery.** Map the operation. Pick the single workflow where AI returns the most money or time, fastest.
2. **Weeks 2-4, Build.** Build real, working production software against that workflow. Not slideware.
3. **Week 5, Measure.** Put it in front of the team, measure the win against a baseline, tune.
4. **Week 6, Roadmap.** Deliver a prioritized AI roadmap and a flexible path to scale.

**The continuation ladder (flexible, pick one or blend):**
- **Monthly retainer** (from ~$3,500/mo): predictable fee to keep building and running. Best for clients with a backlog.
- **Revenue share**: lower fixed fee (for example ~$1,500/mo) plus an agreed % of attributable new revenue. This is the exact structure Percy asked for.
- **Pay per outcome**: a set fee per result the system produces, for example per new booked client (LandJet floated $2,000/client).
- **Hybrid**: a small base plus performance.

The flexibility IS the product. We meet each CEO where their cash flow and risk tolerance are.

---

## 3. Why us (the proof)

We do not pitch capability, we point at a running system. For LandJet we shipped, in about three months,
a production AI growth and quoting platform: multi-channel outbound (Apollo-sourced leads, email, LinkedIn,
AI voice, SMS), an inbound engine that reads booking emails 24/7 and prices quotes in seconds against real
pricing rules, self-healing campaigns, and executive briefings. That is the credibility anchor for every pilot.

Just as important: a large share of that build is reusable. The campaign-system blueprint, the channel
adapters, the lead scoring / classification / routing engines, and the governance scaffolding are
client-agnostic. Each new pilot starts from a templatized stack, not a blank repo. That is what makes
running many pilots at once realistic.

---

## 4. Target customer (ICP)

The customer is "a CEO like Ryan and Percy."

- **Titles:** CEO, Founder, Co-Founder, Owner, President, COO, Managing Partner, Managing Director.
- **Company size:** ~5 to 50 employees (small enough that the CEO still feels every inefficiency personally).
- **Verticals (operations-heavy services):** transportation and logistics, courier and last-mile, construction
  and trades, field services (HVAC, plumbing, electrical), professional services, staffing and recruiting,
  real estate services, hospitality. These businesses have expensive manual workflows AI can compress.
- **Geography:** United States (verified email).
- **Signal:** lean team, owner doing work a system should do, legacy tools, ideas they have not had time to execute.

Apollo search parameters are encoded in `backend/src/scripts/pullAiPilotLeads.js`.

---

## 5. Demand generation

Three coordinated channels, all live for the Monday launch.

1. **Landing page** (`/ai-pilot` on enterprise.colaberry.ai). CEO-focused, dark, authoritative. Frames the pain,
   the 6-week pilot, the $2,500 offer, the LandJet-style proof, and the flexible continuation. Captures leads
   through the existing `/api/leads` endpoint (source `ai-pilot`, form_type `ai_pilot`).
2. **Apollo cold email** (the Monday push). Pull a verified ICP list, review a capped first batch (25-50),
   send a personalized plain-text sequence from ali@colaberry.com. Decision locked 2026-06-20: Ali reviews and
   approves batch 1 before send.
3. **Sequence follow-up.** A short 3-touch cadence (see `docs/AI_ROI_PILOT_EMAIL_SEQUENCE.md`) over ~10 days.

**Deliverability guardrails (sending as ali@colaberry.com):** keep batch 1 small and personalized, throttle
sends, every email carries a real opt-out and a physical mailing address (CAN-SPAM), no image-heavy HTML.
Scale volume only after the first batches show healthy open and reply rates. If volume needs to grow, move
the cold campaign to a dedicated sending subdomain to protect the primary domain.

---

## 6. Funnel and metrics

```
Apollo list  ->  cold email  ->  fit call (20 min)  ->  pilot signed ($2,500)  ->  ROI win  ->  continuation deal
```

Track at each stage. Early targets to validate the model (tune after batch 1):
- Cold email: 40%+ open, 5%+ reply on a tight, personalized list.
- Reply -> fit call: 50%.
- Fit call -> pilot signed: 25-35% (the $2,500 price does the qualifying).
- Pilot -> continuation: 60%+ (this is the real number that matters; the pilot exists to earn it).

Leads land in the existing CRM/pipeline (`leads` table, lead scoring, pipeline stages). Inbound from the
landing page is automatic; reviewed Apollo contacts can be imported to the pipeline as they are worked.

---

## 7. Scale and team (the bigger goal)

This is designed to run as a portfolio, not a single engagement.

- **Concurrency:** the AI Systems Architect setup plus the MyDay structure lets one operator run several
  pilots in parallel, because the engine is templatized and the daily workflow is structured.
- **Teach it:** document the pilot as a repeatable playbook so others can deliver. Each new deliverer
  multiplies capacity.
- **Migrate people in:** move training-program graduates into delivery roles on these pilots, and into
  adjacent lanes such as Gov Contracts, building a staffed services org on top of the same engine.

---

## 8. Risks and guardrails

| Risk | Guardrail |
|---|---|
| Domain reputation from cold volume | Small, personalized, throttled batches; opt-out + address; dedicated subdomain if scaling |
| Pilot scope creep (a $2,500 fee that eats 6 weeks of full-time work) | One workflow only; clear week-by-week scope; the pilot is a loss-leader by design, capped in effort |
| Tire-kickers | The $2,500 price and the fit call qualify; we say no when there is no worthwhile win |
| Delivery capacity as pilots stack | Templatized engine + teach-and-delegate; do not oversell before deliverers are ready |
| Client confidentiality | Public proof describes LandJet as "a multi-market ground-transportation company," not by name, until consent |

---

## 9. This-week launch sprint (-> Monday 2026-06-22)

- [x] Research LandJet relationship, quote, repo, reusable infra (done 2026-06-20)
- [x] Lock offer ($2,500 credited), ICP (SMB CEOs, ops-heavy), email approach (review batch 1), send-from (ali@) (done 2026-06-20)
- [x] Build `/ai-pilot` landing page + lead capture (done 2026-06-20)
- [x] Write Apollo pull script with ICP params (done 2026-06-20)
- [x] Write cold-email sequence + send script (done 2026-06-20)
- [ ] Deploy landing page to prod, verify `/ai-pilot` renders and the form posts
- [ ] Run Apollo pull on prod, export reviewable list
- [ ] Ali reviews + approves batch 1 (25-50)
- [ ] Send batch 1 Monday, then 3-touch follow-up
- [ ] Stand up the Basecamp project + plan ticket (this doc) for ongoing tracking

---

## 10. 30 / 60 / 90

- **30 days:** landing page live, 3-4 cold batches sent, first fit calls booked, 1-2 pilots signed. Measure funnel, tune copy and ICP.
- **60 days:** first pilots delivered, first continuation deals (retainer or rev-share) closed. Write the delivery playbook from what actually happened.
- **90 days:** second deliverer onboarded against the playbook, portfolio of pilots running, repeatable Apollo + landing + sequence engine producing a steady fit-call flow.
