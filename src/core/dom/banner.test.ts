import { afterEach, describe, expect, it, vi } from 'vitest';
import { createBanner } from './banner';

afterEach(() => {
  document.body.innerHTML = '';
});

function setup() {
  const handlers = { onReload: vi.fn(), onDismiss: vi.fn() };
  const banner = createBanner(document, handlers, 3);
  const shadow = () => document.getElementById('gl-live-refresh')!.shadowRoot!;
  const text = (selector: string) =>
    shadow().querySelector(selector)!.textContent;
  const bar = () => shadow().querySelector<HTMLElement>('.bar')!;
  const click = (selector: string) => {
    shadow().querySelector<HTMLElement>(selector)!.click();
  };
  return { banner, handlers, text, bar, click };
}

describe('createBanner', () => {
  it('stays out of the page until it has something to say', () => {
    const { banner } = setup();

    banner.hide();
    expect(document.getElementById('gl-live-refresh')).toBeNull();
    expect(banner.mode).toBeNull();
  });

  it('says what changed and what the reload waits for', () => {
    const { banner, text, bar } = setup();

    banner.show('updates', { changes: 'pipeline', why: 'you are typing' });

    expect(banner.mode).toBe('updates');
    expect(text('.title')).toBe('GitLab changed: pipeline');
    expect(text('.detail')).toBe('Reload waits: you are typing.');
    expect(text('.icon')).toBe('🔄');
    expect(bar().hidden).toBe(false);
    expect(bar().style.getPropertyValue('--bg')).toBe('#1f75cb');
  });

  it('tells errors apart by hue, glyph and wording', () => {
    const { banner, text, bar } = setup();

    banner.show('error', { why: 'text is selected' });
    expect(text('.title')).toBe('GitLab error on this page');
    expect(text('.detail')).toBe('Reload waits: text is selected.');
    expect(text('.icon')).toBe('⚠️');
    expect(bar().style.getPropertyValue('--bg')).toBe('#e69f00');

    banner.show('errorOffline');
    expect(text('.detail')).toBe(
      'GitLab is not answering. Reloads once it is back.',
    );

    banner.show('errorStuck');
    expect(text('.title')).toBe('GitLab keeps failing');
    expect(text('.detail')).toBe(
      'Auto-reload stopped after 3 tries. Reload the page to re-arm it.',
    );
  });

  it('shows blanks rather than undefined when details are missing', () => {
    const { banner, text } = setup();

    banner.show('updates');
    expect(text('.title')).toBe('GitLab changed: ');
    banner.show('error');
    expect(text('.detail')).toBe('Reload waits: .');
  });

  it('reloads on the Reload button', () => {
    const { banner, handlers, click } = setup();

    banner.show('updates', { changes: 'comments', why: 'you are active' });
    click('.now');
    expect(handlers.onReload).toHaveBeenCalledOnce();
  });

  it('hides, and reports the mode it dismissed, on ×', () => {
    const { banner, handlers, click, bar } = setup();

    banner.show('error', { why: 'you are typing' });
    click('.dismiss');

    expect(handlers.onDismiss).toHaveBeenCalledWith('error');
    expect(bar().hidden).toBe(true);
    expect(banner.mode).toBeNull();
  });

  it('mounts once', () => {
    const { banner } = setup();

    banner.show('updates', { changes: 'a', why: 'b' });
    banner.show('updates', { changes: 'c', why: 'd' });
    expect(document.querySelectorAll('#gl-live-refresh')).toHaveLength(1);
  });
});
