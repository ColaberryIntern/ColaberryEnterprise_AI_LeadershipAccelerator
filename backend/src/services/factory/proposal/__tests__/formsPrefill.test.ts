import { buildFormPrefill, buildPilotExhibit } from '../formsPrefill';

describe('buildFormPrefill', () => {
  const input = {
    formKey: 'ciq',
    formLabel: 'Conflict of Interest Questionnaire',
    fields: [
      { key: 'vendor_name', label: 'Vendor name', kind: 'text' as const },
      { key: 'date', label: 'Date', kind: 'date' as const },
      { key: 'authorized_signature', label: 'Authorized signature', kind: 'signature' as const },
    ],
    known: { vendor_name: 'Colaberry Inc.' },
  };

  it('prefills from known values, flags missing fields as fact needs, and a signature field as a signature need', () => {
    const { rows, needs } = buildFormPrefill(input);
    expect(rows.find((r) => r.fieldKey === 'vendor_name')).toMatchObject({ status: 'prefilled', value: 'Colaberry Inc.' });
    expect(rows.find((r) => r.fieldKey === 'date')).toMatchObject({ status: 'needed', value: '' });
    expect(rows.find((r) => r.fieldKey === 'authorized_signature')).toMatchObject({ status: 'signature' });

    const dateNeed = needs.find((n) => n.key === 'fact:ciq_date')!;
    expect(dateNeed.kind).toBe('fact');
    expect(dateNeed.blocking).toBe('fatal');
    expect(dateNeed.ask).toMatch(/Provide Date for Conflict of Interest Questionnaire/);
    expect(dateNeed.usedIn).toEqual([{ docKey: 'ciq' }]);

    const sigNeed = needs.find((n) => n.kind === 'signature')!;
    expect(sigNeed.key).toBe('signature:ciq');
    expect(sigNeed.ask).toMatch(/Sign Conflict of Interest Questionnaire/);

    // a prefilled field raises no need
    expect(needs.some((n) => n.key === 'fact:ciq_vendor_name')).toBe(false);
  });

  it('honors required:false as a score-level (non-fatal) need', () => {
    const { needs } = buildFormPrefill({ formKey: 'f', formLabel: 'F', fields: [{ key: 'opt', label: 'Optional', required: false }] });
    expect(needs[0].blocking).toBe('score');
  });

  it('is total on empty / junk input', () => {
    expect(buildFormPrefill({ formKey: 'f', formLabel: 'F', fields: [] })).toEqual({ rows: [], needs: [] });
    expect(buildFormPrefill({ formKey: 'f', formLabel: 'F', fields: [{ key: '  ', label: 'x' }] as any })).toEqual({ rows: [], needs: [] });
  });
});

describe('buildPilotExhibit', () => {
  it('shows only verified artifacts and links the demo URL', () => {
    const { html, needs } = buildPilotExhibit(
      [
        { caption: 'Search screen', verified: true, requirementIds: ['R-1'], dataArtifactId: 'abc-123' },
        { caption: 'Unverified draft', verified: false },
      ],
      'https://demo.example.gov',
    );
    expect(html).toContain('Live demonstration: https://demo.example.gov');
    expect(html).toMatch(/<figure data-artifact="abc-123"><figcaption>Search screen \(proves R-1\)<\/figcaption><\/figure>/);
    expect(html).not.toContain('Unverified draft');
    expect(needs).toEqual([]); // demo URL present ⇒ no need
  });

  it('raises a setting need for a missing demo URL and placeholders an empty exhibit', () => {
    const { html, needs } = buildPilotExhibit([], null);
    expect(needs).toHaveLength(1);
    expect(needs[0]).toMatchObject({ kind: 'setting', key: 'setting:demo_url', format: expect.stringMatching(/URL/) });
    expect(html).toMatch(/\[PLACEHOLDER: capture and verify at least one build screenshot/);
  });

  it('escapes caption/url text so it cannot inject markup', () => {
    const { html } = buildPilotExhibit([{ caption: '<script>x</script>', verified: true }], null);
    expect(html).not.toContain('<script>');
    expect(html).toContain('&lt;script&gt;');
  });
});
