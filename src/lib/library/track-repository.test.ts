import { describe, expect, it, vi } from "vitest";
import { listTrackTags, listUserTags, mapTrackTags } from "./track-repository";

type Row = Record<string, unknown>;

function pagedClient(rowsByTable: Record<string, Row[]>) {
  const calls: { ids?: string[]; range: [number, number]; table: string }[] = [];
  const from = vi.fn((table: string) => {
    let ids: string[] | undefined;
    const chain = {
      eq: vi.fn(() => chain),
      in: vi.fn((_column: string, values: string[]) => {
        ids = values;
        return chain;
      }),
      order: vi.fn(() => chain),
      range: vi.fn((start: number, end: number) => {
        calls.push({ ids, range: [start, end], table });
        const visibleRows = (rowsByTable[table] ?? []).filter(
          (row) => !ids || ids.includes(String(row.track_id)),
        );
        return Promise.resolve({ data: visibleRows.slice(start, end + 1), error: null });
      }),
      select: vi.fn(() => chain),
    };
    return chain;
  });
  return { calls, client: { from } as never, from };
}

const relation = (trackId: string, id: string, name: string) => ({
  tag_id: id,
  tags: { id, name },
  track_id: trackId,
});

describe("mapTrackTags", () => {
  it("maps none, one, and several related tags only to requested tracks", () => {
    expect(mapTrackTags(["empty"], [])).toEqual({ empty: [] });
    expect(mapTrackTags(["one"], [relation("one", "tag-z", "Warm up")])).toEqual({
      one: [{ id: "tag-z", name: "Warm up" }],
    });
    expect(mapTrackTags(["one", "two"], [
      relation("one", "tag-z", "Warm up"),
      relation("two", "tag-b", "afterhours"),
      relation("two", "tag-a", "Afterhours"),
      relation("outside", "tag-x", "Outside"),
    ])).toEqual({
      one: [{ id: "tag-z", name: "Warm up" }],
      two: [{ id: "tag-a", name: "Afterhours" }, { id: "tag-b", name: "afterhours" }],
    });
  });

  it("shows a related tag without any separately loaded catalog and removes duplicates", () => {
    expect(mapTrackTags(["track"], [
      relation("track", "tag-late", "Zulu"),
      relation("track", "tag-a", "Alpha"),
      relation("track", "tag-late", "Zulu"),
    ])).toEqual({
      track: [{ id: "tag-a", name: "Alpha" }, { id: "tag-late", name: "Zulu" }],
    });
  });
});

describe("listTrackTags", () => {
  it("does not query relations for an empty track page", async () => {
    const { client, from } = pagedClient({ track_tags: [] });
    await expect(listTrackTags(client, "user", [])).resolves.toEqual({});
    expect(from).not.toHaveBeenCalled();
  });

  it("uses batched relation queries limited to all unique visible track ids", async () => {
    const rows = Array.from({ length: 501 }, (_, index) =>
      relation(index % 2 ? "b" : "a", `tag-${index}`, `Tag ${index}`),
    );
    rows.push(relation("outside", "outside", "Outside"));
    const { calls, client, from } = pagedClient({ track_tags: rows });
    const result = await listTrackTags(client, "user", ["a", "b", "a"]);
    expect(from).toHaveBeenCalledTimes(2);
    expect(calls).toEqual([
      { ids: ["a", "b"], range: [0, 499], table: "track_tags" },
      { ids: ["a", "b"], range: [500, 999], table: "track_tags" },
    ]);
    expect(result.a).toHaveLength(251);
    expect(result.b).toHaveLength(250);
  });
});

describe("listUserTags", () => {
  const tags = (count: number) =>
    Array.from({ length: count }, (_, index) => ({
      id: `tag-${String(index).padStart(4, "0")}`,
      name: `Tag ${String(index).padStart(4, "0")}`,
    }));

  it.each([
    [0, 1],
    [499, 1],
    [500, 2],
    [1_000, 3],
    [1_001, 3],
    [1_501, 4],
  ])("loads %i tags with bounded pages", async (count, expectedRequests) => {
    const { calls, client } = pagedClient({ tags: tags(count) });
    await expect(listUserTags(client, "user")).resolves.toHaveLength(count);
    expect(calls).toHaveLength(expectedRequests);
    expect(calls.every(({ range: [start, end] }) => end - start + 1 === 500)).toBe(true);
  });

  it("deduplicates and deterministically orders the complete catalog", async () => {
    const { client } = pagedClient({
      tags: [
        { id: "z", name: "Warm up" },
        { id: "b", name: "afterhours" },
        { id: "a", name: "Afterhours" },
        { id: "z", name: "Warm up" },
      ],
    });
    await expect(listUserTags(client, "user")).resolves.toEqual([
      { id: "a", name: "Afterhours" },
      { id: "b", name: "afterhours" },
      { id: "z", name: "Warm up" },
    ]);
  });
});
