export type LocalGenreModelStatus = "preparing" | "ready" | "error";

export type LocalGenreSuggestion = {
  alternatives: LocalGenrePrediction[];
  backend: string;
  genre: string;
  score: number;
  subgenre: string;
};

export type LocalGenrePrediction = {
  genre: string;
  score: number;
  subgenre: string;
};

export type ModelIntegrityFile = {
  bytes: number;
  sha256: string;
};

export type ModelIntegrityManifest = {
  files: Record<string, ModelIntegrityFile>;
  name: string;
  schemaVersion: 1;
  version: string;
};

export type LocalGenreMetadata = {
  classCount: number;
  classes: string[];
  name: string;
  schemaVersion: 1;
  version: string;
};

export type LocalGenreWorkerRequest =
  | { id: string; type: "prepare" }
  | {
      id: string;
      pcm: ArrayBuffer;
      sampleRate: 16000;
      type: "analyze";
    };

export type LocalGenreWorkerResponse =
  | { id: string; status: "preparing"; type: "status" }
  | { backend: string; id: string; status: "ready"; type: "status" }
  | { error: string; id: string; type: "error" }
  | { id: string; suggestion: LocalGenreSuggestion; type: "result" };

export function isLocalGenreWorkerResponse(
  value: unknown,
): value is LocalGenreWorkerResponse {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  if (typeof candidate.id !== "string" || typeof candidate.type !== "string") {
    return false;
  }
  if (candidate.type === "error") return typeof candidate.error === "string";
  if (candidate.type === "result") {
    return typeof candidate.suggestion === "object" && candidate.suggestion !== null;
  }
  return (
    candidate.type === "status" &&
    (candidate.status === "preparing" || candidate.status === "ready")
  );
}
