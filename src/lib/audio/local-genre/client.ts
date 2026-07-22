import {
  isLocalGenreWorkerResponse,
  type LocalGenreSuggestion,
  type LocalGenreWorkerRequest,
  type LocalGenreWorkerResponse,
} from "./types";

type PendingRequest = {
  reject: (error: Error) => void;
  resolve: (response: LocalGenreWorkerResponse) => void;
};

export class LocalGenreCancelledError extends Error {
  constructor() {
    super("El análisis local se canceló.");
    this.name = "LocalGenreCancelledError";
  }
}

export class LocalGenreClient {
  private pending = new Map<string, PendingRequest>();
  private worker: Worker;

  constructor(private readonly workerFactory = () =>
    new Worker(new URL("./local-genre.worker.ts", import.meta.url), {
      name: "djorganizer-local-genre",
      type: "module",
    })) {
    this.worker = this.createWorker();
  }

  private createWorker() {
    const worker = this.workerFactory();
    worker.addEventListener("message", (event: MessageEvent<unknown>) => {
      if (!isLocalGenreWorkerResponse(event.data)) return;
      const pending = this.pending.get(event.data.id);
      if (!pending || event.data.type === "status" && event.data.status === "preparing") {
        return;
      }
      this.pending.delete(event.data.id);
      if (event.data.type === "error") {
        pending.reject(new Error(event.data.error));
      } else {
        pending.resolve(event.data);
      }
    });
    worker.addEventListener("error", () => {
      this.rejectAll(new Error("El Worker de análisis local dejó de responder."));
    });
    return worker;
  }

  private rejectAll(error: Error) {
    for (const pending of this.pending.values()) pending.reject(error);
    this.pending.clear();
  }

  private request(
    message: LocalGenreWorkerRequest,
    transfer: Transferable[] = [],
  ) {
    return new Promise<LocalGenreWorkerResponse>((resolve, reject) => {
      this.pending.set(message.id, { reject, resolve });
      this.worker.postMessage(message, transfer);
    });
  }

  async prepare() {
    const response = await this.request({ id: crypto.randomUUID(), type: "prepare" });
    if (response.type !== "status" || response.status !== "ready") {
      throw new Error("El modelo local no quedó preparado.");
    }
    return response.backend;
  }

  async analyze(pcm: Float32Array): Promise<LocalGenreSuggestion> {
    const transferableBytes = new Uint8Array(pcm.byteLength);
    transferableBytes.set(
      new Uint8Array(pcm.buffer, pcm.byteOffset, pcm.byteLength),
    );
    const transferable = transferableBytes.buffer;
    const response = await this.request(
      {
        id: crypto.randomUUID(),
        pcm: transferable,
        sampleRate: 16_000,
        type: "analyze",
      },
      [transferable],
    );
    if (response.type !== "result") {
      throw new Error("El análisis local no devolvió una sugerencia.");
    }
    return response.suggestion;
  }

  cancel() {
    this.worker.terminate();
    this.rejectAll(new LocalGenreCancelledError());
    this.worker = this.createWorker();
  }

  dispose() {
    this.worker.terminate();
    this.rejectAll(new LocalGenreCancelledError());
  }
}
