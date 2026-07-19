"use client";

import { useRouter } from "next/navigation";
import { getMessages, type Locale } from "@/lib/i18n/i18n";

export function LocaleSwitcher({ locale }: { locale: Locale }) {
  const router = useRouter();
  const copy = getMessages(locale).settings;

  return (
    <label className="locale-switcher">
      {copy.language}
      <select
        onChange={(event) => {
          document.cookie = `djorganizer-locale=${event.target.value}; Path=/; Max-Age=31536000; SameSite=Lax`;
          router.refresh();
        }}
        value={locale}
      >
        <option value="es">Español</option>
        <option value="en">English</option>
      </select>
      <small>{copy.languageHelp}</small>
    </label>
  );
}
