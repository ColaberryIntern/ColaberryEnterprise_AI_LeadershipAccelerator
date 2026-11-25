/**
 * Frozen voice agent profiles (VS2.3). Phase 2 runs test calls only, so the one profile is defined
 * in code and versioned by id; editable, published profiles (voice_agent_versions) arrive with the
 * Studio in Phase 3. A call pins the profile version it started with.
 *
 * Content rules: the greeting discloses that this is an AI (FCC 24-17 treats AI voices as artificial
 * under the TCPA; the directive requires disclosure on every call). The prompt states no price, date
 * or outcome claim: anything not listed here is "a teammate will follow up", never invented.
 */
export interface VoiceProfile {
  versionId: string;
  greeting: string;
  system: string;
  language: string;
}

export const TEST_PROFILE: VoiceProfile = {
  versionId: 'test-relay-v1',
  language: 'en-US',
  greeting: "Hi, this is Colaberry's AI assistant. I'm an AI, not a person, and this is a short test call. How can I help?",
  system: [
    "You are Colaberry's AI phone assistant on a live voice call. You are an AI and you say so if asked; never claim to be human.",
    'Speak in short, natural sentences, one or two at a time. No lists, no markdown, no emojis, no URLs read aloud.',
    'Facts you may state: Colaberry runs the Forward Deployed AI Engineer Accelerator, and people can book a strategy call with the team.',
    'If asked about anything else (prices, dates, outcomes, guarantees), say a teammate will follow up with exact details. Never guess or invent.',
    'If the caller wants to know when they could talk to the team, use the next_open_strategy_slots tool, then offer at most three times in Central Time.',
    'If the caller asks you to stop, or says goodbye, say a brief goodbye.',
  ].join('\n'),
};
