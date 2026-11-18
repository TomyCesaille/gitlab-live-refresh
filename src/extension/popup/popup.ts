import type { SitesChanged } from '../messages';

interface Permissions {
  origins: string[];
}

export interface PopupApi {
  tabs: {
    query(query: {
      active: true;
      currentWindow: true;
    }): Promise<{ id?: number; url?: string }[]>;
    reload(tabId: number): Promise<void>;
  };
  permissions: {
    contains(permissions: Permissions): Promise<boolean>;
    request(permissions: Permissions): Promise<boolean>;
    remove(permissions: Permissions): Promise<boolean>;
  };
  runtime: { sendMessage(message: SitesChanged): Promise<unknown> };
}

// Turns live refresh on or off for the site of the current tab. The button
// asks for, or gives back, that one site's host permission.
export async function startPopup(
  doc: Document,
  api: PopupApi,
  close: () => void,
): Promise<void> {
  const [tab] = await api.tabs.query({ active: true, currentWindow: true });
  const main = doc.createElement('main');
  const status = doc.createElement('p');
  main.append(status);
  doc.body.append(main);

  const url = tab?.url ? new URL(tab.url) : null;
  const tabId = tab?.id;
  if (url?.protocol !== 'https:' || tabId === undefined) {
    status.textContent =
      'Open a GitLab page, then click here to turn live refresh on for its site.';
    return;
  }

  const origins = [`${url.origin}/*`];
  const on = await api.permissions.contains({ origins });
  status.textContent = `Live refresh is ${on ? 'on' : 'off'} for ${url.host}.`;
  const button = doc.createElement('button');
  button.type = 'button';
  button.textContent = `Turn ${on ? 'off' : 'on'} for ${url.host}`;
  main.append(button);

  // The permission request opens before any await, inside the click: Firefox
  // only grants permissions from a user gesture.
  button.addEventListener('click', () => {
    const change = on
      ? api.permissions.remove({ origins })
      : api.permissions.request({ origins });
    void change.then(async (changed) => {
      if (!changed) return;
      await api.runtime.sendMessage({ type: 'sites' });
      await api.tabs.reload(tabId);
      close();
    });
  });
}
