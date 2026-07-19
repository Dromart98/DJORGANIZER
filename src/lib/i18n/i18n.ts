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
    dashboard: {
      description: "Resumen real de tu biblioteca privada.",
      eyebrow: "Resumen",
      normalAction: "Abrir crates",
      normalDescription:
        "Tu biblioteca y tu primer crate ya están listos. Continúa preparando el orden de tu próxima sesión.",
      normalEyebrow: "Preparación",
      normalTitle: "Prepara tu próxima sesión",
      stats: {
        crates: "Crates",
        cratesHelp: "Sesiones preparadas",
        tags: "Etiquetas",
        tagsHelp: "Clasificación personal",
        tracks: "Pistas",
        tracksHelp: "En tu biblioteca",
      },
      title: "Tu música, lista para mezclar",
    },
    importGuidance: {
      browserDescription:
        "El navegador solo puede leer los archivos que selecciones expresamente; no obtiene acceso general a tus carpetas.",
      browserTitle: "Archivos desde el navegador",
      desktopDescription:
        "En Tauri puedes autorizar una carpeta con el selector del sistema. Esta opción no está disponible en la versión web.",
      desktopTitle: "Carpeta en la aplicación de escritorio",
      detailsSummary: "Cómo funciona y qué se guarda",
      eyebrow: "Antes de empezar",
      privacy: [
        "El audio completo no se guarda en Supabase y las rutas absolutas no se publican.",
        "El análisis musical se realiza localmente por defecto.",
        "OpenAI solo recibe un fragmento cuando pulsas expresamente la sugerencia de género de esa pista.",
        "Guardar metadatos no mueve ni modifica el archivo de audio.",
        "Las operaciones de escritorio que modifican archivos usan flujos separados de previsualización y confirmación.",
      ],
      steps: [
        "Selecciona archivos o autoriza una carpeta en la aplicación de escritorio.",
        "DJOrganizer analiza localmente BPM, tonalidad y energía.",
        "Revisa y corrige los resultados.",
        "Guarda únicamente los metadatos seleccionados.",
      ],
      title: "Elige cómo seleccionar tu música",
    },
    libraryEmpty: {
      description:
        "Importar lee y analiza los archivos que selecciones. El alta manual crea una ficha cuando prefieres escribir los datos sin elegir audio.",
      manualAction: "Añadir una pista manualmente",
      primaryAction: "Importar música",
      title: "Tu biblioteca está vacía",
    },
    onboarding: {
      completed: "Completado",
      description:
        "Sigue estos pasos con tu propia música. La guía se actualiza con los datos reales de tu cuenta.",
      eyebrow: "Primeros pasos",
      pending: "Pendiente",
      privacyDescription:
        "El audio y las rutas completas permanecen en tu dispositivo. DJOrganizer guarda en Supabase únicamente los metadatos que revisas; importar no mueve ni modifica los archivos.",
      privacySummary: "Qué permanece en este dispositivo",
      progress: (completed: number, total: number) =>
        `${completed} de ${total} pasos completados`,
      progressLabel: "Progreso de primeros pasos",
      steps: {
        crate: {
          accessibleAction: "Ir a Crates para crear el primer crate",
          action: "Crear primer crate",
          description:
            "Agrupa pistas en un orden de sesión sin copiar, mover ni borrar la música.",
          title: "Crea tu primer crate",
        },
        import: {
          accessibleAction: "Ir a Importar para seleccionar las primeras canciones",
          action: "Importar canciones",
          description:
            "Selecciona tus propios archivos y revisa los metadatos antes de guardarlos.",
          title: "Importa las primeras canciones",
        },
        review: {
          accessibleAction: "Ir a Biblioteca para revisar pistas y análisis",
          action: "Revisar biblioteca",
          description:
            "Comprueba títulos, BPM, tonalidad y energía; todos siguen siendo editables.",
          title: "Revisa la biblioteca y los análisis",
        },
      },
      stepsLabel: "Pasos para preparar la primera sesión",
      title: "Prepara tu primera sesión",
    },
    cratesEmpty: {
      createAction: "Crear el primer crate",
      createDescription:
        "Un crate es una lista ordenada de referencias a tus pistas. No copia, mueve ni elimina los archivos de audio.",
      createTitle: "Crea tu primer crate",
      manualAction: "Añadir una pista manualmente",
      noTracksDescription:
        "Antes de preparar una sesión, importa archivos o añade una pista manualmente. Después podrás ordenarlas sin copiar ni mover el audio.",
      noTracksTitle: "Todavía no hay música para un crate",
      primaryAction: "Importar música",
      sidebarDescription:
        "Los controles de creación estarán disponibles cuando haya al menos una pista utilizable en tu biblioteca.",
      sidebarTitle: "Primero añade música",
    },
    routeError: {
      dashboard: "Ir al inicio",
      description:
        "No pudimos cargar esta pantalla. Puedes reintentar o volver a una zona segura sin perder los cambios que ya se hayan guardado.",
      diagnostics:
        "Se ha conservado únicamente un detalle técnico saneado en el diagnóstico local de este dispositivo.",
      eyebrow: "Recuperación",
      import: "Ir a Importar",
      library: "Ir a Biblioteca",
      libraryDescription:
        "No pudimos cargar la biblioteca. Puedes reintentar o volver a una zona segura; los datos ya guardados no se eliminan.",
      libraryEyebrow: "Biblioteca",
      retry: "Reintentar",
      title: "No se pudo cargar la pantalla",
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
    dashboard: {
      description: "A real summary of your private library.",
      eyebrow: "Overview",
      normalAction: "Open crates",
      normalDescription:
        "Your library and first crate are ready. Keep preparing the running order for your next set.",
      normalEyebrow: "Preparation",
      normalTitle: "Prepare your next set",
      stats: {
        crates: "Crates",
        cratesHelp: "Prepared sets",
        tags: "Tags",
        tagsHelp: "Personal classification",
        tracks: "Tracks",
        tracksHelp: "In your library",
      },
      title: "Your music, ready to mix",
    },
    importGuidance: {
      browserDescription:
        "The browser can only read files you explicitly select; it does not get general access to your folders.",
      browserTitle: "Files from the browser",
      desktopDescription:
        "In Tauri you can authorize a folder with the system picker. This option is not available in the web version.",
      desktopTitle: "Folder in the desktop app",
      detailsSummary: "How it works and what is saved",
      eyebrow: "Before you start",
      privacy: [
        "Full audio is not stored in Supabase and absolute paths are not published.",
        "Music analysis runs locally by default.",
        "OpenAI only receives a clip when you explicitly request a genre suggestion for that track.",
        "Saving metadata does not move or modify the audio file.",
        "Desktop operations that modify files use separate preview and confirmation flows.",
      ],
      steps: [
        "Select files or authorize a folder in the desktop app.",
        "DJOrganizer analyzes BPM, key and energy locally.",
        "Review and correct the results.",
        "Save only the selected metadata.",
      ],
      title: "Choose how to select your music",
    },
    libraryEmpty: {
      description:
        "Import reads and analyzes the files you select. Manual entry creates a record when you prefer to type the details without choosing audio.",
      manualAction: "Add a track manually",
      primaryAction: "Import music",
      title: "Your library is empty",
    },
    onboarding: {
      completed: "Completed",
      description:
        "Follow these steps with your own music. The guide updates from your account's real data.",
      eyebrow: "Getting started",
      pending: "Pending",
      privacyDescription:
        "Audio and full paths stay on your device. DJOrganizer only stores the metadata you review in Supabase; importing does not move or modify files.",
      privacySummary: "What stays on this device",
      progress: (completed: number, total: number) =>
        `${completed} of ${total} steps completed`,
      progressLabel: "Getting started progress",
      steps: {
        crate: {
          accessibleAction: "Go to Crates to create the first crate",
          action: "Create first crate",
          description:
            "Group tracks in a set order without copying, moving or deleting your music.",
          title: "Create your first crate",
        },
        import: {
          accessibleAction: "Go to Import to select your first tracks",
          action: "Import tracks",
          description:
            "Select your own files and review the metadata before saving it.",
          title: "Import your first tracks",
        },
        review: {
          accessibleAction: "Go to Library to review tracks and analysis",
          action: "Review library",
          description:
            "Check titles, BPM, key and energy; every value remains editable.",
          title: "Review your library and analysis",
        },
      },
      stepsLabel: "Steps to prepare your first set",
      title: "Prepare your first set",
    },
    cratesEmpty: {
      createAction: "Create the first crate",
      createDescription:
        "A crate is an ordered list of references to your tracks. It does not copy, move or delete audio files.",
      createTitle: "Create your first crate",
      manualAction: "Add a track manually",
      noTracksDescription:
        "Import files or add a track manually before preparing a set. You can then order tracks without copying or moving audio.",
      noTracksTitle: "There is no music for a crate yet",
      primaryAction: "Import music",
      sidebarDescription:
        "Creation controls will become available once your library contains at least one usable track.",
      sidebarTitle: "Add music first",
    },
    routeError: {
      dashboard: "Go to dashboard",
      description:
        "We could not load this screen. You can retry or return to a safe area without losing changes that were already saved.",
      diagnostics:
        "Only a sanitized technical detail was kept in this device's local diagnostics.",
      eyebrow: "Recovery",
      import: "Go to Import",
      library: "Go to Library",
      libraryDescription:
        "We could not load the library. You can retry or return to a safe area; saved data is not deleted.",
      libraryEyebrow: "Library",
      retry: "Retry",
      title: "The screen could not be loaded",
    },
    settings: {
      language: "Language",
      languageHelp: "Change the navigation language on this device.",
    },
  },
} as const;

