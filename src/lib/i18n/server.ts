import { cookies } from "next/headers";
import { resolveLocale } from "./i18n";

export async function getCurrentLocale() {
  const cookieStore = await cookies();
  return resolveLocale(cookieStore.get("djorganizer-locale")?.value);
}
