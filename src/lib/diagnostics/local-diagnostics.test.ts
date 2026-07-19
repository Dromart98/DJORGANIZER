import { describe, expect, it } from "vitest";
import {
  createDiagnosticReport,
  loadDiagnosticEvents,
  recordDiagnosticEvent,
  sanitizeDiagnosticMessage,
} from "./local-diagnostics";

function memoryStorage() {
  const values = new Map<string, string>();
  return {
    getItem: (key: string) => values.get(key) ?? null,
    removeItem: (key: string) => values.delete(key),
    setItem: (key: string, value: string) => values.set(key, value),
  };
}

describe("local diagnostics", () => {
  it("redacts paths, emails, identifiers and secrets", () => {
    expect(
      sanitizeDiagnosticMessage(
        "C:\\Users\\Ana\\Music\\set.mp3 ana@example.com " +
          "019f783c-d3e4-71c0-b748-f09d804cfdae sk_proj-abcdefghijklmnop",
      ),
    ).toBe("[ruta local] [correo] [id] [secreto]");
  });

  it("keeps only the newest 100 local events", () => {
    const storage = memoryStorage();
    for (let index = 0; index < 105; index += 1) {
      recordDiagnosticEvent(storage, {
        category: "runtime",
        createdAt: new Date(index).toISOString(),
        message: `error-${index}`,
      });
    }
    expect(loadDiagnosticEvents(storage)).toHaveLength(100);
    expect(
      createDiagnosticReport(storage, {
        language: "es",
        online: true,
        userAgent: "test",
        viewport: "100x100",
      }).events[0].message,
    ).toBe("error-5");
  });
});
