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
});
