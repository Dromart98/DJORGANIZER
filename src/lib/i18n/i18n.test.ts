import { describe, expect, it } from "vitest";
import {
  formatBulkEditConfirmation,
  formatCrateCount,
  formatFileCount,
  formatMessage,
  formatSelectedCount,
  formatSuggestionCount,
  formatTrackCount,
  functionalTemplateEntries,
  functionalTranslationEntries,
  translate,
} from "./functional";
import {
  getMessages,
  messages,
  MESSAGES_HAVE_TYPE_PARITY,
  resolveLocale,
} from "./i18n";

function structure(value: unknown): unknown {
  if (typeof value === "function") return "function";
  if (Array.isArray(value)) return value.map(structure);
  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, child]) => [key, structure(child)]),
    );
  }
  return typeof value;
}

function containsUndefined(value: unknown): boolean {
  if (value === undefined) return true;
  if (Array.isArray(value)) return value.some(containsUndefined);
  if (value && typeof value === "object") {
    return Object.values(value).some(containsUndefined);
  }
  return false;
}

describe("i18n", () => {
  it("uses Spanish as the safe default", () => {
    expect(resolveLocale(null)).toBe("es");
    expect(resolveLocale(undefined)).toBe("es");
    expect(resolveLocale("fr")).toBe("es");
  });

  it("resolves English and exposes matching navigation copy", () => {
    const locale = resolveLocale("en");
    expect(locale).toBe("en");
    expect(getMessages(locale).navigation.library).toBe("Library");
    expect(getMessages(locale).navigation.goToLibrary).toBe("Go to Library");
  });

  it("keeps onboarding, help and recovery copy available in both locales", () => {
    const spanish = getMessages("es");
    const english = getMessages("en");

    expect(spanish.onboarding.progress(2, 3)).toBe(
      "2 de 3 pasos completados",
    );
    expect(english.onboarding.progress(2, 3)).toBe(
      "2 of 3 steps completed",
    );
    expect(spanish.importGuidance.privacy).toHaveLength(4);
    expect(english.importGuidance.privacy).toHaveLength(4);
    expect(spanish.routeError.retry).toBe("Reintentar");
    expect(english.routeError.retry).toBe("Retry");
  });

  it("keeps Spanish and English recursively structure-compatible", () => {
    expect(MESSAGES_HAVE_TYPE_PARITY).toBe(true);
    expect(structure(messages.en)).toEqual(structure(messages.es));
    expect(containsUndefined(messages.es)).toBe(false);
    expect(containsUndefined(messages.en)).toBe(false);
  });

  it("keeps every functional key and template defined", () => {
    for (const [spanish, english] of functionalTranslationEntries()) {
      expect(spanish).not.toBe("");
      expect(english).not.toBe("");
      expect(translate("es", spanish as Parameters<typeof translate>[1])).toBe(
        spanish,
      );
    }
    for (const [spanish, english] of functionalTemplateEntries()) {
      expect(spanish).not.toBe("");
      expect(english).not.toBe("");
    }
  });

  it("translates the crate hierarchy guidance in both locales", () => {
    expect(translate("es", "Guardar dentro de")).toBe("Guardar dentro de");
    expect(translate("en", "Guardar dentro de")).toBe("Save inside");
    expect(translate("es", "Ninguna")).toBe("Ninguna");
    expect(translate("en", "Ninguna")).toBe("None");
    expect(
      translate(
        "en",
        "Selecciona otro crate para colocar este crate dentro de él.",
      ),
    ).toBe("Select another crate to place this crate inside it.");
  });

  it("formats typed interpolation and plurals in both locales", () => {
    expect(
      formatMessage("en", "Página {page} de {pages}", {
        page: 2,
        pages: 5,
      }),
    ).toBe("Page 2 of 5");
    expect(
      formatMessage("es", "Quitar etiqueta {tag} de {track}", {
        tag: "House",
        track: "Opening Track",
      }),
    ).toBe("Quitar etiqueta House de Opening Track");
    expect(
      formatMessage("en", "Quitar etiqueta {tag} de {track}", {
        tag: "House",
        track: "Opening Track",
      }),
    ).toBe("Remove tag House from Opening Track");
    expect(formatTrackCount("es", 1)).toBe("1 pista");
    expect(formatTrackCount("en", 2)).toBe("2 tracks");
    expect(formatFileCount("es", 1)).toBe("1 archivo");
    expect(formatFileCount("en", 2)).toBe("2 files");
    expect(formatCrateCount("es", 1)).toBe("1 crate");
    expect(formatSuggestionCount("en", 2)).toBe("2 suggestions");
    expect(formatSelectedCount("es", 1)).toBe("1 seleccionada");
    expect(formatBulkEditConfirmation("en", 1)).toBe(
      "Apply this change to 1 track?",
    );
  });
});
