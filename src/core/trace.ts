import type { KeyValueStore } from './storage';

export type Log = (...parts: unknown[]) => void;

const DEBUG = 'gl-live-refresh:debug';
const TRACE = 'gl-live-refresh:trace';
const TAB = 'gl-live-refresh:tab';
const TRACE_SIZE = 2_000;
const ENTRY_LENGTH = 400;

export interface TraceOptions {
  local: KeyValueStore; // shared by every tab of the site
  session: KeyValueStore; // this tab
  hidden: () => boolean;
}

// localStorage.setItem('gl-live-refresh:debug', '1') turns on a trace that
// survives reloads and gathers every tab of the site in one list:
// JSON.parse(localStorage.getItem('gl-live-refresh:trace')).join('\n')
export function createLog({ local, session, hidden }: TraceOptions): Log {
  if (local.get(DEBUG) !== 1) return () => undefined;
  const tab =
    (session.get(TAB) as string | null) ??
    Math.random().toString(36).slice(2, 6);
  session.set(TAB, tab);

  return (...parts) => {
    const text = parts
      .map((part) => (typeof part === 'string' ? part : JSON.stringify(part)))
      .join(' ');
    console.log(`[gl-live-refresh] ${text}`);
    const time = new Date().toISOString().slice(11, 23);
    const entry = `${time} ${tab} ${hidden() ? 'h' : 'v'} ${text.slice(0, ENTRY_LENGTH)}`;
    const trace = (local.get(TRACE) as string[] | null) ?? [];
    local.set(TRACE, [...trace, entry].slice(-TRACE_SIZE));
  };
}
