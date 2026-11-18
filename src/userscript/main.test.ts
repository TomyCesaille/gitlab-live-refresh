import { expect, it, vi } from 'vitest';

vi.mock('./watcher', () => ({ startUserscript: vi.fn() }));

it('starts on the page it is injected in', async () => {
  const { startUserscript } = await import('./watcher');
  await import('./main');

  expect(startUserscript).toHaveBeenCalledWith(window);
});
