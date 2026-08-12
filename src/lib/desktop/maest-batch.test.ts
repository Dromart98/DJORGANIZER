import { describe, expect, it, vi } from "vitest";
import { DESKTOP_MAEST_ANALYZER, DESKTOP_MAEST_COMPATIBILITY_KEY } from "./maest-analysis";
import { MAX_MAEST_BATCH_TRACKS, MaestBatchOrchestrator, hasValidMaestClassification, maestBatchActionDisabled, maestBatchActionVisible, type MaestBatchTrack } from "./maest-batch";
import type { MaestPublicResult } from "./maest-preview";
import type { TauriCore } from "./tauri";

const result: MaestPublicResult = { scanId: "scan", analysis: { analyzer: DESKTOP_MAEST_ANALYZER, compatibilityKey: DESKTOP_MAEST_COMPATIBILITY_KEY, partialErrors: [], genre: { field: "genre", status: "completed", source: "automatic", proposedValue: "Electronic", score: .8, analyzedAt: "1" }, subgenre: { field: "subgenre", status: "completed", source: "automatic", proposedValue: "Techno", score: .7, analyzedAt: "1" } } };
const emptyEvidence = () => ({ genre: { value: null, source: null, analyzerId: null, analyzerVersion: null, compatibilityKey: null, analyzedAt: null, rawScore: null }, subgenre: { value: null, source: null, analyzerId: null, analyzerVersion: null, compatibilityKey: null, analyzedAt: null, rawScore: null } });
const track = (trackId: string): MaestBatchTrack => ({ trackId, title: trackId, artist: null, evidence: emptyEvidence() });
const linked = (id: string) => ({ sessionId: "session", scanId: `scan-${id}` });
function setup(tracks: MaestBatchTrack[], invokeImpl?: (command: string, args?: Record<string, unknown>) => Promise<unknown>, includeAnalyzed = false) {
  const states: ReturnType<MaestBatchOrchestrator["snapshot"]>[] = [];
  const invoke = vi.fn(invokeImpl ?? (async (command, args) => command === "analyze_scanned_track" ? { ...result, scanId: ((args?.request as { scanId: string }).scanId) } : null));
  const orchestrator = new MaestBatchOrchestrator({ core: { invoke } as TauriCore, tracks, getTrackLink: linked, includeAnalyzed, locale: "en", onState: (state) => states.push(state) });
  return { invoke, orchestrator, states };
}
function deferred<T>() { let resolve!: (value: T) => void; let reject!: (reason: unknown) => void; const promise = new Promise<T>((res, rej) => { resolve = res; reject = rej; }); return { promise, resolve, reject }; }

