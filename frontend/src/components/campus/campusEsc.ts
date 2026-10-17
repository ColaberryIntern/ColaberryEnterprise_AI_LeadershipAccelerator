/**
 * Should a page-level Esc mean "Step outside" (Colaberry Campus C3)?
 *
 * Only when nothing else can own that key press. Portal drawers and modals (MemberProfileDrawer,
 * SkillDetailDrawer, ArchiveProjectDialog, ui/Modal, CardDetailDrawer, OpenHouseModal) listen for Esc
 * on window/document themselves and mark themselves role="dialog" / aria-modal="true"; they are still
 * in the DOM while their own handler runs. So one Esc must never close a drawer AND open the map.
 */
const MODAL_SELECTOR = '[aria-modal="true"], [role="dialog"], .modal.show';

export function isTypingTarget(el: Element | null): boolean {
  if (!el) return false;
  const tag = el.tagName;
  if (tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT') return true;
  return (el as HTMLElement).isContentEditable === true || el.getAttribute('contenteditable') === 'true';
}

export function shouldStepOutside(e: Pick<KeyboardEvent, 'key' | 'defaultPrevented' | 'altKey' | 'ctrlKey' | 'metaKey' | 'shiftKey'>, layerOpen: boolean, doc: Document = document): boolean {
  if (e.key !== 'Escape') return false;
  if (e.defaultPrevented || e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return false;
  if (layerOpen) return false;
  if (isTypingTarget(doc.activeElement)) return false;
  if (doc.fullscreenElement) return false;
  if (doc.querySelector(MODAL_SELECTOR)) return false;
  return true;
}
