# DJOrganizer: contexto para Proyectos de ChatGPT

Este archivo está pensado para adjuntarse a un **Proyecto de ChatGPT**. Resume
el producto, el repositorio, las decisiones vigentes y la forma esperada de
trabajar. Para detalles operativos deben consultarse también `README.md`,
`AGENTS.md` y `docs/roadmap.md`.

## Resumen ejecutivo

DJOrganizer es una aplicación para DJs, productores y personas que preparan
bibliotecas musicales. Su objetivo es reducir el tiempo dedicado a buscar,
clasificar y ordenar música antes de una sesión, manteniendo siempre el control
humano sobre metadatos, análisis y archivos locales.

La biblioteca es el centro del producto. Desde ella se importan pistas, se
revisan BPM, tonalidad, Camelot, energía, géneros y etiquetas, se preparan
crates y se construyen progresiones de mezcla. La aplicación web sincroniza
metadatos privados mediante Supabase y la base de escritorio Tauri realiza las
operaciones que requieren acceso seguro al sistema de archivos.

- Repositorio: <https://github.com/Dromart98/DJORGANIZER>
- Producción: <https://djorganizer-beta.vercel.app>
- Idiomas base: español e inglés
- Diseño: oscuro, profesional, denso, accesible y orientado a bibliotecas grandes

## Usuario y problemas que resuelve

El usuario principal es un DJ que necesita:

- encontrar música rápidamente por título, artista, género, BPM o tonalidad;
- combinar filtros sin perder el contexto de la biblioteca;
- detectar duplicados y versiones relacionadas;
- corregir análisis automáticos cuando el oído o los metadatos son mejores;
- preparar crates ordenados y transiciones armónicas explicables;
- intercambiar listas con VirtualDJ sin alterar silenciosamente su biblioteca;
- reorganizar archivos con previsualización, historial y deshacer;
- conservar privacidad sobre audio y rutas locales.

Una decisión no es adecuada solo por ser técnicamente genérica. Debe mejorar
de forma concreta la preparación, búsqueda, clasificación o portabilidad de una
biblioteca musical.

## Principios no negociables

1. La biblioteca musical es la pantalla y el flujo principal.
2. El usuario conserva el control de metadatos, clasificaciones y archivos.
3. Toda operación destructiva necesita previsualización, confirmación,
   historial y recuperación o deshacer cuando corresponda.
4. El audio y las rutas locales son privados. El análisis es local por defecto.
5. Nunca se publican rutas absolutas del dispositivo en la nube.
6. Una importación externa propone cambios antes de aplicarlos.
7. Los filtros deben ser visibles, combinables y responder inmediatamente.
8. La interfaz debe funcionar por teclado y no depender solo de color,
   arrastrar y soltar o iconos.
9. La arquitectura debe permitir integraciones separadas con VirtualDJ,
   Rekordbox, Serato, Traktor y CDJ.
10. Las funciones de IA son sugerencias revisables, no decisiones automáticas.

## Estado funcional

### Cuenta y aislamiento

- Registro, confirmación, login, logout y sesiones SSR.
- Protección de rutas privadas en middleware y en cada operación de servidor.
- PostgreSQL con Row Level Security en todas las tablas personales.
- Separación entre usuarios validada con pgTAP.
- Cabeceras privadas para evitar cachear páginas autenticadas en CDN.

### Biblioteca

- CRUD de pistas y eliminación individual o múltiple confirmada.
- Artista opcional, con presentación coherente como “Artista desconocido”.
- Tabla de escritorio densa y filas móviles sin desbordamiento.
- Búsqueda, filtros combinables, orden y paginación ejecutados en Supabase.
- Estado de búsqueda, filtros y orden conservado en la URL.
- Edición individual y edición masiva de hasta 100 pistas.
- Favoritos/rating, comentarios, etiquetas y detalles de archivo.
- Ventanas SQL acotadas para mantener rendimiento con bibliotecas grandes.

### Importación y análisis local

- Selección de hasta 100 archivos y guardado en lotes de 25.
- Lectura local de etiquetas con `music-metadata`.
- Huella SHA-256 incremental para duplicados binarios exactos.
- Firma acústica compacta para posibles recodificaciones, versiones y remixes.
- Análisis automático y local de BPM, tonalidad, energía y tipo de versión.
- BPM calculado sobre hasta tres ventanas, con normalización de mitad/doble
  tempo, confianza por cobertura/concordancia y explicación visible.
