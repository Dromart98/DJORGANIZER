# Auditoría de accesibilidad con lector de pantalla

## Estado

- Rama de preparación: `codex/prepare-screen-reader-accessibility-audit`
- Base verificada: `1bc7a9544422a75c6f80a0be2201404622f53787`
- Auditoría automática: preparada
- Auditoría manual con NVDA: **pendiente**
- Navegadores manuales previstos: Chrome y Edge en Windows
- Idiomas: español e inglés

Este documento es la matriz reproducible para comprobar los flujos públicos y
autenticados de DJOrganizer con teclado y lector de pantalla. Las pruebas de
Playwright verifican contratos semánticos concretos, pero no sustituyen una
sesión real con NVDA.

No deben marcarse resultados manuales como correctos sin haber escuchado los
anuncios reales y recorrido el flujo únicamente con teclado.

## Principios de la auditoría

- No usar música real. Para importación se puede emplear un WAV sintético sin
  información personal.
- No activar clasificación con OpenAI salvo que exista consentimiento explícito
  y un entorno de prueba autorizado.
- No registrar correos reales, rutas locales, nombres de archivos privados,
  huellas, IDs, cookies, secretos ni mensajes internos.
- No modificar, mover ni escribir archivos durante la comprobación salvo que el
  caso se ejecute expresamente en Tauri con una carpeta de prueba desechable.
- Registrar el primer defecto observable, su severidad y el paso exacto para
  reproducirlo.

## Entorno manual

Completar antes de empezar:

| Campo | Valor |
|---|---|
| Fecha | Pendiente |
| Persona que audita | Pendiente |
| Sistema operativo | Windows, versión pendiente |
| NVDA | Versión pendiente |
| Navegador | Chrome o Edge, versión pendiente |
| Resolución y escala | Pendiente |
| Idioma de DJOrganizer | Español / inglés |
| Rama o despliegue | Pendiente |
| SHA probado | Pendiente |
| Cuenta de prueba | Cuenta desechable sin datos reales |

## Escala de severidad

- **Bloqueante:** impide completar un flujo esencial con lector de pantalla o
  teclado.
- **Alta:** la acción puede completarse solo con ayuda visual, exploración
  difícil o conocimiento previo.
- **Media:** el anuncio es ambiguo, repetitivo o pierde contexto, pero existe una
  alternativa razonable.
- **Baja:** mejora de claridad que no impide completar el flujo.

## Hallazgos automáticos confirmados y corregidos

### Navegación activa no expuesta semánticamente

- Problema: la sección activa se indicaba solo mediante la clase visual
  `active`.
- Causa confirmada: los enlaces principales y móviles no incluían
  `aria-current`.
- Corrección: el enlace correspondiente a la ruta activa usa
  `aria-current="page"`.
- Riesgo manual restante: comprobar que NVDA anuncia la sección actual sin
  repetir información innecesaria.

### Orden de la tabla no anunciado

- Problema: la flecha visual de ordenación estaba oculta para tecnología de
  asistencia y la cabecera no comunicaba la dirección actual.
- Causa confirmada: las cabeceras no incluían `aria-sort`.
- Corrección: cada cabecera ordenable expone `ascending`, `descending` o `none`.
- Riesgo manual restante: comprobar que el anuncio de NVDA es comprensible al
  cambiar el orden.

### Conteo de selección no anunciable

- Problema: el número de pistas seleccionadas cambiaba visualmente, pero no
  pertenecía a una región de estado.
- Causa confirmada: el contador era un `span` sin semántica dinámica.
- Corrección: el contador usa `role="status"` y `aria-atomic="true"`.
- Riesgo manual restante: comprobar que no produce anuncios excesivos al
  seleccionar varias filas rápidamente.

### Acciones de fila sin contexto suficiente

- Problema: varias filas exponían enlaces con el mismo nombre, por ejemplo
  “Ver y editar”.
- Causa confirmada: el nombre accesible no incluía el título de la pista.
- Corrección: las acciones de escritorio y móvil incluyen el título en el nombre
  accesible, manteniendo el texto visible breve.
- Riesgo manual restante: confirmar que los títulos largos no vuelven el anuncio
  confuso.

## Contratos cubiertos automáticamente

Las suites existentes y la prueba autenticada de accesibilidad comprueban:

- un único contenido principal identificado;
- enlace para saltar al contenido y recepción del foco;
- navegación principal y móvil con nombre accesible;
- enlace de navegación activo mediante `aria-current="page"`;
- interfaz y nombres accesibles en español e inglés;
- caption accesible de la tabla de Biblioteca;
- dirección de orden mediante `aria-sort`;
- contador de selección como región de estado;
- checkbox de pista con título en el nombre accesible;
- acción de edición con contexto de pista;
- foco en recuperación de errores;
- controles equivalentes para reordenar crates sin drag-and-drop.

## Matriz de auditoría manual

En cada fila registrar:

1. anuncio esperado;
2. anuncio observado;
3. recorrido de teclado;
4. resultado: `Correcto`, `Defecto` o `Pendiente`;
5. severidad y evidencia cuando haya defecto.

