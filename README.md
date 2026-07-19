# DJOrganizer

DJOrganizer es una aplicación web para que DJs organicen sus bibliotecas
musicales. La aplicación incluye autenticación y una biblioteca persistente
aislada por usuario mediante Supabase.

## Stack

- Next.js 15 con App Router y React 19
- TypeScript en modo estricto y Tailwind CSS 4
- Supabase Auth y PostgreSQL con Row Level Security
- music-metadata para leer etiquetas de audio exclusivamente en el navegador
- Meyda para extraer información armónica exclusivamente en el navegador
- web-audio-beat-detector para estimar BPM exclusivamente en el navegador
- Zod para validar todas las entradas de canciones
- ESLint 9 y Vitest
- Playwright para pruebas end-to-end en escritorio y móvil
- Tauri 2 para instaladores nativos y actualizaciones firmadas
- GitHub y despliegues automáticos en Vercel

## Instalación

Requiere Node.js 20 o superior.

```bash
npm install
cp .env.example .env.local
npm run dev
```

Completa `.env.local` con la URL y la clave pública del proyecto de Supabase.
Nunca uses una clave `service_role` en el navegador.

Abre [http://localhost:3000](http://localhost:3000).

## Variables de entorno

| Variable | Uso |
| --- | --- |
| `NEXT_PUBLIC_SUPABASE_URL` | URL pública del proyecto Supabase |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | Clave pública para clientes web |
| `OPENAI_API_KEY` | Clave privada, solo en servidor, para la clasificación opcional |

Las mismas variables deben existir en Vercel para Production, Preview y
Development.

## Scripts

| Comando | Uso |
| --- | --- |
| `npm run dev` | Servidor local con recarga |
| `npm run build` | Build de producción |
| `npm start` | Sirve el build de producción |
| `npm run lint` | Reglas ESLint y Next.js |
| `npm run typecheck` | Comprobación TypeScript sin emitir archivos |
| `npm test` | Pruebas unitarias con Vitest |
| `npm run test:e2e` | Pruebas E2E con Playwright |
| `supabase test db` | Auditoría pgTAP de RLS y separación entre usuarios |

## Base de datos

La migración inicial está en `supabase/migrations`. Crea:

- `profiles`
- `tracks`
- `tags`
- `track_tags`
- `crates`
- `crate_tracks`

Todas las tablas personales tienen RLS activado y políticas separadas de
lectura, creación, actualización y eliminación. Las relaciones intermedias
incluyen `user_id` y claves foráneas compuestas para impedir asociaciones entre
datos de usuarios distintos.

La suite `supabase/tests/database` crea dos usuarios dentro de una transacción
revertida y comprueba que no puedan leer, modificar, borrar ni reconciliar datos
ajenos. CI reconstruye una base PostgreSQL efímera desde las migraciones antes
de ejecutar estas pruebas.

Un segundo trabajo de CI levanta el stack local completo, registra una cuenta
temporal y recorre con Playwright el flujo importación → biblioteca → crate. Los
WAV de prueba se generan en memoria, nunca proceden de la biblioteca del usuario
y desaparecen junto con el entorno efímero.

Para aplicar las migraciones con Supabase CLI:

```bash
npx supabase link --project-ref <project-ref>
npx supabase db push
```

No guardes contraseñas de base de datos ni tokens de acceso en el repositorio.

## Autenticación

- Registro con nombre, correo y contraseña.
- Confirmación de correo y callback seguro.
- Inicio y cierre de sesión.
- Sesiones SSR mediante cookies.
- Validación del usuario con claims verificados.
- Protección doble: middleware y comprobación en cada página privada.
- Cabeceras privadas para evitar cachear respuestas autenticadas en CDN.

Rutas públicas: `/`, `/login`, `/signup` y `/auth/callback`.

Rutas privadas: `/library`, `/import`, `/crates` y `/settings`.

## Estructura

```text
src/
├── app/          # Rutas, acciones de servidor y estilos globales
├── components/   # Layout, autenticación, biblioteca y UI reutilizable
├── lib/          # Helpers, autenticación y clientes de Supabase
└── types/        # Tipos musicales y tipos generados de la base de datos
supabase/
└── migrations/   # Esquema versionado, índices, triggers y RLS
```

## Biblioteca persistente

- Alta manual, detalle, edición y eliminación de canciones.
- Búsqueda por título, artista o álbum.
- Filtros combinables por género, BPM, tonalidad, Camelot, energía y valoración.
- Ordenación y paginación ejecutadas en Supabase.
- Estado de búsqueda, filtros y ordenación conservado en la URL.
- Selección y eliminación múltiple con confirmación.
- Consultas limitadas explícitamente al usuario autenticado, además de RLS.
- Estados de carga, biblioteca vacía, sin resultados y error.

## Importación de metadatos

- Selección de hasta 100 archivos locales por tanda.
- Lectura en el navegador de título, artista, álbum, género, BPM etiquetado,
  tonalidad etiquetada, año y duración.
- El artista es opcional. Si falta, se conserva como `NULL` y la interfaz
  muestra “Artista desconocido”; el nombre de archivo proporciona el título
  inicial, por lo que una pista puede guardarse trabajando solo con BPM y
  tonalidad.
- Vista previa editable antes de guardar.
- Detección opcional de BPM por pista o en lote, ejecutada localmente.
- Análisis secuencial de una ventana de hasta 90 segundos para limitar memoria.
- Las estimaciones de BPM quedan identificadas y pueden corregirse manualmente.
- Detección opcional de tonalidad por pista o en lote mediante cromas.
- Conversión de la tonalidad estimada a notación canónica y Camelot al guardar.
- Cálculo incremental de una huella SHA-256 en el navegador, con progreso.
- Detección de archivos repetidos en la selección y en la biblioteca existente.
- El índice único de la base de datos evita duplicados incluso ante guardados
  simultáneos.
- Guardado en lotes de 25 con resultado independiente por pista.
- Los errores parciales no descartan las pistas guardadas correctamente.
- Solo se envían la huella y los campos de texto y números al servidor.

Además de la huella exacta, el análisis local calcula energía y una firma
acústica compacta. Antes de guardar se compara esa firma con la biblioteca para
detectar posibles copias recodificadas, versiones y remixes; las coincidencias
no concluyentes siempre quedan para revisión manual.

No se guardan archivos de audio o portadas y no se usa Supabase Storage para
audio. El BPM, tonalidad y energía pueden proceder de etiquetas o estimaciones
locales revisadas. La clasificación de género con `gpt-audio` es opcional:
requiere consentimiento por pista, genera localmente un clip WAV mono de hasta
45 segundos, aplica límites de uso y solo ofrece una sugerencia que el usuario
debe aceptar manualmente.

## Crates y etiquetas

- Creación, edición y eliminación de crates privados.
- Incorporación y retirada de pistas sin borrar la canción de la biblioteca.
- Orden manual mediante controles accesibles para subir y bajar pistas.
- Búsqueda por título o artista al preparar un crate.
- Creación y eliminación de etiquetas reutilizables.
- Asignación y retirada masiva de etiquetas desde la selección de Biblioteca.
- Todas las operaciones verifican el usuario en el servidor además de las
  políticas RLS y las claves foráneas compuestas de PostgreSQL.

## Tonalidades y Camelot

- Normalización de notación con sostenidos, bemoles, mayor y menor.
- Conversión determinista de las 24 tonalidades a la rueda Camelot.
- Acepta ejemplos como `Am`, `A minor`, `A♭ minor`, `F# major` o `8A`.
- Las altas manuales, ediciones e importaciones derivan la tonalidad canónica y
  Camelot al guardar.
- La conversión usa metadatos, datos escritos por el usuario o una estimación
  local revisada antes de guardar.

## Recomendaciones armónicas

- Sugiere pistas con la misma posición Camelot, posiciones adyacentes o el
  relativo mayor/menor.
- Limita las sugerencias a una diferencia de BPM de ±6 % cuando existe tempo.
- Ordena primero la misma tonalidad y después la cercanía de BPM.
- Todas las consultas se limitan al usuario autenticado y no usan IA.

## Edición masiva

- Permite cambiar álbum, género, BPM, tonalidad, energía, valoración, año o
  comentarios de hasta 100 pistas seleccionadas.
- Un valor vacío elimina únicamente el campo elegido.
- La edición de tonalidad normaliza la notación y actualiza Camelot de forma
  conjunta.
- Cada acción requiere confirmación y se limita al usuario autenticado además de
  las políticas RLS.

## Diseño de producto

- Sistema visual oscuro de alto contraste basado en grafito frío y un acento
  menta controlado.
- Tabla densa con cabecera fija, estados de selección y navegación refinados.
- Controles, formularios, crates e importación comparten los mismos tokens.
- En móvil, la tabla se transforma en filas táctiles y mantiene acciones,
  selección, filtros y navegación inferior sin desbordamiento horizontal.
- Los estados de foco y movimiento respetan accesibilidad y
  `prefers-reduced-motion`.


## PWA y funcionamiento sin conexión

- Manifiesto instalable con identidad visual propia y modo standalone.
- Service worker registrado solamente en builds de producción.
- Fallback local neutro cuando una navegación no dispone de red.
- Caché limitada a recursos estáticos versionados de Next.js, iconos y la
  página offline.
- Aviso accesible cuando el dispositivo pierde la conexión.
- Cola local compactada para importaciones, altas, ediciones, eliminaciones,
  crates, orden y etiquetas. Al recuperar la conexión reintenta en lotes,
  detecta revisiones incompatibles y permite conservar la versión local o
  descartar el conflicto.
- Copia de seguridad JSON versionada con restauración confirmada.

Por seguridad, no se cachean páginas autenticadas, respuestas de Supabase,
cookies, bibliotecas personales ni archivos de audio. Los metadatos pendientes
se conservan en el dispositivo; los conflictos disponen de un contrato
versionado para ampliar la sincronización a más operaciones. Para probar la
instalación y el service worker usa un build de producción servido por HTTPS o
desde localhost.

La biblioteca se consulta en ventanas SQL de 25 pistas, los crates muestran
ventanas de 100 y el escaneo local pagina sus resultados. Esto mantiene el DOM
acotado aunque la colección tenga decenas de miles de pistas; la suite prueba
explícitamente una colección sintética de 50.000 elementos.

## Diagnóstico privado

DJOrganizer puede conservar localmente hasta 100 eventos de conectividad,
sincronización o errores de ejecución. Los mensajes se sanean para retirar
rutas, correos, identificadores y secretos. Desde Ajustes el usuario puede
exportar el informe JSON o borrarlo; no existe envío automático de telemetría y
el informe no contiene música, biblioteca, cookies ni datos de cuenta.


## Aplicación de escritorio

La base de escritorio usa Tauri 2 y vive en `src-tauri/`. En desarrollo abre
el servidor local de Next.js; el binario inicial de producción carga
exclusivamente `https://djorganizer-beta.vercel.app`.

La aplicación de escritorio expone comandos nativos acotados al origen oficial
de producción. El escaneo siempre abre el selector de carpetas del sistema y
realiza una lectura limitada de la ubicación confirmada. Recoge nombres, rutas relativas,
extensiones y tamaños, y lee etiquetas de título, artista, álbum, género, BPM,
tonalidad y duración cuando existen. También agrupa copias binarias exactas:
solo calcula SHA-256 en streaming para archivos del mismo tamaño y nunca devuelve
ni persiste las huellas. No acepta rutas enviadas por la web, no decodifica
muestras y no mueve, renombra, modifica, reproduce, sube ni guarda archivos de
audio durante el escaneo.

El resultado local completo se puede buscar por nombre, ruta y metadatos,
filtrar por duplicados o errores de lectura y recorrer en páginas de 25 pistas.
La selección múltiple permanece en memoria hasta que el usuario confirma una
operación. Se puede previsualizar y aplicar una organización por artista/álbum,
género/artista o tonalidad/BPM. Rust vuelve a comprobar existencia y tamaño,
sanea rutas, neutraliza nombres reservados, resuelve colisiones, revierte fallos
parciales y mantiene un historial de sesión con deshacer.

La escritura de título, artista, álbum, género, BPM y tonalidad es una operación
separada y explícita, limitada a 25 pistas revisadas por lote. Primero muestra
los cambios campo a campo; al confirmar, Rust vuelve a validar tamaño y formato,
copia cada archivo completo en `.djorganizer-backups`, escribe las etiquetas,
las relee y calcula una huella del resultado. Un fallo restaura todo el lote y
el historial de la sesión permite recuperar los originales. Deshacer se bloquea
si otro programa modificó un archivo después de la escritura. La carpeta de
copias se excluye de los escaneos posteriores.

Las pistas seleccionadas pueden guardarse como una **List nativa de VirtualDJ
2024+** en XML o como una playlist M3U8 compatible con flujos heredados. También
se exportan todos los crates y jerarquías en una operación, conservando el
orden y creando copias de las Lists existentes. La importación recorre **My
Lists**, vincula rutas locales y permite combinar o reemplazar crates tras una
previsualización explícita, registrando conflictos no resueltos. Rust
conserva las rutas absolutas únicamente en la sesión local del escaneo, valida
que toda selección pertenezca a esa sesión y abre el selector de guardado del
sistema. Ambos formatos conservan el orden; no copian ni modifican el audio y
no editan `database.xml`.

El roadmap vivo está en [`docs/roadmap.md`](docs/roadmap.md).

Para validar el núcleo Rust:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml --all-targets
cargo test --manifest-path src-tauri/Cargo.toml
```

Para desarrollo interactivo, instala Tauri CLI 2 y ejecuta `cargo tauri dev`
desde la raíz. Son necesarios Rust y las dependencias de sistema indicadas por
Tauri para cada plataforma. Los límites y el modelo de seguridad del escaneo se
documentan en `docs/desktop-folder-scanning.md`. Los instaladores y
`latest.json` se generan desde tags `app-v*`; consulta
[`docs/distribution.md`](docs/distribution.md).
