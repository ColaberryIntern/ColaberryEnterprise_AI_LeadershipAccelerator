import { removeMermaidLeftovers } from '../MermaidDiagram';

// Mermaid 11 appends `<div id="d<id>-svg"><svg id="<id>-svg">` to <body> while it renders, and leaves it
// there when the chart has a syntax error. On 2026-11-18 that printed "Syntax error in text / mermaid
// version 11.17.2" under a case study preview.
describe('removeMermaidLeftovers', () => {
  afterEach(() => { document.body.innerHTML = ''; });

  it('removes the error graphic a failed render left on <body>', () => {
    document.body.innerHTML = '<div id="root"></div><div id="dmermaid--r1--svg"><svg id="mermaid--r1--svg"><text>Syntax error in text</text></svg></div>';
    removeMermaidLeftovers('mermaid--r1-');
    expect(document.getElementById('dmermaid--r1--svg')).toBeNull();
    expect(document.body.textContent).not.toContain('Syntax error');
    expect(document.getElementById('root')).not.toBeNull();
  });

  it('removes a bare leftover svg on <body>', () => {
    document.body.innerHTML = '<svg id="x-svg"></svg>';
    removeMermaidLeftovers('x');
    expect(document.getElementById('x-svg')).toBeNull();
  });

  it('never touches a rendered diagram inside the page', () => {
    document.body.innerHTML = '<figure><div class="cb-mermaid__canvas"><svg id="x-svg"></svg></div></figure>';
    removeMermaidLeftovers('x');
    expect(document.getElementById('x-svg')).not.toBeNull();
  });
});
