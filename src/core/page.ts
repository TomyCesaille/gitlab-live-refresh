export type PageType = 'mr' | 'pipeline' | 'pipelineList' | 'job';

export interface PipelineListFilters {
  readonly scope: string | null;
  readonly ref: string | null;
  readonly status: string | null;
}

export interface PageRef {
  readonly type: PageType;
  readonly project: string;
  readonly id: string | null;
  readonly filters: PipelineListFilters | null;
  readonly key: string; // two tabs with the same key show the same server state
}

// GitLab puts `/-/` between a project's path, nested groups included, and the
// resource; no project path contains it.
const SEPARATOR = '/-/';

const RESOURCES: readonly (readonly [PageType, RegExp])[] = [
  ['mr', /^merge_requests\/(?<id>\d+)(?:\/|$)/],
  ['pipeline', /^pipelines\/(?<id>\d+)(?:\/|$)/],
  ['pipelineList', /^pipelines\/?$/],
  ['job', /^jobs\/(?<id>\d+)(?:\/|$)/],
];

export function detectPage(location: {
  pathname: string;
  search: string;
}): PageRef | null {
  const separator = location.pathname.indexOf(SEPARATOR);
  if (separator < 1) return null;
  const project = location.pathname.slice(1, separator);
  const resource = location.pathname.slice(separator + SEPARATOR.length);

  for (const [type, pattern] of RESOURCES) {
    const match = pattern.exec(resource);
    if (!match) continue;
    const id = match.groups?.id ?? null;
    const filters =
      type === 'pipelineList' ? listFilters(location.search) : null;
    const key = [type, project, id ?? '', filterKey(filters)].join(':');
    return { type, project, id, filters, key };
  }
  return null;
}

function listFilters(search: string): PipelineListFilters {
  const params = new URLSearchParams(search);
  const scope = params.get('scope');
  const status = params.get('status');
  return {
    scope: scope && scope !== 'all' ? scope.toUpperCase() : null,
    ref: params.get('ref'),
    status: status ? status.toUpperCase() : null,
  };
}

function filterKey(filters: PipelineListFilters | null): string {
  if (!filters) return '';
  return `${filters.scope ?? ''},${filters.ref ?? ''},${filters.status ?? ''}`;
}
