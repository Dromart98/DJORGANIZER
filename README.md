# DJOrganizer

DJOrganizer es la base de una aplicación web profesional para que DJs puedan importar, analizar, clasificar y organizar sus bibliotecas musicales. Esta primera versión se limita deliberadamente a la arquitectura de interfaz y a datos locales de demostración.

## Stack

- Next.js 15 con App Router
- React 19 y TypeScript en modo estricto
- Tailwind CSS 4
- ESLint 9 y Vitest
- Preparado para despliegue en Vercel

## Instalación

Requiere Node.js 20 o superior.

```bash
npm install
npm run dev
```

Abre [http://localhost:3000](http://localhost:3000). `.env.example` documenta el lugar reservado para futuras variables; no se necesita ninguna en esta fase.

## Scripts

| Comando | Uso |
| --- | --- |
| `npm run dev` | Servidor local con recarga |
| `npm run build` | Build de producción |
| `npm start` | Sirve el build de producción |
| `npm run lint` | Reglas ESLint y Next.js |
| `npm run typecheck` | Comprobación TypeScript sin emitir archivos |
| `npm test` | Pruebas unitarias con Vitest |

## Estructura

```text
src/
├── app/          # Rutas, layout y estilos globales
├── components/   # Layout, biblioteca y componentes UI reutilizables
├── data/         # Datos locales tipados de demostración
├── lib/          # Helpers puros y sus pruebas
└── types/        # Tipos del dominio musical
```

## Funcionalidades actuales

- Dashboard y rutas Biblioteca, Importar, Crates y Ajustes.
- Navegación lateral en escritorio e inferior en móvil.
- Biblioteca local de demostración con metadatos tipados.
- Tabla responsive ordenable por cualquiera de sus columnas.
- Componentes reutilizables de encabezado, botón, tarjeta y estado vacío.

Los estados de Importar y Crates comunican explícitamente que esas capacidades todavía no están disponibles; no simulan acciones ni persistencia.

## Próximas fases

1. Supabase, modelo de datos y autenticación.
2. Importación y almacenamiento seguro de audio.
3. Extracción de BPM, tonalidad, Camelot y energía.
4. Etiquetas, crates persistentes, búsqueda y filtros avanzados.

Supabase, autenticación, subida de archivos y análisis musical **no están implementados** en esta versión.
