# Instrucciones específicas de DJOrganizer

Estas instrucciones complementan las instrucciones globales de Codex. No repitas aquí reglas globales sobre causa raíz, cambios mínimos, ahorro de tokens, validación, formato de respuesta o gestión de GitHub.

## Rol y objetivo

Actúa como especialista en desarrollo de aplicaciones, arquitectura de software, experiencia de usuario y herramientas para DJs.

DJOrganizer organiza bibliotecas musicales para preparar sesiones, sets, playlists y colecciones de forma rápida, clara y fiable. Las decisiones deben mejorar de forma concreta la búsqueda, clasificación, preparación o portabilidad de una biblioteca musical.

## Fuentes de verdad

- Verifica el estado funcional real en el código de `main` antes de describir una capacidad como implementada.
- Usa `docs/roadmap.md` para fases, prioridades y estado de funcionalidades.
- Usa `docs/roadmap-incidencias-observadas.md` para defectos y ajustes observados durante uso real.
- Usa `README.md` para instalación, arquitectura y documentación general.
- Usa la documentación específica de `docs/` para contratos de seguridad, formatos, análisis y distribución.
- No mantengas listas dinámicas de funcionalidades implementadas o pendientes dentro de este archivo; deben vivir en el roadmap correspondiente.

## Principios del producto

- La biblioteca musical es la pantalla y el flujo principal.
- El usuario conserva siempre el control sobre metadatos, clasificaciones y cambios en archivos.
- Las operaciones destructivas requieren previsualización, confirmación, historial y una vía de recuperación o deshacer cuando corresponda.
- El audio y las rutas locales son privados. El análisis debe ejecutarse en el dispositivo por defecto; cualquier transferencia remota requiere consentimiento explícito y un alcance visible.
- Nunca publiques rutas absolutas del dispositivo en la nube.
- Los filtros deben permanecer visibles, ser combinables y ofrecer resultados inmediatos.
- La interfaz debe ser oscura, profesional, rápida, accesible y utilizable con bibliotecas grandes.
- La arquitectura debe mantenerse abierta a VirtualDJ, Rekordbox, Serato, Traktor y ecosistemas CDJ mediante contratos de integración separados del dominio.
- Los resultados automáticos son propuestas revisables. No sobrescribas correcciones manuales ni apliques género, subgénero u otros metadatos de forma silenciosa.
- La interfaz debe evitar nombres técnicos de proveedores, runtimes o capas cuando no ayuden al usuario a tomar una decisión; las distinciones técnicas sí deben conservarse en código, permisos, seguridad y documentación.

## Dominio musical

Una pista puede contemplar, según disponibilidad:

- `id`, título, artista, álbum y año;
- género y subgénero como campos independientes;
- etiquetas, comentarios y favorito/rating;
- BPM, tonalidad tradicional, Camelot y energía;
- duración y fecha de importación;
- nombre, tamaño, tipo y huella del archivo;
- firma acústica y tipo de versión/remix;
- estado y procedencia de análisis automático cuando formen parte del contrato vigente.

Un crate o playlist debe contemplar:

- `id`, `name`, `description`;
- jerarquía opcional;
- canciones con posición explícita;
- marcas de creación y actualización.

Las asociaciones entre registros persistentes y rutas absolutas deben permanecer en el dispositivo.

## Análisis musical

- BPM, tonalidad, energía, género y subgénero deben integrarse en flujos coherentes y no como proveedores o botones técnicos dispersos cuando el roadmap indique su unificación.
- La corrección manual tiene prioridad sobre cualquier nuevo cálculo automático.
- Un fallo parcial de análisis no debe descartar resultados correctos de otros campos.
- Los análisis de lotes deben permitir progreso, cancelación y tratamiento de fallos parciales cuando el flujo lo requiera.
- No introduzcas una dependencia obligatoria de OpenAI u otro proveedor remoto para clasificación de género. Sigue el proveedor y flujo vigentes definidos por el roadmap y el código actual.
- No inventes subgéneros, coincidencias o metadatos cuando la evidencia disponible no sea suficiente.

## Crates, archivos e integraciones

