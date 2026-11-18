import { browser } from 'wxt/browser';
import { defineBackground } from 'wxt/utils/define-background';
import { startBackground } from '../extension/background/start';

export default defineBackground(() => {
  startBackground(browser);
});
