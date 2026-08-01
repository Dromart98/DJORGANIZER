import { describe, expect, it, vi } from "vitest";
import type { TauriCore } from "./tauri";
import {
  invokeMaestPreview,
  isCurrentMaestRequest,
  maestAnalyzeArguments,
  maestErrorMessage,
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
