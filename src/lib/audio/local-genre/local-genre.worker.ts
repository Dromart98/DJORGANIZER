/// <reference lib="webworker" />

import * as tf from "@tensorflow/tfjs";
import "@tensorflow/tfjs-backend-webgl";
import { setWasmPaths } from "@tensorflow/tfjs-backend-wasm";
import "@tensorflow/tfjs-backend-wasm";
import "@tensorflow/tfjs-backend-webgpu";
import { aggregateGenrePredictions } from "./aggregation";
import { selectValidatedBackend, type BackendCandidate } from "./backend";
import { parseLocalGenreMetadata } from "./integrity";
import {
  createFixedBatches,
  createPatches,
  computeMusiCnnFrames,
  FIXED_BATCH_SIZE,
  MEL_BANDS,
  PATCH_FRAMES,
} from "./preprocessing";
import {
  createVerifiedModelFetch,
  loadIntegrityManifest,
  MODEL_BASE_URL,
  modelCacheName,
  removeOldModelCaches,
} from "./model-cache";
import type {
  LocalGenreMetadata,
  LocalGenreWorkerRequest,
  LocalGenreWorkerResponse,
} from "./types";

const workerScope = self as unknown as DedicatedWorkerGlobalScope;
setWasmPaths("/tfjs/wasm/");

let backend: string | null = null;
let metadata: LocalGenreMetadata | null = null;
let model: tf.GraphModel | null = null;
let preparation: Promise<void> | null = null;

function post(response: LocalGenreWorkerResponse) {
  workerScope.postMessage(response);
}

function outputTensor(output: tf.Tensor | tf.Tensor[]) {
  const tensors = Array.isArray(output) ? output : [output];
  const predictions = tensors.find((tensor) => tensor.size === FIXED_BATCH_SIZE * 400);
  if (!predictions) {
    tensors.forEach((tensor) => tensor.dispose());
    throw new Error("El GraphModel no expone 400 puntuaciones Discogs.");
  }
  tensors.filter((tensor) => tensor !== predictions).forEach((tensor) => tensor.dispose());
  return predictions;
}

async function validateBackend(name: BackendCandidate["name"]) {
  if (!model) return false;
  if (!(await tf.setBackend(name))) return false;
  await tf.ready();
  const input = tf.zeros([FIXED_BATCH_SIZE, PATCH_FRAMES, MEL_BANDS]);
  try {
    const predictions = outputTensor(
      model.execute(input, "discogs_predictions") as tf.Tensor | tf.Tensor[],
    );
    const values = await predictions.data();
    const valid =
      values.length === FIXED_BATCH_SIZE * 400 &&
      Array.from(values).every(Number.isFinite);
    predictions.dispose();
    return valid;
  } finally {
    input.dispose();
  }
}

async function prepareModel() {
  if (model && metadata && backend) return;
  const manifest = await loadIntegrityManifest(caches, fetch);
  const verifiedFetch = await createVerifiedModelFetch(manifest, caches, fetch);
  const metadataResponse = await verifiedFetch(`${MODEL_BASE_URL}/metadata.json`);
  metadata = parseLocalGenreMetadata(await metadataResponse.json());
  await tf.setBackend("cpu");
  await tf.ready();
  model = await tf.loadGraphModel(`${MODEL_BASE_URL}/model.json`, {
    fetchFunc: verifiedFetch,
  });
  const candidates: BackendCandidate[] = [
    { available: () => "gpu" in navigator, name: "webgpu" },
    {
      available: () => typeof OffscreenCanvas !== "undefined",
      name: "webgl",
    },
    { available: () => typeof WebAssembly !== "undefined", name: "wasm" },
    { available: () => true, name: "cpu" },
  ];
  backend = await selectValidatedBackend(candidates, validateBackend);
  await removeOldModelCaches(caches, modelCacheName(manifest));
}

function ensurePrepared() {
  preparation ??= prepareModel().catch((error) => {
    model?.dispose();
    model = null;
    metadata = null;
    backend = null;
    preparation = null;
    throw error;
  });
  return preparation;
}

async function analyze(request: Extract<LocalGenreWorkerRequest, { type: "analyze" }>) {
  await ensurePrepared();
  if (!model || !metadata || !backend) {
    throw new Error("El modelo local no está preparado.");
  }
  if (request.sampleRate !== 16_000) {
    throw new Error("El audio local debe estar muestreado a 16 kHz.");
  }
  const pcm = new Float32Array(request.pcm);
  const { features, frameCount } = computeMusiCnnFrames(pcm);
  const { patches, patchCount } = createPatches(features, frameCount);
  const batches = createFixedBatches(patches, patchCount);
  const collected = new Float32Array(patchCount * 400);
  let outputOffset = 0;
  for (const batch of batches) {
    const input = tf.tensor(batch.values, [FIXED_BATCH_SIZE, PATCH_FRAMES, MEL_BANDS]);
    try {
      const predictions = outputTensor(
        model.execute(input, "discogs_predictions") as tf.Tensor | tf.Tensor[],
      );
      const values = await predictions.data();
      collected.set(
        Float32Array.from(values).subarray(0, batch.actualPatches * 400),
        outputOffset,
      );
      outputOffset += batch.actualPatches * 400;
      predictions.dispose();
    } finally {
      input.dispose();
    }
  }
  return aggregateGenrePredictions(collected, patchCount, metadata.classes, backend);
}

workerScope.addEventListener(
  "message",
  (event: MessageEvent<LocalGenreWorkerRequest>) => {
    const request = event.data;
    if (request.type === "prepare") {
      post({ id: request.id, status: "preparing", type: "status" });
      void ensurePrepared()
        .then(() => post({ backend: backend ?? "unknown", id: request.id, status: "ready", type: "status" }))
        .catch((error: unknown) =>
          post({
            error: error instanceof Error ? error.message : "No se pudo preparar el análisis local.",
            id: request.id,
            type: "error",
          }),
        );
      return;
    }
    void analyze(request)
      .then((suggestion) => post({ id: request.id, suggestion, type: "result" }))
      .catch((error: unknown) =>
        post({
          error: error instanceof Error ? error.message : "No se pudo sugerir un género localmente.",
          id: request.id,
          type: "error",
        }),
      );
  },
);

export {};
