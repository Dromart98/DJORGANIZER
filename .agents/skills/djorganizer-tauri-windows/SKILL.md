---
name: djorganizer-tauri-windows
description: Implementa y revisa cambios seguros de escritorio para DJOrganizer. Usar cuando una tarea afecte a Tauri, Rust, Windows, comandos de escritorio, sistema de archivos, importación de carpetas, operaciones sobre archivos de música, IPC frontend-backend, permisos/capabilities, updater, builds release, instaladores, rutas de Windows o exportaciones M3U8, CSV o VirtualDJ XML.
---

# DJOrganizer: Tauri y Windows

Mantener el cliente web/PWA y el escritorio como superficies separadas. Usar
Tauri/Rust para la interacción con archivos locales y exponer al frontend solo
resultados mínimos, identificadores opacos de sesión y acciones necesarias.

## Flujo obligatorio

1. Inspeccionar antes de editar `PRODUCT.md`, `AGENTS.md`, la configuración de
   Tauri, `src-tauri/capabilities/`, `src-tauri/Cargo.toml`, los comandos Rust
   pertinentes y el contrato/llamada del frontend. Identificar la causa raíz;
   no cambiar configuración ni añadir permisos/excepciones para ocultar un
   síntoma.
2. Determinar el ámbito: web, escritorio o compartido. Mantener el flujo web
   operativo sin APIs Tauri; detectar el bridge de escritorio de forma segura y
   ofrecer estados de no disponible, cancelación, error y recuperación.
3. Diseñar primero el contrato IPC: entradas tipadas, límites, `deny_unknown_fields`
   cuando corresponda, validación en Rust y respuestas sin rutas absolutas salvo
   que una exportación local seleccionada las requiera. Nunca confiar en que el
   frontend haya validado permisos, propiedad, sesión o rutas.
4. Implementar y probar el cambio más pequeño que resuelva la causa. Revisar
   también accesibilidad, teclado, confirmaciones, errores y compatibilidad de
   la web cuando el código sea compartido.

## Archivos locales, música y rutas Windows

- Obtener carpetas y destinos mediante selectores nativos; no aceptar rutas
  arbitrarias enviadas desde la web. Conservar la asociación de archivos dentro
  de la sesión nativa mediante IDs opacos.
- Limitar todo acceso a archivos al backend seguro de Tauri. Conceder la mínima
  capability necesaria para la ventana y origen previstos; no ampliar permisos
  globales ni exponer APIs de filesystem al frontend sin justificación.
- Tratar el análisis como solo lectura: no modificar los archivos de audio
  originales. Antes de cualquier escritura de metadatos, movimiento, renombre,
  sobrescritura o borrado, mostrar una previsualización y solicitar una
  confirmación explícita para el conjunto exacto de archivos.
- Antes de mutar, revalidar que cada archivo sigue perteneciendo a la sesión y
  raíz autorizadas, y comprobar existencia, tipo, tamaño, destino, colisiones y
  cambios externos. Mantener backup e historial/deshacer; si falla un lote,
  revertir lo ya aplicado e informar qué ocurrió.
- Probar rutas de Windows con unidades (`C:\\`), UNC, separadores inversos,
  espacios, caracteres Unicode, nombres largos y destinos inexistentes. No
  concatenar rutas como texto: usar `Path`/`PathBuf`; normalizar solo donde el
  formato de exportación lo requiera.

## Importación y exportación

- Para importar carpetas, escanear y devolver una propuesta revisable; no
  modificar, subir ni registrar rutas absolutas de forma remota. Mantener los
  límites de entradas/tamaño y comunicar archivos omitidos, errores y
  duplicados.
- Preservar el orden explícito de crates y listas. Generar M3U8, CSV o
  VirtualDJ XML exclusivamente desde pistas enlazadas a la sesión local,
  escapando/serializando los formatos correctamente y validando nombres y
  destinos antes de escribir.
- No afirmar compatibilidad de un formato, importador o instalador sin evidencia
  en código y pruebas. Para rutas no UTF-8, saltos de línea u otros valores que
  el formato no represente con seguridad, fallar de forma clara en lugar de
  emitir una exportación corrupta.

## Updater, release e instaladores

- Registrar `tauri-plugin-updater` únicamente en compilaciones release; mantener
  los builds de desarrollo libres de comprobaciones o configuración de updater.
- Verificar configuración de firmas, endpoints, capabilities y plataforma antes
  de cambiar el updater. No introducir secretos de firma ni URLs sensibles en
  el frontend.
- No describir un instalador como verificado hasta compilar el artefacto release
  objetivo y ejecutar las comprobaciones/pruebas aplicables en ese artefacto.
  Si Windows o herramientas de firma no están disponibles, declarar el límite
  con precisión y no sustituirlo por una afirmación de éxito.

## Validación mínima

Ejecutar las comprobaciones afectadas: formato y pruebas Rust, validación de
capabilities/configuración de Tauri, `npm run typecheck`, `npm run lint`, pruebas
de dominio y build web cuando se toque código compartido. Para cambios de
filesystem/exportación, añadir casos de éxito, cancelación, rutas Windows,
Unicode/espacios, archivo cambiado, colisión, rollback y no exposición de rutas.

Ejemplos que deben activar esta skill: «añade un comando Rust para escanear una
carpeta», «corrige una ruta UNC al exportar M3U8», «configura el updater para el
release de Windows», «crea un instalador NSIS» y «exporta un crate a VirtualDJ
XML».
