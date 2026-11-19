export type BannerMode = 'updates' | 'error' | 'errorOffline' | 'errorStuck';

export interface BannerDetails {
  changes?: string;
  why?: string;
}

export interface Banner {
  readonly mode: BannerMode | null;
  show(mode: BannerMode, details?: BannerDetails): void;
  hide(): void;
}

export interface BannerHandlers {
  onReload(): void;
  onDismiss(mode: BannerMode | null): void;
}

// Error modes differ from the update mode by hue, luminance, glyph and wording,
// so they read apart in grayscale and for colour-blind eyes.
const THEMES = {
  update: {
    bg: '#1f75cb',
    fg: '#fff',
    btnBg: '#fff',
    btnFg: '#1f75cb',
    icon: '🔄',
  },
  error: {
    bg: '#e69f00',
    fg: '#000',
    btnBg: '#000',
    btnFg: '#fff',
    icon: '⚠️',
  },
};

function content(mode: BannerMode, details: BannerDetails, limit: number) {
  switch (mode) {
    case 'updates':
      return {
        theme: THEMES.update,
        title: `GitLab changed: ${details.changes ?? ''}`,
        detail: `Reload waits: ${details.why ?? ''}.`,
      };
    case 'error':
      return {
        theme: THEMES.error,
        title: 'GitLab error on this page',
        detail: `Reload waits: ${details.why ?? ''}.`,
      };
    case 'errorOffline':
      return {
        theme: THEMES.error,
        title: 'GitLab error on this page',
        detail: 'GitLab is not answering. Reloads once it is back.',
      };
    case 'errorStuck':
      return {
        theme: THEMES.error,
        title: 'GitLab keeps failing',
        detail: `Auto-reload stopped after ${String(limit)} tries. Reload the page to re-arm it.`,
      };
  }
}

// Two lines fit inside GitLab's 48px top bar, over its right-hand counters and
// avatar, so the banner never hides the page's own buttons.
const STYLE = `
  .bar {
    position: fixed; top: 4px; right: 8px; z-index: 2147483647;
    box-sizing: border-box; max-width: 480px;
    display: flex; align-items: center; gap: 8px;
    padding: 4px 6px 4px 12px; border-radius: 8px; box-shadow: 0 4px 14px rgba(0, 0, 0, 0.25);
    background: var(--bg); color: var(--fg);
    font: 13px/1.3 -apple-system, BlinkMacSystemFont, "Segoe UI", system-ui, sans-serif;
  }
  .bar[hidden] { display: none; }
  .icon { font-size: 16px; }
  .text { flex: 1; min-width: 0; }
  .title { font-weight: 600; }
  .detail { opacity: 0.85; font-size: 12px; }
  button { font: inherit; cursor: pointer; border: 0; }
  .now { padding: 4px 10px; border-radius: 6px; font-weight: 600; background: var(--btn-bg); color: var(--btn-fg); }
  .dismiss { background: transparent; color: inherit; font-size: 18px; line-height: 1; padding: 0 4px; }
`;

interface Parts {
  bar: HTMLElement;
  icon: HTMLElement;
  title: HTMLElement;
  detail: HTMLElement;
}

// Isolated from GitLab's CSS in a shadow root, mounted on first use.
export function createBanner(
  doc: Document,
  handlers: BannerHandlers,
  errorReloadLimit: number,
): Banner {
  let mode: BannerMode | null = null;
  let parts: Parts | null = null;

  const element = (tag: string, className: string, text = '') => {
    const node = doc.createElement(tag);
    node.className = className;
    node.textContent = text;
    return node;
  };

  function mount(): Parts {
    const host = doc.createElement('div');
    host.id = 'gl-live-refresh';
    const shadow = host.attachShadow({ mode: 'open' });
    const style = doc.createElement('style');
    style.textContent = STYLE;

    const bar = element('div', 'bar');
    bar.setAttribute('role', 'status');
    bar.hidden = true;
    const icon = element('span', 'icon');
    icon.setAttribute('aria-hidden', 'true');
    const text = element('div', 'text');
    const title = element('div', 'title');
    const detail = element('div', 'detail');
    text.append(title, detail);
    const reload = element('button', 'now', 'Reload');
    const dismiss = element('button', 'dismiss', '×');
    dismiss.title = 'Dismiss';
    dismiss.setAttribute('aria-label', 'Dismiss');
    bar.append(icon, text, reload, dismiss);

    reload.addEventListener('click', () => {
      handlers.onReload();
    });
    dismiss.addEventListener('click', () => {
      handlers.onDismiss(mode);
      banner.hide();
    });
    shadow.append(style, bar);
    doc.body.append(host);
    return { bar, icon, title, detail };
  }

  const banner: Banner = {
    get mode() {
      return mode;
    },
    show(next, details = {}) {
      parts ??= mount();
      const { theme, title, detail } = content(next, details, errorReloadLimit);
      parts.bar.style.setProperty('--bg', theme.bg);
      parts.bar.style.setProperty('--fg', theme.fg);
      parts.bar.style.setProperty('--btn-bg', theme.btnBg);
      parts.bar.style.setProperty('--btn-fg', theme.btnFg);
      parts.icon.textContent = theme.icon;
      parts.title.textContent = title;
      parts.detail.textContent = detail;
      parts.bar.hidden = false;
      mode = next;
    },
    hide() {
      if (parts) parts.bar.hidden = true;
      mode = null;
    },
  };
  return banner;
}
