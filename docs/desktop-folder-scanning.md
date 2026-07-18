# Escaneo de carpetas en escritorio

Esta fase introduce la primera capacidad nativa de DJOrganizer mediante Tauri 2.

## Flujo de consentimiento

1. La persona pulsa **Seleccionar carpeta** en la ruta de importación.
2. Rust abre el selector nativo del sistema operativo.
3. Si se cancela, no se examina ninguna ruta.
4. Si se confirma, Rust recorre únicamente esa carpeta y sus subcarpetas.

La web no envía una ruta al comando. Cada escaneo exige una nueva selección
nativa, lo que evita reutilizar silenciosamente una ubicación arbitraria.

## Datos leídos

El escáner obtiene exclusivamente:

- nombre del archivo;
- ruta relativa a la carpeta seleccionada;
- extensión normalizada;
- tamaño en bytes.

No abre ni decodifica el contenido del audio. No calcula huellas, no extrae
etiquetas y no envía resultados al servidor en esta fase.

Formatos reconocidos: AAC, AIFF, ALAC, FLAC, M4A, MP3, OGG, OPUS y WAV.

## Límites y tratamiento de errores

- máximo de 100.000 entradas examinadas;
- máximo de 10.000 pistas devueltas;
- enlaces simbólicos omitidos para no escapar del árbol elegido;
- carpetas o entradas sin permiso omitidas y contabilizadas;
- resultado marcado como truncado al alcanzar un límite;
- rutas absolutas no se devuelven a la interfaz.

## Límite de permisos

El puente global de Tauri solo está habilitado dentro del binario y su capability
remota acepta exclusivamente `https://djorganizer-beta.vercel.app`. El único
comando registrado es `choose_and_scan_music_folder` y siempre muestra el
selector nativo antes de leer.

No se conceden plugins de sistema de archivos, shell o proceso. Esta fase no
mueve, renombra, elimina, escribe, reproduce, sube ni persiste archivos.
