export type VirtualDjTrack = {
  artist?: string;
  bpm?: number;
  index: number;
  key?: string;
  path: string;
  title?: string;
};

export type VirtualDjList = {
  name: string;
  source: string;
  tracks: VirtualDjTrack[];
};

export type LinkedTrack = {
  path: string;
  trackId: string;
};

export type ReconciliationChange = {
  from?: number;
  path: string;
  status: "added" | "moved" | "removed" | "unchanged";
  to?: number;
  trackId?: string;
};

function decodeXml(value: string) {
  return value
    .replace(/&quot;/g, '"')
    .replace(/&apos;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&amp;/g, "&");
}
function attributes(tag: string) {
  const result = new Map<string, string>();
  for (const match of tag.matchAll(
    /([A-Za-z_][\w.-]*)\s*=\s*(?:"([^"]*)"|'([^']*)')/g,
  )) {
    result.set(match[1], decodeXml(match[2] ?? match[3] ?? ""));
  }
  return result;
}

export function parseVirtualDjList(
  xml: string,
  source = "My Lists",
): VirtualDjList {
  if (xml.length > 10_000_000 || !/<VirtualFolder\b/i.test(xml)) {
    throw new Error("El archivo no contiene una List válida de VirtualDJ.");
  }
  const tracks = [...xml.matchAll(/<song\b[^>]*\/?>/gi)].map(
    (match, fallbackIndex): VirtualDjTrack => {
      const values = attributes(match[0]);
      const path = values.get("path")?.trim();
      if (!path) throw new Error("Una pista de VirtualDJ no contiene ruta.");
      const bpm = Number(values.get("bpm"));
      const index = Number(values.get("idx"));
      return {
        artist: values.get("artist") || undefined,
        bpm: Number.isFinite(bpm) ? bpm : undefined,
        index: Number.isInteger(index) && index >= 0 ? index : fallbackIndex,
        key: values.get("key") || undefined,
        path,
        title: values.get("title") || undefined,
      };
    },
  );
  tracks.sort((left, right) => left.index - right.index);
  const name = source
    .replace(/\\/g, "/")
    .split("/")
    .pop()
    ?.replace(/\.xml$/i, "");
  return { name: name || "VirtualDJ", source, tracks };
}

function normalizedPath(value: string) {
  return value.replace(/\\/g, "/").toLocaleLowerCase("en");
}

export function reconcileVirtualDjList(
  remote: VirtualDjList,
  currentPaths: readonly string[],
  links: readonly LinkedTrack[],
): ReconciliationChange[] {
  const trackByPath = new Map(
    links.map((link) => [normalizedPath(link.path), link.trackId]),
  );
  const remoteIndex = new Map(
    remote.tracks.map((track, index) => [normalizedPath(track.path), index]),
  );
  const currentIndex = new Map(
    currentPaths.map((path, index) => [normalizedPath(path), index]),
  );
  const changes: ReconciliationChange[] = [];

  remote.tracks.forEach((track, to) => {
    const key = normalizedPath(track.path);
    const from = currentIndex.get(key);
    changes.push({
      ...(from === undefined ? {} : { from }),
      path: track.path,
      status:
        from === undefined ? "added" : from === to ? "unchanged" : "moved",
      to,
      trackId: trackByPath.get(key),
    });
  });
  currentPaths.forEach((path, from) => {
    if (!remoteIndex.has(normalizedPath(path))) {
      changes.push({
        from,
        path,
        status: "removed",
        trackId: trackByPath.get(normalizedPath(path)),
      });
    }
  });
  return changes;
}
