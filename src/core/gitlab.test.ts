import { describe, expect, it, vi } from 'vitest';
import { createGitLabClient, GitLabError } from './gitlab';

function clientAnswering(...responses: (Response | Error)[]) {
  const fetch = vi.fn<typeof globalThis.fetch>();
  for (const response of responses) {
    if (response instanceof Error) fetch.mockRejectedValueOnce(response);
    else fetch.mockResolvedValueOnce(response);
  }
  const client = createGitLabClient({
    origin: 'https://gitlab.example.com',
    fetch,
    timeoutMs: 1_000,
  });
  return { client, fetch };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status });

describe('createGitLabClient', () => {
  it('reads the REST API with the session cookie', async () => {
    const { client, fetch } = clientAnswering(json({ state: 'opened' }));

    await expect(client.rest('/projects/1')).resolves.toEqual({
      state: 'opened',
    });
    const [url, init] = fetch.mock.calls[0]!;
    expect(url).toBe('https://gitlab.example.com/api/v4/projects/1');
    expect(init).toMatchObject({
      credentials: 'include',
      headers: { Accept: 'application/json' },
    });
    expect(init?.signal).toBeInstanceOf(AbortSignal);
  });

  it('turns an error status into a GitLabError carrying it', async () => {
    const { client } = clientAnswering(json({}, 404));

    const error = await client.rest('/projects/1').catch((e: unknown) => e);
    expect(error).toBeInstanceOf(GitLabError);
    expect(error).toMatchObject({
      status: 404,
      name: 'GitLabError',
      message: 'GitLab answered 404 to /api/v4/projects/1',
    });
  });

  it('sends GraphQL queries as GET, with the variables as JSON', async () => {
    const { client, fetch } = clientAnswering(json({ data: { ok: true } }));

    await expect(
      client.graphql('query { ok }', { path: 'g/p' }),
    ).resolves.toEqual({ ok: true });
    const url = new URL(fetch.mock.calls[0]![0] as string);
    expect(url.pathname).toBe('/api/graphql');
    expect(url.searchParams.get('query')).toBe('query { ok }');
    expect(url.searchParams.get('variables')).toBe('{"path":"g/p"}');
  });

  it('raises the first GraphQL error', async () => {
    const { client } = clientAnswering(
      json({ data: null, errors: [{ message: 'no field' }] }),
    );

    await expect(client.graphql('query { x }', {})).rejects.toThrow(
      'GraphQL: no field',
    );
  });

  it.each([
    [200, true],
    [401, true],
    [502, false],
  ])('reads a %i on /version as GitLab answering: %s', async (status, up) => {
    const { client, fetch } = clientAnswering(json({}, status));

    await expect(client.answers()).resolves.toBe(up);
    expect(fetch.mock.calls[0]![0] as string).toBe(
      'https://gitlab.example.com/api/v4/version',
    );
  });

  it('reads a network failure as GitLab not answering', async () => {
    const { client } = clientAnswering(new TypeError('Failed to fetch'));

    await expect(client.answers()).resolves.toBe(false);
  });
});
