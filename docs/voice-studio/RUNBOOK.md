# Voice AI Studio: Runbook

One section per alert. The alert's description names its section. Alerts go through the shared alert service, which folds repeats of one open condition together. A test (services/voice/ops runbook test) fails if an alert has no section here, if a section has no alert, or if a section's drill does not raise its alert.

Source of truth: [MASTER_BUILD_PROMPT.md](MASTER_BUILD_PROMPT.md) (authorized test number redacted; it lives only in the prod env var `VOICE_TEST_ALLOWED_NUMBER`). Ticket ladder: [Basecamp list](https://app.basecamp.com/3945211/buckets/7463955/todolists/10542482938).

## How to look

- Every voice log line is JSON with `service: voice-studio`, `event`, `error_class` and `correlation_id` (the call id). Follow one call by its correlation_id.
- `voice_ops_metrics` is logged every five minutes while a direct engine is on: volume, success and failure rate, retries, and latency percentiles per provider operation.
- Never paste a phone number, transcript or key into a ticket. Use the call id.
- Emergency stop: the existing launch safety switch. It blocks new dials, inbound agent answers and transfers. It does not hang up a live call.

## Calls are accepted but never ring (`no_ringing`)

- **Detection:** Calls the carrier accepted with no ringing event within two minutes.
- **Containment:** Turn VOICE_STUDIO_ENABLED off if live; test calls: stop the run.
- **Diagnostics:** Twilio console call log for the CallSid (shown masked in Call Explorer); number status; caller-ID and geographic permission errors in voice_dispatch lines.
- **Remediation:** Fix the number or permission at the carrier, then place one test call.
- **Evidence:** call ids, the alert, the log lines and the test call that proved the fix, in the ticket.

## Busy or no answer (`busy_no_answer`)

- **Detection:** 80% or more of at least five ended calls in an hour were busy or not answered.
- **Containment:** Pause the route (Numbers and Routing: disabled).
- **Diagnostics:** Time of day against the recipient time zone; ring timeout; whether the number is labeled as spam.
- **Remediation:** Change the hours or the number, then resume at a canary percentage.
- **Evidence:** call ids, the alert, the log lines and the test call that proved the fix, in the ticket.

## Calls are failing (`call_failures`)

- **Detection:** 30% or more of at least five ended calls in an hour failed.
- **Containment:** Set the route to legacy, or turn VOICE_STUDIO_ENABLED off.
- **Diagnostics:** error_class by count in Call Explorer; voice_dispatch and voice_llm_turn_failed lines for the same correlation_id.
- **Remediation:** Fix the top error class; test call; resume.
- **Evidence:** call ids, the alert, the log lines and the test call that proved the fix, in the ticket.

## Webhook signature errors (`webhook_signature`)

- **Detection:** Five or more signature failures in an hour, on webhooks or the WebSocket handshake.
- **Containment:** None needed for safety: unsigned requests are refused. Pause dialing, because results cannot arrive.
- **Diagnostics:** Was TWILIO_AUTH_TOKEN rotated? Does VOICE_PUBLIC_BASE_URL / VOICE_WS_BASE_URL match the address the carrier calls? One source address repeating is a probe, not an outage.
- **Remediation:** Owner sets the current token on the server; restart through deploy-prod.sh; test call.
- **Evidence:** call ids, the alert, the log lines and the test call that proved the fix, in the ticket.

## Provider 429 or 5xx (`provider_circuit_open`)

- **Detection:** A circuit (twilio, anthropic, openai_realtime) is not closed: half or more of at least five recent calls to it failed.
- **Containment:** Automatic: Engine A apologizes at once, Engine B and dials are refused. It re-tests itself after 60 seconds.
- **Diagnostics:** voice_circuit_changed lines; provider status page; quota and key validity (AuthError).
- **Remediation:** Nothing if it closes by itself. Quota or key: owner action. A restart re-tests at once.
- **Evidence:** call ids, the alert, the log lines and the test call that proved the fix, in the ticket.

## Silent audio (`silent_audio`)

- **Detection:** A person answered and the AI session never succeeded.
- **Containment:** Set the route to legacy.
- **Diagnostics:** Did the WebSocket upgrade arrive (voice_ws_upgrade_refused, voice_ws_setup_timeout)? Did the session start line appear? Engine B: did session.updated arrive?
- **Remediation:** Fix the address, flag or key it points to; test call on the same engine.
- **Evidence:** call ids, the alert, the log lines and the test call that proved the fix, in the ticket.

## Interruption failures (`interruption_failures`)

- **Detection:** 20 or more rejected turn changes in an hour.
- **Containment:** Switch the route to the other engine.
- **Diagnostics:** voice_session_transition_rejected lines: from, on and reason for one correlation_id.
- **Remediation:** Reproduce with npm run voice:load -- --mock; fix; add the sequence as a test.
- **Evidence:** call ids, the alert, the log lines and the test call that proved the fix, in the ticket.

## Wrong agent (`wrong_agent`)

- **Detection:** A live outbound direct-engine call in the last day ran without a published version.
- **Containment:** Turn VOICE_STUDIO_ENABLED off.
- **Diagnostics:** Call detail: version and route; route history; who applied the last route change.
- **Remediation:** Point the route at the right published version; contact the people called if the content was wrong.
- **Evidence:** call ids, the alert, the log lines and the test call that proved the fix, in the ticket.

## Duplicate calls (`duplicate_calls`)

- **Detection:** A destination was dialed more than twice in ten minutes.
- **Containment:** Turn the emergency stop on.
- **Diagnostics:** Reservations for that destination hash: idempotency keys and paths. Two keys for one intent is the defect.
- **Remediation:** Fix the caller of the gateway; never delete reservations; resume with the emergency stop off.
- **Evidence:** call ids, the alert, the log lines and the test call that proved the fix, in the ticket.

## Dials with an unknown outcome (`dispatch_unknown`)

- **Detection:** Any dial in the last day whose outcome is unknown.
- **Containment:** None: an unknown dial is never retried.
- **Diagnostics:** Ask the carrier for the CallSid or for calls created at that time.
- **Remediation:** Reconcile the row (voice:reconcile, VS4.5); never redial by hand.
- **Evidence:** call ids, the alert, the log lines and the test call that proved the fix, in the ticket.

## Calls that never ended (`orphaned_sessions`)

- **Detection:** A call open for more than 70 minutes.
- **Containment:** Hang up at the carrier if it is really live.
- **Diagnostics:** Last event for the call; was there a deploy or restart at that time (voice_drain_finished forced count)?
- **Remediation:** Reconcile from the carrier status.
- **Evidence:** call ids, the alert, the log lines and the test call that proved the fix, in the ticket.

## Live calls with no events (`stalled_events`)

- **Detection:** A live call with no event for five minutes.
- **Containment:** None.
- **Diagnostics:** Are status callbacks arriving at all (voice_status_ingested)? Then webhook_signature above.
- **Remediation:** Fix delivery; the reconcile sweep closes the calls.
- **Evidence:** call ids, the alert, the log lines and the test call that proved the fix, in the ticket.

## Reservations stuck (`queue_stuck`)

- **Detection:** A reservation open two minutes past its lease.
- **Containment:** None: it only blocks that destination.
- **Diagnostics:** A process that died between reserve and dial (restart time).
- **Remediation:** It expires from the caps after 24 hours; reconcile sooner if it blocks a wanted call.
- **Evidence:** call ids, the alert, the log lines and the test call that proved the fix, in the ticket.

## Runaway cost (`runaway_cost`)

- **Detection:** Voice spend in 24 hours reached the alert level.
- **Containment:** Turn the emergency stop on; hang up live calls.
- **Diagnostics:** Costs tab by provider; longest calls; tool loops (voice_tool_follow_up_limit).
- **Remediation:** Owner decides when to resume and at which cap.
- **Evidence:** call ids, the alert, the log lines and the test call that proved the fix, in the ticket.

## Slow answers (`slow_turns`)

- **Detection:** 95th percentile time to first audio over 2.5 seconds across at least ten turns.
- **Containment:** Switch the route to the faster engine.
- **Diagnostics:** anthropic.turn latency in voice_ops_metrics; tool time in the Trust Center timeline.
- **Remediation:** Smaller model or shorter prompt is an owner decision.
- **Evidence:** call ids, the alert, the log lines and the test call that proved the fix, in the ticket.

## Many tool calls refused (`policy_failures`)

- **Detection:** Ten or more refused tool calls in an hour.
- **Containment:** Usually none: refusal is the control working.
- **Diagnostics:** Which tool and reason in the Trust Center. Many from one call is likely prompt injection.
- **Remediation:** Fix the version tool list, or leave it refused.
- **Evidence:** call ids, the alert, the log lines and the test call that proved the fix, in the ticket.

## Opt-outs not recorded (`opt_out_pending`)

- **Detection:** An opt-out older than 15 minutes has no record.
- **Containment:** Turn the emergency stop on until it is recorded.
- **Diagnostics:** voice_caller_opt_out lines with error_class; database health.
- **Remediation:** The sweep retries every five minutes; confirm the unsubscribe event exists, then resume.
- **Evidence:** call ids, the alert, the log lines and the test call that proved the fix, in the ticket.

## Call handlers failing (`handler_failures`)

- **Detection:** Any handler failure in the last hour.
- **Containment:** None: each failure ends only its own call.
- **Diagnostics:** voice_ws_handler_failed and voice_realtime_handler_failed error_class.
- **Remediation:** Fix the code path; add the input as a test.
- **Evidence:** call ids, the alert, the log lines and the test call that proved the fix, in the ticket.

## Privacy incident (reported by a person, not detected)

- **Detection:** someone reports that a number, name or conversation appeared where it should not. Nothing in voice logs or alerts is allowed to carry one, so there is no counter for it.
- **Containment:** turn the emergency stop on; take the page or export offline; do not delete evidence.
- **Diagnostics:** who could see it and for how long; which call ids; was it a log, an export or the repository (which is public)?
- **Remediation:** remove it at the source, rotate anything secret through the owner, and tell the owner the same day. The owner decides who is notified.
- **Evidence:** timeline, scope, what was removed and the test that now prevents it.
