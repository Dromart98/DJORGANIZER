# Roadmap de DJOrganizer

Actualizado: 2026-07-22.

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
  función se ofrece por pista y el botón de sugerencia constituye el
  consentimiento explícito antes de enviar ese fragmento autorizado; no hay un
  interruptor global redundante. La clave permanece en el servidor. Definir taxonomía,
  respuesta estructurada, confianza, límites de coste, caché por huella y
  corrección manual. El clip WAV mono de hasta 45 segundos se genera localmente,
  no se almacena y existe un límite por usuario.
  Referencia: [gpt-audio](https://developers.openai.com/api/docs/models/gpt-audio).
- [ ] Crear primero un banco de validación común para clasificación de género,
  con una colección etiquetada manualmente, taxonomía interna estable, métricas
  multi-etiqueta, tiempos, memoria y consumo. El contrato debe admitir varios
  proveedores sin cambiar los géneros persistidos ni sobrescribir correcciones
  manuales. La infraestructura de contratos, fixtures sintéticos y evaluación ya está
  implementada; la casilla sigue pendiente hasta poblar y revisar una colección real.
- [ ] Implementar una prueba de concepto web local con
  `discogs-effnet-bsdynamic` y `genre_discogs400-discogs-effnet`. Los pesos
  oficiales incluyen un extractor ONNX de unos 18 MB y una taxonomía de 400
  estilos. Ejecutar mediante ONNX Runtime Web, preferir WebGPU cuando esté
  disponible y usar WASM como alternativa. Detectar compatibilidad y memoria
  antes de descargar el modelo, exigir una acción explícita, procesar solo
  archivos seleccionados y mantener OpenAI como alternativa cuando el
  navegador no sea apto. No declarar soporte general hasta superar pruebas en
  Chrome, Edge, Firefox y Safari de escritorio y móvil.
  Referencias: [Discogs-EffNet](https://essentia.upf.edu/models.html#discogs-effnet)
  y [ONNX Runtime Web](https://onnxruntime.ai/docs/get-started/with-javascript/web.html).
- [ ] Implementar la clasificación local de escritorio con
  `discogs-maest-30s-pw-519l` y `genre_discogs519`. Los pesos oficiales están
  disponibles en ONNX, el extractor ocupa aproximadamente 348 MB y el modelo
  cubre 519 estilos de Discogs. Ejecutar desde Tauri mediante un runtime nativo,
  descargar el paquete solo con confirmación, verificar integridad y versión,
  limitar memoria, permitir cancelación y conservar el audio y las rutas
  exclusivamente en el dispositivo. Comparar CPU y aceleración disponible antes
  de habilitar análisis masivo.
  Referencia: [MAEST Discogs519](https://essentia.upf.edu/models.html#genre-discogs519).
- [ ] Verificar y documentar antes de distribuir cualquier peso de MTG la
  licencia exacta incluida con cada archivo. La documentación oficial confirma
  uso no comercial, pero muestra referencias distintas a CC BY-NC-SA 4.0 y
  CC BY-NC-ND 4.0; prevalece el `LICENSE` del artefacto descargado. No convertir,
  cuantizar, redistribuir ni incluir modelos en instaladores o cachés públicas
  hasta determinar si la licencia concreta permite esa adaptación y
  distribución. Mantener esta vía limitada a DJOrganizer no comercial o
  sustituirla por una licencia propietaria.
- [ ] Evaluar `laion/larger_clap_music` como alternativa local de licencia
  Apache 2.0 y como proveedor de reserva para escritorio. Comparar precisión,
  latencia, memoria y consumo con MAEST, Discogs-EffNet y OpenAI usando el mismo
  banco de validación. Su clasificación zero-shot debe usar la taxonomía
  controlada de DJOrganizer, confianza visible y aceptación manual. No subir
  audio completo a Supabase, no analizar en segundo plano y ofrecer una salida
  segura cuando el equipo no pueda cargar el modelo.
  Referencia: [laion/larger_clap_music](https://huggingface.co/laion/larger_clap_music).
- [ ] Añadir después el análisis de género por lotes para varias pistas o toda
  la biblioteca. Debe usar el proveedor local compatible con el dispositivo,
  procesar por ventanas acotadas, mostrar modelo, licencia, confianza, coste
  estimado cuando use API, progreso, cancelación, errores parciales y canciones
  omitidas. No reenviar pistas ya clasificadas sin autorización ni aplicar
  géneros automáticamente: las sugerencias se revisan individualmente o
  mediante una confirmación masiva explícita.
- [x] Calcular energía real con una escala documentada y editable.
- [x] Detectar duplicados acústicos o versiones recodificadas, además de copias
  binarias exactas.
- [x] Mejorar confianza y explicación de BPM y tonalidad mediante varias
  ventanas de tempo, concordancia entre resultados, separación entre perfiles
  cromáticos y procedencia visible. La confianza se guarda solo para análisis
  locales; metadatos, correcciones manuales y valores heredados se distinguen
  sin inventar una precisión.
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
- [x] Preparación reproducible de la auditoría con lector de pantalla: matriz de
  flujos, prueba autenticada de contratos semánticos, navegación activa con
  `aria-current`, orden de tabla con `aria-sort`, contador de selección
  anunciable y acciones de pista con contexto accesible.
- [ ] Completar la auditoría manual con NVDA en los flujos autenticados, en
  español e inglés, y verificar de nuevo cualquier defecto corregido.
- [x] Primera fase de onboarding autenticado no bloqueante, ayuda contextual en
  Importar, estados vacíos dependientes de pistas reales y recuperación
  accesible ante errores de carga. El progreso se deriva de conteos existentes,
  sin tabla ni datos de demostración, y los textos nuevos están disponibles en
  español e inglés.
- [x] Infraestructura bilingüe español/inglés, cookie de preferencia y shell
  traducida.
- [x] Interfaz funcional completa en español e inglés: rutas públicas y
  privadas, Biblioteca, importación y análisis local, Crates, VirtualDJ,
  escritorio, offline, backups, diagnóstico, actualizaciones, errores,
  metadatos visibles y nombres accesibles. La paridad se protege con tipos y
  una prueba recursiva; el contenido del usuario y los contratos persistidos no
  se traducen.

### Correcciones UX/UI priorizadas — 2026-07-22

#### P0 — bloqueo visual y datos de sesión

- [x] Corregir el estado contraído de la barra lateral para que la información de
  sesión no desborde ni quede fuera del contenedor. Sustituir la presentación
  principal del correo electrónico por el nombre de usuario solicitado durante
  el registro, con una alternativa segura cuando el perfil todavía no disponga
  de nombre. Mantener accesible el cierre de sesión y no debilitar autenticación,
  RLS ni aislamiento entre usuarios.

#### P1 — navegación y uso de Crates

- [x] Restaurar la barra de desplazamiento en la página **Crates** cuando el
  contenido supere la altura disponible. Validar escritorio, móvil, zoom,
  navegación por teclado y listas largas sin introducir dobles scrolls.
- [x] Rediseñar la columna vertical de creación de crates para que ocupe toda la
  altura útil de la página y mantenga alineados el formulario, la jerarquía y la
  lista de pistas. Conservar creación, selección, orden y responsive actuales.
- [x] Mantener el logo de DJOrganizer visible en todo el shell autenticado,
  incluidos los estados contraídos y las vistas móviles aplicables. Al activarlo
  debe navegar a **Biblioteca**, con nombre accesible y foco visible.

#### P2 — simplificación de Ajustes

- [x] Simplificar **Ajustes** eliminando de la interfaz las secciones de
  diagnóstico privado y actualizaciones de escritorio cuando no deban exponerse
  al usuario final. No borrar sus implementaciones, pruebas ni contratos sin una
  decisión técnica independiente.
- [x] Eliminar de **Ajustes** el resumen informativo de integraciones DJ, que no
  ofrece acciones ni configuración al usuario. Conservar las implementaciones
  reales de VirtualDJ y Rekordbox Bridge, además de los contratos internos de
  VirtualDJ, Rekordbox, Serato y Traktor para sus flujos presentes y futuros.

### Simplificación UX/UI antes del cierre del producto

- [ ] Ejecutar una fase específica de auditoría, simplificación y rediseño UX/UI
  cuando las funcionalidades prioritarias estén implementadas y estabilizadas.
  Debe simplificar recorridos reales antes del pulido visual y conservar todos
  los contratos de seguridad, privacidad, archivos e integraciones ya validados.
- [ ] Auditar registro, importación, revisión musical, biblioteca, crates,
  preparación de sesiones, organización local, backups e integraciones mediante
  pruebas de uso sin instrucciones externas.
- [ ] Corregir primero arquitectura de información, navegación, lenguaje,
  jerarquía de acciones, estados, confirmaciones y recuperación; aplicar después
  el rediseño visual, responsive y de densidad.
- [ ] Validar tiempo, errores, dudas, abandonos y pasos innecesarios con teclado,
  NVDA, móvil, escritorio, conexión lenta y bibliotecas grandes.

El alcance, principios, flujos y definición de terminado de esta fase están
recogidos en [`docs/ux-ui-roadmap.md`](./ux-ui-roadmap.md).

- [x] Contratos de capacidades para Rekordbox, Serato y Traktor.
- [x] Exportación XML de playlists de Rekordbox mediante Bridge desde una sesión
  local de Tauri, sin escribir OneLibrary, Device Library ni audio.
- [ ] Importación desde Rekordbox, cues, loops y beatgrids; OneLibrary y Device
  Library siguen fuera de alcance.
- [ ] Implementaciones posteriores con Serato, Traktor y ecosistemas CDJ,
  después de estabilizar VirtualDJ.
