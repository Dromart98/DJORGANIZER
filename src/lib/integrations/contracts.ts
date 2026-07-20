export type DjLibraryProviderId =
  | "rekordbox"
  | "serato"
  | "traktor"
  | "virtualdj";

export type IntegrationCapability =
  | "crate-hierarchy"
  | "cue-points"
  | "metadata"
  | "ordered-playlists"
  | "ratings";

export type DjLibraryProvider = {
  capabilities: readonly IntegrationCapability[];
  displayName: string;
  id: DjLibraryProviderId;
  status: "available" | "partial" | "planned";
};

export const DJ_LIBRARY_PROVIDERS: readonly DjLibraryProvider[] = [
  {
    capabilities: ["ordered-playlists", "crate-hierarchy", "metadata"],
    displayName: "VirtualDJ",
    id: "virtualdj",
    status: "available",
  },
  {
    capabilities: ["ordered-playlists", "crate-hierarchy", "metadata"],
    displayName: "Rekordbox",
    id: "rekordbox",
    status: "partial",
  },
  {
    capabilities: ["ordered-playlists", "crate-hierarchy"],
    displayName: "Serato",
    id: "serato",
    status: "planned",
  },
  {
    capabilities: ["ordered-playlists", "crate-hierarchy", "metadata"],
    displayName: "Traktor",
    id: "traktor",
    status: "planned",
  },
] as const;
