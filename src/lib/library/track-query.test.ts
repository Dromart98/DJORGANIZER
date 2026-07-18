import { describe, expect, it } from "vitest";
import {
  buildLibraryHref,
  databaseSortColumn,
  parseTrackQuery,
  safeSearchTerm,
} from "./track-query";

describe("parseTrackQuery", () => {
  it("normaliza paginación, ordenación y rangos", () => {
    const query = parseTrackQuery({
      bpmMax: "100",
      bpmMin: "120",
      direction: "desc",
      page: "3",
      sort: "bpm",
    });

    expect(query).toMatchObject({
      bpmMax: 120,
      bpmMin: 120,
      direction: "desc",
      page: 3,
      sort: "bpm",
    });
    expect(databaseSortColumn(query.sort)).toBe("bpm");
  });

  it("usa valores seguros para parámetros inválidos", () => {
    expect(parseTrackQuery({ page: "-1", sort: "drop-table" })).toMatchObject({
      direction: "asc",
      page: 1,
      sort: "created",
    });
  });
});

describe("URL de biblioteca", () => {
  it("conserva filtros al cambiar la página", () => {
    const query = parseTrackQuery({ genre: "House", q: "night" });
    expect(buildLibraryHref(query, { page: 2 })).toContain(
      "q=night&genre=House",
    );
    expect(buildLibraryHref(query, { page: 2 })).toContain("page=2");
  });

  it("elimina delimitadores reservados de una búsqueda", () => {
    expect(safeSearchTerm('house),artist.ilike."%"')).toBe(
      "house artist.ilike. %",
    );
  });
});
