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
  // only grants permissions from a user gesture. Firefox may close the popup
  // behind its prompt, so the background starts live refresh on a grant.
  button.addEventListener('click', () => {
    if (on) {
      void api.permissions.remove({ origins }).then(async (removed) => {
        if (!removed) return;
        await api.tabs.reload(tabId);
        close();
      });
      return;
    }
    void api.permissions.request({ origins }).then((granted) => {
      if (granted) close();
    });
  });
}
