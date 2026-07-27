# DJOrganizer: guía duradera del producto y del repositorio

## Rol y objetivo

Actúa como especialista en desarrollo de aplicaciones, arquitectura de
software, experiencia de usuario y herramientas para DJs.

DJOrganizer es una aplicación para DJs, productores musicales y personas que
organizan bibliotecas musicales. Debe permitir preparar sesiones, sets,
playlists y colecciones de forma rápida, clara y fiable.

Las decisiones de producto y arquitectura deben estar adaptadas al trabajo real
de un DJ. Evita soluciones genéricas que no mejoren la búsqueda, clasificación,
preparación o portabilidad de una biblioteca musical.

## Principios del producto

- La biblioteca musical es la pantalla y el flujo principal.
- El usuario conserva siempre el control sobre metadatos, clasificaciones y
  cambios en archivos.
- Las operaciones destructivas requieren previsualización, confirmación,
  historial y una vía de recuperación o deshacer.
- El audio y las rutas locales son privados. El análisis debe ser local por
  defecto; cualquier envío remoto requiere consentimiento explícito y revisión.
- La interfaz debe ser oscura, profesional, rápida, accesible y utilizable con
  bibliotecas grandes.
- Los filtros deben permanecer visibles, ser combinables y ofrecer resultados
  inmediatos.
- La arquitectura debe mantenerse abierta a VirtualDJ, Rekordbox, Serato,
  Traktor y ecosistemas CDJ mediante contratos de integración separados del
  dominio.

## Capacidades requeridas

### Biblioteca musical

- Importar canciones desde el dispositivo.
- Leer, analizar o registrar metadatos.
- Mostrar una tabla o lista ordenable y una vista de detalle.
- Editar una pista y realizar ediciones masivas.
- Buscar por título, artista, género, BPM y tonalidad.
- Filtrar por género, rango de BPM, tonalidad/Camelot, energía, fecha de
  importación y etiquetas.
- Soportar notas, favoritos y etiquetas personalizadas.
- Mantener buen rendimiento con decenas de miles de pistas.

### BPM y energía

- Detectar o registrar BPM y permitir corrección manual.
- Ordenar ascendente y descendentemente.
- Ofrecer grupos útiles: 90–100, 100–110, 110–120, 120–130 y 130+ BPM.
- Calcular energía con una escala 0–10 documentada, explicable y editable.

### Géneros

- Clasificar por género y permitir múltiples géneros o etiquetas por pista.
- Crear, editar y eliminar clasificaciones personalizadas.
- La clasificación con OpenAI `gpt-audio` es opcional: consentimiento por
  fragmento autorizado, clave solo en servidor, taxonomía cerrada, límites de
  coste/tamaño, confianza visible y aplicación únicamente tras revisión manual.

### Tonalidad y mezcla armónica

- Registrar tonalidad tradicional, por ejemplo `Am`, `C` o `F#m`.
- Normalizar y mostrar opcionalmente la notación Camelot, por ejemplo `8A`.
- Sugerir pistas armónicamente compatibles y con BPM próximo.
- Explicar la compatibilidad para ayudar a crear transiciones fluidas.

### Crates, playlists y sets

- Crear playlists/crates con nombre, descripción, jerarquía y orden persistente.
- Añadir, retirar y reordenar canciones; favorecer arrastrar y soltar cuando sea
  accesible y mantener controles de teclado equivalentes.
- Sugerir canciones por BPM, tonalidad y energía.
- Poder ordenar una sesión para construir una progresión musical.
- Exportar listas completas, múltiples y jerárquicas a VirtualDJ conservando el
  orden.
- Importar My Lists en modo de previsualización y reconciliar conflictos sin
  sobrescribir silenciosamente.

## Modelo de dominio mínimo

Una pista debe contemplar:

- `id`, `title` y `artist` opcional
- género(s), etiquetas y notas
- `bpm`, tonalidad tradicional y Camelot
- energía 0–10
- duración, fecha de importación y favorito/rating
- nombre/tamaño/tipo/huella del archivo
- firma acústica y tipo de versión/remix cuando estén disponibles
- estado, procedencia y confianza de cada análisis automático

Un crate o playlist debe contemplar:

- `id`, `name`, `description`
- jerarquía opcional
- canciones con posición explícita
- `createdAt` y `updatedAt`

Nunca publiques rutas absolutas del dispositivo en la nube. Las asociaciones
entre registros persistentes y archivos locales deben vivir en el dispositivo.

## Stack y arquitectura vigentes

La opción principal es:

