import * as fs from 'fs';
import * as path from 'path';
import { EXPLORER_CAMPAIGNS } from '../../../../seeds/explorerGrowth/explorerCampaignDefinitions';
import {
  ALI_OUTREACH_CAMPAIGN_KEY,
  EXPLORER_CAMPAIGN_KEYS,
  FLOW_CAMPAIGN_KEYS,
  REGISTERED_CAMPAIGN_KEYS,
  campaignKeyOwnership,
  isRegisteredJourneyCampaignKey,
  registeredKeysForBrand,
} from '../campaignKeys';

/**
 * T505 — the registry. It is the ONE in-memory answer the send path gets to
 * "is this a journey campaign?", so it must be pure, import nothing, and stay in
 * step with the Explorer seed it cannot import.
 */

describe('the module imports nothing', () => {
  it('has no import or require, so the send path can ask it without loading the journey tree', () => {
    const src = fs.readFileSync(path.join(__dirname, '..', 'campaignKeys.ts'), 'utf8');
    expect(src).not.toMatch(/^\s*import\s/m);
    expect(src).not.toMatch(/require\(/);
  });
});

describe('the Explorer eight', () => {
  it('are exactly the seed\'s keys, in the seed\'s order - pinned because this file cannot import the seed', () => {
    expect([...EXPLORER_CAMPAIGN_KEYS]).toEqual(EXPLORER_CAMPAIGNS.map((c) => c.key));
    expect(EXPLORER_CAMPAIGN_KEYS).toHaveLength(8);
  });

  it('belong to colaberry / colaberry-training and are journey-owned', () => {
    for (const key of EXPLORER_CAMPAIGN_KEYS) {
      expect(REGISTERED_CAMPAIGN_KEYS[key]).toMatchObject({ ownership: 'journey', tenantSlug: 'colaberry', brandSlug: 'colaberry-training' });
    }
  });
});

describe('the registry', () => {
  it('is eleven keys: the eight, the two flows, and the shared Ali campaign', () => {
    expect(Object.keys(REGISTERED_CAMPAIGN_KEYS)).toHaveLength(11);
    expect(REGISTERED_CAMPAIGN_KEYS[FLOW_CAMPAIGN_KEYS.colaberryBusinessDiscoveryQuestions]).toMatchObject({ ownership: 'journey', tenantSlug: 'colaberry', brandSlug: 'colaberry-enterprise' });
    expect(REGISTERED_CAMPAIGN_KEYS[FLOW_CAMPAIGN_KEYS.aiFlotationDiscoveryQuestions]).toMatchObject({ ownership: 'journey', tenantSlug: 'ai-flotation', brandSlug: 'ai-flotation' });
    expect(REGISTERED_CAMPAIGN_KEYS[ALI_OUTREACH_CAMPAIGN_KEY]).toMatchObject({ ownership: 'shared', brandSlug: 'colaberry-enterprise' });
    expect(Object.isFrozen(REGISTERED_CAMPAIGN_KEYS)).toBe(true);
  });

  it('answers by key, and only by key - an unregistered name, a null and a prototype property are all no', () => {
    expect(isRegisteredJourneyCampaignKey('explorer_next_lesson')).toBe(true);
    expect(isRegisteredJourneyCampaignKey('ali_personal_outreach')).toBe(true);
    expect(isRegisteredJourneyCampaignKey('cold_outbound_q3')).toBe(false);
    expect(isRegisteredJourneyCampaignKey(null)).toBe(false);
    expect(isRegisteredJourneyCampaignKey(undefined)).toBe(false);
    expect(isRegisteredJourneyCampaignKey('toString')).toBe(false);
    expect(isRegisteredJourneyCampaignKey('__proto__')).toBe(false);
  });

  it('ownership: journey for the ten, shared for Ali, null for anything else', () => {
    expect(campaignKeyOwnership('explorer_weekly_digest')).toBe('journey');
    expect(campaignKeyOwnership(FLOW_CAMPAIGN_KEYS.aiFlotationDiscoveryQuestions)).toBe('journey');
    expect(campaignKeyOwnership(ALI_OUTREACH_CAMPAIGN_KEY)).toBe('shared');
    expect(campaignKeyOwnership('cold_outbound_q3')).toBeNull();
  });

  it('a brand sees only its own keys: AI Flotation never sees a Colaberry Business flow, and no learner key', () => {
    expect(registeredKeysForBrand('ai-flotation')).toEqual([FLOW_CAMPAIGN_KEYS.aiFlotationDiscoveryQuestions]);
    expect(registeredKeysForBrand('colaberry-training')).toEqual([...EXPLORER_CAMPAIGN_KEYS]);
    expect(registeredKeysForBrand('colaberry-enterprise')).toEqual([FLOW_CAMPAIGN_KEYS.colaberryBusinessDiscoveryQuestions, ALI_OUTREACH_CAMPAIGN_KEY]);
    expect(registeredKeysForBrand('cpn')).toEqual([]);
  });
});
