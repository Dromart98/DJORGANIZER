import { describe, expect, it } from "vitest";
import { parseVirtualDjList, reconcileVirtualDjList } from "./virtualdj";

describe("VirtualDJ My Lists", () => {
  it("parses ordered native XML and escaped values", () => {
    const list = parseVirtualDjList(
      '<VirtualFolder ordered="yes"><song path="C:\\Music\\B.mp3" title="B &amp; B" idx="1" /><song path="C:\\Music\\A.mp3" idx="0" /></VirtualFolder>',
      "My Lists/Warmup.xml",
    );

    expect(list.name).toBe("Warmup");
    expect(list.tracks.map((track) => track.path)).toEqual([
      "C:\\Music\\A.mp3",
      "C:\\Music\\B.mp3",
    ]);
    expect(list.tracks[1].title).toBe("B & B");
  });

  it("previews additions, removals and moves without overwriting", () => {
    const remote = parseVirtualDjList(
      '<VirtualFolder><song path="B.mp3" idx="0" /><song path="C.mp3" idx="1" /></VirtualFolder>',
    );
    const changes = reconcileVirtualDjList(
      remote,
      ["A.mp3", "B.mp3"],
      [{ path: "B.mp3", trackId: "track-b" }],
    );

    expect(changes.map((change) => change.status)).toEqual([
      "moved",
      "added",
      "removed",
    ]);
    expect(changes[0].trackId).toBe("track-b");
  });
});
