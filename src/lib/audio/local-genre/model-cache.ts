import { parseIntegrityManifest, verifyBytes } from "./integrity";
import type { ModelIntegrityManifest } from "./types";

export const MODEL_BASE_URL = "/models/discogs-effnet/tfjs-v1";
export const MODEL_MANIFEST_URL = `${MODEL_BASE_URL}/integrity-manifest.json`;
const BOOTSTRAP_CACHE = "djorganizer-model-manifest";
const VERSIONED_CACHE_PREFIX = "djorganizer-model-discogs-effnet-";

async function responseBytes(response: Response) {
  return response.clone().arrayBuffer();
}

export async function loadIntegrityManifest(
  cacheStorage: CacheStorage,
  networkFetch: typeof fetch,
) {
  const bootstrap = await cacheStorage.open(BOOTSTRAP_CACHE);
  let response: Response | undefined;
  try {
    const network = await networkFetch(MODEL_MANIFEST_URL, {
      cache: "no-store",
    });
    if (!network.ok) throw new Error(String(network.status));
    response = network;
    await bootstrap.put(MODEL_MANIFEST_URL, network.clone());
  } catch {
    response = (await bootstrap.match(MODEL_MANIFEST_URL)) ?? undefined;
  }
  if (!response) {
    throw new Error("No se pudo cargar el manifiesto del modelo local.");
  }
  return parseIntegrityManifest(await response.json());
}

export function modelCacheName(manifest: ModelIntegrityManifest) {
  const modelHash = manifest.files["model.json"]?.sha256;
  if (!modelHash) throw new Error("El manifiesto no incluye model.json.");
  return `${VERSIONED_CACHE_PREFIX}${manifest.version}-${modelHash.slice(0, 16)}`;
}

export async function createVerifiedModelFetch(
  manifest: ModelIntegrityManifest,
  cacheStorage: CacheStorage,
  networkFetch: typeof fetch,
) {
  const cacheName = modelCacheName(manifest);
  const cache = await cacheStorage.open(cacheName);
  return async (input: RequestInfo | URL, init?: RequestInit) => {
    const request = new Request(input, init);
    const url = new URL(request.url);
    const name = url.pathname.split("/").pop() ?? "";
    const integrity = manifest.files[name];
    if (!integrity) {
      throw new Error(`El archivo ${name} no está declarado en el manifiesto.`);
    }
    const cached = await cache.match(request);
    if (cached) {
      if (await verifyBytes(await responseBytes(cached), integrity)) return cached;
      await cache.delete(request);
    }
    const response = await networkFetch(request);
    if (!response.ok) {
      throw new Error(`Falta el archivo local ${name} (${response.status}).`);
    }
    if (!(await verifyBytes(await responseBytes(response), integrity))) {
      throw new Error(`El hash del archivo local ${name} no coincide.`);
    }
    await cache.put(request, response.clone());
    return response;
  };
}

export async function removeOldModelCaches(
  cacheStorage: CacheStorage,
  currentName: string,
) {
  const names = await cacheStorage.keys();
  await Promise.all(
    names
      .filter(
        (name) =>
          name.startsWith(VERSIONED_CACHE_PREFIX) && name !== currentName,
      )
      .map((name) => cacheStorage.delete(name)),
  );
}
