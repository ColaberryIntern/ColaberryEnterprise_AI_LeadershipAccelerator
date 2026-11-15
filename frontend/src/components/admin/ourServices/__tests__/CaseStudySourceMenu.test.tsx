import React from 'react';
import { createRoot, Root } from 'react-dom/client';
import { act } from 'react-dom/test-utils';
import CaseStudySourceMenu from '../CaseStudySourceMenu';
import { openOriginalInNewTab } from '../CaseStudyOpenButtons';
import { getCaseStudySourceFile, type EvidenceCaseStudy } from '../../../../services/ourServicesApi';

jest.mock('../../../../services/ourServicesApi', () => ({ getCaseStudySourceFile: jest.fn() }));
const getFile = getCaseStudySourceFile as jest.MockedFunction<typeof getCaseStudySourceFile>;

(globalThis as unknown as { IS_REACT_ACT_ENVIRONMENT: boolean }).IS_REACT_ACT_ENVIRONMENT = true;
let container: HTMLDivElement;
let root: Root;
async function render(ui: React.ReactElement): Promise<void> {
  container = document.createElement('div');
  document.body.appendChild(container);
  root = createRoot(container);
  await act(async () => { root.render(ui); });
}
afterEach(() => { act(() => { root.unmount(); }); container.remove(); jest.clearAllMocks(); });

const cs = (id: string, sourceKind: 'inside' | 'outside', title = `Study ${id}`): EvidenceCaseStudy => ({
  id, title, slug: null, sourceKind, industry: 'Energy', year: 2026, status: 'draft', headlineMetric: null,
});
const LIST = [cs('in-1', 'inside'), cs('out-1', 'outside'), cs('out-2', 'outside')];
const q = (sel: string): HTMLElement | null => container.querySelector(sel);
const click = async (el: Element | null): Promise<void> => { await act(async () => { (el as HTMLElement).click(); }); };

describe('CaseStudySourceMenu', () => {
  it('lists only the clicked kind; an outside item gets Open original and NO Manage', async () => {
    await render(<CaseStudySourceMenu kind="outside" serviceName="Svc" caseStudies={LIST} />);
    const chip = q('[data-testid="cs-menu-outside"]')!;
    expect(chip.textContent).toContain('2');
    expect(chip.getAttribute('aria-expanded')).toBe('false');
    await click(chip);
    expect(chip.getAttribute('aria-expanded')).toBe('true');
    expect(q('[data-testid="cs-menu-item-out-1"]')).not.toBeNull();
    expect(q('[data-testid="cs-menu-item-out-2"]')).not.toBeNull();
    expect(q('[data-testid="cs-menu-item-in-1"]')).toBeNull();
    expect(q('[data-testid="open-original-out-1"]')).not.toBeNull();
    expect(q('[data-testid="manage-case-study-out-1"]')).toBeNull();
    expect(q('[data-testid="manage-case-study-out-2"]')).toBeNull();
  });

  it('an inside item gets Manage (desk, new tab) and NO Open original (built here, no uploaded file)', async () => {
    await render(<CaseStudySourceMenu kind="inside" serviceName="Svc" caseStudies={LIST} />);
    await click(q('[data-testid="cs-menu-inside"]'));
    expect(q('[data-testid="manage-case-study-in-1"]')!.getAttribute('href')).toBe('/admin/case-studies/in-1');
    expect(q('[data-testid="manage-case-study-in-1"]')!.getAttribute('target')).toBe('_blank');
    expect(q('[data-testid="open-original-in-1"]')).toBeNull();
  });

  it('a zero count is a disabled chip that opens nothing (boundary)', async () => {
    await render(<CaseStudySourceMenu kind="inside" serviceName="Svc" caseStudies={[cs('out-1', 'outside')]} />);
    const chip = q('[data-testid="cs-menu-inside"]') as HTMLButtonElement;
    expect(chip.disabled).toBe(true);
    expect(chip.textContent).toContain('0');
    await click(chip);
    expect(q('[role="dialog"]')).toBeNull();
  });

  it('Escape closes the list and returns focus to the chip; clicking the chip again also closes it', async () => {
    await render(<CaseStudySourceMenu kind="outside" serviceName="Svc" caseStudies={LIST} />);
    const chip = q('[data-testid="cs-menu-outside"]')!;
    await click(chip);
    await act(async () => { document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape' })); });
    expect(q('[role="dialog"]')).toBeNull();
    expect(document.activeElement).toBe(chip);
    await click(chip);
    await click(chip);
    expect(q('[role="dialog"]')).toBeNull();
  });
});

describe('openOriginalInNewTab', () => {
  const fakeWin = (): Window => ({ location: { href: '' }, close: jest.fn() }) as unknown as Window;
  beforeAll(() => { (URL as unknown as { createObjectURL: () => string }).createObjectURL = () => 'blob:fake'; (URL as unknown as { revokeObjectURL: () => void }).revokeObjectURL = jest.fn(); });

  it('points the tab opened on the click at the fetched original', async () => {
    getFile.mockResolvedValue(new Blob(['%PDF'], { type: 'application/pdf' }));
    const win = fakeWin();
    await expect(openOriginalInNewTab('out-1', win)).resolves.toBe('opened');
    expect(getFile).toHaveBeenCalledWith('out-1');
    expect(win.location.href).toBe('blob:fake');
    expect(win.close).not.toHaveBeenCalled();
  });

  it('no stored original (404 -> null): closes the empty tab and reports none', async () => {
    getFile.mockResolvedValue(null);
    const win = fakeWin();
    await expect(openOriginalInNewTab('out-1', win)).resolves.toBe('none');
    expect(win.close).toHaveBeenCalled();
  });

  it('a failed fetch closes the empty tab and reports error, without throwing', async () => {
    getFile.mockRejectedValue(new Error('network down'));
    const win = fakeWin();
    await expect(openOriginalInNewTab('out-1', win)).resolves.toBe('error');
    expect(win.close).toHaveBeenCalled();
  });

  it('the button shows a message when there is no original, and can be clicked again (idempotent)', async () => {
    getFile.mockResolvedValue(null);
    const openSpy = jest.spyOn(window, 'open').mockReturnValue(fakeWin());
    await render(<CaseStudySourceMenu kind="outside" serviceName="Svc" caseStudies={LIST} />);
    await click(q('[data-testid="cs-menu-outside"]'));
    await click(q('[data-testid="open-original-out-1"]'));
    expect(container.textContent).toContain('No original file is stored for this case study.');
    await click(q('[data-testid="open-original-out-1"]'));
    expect(getFile).toHaveBeenCalledTimes(2);
    expect(openSpy).toHaveBeenCalledTimes(2);
    openSpy.mockRestore();
  });
});
