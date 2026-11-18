import { describe, expect, it, vi } from 'vitest';
import {
  fetchFingerprint,
  mergeRequestFingerprint,
  PIPELINE_LIST_QUERY,
  pipelineFingerprint,
  pipelineListFingerprint,
} from './fingerprint';
import type { GitLabClient } from './gitlab';
import { detectPage, type PageRef } from './page';

const mr = {
  state: 'opened',
  sha: 'abc',
  user_notes_count: 3,
  detailed_merge_status: 'mergeable',
  updated_at: '2026-11-18T10:00:00Z',
  head_pipeline: { id: 7, status: 'running' },
};

function page(pathname: string, search = ''): PageRef {
  const ref = detectPage({ pathname, search });
  if (!ref) throw new Error(`not a page: ${pathname}`);
  return ref;
}

function fakeClient(answers: Record<string, unknown>) {
  const rest = vi.fn((path: string) =>
    path in answers
      ? Promise.resolve(answers[path])
      : Promise.reject(new Error(`no answer for ${path}`)),
  );
  const graphql = vi.fn(() => Promise.resolve(answers.graphql));
  const client = {
    rest,
    graphql,
    answers: vi.fn(),
  } as unknown as GitLabClient;
  return { client, rest, graphql };
}

describe('mergeRequestFingerprint', () => {
  it('names each part of a merge request worth a reload', () => {
    expect(
      mergeRequestFingerprint(mr, {
        approvals_left: 0,
        approved_by: [{ user: { id: 9 } }, { user: { id: 2 } }],
      }),
    ).toEqual({
      state: 'opened',
      commits: 'abc',
      comments: 3,
      pipeline: '7:running',
      mergeability: 'mergeable',
      approvals: '[0,[2,9]]',
      updatedAt: '2026-11-18T10:00:00Z',
    });
  });

  it('reads a merge request without a pipeline as null', () => {
    expect(
      mergeRequestFingerprint({ ...mr, head_pipeline: null }, undefined)
        .pipeline,
    ).toBeNull();
  });

  it.each(['checking', 'unchecked', 'preparing', 'approvals_syncing'])(
    'leaves the transient merge status %s unknown',
    (status) => {
      expect(
        mergeRequestFingerprint(
          { ...mr, detailed_merge_status: status },
          undefined,
        ).mergeability,
      ).toBeUndefined();
    },
  );

  it('leaves approvals unknown when they could not be read', () => {
    expect(mergeRequestFingerprint(mr, undefined).approvals).toBeUndefined();
  });

  it('reads approvals without approvers or without a user', () => {
    expect(mergeRequestFingerprint(mr, { approvals_left: 2 }).approvals).toBe(
      '[2,[]]',
    );
    expect(
      mergeRequestFingerprint(mr, { approvals_left: 1, approved_by: [{}] })
        .approvals,
    ).toBe('[1,[0]]');
  });
});

describe('pipelineFingerprint', () => {
  it('lists every job and downstream pipeline with its status', () => {
    expect(
      pipelineFingerprint(
        { status: 'running' },
        [
          { id: 2, status: 'running' },
          { id: 1, status: 'success' },
        ],
        [{ id: 5, status: 'pending' }],
      ),
    ).toEqual({
      status: 'running',
      jobs: '1:success,2:running',
      downstream: '5:pending',
    });
  });

  it('leaves jobs unknown when they could not be read', () => {
    expect(
      pipelineFingerprint({ status: 'success' }, undefined, undefined),
    ).toEqual({ status: 'success', jobs: undefined, downstream: undefined });
  });
});

describe('pipelineListFingerprint', () => {
  it('follows every pipeline and each of its stages', () => {
    expect(
      pipelineListFingerprint({
        project: {
          pipelines: {
            nodes: [
              {
                iid: '12',
                status: 'RUNNING',
                stages: {
                  nodes: [{ status: 'success' }, { status: 'running' }],
                },
              },
              { iid: '11', status: 'SUCCESS', stages: { nodes: [] } },
            ],
          },
        },
      }),
    ).toEqual({ pipelines: '12:RUNNING:success,running;11:SUCCESS:' });
  });
});

describe('fetchFingerprint', () => {
  it('reads a merge request and its approvals', async () => {
    const { client, rest } = fakeClient({
      '/projects/g%2Fp/merge_requests/4': mr,
      '/projects/g%2Fp/merge_requests/4/approvals': { approvals_left: 1 },
    });

    const fingerprint = await fetchFingerprint(
      client,
      page('/g/p/-/merge_requests/4'),
    );

    expect(fingerprint).toMatchObject({ state: 'opened', approvals: '[1,[]]' });
    expect(rest).toHaveBeenCalledTimes(2);
  });

  it('carries on when the approvals cannot be read', async () => {
    const { client } = fakeClient({ '/projects/g%2Fp/merge_requests/4': mr });

    await expect(
      fetchFingerprint(client, page('/g/p/-/merge_requests/4')),
    ).resolves.toMatchObject({ approvals: undefined });
  });

  it('reads a pipeline, its jobs and its downstream pipelines', async () => {
    const { client } = fakeClient({
      '/projects/g%2Fp/pipelines/9': { status: 'running' },
      '/projects/g%2Fp/pipelines/9/jobs?per_page=100': [
        { id: 1, status: 'running' },
      ],
    });

    await expect(
      fetchFingerprint(client, page('/g/p/-/pipelines/9')),
    ).resolves.toEqual({
      status: 'running',
      jobs: '1:running',
      downstream: undefined,
    });
  });

  it('queries the pipeline list with the page filters', async () => {
    const { client, graphql } = fakeClient({
      graphql: { project: { pipelines: { nodes: [] } } },
    });

    await expect(
      fetchFingerprint(client, page('/g/p/-/pipelines', '?scope=finished')),
    ).resolves.toEqual({ pipelines: '' });
    expect(graphql).toHaveBeenCalledWith(PIPELINE_LIST_QUERY, {
      path: 'g/p',
      scope: 'FINISHED',
      ref: null,
      status: null,
    });
  });

  it('reads a job status', async () => {
    const { client } = fakeClient({
      '/projects/g%2Fp/jobs/3': { id: 3, status: 'success' },
    });

    await expect(
      fetchFingerprint(client, page('/g/p/-/jobs/3')),
    ).resolves.toEqual({ status: 'success' });
  });
});
