// jsdom has no checkVisibility; browsers since 2022 do. Tests set it per element.
if (
  typeof Element !== 'undefined' &&
  !('checkVisibility' in Element.prototype)
) {
  Object.defineProperty(Element.prototype, 'checkVisibility', {
    value: () => true,
    configurable: true,
    writable: true,
  });
}
