import { describe, expect, it } from "vitest";
import { getUserDisplayName, userFromClaims } from "./user";

describe("authenticated user identity", () => {
  it("reads the registered display name from Supabase user metadata", () => {
    const user = userFromClaims({
      email: "private@example.test",
      sub: "b50d2c0d-d942-45b1-ae4d-7aa6f00d74ca",
      user_metadata: { display_name: " DJ Áurea " },
    });

    expect(user).toMatchObject({ displayName: "DJ Áurea" });
    expect(getUserDisplayName(user!, "Usuario")).toBe("DJ Áurea");
  });

  it("uses the localized generic identity when legacy metadata has no name", () => {
    const user = userFromClaims({
      email: "legacy@example.test",
      sub: "b50d2c0d-d942-45b1-ae4d-7aa6f00d74ca",
    });

    expect(user).toMatchObject({ displayName: null });
    expect(getUserDisplayName(user!, "Usuario")).toBe("Usuario");
    expect(getUserDisplayName(user!, "Connected user")).toBe("Connected user");
  });

  it("preserves a long Unicode display name without falling back to email", () => {
    const displayName = "DJ Áurea 東京 — Sesión nocturna con un nombre muy largo";
    const user = userFromClaims({
      email: "private@example.test",
      sub: "b50d2c0d-d942-45b1-ae4d-7aa6f00d74ca",
      user_metadata: { display_name: displayName },
    });

    expect(getUserDisplayName(user!, "Usuario")).toBe(displayName);
    expect(getUserDisplayName(user!, "Usuario")).not.toBe(user!.email);
  });
});
