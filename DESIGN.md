# DJOrganizer — contexto del sistema de diseño existente

## Alcance y fuente de verdad

Este documento registra la interfaz que existe en el código; no propone un
rediseño. La fuente principal es `src/app/globals.css`, complementada por el
shell, los componentes compartidos y las rutas de inicio, biblioteca,
importación, crates y ajustes. Tailwind CSS 4 se carga mediante PostCSS, pero el
sistema visual observado se expresa sobre todo mediante clases CSS propias y
variables globales, no mediante una configuración `tailwind.config` separada.

## Estructura, navegación y jerarquía

- Las rutas autenticadas se sitúan en `AppShell`. En escritorio hay una barra
  lateral fija de **222 px** a la izquierda y el contenido principal se desplaza
  **222 px** a partir de ella. Su ancho máximo efectivo es `none`: el límite
  inicial de 1500 px queda sobrescrito por una regla posterior.
- La marca enlaza de forma accesible a **Biblioteca** y muestra `DJ` en el color
  de acento. La navegación persistente contiene Inicio, Biblioteca, Importar,
  Crates y Ajustes, con icono lineal, etiqueta y `aria-current` para la ruta
  activa.
- La barra lateral se puede contraer mediante botón. Su estado se guarda en
  `localStorage`; contraída mide 64 px, reduce la marca a `DJ` y oculta las
  etiquetas visuales conservando nombres accesibles. El estado de sesión se
  oculta mientras está contraída.
- Cada página usa `PageHeader`: eyebrow opcional, `h1`, descripción y acción a la
  derecha. Biblioteca añade “Añadir canción”; Importar, Crates y Ajustes usan la
  misma jerarquía con contenido específico.
- En móvil (hasta 760 px) desaparece el lateral, aparece una cabecera superior
  pegajosa con marca y sección actual, y se muestra una navegación inferior fija
  de cinco destinos. El contenido deja el margen lateral y reserva espacio para
  la navegación inferior.

## Tokens, color, tipografía y superficies

- Los tokens efectivos se declaran en el segundo bloque `:root`, posterior al
  bloque histórico inicial: fondo `#080d12`, superficie `#0f151b`, superficies
  elevadas `#151d24`/`#1a242c`, borde `#26323b`, borde fuerte `#35434e`, texto
  `#f4f7f6`, texto secundario `#8f9ba6` y acento verde menta `#7ee6b5` (acento
  fuerte `#9af0c7`).
- Los tokens también incluyen acento oscuro `#102b22`, peligro `#ffb0b5`, peligro
  oscuro `#32191d`, sombra `0 18px 50px rgba(0, 0, 0, .24)` y radios de 7, 10 y
  14 px. Hay algunos valores hexadecimales históricos directamente en reglas;
  no se debe inferir una paleta clara a partir de ellos.
- El documento declara `color-scheme: dark`; no se ha encontrado un selector de
  tema claro ni un conmutador de tema. Por tanto, el único tema confirmado es el
  oscuro.
- La tipografía efectiva del cuerpo es `"Segoe UI Variable", "Segoe UI", Inter,
  ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, sans-serif` a
  13 px y `letter-spacing: -.006em`; el suavizado de fuente procede de la regla
  histórica inicial y no queda sobrescrito. En escritorio, el `h1` de página usa
  `clamp(28px, 2.3vw, 36px)`, peso 720 y `letter-spacing: -.045em`; hasta 760 px
  se sobrescribe a 29 px. Los eyebrows y cabeceras de tabla son mayúsculas
  pequeñas con espaciado entre letras.

## Componentes y patrones reutilizables

### Botones, formularios y mensajes

- `.button` es un control inline-flex de peso 700, radio de 7 px y padding
  10×15 px. Las variantes son primaria menta sobre texto oscuro, secundaria de
  superficie con borde y peligrosa en rojo oscuro; existe el tamaño pequeño.
  El estado deshabilitado usa opacidad y cursor no permitido.
- Los botones primarios y secundarios tienen reglas hover en el bloque de tokens
  ampliado; los controles de texto/selección/textarea usan fondo oscuro, borde,
  texto claro y un anillo menta al foco. Las etiquetas `.field` se presentan en
  grid con texto de peso 700.
- Los mensajes de formulario son bandas compactas con borde: éxito en
  menta/verde oscuro y error en rojo oscuro. La Biblioteca y Crates los anuncian
  mediante `role=status` o `role=alert`.
- `Card` es un `section` con superficie, borde y radio de 10 px. Se reutiliza en
  tarjetas de ajustes, bienvenida, formularios, estados vacíos, crates y errores.

### Biblioteca, tabla y filtros

- La Biblioteca combina una tarjeta de filtros, una toolbar de resultados y una
  tabla densa. Los filtros principales son un grid con búsqueda amplia y tres
  controles; las opciones avanzadas se pliegan en `details`, separadas por borde,
  y contienen rangos en grid. Las acciones se alinean al final.
- La tabla se envuelve en un contenedor con desplazamiento, tiene un mínimo de
  1120 px, `thead` pegajoso, cabecera de 42 px y filas de 46 px, columnas
  ordenables, hover de superficie y números tabulares. La tonalidad Camelot se
  muestra como una pastilla menta sobre verde oscuro.
