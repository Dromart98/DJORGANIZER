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
  relativePath?: string;
  scanId: string;
  sessionId: string;
};

export type DesktopScanHealthTrack = {
  duplicateGroup: string | null;
  metadataRead: boolean;
  relativePath: string;
  scanId: string;
};

export type DesktopScanHealthSnapshot = {
  duplicateGroups: number;
  duplicateTracks: number;
  fingerprintFailures: number;
  metadataFailures: number;
  rootName: string;
  sessionId: string;
  tracks: DesktopScanHealthTrack[];
  truncated: boolean;
};

export type DesktopPathChange = {
  from: string;
  to: string;
  trackId: string;
};

type LinkInput = {
  relativePath?: string;
  scanId: string;
  trackId: string;
};

type ReplaceLinksOptions = {
  coverageComplete?: boolean;
  scannedRelativePaths?: readonly string[];
};

type LinkState = {
  links: Map<string, DesktopTrackLink>;
  linksReady: boolean;
  missingTrackIds: Set<string>;
  pathChanges: Map<string, DesktopPathChange>;
  sessionId: string | null;
};

type ScanSessionContextValue = {
  clearTrackLinks(): void;
  getTrackLink(trackId: string): DesktopTrackLink | null;
  linkedScanIds: string[];
  linkedTrackIds: string[];
  linksReady: boolean;
  missingTrackIds: string[];
  pathChanges: DesktopPathChange[];
  replaceScanHealth(snapshot: DesktopScanHealthSnapshot): void;
  replaceTrackLinks(
    sessionId: string,
    links: LinkInput[],
    options?: ReplaceLinksOptions,
  ): void;
  scanHealth: DesktopScanHealthSnapshot | null;
};

const ScanSessionContext = createContext<ScanSessionContextValue | null>(null);

function emptyLinkState(): LinkState {
  return {
    links: new Map(),
    linksReady: false,
    missingTrackIds: new Set(),
    pathChanges: new Map(),
    sessionId: null,
  };
}

export function DesktopScanSessionProvider({ children }: { children: ReactNode }) {
  const [linkState, setLinkState] = useState<LinkState>(emptyLinkState);
  const [scanHealth, setScanHealth] = useState<DesktopScanHealthSnapshot | null>(
    null,
  );

  const replaceTrackLinks = useCallback(
    (sessionId: string, nextLinks: LinkInput[], options?: ReplaceLinksOptions) => {
      const coverageComplete = options?.coverageComplete ?? true;
      const scannedRelativePaths = new Set(options?.scannedRelativePaths ?? []);
      setLinkState((current) => {
        const next = new Map(
          nextLinks.map(({ relativePath, scanId, trackId }) => [
            trackId,
            { relativePath, scanId, sessionId },
          ]),
        );
        if (current.sessionId !== sessionId) {
          return {
            links: next,
            linksReady: coverageComplete,
            missingTrackIds: new Set(),
            pathChanges: new Map(),
            sessionId,
          };
        }

        if (!coverageComplete) {
          return {
            links: next,
            linksReady: false,
            missingTrackIds: current.missingTrackIds,
            pathChanges: current.pathChanges,
            sessionId,
          };
        }

        const missingTrackIds = new Set(current.missingTrackIds);
        for (const [trackId, previous] of current.links) {
          if (next.has(trackId)) continue;
          if (
            !previous.relativePath ||
            scannedRelativePaths.has(previous.relativePath)
          ) {
            continue;
          }
          missingTrackIds.add(trackId);
        }
        for (const trackId of next.keys()) missingTrackIds.delete(trackId);

        const pathChanges = new Map(current.pathChanges);
        for (const [trackId, nextLink] of next) {
          const previous = current.links.get(trackId);
          if (
            previous?.relativePath &&
            nextLink.relativePath &&
            previous.relativePath !== nextLink.relativePath
          ) {
            pathChanges.set(trackId, {
              from: previous.relativePath,
              to: nextLink.relativePath,
              trackId,
            });
          }
        }

        return {
          links: next,
          linksReady: true,
          missingTrackIds,
          pathChanges,
          sessionId,
        };
      });
    },
    [],
  );

  const clearTrackLinks = useCallback(() => {
    setLinkState(emptyLinkState());
    setScanHealth(null);
  }, []);

  const replaceScanHealth = useCallback((snapshot: DesktopScanHealthSnapshot) => {
    setScanHealth({
      ...snapshot,
      tracks: snapshot.tracks.map((track) => ({
        duplicateGroup: track.duplicateGroup,
        metadataRead: track.metadataRead,
        relativePath: track.relativePath,
        scanId: track.scanId,
      })),
    });
  }, []);

  const value = useMemo(
    () => ({
      clearTrackLinks,
      getTrackLink: (trackId: string) => linkState.links.get(trackId) ?? null,
      linkedScanIds: [...linkState.links.values()].map((link) => link.scanId),
      linkedTrackIds: [...linkState.links.keys()],
      linksReady: linkState.linksReady,
      missingTrackIds: [...linkState.missingTrackIds],
      pathChanges: [...linkState.pathChanges.values()],
      replaceScanHealth,
      replaceTrackLinks,
      scanHealth,
    }),
    [clearTrackLinks, linkState, replaceScanHealth, replaceTrackLinks, scanHealth],
  );

  return <ScanSessionContext.Provider value={value}>{children}</ScanSessionContext.Provider>;
}

export function useDesktopScanSession() {
  const context = useContext(ScanSessionContext);
  if (!context) throw new Error("DesktopScanSessionProvider is missing");
  return context;
}