- Tonalidad calculada con cromas y perfiles mayor/menor, mostrando confianza y
  la alternativa más cercana.
- Procedencia diferenciada: análisis local, metadatos, revisión manual o valor
  heredado. Solo los análisis locales reciben una puntuación de confianza.
- Corrección manual siempre disponible y prioritaria.
- El audio no se guarda en Supabase ni se incorpora a backups o cola offline.

### Clasificación de género con OpenAI

- Usa `gpt-audio` con una taxonomía cerrada.
- El botón “Sugerir género con OpenAI” está disponible en cada pista sin una
  casilla global redundante.
- Pulsar el botón autoriza únicamente el fragmento de esa pista.
- El navegador genera un WAV mono de hasta 45 segundos.
- La clave `OPENAI_API_KEY` vive solo en el servidor.
- Hay límite de 20 análisis por usuario y hora.
- La respuesta incluye confianza y explicación.
- La sugerencia nunca se aplica sin revisión y aceptación manual.
- Si falta la clave, el servidor responde que la función no está configurada;
  nunca debe trasladarse la clave al cliente para resolverlo.

### Clasificación local de género en la web

- Usa `discogs-effnet-bs64-1` convertido sin cuantización a TensorFlow.js.
- Se prepara al entrar en Importar, pero solo analiza por acción explícita.
- Mel, inferencia y agregación pesada se ejecutan en un Web Worker.
- Prueba WebGPU, WebGL, WASM y CPU en orden mediante inferencia real.
- Muestra una sugerencia y hasta cuatro alternativas; aceptar solo actualiza el
  formulario temporal y no guarda automáticamente.
- CacheStorage contiene solo archivos versionados del modelo, verificados por
  tamaño y SHA-256; el audio no se cachea ni se sube.
- OpenAI conserva consentimiento, límites, API y revisión manual independientes.
- La inferencia, la caché y el fallback WASM se validaron en Chrome y Edge
  reales; consulta `docs/local-web-genre-classification.md`.

### BPM, tonalidad y mezcla

- BPM editable y utilizable en filtros y orden.
- Tonalidad tradicional normalizada y notación Camelot.
- Compatibilidad armónica por misma posición, adyacentes y relativo
  mayor/menor.
- Recomendaciones limitadas por proximidad de BPM cuando existe tempo.
- Explicaciones visibles para que el DJ entienda por qué una pista se sugiere.
- Energía local 0–100 documentada y editable.

### Crates y etiquetas

- Crates privados con nombre, descripción, jerarquía y orden persistente.
- Añadir, retirar y reordenar pistas sin borrar música de la biblioteca.
- Controles de teclado equivalentes al reordenamiento visual.
- Etiquetas reutilizables y asignación masiva.
- Reconciliación protegida por propiedad y claves foráneas compuestas.

### VirtualDJ y escritorio

- Tauri 2 abre selectores nativos y mantiene las rutas solo en la sesión local.
- Escaneo de carpetas con metadatos, duplicados exactos, búsqueda y paginación.
- Vigilancia incremental manual o cada 30 segundos durante la sesión.
- Previsualización y aplicación de reorganización con validaciones y rollback.
- Escritura explícita de metadatos con copia completa, verificación y deshacer.
- Exportación de selección como List XML de VirtualDJ 2024+ o M3U8 heredada.
- Exportación de crates y jerarquías conservando el orden.
- Previsualización e importación de My Lists mediante combinar o reemplazar.
- Copias de listas existentes y registro de conflictos no resueltos.
- No se modifica `database.xml` ni se inventan campos no documentados.

### Offline, backup y distribución

- PWA instalable con fallback de navegación sin conexión.
- Cola offline local para altas, cambios, eliminaciones, crates, orden y
  etiquetas; no contiene audio ni secretos.
- Reintento, compactación y contrato de conflictos.
- Backup JSON versionado, limitado y restauración confirmada.
- Diagnóstico local opt-in, saneado y exportado manualmente.
- Pipeline de instaladores Tauri para Windows, macOS y Linux. Los instaladores
  se distribuyen sin firma comercial de pago según la política vigente; las
  actualizaciones sí se verifican criptográficamente con las claves de Tauri.

