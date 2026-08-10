# Roadmap de DJOrganizer

Actualizado: 2026-08-10.

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

### Flujo posterior al análisis y organización configurable

Orden de implementación recomendado para convertir el análisis musical en un
resultado directamente utilizable:

1. - [ ] Añadir una pantalla de acciones al terminar el análisis que muestre el
   resumen de pistas correctas, ambiguas, duplicadas y fallidas. Debe permitir
   revisar resultados, crear un crate directamente, previsualizar la
   organización, mover archivos con reglas configurables, escribir metadatos,
   exportar desde el mismo recorrido o terminar sin modificar nada. La
   previsualización será obligatoria antes de cualquier movimiento y ninguna
   acción destructiva se ejecutará automáticamente.
2. - [ ] Permitir crear un crate directamente desde la tanda analizada, la
   selección actual o los filtros activos. Debe conservar el orden visible,
   excluir únicamente las pistas que el usuario confirme y mostrar errores
   parciales sin perder las incorporaciones correctas.
3. - [ ] Añadir una plantilla de organización física de un solo nivel por género,
   además de las plantillas existentes. Debe previsualizar destinos, sanear
   nombres, resolver colisiones, confirmar el lote y conservar deshacer.
4. - [ ] Añadir organización física por rangos de BPM configurables. Debe admitir
   una estructura exclusiva por rango y combinaciones como género/rango de BPM,
   energía/rango de BPM o tonalidad/rango de BPM. Los límites se revisan antes de
   aplicar y nunca se crea una carpeta por valor exacto salvo elección expresa.
5. - [ ] Sustituir la dependencia exclusiva de plantillas fijas por un constructor
   de reglas de organización de uno a tres niveles. Los niveles disponibles serán
   género, subgénero cuando exista, artista, álbum, tonalidad, Camelot, BPM,
   rango de BPM, energía y año. Debe impedir combinaciones vacías o duplicadas y
   mostrar el árbol resultante antes de mover archivos.
6. - [x] Incorporar un campo persistente e independiente de subgénero. Añadirlo a
   migraciones, tipos, importación, edición individual y masiva, búsqueda,
   filtros, ordenación y sugerencias revisables. Mantener género y subgénero como
   datos separados, no sobrescribir correcciones manuales y exportarlo solo donde
   el formato de destino tenga un contrato compatible.
7. - [ ] Añadir la organización física género/subgénero después de estabilizar el
   nuevo campo. Las pistas sin subgénero deben permanecer visibles en la
   previsualización y usar una carpeta neutral configurable o quedar excluidas
   mediante confirmación; nunca se inventarán coincidencias.

Todas estas fases pertenecen a Tauri cuando afectan a archivos locales. React y
Supabase solo manejarán metadatos e identificadores opacos; las rutas absolutas
seguirán dentro de la sesión nativa. Cada movimiento conservará previsualización,
confirmación explícita, validación de pertenencia, procesamiento por lotes,
protección contra sobrescrituras, rollback y deshacer cuando el archivo no haya
cambiado externamente.

### Gestión avanzada de biblioteca y crates

Orden de implementación recomendado para mejorar la preparación y el mantenimiento
de bibliotecas grandes sin convertir DJOrganizer en software de mezcla:

1. - [ ] Crear crates inteligentes con reglas persistentes sobre género,
   subgénero, BPM, rango de BPM, tonalidad, Camelot, energía, valoración, año,
   etiquetas y demás campos compatibles. Deben admitir grupos `Y` y `O`, mostrar
   una previsualización del resultado y actualizarse al cambiar la biblioteca sin
   duplicar pistas ni modificar archivos.
2. - [ ] Añadir un centro de salud de la biblioteca que detecte archivos no
   encontrados, ilegibles o corruptos, rutas modificadas, archivos presentes en
   carpetas confirmadas pero aún no importados, posibles duplicados y metadatos
   ausentes o inválidos. La detección de campos incompletos se integra aquí, no
   tendrá una pantalla independiente y nunca buscará ni rellenará datos externos
   automáticamente. Las pistas sin BPM o tonalidad podrán enviarse al análisis
   local existente mediante una acción explícita.
3. - [ ] Incorporar una limpieza guiada de metadatos con propuestas revisables para
   normalizar mayúsculas, espacios, separadores, nombres de género, artistas y
   textos residuales como URLs o prefijos numéricos. Debe mostrar valor actual y
   propuesto, permitir selección individual o masiva y no sobrescribir
   correcciones manuales sin confirmación. Escribir cambios en audio seguirá
   requiriendo Tauri, copia de seguridad, relectura y validación.
