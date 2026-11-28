/**
 * The field parser decides WHERE a card is written. Getting it wrong stores
 * real text where nobody looks, which is invisible rather than noisy, so it
 * fails closed.
 */
import {
  DEFAULT_JOURNEY_FIELD,
  journeyFieldSettingFor,
  parseJourneyField,
} from '../journeySummaryWriter';

describe('parseJourneyField', () => {
  it('falls back to the field Kes created when the setting is absent', () => {
    expect(parseJourneyField(undefined)).toBe(DEFAULT_JOURNEY_FIELD);
    expect(parseJourneyField(null)).toBe(DEFAULT_JOURNEY_FIELD);
    expect(parseJourneyField('')).toBe(DEFAULT_JOURNEY_FIELD);
  });

  it('accepts a plain field key', () => {
    expect(parseJourneyField('ent_lead_journey_summary')).toBe('ent_lead_journey_summary');
  });

  it('strips the contact. prefix GHL shows in its own UI', () => {
    // Kes quoted the key as "contact.ent_lead_journey_summary"; pasting that
    // verbatim into the setting must not produce a field named "contact.…".
    expect(parseJourneyField('contact.ent_lead_journey_summary'))
      .toBe('ent_lead_journey_summary');
  });

  it('refuses anything that is not a field key, rather than guessing', () => {
    expect(parseJourneyField('Ent Lead Journey')).toBeNull();   // spaces
    expect(parseJourneyField('ENT_LEAD')).toBeNull();           // uppercase
    expect(parseJourneyField('field;drop')).toBeNull();         // punctuation
    expect(parseJourneyField('a'.repeat(65))).toBeNull();       // too long
    expect(parseJourneyField(42)).toBeNull();                   // wrong type
    expect(parseJourneyField({})).toBeNull();                   // wrong type
  });

  it('names a per-account setting, because the field is per sub-account', () => {
    expect(journeyFieldSettingFor('school_of_data_analytics'))
      .toBe('ghl_journey_field_school_of_data_analytics');
    expect(journeyFieldSettingFor('default')).toBe('ghl_journey_field_default');
  });
});