- Por debajo de 760 px la tabla de escritorio se oculta y se usa una lista de
  filas táctiles: checkbox, metadatos truncados y enlace de acción. La toolbar de
  selección también se adapta. Esta es una sustitución de patrón, no solo una
  tabla comprimida.

### Importación, crates y estados

- Importación usa tarjetas para el área de selección, guía y cada archivo. La
  rejilla de datos pasa de cuatro columnas a dos y finalmente una; los estados
  de cada archivo (`ready`, `saved`, error, duplicado, leyendo, verificando o
  guardando) se distinguen mediante badges y texto.
- Crates usa una cuadrícula de tarjetas de dos columnas y una barra secundaria
  de formularios de 340 px. Las tarjetas tienen icono menta en bloque oscuro,
  resumen truncado y un hover que altera borde y traslada la tarjeta 1 px. Las
  listas de pistas muestran posición, metadatos y controles de subir/bajar o
  retirar; no dependen exclusivamente del arrastre.
- `EmptyState` centra icono, título, explicación y acción dentro de una tarjeta.
  Biblioteca y Crates diferencian falta de datos de filtros sin resultados y
  ofrecen acciones pertinentes. `RouteError` es una tarjeta con reintento y
  enlaces de recuperación; el título recibe foco al producirse el error.
- La carga de Biblioteca usa esqueletos con gradiente animado. Las preferencias
  de movimiento reducido acortan animaciones, transiciones y desplazamiento.

## Espaciado, bordes, interacción y responsive

- Los grids usan principalmente separaciones de 8–24 px: estadísticas 14 px,
  tarjetas de crate 12 px, formularios 16–18 px y paneles principales 24 px.
  Los cards suelen tener 18–26 px de padding. El contenido principal efectivo
  usa `38px clamp(22px, 3vw, 42px) 72px` en escritorio; hasta 760 px pasa a
  `24px 14px calc(104px + env(safe-area-inset-bottom))`, y hasta 430 px sus
  paddings laterales pasan a 10 px.
- Las superficies se separan con bordes de 1 px y radios de 7–14 px. La sombra
  declarada se usa para elevación; la pantalla de autenticación incorpora además
  una tarjeta con sombra fuerte y gradiente radial de fondo.
- `:focus-visible` dibuja un outline menta de 2 px; enlaces, controles de
  navegación, checkbox y botones tienen etiquetas o nombres accesibles en los
  componentes inspeccionados. Existe un skip link, foco programático para la
  recuperación de ruta y `aria-live`/roles en estados operativos.
- Los breakpoints que siguen afectando patrones observables son 1180 px (altura
  de tabla y acciones), 1100 px (paneles de organización e importación), 1000 px
  (grids históricos de filtros/formularios), 760 px (navegación y composición
  móvil), 520 px (autenticación), 430 px (contenido y filtros) y 420 px
  (estadísticas/bienvenida). No se documenta un diseño de tablet independiente
  más allá de estas reglas.

## Inconsistencias observadas (sin corregir)

1. `globals.css` conserva un bloque histórico inicial. Sus tokens de `:root`
   (`--bg`, `--surface`, `--border`, `--text`, `--muted`, `--accent` y
   `--accent-dark`) quedan sobrescritos por el segundo `:root`; sus valores
   efectivos son los documentados arriba. Algunas reglas históricas sin una
   regla posterior equivalente —por ejemplo, el suavizado de fuente del `body`—
   siguen aplicándose.
2. Varias medidas históricas también están sobrescritas: lateral expandido
   `232 px` → **222 px**, margen de contenido `232 px` → **222 px**, máximo de
   contenido `1500 px` → **ninguno**, padding principal
   `54px clamp(28px, 5vw, 72px) 80px` →
   **`38px clamp(22px, 3vw, 42px) 72px`**, fuente de cuerpo Arial/14 px →
   **Segoe UI Variable y fallback/13 px**, y `h1` 32 px →
   **`clamp(28px, 2.3vw, 36px)`**. En móvil, el `h1` histórico de 27 px queda
   sobrescrito por **29 px**; el lateral se oculta y el contenido no conserva
   margen izquierdo.
3. El CSS incluye reglas históricas muy condensadas y bloques posteriores más
   tokenizados. El resultado visual es deliberadamente oscuro y coherente en lo
   esencial, pero el origen de algunos colores, radios y estados no está
   centralizado por completo.
4. La aplicación confirma navegación lateral plegable, pero en móvil sustituye
   ese patrón por topbar y navegación inferior; no se debe describir como una
   misma barra lateral responsive.

## Restricciones para futuras tareas de diseño

- Preservar la prioridad de la biblioteca, la navegación persistente, los
  filtros visibles, las tablas densas y las filas táctiles ya implementadas.
- Mantener texto suficiente junto a iconos, acceso con teclado, foco visible,
  feedback de estado y respeto de `prefers-reduced-motion`.
- No introducir colores, fuentes, sombras, tamaños, tema claro, animaciones o
  componentes como si fueran parte del sistema hasta que existan en código.
- Para una futura superficie Tauri, reutilizar estos patrones oscuros y la
  jerarquía operativa sin exponer rutas locales en la interfaz web.
