import { describe, expect, it } from "vitest";
import { getMessages, resolveLocale } from "./i18n";

describe("i18n", () => {
  it("uses Spanish as the safe default", () => {
    expect(resolveLocale(undefined)).toBe("es");
    expect(resolveLocale("fr")).toBe("es");
  });

  it("resolves English and exposes matching navigation copy", () => {
    const locale = resolveLocale("en");
    expect(locale).toBe("en");
    expect(getMessages(locale).navigation.library).toBe("Library");
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
    expect(spanish.importGuidance.privacy).toHaveLength(5);
    expect(english.importGuidance.privacy).toHaveLength(5);
    expect(spanish.routeError.retry).toBe("Reintentar");
    expect(english.routeError.retry).toBe("Retry");
  });
});
