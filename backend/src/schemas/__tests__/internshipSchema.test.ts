/**
 * The request contracts, with the secret-rejection rule pinned explicitly.
 *
 * "No API accepts or stores an API-key value or password" is a stated
 * requirement. `.strict()` is what makes it true; these tests are what stop
 * someone relaxing it to `.passthrough()` for a quick fix without noticing.
 */
import {
  FORBIDDEN_SECRET_KEYS,
  administrativeIntakeSchema,
  cardImpressionSchema,
  dismissCardSchema,
  selectChannelSchema,
  startApplicationSchema,
} from '../internshipSchema';

const STRICT_SCHEMAS = {
  administrativeIntakeSchema,
  selectChannelSchema,
  startApplicationSchema,
  dismissCardSchema,
  cardImpressionSchema,
};

describe('no endpoint can be handed a secret', () => {
  it.each(Object.entries(STRICT_SCHEMAS))(
    '%s rejects every forbidden key',
    (_name, schema) => {
      for (const key of FORBIDDEN_SECRET_KEYS) {
        const result = (schema as any).safeParse({ [key]: 'sk-ant-not-a-real-key' });
        expect(result.success).toBe(false);
      }
    },
  );

  it('rejects a secret even when the rest of the body is valid', () => {
    // The realistic shape of the mistake: a well-formed request that also
    // carries a key someone helpfully added to a form.
    const result = administrativeIntakeSchema.safeParse({
      legal_name: 'Ada Lovelace',
      phone: '+1 555 0100',
      anthropic_api_key: 'sk-ant-xxx',
    });
    expect(result.success).toBe(false);
  });

  it('the schemas are strict, not passthrough', () => {
    const result = administrativeIntakeSchema.safeParse({ totally_unknown_field: 'x' });
    expect(result.success).toBe(false);
  });
});

describe('the intake asks no interview questions', () => {
  // The non-negotiable "ask once" rule, enforced structurally: these fields
  // have no home on the intake schema, so a form cannot start collecting them.
  const INTERVIEW_ONLY_FIELDS = [
    'why_join', 'career_goal', 'success_definition', 'employment_status',
    'weekly_hours', 'can_attend_meetings', 'blockers', 'built_something',
    'github_comfort', 'revision_response', 'claude_code_ready', 'api_key_ready',
  ];

  it.each(INTERVIEW_ONLY_FIELDS)('rejects %s', (field) => {
    const result = administrativeIntakeSchema.safeParse({ [field]: 'anything' });
    expect(result.success).toBe(false);
  });
});

describe('administrative intake accepts what it should', () => {
  it('takes a full, valid Group A payload', () => {
    const result = administrativeIntakeSchema.safeParse({
      legal_name: 'Ada Lovelace',
      preferred_name: 'Ada',
      phone: '+44 20 7946 0958',
      time_zone: 'Europe/London',
      country: 'GB',
      linkedin_url: 'https://www.linkedin.com/in/ada',
      github_url: 'https://github.com/ada',
      work_auth_category: 'opt',
      permission_to_call: true,
      permission_ai_interviewer: true,
      consent_recording: false,
      attests_not_employed_fulltime: true,
      commitment_acknowledged: true,
      completes: true,
    });
    expect(result.success).toBe(true);
  });

  it('accepts a cleared URL field as empty string rather than failing', () => {
    // A student who deletes what they typed must not get a validation error.
    expect(administrativeIntakeSchema.safeParse({ github_url: '' }).success).toBe(true);
  });

  it('rejects a malformed URL', () => {
    expect(administrativeIntakeSchema.safeParse({ github_url: 'not a url' }).success).toBe(false);
  });

  it('defaults completes to false, so an autosave never advances the lifecycle', () => {
    const parsed = administrativeIntakeSchema.parse({ legal_name: 'Ada' });
    expect(parsed.completes).toBe(false);
  });

  it('keeps the three consents independent', () => {
    const parsed = administrativeIntakeSchema.parse({
      permission_ai_interviewer: true,
      consent_recording: false,
    });
    expect(parsed.permission_ai_interviewer).toBe(true);
    expect(parsed.consent_recording).toBe(false);
  });
});

describe('channel selection', () => {
  it('accepts only the two real channels', () => {
    expect(selectChannelSchema.safeParse({ channel: 'form' }).success).toBe(true);
    expect(selectChannelSchema.safeParse({ channel: 'phone' }).success).toBe(true);
    expect(selectChannelSchema.safeParse({ channel: 'carrier_pigeon' }).success).toBe(false);
  });
});

describe('dismissal is bounded', () => {
  it('defaults to a fortnight', () => {
    expect(dismissCardSchema.parse({}).days).toBe(14);
  });

  it('refuses an unbounded hide', () => {
    // Otherwise "not now" quietly becomes "never", which is a different
    // decision from the one the student made.
    expect(dismissCardSchema.safeParse({ days: 3650 }).success).toBe(false);
    expect(dismissCardSchema.safeParse({ days: 0 }).success).toBe(false);
    expect(dismissCardSchema.safeParse({ days: 90 }).success).toBe(true);
  });
});
