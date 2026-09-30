/**
 * The room logo field, and what it refuses.
 *
 * `icon_url` is rendered straight into an `<img src>` on two portal surfaces, so
 * it is an injection point wearing a harmless name. It is validated as a
 * REFERENCE rather than accepted as a string, and these tests pin the boundary:
 * an https URL or a site-relative path, and nothing else.
 *
 * The two that matter are `javascript:` and `data:`. A data URI is not obviously
 * dangerous inside an img, but it lets somebody park an arbitrary payload in a
 * column sized for a link, and it is the wrong thing to discover later.
 */
import { UpdateRoomSchema } from '../../../schemas/communityRoomsSchemas';

const parse = (icon_url: unknown) => UpdateRoomSchema.safeParse({ icon_url });

describe('what a room logo may be', () => {
  it('accepts an https URL', () => {
    const r = parse('https://cdn.colaberry.ai/rooms/clinic.png');
    expect(r.success).toBe(true);
  });

  it('accepts a site-relative path, which is how our own assets are referenced', () => {
    const r = parse('/thumbnails/curriculum-types/prompt_lab.jpg');
    expect(r.success).toBe(true);
  });

  it('accepts null, because most rooms will never have a logo', () => {
    expect(parse(null).success).toBe(true);
  });

  it('turns an empty string into null rather than storing blank', () => {
    const r = parse('');
    expect(r.success).toBe(true);
    if (r.success) expect(r.data.icon_url).toBeNull();
  });

  it('is optional — a patch that does not mention it leaves it alone', () => {
    expect(UpdateRoomSchema.safeParse({ name: 'Clinic' }).success).toBe(true);
  });
});

describe('what it refuses', () => {
  it('REFUSES javascript:', () => {
    expect(parse('javascript:alert(1)').success).toBe(false);
  });

  it('REFUSES a data URI — a link column is not a place to park a payload', () => {
    expect(parse('data:image/svg+xml;base64,PHN2Zz48L3N2Zz4=').success).toBe(false);
  });

  it('refuses plain http, which would break the page mixed-content rules', () => {
    expect(parse('http://example.com/logo.png').success).toBe(false);
  });

  it('refuses a protocol-relative URL, which inherits whatever scheme it lands on', () => {
    expect(parse('//evil.example.com/logo.png').success).toBe(false);
  });

  it('refuses a bare word that is neither a URL nor a path', () => {
    expect(parse('logo.png').success).toBe(false);
  });

  it('refuses something longer than the column', () => {
    expect(parse(`https://x.example.com/${'a'.repeat(700)}.png`).success).toBe(false);
  });
});
