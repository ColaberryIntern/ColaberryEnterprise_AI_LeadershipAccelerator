# Voice AI Studio: Cost model

VS1.2, built 2026-11-24 from official price pages only. Every vendor row cites its URL and read date (`npm run voice:docs-check` fails if one does not). Values marked **estimate** rest on a stated assumption and are replaced by measured usage after LIVE-01 and LIVE-02. Engine B is **UNMEASURED** on purpose: OpenAI publishes token prices, not per-minute prices, and the directive forbids assuming a token-to-minute ratio.

Source of truth: [MASTER_BUILD_PROMPT.md](MASTER_BUILD_PROMPT.md). The directive's planning target of 0.09-0.15 USD per connected minute is provisional, not a quote.

## Vendor prices

| Vendor | Item | Price | Unit | URL | Read date |
|---|---|---|---|---|---|
| Twilio | Outbound call, US local | 0.0140 | per min | https://www.twilio.com/en-us/voice/pricing/us | 2026-11-24 |
| Twilio | Inbound call, US local | 0.0085 | per min | https://www.twilio.com/en-us/voice/pricing/us | 2026-11-24 |
| Twilio | Local number | 1.15 | per month | https://www.twilio.com/en-us/voice/pricing/us | 2026-11-24 |
| Twilio | Toll-free number | 2.15 | per month | https://www.twilio.com/en-us/voice/pricing/us | 2026-11-24 |
| Twilio | ConversationRelay ("starting at"; voice minutes billed separately) | 0.07 | per min | https://www.twilio.com/en-us/products/conversational-ai/pricing | 2026-11-24 |
| Twilio | Media Streams | 0.0044 | per min | https://www.twilio.com/en-us/voice/pricing/us | 2026-11-24 |
| Twilio | Call recording | 0.0025 | per min | https://www.twilio.com/en-us/voice/pricing/us | 2026-11-24 |
| Twilio | Recording storage | 0.0005 | per min per month | https://www.twilio.com/en-us/voice/pricing/us | 2026-11-24 |
| Twilio | Answering machine detection | 0.0075 | per call | https://www.twilio.com/en-us/voice/pricing/us | 2026-11-24 |
| ElevenLabs | TTS, Flash / Turbo / v4 Turbo | 0.04 | per 1K characters | https://elevenlabs.io/pricing/api | 2026-11-24 |
| ElevenLabs | TTS, v4 / v3 / Multilingual v2 | 0.08 | per 1K characters | https://elevenlabs.io/pricing/api | 2026-11-24 |
| ElevenLabs | Creator plan | 22 | per month | https://elevenlabs.io/pricing/api | 2026-11-24 |
| OpenAI | gpt-realtime-2.1 audio in / audio out | 32 / 64 | per 1M tokens | https://developers.openai.com/api/docs/pricing | 2026-11-24 |
| OpenAI | gpt-realtime-2.1-mini audio in / audio out | 10 / 20 | per 1M tokens | https://developers.openai.com/api/docs/pricing | 2026-11-24 |
| OpenAI | gpt-realtime-2.1-mini text in / text out | 0.60 / 2.40 | per 1M tokens | https://developers.openai.com/api/docs/pricing | 2026-11-24 |
| Anthropic | claude-haiku-5-5 input / output (prompt up to 100k) | 0.10 / 0.50 | per 1M tokens | https://platform.claude.com/docs/en/about-claude/pricing | 2026-11-24 |
| Anthropic | claude-sonnet-5-5 input / output | 2 / 10 | per 1M tokens | https://platform.claude.com/docs/en/about-claude/pricing | 2026-11-24 |

## Per connected minute

| Engine | Component | USD per min | Basis |
|---|---|---|---|
| A (Relay + ElevenLabs + OpenAI chat) | Twilio outbound voice | 0.0140 | published |
| A | ConversationRelay | 0.0700 | published ("starting at") |
| A | OpenAI chat (gpt-4o) streaming replies | **UNMEASURED** | Engine A moved from Claude on 2026-11-28; measured from LIVE-01 usage, and priced here only with a dated official source |
| A | ElevenLabs TTS, only if billed separately | 0.0300 | **estimate**: 750 spoken characters per minute at the Flash rate; neither vendor states whether Relay includes it |
| **A total** | | **0.084 to 0.114 plus the model** | Twilio and the voice only; the model's share comes from LIVE-01 |
| B (Media Streams + OpenAI Realtime) | Twilio outbound voice + Media Streams | 0.0184 | published |
| B | OpenAI Realtime audio tokens | **UNMEASURED** | measured from LIVE-02 session usage; no per-minute price is published |

## Monthly scenarios, Engine A (connected minutes)

Low = voice included in Relay (0.085/min). High = ElevenLabs billed separately (0.115/min). Base = the midpoint (0.100/min), used for planning until LIVE-01 shows which one applies.

| Minutes per month | Low | Base | High |
|---|---|---|---|
| 1,000 | 85 | 100 | 115 |
| 5,000 | 425 | 500 | 575 |
| 10,000 | 850 | 1,000 | 1,150 |
| 25,000 | 2,125 | 2,500 | 2,875 |

Plus numbers: 0 USD if an idle number we already own is reused (READINESS.md), else 1.15 per local number per month. Recording is off by default (directive), so it adds nothing until approved.

## What this does not establish

- Actual Synthflow cost: the contract, included minutes and the quoted 2,500 USD fee are not in hand; comparison waits for Ali's contract terms (VS5.1 / M4).
- Engine B cost: needs measured LIVE-02 usage.
- Taxes, burst or concurrency surcharges, and any enterprise discounts.
- Billable versus connected duration: Twilio bills by the minute rounded up; measured from live calls.
