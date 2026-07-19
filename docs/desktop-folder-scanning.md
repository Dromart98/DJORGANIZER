# Escaneo de carpetas en escritorio

DJOrganizer incorpora una capacidad nativa de solo lectura mediante Tauri 2.

## Flujo de consentimiento

1. La persona pulsa **Seleccionar carpeta** en la ruta de importación.
2. Rust abre el selector nativo del sistema operativo.
3. Si se cancela, no se examina ninguna ruta.
4. Si se confirma, Rust recorre únicamente esa carpeta y sus subcarpetas.

La web no envía una ruta al comando. Cada escaneo exige una nueva selección
nativa, lo que evita reutilizar silenciosamente una ubicación arbitraria.

## Datos leídos

Para cada archivo compatible, el escáner obtiene:

- nombre, ruta relativa, extensión y tamaño;
- título, artista, álbum y género cuando existen en las etiquetas;
- duración indicada por las propiedades del archivo;
- BPM y tonalidad cuando están presentes en los metadatos;
- un identificador de grupo cuando dos o más archivos tienen contenido idéntico.

La lectura de etiquetas se realiza con Lofty desde Rust. Para detectar copias
exactas, primero agrupa por tamaño y calcula SHA-256 en streaming únicamente
para los archivos candidatos. La huella local nunca se devuelve a la web ni se
persiste. Tras el escaneo, la sesión autenticada puede entregar a Rust las
huellas y tamaños ya guardados en la biblioteca del usuario; Rust calcula solo
las comparaciones necesarias y conserva en memoria el vínculo entre el ID
persistente y el ID opaco del escaneo. React recibe únicamente esos pares de
identificadores para marcar las coincidencias y preparar acciones posteriores;
no recibe huellas calculadas localmente ni rutas. Las rutas absolutas permanecen
en Rust.
No se decodifican muestras ni se calcula BPM o tonalidad. Si una etiqueta o una
comparación falla, la pista se conserva y el fallo se contabiliza.

Formatos reconocidos: AAC, AIFF, ALAC, FLAC, M4A, MP3, OGG, OPUS y WAV.

## Límites y tratamiento de errores

- máximo de 100.000 entradas examinadas;
- máximo de 10.000 pistas devueltas;
- lectura de metadatos ejecutada fuera del hilo principal;
- enlaces simbólicos omitidos para no escapar del árbol elegido;
- carpetas o entradas sin permiso omitidas y contabilizadas;
- errores de etiquetas o huellas aislados por pista;
- verificación de que el tamaño no cambia mientras se calcula la huella;
- resultado marcado como truncado al alcanzar un límite;
- rutas absolutas no se devuelven a la interfaz.

## Límite de permisos

El puente global de Tauri solo está habilitado dentro del binario y su capability
remota acepta exclusivamente `https://djorganizer-beta.vercel.app`. El comando
`choose_and_scan_music_folder` siempre muestra el selector nativo antes de leer.
`link_library_tracks` acepta únicamente IDs, tamaños y huellas de la biblioteca
autenticada y guarda las coincidencias dentro de la sesión nativa activa.
`export_virtualdj_list` solo acepta identificadores que pertenecen a esa sesión;
la web no puede suministrarle rutas absolutas arbitrarias.

No se conceden plugins de sistema de archivos, shell o proceso. Las únicas
escrituras permitidas son archivos de lista XML o M3U8 en el destino que la
persona confirme mediante el selector nativo. La fase no mueve, renombra, elimina,
reproduce, sube ni modifica audio. La detección es de igualdad binaria: una
copia idéntica se agrupa aunque cambie de nombre, pero un archivo reetiquetado o
recodificado se considera distinto.

## Previsualización de organización

La selección local puede generar tres propuestas: artista/álbum,
género/artista o tonalidad/BPM. Cada segmento se normaliza, elimina
separadores y caracteres de control, neutraliza nombres reservados de Windows
y limita su longitud. Las rutas de destino se comparan sin distinguir
mayúsculas y minúsculas; si dos pistas colisionan, la propuesta añade un sufijo
numérico determinista.

El plan contiene exclusivamente rutas relativas y se calcula en la memoria de
la ventana. No se envía a Supabase ni al comando nativo y no existe en esta fase
ninguna acción que aplique el plan al sistema de archivos.


## Exportación de listas para VirtualDJ

VirtualDJ 2024+ usa listas XML nativas en **My Lists**. DJOrganizer genera un
`VirtualFolder` ordenado y una entrada `song` por pista seleccionada, con la
ruta absoluta requerida, tamaño e información musical disponible. El formato
sigue la [especificación oficial de Lists de VirtualDJ](https://virtualdj.com/wiki/lists.html).

Las rutas absolutas nunca se devuelven a React ni a Supabase. Rust las conserva
solo en memoria durante el escaneo y rechaza una exportación si el identificador
de sesión ya no coincide o si una pista no pertenece al resultado activo. El
usuario elige expresamente el archivo XML de destino. La compatibilidad M3U8,
la exportación de crates persistentes y la sincronización con **My Lists** se
mantienen como fases separadas en el roadmap.
