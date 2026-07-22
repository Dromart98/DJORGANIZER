import { describe, expect, it } from "vitest";
import {
  LocalGenreCancelledError,
  LocalGenreClient,
} from "./client";
import { isLocalGenreWorkerResponse } from "./types";

class WorkerStub extends EventTarget {
  terminated = false;

  postMessage(message: unknown) {
    const request = message as { id: string; type: string };
    if (request.type === "prepare") {
      queueMicrotask(() =>
        this.dispatchEvent(
          new MessageEvent("message", {
            data: {
              backend: "wasm",
              id: request.id,
              status: "ready",
              type: "status",
            },
          }),
        ),
      );
    }
  }

  terminate() {
    this.terminated = true;
  }
}

describe("local genre Worker client", () => {
  it("validates Worker message shapes", () => {
    expect(
      isLocalGenreWorkerResponse({
        backend: "wasm",
        id: "1",
        status: "ready",
        type: "status",
      }),
    ).toBe(true);
    expect(isLocalGenreWorkerResponse({ id: 1, type: "status" })).toBe(false);
  });

  it("terminates active work for real cancellation and rejects the request", async () => {
    const workers: WorkerStub[] = [];
    const client = new LocalGenreClient(() => {
      const worker = new WorkerStub();
      workers.push(worker);
      return worker as unknown as Worker;
    });
    await client.prepare();
    const analysis = client.analyze(new Float32Array(32_768));
    client.cancel();
    await expect(analysis).rejects.toBeInstanceOf(LocalGenreCancelledError);
    expect(workers[0].terminated).toBe(true);
    expect(workers).toHaveLength(2);
    client.dispose();
    expect(workers[1].terminated).toBe(true);
  });
});
