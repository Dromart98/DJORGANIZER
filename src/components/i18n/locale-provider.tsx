"use client";

import { createContext, useContext, useMemo, type ReactNode } from "react";
import { formatMessage, translate } from "@/lib/i18n/functional";
import { getMessages, type Locale } from "@/lib/i18n/i18n";

const LocaleContext = createContext<Locale>("es");

export function LocaleProvider({
  children,
  locale,
}: {
  children: ReactNode;
  locale: Locale;
}) {
  return (
    <LocaleContext.Provider value={locale}>{children}</LocaleContext.Provider>
  );
}

export function useLocale() {
  return useContext(LocaleContext);
}

export function useMessages() {
  return getMessages(useLocale());
}

export function useTranslator() {
  const locale = useLocale();
  return useMemo(
    () => ({
      format: <Key extends Parameters<typeof formatMessage>[1]>(
        template: Key,
        values: Parameters<typeof formatMessage<Key>>[2],
      ) => formatMessage(locale, template, values),
      locale,
      t: (message: Parameters<typeof translate>[1]) =>
        translate(locale, message),
    }),
    [locale],
  );
}