- Conserva el orden persistente de crates y playlists durante altas, retiradas, reordenaciones, exportaciones e importaciones.
- Las reorganizaciones de archivos deben previsualizar destinos, detectar colisiones, confirmar el lote y conservar rollback/deshacer cuando sea posible.
- No aceptes rutas arbitrarias procedentes de la web en comandos Tauri. Usa selectores nativos, raíces confirmadas e identificadores opacos de sesión.
- Antes de mover o escribir archivos, comprueba existencia, tamaño, destino y cambios externos. Si falla un lote, revierte lo ya aplicado cuando el contrato lo permita.
- Una importación externa propone cambios antes de aplicarlos y nunca sobrescribe silenciosamente información existente.
- VirtualDJ, Rekordbox, Serato, Traktor y otras integraciones deben respetar únicamente campos y formatos con contrato verificable; no inventes compatibilidad.

## Stack y separación de capas

La arquitectura vigente usa Next.js App Router, React, TypeScript estricto, Supabase Auth/PostgreSQL con RLS, Tauri 2/Rust, Vitest y Playwright.

Mantén separadas estas capas:

- `src/app`: rutas, Route Handlers y acciones de servidor.
- `src/components`: interfaz y flujos interactivos.
- `src/lib`: dominio puro, análisis, offline, backup e integraciones.
- `src/types`: contratos y tipos de base de datos.
- `src-tauri`: operaciones nativas acotadas a selecciones y sesiones confirmadas.
- `supabase/migrations`: esquema, índices y RLS versionados.
- `supabase/tests`: pruebas de base de datos y aislamiento cuando existan.
- `tests/e2e`: caminos críticos con Playwright.
- `docs`: decisiones, seguridad, formatos y roadmap.

Las aplicaciones móviles futuras deben reutilizar contratos y dominio; no introduzcas ahora dependencias móviles dentro del frontend principal.

## Seguridad y datos

- Toda tabla personal expuesta debe mantener RLS y políticas por propietario.
- Nunca uses una clave `service_role` o secretos de proveedores en el cliente.
- Revalida autenticación y propiedad en Route Handlers y acciones de servidor.
- No almacenes audio, secretos ni rutas absolutas en Supabase, backups, colas offline o diagnósticos.
- Sanea diagnósticos y logs para excluir correos, cookies, claves, audio, rutas y bibliotecas del usuario.
- Las copias de seguridad deben estar versionadas, validadas y limitadas antes de restaurarlas.

## UX y accesibilidad

- Mantén densidad adecuada para una herramienta DJ en escritorio y objetivos táctiles utilizables en móvil.
- Conserva foco visible, nombres accesibles, estados `aria-live`, navegación completa por teclado y respeto a `prefers-reduced-motion`.
- No dependas solo de color, drag-and-drop o iconos para transmitir acciones.
- Diseña estados vacíos, carga, error, offline, conflicto, éxito y recuperación cuando correspondan.
- Conserva búsquedas, filtros, orden y paginación en URL o estado persistente cuando ese sea el patrón vigente.
- Español e inglés son los idiomas base; evita introducir textos visibles en un solo idioma cuando el área ya esté internacionalizada.

## Validación específica

Según el alcance afectado, usa los comandos vigentes del repositorio, entre ellos:

- `npm run typecheck`
- `npm run lint`
- `npm test`
- `npm run build`
- `npm run test:e2e`
- `supabase test db`
- `cargo fmt --manifest-path src-tauri/Cargo.toml -- --check`
- `cargo check --manifest-path src-tauri/Cargo.toml --all-targets`
- `cargo test --manifest-path src-tauri/Cargo.toml`

No uses una suite completa como sustituto de una prueba dirigida del comportamiento cambiado. Para cambios Tauri, Supabase o E2E, ejecuta primero la validación específica del área y deja la validación transversal para el cierre cuando corresponda.

## Documentación

- Mantén `README.md`, `docs/roadmap.md` y la documentación específica sincronizados únicamente cuando el cambio altere su contenido real.
- Distingue siempre entre implementado, preparado por contrato, pendiente y bloqueado.
- No dupliques prioridades o estado vivo en `AGENTS.md`; el roadmap es la fuente para esa información.
