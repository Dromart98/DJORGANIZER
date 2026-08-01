export interface TauriCore {
  invoke<T>(command: string, args?: Record<string, unknown>): Promise<T>;
}

export function getTauriCore(): TauriCore | undefined {
  if (typeof window === "undefined") return undefined;

  return (
    window as Window & {
      __TAURI__?: { core?: TauriCore };
    }
  ).__TAURI__?.core;
}
