/**
 * portalFlagsService — covers the CAPE Phase 5 `cape_today_plan` flag added
 * to `getPortalFlags()` (design doc §16 Phase 5). `today_redesign` behavior
 * is pre-existing and untouched by this task; only the new field is tested
 * here.
 *
 * `env.capeTodayPlanEnabled` (backend/src/config/env.ts) parses
 * `process.env.CAPE_TODAY_PLAN_ENABLED === 'true'` once at module load, so
 * exercising both the "unset" and "set to true" cases requires
 * `jest.resetModules()` + a fresh dynamic `import()` per case, matching this
 * repo's existing convention (see advisorBrainService.test.ts).
 */
describe('portalFlagsService — cape_today_plan flag', () => {
  const ORIGINAL_ENV = process.env.CAPE_TODAY_PLAN_ENABLED;

  afterEach(() => {
    if (ORIGINAL_ENV === undefined) delete process.env.CAPE_TODAY_PLAN_ENABLED;
    else process.env.CAPE_TODAY_PLAN_ENABLED = ORIGINAL_ENV;
    jest.resetModules();
  });

  it('defaults to false when CAPE_TODAY_PLAN_ENABLED is unset', async () => {
    jest.resetModules();
    delete process.env.CAPE_TODAY_PLAN_ENABLED;
    const { getPortalFlags } = await import('../portalFlagsService');
    expect(getPortalFlags().cape_today_plan).toBe(false);
  });

  it('defaults to false for any non-"true" value (e.g. "1", "yes")', async () => {
    jest.resetModules();
    process.env.CAPE_TODAY_PLAN_ENABLED = '1';
    const { getPortalFlags: getFlags1 } = await import('../portalFlagsService');
    expect(getFlags1().cape_today_plan).toBe(false);

    jest.resetModules();
    process.env.CAPE_TODAY_PLAN_ENABLED = 'yes';
    const { getPortalFlags: getFlags2 } = await import('../portalFlagsService');
    expect(getFlags2().cape_today_plan).toBe(false);
  });

  it('is true when CAPE_TODAY_PLAN_ENABLED="true"', async () => {
    jest.resetModules();
    process.env.CAPE_TODAY_PLAN_ENABLED = 'true';
    const { getPortalFlags } = await import('../portalFlagsService');
    expect(getPortalFlags().cape_today_plan).toBe(true);
  });

  it('does not change today_redesign default behavior (regression guard)', async () => {
    jest.resetModules();
    delete process.env.CAPE_TODAY_PLAN_ENABLED;
    delete process.env.PORTAL_TODAY_REDESIGN_ENABLED;
    delete process.env.INTERNSHIP_ENABLED;
    delete process.env.PRESENTATION_STUDIO_ENABLED;
    const { getPortalFlags } = await import('../portalFlagsService');
    // Whole-object equality on purpose: this guard exists so that ADDING a flag
    // is a deliberate, visible act rather than something that slips in with a
    // default nobody chose. Every new flag must be added here with the default
    // its author intended.
    expect(getPortalFlags()).toEqual({
      today_redesign: true,
      cape_today_plan: false,
      internship: false,
      // Presentation Studio ships dark. Added deliberately, per the note above.
      presentation_studio: false,
    });
  });

  it('ships the Presentation Studio dark, and only the exact string "true" turns it on', async () => {
    // Default OFF is load-bearing here: flag-off must leave a student opening a
    // demo-prep card with exactly today's DemoEvidencePanel. The Studio's tables are
    // created at boot regardless, but empty unread tables change no behaviour — the
    // flag is the only thing that changes what a student sees.
    jest.resetModules();
    delete process.env.PRESENTATION_STUDIO_ENABLED;
    const off = await import('../portalFlagsService');
    expect(off.getPortalFlags().presentation_studio).toBe(false);

    jest.resetModules();
    process.env.PRESENTATION_STUDIO_ENABLED = 'true';
    const on = await import('../portalFlagsService');
    expect(on.getPortalFlags().presentation_studio).toBe(true);

    // A truthy-looking value must NOT enable it. Anything other than 'true' is off,
    // so a typo in a deploy env fails closed rather than exposing an unfinished surface.
    for (const loose of ['1', 'yes', 'TRUE', 'True', '']) {
      jest.resetModules();
      process.env.PRESENTATION_STUDIO_ENABLED = loose;
      const mod = await import('../portalFlagsService');
      expect(mod.getPortalFlags().presentation_studio).toBe(false);
    }
    delete process.env.PRESENTATION_STUDIO_ENABLED;
  });

  it('ships the internship funnel dark, and only env turns it on', async () => {
    // Default OFF is load-bearing: the application flow must not accept
    // applications before Dhee's review queue exists to receive them.
    jest.resetModules();
    delete process.env.INTERNSHIP_ENABLED;
    const off = await import('../portalFlagsService');
    expect(off.getPortalFlags().internship).toBe(false);
    expect(off.isInternshipEnabled()).toBe(false);

    jest.resetModules();
    process.env.INTERNSHIP_ENABLED = 'true';
    const on = await import('../portalFlagsService');
    expect(on.getPortalFlags().internship).toBe(true);

    // Only the exact string 'true' enables it — 'TRUE'/'1'/'yes' must not.
    jest.resetModules();
    process.env.INTERNSHIP_ENABLED = '1';
    const loose = await import('../portalFlagsService');
    expect(loose.getPortalFlags().internship).toBe(false);
    delete process.env.INTERNSHIP_ENABLED;
  });
});