- Next.js App Router, React y TypeScript estricto para la aplicación web/PWA.
- Supabase Auth y PostgreSQL con RLS para datos personales sincronizados.
- Tauri 2 y Rust para acceso seguro al sistema de archivos, exportaciones,
  reorganización, instaladores y actualizaciones.
- Web Audio, music-metadata, Meyda y algoritmos locales para análisis.
- Vitest para el dominio y Playwright para flujos end-to-end.

Mantén separadas estas capas:

- `src/app`: rutas, Route Handlers y acciones de servidor.
- `src/components`: interfaz y flujos interactivos.
- `src/lib`: dominio puro, análisis, offline, backup e integraciones.
- `src/types`: contratos y tipos de base de datos.
- `src-tauri`: operaciones nativas limitadas a selecciones confirmadas.
- `supabase/migrations`: esquema, índices y RLS versionados.
- `docs`: decisiones, seguridad, formatos y roadmap.

Las aplicaciones móviles futuras deben reutilizar contratos y dominio, no
forzar ahora dependencias móviles dentro del frontend principal.

## Reglas de seguridad y datos

- Toda tabla personal expuesta debe tener RLS y políticas por propietario.
- Nunca uses una clave `service_role` o `OPENAI_API_KEY` en el cliente.
- Revalida autenticación y propiedad en Route Handlers/acciones; el middleware
  no es una barrera suficiente.
- No aceptes rutas arbitrarias de la web en comandos Tauri. Usa selectores
  nativos, raíces confirmadas e identificadores opacos de sesión.
- Antes de mover archivos, comprueba existencia, tamaño, destino y cambios
  externos. Si falla un lote, revierte lo ya aplicado.
- Una importación externa propone cambios antes de aplicarlos.
- Las copias de seguridad deben estar versionadas, validadas y limitadas.
- La cola offline no debe almacenar audio ni secretos.

## UX y accesibilidad

- Modo oscuro de alto contraste con densidad apropiada para herramientas DJ.
- Tabla densa en escritorio y filas táctiles sin desbordamiento en móvil.
- Foco visible, nombres accesibles, estados `aria-live`, navegación completa por
  teclado y respeto a `prefers-reduced-motion`.
- No dependas solo de color, drag-and-drop o iconos para transmitir acciones.
- Diseña estados vacíos, carga, error, offline, conflicto, éxito y recuperación.
- Internacionaliza textos de interfaz; español e inglés son los idiomas base.
- Conserva búsquedas, filtros, orden y paginación en URL o estado persistente.

## Fases del producto

### MVP

- Autenticación y aislamiento por usuario.
- CRUD de biblioteca, filtros, orden y edición.
- Importación local de metadatos y duplicados exactos.
- BPM, tonalidad, Camelot, crates, etiquetas y recomendaciones armónicas.
- PWA y base de escritorio segura.

### Versión avanzada

- Energía, firmas acústicas y versiones/remixes.
- Clasificación opt-in con `gpt-audio`.
- Crates jerárquicos y sincronización VirtualDJ bidireccional.
- Reorganización real con historial/deshacer.
- Cola offline, reconciliación de conflictos y backup/restauración.
- Instaladores, actualizaciones verificadas y E2E.

### Funciones futuras

- Rekordbox, Serato, Traktor y CDJ.
- Cue points, colores e historial únicamente tras validar cada formato oficial.
- Análisis más preciso y explicable.
- Clientes móviles centrados en revisión, preparación y sincronización.

## Criterios de aceptación

Una función se considera terminada cuando:

- Tiene flujo útil y completo, no solo una interfaz o placeholder.
- Valida entradas, propiedad y límites de seguridad.
- Incluye estados de error, vacío, carga, offline y recuperación pertinentes.
- Es accesible por teclado y no introduce desbordamientos móviles.
- Tiene pruebas unitarias del dominio y E2E para el camino crítico cuando
  corresponde.
- Supera `typecheck`, lint, pruebas, build web y validación Rust afectada.
- Documenta decisiones de privacidad, formatos o limitaciones no obvias.
- No rompe orden de crates, aislamiento entre usuarios ni privacidad local.

## Roadmap y entregables vivos

Mantén actualizados `README.md` y `docs/roadmap.md` con:

- descripción general y funciones disponibles;
- flujo principal y estructura de pantallas;
- modelo de datos y arquitectura;
- MVP, versión avanzada y funciones futuras;
- criterios de aceptación y decisiones UI/UX;
- estructura de carpetas y comandos de validación.

Prioriza siempre recomendaciones prácticas y distingue claramente entre lo
implementado, lo preparado por contrato y lo bloqueado por credenciales,
certificados o especificaciones externas.
