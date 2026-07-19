export const SUPPORTED_LOCALES = ["es", "en"] as const;
export type Locale = (typeof SUPPORTED_LOCALES)[number];

export function resolveLocale(value: string | null | undefined): Locale {
  return value === "en" ? "en" : "es";
}

export const messages = {
  es: {
    auth: {
      active: "Sesión activa",
      connectedUser: "Usuario conectado",
      signIn: "Iniciar sesión",
      signedOut: "Sin sesión",
    },
    navigation: {
      crates: "Crates",
      home: "Inicio",
      import: "Importar",
      library: "Biblioteca",
      main: "Navegación principal",
      mobile: "Navegación móvil",
      settings: "Ajustes",
      skip: "Saltar al contenido",
    },
    settings: {
      language: "Idioma",
      languageHelp: "Cambia el idioma de navegación de este dispositivo.",
    },
  },
  en: {
    auth: {
      active: "Active session",
      connectedUser: "Connected user",
      signIn: "Sign in",
      signedOut: "Signed out",
    },
    navigation: {
      crates: "Crates",
      home: "Home",
      import: "Import",
      library: "Library",
      main: "Main navigation",
      mobile: "Mobile navigation",
      settings: "Settings",
      skip: "Skip to content",
    },
    settings: {
      language: "Language",
      languageHelp: "Change the navigation language on this device.",
    },
  },
} as const;

export function getMessages(locale: Locale) {
  return messages[locale];
}
