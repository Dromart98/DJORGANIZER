export type BackendCandidate = {
  available: () => boolean;
  name: "webgpu" | "webgl" | "wasm" | "cpu";
};

export const BACKEND_ORDER: BackendCandidate["name"][] = [
  "webgpu",
  "webgl",
  "wasm",
  "cpu",
];

export async function selectValidatedBackend(
  candidates: readonly BackendCandidate[],
  validate: (name: BackendCandidate["name"]) => Promise<boolean>,
) {
  const failures: string[] = [];
  for (const candidate of candidates) {
    if (!candidate.available()) continue;
    try {
      if (await validate(candidate.name)) return candidate.name;
    } catch (error) {
      failures.push(error instanceof Error ? error.message : candidate.name);
    }
  }
  throw new Error(
    failures.length
      ? `Ningún backend local superó la inferencia de prueba: ${failures.join("; ")}`
      : "Este navegador no ofrece un backend compatible para el análisis local.",
  );
}