4. - [ ] Reparar referencias a pistas perdidas mediante coincidencias verificables
   por huella, hash cuando exista, tamaño, duración y metadatos. Mostrar las
   alternativas y su confianza, exigir confirmación por pista o lote y no inventar
   coincidencias. Las rutas absolutas permanecerán dentro de la sesión nativa.
5. - [ ] Permitir archivar pistas inactivas sin borrar ni mover el archivo. Las
   pistas archivadas quedarán fuera de la biblioteca principal, recomendaciones y
   crates inteligentes salvo filtro explícito, y podrán restaurarse conservando
   sus metadatos, etiquetas y relaciones.
6. - [ ] Añadir herramientas avanzadas para crates: fusionar, comparar, encontrar
   pistas comunes o exclusivas, mostrar en qué crates aparece una pista, ordenar
   por BPM, Camelot, energía o valoración y retirar duplicados internos sin borrar
   canciones de la biblioteca. Todas las operaciones deben conservar el orden o
   mostrar una previsualización cuando lo alteren.
7. - [ ] Extender el historial y deshacer a edición individual y masiva,
   normalización, etiquetas, valoración, archivado, cambios de crates y aceptación
   masiva de sugerencias. Guardar el estado anterior necesario, aislarlo por
   usuario y permitir la reversión solo cuando el estado actual siga siendo
   compatible. Si hubo cambios posteriores o externos, bloquear el deshacer y
   explicar el conflicto sin forzar una restauración.
8. - [ ] Añadir una preescucha ligera para revisar pistas desde la biblioteca,
   resultados de análisis y crates: reproducir, pausar, buscar dentro de la pista,
   controlar volumen y mantener una cola temporal. No añadir decks, mezcla,
   sincronización, efectos, stems ni otras funciones propias de VirtualDJ. El
   acceso a audio local y rutas arbitrarias seguirá aislado en Tauri y limitado a
   archivos seleccionados o pertenecientes a una sesión confirmada.

Quedan fuera de esta fase el emparejamiento de listas de clientes, la búsqueda
automática de metadatos en Internet y cualquier almacenamiento remoto del audio.

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
  manuales.
- [x] Completar la prueba de concepto web local con el modelo oficial
  `discogs-effnet-bs64-1`, convertido sin cuantización a TensorFlow.js. La
  conversión y equivalencia ya están demostradas; Importar prepara el modelo en
  segundo plano, ejecuta Mel/inferencia en un Worker, verifica SHA-256, reutiliza
  una caché offline versionada y exige aceptación manual por pista. OpenAI sigue
  como alternativa independiente. La inferencia real, la caché y el fallback
  WASM están registrados en Chrome y Edge de escritorio; Firefox, Safari y
  móvil quedan fuera del alcance de esta prueba de concepto.
  Referencia: [`docs/local-web-genre-classification.md`](local-web-genre-classification.md).
- [x] Implementar y validar la base del runtime local de escritorio con
  `discogs-maest-30s-pw-519l`: manifiesto fijado, descarga confirmada, tamaño y
  SHA-256 verificados, catálogo oficial ordenado de 519 clases, sesión reutilizable
  de ONNX Runtime e inferencia real en Linux y Windows. El instalador NSIS x64
  enlaza ONNX Runtime estáticamente y se instaló e inspeccionó en CI. El
  preprocesamiento puro desde PCM mono `f32` a 16 kHz hasta `1876 × 96` también
  está reproducido y validado numéricamente frente a Essentia. La decodificación
  interna, por contenido y acotada a PCM mono `f32` conserva la frecuencia
  original y está configurada para MP3, FLAC, WAV/PCM, AAC en M4A/MP4 y
  OGG/Vorbis; las pruebas directas actuales cubren WAV/PCM y FLAC. El remuestreo
  interno, determinista y acotado desde PCM mono finito a 16 kHz también está
  implementado con identidad exacta cuando la entrada ya está a 16 kHz. El
  pipeline interno conecta las tres capas, selecciona de forma determinista hasta
  tres ventanas de 30 segundos (inicio, centro y final) desde duración nativa
  fiable, con fallback únicamente a la ventana inicial cuando el seek adicional
  no es soportado de forma segura. Cada ventana exige 480 000 muestras
  remuestreadas sin relleno y produce 180 096 valores finitos; las ventanas se
  procesan con memoria acotada. El orquestador ejecuta sus inferencias bajo un
  único gate y agrega por clase mediante media aritmética antes de resolver la
  propuesta Discogs de género/subgénero. Los nuevos resultados usan una
  compatibility key específica multi-ventana y la evidencia legacy de una sola
  ventana continúa siendo válida sin migración. Esta base todavía no constituye
  un analizador completo de canciones.
  Referencia: [`docs/desktop-maest-foundation.md`](desktop-maest-foundation.md).
