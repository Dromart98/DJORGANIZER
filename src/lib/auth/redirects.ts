const DEFAULT_REDIRECT = "/library";

export function safeRedirectPath(
  value: FormDataEntryValue | null | undefined,
) {
  if (typeof value !== "string") {
    return DEFAULT_REDIRECT;
  }

  const path = value.trim();
  if (!path.startsWith("/") || path.startsWith("//") || path.includes("\\")) {
    return DEFAULT_REDIRECT;
  }

  return path;
}