describe("MAEST selection batch", () => {
  it("hides the native action on web and disables an empty selection", () => {
    expect(maestBatchActionVisible(false)).toBe(false);
    expect(maestBatchActionVisible(true)).toBe(true);
    expect(maestBatchActionDisabled(0, false)).toBe(true);
    expect(maestBatchActionDisabled(1, false)).toBe(false);
    expect(maestBatchActionDisabled(1, false, true)).toBe(true);
  });
  it("enforces the page-size limit and does not prepare an empty batch", async () => {
    expect(MAX_MAEST_BATCH_TRACKS).toBe(25);
    expect(() => setup(Array.from({ length: 26 }, (_, index) => track(String(index))))).toThrow("maest_batch_limit");
    const batch = setup([]); await batch.orchestrator.run();
    expect(batch.invoke).not.toHaveBeenCalled();
  });

  it("skips unlinked tracks and valid classifications by default", async () => {
    const analyzed = track("analyzed");
    for (const field of [analyzed.evidence.genre, analyzed.evidence.subgenre]) Object.assign(field, { value: "House", source: "automatic", analyzerId: DESKTOP_MAEST_ANALYZER.id, analyzerVersion: DESKTOP_MAEST_ANALYZER.version, compatibilityKey: DESKTOP_MAEST_COMPATIBILITY_KEY, analyzedAt: 1, rawScore: .4 });
    expect(hasValidMaestClassification(analyzed)).toBe(true);
    const invoke = vi.fn();
    const states: ReturnType<MaestBatchOrchestrator["snapshot"]>[] = [];
    const batch = new MaestBatchOrchestrator({ core: { invoke } as TauriCore, tracks: [track("missing"), analyzed], getTrackLink: (id) => id === "missing" ? null : linked(id), includeAnalyzed: false, locale: "en", onState: (state) => states.push(state) });
    await batch.run();
    expect(batch.snapshot().items.map((item) => item.status)).toEqual(["skipped", "already_analyzed"]);
    expect(invoke).not.toHaveBeenCalled();
    const included = setup([analyzed], undefined, true); await included.orchestrator.run();
    expect(included.orchestrator.snapshot().items[0].status).toBe("completed");
  });

  it("prepares once, executes visible order sequentially, and uses private unique identities", async () => {
    let inFlight = 0; let maximum = 0; const order: string[] = [];
    const batch = setup([track("a"), track("b"), track("c")], async (command, args) => {
      if (command === "analyze_scanned_track") { inFlight += 1; maximum = Math.max(maximum, inFlight); const request = args?.request as { scanId: string }; order.push(request.scanId); inFlight -= 1; return { ...result, scanId: request.scanId }; }
      return null;
    });
    await batch.orchestrator.run();
    expect(order).toEqual(["scan-a", "scan-b", "scan-c"]); expect(maximum).toBe(1);
    expect(batch.invoke.mock.calls.filter(([command]) => command === "prepare_maest_model")).toHaveLength(1);
    const requests = batch.invoke.mock.calls.filter(([command]) => command === "analyze_scanned_track").map(([, args]) => (args as { request: Record<string, unknown> }).request);
    expect(new Set(requests.map((request) => request.operationId)).size).toBe(3);
    expect(requests.every((request) => Object.keys(request).sort().join() === "operationId,scanId,sessionId")).toBe(true);
    const progress = batch.states.filter((state) => state.phase === "running" && state.items.some((item) => item.status === "preparing")).map((state) => state.currentEligibleOrdinal);
    expect(progress).toEqual([1, 2, 3]);
    expect(batch.orchestrator.snapshot().eligibleTotal).toBe(3);
  });

  it("counts only eligible tracks in batch progress", async () => {
    const analyzed = track("analyzed");
    for (const field of [analyzed.evidence.genre, analyzed.evidence.subgenre]) Object.assign(field, { value: "House", source: "automatic", analyzerId: DESKTOP_MAEST_ANALYZER.id, analyzerVersion: DESKTOP_MAEST_ANALYZER.version, compatibilityKey: DESKTOP_MAEST_COMPATIBILITY_KEY, analyzedAt: 1, rawScore: .4 });
    const states: ReturnType<MaestBatchOrchestrator["snapshot"]>[] = [];
    const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => command === "analyze_scanned_track" ? { ...result, scanId: ((args?.request as { scanId: string }).scanId) } : null);
    const batch = new MaestBatchOrchestrator({ core: { invoke } as TauriCore, tracks: [track("missing"), analyzed, track("eligible")], getTrackLink: (id) => id === "missing" ? null : linked(id), includeAnalyzed: false, locale: "en", onState: (state) => states.push(state) });
    await batch.run();
    const running = states.find((state) => state.phase === "running");
    expect(running).toMatchObject({ currentEligibleOrdinal: 1, eligibleTotal: 1 });
  });

  it("keeps progress coherent when an eligible link disappears before execution", async () => {
    let linkedB = true;
    const states: ReturnType<MaestBatchOrchestrator["snapshot"]>[] = [];
    const invoke = vi.fn(async (command: string, args?: Record<string, unknown>) => {
      if (command !== "analyze_scanned_track") return null;
      const scanId = (args?.request as { scanId: string }).scanId;
      if (scanId === "scan-a") linkedB = false;
      return { ...result, scanId };
    });
    const batch = new MaestBatchOrchestrator({ core: { invoke } as TauriCore, tracks: [track("a"), track("b"), track("c")], getTrackLink: (id) => id === "b" && !linkedB ? null : linked(id), includeAnalyzed: false, locale: "en", onState: (state) => states.push(state) });
    await batch.run();
    expect(batch.snapshot().items.map((item) => item.status)).toEqual(["completed", "skipped", "completed"]);
    expect(states.filter((state) => state.phase === "running" && state.items.some((item) => item.status === "preparing")).map((state) => [state.currentEligibleOrdinal, state.eligibleTotal])).toEqual([[1, 3], [2, 2]]);
  });

  it("waits for each analysis and continues after a normal partial failure", async () => {
    const first = deferred<MaestPublicResult>(); const started: string[] = [];
    const batch = setup([track("a"), track("b")], async (command, args) => {
      if (command !== "analyze_scanned_track") return null;
      const scanId = (args?.request as { scanId: string }).scanId; started.push(scanId);
      if (scanId === "scan-a") return first.promise;
      return { ...result, scanId };
    });
    const running = batch.orchestrator.run(); await Promise.resolve(); await Promise.resolve();
    expect(started).toEqual(["scan-a"]); first.reject({ stage: "decode" }); await running;
    expect(started).toEqual(["scan-a", "scan-b"]);
    expect(batch.orchestrator.snapshot().items.map((item) => item.status)).toEqual(["failed", "completed"]);
  });

  it("stops remaining work on analyzer_busy without retry", async () => {
    const batch = setup([track("a"), track("b")], async (command) => { if (command === "analyze_scanned_track") throw { code: "analyzer_busy" }; return null; });
    await batch.orchestrator.run();
    expect(batch.invoke.mock.calls.filter(([command]) => command === "analyze_scanned_track")).toHaveLength(1);
    expect(batch.orchestrator.snapshot().phase).toBe("blocked");
    expect(batch.orchestrator.snapshot().items.map((item) => item.status)).toEqual(["failed", "cancelled"]);
  });

  it("cancels the exact running operation and never starts pending tracks", async () => {
    const current = deferred<MaestPublicResult>();
    const batch = setup([track("a"), track("b")], async (command) => {
      if (command === "analyze_scanned_track") return current.promise;
      if (command === "cancel_maest_analysis") current.reject({ code: "analysis_cancelled" });
      return null;
    });
    const running = batch.orchestrator.run(); await Promise.resolve(); await Promise.resolve();
    const operationId = batch.orchestrator.snapshot().currentOperationId;
    await batch.orchestrator.cancel(); await running;
    const cancelRequest = batch.invoke.mock.calls.find(([command]) => command === "cancel_maest_analysis")?.[1] as { request: { operationId: string } };
    expect(cancelRequest.request.operationId).toBe(operationId);
    expect(batch.orchestrator.snapshot().items.map((item) => item.status)).toEqual(["cancelled", "cancelled"]);
  });

  it("cancels model preparation visibly without touching native analysis operations", async () => {
    const preparation = deferred<unknown>();
    const settling: boolean[] = [];
    const invoke = vi.fn(async (command: string) => command === "prepare_maest_model" ? preparation.promise : null);
    const batch = new MaestBatchOrchestrator({ core: { invoke } as TauriCore, tracks: [track("a"), track("b")], getTrackLink: linked, includeAnalyzed: false, locale: "en", onState: () => {}, onPreparationSettlingChange: (value) => settling.push(value) });
    const running = batch.run(); await Promise.resolve(); await batch.cancel();
    expect(batch.snapshot()).toMatchObject({ phase: "cancelled", cancelRequested: true });
    expect(batch.snapshot().items.map((item) => item.status)).toEqual(["cancelled", "cancelled"]);
    expect(settling).toEqual([true]);
    expect(maestBatchActionDisabled(2, false, settling.at(-1))).toBe(true);
    expect(invoke.mock.calls.some(([command]) => command === "cancel_maest_analysis" || command === "release_maest_analysis")).toBe(false);
    preparation.resolve(null); await running;
    expect(settling).toEqual([true, false]);
    expect(maestBatchActionDisabled(2, false, settling.at(-1))).toBe(false);
    expect(invoke.mock.calls.some(([command]) => command === "begin_maest_analysis")).toBe(false);
    expect(invoke.mock.calls.some(([command]) => command === "analyze_scanned_track")).toBe(false);
  });

  it("unmount during model preparation cancels pending work and ignores its late result", async () => {
    const preparation = deferred<unknown>();
    const invoke = vi.fn(async (command: string) => command === "prepare_maest_model" ? preparation.promise : null);
    const batch = new MaestBatchOrchestrator({ core: { invoke } as TauriCore, tracks: [track("a")], getTrackLink: linked, includeAnalyzed: false, locale: "en", onState: () => {} });
    const running = batch.run(); await Promise.resolve(); batch.dispose();
    expect(batch.snapshot().phase).toBe("cancelled");
    expect(batch.snapshot().items[0].status).toBe("cancelled");
    preparation.resolve(null); await running;
    expect(invoke.mock.calls.some(([command]) => command === "begin_maest_analysis" || command === "analyze_scanned_track" || command === "cancel_maest_analysis" || command === "release_maest_analysis")).toBe(false);
  });

  it("creates retry batches with only failed tracks as eligible", () => {
    const retried = setup([track("failed-a"), track("failed-b")]);
    expect(retried.orchestrator.snapshot().eligibleTotal).toBe(2);
  });

  it("disposal during analysis prevents late results and further tracks", async () => {
    const late = deferred<MaestPublicResult>(); const disposed = setup([track("a"), track("b")], async (command) => command === "analyze_scanned_track" ? late.promise : null);
    const lateRun = disposed.orchestrator.run(); await Promise.resolve(); await Promise.resolve(); disposed.orchestrator.dispose(); late.resolve(result); await lateRun;
    expect(disposed.invoke.mock.calls.filter(([command]) => command === "analyze_scanned_track")).toHaveLength(1);
    expect(disposed.orchestrator.snapshot().items[0].status).toBe("analyzing");
  });
});
