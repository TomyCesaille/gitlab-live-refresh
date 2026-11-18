export class GitLabError extends Error {
  readonly status: number;

  constructor(status: number, path: string) {
    super(`GitLab answered ${String(status)} to ${path}`);
    this.name = 'GitLabError';
    this.status = status;
  }
}

export interface GitLabClient {
  rest<T>(path: string): Promise<T>;
  // GraphQL over GET: read-only, and needs no CSRF token, so a page and an
  // extension background query the same way.
  graphql<T>(query: string, variables: Record<string, unknown>): Promise<T>;
  // Any answer below 500 means the server is up: a 401 lands on the sign-in page.
  answers(): Promise<boolean>;
}

export interface ClientOptions {
  origin: string;
  fetch: typeof fetch;
  timeoutMs: number;
}

interface GraphQLBody<T> {
  data: T;
  errors?: { message: string }[];
}

export function createGitLabClient(options: ClientOptions): GitLabClient {
  const request = (path: string) =>
    options.fetch(`${options.origin}${path}`, {
      credentials: 'include',
      headers: { Accept: 'application/json' },
      signal: AbortSignal.timeout(options.timeoutMs),
    });

  async function get<T>(path: string): Promise<T> {
    const response = await request(path);
    if (!response.ok) throw new GitLabError(response.status, path);
    return (await response.json()) as T;
  }

  return {
    rest: (path) => get(`/api/v4${path}`),

    async graphql<T>(query: string, variables: Record<string, unknown>) {
      const params = new URLSearchParams({
        query,
        variables: JSON.stringify(variables),
      });
      const body = await get<GraphQLBody<T>>(`/api/graphql?${params}`);
      const [error] = body.errors ?? [];
      if (error) throw new Error(`GraphQL: ${error.message}`);
      return body.data;
    },

    async answers() {
      try {
        return (await request('/api/v4/version')).status < 500;
      } catch {
        return false;
      }
    },
  };
}
