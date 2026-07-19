import { describe, expect, it } from "vitest";
import { encodeMonoPcm16Wav } from "./wav-clip";

describe("WAV clip encoding", () => {
  it("writes a valid mono PCM header and bounded samples", () => {
    const wav = encodeMonoPcm16Wav([-2, -0.5, 0, 0.5, 2], 44_100);
    const view = new DataView(wav);
    const text = (start: number, length: number) =>
      String.fromCharCode(
        ...new Uint8Array(wav, start, length),
      );

    expect(text(0, 4)).toBe("RIFF");
    expect(text(8, 4)).toBe("WAVE");
    expect(text(36, 4)).toBe("data");
    expect(view.getUint16(22, true)).toBe(1);
    expect(view.getUint32(24, true)).toBe(44_100);
    expect(view.getInt16(44, true)).toBe(-32_768);
    expect(view.getInt16(52, true)).toBe(32_767);
  });
});
