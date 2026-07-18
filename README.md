# DJOrganizer

DJOrganizer es una aplicación web para que DJs organicen sus bibliotecas
musicales. Esta fase añade autenticación y una base de datos segura por usuario,
pero mantiene deliberadamente la biblioteca visual con datos de demostración.

## Stack

- Next.js 15 con App Router y React 19
- TypeScript en modo estricto y Tailwind CSS 4
- Supabase Auth y PostgreSQL con Row Level Security
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

## Alcance actual

La autenticación y el esquema seguro sí son reales. La biblioteca principal
sigue mostrando la colección local de demostración y está separada de la
persistencia hasta la siguiente fase.

No se guardan archivos de audio, no se usa Supabase Storage para audio y no se
ha implementado detección de BPM, tonalidad, Camelot, energía ni inteligencia
artificial.
