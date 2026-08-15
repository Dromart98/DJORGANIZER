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
      status: "active",
    });
    expect(databaseSortColumn(query.sort)).toBe("bpm");
  });

  it("usa valores seguros para parámetros inválidos", () => {
    expect(
      parseTrackQuery({ page: "-1", sort: "drop-table", status: "deleted" }),
    ).toMatchObject({
      direction: "asc",
      page: 1,
      sort: "created",
      status: "active",
    });
  });

  it("acepta el filtro explícito de pistas archivadas", () => {
    expect(parseTrackQuery({ status: "archived" }).status).toBe("archived");
    expect(parseTrackQuery({ status: "all" }).status).toBe("all");
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

  it("conserva archivadas y omite el estado activo por defecto", () => {
    const archived = parseTrackQuery({ status: "archived" });
    expect(buildLibraryHref(archived, { page: 2 })).toContain(
      "status=archived",
    );

    const active = parseTrackQuery({});
    expect(buildLibraryHref(active, { page: 1 })).not.toContain("status=");
  });

  it("elimina delimitadores reservados de una búsqueda", () => {
    expect(safeSearchTerm('house),artist.ilike."%"')).toBe(
      "house artist.ilike. %",
    );
  });
});