## Arquitectura vigente

### Web

- Next.js 15 con App Router
- React 19
- TypeScript estricto
- Zod para validación de entradas
- Supabase Auth y PostgreSQL
- Vitest y Playwright
- Despliegue automático en Vercel desde `main`

### Audio local

- Web Audio API
- `music-metadata`
- Meyda
- `web-audio-beat-detector`
- Algoritmos puros en TypeScript para normalización, confianza, Camelot,
  energía y similitud

### Escritorio

- Tauri 2
- Rust
- Comandos nativos limitados a selecciones y sesiones confirmadas
- Instaladores y actualizaciones generados desde tags `app-v*`

### Separación de capas

```text
src/app/                rutas, Route Handlers y acciones de servidor
src/components/         interfaz y flujos interactivos
src/lib/                dominio puro, análisis, offline e integraciones
src/types/              contratos y tipos de base de datos
src-tauri/              operaciones nativas acotadas
supabase/migrations/    esquema, índices, restricciones y RLS
supabase/tests/         pruebas pgTAP de base de datos
tests/e2e/              caminos críticos con Playwright
docs/                   decisiones, seguridad, formatos y roadmap
```

El dominio y los contratos no deben depender de futuras aplicaciones móviles.
Las integraciones externas deben permanecer separadas del núcleo musical.

## Modelo de datos

Una pista contempla, según disponibilidad:

- `id`, `title`, `artist`, `album`, `release_year`;
- género, etiquetas, comentarios, favorito/rating;
- `bpm`, tonalidad tradicional, Camelot y energía;
- procedencia, confianza y explicación de análisis;
- duración y fecha de importación;
- nombre, tamaño, tipo y huella del archivo;
- firma acústica y tipo de versión/remix;
- estado de análisis automático.

Un crate contempla:

- `id`, `name`, `description`;
- `parent_id` para jerarquía;
- pistas con posición explícita;
- `created_at` y `updated_at`.

Las asociaciones con rutas absolutas viven exclusivamente en el dispositivo.

## Seguridad y privacidad

- Nunca usar `service_role` ni `OPENAI_API_KEY` en código cliente.
- Revalidar autenticación y propiedad en Route Handlers y acciones.
- Mantener RLS y políticas por propietario en toda tabla personal expuesta.
- No aceptar rutas arbitrarias desde React en comandos Tauri.
- Usar selectores nativos, raíces confirmadas e identificadores opacos.
- Antes de mover o escribir: comprobar existencia, tamaño, destino y cambios
  externos; revertir un lote si falla parcialmente.
- No cachear respuestas privadas, cookies ni páginas autenticadas.
- Limitar y validar backups antes de restaurarlos.
- No registrar audio, claves, correos, rutas o bibliotecas en diagnósticos.
- Cualquier envío remoto de audio debe ser visible, acotado y autorizado por
  una acción explícita para ese fragmento.

## UX y accesibilidad

- Tema oscuro de alto contraste con acento menta controlado.
- Densidad de herramienta profesional en escritorio y objetivos táctiles en
  móvil.
- Foco visible, enlace de salto y navegación completa por teclado.
- Estados `aria-live` para progreso, errores y resultados.
- Respeto a `prefers-reduced-motion`.
- Estados diseñados para vacío, carga, error, offline, conflicto, éxito y
  recuperación.
- No depender solo de color, iconos o drag-and-drop.
- Mantener filtros, orden, búsqueda y paginación en URL o estado persistente.
- Onboarding autenticado no bloqueante, ayuda contextual y recuperación accesible
  ante errores de carga ya implementados.
- Interfaz funcional completa en español e inglés, protegida por paridad de tipos
  y pruebas; el contenido introducido por el usuario no se traduce.

## Integraciones y límites conocidos

- VirtualDJ es la integración real prioritaria y utiliza My Lists XML.
- M3U8 se conserva como compatibilidad heredada.
- Cues, colores e historial no se escriben mientras My Lists no publique un
  contrato oficial estable para esos campos.
- Rekordbox dispone de exportación XML de playlists mediante Bridge desde Tauri,
  con previsualización y confirmación; la importación, cues, loops y beatgrids
  siguen pendientes.
- Serato y Traktor mantienen contratos de capacidad, pero sus integraciones reales
  siguen pendientes.
