# Roadmap de DJOrganizer

Actualizado: 2026-07-19.

Este documento distingue lo que ya está disponible de las fases que todavía
requieren implementación. Cada fase funcional se entrega en una rama y pull
request independiente, con pruebas, revisión y despliegue de producción desde
`main`.

## Disponible

- [x] Base Next.js, TypeScript estricto, Tailwind y diseño responsive.
- [x] Supabase Auth, esquema PostgreSQL, RLS y aislamiento por usuario.
- [x] Biblioteca persistente con CRUD, búsqueda, filtros, ordenación y paginación.
- [x] Importación local de metadatos y detección SHA-256 de duplicados.
- [x] Crates y etiquetas persistentes con orden manual.
- [x] Normalización tonal, rueda Camelot y recomendaciones armónicas.
- [x] Estimación local de BPM y tonalidad, sin subir audio.
- [x] Edición masiva, diseño premium y PWA instalable con fallback sin conexión.
- [x] Base Tauri 2 y escaneo local de carpetas con metadatos y duplicados exactos.
- [x] Revisión del escaneo con búsqueda, filtros, paginación y selección.
- [x] Previsualización segura de reorganización sin mover archivos.
- [x] Exportación de una selección local como List XML nativa de VirtualDJ 2024+.

## Próximas fases prioritarias

### Integración con VirtualDJ

- [x] Exportar también M3U8 como formato de compatibilidad heredada.
- [x] Asociar de forma local una pista persistente de DJOrganizer con su archivo
  en cada dispositivo mediante huella y ruta, sin publicar la ruta absoluta.
- [x] Exportar crates de DJOrganizer a Lists de VirtualDJ conservando su orden.
- [x] Exportar varios crates y jerarquías de listas en una sola operación.
- [x] Previsualizar e importar cambios de **My Lists** sin sobrescribir datos.
- [x] Reconciliar mediante combinación o reemplazo confirmado, conservar copias
  de las Lists existentes y registrar conflictos no resueltos.
- [x] Evaluar cues, rating, color e historial: la especificación oficial de
  **My Lists** no define esos campos, por lo que DJOrganizer no los exporta ni
  modifica `database.xml`. Se reabrirá únicamente si VirtualDJ publica un
  contrato estable y documentado.

VirtualDJ 2024+ usa XML en **My Lists**; M3U se mantiene como compatibilidad
heredada. Referencias oficiales:
[Lists](https://virtualdj.com/wiki/lists.html),
[Playlists](https://virtualdj.com/manuals/virtualdj/interface/database/playlists.html)
y [Export](https://virtualdj.com/manuals/virtualdj/appendix/export.html).

### Gestión real del sistema de archivos

- [x] Aplicar el plan de reorganización con confirmación y simulación final.
- [x] Registrar cada movimiento y ofrecer historial y deshacer durante la sesión.
- [x] Detectar cambios externos y evitar sobrescrituras o colisiones.
- [x] Escribir metadatos en archivos solo como opción explícita, con copia de
  seguridad y reversión.
- [x] Vigilar la carpeta confirmada durante la sesión con comprobaciones
  incrementales manuales o cada 30 segundos. Conserva IDs de pistas estables,
  relee solo archivos nuevos o modificados, retira los desaparecidos y bloquea
  la vigilancia cuando el resultado está truncado.

### Inteligencia y calidad musical

- [x] Analizar automáticamente BPM y tonalidad en cuanto se seleccionen archivos
  para importar, sin requerir un botón adicional; mostrar progreso, permitir
  cancelar y conservar la corrección manual. El análisis sigue siendo local.
- [x] Clasificar géneros con la API de OpenAI y `gpt-audio`. Esta
  función será opcional y requerirá consentimiento explícito antes de enviar un
  fragmento autorizado; la clave permanecerá en el servidor. Definir taxonomía,
  respuesta estructurada, confianza, límites de coste, caché por huella y
  corrección manual. El clip WAV mono de hasta 45 segundos se genera localmente,
  no se almacena y existe un límite por usuario.
  Referencia: [gpt-audio](https://developers.openai.com/api/docs/models/gpt-audio).
- [x] Calcular energía real con una escala documentada y editable.
- [x] Detectar duplicados acústicos o versiones recodificadas, además de copias
  binarias exactas.
- [ ] Mejorar confianza y explicación de BPM y tonalidad.
- [x] Añadir comparación de versiones, remixes y ediciones.
- [x] Mantener género automático como función opcional y revisable.

### Offline, rendimiento y distribución

- [x] Cola offline compactada para importación de metadatos, reintento al volver
  la conexión y contratos de detección de conflictos.
- [x] Extender la cola offline a altas, ediciones y eliminaciones de pistas,
  crates, orden de crates y etiquetas, con compactación, revisión optimista,
  conflictos y reintento explícito.
- [x] Mantener ventanas acotadas en servidor y cliente: biblioteca en páginas de
  25, crates en páginas de 100 y escaneo local paginado. La suite incluye una
  biblioteca sintética de 50.000 pistas.
- [x] Pipeline de instaladores firmados para Windows, macOS y Linux.
- [x] Actualizaciones verificadas para la aplicación de escritorio.
- [x] Copias de seguridad, exportación general de datos y restauración.
- [x] Diagnóstico local opt-in para exportación manual: conserva como máximo 100
  eventos técnicos saneados y nunca envía biblioteca, audio, rutas, cookies,
  cuenta o credenciales.

### Calidad de producto

- [x] Base E2E en Chromium de escritorio y móvil para navegación, protección de
  rutas, teclado e idioma.
- [x] E2E autenticado de importación, biblioteca y crates con Supabase efímero:
  genera WAV en memoria, guarda pistas sin artista, verifica la biblioteca,
  crea un crate y comprueba su orden persistente.
- [x] Auditoría automatizada de RLS y separación entre usuarios con pgTAP:
  valida todas las tablas personales, operaciones cruzadas y reconciliación,
  y se ejecuta contra una base efímera en CI.
- [x] Navegación semántica, enlace de salto, foco visible, estados accesibles y
  validación responsive por teclado.
- [ ] Completar auditoría con lector de pantalla en los flujos autenticados.
- [ ] Onboarding, ayuda contextual y recuperación ante estados vacíos o errores.
- [x] Infraestructura bilingüe español/inglés, cookie de preferencia y shell
  traducida.
- [ ] Traducir todo el contenido funcional restante al inglés.
- [x] Contratos de capacidades para Rekordbox, Serato y Traktor.
- [ ] Implementaciones posteriores con Rekordbox, Serato, Traktor y ecosistemas CDJ,
  después de estabilizar VirtualDJ.