- [x] Exponer el análisis MAEST seguro de una única pista confirmada por la
  sesión nativa de escaneo. El flujo resuelve `sessionId + scanId + operationId`
  dentro de Rust, arma la operación nativa antes de permitir cancelarla, revalida
  el archivo antes y después, exige el modelo ya preparado y devuelve una
  propuesta revisable que no se aplica ni persiste.
- [x] Integrar el análisis MAEST por pista con la edición de Biblioteca como
  previsualización efímera de género y subgénero, disponible solo
  para vínculos de la sesión de escaneo activa y sin persistencia ni escritura.
- [x] Permitir aplicar explícitamente una propuesta MAEST válida al formulario de
  edición. Solo se copian valores no vacíos, nunca se guarda automáticamente y el
  usuario puede revisar o modificar género/subgénero antes de usar `Guardar cambios`.
- [x] Persistir de forma segura la evidencia/procedencia MAEST por campo cuando
  una propuesta aplicada se guarda: identidad y versión del analizador,
  compatibility key, fecha y score bruto interno. La validación server-side
  degrada evidencia inválida a edición manual, la edición posterior invalida solo
  el campo afectado y offline, edición masiva y backups conservan las mismas
  reglas sin almacenar rutas, IDs de sesión/escaneo ni audio.
- [x] Escribir de forma explícita y segura el género MAEST persistido en la
  etiqueta estándar `Genre` del archivo local desde Tauri. El flujo exige
  previsualización y confirmación, crea backup, relee y verifica que solo cambió
  `Genre`, registra historial/deshacer y mantiene aliases locales acotados para
  conservar el vínculo tras cambiar la huella; nunca escribe subgénero ni datos
  internos MAEST en el archivo.
- [x] Analizar pistas largas con hasta tres ventanas MAEST deterministas de 30 s
  (inicio, centro y final), deduplicadas en tiempo real, agregando los 519 scores
  por media aritmética bajo un único `InferenceGate`. Duración no fiable conserva
  la primera ventana y solo la falta de seek seguro permite fallback; errores
  reales de decode/resample/preprocess se propagan. Los resultados nuevos usan
  compatibility key v3 y la evidencia legacy v2 sigue aceptada.
- [x] Cancelar cooperativamente un análisis MAEST de una pista mediante un
  `operationId` UUID opaco y efímero. El handshake `prepare → begin → armed →
  analyze` garantiza que la operación exacta existe antes de mostrar el control de
  cancelación; Rust comprueba el flag entre ventanas y paquetes y antes/después de
  inferencia, descarta cualquier salida parcial y libera `InferenceGate` y el
  registro por RAII. Cambios de identidad y desmontaje de la vista liberan o
  cancelan la operación exacta sin afectar análisis posteriores.
