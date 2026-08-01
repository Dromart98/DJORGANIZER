"use client";

import {
  createContext,
  useCallback,
  useContext,
  useMemo,
  useState,
  type ReactNode,
} from "react";

export type DesktopTrackLink = {
  scanId: string;
  sessionId: string;
};

type ScanSessionContextValue = {
  getTrackLink(trackId: string): DesktopTrackLink | null;
  replaceTrackLinks(sessionId: string, links: Array<{ scanId: string; trackId: string }>): void;
  clearTrackLinks(): void;
};

const ScanSessionContext = createContext<ScanSessionContextValue | null>(null);

export function DesktopScanSessionProvider({ children }: { children: ReactNode }) {
  const [links, setLinks] = useState<Map<string, DesktopTrackLink>>(() => new Map());
  const replaceTrackLinks = useCallback(
    (sessionId: string, nextLinks: Array<{ scanId: string; trackId: string }>) => {
      setLinks(new Map(nextLinks.map(({ scanId, trackId }) => [trackId, { scanId, sessionId }])));
    },
    [],
  );
  const clearTrackLinks = useCallback(() => setLinks(new Map()), []);
  const value = useMemo(
    () => ({
      clearTrackLinks,
      getTrackLink: (trackId: string) => links.get(trackId) ?? null,
      replaceTrackLinks,
    }),
    [clearTrackLinks, links, replaceTrackLinks],
  );

  return <ScanSessionContext.Provider value={value}>{children}</ScanSessionContext.Provider>;
}

export function useDesktopScanSession() {
  const context = useContext(ScanSessionContext);
  if (!context) throw new Error("DesktopScanSessionProvider is missing");
  return context;
}
