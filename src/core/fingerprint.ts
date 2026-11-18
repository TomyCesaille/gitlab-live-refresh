import type { GitLabClient } from './gitlab';
import type { PageRef } from './page';

// One value per thing worth a reload. `undefined` means "unknown this time"
// (a failed side request, a transient status) and never counts as a change.
export type FingerprintValue = string | number | null | undefined;
export type Fingerprint = Readonly<Record<string, FingerprintValue>>;

interface MergeRequest {
  state: string;
  sha: string;
  user_notes_count: number;
  detailed_merge_status: string;
  updated_at: string;
  head_pipeline: { id: number; status: string } | null;
}

interface Approvals {
  approvals_left: number;
  approved_by?: { user?: { id: number } }[];
}

interface Job {
  id: number;
  status: string;
}

interface PipelineList {
  project: {
    pipelines: {
      nodes: {
        iid: string;
        status: string;
        stages: { nodes: { status: string }[] };
      }[];
    };
  };
}

// GitLab reports these while it recomputes mergeability; they carry no news.
const TRANSIENT_MERGE_STATUSES = new Set([
  'checking',
  'unchecked',
  'preparing',
  'approvals_syncing',
]);

export const PIPELINE_LIST_QUERY = `query($path: ID!, $ref: String, $status: PipelineStatusEnum, $scope: PipelineScopeEnum) {
  project(fullPath: $path) {
    pipelines(first: 20, ref: $ref, status: $status, scope: $scope) {
      nodes { iid status stages { nodes { status } } }
    }
  }
}`;

export function mergeRequestFingerprint(
  mr: MergeRequest,
  approvals: Approvals | undefined,
): Fingerprint {
  return {
    state: mr.state,
    commits: mr.sha,
    comments: mr.user_notes_count,
    pipeline: mr.head_pipeline
      ? `${String(mr.head_pipeline.id)}:${mr.head_pipeline.status}`
      : null,
    mergeability: TRANSIENT_MERGE_STATUSES.has(mr.detailed_merge_status)
      ? undefined
      : mr.detailed_merge_status,
    approvals: approvals && approvalsValue(approvals),
    updatedAt: mr.updated_at,
  };
}

function approvalsValue(approvals: Approvals): string {
  const approvers = (approvals.approved_by ?? [])
    .map((approval) => approval.user?.id ?? 0)
    .sort((a, b) => a - b);
  return JSON.stringify([approvals.approvals_left, approvers]);
}

const jobsValue = (jobs: Job[] | undefined) =>
  jobs
    ?.map((job) => `${String(job.id)}:${job.status}`)
    .sort()
    .join(',');

export function pipelineFingerprint(
  pipeline: { status: string },
  jobs: Job[] | undefined,
  bridges: Job[] | undefined,
): Fingerprint {
  return {
    status: pipeline.status,
    jobs: jobsValue(jobs),
    downstream: jobsValue(bridges),
  };
}

// Stage statuses feed the list's mini graphs: a pipeline's own status stays
// put while its jobs move.
export function pipelineListFingerprint(list: PipelineList): Fingerprint {
  const pipelines = list.project.pipelines.nodes.map(
    (node) =>
      `${node.iid}:${node.status}:${node.stages.nodes.map((stage) => stage.status).join(',')}`,
  );
  return { pipelines: pipelines.join(';') };
}

export async function fetchFingerprint(
  client: GitLabClient,
  page: PageRef,
): Promise<Fingerprint> {
  const project = `/projects/${encodeURIComponent(page.project)}`;
  const optional = <T>(promise: Promise<T>) => promise.catch(() => undefined);

  switch (page.type) {
    case 'mr': {
      const base = `${project}/merge_requests/${String(page.id)}`;
      const [mr, approvals] = await Promise.all([
        client.rest<MergeRequest>(base),
        optional(client.rest<Approvals>(`${base}/approvals`)),
      ]);
      return mergeRequestFingerprint(mr, approvals);
    }
    case 'pipeline': {
      const base = `${project}/pipelines/${String(page.id)}`;
      const [pipeline, jobs, bridges] = await Promise.all([
        client.rest<{ status: string }>(base),
        optional(client.rest<Job[]>(`${base}/jobs?per_page=100`)),
        optional(client.rest<Job[]>(`${base}/bridges?per_page=100`)),
      ]);
      return pipelineFingerprint(pipeline, jobs, bridges);
    }
    case 'pipelineList': {
      const list = await client.graphql<PipelineList>(PIPELINE_LIST_QUERY, {
        path: page.project,
        ...page.filters,
      });
      return pipelineListFingerprint(list);
    }
    case 'job': {
      const job = await client.rest<Job>(`${project}/jobs/${String(page.id)}`);
      return { status: job.status };
    }
  }
}
