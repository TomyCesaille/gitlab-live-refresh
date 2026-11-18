export type Blocker = 'typing' | 'unsent' | 'selection' | 'overlay' | 'active';

export const BLOCKER_TEXT: Record<Blocker, string> = {
  typing: 'you are typing',
  unsent: 'unsent text on the page',
  selection: 'text is selected',
  overlay: 'a dialog or menu is open',
  active: 'you are active',
};

const TEXT_INPUT_TYPES = new Set([
  'text',
  'search',
  'email',
  'url',
  'tel',
  'password',
  'number',
  'date',
  'datetime-local',
  'month',
  'time',
  'week',
]);

const EDITABLE = '[contenteditable="true"], [contenteditable=""]';

const OVERLAYS = [
  '.modal.show',
  '[role="dialog"]',
  '[role="menu"]',
  '[role="listbox"]',
  '.gl-new-dropdown-panel',
  '.gl-drawer',
  '.popover',
].join(', ');

export function isVisible(element: Element): boolean {
  if (
    !element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true })
  )
    return false;
  const rect = element.getBoundingClientRect();
  return rect.width > 0 && rect.height > 0;
}

export function isTextEntry(element: Element | null): boolean {
  if (!element) return false;
  if (element.tagName === 'TEXTAREA' || element.matches(EDITABLE)) return true;
  return (
    element instanceof HTMLInputElement && TEXT_INPUT_TYPES.has(element.type)
  );
}

export function hasUnsentText(doc: Document): boolean {
  return [...doc.querySelectorAll(`textarea, ${EDITABLE}`)].some((element) => {
    const text =
      element instanceof HTMLTextAreaElement
        ? element.value
        : element.textContent;
    return text.trim() !== '' && isVisible(element);
  });
}

// Typing or unsent text: a reload would cost you work. The extension reports
// this to its background, which decides for tabs you are not looking at.
export const isBusy = (doc: Document) =>
  isTextEntry(doc.activeElement) || hasUnsentText(doc);

export interface BlockerContext {
  lastInputAt: number;
  now: number;
  idleMs: number;
  arriving: boolean;
}

export function reloadBlocker(
  doc: Document,
  context: BlockerContext,
): Blocker | null {
  if (isTextEntry(doc.activeElement)) return 'typing';
  if (hasUnsentText(doc)) return 'unsent';
  if (doc.getSelection()?.toString().trim()) return 'selection';
  if ([...doc.querySelectorAll(OVERLAYS)].some(isVisible)) return 'overlay';
  if (!context.arriving && context.now - context.lastInputAt < context.idleMs)
    return 'active';
  return null;
}

const INPUT_EVENTS = [
  'pointermove',
  'pointerdown',
  'keydown',
  'wheel',
  'scroll',
  'touchstart',
  'input',
] as const;

export function trackActivity(target: Window): () => number {
  let lastInputAt = Date.now();
  for (const type of INPUT_EVENTS) {
    target.addEventListener(
      type,
      () => {
        lastInputAt = Date.now();
      },
      { passive: true, capture: true },
    );
  }
  return () => lastInputAt;
}
