import { browser } from 'wxt/browser';
import { startPopup } from '../../extension/popup/popup';

void startPopup(document, browser, () => {
  window.close();
});
