# DJOrganizer — contexto de producto

## Propósito y modo de uso

DJOrganizer es una herramienta operativa para DJs, productores y personas que
mantienen bibliotecas musicales. Su trabajo principal es convertir una colección
local de archivos en una biblioteca que se pueda explorar, corregir y preparar
con rapidez antes de una sesión. No es una landing page ni un reproductor de
audio: la biblioteca, sus metadatos y la preparación de crates son el centro del
producto.

El modo de diseño predominante es **Operate**: se priorizan densidad útil,
orientación persistente, filtros visibles, acciones explícitas y recuperación
frente a una presentación decorativa. La experiencia está orientada primero a
escritorio y sigue siendo responsive para consulta y gestión en pantallas
pequeñas.

## Usuarios y necesidades

- **DJ que prepara una sesión:** necesita localizar rápidamente temas por título,
  artista, ritmo, tonalidad, energía o clasificación, y construir un orden de
  reproducción fiable.
- **DJ con una biblioteca grande:** necesita tablas ordenables, filtros que se
  puedan combinar, paginación y ediciones masivas sin perder el contexto.
- **Productor o coleccionista:** necesita enriquecer y corregir metadatos,
  géneros, subgéneros, etiquetas, notas y valoraciones sin entregar el control
  de su catálogo a un análisis automático.
- **Usuario de software DJ de escritorio:** necesita preparar crates y exportar
  listas sin que DJOrganizer mueva, renombre o suba los archivos de audio sin
  una acción explícita.

La interfaz base está disponible en español e inglés; el español es el idioma
predeterminado. Las futuras decisiones deben reducir pasos innecesarios y ser
comprensibles también para usuarios no técnicos.

## Flujos y capacidades actuales

### Biblioteca y metadatos

- La biblioteca autenticada permite alta manual, detalle, edición, eliminación,
  selección múltiple y edición masiva de pistas.
- La búsqueda cubre título, artista y álbum; los filtros persistidos en la URL
  incluyen género, rangos de BPM y energía, tonalidad, Camelot y valoración.
  La ordenación y la paginación se realizan en la base de datos.
- Una pista contempla, entre otros datos, título, artista opcional, álbum,
  género, subgénero, BPM, tonalidad normalizada, Camelot, energía, valoración,
  comentarios y datos de análisis/procedencia. Las etiquetas reutilizables
  complementan la clasificación.
- Hay estados diferenciados para biblioteca vacía, resultados vacíos, carga y
  error, además de recuperación mediante reintento.

### Importación y análisis musical

- La importación web acepta tandas de archivos locales, lee sus metadatos y
  ofrece una revisión editable antes de guardar. También existe un flujo de
  escaneo de carpetas para el entorno de escritorio/Tauri cuando está disponible.
- El sistema puede calcular o proponer BPM, tonalidad, energía, género,
  subgénero y otros datos de análisis según el flujo y proveedor disponibles.
  Cada campo debe conservar su resultado, procedencia y posibilidad de revisión
  de acuerdo con el contrato vigente.
- Un análisis puede formar parte automáticamente de la cola de importación o
  iniciarse de forma explícita desde la biblioteca cuando el roadmap y el código
  lo habiliten. Automatizar el cálculo no significa aplicar silenciosamente el
  resultado ni sobrescribir una corrección manual.
- Los fallos parciales deben aislarse por campo o pista cuando sea posible: un
  fallo de género no debe invalidar BPM, tonalidad o energía correctos.
- Género y subgénero son resultados independientes y revisables. No se debe
  inventar un subgénero cuando la evidencia, la taxonomía o el modelo no permitan
  distinguirlo de forma suficiente.
- `PRODUCT.md` no fija un proveedor concreto para clasificación musical. El
  proveedor y flujo vigentes deben verificarse en el código y en el roadmap para
  evitar conservar como requisito una integración que esté siendo sustituida o
  retirada.

### Tonalidad, mezcla y organización

- La tonalidad se normaliza desde notación tradicional a sus 24 claves y a
  Camelot; las recomendaciones armónicas comparan la posición Camelot y limitan
  el BPM próximo cuando existe tempo.
- Los crates privados pueden crearse, editarse, eliminarse y anidarse. Las
  pistas se añaden o retiran sin borrar la biblioteca y se reordenan con
  controles explícitos accesibles, no solo con arrastrar y soltar.
- Etiquetas y crates ayudan a preparar sesiones, progresiones y listas de
  trabajo reutilizables.

### Exportación, escritorio y continuidad

- La integración actual de escritorio incluye exportación de Lists XML de
  VirtualDJ 2024+ y M3U8 compatible, con orden preservado; también hay
  exportación de crates/jerarquías y un Bridge XML para Rekordbox desde una sesión
  de escaneo. Las rutas absolutas permanecen en la sesión nativa.
- M3U, CSV y Open Key figuran en el contexto de producto solicitado como formatos
  o representaciones a considerar, pero no se deben presentar como capacidades
  confirmadas: en el código inspeccionado se confirma M3U8 y XML VirtualDJ, y la
  conversión de clave confirmada es tradicional/Camelot.
- El producto es una web/PWA con evolución a Tauri 2. La aplicación de escritorio
  debe usar selectores nativos, identificadores de sesión opacos y acciones
  confirmadas para trabajar con carpetas y archivos locales de Windows.

## Restricciones de producto, privacidad y seguridad

- La biblioteca y todas las operaciones personales se aíslan por usuario con
  Supabase Auth, PostgreSQL y RLS. Las acciones del servidor vuelven a comprobar
  autenticación y pertenencia.
- El audio, las rutas locales y los secretos son privados. No se almacenan audio
  ni rutas absolutas en Supabase, y ningún secreto o clave privilegiada de un
  proveedor remoto debe llegar al cliente.
- Cualquier transferencia remota de audio, si existe en un flujo vigente, debe
  ser visible, acotada y autorizada explícitamente para ese análisis.
- Cualquier operación potencialmente destructiva debe explicar su alcance,
  pedir confirmación, dejar historial o recuperación cuando aplique y no
  sobrescribir importaciones externas silenciosamente.
- La cola offline contiene solamente mutaciones de metadatos, no audio ni
  secretos. La sincronización y los conflictos deben poder revisarse.

## Dirección futura y límites para diseño

- Mantener la biblioteca como pantalla y flujo principal; preservar la
  navegación, los filtros, la densidad de tabla, la edición rápida y la gestión
  de crates existentes.
- Diseñar para bibliotecas de decenas de miles de pistas, con acciones fáciles de
  localizar, jerarquía visual fuerte y estados vacíos o de error accionables.
- Conservar acceso completo por teclado, foco visible, etiquetas accesibles,
  mensajes de estado y compatibilidad con lectores de pantalla. No comunicar una
  acción solamente mediante color, icono o drag-and-drop.
- Mantener contratos de integración separados del dominio para VirtualDJ,
  Rekordbox, Serato, Traktor y CDJ; no forzar dependencias móviles en el frontend
  actual.
- No introducir un rediseño ni una nueva identidad visual desde esta
  documentación. `DESIGN.md` es la referencia de la interfaz observada.

## Evidencia y estado

Este documento recoge contexto y principios de producto duraderos. El código de
`main` es la fuente del estado funcional real y `docs/roadmap.md` junto con
`docs/roadmap-incidencias-observadas.md` determinan qué fases están implementadas,
pendientes, bloqueadas o descartadas. `PRODUCT.md` no debe duplicar esas listas ni
convertir proveedores temporales en requisitos permanentes.