type And<Values> = false extends Values ? false : true;
type SameMessageStructure<Left, Right> =
  Left extends (...args: infer LeftArguments) => infer LeftResult
    ? Right extends (...args: infer RightArguments) => infer RightResult
      ? [LeftArguments, RightArguments] extends [RightArguments, LeftArguments]
        ? SameMessageStructure<LeftResult, RightResult>
        : false
      : false
    : Left extends readonly unknown[]
      ? Right extends readonly unknown[]
        ? Left["length"] extends Right["length"]
          ? Right["length"] extends Left["length"]
            ? And<{
                [Index in keyof Left]: Index extends keyof Right
                  ? SameMessageStructure<Left[Index], Right[Index]>
                  : false;
              }[number]>
            : false
          : false
        : false
      : Left extends object
        ? Right extends object
          ? Exclude<keyof Left, keyof Right> extends never
            ? Exclude<keyof Right, keyof Left> extends never
              ? And<{
                  [Key in keyof Left]: Key extends keyof Right
                    ? SameMessageStructure<Left[Key], Right[Key]>
                    : false;
                }[keyof Left]>
              : false
            : false
          : false
        : Left extends string
          ? Right extends string
            ? true
            : false
          : Left extends number
            ? Right extends number
              ? true
              : false
            : true;

export const MESSAGES_HAVE_TYPE_PARITY: SameMessageStructure<
  (typeof messages)["es"],
  (typeof messages)["en"]
> = true;

export function getMessages(locale: Locale) {
  return messages[locale];
}
