import { afterEach, describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { TauriCore } from "./tauri";
import {
  applyMaestFormProposal,
  editMaestFormField,
  invokeMaestPreview,
  invokeMaestCancel,
  invokeMaestProgress,
  startMaestProgressPolling,
  cleanupMaestPreviewOperation,
  isMaestCancellation,
  initialTrackClassification,
  isCurrentMaestRequest,
  maestAnalyzeArguments,
  maestProgressArguments,
  maestProgressText,
  maestPollingRequest,
  maestErrorMessage,
  maestGenreWriteArguments,
  maestGenreWriteAvailability,
  invokeMaestGenreWritePreview,
  invokeMaestSubgenreWritePreview,
  maestSubgenreWriteArguments,
  maestSubgenreWriteAvailability,
  metadataWriteErrorMessage,
  maestFormProposal,
  maestSurfaceVisibility,
  createMaestPreviewState,
  reduceMaestPreviewState,
  type MaestLinkIdentity,
  type MaestPreviewState,
  type MaestPublicResult,
} from "./maest-preview";
import {
  DESKTOP_MAEST_ANALYZER,
  DESKTOP_MAEST_COMPATIBILITY_KEY,
  DESKTOP_MAEST_LEGACY_COMPATIBILITY_KEY,
} from "./maest-analysis";

const publicResult: MaestPublicResult = {
  scanId: "scan-opaque",
  analysis: {
    analyzer: DESKTOP_MAEST_ANALYZER,
    compatibilityKey: DESKTOP_MAEST_COMPATIBILITY_KEY,
    partialErrors: [],
    genre: { field: "genre", status: "completed", source: "automatic", proposedValue: "Electronic", score: 0.812345, analyzedAt: "1785542400000" },
    subgenre: { field: "subgenre", status: "completed", source: "automatic", proposedValue: "Techno", score: 0.712345, analyzedAt: "1785542400000" },
  },
};

function coreReturning(result = publicResult) {
  const invoke = vi.fn(async (command: string) => command === "analyze_scanned_track" ? result : { ready: true });
  return { core: { invoke } as TauriCore, invoke };
}

const link: MaestLinkIdentity = {
  trackId: "track-opaque",
  sessionId: "session-opaque",
  scanId: "scan-opaque",
};

function deferred<T>() {
  let resolve!: (value: T) => void;
  let reject!: (reason?: unknown) => void;
  const promise = new Promise<T>((resolvePromise, rejectPromise) => {
    resolve = resolvePromise;
    reject = rejectPromise;
  });
  return { promise, reject, resolve };
}

afterEach(() => vi.useRealTimers());

function start(state: MaestPreviewState, requestId = 1) {
  return reduceMaestPreviewState(state, { type: "start", requestId });
}

function prepared(state: MaestPreviewState) {
  const starting = reduceMaestPreviewState(state, {
    type: "prepared",
    request: state.activeRequest!,
  });
  return reduceMaestPreviewState(starting, {
    type: "armed",
    request: starting.activeRequest!,
  });
}

function succeeded(state: MaestPreviewState, result = publicResult) {
  return reduceMaestPreviewState(state, {
    type: "succeeded",
    request: state.activeRequest!,
    result,
  });
}

describe("MAEST preview UI state controller", () => {
  it("hides the complete surface without the Tauri bridge", () => {
    expect(maestSurfaceVisibility(false, null)).toBe("hidden");
    expect(maestSurfaceVisibility(false, link)).toBe("hidden");
  });

  it("shows the linking state in Tauri for an unlinked track", () => {
    expect(maestSurfaceVisibility(true, null)).toBe("unlinked");
  });

  it("shows the analysis action in Tauri for a linked track", () => {
    expect(maestSurfaceVisibility(true, link)).toBe("linked");
  });

  it("does not start without a local link", () => {
    const state = createMaestPreviewState(null);
    expect(start(state)).toBe(state);
    expect(state.activeRequest).toBeNull();
  });

  it("starts a linked track in preparing state", () => {
    const state = start(createMaestPreviewState(link));
    expect(state.phase).toBe("preparing");
    expect(state.activeRequest).toEqual({ ...link, requestId: 1, operationId: expect.stringMatching(/^[0-9a-f-]{36}$/) });
  });

  it("accepts only one start while busy", () => {
    const first = start(createMaestPreviewState(link), 1);
    const second = start(first, 2);
    expect(second).toBe(first);
    expect(second.activeRequest?.requestId).toBe(1);
  });

  it("is not cancellable until native begin has armed the active request", () => {
    const preparing = start(createMaestPreviewState(link));
    const starting = reduceMaestPreviewState(preparing, {
      type: "prepared",
      request: preparing.activeRequest!,
    });
    expect(starting.phase).toBe("starting");
    expect(reduceMaestPreviewState(starting, {
      type: "cancelRequested",
      request: starting.activeRequest!,
    })).toBe(starting);
    expect(reduceMaestPreviewState(starting, {
      type: "armed",
      request: starting.activeRequest!,
    }).phase).toBe("analyzing");
  });

  it("enters cancelling once and preserves an earlier proposal after cancellation", () => {
    const previous = succeeded(prepared(start(createMaestPreviewState(link))));
    const active = prepared(start(previous, 2));
    const request = active.activeRequest!;
    const cancelling = reduceMaestPreviewState(active, { type: "cancelRequested", request });
    expect(cancelling.phase).toBe("cancelling");
    expect(reduceMaestPreviewState(cancelling, { type: "cancelRequested", request })).toBe(cancelling);
    const cancelled = reduceMaestPreviewState(cancelling, { type: "cancelled", request });
    expect(cancelled.phase).toBe("idle");
    expect(cancelled.proposal).toBe(publicResult);
    expect(cancelled.error).toBeNull();
  });

  it("stores a successful proposal and returns to idle", () => {
    const state = succeeded(prepared(start(createMaestPreviewState(link))));
    expect(state.phase).toBe("idle");
    expect(state.proposal).toBe(publicResult);
    expect(state.activeRequest).toBeNull();
  });

  it("finishing analysis only stores a proposal and does not change form fields", () => {
    const fields = { genre: "House manual", subgenre: "Deep manual" };
    const state = succeeded(prepared(start(createMaestPreviewState(link))));
    expect(fields).toEqual({ genre: "House manual", subgenre: "Deep manual" });
    expect(maestFormProposal(state.proposal)?.genre?.value).toBe("Electronic");
    expect(maestFormProposal(state.proposal)?.subgenre?.value).toBe("Techno");
  });

  it("applies both proposed fields only after the explicit merge", () => {
    const proposal = maestFormProposal(publicResult);
    expect(proposal).not.toBeNull();
    expect(
      applyMaestFormProposal(
        { genre: "House manual", subgenre: "Deep manual", evidence: {} },
        proposal!,
      ),
    ).toMatchObject({ genre: "Electronic", subgenre: "Techno" });
  });

  it("does not erase manual values with null, missing or blank proposals", () => {
    const incomplete = {
      ...publicResult,
      analysis: {
        ...publicResult.analysis,
        genre: { ...publicResult.analysis.genre, proposedValue: null },
        subgenre: { ...publicResult.analysis.subgenre, proposedValue: "  " },
      },
    };
    expect(maestFormProposal(incomplete)).toBeNull();
    expect(
      applyMaestFormProposal(
        { genre: "House manual", subgenre: "Deep manual", evidence: {} },
        { genre: null, subgenre: { ...maestFormProposal(publicResult)!.subgenre!, value: "Tech House" } },
      ),
    ).toMatchObject({ genre: "House manual", subgenre: "Tech House" });
  });

  it("keeps applied fields independent from later analysis and discard state", () => {
    const fields = applyMaestFormProposal(
      { genre: "House manual", subgenre: "Deep manual", evidence: {} },
      maestFormProposal(publicResult)!,
    );
    const analyzedAgain = start(succeeded(start(createMaestPreviewState(link))), 2);
    const discarded = reduceMaestPreviewState(analyzedAgain, { type: "discard" });
    expect(fields).toMatchObject({ genre: "Electronic", subgenre: "Techno" });
    expect(discarded.proposal).toBeNull();
  });

  it("invalidates evidence per manually edited field and only explicit apply restores it", () => {
    const applied = applyMaestFormProposal(
      { genre: "House", subgenre: "Deep House", evidence: {} },
      maestFormProposal(publicResult)!,
    );
    const genreEdited = editMaestFormField(applied, "genre", "House");
    expect(genreEdited.evidence.genre).toBeUndefined();
    expect(genreEdited.evidence.subgenre?.value).toBe("Techno");
    const typedBack = editMaestFormField(genreEdited, "genre", "Electronic");
    expect(typedBack.evidence.genre).toBeUndefined();
    expect(applyMaestFormProposal(typedBack, maestFormProposal(publicResult)!).evidence.genre?.value).toBe("Electronic");
  });

  it("reset and track initialization contain no ephemeral MAEST evidence", () => {
    const applied = applyMaestFormProposal(
      initialTrackClassification("update", "House", "Deep House"),
      maestFormProposal(publicResult)!,
    );
    expect(applied.evidence.genre).toBeDefined();
    expect(initialTrackClassification("update", "House", "Deep House").evidence).toEqual({});
    expect(initialTrackClassification("update", "Rock", "Indie").evidence).toEqual({});
  });

  it("resets create classification fields to their initial empty values", () => {
    const initial = initialTrackClassification("create");
    const changed = applyMaestFormProposal(initial, {
      genre: maestFormProposal(publicResult)!.genre,
      subgenre: maestFormProposal(publicResult)!.subgenre,
    });

    expect(initial).toEqual({ genre: "", subgenre: "", evidence: {} });
    expect(changed).toMatchObject({ genre: "Electronic", subgenre: "Techno" });
    expect(initialTrackClassification("create")).toEqual({
      genre: "",
      subgenre: "",
      evidence: {},
    });
  });

  it("resets update classification fields to the persisted track values", () => {
    const persisted = { genre: "House", subgenre: "Deep House" };
    const initial = initialTrackClassification(
      "update",
      persisted.genre,
      persisted.subgenre,
    );
    const changed = applyMaestFormProposal(initial, {
      genre: maestFormProposal(publicResult)!.genre,
      subgenre: maestFormProposal(publicResult)!.subgenre,
    });

    expect(initial).toMatchObject(persisted);
    expect(changed).toMatchObject({ genre: "Electronic", subgenre: "Techno" });
    expect(
      initialTrackClassification("update", persisted.genre, persisted.subgenre),
    ).toMatchObject(persisted);
  });

  it("discards the current proposal", () => {
    const proposed = succeeded(start(createMaestPreviewState(link)));
    const discarded = reduceMaestPreviewState(proposed, { type: "discard" });
    expect(discarded.proposal).toBeNull();
  });

  it("a new successful analysis replaces the previous proposal", () => {
    const old = succeeded(start(createMaestPreviewState(link)));
    const replacement = {
      ...publicResult,
      analysis: {
        ...publicResult.analysis,
        genre: { ...publicResult.analysis.genre, proposedValue: "Rock", score: 0.4 },
      },
    };
    const next = succeeded(start(old, 2), replacement);
    expect(next.proposal).toBe(replacement);
    expect(next.proposal).not.toBe(publicResult);
  });

  it("a safe error clears an older proposal", () => {
    const old = succeeded(start(createMaestPreviewState(link)));
    const active = start(old, 2);
    const failed = reduceMaestPreviewState(active, {
      type: "failed",
      request: active.activeRequest!,
      error: "El analizador está ocupado. Reinténtalo.",
    });
    expect(failed.proposal).toBeNull();
    expect(failed.error).toContain("ocupado");
  });

  it.each([
    ["trackId", { ...link, trackId: "track-new" }],
    ["sessionId", { ...link, sessionId: "session-new" }],
    ["scanId", { ...link, scanId: "scan-new" }],
  ] as const)("a %s change invalidates the request and proposal", (_field, identity) => {
    const proposed = succeeded(start(createMaestPreviewState(link)));
    const active = start(proposed, 2);
    const changed = reduceMaestPreviewState(active, { type: "linkChanged", identity });
    expect(changed.identity).toEqual(identity);
    expect(changed.proposal).toBeNull();
    expect(changed.activeRequest).toBeNull();
    expect(changed.phase).toBe("idle");
  });

  it("ignores a response from an older requestId", () => {
    const active = start(createMaestPreviewState(link), 2);
    const stale = reduceMaestPreviewState(active, {
      type: "succeeded",
      request: { ...active.activeRequest!, requestId: 1 },
      result: publicResult,
    });
    expect(stale).toBe(active);
    expect(stale.proposal).toBeNull();
  });

  it("ignores a result carrying another scanId", () => {
    const active = start(createMaestPreviewState(link));
    const stale = reduceMaestPreviewState(active, {
      type: "succeeded",
      request: active.activeRequest!,
      result: { ...publicResult, scanId: "scan-other" },
    });
    expect(stale).toBe(active);
  });

  it("never applies a stale response to the current track", () => {
    const old = start(createMaestPreviewState(link));
    const current = reduceMaestPreviewState(old, {
      type: "linkChanged",
      identity: { ...link, trackId: "track-current" },
    });
    const stale = reduceMaestPreviewState(current, {
      type: "succeeded",
      request: old.activeRequest!,
      result: publicResult,
    });
    expect(stale).toBe(current);
    expect(stale.proposal).toBeNull();
    expect(stale.identity?.trackId).toBe("track-current");
  });

  it("the real components expose only an explicit, non-submitting form application", () => {
    const component = readFileSync(
      fileURLToPath(new URL("../../components/library/maest-preview.tsx", import.meta.url)),
      "utf8",
    );
    const form = readFileSync(
      fileURLToPath(new URL("../../components/library/track-form.tsx", import.meta.url)),
      "utf8",
    );
    expect(component).toContain("Analizar pista");
    expect(component).not.toContain("Analizar localmente");
    expect(component).toContain("Preparando analizador…");
    expect(component).toContain("Analizando pista…");
    expect(component).toContain("Volver a analizar");
    expect(component).toContain("Descartar propuesta");
    expect(component).toContain("Aplicar al formulario");
    expect(component).toContain("Revísala antes de guardar los cambios.");
    expect(component).toMatch(/formProposal \|\| nativeProposal \? \([\s\S]*Aplicar al formulario/);
    expect(component).toMatch(/onClick=\{applyToForm\} type="button"/);
    expect(component).not.toMatch(/document\.|querySelector|requestSubmit|type="submit"/);
    expect(component).toContain("setDesktopAvailable(Boolean(getTauriCore()))");
    expect(component).toContain('if (surface === "hidden") return null');
    expect(component).not.toMatch(/<dt>Score<\/dt>|0\.812345/);
    expect(component).not.toMatch(/Guardar propuesta|Escribir etiquetas|supabase|updateTrackAction/);
    expect(form).toContain("value={classification.genre}");
    expect(form).toContain("value={classification.subgenre}");
    expect(form).toContain("applyMaestFormProposal(current, proposal)");
    expect(form).toContain("onReset={resetClassification}");
    expect(form).toContain("initialTrackClassification(mode, track?.genre, track?.subgenre)");
    expect(form).toMatch(/<MaestPreview[\s\S]*formGenre=\{classification\.genre\}[\s\S]*onApply=\{applyMaestProposal\}[\s\S]*track=\{track\}[\s\S]*\/>/);
    expect(form).toMatch(/<SaveButton mode=\{mode\} \/>/);
    expect(form).toContain('mode === "create" ? createTrackAction : updateTrackAction');
    expect(form).not.toMatch(/document\.|querySelector/);
  });
});

describe("MAEST library preview contract", () => {
  it("offers file writing only for persisted automatic MAEST genre evidence", () => {
    const track = {
      genre: "Electronic",
      genre_source: "automatic",
      genre_analyzer_id: DESKTOP_MAEST_ANALYZER.id,
      genre_analyzer_version: DESKTOP_MAEST_ANALYZER.version,
      genre_compatibility_key: DESKTOP_MAEST_COMPATIBILITY_KEY,
      genre_analyzed_at_ms: 1785542400000,
      genre_raw_score: 0.8,
    } as Parameters<typeof maestGenreWriteAvailability>[0];
    expect(maestGenreWriteAvailability(track, "Electronic", true)).toBe("available");
    expect(maestGenreWriteAvailability({
      ...track,
      genre_compatibility_key: DESKTOP_MAEST_LEGACY_COMPATIBILITY_KEY,
    }, "Electronic", true)).toBe("available");
    expect(maestGenreWriteAvailability({
      ...track,
      genre_compatibility_key: "arbitrary",
    }, "Electronic", true)).toBe("unavailable");
    expect(maestGenreWriteAvailability(track, "House", true)).toBe("needs-save");
    expect(maestGenreWriteAvailability({ ...track, genre_source: "manual" }, "Electronic", true)).toBe("unavailable");
    expect(maestGenreWriteAvailability({ ...track, genre_raw_score: null }, "Electronic", true)).toBe("unavailable");
    expect(maestGenreWriteAvailability(track, "Electronic", false)).toBe("unavailable");
  });

  it("previews a genre write with only sessionId, scanId and genre", async () => {
    const preview = { scanId: "scan", field: "genre" as const, before: "House", after: "Electronic", changed: true };
    const invoke = vi.fn(async () => preview);
    await expect(invokeMaestGenreWritePreview({ invoke } as TauriCore, "session", "scan", "Electronic")).resolves.toEqual(preview);
    expect(invoke).toHaveBeenCalledWith("preview_maest_genre_write", {
      request: { sessionId: "session", scanId: "scan", genre: "Electronic" },
    });
    expect(Object.keys(maestGenreWriteArguments("s", "x", "g").request)).toEqual(["sessionId", "scanId", "genre"]);
    expect(JSON.stringify(preview)).not.toMatch(/path|subgenre|score|analyzer/i);
  });

  it("offers and previews an independent persisted MAEST subgenre write", async () => {
    const track = {
      subgenre: "Deep House",
      subgenre_source: "automatic",
      subgenre_analyzer_id: DESKTOP_MAEST_ANALYZER.id,
      subgenre_analyzer_version: DESKTOP_MAEST_ANALYZER.version,
      subgenre_compatibility_key: DESKTOP_MAEST_COMPATIBILITY_KEY,
      subgenre_analyzed_at_ms: 1785542400000,
      subgenre_raw_score: 0.8,
    } as Parameters<typeof maestSubgenreWriteAvailability>[0];
    expect(maestSubgenreWriteAvailability(track, "Deep House", true)).toBe("available");
    expect(maestSubgenreWriteAvailability(track, "Tech House", true)).toBe("needs-save");
    expect(maestSubgenreWriteAvailability({ ...track, subgenre_source: "manual" }, "Deep House", true)).toBe("unavailable");
    const preview = { scanId: "scan", field: "subgenre" as const, before: null, after: "Deep House", changed: true };
    const invoke = vi.fn(async () => preview);
    await expect(invokeMaestSubgenreWritePreview({ invoke } as TauriCore, "session", "scan", "Deep House")).resolves.toEqual(preview);
    expect(invoke).toHaveBeenCalledWith("preview_maest_subgenre_write", {
      request: { sessionId: "session", scanId: "scan", subgenre: "Deep House" },
    });
    expect(Object.keys(maestSubgenreWriteArguments("s", "x", "sg").request)).toEqual(["sessionId", "scanId", "subgenre"]);
    expect(Object.keys(preview)).toEqual(["scanId", "field", "before", "after", "changed"]);
    expect(JSON.stringify(preview)).not.toMatch(/path|genreRaw|score|analyzer/i);
  });

  it("maps a missing native preview to a safe recovery message", () => {
    const message = metadataWriteErrorMessage(
      { code: "preview_required", message: "C:\\private\\song.flac fingerprint" },
      "es",
    );
    expect(message).toContain("Previsualiza de nuevo");
    expect(message).not.toMatch(/private|song|fingerprint|\\/i);
  });

  it("maps local link persistence failures without exposing file details", () => {
    const message = metadataWriteErrorMessage(
      { code: "link_state_failed", message: "C:\\private\\library-file-aliases.json" },
      "en",
    );
    expect(message).toContain("local link");
    expect(message).not.toMatch(/private|aliases|\\/i);
  });

  it("prepares only after the explicit invocation and then analyzes", async () => {
    const { core, invoke } = coreReturning();
    expect(invoke).not.toHaveBeenCalled();
    const prepared = vi.fn(() => true);
    await expect(invokeMaestPreview(core, "session-opaque", "scan-opaque", "00000000-0000-4000-8000-000000000001", prepared, () => true)).resolves.toEqual(publicResult);
    expect(invoke.mock.calls.map(([command]) => command)).toEqual(["prepare_maest_model", "begin_maest_analysis", "analyze_scanned_track"]);
    expect(prepared).toHaveBeenCalledOnce();
  });

  it("sends only opaque sessionId, scanId and operationId in the native analysis request", async () => {
    const { core, invoke } = coreReturning();
    await invokeMaestPreview(core, "session-opaque", "scan-opaque", "00000000-0000-4000-8000-000000000001", () => true, () => true);
    expect(invoke).toHaveBeenLastCalledWith("analyze_scanned_track", {
      request: { sessionId: "session-opaque", scanId: "scan-opaque", operationId: "00000000-0000-4000-8000-000000000001" },
    });
    expect(Object.keys(maestAnalyzeArguments("s", "t", "o").request)).toEqual(["sessionId", "scanId", "operationId"]);
  });

  it("queries progress with only the exact opaque operation identity", async () => {
    const { core, invoke } = coreReturning();
    const request = { ...link, requestId: 7, operationId: "00000000-0000-4000-8000-000000000007" };
    await invokeMaestProgress(core, request);
    expect(invoke).toHaveBeenLastCalledWith("get_maest_analysis_progress", {
      request: { sessionId: link.sessionId, scanId: link.scanId, operationId: request.operationId },
    });
    expect(Object.keys(maestProgressArguments("s", "t", "o").request)).toEqual(["sessionId", "scanId", "operationId"]);
    expect(JSON.stringify(maestProgressArguments("s", "t", "o"))).not.toMatch(/path|duration|offset|audio|tensor/i);
  });

  it("accepts progress only for the exact active request and clears it on reanalysis", () => {
    const active = prepared(start(createMaestPreviewState(link)));
    const request = active.activeRequest!;
    const progress = { phase: "preparing", totalWindows: 3, preparedWindows: 1, inferredWindows: 0 } as const;
    const updated = reduceMaestPreviewState(active, { type: "progress", request, progress });
    expect(updated.progress).toEqual(progress);
    expect(reduceMaestPreviewState(updated, { type: "progress", request: { ...request, operationId: "stale" }, progress })).toBe(updated);
    const completed = succeeded(updated);
    expect(start(completed, 2).progress).toBeNull();
  });

  it("renders structural progress in Spanish and English, including fallback 3 to 1", () => {
    expect(maestProgressText({ phase: "preparing", totalWindows: 3, preparedWindows: 0, inferredWindows: 0 }, "es")).toBe("Preparando audio 1 de 3…");
    expect(maestProgressText({ phase: "inference", totalWindows: 3, preparedWindows: 3, inferredWindows: 1 }, "en")).toBe("Analyzing window 2 of 3…");
    expect(maestProgressText({ phase: "preparing", totalWindows: 1, preparedWindows: 1, inferredWindows: 0 }, "en")).toBe("Preparing audio 1 of 1…");
    expect(maestProgressText({ phase: "finalizing", totalWindows: 1, preparedWindows: 1, inferredWindows: 1 }, "es")).toBe("Finalizando análisis…");
  });

  describe("sequential progress polling", () => {
    const progress = { phase: "preparing", totalWindows: 3, preparedWindows: 1, inferredWindows: 0 } as const;
    const request = { ...link, requestId: 8, operationId: "00000000-0000-4000-8000-000000000008" };

    it("starts immediately, waits for settlement and keeps exactly one request in flight", async () => {
      vi.useFakeTimers();
      const first = deferred<typeof progress | null>();
      const second = deferred<typeof progress | null>();
      const third = deferred<typeof progress | null>();
      const invoke = vi.fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise)
        .mockImplementationOnce(() => third.promise);
      const onProgress = vi.fn();
      const stop = startMaestProgressPolling({ invoke } as TauriCore, request, onProgress);

      expect(invoke).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(invoke).toHaveBeenCalledOnce();

      first.resolve(progress);
      await Promise.resolve();
      expect(onProgress).toHaveBeenCalledWith(progress);
      await vi.advanceTimersByTimeAsync(249);
      expect(invoke).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      expect(invoke).toHaveBeenCalledTimes(2);
      await vi.advanceTimersByTimeAsync(1_000);
      expect(invoke).toHaveBeenCalledTimes(2);

      second.resolve(progress);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(250);
      expect(invoke).toHaveBeenCalledTimes(3);
      stop();
    });

    it("continues after an isolated progress rejection", async () => {
      vi.useFakeTimers();
      const first = deferred<typeof progress | null>();
      const second = deferred<typeof progress | null>();
      const invoke = vi.fn()
        .mockImplementationOnce(() => first.promise)
        .mockImplementationOnce(() => second.promise);
      const stop = startMaestProgressPolling({ invoke } as TauriCore, request, vi.fn());
      first.reject(new Error("progress unavailable"));
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(249);
      expect(invoke).toHaveBeenCalledOnce();
      await vi.advanceTimersByTimeAsync(1);
      expect(invoke).toHaveBeenCalledTimes(2);
      stop();
    });

    it("stop cancels a pending timeout", async () => {
      vi.useFakeTimers();
      const invoke = vi.fn().mockResolvedValue(progress);
      const stop = startMaestProgressPolling({ invoke } as TauriCore, request, vi.fn());
      await Promise.resolve();
      stop();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(invoke).toHaveBeenCalledOnce();
    });

    it("stop during an in-flight read suppresses its callback and every later read", async () => {
      vi.useFakeTimers();
      const pending = deferred<typeof progress | null>();
      const invoke = vi.fn(() => pending.promise);
      const onProgress = vi.fn();
      const stop = startMaestProgressPolling({ invoke } as TauriCore, request, onProgress);
      stop();
      pending.resolve(progress);
      await Promise.resolve();
      await vi.advanceTimersByTimeAsync(1_000);
      expect(onProgress).not.toHaveBeenCalled();
      expect(invoke).toHaveBeenCalledOnce();
    });

    it("keeps replacement operation polling independent from a stopped stale operation", async () => {
      vi.useFakeTimers();
      const oldPending = deferred<typeof progress | null>();
      const newPending = deferred<typeof progress | null>();
      const oldInvoke = vi.fn((command: string, args: unknown) => {
        void command;
        void args;
        return oldPending.promise;
      });
      const newInvoke = vi.fn((command: string, args: unknown) => {
        void command;
        void args;
        return newPending.promise;
      });
      const oldProgress = vi.fn();
      const newProgress = vi.fn();
      const stopOld = startMaestProgressPolling({ invoke: oldInvoke } as TauriCore, request, oldProgress);
      stopOld();
      const newRequest = { ...request, operationId: "00000000-0000-4000-8000-000000000009" };
      const stopNew = startMaestProgressPolling({ invoke: newInvoke } as TauriCore, newRequest, newProgress);

      oldPending.resolve(progress);
      newPending.resolve(progress);
      await Promise.resolve();
      expect(oldProgress).not.toHaveBeenCalled();
      expect(newProgress).toHaveBeenCalledWith(progress);
      expect(oldInvoke.mock.calls[0]?.[1]).toEqual({ request: expect.objectContaining({ operationId: request.operationId }) });
      expect(newInvoke.mock.calls[0]?.[1]).toEqual({ request: expect.objectContaining({ operationId: newRequest.operationId }) });
      stopNew();
    });

    it("stops eligibility on cancelling, success and analysis error", () => {
      const analyzing = prepared(start(createMaestPreviewState(link)));
      const request = analyzing.activeRequest!;
      expect(maestPollingRequest(analyzing)).toEqual(request);
      expect(maestPollingRequest(reduceMaestPreviewState(analyzing, { type: "cancelRequested", request }))).toBeNull();
      expect(maestPollingRequest(reduceMaestPreviewState(analyzing, { type: "succeeded", request, result: publicResult }))).toBeNull();
      expect(maestPollingRequest(reduceMaestPreviewState(analyzing, { type: "failed", request, error: "safe" }))).toBeNull();
    });

    it("uses stop as unmount cleanup", async () => {
      vi.useFakeTimers();
      const pending = deferred<typeof progress | null>();
      const invoke = vi.fn(() => pending.promise);
      const onProgress = vi.fn();
      const unmount = startMaestProgressPolling({ invoke } as TauriCore, request, onProgress);
      unmount();
      pending.resolve(progress);
      await Promise.resolve();
      await vi.runAllTimersAsync();
      expect(invoke).toHaveBeenCalledOnce();
      expect(onProgress).not.toHaveBeenCalled();
    });
  });

  it("releases an armed operation and skips stale analysis after identity changes", async () => {
    const { core, invoke } = coreReturning();
    await expect(invokeMaestPreview(
      core,
      "session-opaque",
      "scan-opaque",
      "00000000-0000-4000-8000-000000000004",
      () => true,
      () => false,
    )).resolves.toBeNull();
    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      "prepare_maest_model",
      "begin_maest_analysis",
      "release_maest_analysis",
    ]);
  });

  it("releases a begin that finishes after unmount without invoking analysis", async () => {
    let resolveBegin!: () => void;
    const begin = new Promise<void>((resolve) => { resolveBegin = resolve; });
    let mounted = true;
    const invoke = vi.fn(async (command: string) => {
      if (command === "begin_maest_analysis") await begin;
      if (command === "analyze_scanned_track") return publicResult;
      return { ready: true };
    });
    const pending = invokeMaestPreview(
      { invoke } as TauriCore,
      "session-opaque",
      "scan-opaque",
      "00000000-0000-4000-8000-000000000005",
      () => mounted,
      () => mounted,
    );
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledWith("begin_maest_analysis", expect.anything()));
    mounted = false;
    resolveBegin();
    await expect(pending).resolves.toBeNull();
    expect(invoke.mock.calls.map(([command]) => command)).toEqual([
      "prepare_maest_model",
      "begin_maest_analysis",
      "release_maest_analysis",
    ]);
  });

  it.each([
    ["starting", "release_maest_analysis"],
    ["analyzing", "cancel_maest_analysis"],
    ["cancelling", "cancel_maest_analysis"],
  ] as const)("cleans up %s on unmount or identity change", async (phase, command) => {
    const { core, invoke } = coreReturning();
    const active = prepared(start(createMaestPreviewState(link)));
    cleanupMaestPreviewOperation(core, { ...active, phase });
    await vi.waitFor(() => expect(invoke).toHaveBeenCalledOnce());
    expect(invoke).toHaveBeenCalledWith(command, {
      request: {
        sessionId: link.sessionId,
        scanId: link.scanId,
        operationId: active.activeRequest!.operationId,
      },
    });
  });

  it("does nothing on unmount while preparing or idle", () => {
    const { core, invoke } = coreReturning();
    cleanupMaestPreviewOperation(core, start(createMaestPreviewState(link)));
    cleanupMaestPreviewOperation(core, createMaestPreviewState(link));
    expect(invoke).not.toHaveBeenCalled();
  });

  it("cancels with exactly the active opaque identity and recognizes the expected error", async () => {
    const { core, invoke } = coreReturning();
    const request = { ...link, requestId: 3, operationId: "00000000-0000-4000-8000-000000000003" };
    await invokeMaestCancel(core, request);
    expect(invoke).toHaveBeenLastCalledWith("cancel_maest_analysis", {
      request: { sessionId: link.sessionId, scanId: link.scanId, operationId: request.operationId },
    });
    expect(isMaestCancellation({ code: "analysis_cancelled", message: "private details" })).toBe(true);
    expect(isMaestCancellation({ code: "decode_failed" })).toBe(false);
  });

  it("has no persistence, Supabase, metadata or tag-writing call", async () => {
    const { core, invoke } = coreReturning();
    await invokeMaestPreview(core, "session-opaque", "scan-opaque", "00000000-0000-4000-8000-000000000001", () => true, () => true);
    const commands = invoke.mock.calls.map(([command]) => command);
    expect(commands).toEqual(["prepare_maest_model", "begin_maest_analysis", "analyze_scanned_track"]);
    expect(commands.join(" ")).not.toMatch(/save|update|supabase|metadata|tag|write/i);
  });

  it("exposes only the public result without audio, paths, tensors, scores arrays or model location", () => {
    const serialized = JSON.stringify(publicResult);
    expect(serialized).not.toMatch(/absolutePath|relativePath|path|pcm|audio|tensor|scores|modelLocation/i);
    expect(publicResult.analysis.genre.score).toBe(0.812345);
    expect(publicResult.analysis.genre.score?.toString()).not.toContain("%");
  });

  it("creates compact field evidence without local or request identities", () => {
    const serialized = JSON.stringify(maestFormProposal(publicResult));
    expect(serialized).toContain("rawScore");
    expect(serialized).not.toMatch(/sessionId|scanId|trackId|path|file|audio|pcm|tensor|scores/i);
  });

  it("rejects stale responses after track, session, scan or request changes", () => {
    const request = { requestId: 1, trackId: "track-a", sessionId: "session-a", scanId: "scan-a", operationId: "operation-a" };
    expect(isCurrentMaestRequest(request, request)).toBe(true);
    expect(isCurrentMaestRequest(request, { ...request, trackId: "track-b" })).toBe(false);
    expect(isCurrentMaestRequest(request, { ...request, sessionId: "session-b" })).toBe(false);
    expect(isCurrentMaestRequest(request, { ...request, scanId: "scan-b" })).toBe(false);
    expect(isCurrentMaestRequest(request, { ...request, requestId: 2 })).toBe(false);
  });

  it.each([
    ["analyzer_busy", "ocupado"],
    ["model_not_ready", "preparar"],
    ["track_changed", "cambiado"],
    ["track_unavailable", "disponible"],
    ["scan_session_unavailable", "activo"],
    ["track_not_in_session", "disponible"],
    ["analysis_task_failed", "interrumpió"],
  ])("maps %s to a short safe retry/recovery message", (code, expected) => {
    const message = maestErrorMessage({ code, message: "C:\\private\\song.flac stack tensor PCM" }, "es");
    expect(message).toContain(expected);
    expect(message).not.toMatch(/private|song|stack|tensor|PCM|\\/i);
  });

  it.each(["decode", "resample", "preprocess", "inference", "taxonomy"])(
    "preserves safe stage-specific behavior for %s",
    (stage) => {
      const message = maestErrorMessage({ code: "internal", stage, message: "519 scores at C:\\secret" }, "es");
      expect(message.length).toBeGreaterThan(10);
      expect(message).not.toMatch(/519|secret|score|runtime|\\/i);
    },
  );
});
