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
├── data/         # Datos locales tipados de demostración
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

La detección compara el contenido exacto del archivo. Una copia idéntica se
detectará aunque tenga otro nombre, pero una canción reetiquetada o recodificada
generará otra huella; esta fase no intenta reconocer similitud acústica.

Los archivos locales de demostración permanecen únicamente como referencia de
desarrollo y ya no se usan en la biblioteca real.

No se suben ni guardan archivos de audio o portadas y no se usa Supabase
Storage para audio. El BPM y la tonalidad pueden proceder de etiquetas o de
estimaciones locales revisadas por el usuario. No se ha implementado detección
de energía, similitud acústica ni inteligencia artificial.

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

Por seguridad, no se cachean páginas autenticadas, respuestas de Supabase,
cookies, bibliotecas personales ni archivos de audio. La edición de datos sin
conexión y su sincronización posterior no forman parte de esta fase. Para
probar la instalación y el service worker usa un build de producción servido
por HTTPS o desde localhost.


## Aplicación de escritorio

La base de escritorio usa Tauri 2 y vive en `src-tauri/`. En desarrollo abre
el servidor local de Next.js; el binario inicial de producción carga
exclusivamente `https://djorganizer-beta.vercel.app`.

La aplicación de escritorio expone un único comando nativo al origen oficial de
producción. Ese comando siempre abre el selector de carpetas del sistema y
realiza un escaneo acotado y de solo lectura. Recoge nombres, rutas relativas,
extensiones y tamaños, y lee etiquetas de título, artista, álbum, género, BPM,
tonalidad y duración cuando existen. También agrupa copias binarias exactas:
solo calcula SHA-256 en streaming para archivos del mismo tamaño y nunca devuelve
ni persiste las huellas. No acepta rutas enviadas por la web, no decodifica
muestras y no mueve, renombra, modifica, reproduce, sube ni guarda archivos de
audio.

Para validar el núcleo Rust:

```bash
cargo fmt --manifest-path src-tauri/Cargo.toml -- --check
cargo check --manifest-path src-tauri/Cargo.toml --all-targets
cargo test --manifest-path src-tauri/Cargo.toml
```

Para desarrollo interactivo, instala Tauri CLI 2 y ejecuta `cargo tauri dev`
desde la raíz. Son necesarios Rust y las dependencias de sistema indicadas por
Tauri para cada plataforma. Los límites y el modelo de seguridad del escaneo se
documentan en `docs/desktop-folder-scanning.md`.
