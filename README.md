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
- La conversión usa metadatos existentes o datos escritos por el usuario; no
  analiza la señal de audio ni afirma detectar la tonalidad automáticamente.

