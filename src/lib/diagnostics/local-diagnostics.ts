export type DiagnosticEvent = {
  category: "connectivity" | "runtime" | "sync";
  createdAt: string;
  message: string;
};

const STORAGE_KEY = "djorganizer:diagnostics:v1";
const MAX_EVENTS = 100;

export function sanitizeDiagnosticMessage(value: string) {
  return value
    .slice(0, 2_000)
    .replace(/[A-Z]:\\(?:[^\\\s]+\\)*[^\\\s]*/gi, "[ruta local]")
    .replace(/\/(?:Users|home)\/[^\s]+/gi, "[ruta local]")
    .replace(
      /[A-Z0-9._%+-]+@[A-Z0-9.-]+\.[A-Z]{2,}/gi,
      "[correo]",
    )
    .replace(
      /\b[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}\b/gi,
      "[id]",
    )
    .replace(/\b(?:sk|sb)_[A-Za-z0-9_-]{12,}\b/g, "[secreto]")
    .replace(/([?&](?:token|key|code|secret)=)[^&\s]+/gi, "$1[oculto]");
}

export function loadDiagnosticEvents(storage: Pick<Storage, "getItem">) {
  try {
    const parsed = JSON.parse(storage.getItem(STORAGE_KEY) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed
      .filter(
        (event): event is DiagnosticEvent =>
          !!event &&
          typeof event === "object" &&
          ["connectivity", "runtime", "sync"].includes(event.category) &&
          typeof event.createdAt === "string" &&
          typeof event.message === "string",
      )
      .slice(-MAX_EVENTS);
  } catch {
    return [];
  }
}

export function recordDiagnosticEvent(
  storage: Pick<Storage, "getItem" | "setItem">,
  event: DiagnosticEvent,
) {
  const events = loadDiagnosticEvents(storage);
  events.push({
    ...event,
    message: sanitizeDiagnosticMessage(event.message),
  });
  storage.setItem(STORAGE_KEY, JSON.stringify(events.slice(-MAX_EVENTS)));
}

export function clearDiagnosticEvents(storage: Pick<Storage, "removeItem">) {
  storage.removeItem(STORAGE_KEY);
}

export function createDiagnosticReport(
  storage: Pick<Storage, "getItem">,
  environment: {
    language: string;
    online: boolean;
    userAgent: string;
    viewport: string;
  },
) {
  return {
    environment,
    events: loadDiagnosticEvents(storage),
    generatedAt: new Date().toISOString(),
    privacy:
      "Informe local sin biblioteca, audio, rutas, credenciales, cookies ni identidad.",
    schemaVersion: 1,
  };
}