- [ ] Completar la clasificación local de escritorio con MAEST: escritura de
  subgénero u otras etiquetas portables, progreso y lotes. Conservar audio y rutas
  exclusivamente en el dispositivo y comparar CPU y aceleración disponible antes
  de habilitar análisis masivo.
  Referencia: [MAEST Discogs519](https://essentia.upf.edu/models.html#genre-discogs519).
- [x] Verificar y documentar la licencia de `discogs-effnet-bs64-1`: modelo y
  derivados bajo CC BY-NC-SA 4.0, con atribución separada, ShareAlike y uso
  previsto no comercial. Repetir esta verificación antes de incorporar
  cualquier otro peso de MTG; no asumir que MAEST u otros artefactos comparten
  la misma licencia.
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
- [x] Pipeline de instaladores para Windows, macOS y Linux mediante Tauri y
  GitHub Actions.
- [x] Actualizaciones verificadas criptográficamente con las claves gratuitas de
  Tauri, separadas de la firma comercial del instalador por el sistema operativo.
- [x] Política de distribución sin costes: no contratar Apple Developer Program,
  certificados de firma de Windows ni servicios de firma de pago. Los instaladores
  de Windows y macOS se publicarán sin firma comercial, con sus posibles avisos o
  bloqueos iniciales claramente documentados y con instrucciones seguras para el
  usuario. Reconsiderar certificados de pago solo mediante una decisión futura
  independiente.
- [x] Copias de seguridad, exportación general de datos y restauración.
- [x] Diagnóstico local opt-in para exportación manual: conserva como máximo 100
  eventos técnicos saneados y nunca envía biblioteca, audio, rutas, cookies,
  cuenta o credenciales.

### Fiabilidad operativa, observabilidad y releases

Prioridad: alta antes de considerar estable la distribución pública.

1. - [ ] **Logs estructurados locales y de servidor.** Unificar los eventos
   técnicos relevantes en un formato estructurado y versionado con timestamp,
   severidad, componente, operación, versión de la aplicación y un identificador
   de correlación. El diagnóstico local existente seguirá siendo privado y
   acotado: nunca incluir rutas absolutas, audio, biblioteca, cookies, tokens,
   credenciales ni contenido del usuario. Los logs de servidor tampoco deben
   registrar payloads de audio ni respuestas crudas de proveedores.
2. - [ ] **Monitoreo de errores y crashes.** Capturar excepciones no controladas
   de Next.js y fallos/crashes relevantes de Tauri/Rust con stack, release y
   correlación suficiente para encontrar la causa raíz. Cualquier telemetría
   remota del escritorio debe ser explícita, mínima y respetar el principio
   local-first; el usuario debe poder seguir exportando diagnóstico saneado de
   forma manual. Configurar alertas solo para errores accionables y regresiones.
3. - [ ] **Rate limiting solo en superficies remotas.** Auditar autenticación,
   endpoints de servidor y funciones que consumen OpenAI u otros proveedores,
   reutilizando los límites por usuario ya existentes y añadiendo protección
   adicional donde haya riesgo real de abuso. No aplicar rate limiting al
   análisis MAEST local, escaneo, lectura de archivos ni otras operaciones Tauri
   que no consumen un servicio remoto.
4. - [ ] **Health checks y diagnóstico de dependencias.** Añadir un health check
   web mínimo y seguro para comprobar disponibilidad del servicio y Supabase sin
   exponer configuración. En escritorio, ofrecer comprobaciones locales de
   readiness para componentes críticos como runtime, modelo preparado y acceso a
   recursos de la sesión, sin publicar rutas. Los proveedores externos no
   críticos se supervisarán mediante errores/métricas, no con llamadas costosas
   en cada sondeo.
5. - [ ] **Rollback de releases.** Definir un procedimiento probado para retirar
   una versión web o actualización de escritorio defectuosa y volver a la última
   release estable. Conservar instaladores/releases identificables por versión y
   SHA, verificar compatibilidad de datos/backups antes de actualizaciones que
   cambien contratos y documentar cómo deshabilitar una actualización publicada
   si aparece un fallo bloqueante. Ejecutar un simulacro no destructivo antes de
   cerrar esta fase.
6. - [ ] **Ciclo de vida y rotación de secretos.** Mantener inventario y
   procedimiento de rotación/revocación para credenciales server-side como
   Supabase y OpenAI. Ningún secreto de servidor debe empaquetarse en Tauri ni
   almacenarse en logs. Definir cadencia según riesgo/proveedor, soportar
   revocación de emergencia y verificar tras cada rotación que la clave anterior
   queda inutilizada sin interrumpir los flujos que dependen del servidor.

Orden recomendado dentro de esta fase: monitoreo de errores → logs estructurados
→ límites remotos → health/readiness → rollback de releases → rotación de
secretos. Cada punto se implementará en una PR independiente y con pruebas
focalizadas sobre el comportamiento nuevo.

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


## Contrato musical estabilizado (implementado)

- Subgénero persistente e independiente, integrado en importación, edición y consultas de Biblioteca.
- Energía visible y persistida como entero 0–10, con migración determinista de datos 0–100.
- Procedencia neutral (`automatic`, `metadata`, `manual`, `unknown`) y contrato TypeScript por campo para analizadores presentes y futuros.
- La base del runtime MAEST y el pipeline interno acotado por contenido —decodificación a PCM mono `f32`, remuestreo a exactamente 480 000 muestras a 16 kHz, preprocesamiento a `1876 × 96`, inferencia ONNX de 519 scores internos y propuesta Discogs— están implementados y validados. El análisis por pista, su previsualización efímera, la aplicación explícita al formulario y la persistencia validada por campo de identidad/version/compatibility key/fecha/score bruto MAEST están implementados; la propuesta nunca se guarda automáticamente y las ediciones manuales invalidan la evidencia correspondiente. La escritura explícita y segura de la etiqueta estándar `Genre` desde un género MAEST persistido también está implementada mediante previsualización, confirmación, backup, verificación, historial/deshacer y aliases locales acotados. El análisis de pistas largas usa hasta tres ventanas deterministas de 30 s (inicio, centro y final), deduplicadas y agregadas por media aritmética bajo un único `InferenceGate`; solo una incapacidad real de seek seguro degrada a la primera ventana, mientras que errores de decode/resample/preprocess se propagan. Los resultados multi-ventana usan una compatibility key v3 y la evidencia legacy v2 continúa aceptada sin migración. La cancelación cooperativa por pista también está implementada con `operationId` efímero, handshake nativo previo a la ejecución, checkpoints acotados de cancelación, cleanup de lifecycle y descarte de resultados parciales sin bloquear el `InferenceGate`. La escritura de subgénero u otras etiquetas, progreso y lotes siguen pendientes. OpenAI permanece disponible sin definir el dominio persistido.

## Gate de distribución pública — orden obligatorio

**Prioridad: crítica antes de considerar DJOrganizer listo para usuarios externos. Estado: pendiente.**

Este gate no sustituye las fases anteriores: las agrupa como criterios de cierre y añade únicamente lo que falta para una distribución pública seria. El orden es deliberado y cada punto se implementará en una PR independiente cuando requiera cambios de código.

1. - [ ] **Seguridad, privacidad y aislamiento local-first.** Auditar autenticación, RLS, endpoints remotos, secretos, permisos de Tauri, acceso a archivos, sesiones de escaneo y límites entre web/escritorio. Confirmar que audio completo y rutas absolutas no abandonan el dispositivo salvo una acción remota explícita ya documentada y acotada.
2. - [ ] **Seguridad de archivos y recuperación real.** Revalidar backups, restauración, historial/deshacer, escritura de metadatos, reorganización y detección de cambios externos con archivos reales. Ninguna operación destructiva debe continuar si la previsualización, relectura o verificación posterior falla.
3. - [ ] **Instalación, actualización, desinstalación y rollback.** Probar instalación limpia, reinstalación, actualización, desinstalación y vuelta a una release estable en los sistemas que se vayan a distribuir. Mantener versión, SHA, compatibilidad de datos y changelog por release; los avisos derivados de instaladores sin firma comercial deben estar documentados.
4. - [ ] **Cerrar observabilidad y fiabilidad operativa.** Completar monitoreo de errores/crashes, logs estructurados, rate limiting remoto, health/readiness, rollback y rotación de secretos definidos en la fase anterior. La telemetría del escritorio debe seguir siendo mínima y explícita, sin biblioteca, audio, rutas ni credenciales.
5. - [ ] **E2E críticos y matriz de archivos reales.** Validar importación, escaneo, análisis local, edición/aplicación MAEST, crates, organización, escritura segura de metadatos, VirtualDJ, Rekordbox Bridge, offline, backup/restauración y recuperación de errores. Cubrir como mínimo los formatos declarados como soportados y corregir/revalidar cualquier defecto bloqueante o de prioridad alta.
6. - [ ] **Compatibilidad y rendimiento publicados.** Definir y probar sistemas operativos, versiones relevantes de integraciones, formatos compatibles, límites de biblioteca, CPU, memoria, tiempo de análisis y requisitos del runtime/modelos. No prometer soporte que solo exista en código sin prueba real.
7. - [ ] **Privacidad, términos, licencias y atribuciones.** Publicar política de privacidad y términos de uso coherentes con el comportamiento real; explicar qué se procesa localmente y qué puede enviarse a servicios externos; revisar licencias y atribuciones de modelos, pesos, SDK y dependencias antes de cada distribución.
8. - [ ] **Web pública mínima.** Preparar landing con CTA claro de descarga/prueba, 404 personalizada, `robots.txt`, títulos y meta descriptions únicos, imagen Open Graph/social, `alt` útil, enlaces internos y FAQ. Un CTA fijo en móvil solo se añadirá si mejora la landing; las rutas privadas de la app no se indexan.
9. - [ ] **Analítica mínima en la web, no en la biblioteca.** Medir únicamente tráfico, descargas y conversiones necesarias para producto mediante una solución respetuosa con privacidad. No enviar pistas, audio, rutas, crates, metadatos privados ni comportamiento de análisis como analítica de marketing.
10. - [ ] **Soporte y comunicación de release.** Mantener canal para reportar fallos, FAQ de instalación/privacidad/integraciones, changelog y notas de versión con limitaciones y formatos realmente soportados.

No se consideran requisitos actuales: testimonios, casos de estudio, mapa o indicaciones, Local Schema, foto de equipo o promesas comerciales de tiempo de respuesta.
