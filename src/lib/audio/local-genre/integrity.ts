import type {
  LocalGenreMetadata,
  ModelIntegrityFile,
  ModelIntegrityManifest,
} from "./types";

const SHA256_PATTERN = /^[a-f0-9]{64}$/;

function isIntegrityFile(value: unknown): value is ModelIntegrityFile {
  if (typeof value !== "object" || value === null) return false;
  const candidate = value as Record<string, unknown>;
  return (
    Number.isSafeInteger(candidate.bytes) &&
    Number(candidate.bytes) >= 0 &&
    typeof candidate.sha256 === "string" &&
    SHA256_PATTERN.test(candidate.sha256)
  );
}

export function parseIntegrityManifest(
  value: unknown,
): ModelIntegrityManifest {
  if (typeof value !== "object" || value === null) {
    throw new Error("El manifiesto local no es válido.");
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.name !== "string" ||
    typeof candidate.version !== "string" ||
    typeof candidate.files !== "object" ||
    candidate.files === null
  ) {
    throw new Error("La versión del manifiesto local no es compatible.");
  }
  const files = candidate.files as Record<string, unknown>;
  const required = ["model.json", "metadata.json"];
  if (
    required.some((name) => !isIntegrityFile(files[name])) ||
    !Object.values(files).every(isIntegrityFile)
  ) {
    throw new Error("El manifiesto local no contiene hashes válidos.");
  }
  return candidate as ModelIntegrityManifest;
}

export function parseLocalGenreMetadata(value: unknown): LocalGenreMetadata {
  if (typeof value !== "object" || value === null) {
    throw new Error("Los metadatos del modelo no son válidos.");
  }
  const candidate = value as Record<string, unknown>;
  if (
    candidate.schemaVersion !== 1 ||
    typeof candidate.name !== "string" ||
    typeof candidate.version !== "string" ||
    !Array.isArray(candidate.classes) ||
    !candidate.classes.every((entry) => typeof entry === "string") ||
    candidate.classCount !== candidate.classes.length ||
    candidate.classCount !== 400
  ) {
    throw new Error("Las clases del modelo local no son compatibles.");
  }
  return candidate as LocalGenreMetadata;
}

export async function sha256Hex(bytes: ArrayBuffer): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", bytes);
  return Array.from(new Uint8Array(digest), (byte) =>
    byte.toString(16).padStart(2, "0"),
  ).join("");
}

export async function verifyBytes(
  bytes: ArrayBuffer,
  expected: ModelIntegrityFile,
): Promise<boolean> {
  return (
    bytes.byteLength === expected.bytes &&
    (await sha256Hex(bytes)) === expected.sha256
  );
}
