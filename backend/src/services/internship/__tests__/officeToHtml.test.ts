import { luminance, officeAstToHtml, type OfficeAst, type OfficeNode } from '../officeToHtml';

const t = (text: string, formatting: OfficeNode['formatting'] = {}): OfficeNode => ({ type: 'text', text, formatting });
const doc = (content: OfficeNode[], attachments: OfficeAst['attachments'] = []): string => officeAstToHtml({ type: 'docx', content, attachments }, 'Doc');

describe('officeToHtml: the Word / PowerPoint viewer (Ali, 10 Nov 2026)', () => {
  it('renders headings, formatted runs and paragraphs like the real intern .docx', () => {
    const html = doc([
      { type: 'paragraph', children: [t('Progress and Log Notification Framework', { bold: true, size: '22pt', color: '#1E293B' })] },
      { type: 'heading', metadata: { level: 1 }, children: [t('1. Purpose of This Document', { size: '16pt', color: '#2E74B5' })] },
      { type: 'paragraph', children: [t('Plain '), t('italic', { italic: true })] },
    ]);
    expect(html).toContain('<h1><span style="color:#2E74B5;font-size:16pt">1. Purpose of This Document</span></h1>');
    expect(html).toContain('font-weight:700');
    expect(html).toContain('<span style="font-style:italic">italic</span>');
  });

  it('escapes every value: nothing in the document becomes markup', () => {
    const html = doc([{ type: 'paragraph', children: [t('<script>alert(1)</script><img src=x onerror=alert(1)>')] }]);
    expect(html).not.toContain('<script>alert');
    expect(html).not.toContain('<img src=x');
    expect(html).toContain('&lt;script&gt;');
  });

  it('uses a color or size only when it is well-formed (no CSS injection)', () => {
    const html = doc([{ type: 'paragraph', children: [t('x', { color: 'red;background:url(http://evil)', size: '12pt;position:fixed' })] }]);
    expect(html).not.toContain('evil');
    expect(html).not.toContain('position:fixed');
  });

  it('near-white text with no background gets navy behind it, so white table headers stay readable', () => {
    expect(luminance('#FFFFFF')).toBeCloseTo(1);
    const html = doc([{ type: 'paragraph', children: [t('Progress Notification', { bold: true, color: '#FFFFFF' })] }]);
    expect(html).toContain('color:#FFFFFF;background:#1a365d');
  });

  it('tables keep rows, cells and spans', () => {
    const cell = (s: string, extra: OfficeNode['metadata'] = {}): OfficeNode => ({ type: 'cell', metadata: extra, children: [{ type: 'paragraph', children: [t(s)] }] });
    const html = doc([{ type: 'table', children: [{ type: 'row', children: [cell('A'), cell('B', { colSpan: 2 })] }, { type: 'row', children: [cell('1'), cell('2'), cell('3')] }] }]);
    expect(html).toMatch(/<table><tr><td><p>A<\/p><\/td><td colspan="2"><p>B<\/p><\/td><\/tr><tr>/);
  });

  it('consecutive list items of one list become one list', () => {
    const li = (s: string, listId: string, listType: 'ordered' | 'unordered' = 'unordered'): OfficeNode => ({ type: 'list', metadata: { listId, listType }, children: [t(s)] });
    const html = doc([li('a', 'L1'), li('b', 'L1'), li('c', 'L2', 'ordered')]);
    expect(html.match(/<ul>/g)).toHaveLength(1);
    expect(html.match(/<ol>/g)).toHaveLength(1);
    expect(html.match(/<li /g)).toHaveLength(3);
  });

  it('embeds only safe raster images; SVG or malformed data becomes a placeholder', () => {
    const img = (name: string): OfficeNode => ({ type: 'image', metadata: { attachmentName: name, altText: 'diagram' } });
    const html = doc([img('ok'), img('svg'), img('bad')], [
      { name: 'ok', mimeType: 'image/png', data: 'iVBORw0KGgo=' },
      { name: 'svg', mimeType: 'image/svg+xml', data: 'PHN2Zz4=' },
      { name: 'bad', mimeType: 'image/png', data: '"><script>' },
    ]);
    expect(html).toContain('src="data:image/png;base64,iVBORw0KGgo="');
    expect(html).not.toContain('image/svg');
    expect(html).not.toContain('<script>');
    expect(html.match(/\[image: diagram\]/g)).toHaveLength(2);
  });

  it('PowerPoint slides render as numbered sections with their notes', () => {
    const html = officeAstToHtml({ type: 'pptx', content: [{ type: 'slide', metadata: { slideNumber: 2 }, children: [{ type: 'paragraph', children: [t('Agenda')] }, { type: 'note', children: [t('say hi')] }] }] }, 'Deck');
    expect(html).toContain('<section class="slide"><div class="slide-n">Slide 2</div><p>Agenda</p><aside class="note">say hi</aside></section>');
  });

  it('an empty document says so instead of rendering a blank page', () => {
    expect(doc([])).toContain('This document has no readable content.');
  });
});
