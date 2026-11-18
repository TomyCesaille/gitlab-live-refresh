import { describe, expect, it } from 'vitest';
import { detectPage } from './page';

const at = (pathname: string, search = '') => detectPage({ pathname, search });

describe('detectPage', () => {
  it.each([
    ['/group/project/-/merge_requests/42', 'mr', 'group/project', '42'],
    [
      '/group/sub/project/-/merge_requests/42/diffs',
      'mr',
      'group/sub/project',
      '42',
    ],
    ['/group/project/-/pipelines/123', 'pipeline', 'group/project', '123'],
    [
      '/group/project/-/pipelines/123/builds',
      'pipeline',
      'group/project',
      '123',
    ],
    ['/group/project/-/jobs/987', 'job', 'group/project', '987'],
  ] as const)('reads %s as a %s page', (pathname, type, project, id) => {
    expect(at(pathname)).toMatchObject({ type, project, id, filters: null });
  });

  it('reads the pipeline list with or without a trailing slash', () => {
    expect(at('/group/project/-/pipelines')).toMatchObject({
      type: 'pipelineList',
      project: 'group/project',
      id: null,
    });
    expect(at('/group/project/-/pipelines/')?.type).toBe('pipelineList');
  });

  it.each([
    '/group/project/-/merge_requests/new',
    '/group/project/-/pipelines/new',
    '/group/project/-/issues/3',
    '/dashboard/merge_requests',
    '/-/user_settings/profile',
  ])('leaves %s alone', (pathname) => {
    expect(at(pathname)).toBeNull();
  });

  it('keys two tabs on the same merge request alike, whatever their tab', () => {
    expect(at('/g/p/-/merge_requests/1')?.key).toBe(
      at('/g/p/-/merge_requests/1/diffs')?.key,
    );
  });

  it('turns the list URL filters into the query arguments', () => {
    expect(
      at('/g/p/-/pipelines', '?scope=finished&ref=main&status=failed')?.filters,
    ).toEqual({ scope: 'FINISHED', ref: 'main', status: 'FAILED' });
  });

  it('reads the "all" scope and missing filters as no filter', () => {
    expect(at('/g/p/-/pipelines', '?scope=all')?.filters).toEqual({
      scope: null,
      ref: null,
      status: null,
    });
  });

  it('keys differently filtered lists apart', () => {
    expect(at('/g/p/-/pipelines', '?scope=finished')?.key).not.toBe(
      at('/g/p/-/pipelines')?.key,
    );
  });
});
