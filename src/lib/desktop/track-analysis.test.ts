import { describe, expect, it, vi } from "vitest";
import type { TauriCore } from "./tauri";
import { cancelNativeTrackAnalysis, invokeNativeTrackAnalysis, nativeTrackArguments, nativeTrackProposal } from "./track-analysis";

const field = <T>(value: T, confidence = 0.8) => ({ status: "completed" as const, value, confidence, error: null });
const result = { scanId: "scan", bpm: field(128), musicalKey: field("A minor"), camelotKey: field("8A"), energy: field(7) };

describe("native single-track analysis contract", () => {
  it("uses only opaque session, scan and operation identifiers", async () => {
    const invoke = vi.fn().mockResolvedValue(result);
    const core = { invoke } as TauriCore;
    await invokeNativeTrackAnalysis(core, "session", "scan", "native-op");
    await cancelNativeTrackAnalysis(core, "session", "scan", "native-op");
    expect(invoke).toHaveBeenNthCalledWith(1, "analyze_library_track", nativeTrackArguments("session", "scan", "native-op"));
    expect(invoke).toHaveBeenNthCalledWith(2, "cancel_library_track_analysis", nativeTrackArguments("session", "scan", "native-op"));
    expect(JSON.stringify(invoke.mock.calls)).not.toMatch(/path|pcm|audio/i);
  });

  it("accepts a complete result and canonicalizes its key pair", () => {
    expect(nativeTrackProposal(result, "scan")).toMatchObject({ bpm: { value: 128 }, key: { value: "Am", camelotValue: "8A" }, energy: { value: 7 } });
  });

  it("preserves valid fields from a partial result", () => {
    expect(nativeTrackProposal({ ...result, bpm: { status: "failed", value: null, confidence: null, error: "bpm_not_detected" } }, "scan"))
      .toMatchObject({ bpm: null, key: { camelotValue: "8A" }, energy: { value: 7 } });
  });

  it.each([
    [{ ...result, scanId: "stale" }, "stale identity"],
    [{ ...result, bpm: field(301) }, "invalid BPM"],
    [{ ...result, energy: field(4.5) }, "fractional energy"],
    [{ ...result, musicalKey: field("C"), camelotKey: field("8A") }, "incompatible key pair"],
  ])("rejects or isolates %s", (payload) => {
    const proposal = nativeTrackProposal(payload, "scan");
    if ((payload as typeof result).scanId === "stale") expect(proposal).toBeNull();
    else expect(proposal).not.toMatchObject(payload === result ? {} : { bpm: { value: 301 } });
  });
});
