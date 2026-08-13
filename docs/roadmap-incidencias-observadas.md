# Incidencias observadas y ajustes de flujo

Actualizado: 2026-07-27.

Este documento forma parte del roadmap de DJOrganizer y ordena los defectos y
cambios de producto observados durante el uso real. Los puntos marcados como
incidencia comunicada deben reproducirse antes de afirmar su causa. No se debe
avanzar a bloques posteriores mientras siga abierto un error base del bloque
anterior.

## Bloque P0 — estabilidad de Inicio

### 1. Error intermitente al cargar el dashboard

**Estado:** Implementado.

- [x] Confirmar la causa funcional: cualquier fallo individual de los conteos de
  pistas, crates o etiquetas se escalaba a la caída completa de Inicio. No hay
  evidencia para atribuir el incidente histórico a una consulta concreta.
- [x] Registrar de forma saneada qué operación y categoría de fallo intervienen,
  sin incluir correo, rutas, cookies, audio ni secretos.
- [x] Separar error de datos y error de red por estadística, sin sustituir el
  error general de renderizado ni añadir reintentos automáticos ilimitados.
- [x] Aislar los fallos parciales para conservar los conteos correctos, el shell,
  la navegación y la sesión, y no inferir el onboarding con datos incompletos.
- [x] Mantener un botón de reintento único y accesible mientras se recupera el
  resumen.
- [x] Añadir una matriz E2E autenticada para inicio vacío, recarga, sesión recién
  creada y restaurada, aperturas consecutivas, fallos parciales en las tres
  estadísticas (incluidas las categorías `query` y `network`), recuperación,
  respuesta lenta y ausencia de solicitudes duplicadas.
- [x] Ejecutar con éxito esa matriz en el entorno autenticado efímero de CI. La
  validación remota del 2026-07-26 completó correctamente Supabase efímero,
  Chromium, la matriz autenticada y el E2E móvil. La ejecución local previa había
  quedado bloqueada por la ausencia de Supabase CLI y por HTTP 403 al descargar
  Chromium, sin afectar a la validación final en GitHub Actions.
- [x] Mantener separados los errores de autenticación, datos, red y
  renderizado; no sustituir el diagnóstico por reintentos automáticos ilimitados.
- [x] No modificar autenticación, RLS, caché privada ni contratos de consultas no
  relacionados hasta tener una causa confirmada.

**Validación mínima:** inicio en frío, recarga, sesión recién creada, sesión
restaurada, conexión lenta y varias aperturas consecutivas sin error. Si se
fuerza cada tipo de fallo, el mensaje debe ser específico y la recuperación no
debe duplicar solicitudes ni perder la sesión.

## Bloque P1 — visibilidad y persistencia de etiquetas

### 2. Mostrar las etiquetas asignadas a cada canción

**Estado:** Implementado. Biblioteca, tarjetas móviles y detalle representan y
gestionan las relaciones persistidas. Las relaciones se consultan solo para las
pistas visibles y el catálogo reutilizable se pagina en lotes acotados, sin
suponer un máximo total de 1.000 etiquetas. La CI autenticada del 2026-07-27
validó Supabase efímero, RLS y separación entre usuarios, Chromium, flujo
completo de asignación/retirada, persistencia, móvil y Crates antes de fusionar
la PR #65.

- [x] Reproducir la asignación individual y masiva y verificar primero la fila en
  `track_tags`, la consulta posterior y la actualización de la interfaz.
- [x] Mostrar las etiquetas de cada pista en Biblioteca, en la vista o edición de
  la canción y en las tarjetas móviles, sin cargar relaciones sin límite.
- [x] Refrescar el estado después de asignar o retirar una etiqueta y conservarlo
  tras recargar, cambiar de página, buscar, filtrar y volver a la pista.
- [x] Permitir retirar una etiqueta desde un lugar claro sin borrar la etiqueta
  reutilizable ni afectar a otras canciones.
- [x] Mantener RLS, separación entre usuarios, paginación y edición masiva.

**Validación mínima:** asignación y retirada individual y masiva, dos usuarios,
pistas con muchas etiquetas, móvil, teclado, recarga y navegación entre páginas.

## Bloque P1 — análisis musical unificado

Este bloque sustituye los botones y proveedores dispersos por un único flujo
comprensible. Depende de estabilizar el campo persistente de subgénero ya
previsto en el roadmap. Calcular automáticamente no significa sobrescribir una
corrección manual: el resultado debe ser visible, revisable y aceptable o
rechazable.

### 3. Añadir análisis completo desde Ver o editar canción

- [x] Añadir una acción única **Analizar pista** en la vista o edición de una
  canción para calcular los campos disponibles: BPM, tonalidad, Camelot,
  energía, género y subgénero.
- [x] Ejecutarla solo cuando el archivo asociado esté disponible en la sesión
  confirmada del dispositivo. La interfaz no debe solicitar ni mostrar rutas
  arbitrarias.
- [x] Mostrar progreso, cancelación, resultado por campo, confianza y errores
  parciales. Un fallo de género no debe descartar BPM o tonalidad correctos.
- [x] No sobrescribir valores editados manualmente; presentar comparación entre
  valor actual y resultado calculado antes de guardar cambios.

### 4. Calcular género y subgénero automáticamente durante la importación

- [x] Iniciar el cálculo de género y subgénero automáticamente después de
  seleccionar las canciones, sin exigir pulsar **Sugerir género localmente**.
- [x] Integrar el progreso en la misma cola de análisis de BPM, tonalidad y
  energía, con límites de concurrencia para bibliotecas grandes y equipos con
  pocos recursos.