- CDJ y clientes móviles son trabajo futuro.
- La confianza de BPM o tonalidad orienta la revisión; no certifica una verdad
  musical absoluta.
- El análisis puede ser ambiguo ante sincopación, tempo variable, modulaciones,
  ruido, silencio o mezclas complejas.

## Calidad y definición de terminado

Una función no está terminada por tener interfaz. Debe:

- completar un flujo útil;
- validar entradas, límites, autenticación y propiedad;
- cubrir errores, vacío, carga, offline y recuperación cuando correspondan;
- funcionar por teclado y en móvil sin desbordamientos;
- incluir pruebas unitarias del dominio;
- incluir E2E en el camino crítico cuando sea viable;
- superar typecheck, lint, tests, build web y validación Rust afectada;
- documentar privacidad, formatos o limitaciones no evidentes;
- no romper el orden de crates, el aislamiento por usuario ni la privacidad
  local.

Comandos habituales:

```bash
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
supabase test db
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml --all-targets
cargo test --manifest-path src-tauri/Cargo.toml
```

CI ejecuta validación web, Supabase efímero, E2E autenticado y validación del
escritorio. La base E2E genera WAV sintéticos en memoria; no usa música real.

## Documentos de referencia

- `AGENTS.md`: reglas duraderas de producto y repositorio.
- `README.md`: instalación, arquitectura y detalle de funciones.
- `docs/roadmap.md`: implementado, pendiente y decisiones bloqueadas.
- `docs/roadmap-incidencias-observadas.md`: errores y ajustes detectados durante
  el uso real, ordenados por prioridad y causa raíz.
- `docs/audio-analysis-confidence.md`: significado y límites de la confianza.
- `docs/desktop-folder-scanning.md`: privacidad y seguridad del escaneo.
- `docs/distribution.md`: instaladores, firmas y actualizaciones.

Ante contradicciones, prevalecen las instrucciones más recientes del usuario y
las restricciones de seguridad. No describir como implementado algo que solo
está preparado por contrato o bloqueado por credenciales, certificados o
especificaciones externas.

## Forma de trabajo solicitada

- Trabajar sobre una fase o cambio concreto y no mezclar trabajos independientes
  en una misma PR.
- Hacer supuestos razonables solo cuando no cambien materialmente el alcance.
- Incluir todo el worktree cuando el usuario confirme ese alcance.
- No pasar a una fase nueva mientras exista un error base o la PR actual no esté
  validada y fusionada.
- Tras validar y fusionar una PR, revisar `main`, las PR pendientes y el roadmap y
  pasar automáticamente a la siguiente fase prevista, salvo bloqueo, decisión
  pendiente o indicación expresa del usuario de detenerse.
- Usar el conector de GitHub para revisar PR, ramas, SHA, commits, diffs, checks,
  comentarios y merges; reservar Codex principalmente para modificaciones de código.
- Verificar el estado real antes de afirmar que algo está creado, probado, publicado,
  fusionado o desplegado.
- Mantener `README.md`, `docs/roadmap.md` y la documentación de contexto sincronizados
  cuando cambie el estado funcional.
- Informar con claridad qué está implementado, qué es solo un contrato y qué depende
  de servicios, credenciales o validaciones externas.

## Prioridades pendientes

Según el roadmap actual, los bloques principales todavía abiertos son:

- corregir primero las incidencias observadas: error intermitente de Inicio,
  visibilidad de etiquetas, análisis musical unificado, género/subgénero automático
  y simplificaciones de navegación y lenguaje;
- completar el flujo posterior al análisis y la organización configurable de
  archivos, incluido el campo persistente de subgénero;
- añadir gestión avanzada de biblioteca y crates: crates inteligentes, salud de
  biblioteca, limpieza de metadatos, reparación de pistas, archivado, historial y
  preescucha ligera;
- completar la evaluación de clasificación de género, proveedores de escritorio y
  análisis por lotes;
- completar la auditoría manual con NVDA en español e inglés;
- ejecutar la fase final específica de simplificación y revisión premium de UX/UI;
- completar la importación y capacidades pendientes de Rekordbox y, después,
  las integraciones reales con Serato, Traktor y ecosistemas CDJ.

Tras cada PR validada y fusionada se continuará con la siguiente fase prevista salvo
bloqueo, decisión pendiente o indicación expresa del usuario de detenerse.