| # | Flujo | Comprobación principal | ES | EN | Resultado |
|---:|---|---|---|---|---|
| 1 | Landing | Landmarks, H1, navegación y salto al contenido | Pendiente | Pendiente | Pendiente |
| 2 | Registro | Etiquetas, obligatorio, errores y foco | Pendiente | Pendiente | Pendiente |
| 3 | Inicio de sesión | Autocompletado, errores y estado de envío | Pendiente | Pendiente | Pendiente |
| 4 | Dashboard vacío | H1, resumen y orden de lectura | Pendiente | Pendiente | Pendiente |
| 5 | Primeros pasos | Progreso, siguiente acción y enlaces | Pendiente | Pendiente | Pendiente |
| 6 | Selección de archivos | Input, instrucciones y privacidad | Pendiente | Pendiente | Pendiente |
| 7 | Progreso de análisis | Anuncios útiles sin ruido excesivo | Pendiente | Pendiente | Pendiente |
| 8 | BPM y tonalidad manual | Etiquetas, ayuda, estado y errores | Pendiente | Pendiente | Pendiente |
| 9 | Género con OpenAI | Consentimiento, sugerencia y aceptación | Pendiente | Pendiente | Pendiente |
| 10 | Biblioteca vacía | Estado vacío y acciones principales | Pendiente | Pendiente | Pendiente |
| 11 | Biblioteca con pistas | Landmarks, tabla/lista y orden de lectura | Pendiente | Pendiente | Pendiente |
| 12 | Filtros | Etiquetas, detalles expandibles y aplicar | Pendiente | Pendiente | Pendiente |
| 13 | Sin resultados | Mensaje, limpiar filtros y foco | Pendiente | Pendiente | Pendiente |
| 14 | Tabla y selección | Caption, cabeceras, `aria-sort` y estado | Pendiente | Pendiente | Pendiente |
| 15 | Edición masiva | Selección, confirmación y resultado | Pendiente | Pendiente | Pendiente |
| 16 | Detalle de pista | H1, procedencia, confianza y acciones | Pendiente | Pendiente | Pendiente |
| 17 | Edición de pista | Errores asociados y foco tras guardar | Pendiente | Pendiente | Pendiente |
| 18 | Eliminación | Confirmación, retorno y anuncio de éxito | Pendiente | Pendiente | Pendiente |
| 19 | Crates vacíos | Estado vacío, explicación y acción | Pendiente | Pendiente | Pendiente |
| 20 | Crear crate | Etiquetas, jerarquía, error y retorno | Pendiente | Pendiente | Pendiente |
| 21 | Añadir/quitar pistas | Contexto de botones y resultado | Pendiente | Pendiente | Pendiente |
| 22 | Reordenar pistas | Subir/bajar, límites y nuevo orden | Pendiente | Pendiente | Pendiente |
| 23 | Ajustes | Encabezados, tarjetas y orden de lectura | Pendiente | Pendiente | Pendiente |
| 24 | Cambio de idioma | Ruta, sesión, foco y nuevo idioma | Pendiente | Pendiente | Pendiente |
| 25 | Backup/restauración | Selector, confirmación y resultado | Pendiente | Pendiente | Pendiente |
| 26 | Diagnóstico privado | Controles, privacidad y exportación | Pendiente | Pendiente | Pendiente |
| 27 | Actualizaciones | Estados de comprobación e instalación | Pendiente | Pendiente | Pendiente |
| 28 | Conexión/offline | Pérdida, recuperación y sincronización | Pendiente | Pendiente | Pendiente |
| 29 | Error controlado | Foco, alerta, reintento y salida segura | Pendiente | Pendiente | Pendiente |
| 30 | Página no encontrada | H1, explicación y vuelta segura | Pendiente | Pendiente | Pendiente |
| 31 | Navegación móvil | Orden, nombre, activo y tamaño táctil | Pendiente | Pendiente | Pendiente |
| 32 | Cierre de sesión | Nombre, activación y destino final | Pendiente | Pendiente | Pendiente |

## Procedimiento con NVDA

### Preparación

1. Abrir una cuenta de prueba vacía.
2. Iniciar NVDA antes de abrir el navegador.
3. Desactivar extensiones que alteren la página.
4. Ejecutar primero en español y repetir los casos esenciales en inglés.
5. Usar `Tab`, `Shift+Tab`, flechas, `Enter`, `Espacio`, teclas de encabezados,
   landmarks, formularios y tablas de NVDA.
6. No usar el ratón para resolver un bloqueo; registrar el bloqueo antes.

### Qué registrar por flujo

- Primer elemento anunciado al entrar.
- Título de página y encabezado principal.
- Landmarks disponibles.
- Nombre, rol, estado y valor de cada control.
- Instrucciones y errores asociados.
- Posición del foco después de enviar, crear, borrar, reintentar o cambiar idioma.
- Mensajes dinámicos anunciados y posibles duplicados.
- Orden de lectura de tablas, listas y tarjetas.
- Posibilidad de completar el flujo sin información exclusivamente visual.

## Plantilla de hallazgo

### Identificador

`A11Y-NVDA-XXX`

- Flujo:
- Idioma:
- Navegador y versión:
- NVDA y versión:
- Severidad:
- Problema principal:
- Causa confirmada:
- Pasos para reproducir:
- Anuncio esperado:
- Anuncio observado:
- Evidencia saneada:
- Qué no se debe tocar:
- Cambio mínimo propuesto:
- Prueba de regresión:
- Riesgo restante:
- Estado: Pendiente / Corregido / Verificado manualmente

## Criterio de cierre

La auditoría solo podrá marcarse como completada cuando:

- se hayan ejecutado los flujos esenciales con NVDA;
- los casos clave se hayan repetido en español e inglés;
- todos los defectos bloqueantes y altos estén corregidos y repetidos;
- los defectos medios aceptados tengan justificación documentada;
- no se expongan datos personales, rutas ni secretos;
- el roadmap se actualice con la fecha, versiones y SHA realmente auditados.

Hasta entonces, la auditoría manual permanece pendiente.
