import { describe, expect, it, vi } from "vitest";
import { sha256Hex } from "./integrity";
import { createVerifiedModelFetch, modelCacheName } from "./model-cache";
import type { ModelIntegrityManifest } from "./types";

class MemoryCache {
  readonly entries = new Map<string, Response>();

  async match(request: RequestInfo | URL) {
    const key = request instanceof Request ? request.url : String(request);
    return this.entries.get(key)?.clone();
  }

  async put(request: RequestInfo | URL, response: Response) {
    const key = request instanceof Request ? request.url : String(request);
    this.entries.set(key, response.clone());
  }

  async delete(request: RequestInfo | URL) {
    const key = request instanceof Request ? request.url : String(request);
    return this.entries.delete(key);
  }
}

class MemoryCacheStorage {
  readonly entries = new Map<string, MemoryCache>();

  async open(name: string) {
    const cache = this.entries.get(name) ?? new MemoryCache();
    this.entries.set(name, cache);
    return cache as unknown as Cache;
  }
}

async function fixture() {
  const bytes = new TextEncoder().encode("model").buffer;
  const manifest: ModelIntegrityManifest = {
    files: {
      "metadata.json": { bytes: 5, sha256: await sha256Hex(bytes) },
      "model.json": { bytes: 5, sha256: await sha256Hex(bytes) },
    },
    name: "discogs-effnet-bs64-1",
    schemaVersion: 1,
    version: "tfjs-v1",
  };
  return { bytes, manifest };
}

describe("verified model cache", () => {
  it("reuses a valid cached model file without another network request", async () => {
    const { bytes, manifest } = await fixture();
    const storage = new MemoryCacheStorage();
    const network = vi.fn(async () => new Response(bytes));
    const verifiedFetch = await createVerifiedModelFetch(
      manifest,
      storage as unknown as CacheStorage,
      network as unknown as typeof fetch,
    );
    const url = "https://example.test/models/discogs-effnet/tfjs-v1/model.json";
    await verifiedFetch(url);
    await verifiedFetch(url);
    expect(network).toHaveBeenCalledTimes(1);
  });

  it("evicts a corrupt entry and replaces it from the network", async () => {
    const { bytes, manifest } = await fixture();
    const storage = new MemoryCacheStorage();
    const cache = (await storage.open(modelCacheName(manifest))) as unknown as MemoryCache;
    const url = "https://example.test/models/discogs-effnet/tfjs-v1/model.json";
    await cache.put(new Request(url), new Response("bad"));
    const network = vi.fn(async () => new Response(bytes));
    const verifiedFetch = await createVerifiedModelFetch(
      manifest,
      storage as unknown as CacheStorage,
      network as unknown as typeof fetch,
    );
    const response = await verifiedFetch(url);
    expect(await response.text()).toBe("model");
    expect(network).toHaveBeenCalledTimes(1);
  });
});
