import { describe, expect, it, vi } from "vitest";
import { listTrackTags, mapTrackTags } from "./track-repository";

const tags = [
  { id: "tag-z", name: "Warm up" },
  { id: "tag-a", name: "Afterhours" },
  { id: "tag-b", name: "afterhours" },
];

describe("mapTrackTags", () => {
  it("maps none, one, and several tags to only the requested tracks", () => {
    expect(mapTrackTags(["empty"], tags, [])).toEqual({ empty: [] });
    expect(mapTrackTags(["one"], tags, [{ track_id: "one", tag_id: "tag-z" }])).toEqual({
      one: [{ id: "tag-z", name: "Warm up" }],
    });
    expect(mapTrackTags(["one", "two"], tags, [
      { track_id: "one", tag_id: "tag-z" },
      { track_id: "two", tag_id: "tag-b" },
      { track_id: "two", tag_id: "tag-a" },
      { track_id: "outside", tag_id: "tag-z" },
    ])).toEqual({
      one: [{ id: "tag-z", name: "Warm up" }],
      two: [{ id: "tag-a", name: "Afterhours" }, { id: "tag-b", name: "afterhours" }],
    });
  });

  it("deduplicates repeated rows and orders names deterministically", () => {
    expect(mapTrackTags(["track"], tags, [
      { track_id: "track", tag_id: "tag-z" },
      { track_id: "track", tag_id: "tag-a" },
      { track_id: "track", tag_id: "tag-z" },
    ])).toEqual({
      track: [{ id: "tag-a", name: "Afterhours" }, { id: "tag-z", name: "Warm up" }],
    });
  });
});

describe("listTrackTags", () => {
  it("does not query an empty page", async () => {
    const from = vi.fn();
    await expect(listTrackTags({ from } as never, "user", [], tags)).resolves.toEqual({});
    expect(from).not.toHaveBeenCalled();
  });

  it("uses one relation query limited to the unique page track ids", async () => {
    const inFilter = vi.fn().mockResolvedValue({ data: [], error: null });
    const eq = vi.fn(() => ({ in: inFilter }));
    const select = vi.fn(() => ({ eq }));
    const from = vi.fn(() => ({ select }));
    await listTrackTags({ from } as never, "user", ["a", "b", "a"], tags);
    expect(from).toHaveBeenCalledOnce();
    expect(from).toHaveBeenCalledWith("track_tags");
    expect(eq).toHaveBeenCalledWith("user_id", "user");
    expect(inFilter).toHaveBeenCalledWith("track_id", ["a", "b"]);
  });
});
