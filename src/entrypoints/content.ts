import { browser } from 'wxt/browser';
import { defineContentScript } from 'wxt/utils/define-content-script';
import { startContentScript } from '../extension/content/content';

// Registered at runtime, for the sites you turn live refresh on for.
export default defineContentScript({
  registration: 'runtime',
  main() {
    void startContentScript(window, (message) =>
      browser.runtime.sendMessage(message),
    );
  },
});