- [x] Permitir cancelar, reintentar solo las pistas fallidas y guardar las pistas
  cuyos demás campos ya estén correctos.
- [x] Mostrar género y subgénero como resultados separados y revisables; no
  inventar subgénero cuando la confianza o la taxonomía no permitan distinguirlo.
- [x] Conservar correcciones manuales y no volver a analizar pistas ya aceptadas
  salvo acción explícita del usuario.

### 5. Retirar la sugerencia de género con OpenAI

- [ ] Eliminar de la interfaz la opción **Sugerir género con OpenAI** y cualquier
  acción equivalente.
- [ ] Retirar después su ruta de servidor, validaciones, límites, variables y
  documentación operativa cuando se confirme que no quedan consumidores.
- [ ] No dejar código muerto, claves requeridas, mensajes, pruebas o estados de
  carga vinculados a ese proveedor.
- [ ] Ejecutar esta retirada después de verificar el análisis automático de
  género y subgénero, para no dejar el flujo principal sin una alternativa
  funcional.

**Validación mínima del bloque:** importación de una y cien pistas, cancelación,
fallos parciales, reanálisis desde Biblioteca, pista sin archivo asociado,
corrección manual previa, equipo de recursos limitados, recarga y ausencia total
de llamadas o controles de OpenAI para género.

## Bloque P2 — navegación y lenguaje de producto

### 6. Convertir las tarjetas resumen de Inicio en accesos directos

- [ ] Hacer activables las tarjetas de pistas, crates y etiquetas del dashboard.
- [ ] Llevar cada tarjeta a su destino real: Biblioteca para pistas, Crates para
  crates y el gestor o filtro existente de etiquetas para etiquetas. No crear una
  ruta nueva solo para cumplir el enlace si ya existe un destino funcional.
- [ ] Mantener toda la tarjeta accesible por teclado, con foco visible, nombre
  descriptivo y sin botones anidados inválidos.
- [ ] Conservar los conteos y evitar una navegación accidental al seleccionar
  texto o utilizar acciones internas.

### 7. Aclarar el campo “Carpeta superior” al crear un crate

- [ ] Comprobar si el campo se utiliza realmente para crear jerarquías de crates.
- [ ] Si la jerarquía es funcional, renombrarlo a un texto comprensible como
  **Guardar dentro de**, usar **Ninguna** como valor predeterminado y añadir una
  explicación breve de que crea un crate dentro de otro grupo.
- [ ] Si la jerarquía no está disponible o el campo no produce un resultado
  observable, ocultarlo hasta que exista un flujo completo.
- [ ] No eliminar relaciones de crates existentes ni cambiar su orden al ajustar
  el formulario.

### 8. Quitar referencias técnicas de la interfaz

- [ ] Sustituir en todos los textos visibles referencias como “local”, “web”,
  “nube”, “Tauri”, “modelo”, “proveedor” o “inferencia” cuando no ayuden a tomar
  una decisión.
- [ ] Usar lenguaje orientado a la acción: **Analizar canciones**, **Seleccionar
  carpeta**, **Preparar resultados** o **Exportar lista**.
- [ ] Mantener las distinciones técnicas en código, documentación de arquitectura,
  permisos, seguridad, consentimiento y diagnósticos. No ocultar advertencias
  necesarias antes de mover archivos, escribir etiquetas o transferir datos.
- [ ] Revisar español e inglés para evitar que el lenguaje técnico reaparezca en
  estados vacíos, errores, ayuda, ajustes o accesibilidad.

## Bloque P2 — estabilidad visual del formulario

### 9. Evitar que la sugerencia de género cambie el tamaño de otros campos

**Estado:** incidencia comunicada, pendiente de reproducción responsive.

- [ ] Reproducir el cambio de tamaño cuando el resultado de género contiene
  explicación, alternativas o mensajes largos.
- [ ] Separar el panel de resultado de género de los campos de título, artista y
  álbum para que su contenido no altere la altura o anchura de controles vecinos.
- [ ] Limitar, envolver o desplegar el texto largo dentro de su propio contenedor,
  sin cortar información necesaria ni provocar desbordamiento horizontal.
- [ ] Mantener etiquetas, errores y controles accesibles en escritorio, móvil,
  zoom al 200 % y ambos idiomas.

**Validación mínima:** resultado corto, largo, varias alternativas, error,
carga, móvil estrecho, escritorio, zoom y cambio de idioma sin salto de layout ni
campos deformados.

## Orden de ejecución

1. Diagnosticar y corregir el error intermitente de Inicio.
2. Corregir la visibilidad y actualización de etiquetas.
3. Estabilizar subgénero y el contrato de análisis musical unificado.
4. Automatizar género y subgénero en Importar.
5. Añadir **Analizar pista** en Ver o editar canción.
6. Retirar completamente la sugerencia de género con OpenAI.
7. Convertir las tarjetas resumen de Inicio en accesos directos.
8. Aclarar u ocultar **Carpeta superior**.
9. Simplificar los textos técnicos visibles.
10. Corregir el salto de tamaño causado por los resultados de género.

Cada punto se implementará en una fase y PR verificable. No se agruparán la
corrección del dashboard, las migraciones de subgénero y el rediseño visual en
una misma entrega.


## Estabilizar subgénero y contrato de análisis musical unificado

**Implementado — PR #66 fusionada y CI completa validada el 2026-07-27.**

Esta fase incorpora subgénero persistente, energía 0–10, procedencia neutral, protección de correcciones manuales y un contrato TypeScript por campo. Permanecen como fases posteriores e independientes: automatizar género/subgénero en Importar, añadir **Analizar pista** y retirar OpenAI. No implementa MAEST ni interpreta automáticamente etiquetas Discogs.
