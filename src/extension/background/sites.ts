export const CONTENT_SCRIPT_ID = 'gitlab-live-refresh';

export interface SitesApi {
  permissions: { getAll(): Promise<{ origins?: string[] }> };
  scripting: {
    getRegisteredContentScripts(filter: {
      ids: string[];
    }): Promise<{ id: string }[]>;
    unregisterContentScripts(filter: { ids: string[] }): Promise<void>;
    registerContentScripts(
      scripts: {
        id: string;
        matches: string[];
        js: string[];
        runAt: 'document_idle';
        persistAcrossSessions: boolean;
      }[],
    ): Promise<void>;
  };
}

// Live refresh runs on the sites you turned it on for: the host permissions
// you granted are the list, and the content script follows it.
export async function syncContentScripts(
  api: SitesApi,
  file: string,
): Promise<string[]> {
  const { origins = [] } = await api.permissions.getAll();
  const ids = [CONTENT_SCRIPT_ID];
  if ((await api.scripting.getRegisteredContentScripts({ ids })).length > 0) {
    await api.scripting.unregisterContentScripts({ ids });
  }
  if (origins.length > 0) {
    await api.scripting.registerContentScripts([
      {
        id: CONTENT_SCRIPT_ID,
        matches: origins,
        js: [file],
        runAt: 'document_idle',
        // registered again at every browser start, the same way in both browsers
        persistAcrossSessions: false,
      },
    ]);
  }
  return origins;
}
