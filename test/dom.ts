import { vi } from 'vitest';

// jsdom lays nothing out: give an element a size so it counts as on screen.
export function onScreen<T extends Element>(element: T): T {
  vi.spyOn(element as Element, 'getBoundingClientRect').mockReturnValue({
    width: 100,
    height: 20,
  } as DOMRect);
  return element;
}

export function render(html: string): void {
  document.body.innerHTML = html;
}

export function scrollable(
  element: Element,
  {
    scrollHeight,
    clientHeight,
  }: { scrollHeight: number; clientHeight: number },
): void {
  Object.defineProperty(element, 'scrollHeight', {
    value: scrollHeight,
    configurable: true,
  });
  Object.defineProperty(element, 'clientHeight', {
    value: clientHeight,
    configurable: true,
  });
}
