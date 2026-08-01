import { describe, expect, it, vi } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import type { TauriCore } from "./tauri";
import {
  invokeMaestPreview,
  isCurrentMaestRequest,
  maestAnalyzeArguments,
  maestErrorMessage,
  createMaestPreviewState,
  reduceMaestPreviewState,
  type MaestLinkIdentity,
  type MaestPreviewState,
  type MaestPublicResult,
} from "./maest-preview";
import {
  DESKTOP_MAEST_ANALYZER,
  DESKTOP_MAEST_COMPATIBILITY_KEY,
} from "./maest-analysis";

const publicResult: MaestPublicResult = {
  scanId: "scan-opaque",
  analysis: {
    analyzer: DESKTOP_MAEST_ANALYZER,
    compatibilityKey: DESKTOP_MAEST_COMPATIBILITY_KEY,
    partialErrors: [],
    genre: { field: "genre", status: "completed", source: "automatic", proposedValue: "Electronic", score: 0.812345 },
    subgenre: { field: "subgenre", status: "completed", source: "automatic", proposedValue: "Techno", score: 0.812345 },
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

function start(state: MaestPreviewState, requestId = 1) {
  return reduceMaestPreviewState(state, { type: "start", requestId });
}

function prepared(state: MaestPreviewState) {
  return reduceMaestPreviewState(state, {
    type: "prepared",
    request: state.activeRequest!,
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
  it("does not start without a local link", () => {
    const state = createMaestPreviewState(null);
    expect(start(state)).toBe(state);
    expect(state.activeRequest).toBeNull();
  });

  it("starts a linked track in preparing state", () => {
    const state = start(createMaestPreviewState(link));
    expect(state.phase).toBe("preparing");
    expect(state.activeRequest).toEqual({ ...link, requestId: 1 });
  });

  it("accepts only one start while busy", () => {
    const first = start(createMaestPreviewState(link), 1);
    const second = start(first, 2);
    expect(second).toBe(first);
    expect(second.activeRequest?.requestId).toBe(1);
  });

  it("moves from preparation to analysis for the active request", () => {
    expect(prepared(start(createMaestPreviewState(link))).phase).toBe("analyzing");
  });

  it("stores a successful proposal and returns to idle", () => {
    const state = succeeded(prepared(start(createMaestPreviewState(link))));
    expect(state.phase).toBe("idle");
    expect(state.proposal).toBe(publicResult);
    expect(state.activeRequest).toBeNull();
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
      request: { ...link, requestId: 1 },
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

  it("the real component keeps the required read-only actions and states", () => {
    const component = readFileSync(
      fileURLToPath(new URL("../../components/library/maest-preview.tsx", import.meta.url)),
      "utf8",
    );
    expect(component).toContain("Analizar localmente");
    expect(component).toContain("Preparando analizador…");
    expect(component).toContain("Analizando pista…");
    expect(component).toContain("Volver a analizar");
    expect(component).toContain("Descartar propuesta");
    expect(component).toContain("<dt>Score</dt>");
    expect(component).not.toMatch(/Aplicar propuesta|Guardar propuesta|Escribir etiquetas/);
  });
});

describe("MAEST library preview contract", () => {
  it("prepares only after the explicit invocation and then analyzes", async () => {
    const { core, invoke } = coreReturning();
    expect(invoke).not.toHaveBeenCalled();
    const prepared = vi.fn();
    await expect(invokeMaestPreview(core, "session-opaque", "scan-opaque", prepared)).resolves.toEqual(publicResult);
    expect(invoke.mock.calls.map(([command]) => command)).toEqual(["prepare_maest_model", "analyze_scanned_track"]);
    expect(prepared).toHaveBeenCalledOnce();
  });

  it("sends only opaque sessionId and scanId in the native analysis request", async () => {
    const { core, invoke } = coreReturning();
    await invokeMaestPreview(core, "session-opaque", "scan-opaque", vi.fn());
    expect(invoke).toHaveBeenLastCalledWith("analyze_scanned_track", {
      request: { sessionId: "session-opaque", scanId: "scan-opaque" },
    });
    expect(Object.keys(maestAnalyzeArguments("s", "t").request)).toEqual(["sessionId", "scanId"]);
  });

  it("has no persistence, Supabase, metadata or tag-writing call", async () => {
    const { core, invoke } = coreReturning();
    await invokeMaestPreview(core, "session-opaque", "scan-opaque", vi.fn());
    const commands = invoke.mock.calls.map(([command]) => command);
    expect(commands).toEqual(["prepare_maest_model", "analyze_scanned_track"]);
    expect(commands.join(" ")).not.toMatch(/save|update|supabase|metadata|tag|write/i);
  });

  it("exposes only the public result without audio, paths, tensors, scores arrays or model location", () => {
    const serialized = JSON.stringify(publicResult);
    expect(serialized).not.toMatch(/absolutePath|relativePath|path|pcm|audio|tensor|scores|modelLocation/i);
    expect(publicResult.analysis.genre.score).toBe(0.812345);
    expect(publicResult.analysis.genre.score?.toString()).not.toContain("%");
  });

  it("rejects stale responses after track, session, scan or request changes", () => {
    const request = { requestId: 1, trackId: "track-a", sessionId: "session-a", scanId: "scan-a" };
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
